// 时钟：子弹时间（放慢表），画面时间 g ↔ 物理时间 T，总长，各处贯穿和放慢的起止时刻（秒）。
import * as lichChoreo from '../../6-1-5/编排.ts';
import * as snowQueenChoreo from '../../6-1-8/编排.ts';
import * as giantChoreo from '../../6-1-8b/编排.ts';
import * as castleChoreo from '../../6-1-9/编排.ts';
import { type BossName, ORDER } from './输入表.ts';
import { bisect, timeAtDist, T_ARRIVE, pierceTimes } from './航线.ts';
import { smoothstep01 } from '@engine/core/数学.ts';

// ---------- 时钟：画面时间 g（秒）↔ 物理时间 T ----------
// g = 0 是 6-1-3 的末帧。放慢：物理时刻 起～止 之间时钟是 1/倍数；之前 rampIn 秒内（画面时间）按对数平滑降下来、之后 出 秒内升回去
type SlowSpan = { 起: number; 止: number; factor: number; rampIn: number; 出: number };
const SLOW: SlowSpan[] = [
  // 巫妖：撞北墙前一点到化成白烟，物理 0.05 秒上下
  { 起: pierceTimes.巫妖 + lichChoreo.slowMo.起, 止: pierceTimes.巫妖 + lichChoreo.slowMo.止, factor: 100, rampIn: 14 / 24, 出: 1.25 },
  // 冰雪女王：撞南墙前一点到化成白烟，物理 0.035 秒
  { 起: pierceTimes.冰雪女王 + snowQueenChoreo.slowMo.起, 止: pierceTimes.冰雪女王 + snowQueenChoreo.slowMo.止, factor: 100, rampIn: 14 / 24, 出: 1.25 },
  // 巨人（屋里，近景）：撞南墙前一点到第二个巨人化成白烟，物理 0.038 秒
  { 起: pierceTimes.巨人 + giantChoreo.slowMo.起, 止: pierceTimes.巨人 + giantChoreo.slowMo.止, factor: 80, rampIn: 14 / 24, 出: 1.25 },
];
export const slowMoTable = SLOW;
// 脱手以后再放这么久：收扫帚、两人冲到屋顶上站定（6-1-9/编排.ts 的 下扫帚）
const HOLD_END = castleChoreo.dismount.holdSec;
// 时钟表每 1/192 秒画面时间一格（原来每 1/24 秒 8 格）
const CLOCK_STEPS_PER_SEC = 192;
const F_T: number[] = [0]; // 每格的物理时间
{
  const rIn = (S: number, u: number) => Math.exp(-Math.log(S) * smoothstep01(u));
  const inSpan = (span: SlowSpan) => {
    let avgRate = 0;
    for (let k = 0; k < 200; k++) avgRate += rIn(span.factor, (k + 0.5) / 200) / 200;
    return span.rampIn * avgRate;
  };
  let physT = 0;
  let step = 0;
  let ev = 0;
  let state: 'normal' | 'in' | 'hold' | 'out' = 'normal';
  let step0 = 0;
  // 至少走过 1/24 秒
  while (physT < T_ARRIVE || step < CLOCK_STEPS_PER_SEC / 24) {
    const span = SLOW[ev];
    let rate = 1;
    if (state === 'normal' && span && physT >= span.起 - inSpan(span)) {
      state = 'in';
      step0 = step;
    }
    if (state === 'in') {
      const progress = (step - step0) / CLOCK_STEPS_PER_SEC / span.rampIn;
      if (progress >= 1) state = 'hold';
      else rate = rIn(span.factor, progress);
    }
    if (state === 'hold') {
      rate = 1 / span.factor;
      if (physT >= span.止) {
        state = 'out';
        step0 = step;
      }
    }
    if (state === 'out') {
      const progress = (step - step0) / CLOCK_STEPS_PER_SEC / span.出;
      if (progress >= 1) {
        state = 'normal';
        ev++;
        rate = 1;
      } else rate = Math.exp(-Math.log(span.factor) * (1 - smoothstep01(progress)));
    }
    physT += rate / CLOCK_STEPS_PER_SEC;
    step++;
    F_T.push(physT);
  }
}
const ARRIVE_STEPS = F_T.length - 1;
const G_ARRIVE = ARRIVE_STEPS / CLOCK_STEPS_PER_SEC;
// 一镜到底多长（秒）：到站那一刻往上取到 60 帧/秒的帧上，再放 HOLD_END
export const totalLength = Math.ceil((ARRIVE_STEPS * 60) / CLOCK_STEPS_PER_SEC) / 60 + HOLD_END;
// 画面时间 → 物理时间（落地以后接着按原速走，给悬停的晃动用）
export const physicalTime = (g: number) => {
  const x = g * CLOCK_STEPS_PER_SEC;
  if (x <= 0) return g;
  if (x >= F_T.length - 1) return F_T[F_T.length - 1] + (g - G_ARRIVE);
  const i = Math.floor(x);
  return F_T[i] + (F_T[i + 1] - F_T[i]) * (x - i);
};
// 物理时间 → 画面时间（二分）
export const secAt = (physT: number) => {
  if (physT <= 0) return physT;
  if (physT >= F_T[F_T.length - 1]) return G_ARRIVE + (physT - F_T[F_T.length - 1]);
  const lo = bisect(F_T, physT);
  return (lo + (physT - F_T[lo]) / (F_T[lo + 1] - F_T[lo])) / CLOCK_STEPS_PER_SEC;
};
export const secAtDist = (s: number) => secAt(timeAtDist(s));
// 时钟倍率（画面上 1 秒对应多少物理秒），前后各半格（1/48 秒）差分
export const clockRate = (g: number) => (physicalTime(g + 1 / 48) - physicalTime(g - 1 / 48)) * 24;
export const pierceSecs = Object.fromEntries(ORDER.map((n) => [n, secAt(pierceTimes[n])])) as Record<BossName, number>;
// 子弹时间各段在画面上从哪一刻开始放慢、哪一刻慢到底、哪一刻开始回升、哪一刻恢复原速（秒）
export const slowMoTimes = SLOW.map((span) => {
  const secOf = (physT: number) => {
    let i = 0;
    while (i < F_T.length - 1 && F_T[i] < physT) i++;
    return i / CLOCK_STEPS_PER_SEC;
  };
  const bottom = secOf(span.起);
  return { 开始: bottom - span.rampIn, bottom, rise: secOf(span.止), recover: secOf(span.止) + span.出 };
});
