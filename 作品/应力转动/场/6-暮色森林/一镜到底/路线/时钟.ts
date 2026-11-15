// 时钟：子弹时间（放慢表），全局帧 F ↔ 物理时间 T，总帧数，各处贯穿帧和放慢的起止帧。
import * as lichChoreo from '../../6-1-5/编排.ts';
import * as snowQueenChoreo from '../../6-1-8/编排.ts';
import * as giantChoreo from '../../6-1-8b/编排.ts';
import * as castleChoreo from '../../6-1-9/编排.ts';
import { FPS, type BossName, ORDER } from './输入表.ts';
import { bisect, timeAtDist, T_ARRIVE, pierceTimes } from './航线.ts';
import { smoothstep01 } from '@engine/core/数学.ts';

// ---------- 时钟：全局帧 F ↔ 物理时间 T ----------
// 放慢：物理时刻 起～止 之间时钟是 1/倍数；之前 进 帧内（画面时间）按对数平滑降下来、之后 出 帧内升回去
type SlowSpan = { 起: number; 止: number; factor: number; rampIn: number; 出: number };
const SLOW: SlowSpan[] = [
  // 巫妖：撞北墙前一点到化成白烟，物理 0.05 秒上下
  { 起: pierceTimes.巫妖 + lichChoreo.slowMo.起, 止: pierceTimes.巫妖 + lichChoreo.slowMo.止, factor: 100, rampIn: 14, 出: 30 },
  // 冰雪女王：撞南墙前一点到化成白烟，物理 0.035 秒
  { 起: pierceTimes.冰雪女王 + snowQueenChoreo.slowMo.起, 止: pierceTimes.冰雪女王 + snowQueenChoreo.slowMo.止, factor: 100, rampIn: 14, 出: 30 },
  // 巨人（屋里，近景）：撞南墙前一点到第二个巨人化成白烟，物理 0.038 秒
  { 起: pierceTimes.巨人 + giantChoreo.slowMo.起, 止: pierceTimes.巨人 + giantChoreo.slowMo.止, factor: 80, rampIn: 14, 出: 30 },
];
export const slowMoTable = SLOW;
const HOLD_END = Math.round(castleChoreo.dismount.holdSec * FPS); // 脱手以后再放这么久：收扫帚、两人冲到屋顶上站定（6-1-9/编排.ts 的 下扫帚）
const CLOCK_SUB = 8;
const F_T: number[] = [0]; // 每 1/CLOCK_SUB 帧的物理时间
{
  const rIn = (S: number, u: number) => Math.exp(-Math.log(S) * smoothstep01(u));
  const inSpan = (span: SlowSpan) => {
    let avgRate = 0;
    for (let k = 0; k < 200; k++) avgRate += rIn(span.factor, (k + 0.5) / 200) / 200;
    return (span.rampIn / FPS) * avgRate;
  };
  let physT = 0;
  let frame = 0;
  let ev = 0;
  let state: 'normal' | 'in' | 'hold' | 'out' = 'normal';
  let f0 = 0;
  const dF = 1 / CLOCK_SUB;
  while (physT < T_ARRIVE || frame < 1) {
    const span = SLOW[ev];
    let rate = 1;
    if (state === 'normal' && span && physT >= span.起 - inSpan(span)) {
      state = 'in';
      f0 = frame;
    }
    if (state === 'in') {
      const progress = (frame - f0) / span.rampIn;
      if (progress >= 1) state = 'hold';
      else rate = rIn(span.factor, progress);
    }
    if (state === 'hold') {
      rate = 1 / span.factor;
      if (physT >= span.止) {
        state = 'out';
        f0 = frame;
      }
    }
    if (state === 'out') {
      const progress = (frame - f0) / span.出;
      if (progress >= 1) {
        state = 'normal';
        ev++;
        rate = 1;
      } else rate = Math.exp(-Math.log(span.factor) * (1 - smoothstep01(progress)));
    }
    physT += (rate * dF) / FPS;
    frame += dF;
    F_T.push(physT);
  }
}
const F_ARRIVE = (F_T.length - 1) / CLOCK_SUB;
export const totalFrames = Math.ceil(F_ARRIVE) + HOLD_END;
// 全局帧 → 物理时间（落地以后接着按原速走，给悬停的晃动用）
export const physicalTime = (frame: number) => {
  const x = frame * CLOCK_SUB;
  if (x <= 0) return frame / FPS;
  if (x >= F_T.length - 1) return F_T[F_T.length - 1] + (frame - F_ARRIVE) / FPS;
  const i = Math.floor(x);
  return F_T[i] + (F_T[i + 1] - F_T[i]) * (x - i);
};
// 物理时间 → 全局帧（二分）
export const frameAt = (physT: number) => {
  if (physT <= 0) return physT * FPS;
  if (physT >= F_T[F_T.length - 1]) return F_ARRIVE + (physT - F_T[F_T.length - 1]) * FPS;
  const lo = bisect(F_T, physT);
  return (lo + (physT - F_T[lo]) / (F_T[lo + 1] - F_T[lo])) / CLOCK_SUB;
};
export const frameAtDist = (s: number) => frameAt(timeAtDist(s));
// 时钟倍率（画面上 1 秒对应多少物理秒）
export const clockRate = (F: number) => (physicalTime(F + 0.5) - physicalTime(F - 0.5)) * FPS;
export const pierceFrames = Object.fromEntries(ORDER.map((n) => [n, frameAt(pierceTimes[n])])) as Record<BossName, number>;
// 子弹时间各段在画面上从哪一帧开始放慢、哪一帧慢到底、哪一帧开始回升、哪一帧恢复原速
export const slowMoFrames = SLOW.map((span) => {
  const frameOf = (physT: number) => {
    let i = 0;
    while (i < F_T.length - 1 && F_T[i] < physT) i++;
    return i / CLOCK_SUB;
  };
  const bottomFrame = frameOf(span.起);
  return { 开始: bottomFrame - span.rampIn, bottom: bottomFrame, riseFrame: frameOf(span.止), recoverFrame: frameOf(span.止) + span.出 };
});
