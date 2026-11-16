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
type SlowSpan = { start: number; end: number; factor: number; rampIn: number; 出: number };
const SLOW: SlowSpan[] = [
  // 巫妖：撞北墙前一点到化成白烟，物理 0.05 秒上下
  { start: pierceTimes.巫妖 + lichChoreo.slowMo.start, end: pierceTimes.巫妖 + lichChoreo.slowMo.end, factor: 100, rampIn: 14 / 24, 出: 1.25 },
  // 冰雪女王：撞南墙前一点到化成白烟，物理 0.035 秒
  { start: pierceTimes.冰雪女王 + snowQueenChoreo.slowMo.start, end: pierceTimes.冰雪女王 + snowQueenChoreo.slowMo.end, factor: 100, rampIn: 14 / 24, 出: 1.25 },
  // 巨人（屋里，近景）：撞南墙前一点到第二个巨人化成白烟，物理 0.038 秒
  { start: pierceTimes.巨人 + giantChoreo.slowMo.start, end: pierceTimes.巨人 + giantChoreo.slowMo.end, factor: 80, rampIn: 14 / 24, 出: 1.25 },
];
export const slowMoTable = SLOW;
// 脱手以后再放这么久：收扫帚、两人冲到屋顶上站定（6-1-9/编排.ts 的 下扫帚）
const HOLD_END = castleChoreo.dismount.holdSec;
// 放慢的四截（画面时间）：normal 原速，到物理时刻 起 − 降的那截物理时长 开始降（rampIn 秒），降到底正好是 起；1/倍数 放到 止；再 出 秒升回原速。
// 切换按真时刻算（用户 11-16 定 1/24 秒的格一处不留）：原来按 1/192 秒一步走状态机，开始降那一刻落到步上，放慢 100 倍以后画面上差到半秒，上游挪一点就跳
const rIn = (S: number, u: number) => Math.exp(-Math.log(S) * smoothstep01(u));
const rOut = (S: number, u: number) => Math.exp(-Math.log(S) * (1 - smoothstep01(u)));
// ∫0^u rate(S, x) dx（辛普森，128 格）
const rampIntegral = (rate: (S: number, u: number) => number, S: number, u: number) => {
  if (u <= 0) return 0;
  const n = 128;
  const h = u / n;
  let sum = rate(S, 0) + rate(S, u);
  for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * rate(S, i * h);
  return (sum * h) / 3;
};
type ClockSpan = SlowSpan & { gIn: number; gHold: number; gOut: number; gNormal: number; tIn: number; tOutEnd: number };
const SPANS: ClockSpan[] = [];
{
  let g = 0;
  let physT = 0;
  for (const span of SLOW) {
    const tIn = span.start - span.rampIn * rampIntegral(rIn, span.factor, 1);
    if (tIn < physT) throw new Error(`一镜到底时钟：物理 ${span.start} 秒那处放慢和上一处叠在一起了`);
    const gIn = g + (tIn - physT);
    const gHold = gIn + span.rampIn;
    const gOut = gHold + (span.end - span.start) * span.factor;
    const gNormal = gOut + span.出;
    const tOutEnd = span.end + span.出 * rampIntegral(rOut, span.factor, 1);
    SPANS.push({ ...span, gIn, gHold, gOut, gNormal, tIn, tOutEnd });
    g = gNormal;
    physT = tOutEnd;
  }
}
const exactPhysicalTime = (g: number) => {
  let gPrev = 0;
  let tPrev = 0;
  for (const span of SPANS) {
    if (g < span.gIn) break;
    if (g < span.gHold) return span.tIn + span.rampIn * rampIntegral(rIn, span.factor, (g - span.gIn) / span.rampIn);
    if (g < span.gOut) return span.start + (g - span.gHold) / span.factor;
    if (g < span.gNormal) return span.end + span.出 * rampIntegral(rOut, span.factor, (g - span.gOut) / span.出);
    gPrev = span.gNormal;
    tPrev = span.tOutEnd;
  }
  return tPrev + (g - gPrev);
};
// 到站那一刻（画面秒）
const lastSpan = SPANS[SPANS.length - 1];
if (T_ARRIVE <= lastSpan.tOutEnd) throw new Error('一镜到底时钟：到站时还在放慢');
const G_ARRIVE = lastSpan.gNormal + (T_ARRIVE - lastSpan.tOutEnd);
// 查表：每 1/192 秒画面时间一格，格点上是真值，格间线性插
const CLOCK_STEPS_PER_SEC = 192;
const F_T: number[] = Array.from({ length: Math.ceil(G_ARRIVE * CLOCK_STEPS_PER_SEC) + 1 }, (_, i) => exactPhysicalTime(i / CLOCK_STEPS_PER_SEC));
// 一镜到底多长（秒）：到站再放 HOLD_END
export const totalLength = G_ARRIVE + HOLD_END;
// 画面时间 → 物理时间（落地以后接着按原速走，给悬停的晃动用）
export const physicalTime = (g: number) => {
  const x = g * CLOCK_STEPS_PER_SEC;
  if (x <= 0) return g;
  if (x >= F_T.length - 1) return T_ARRIVE + (g - G_ARRIVE);
  const i = Math.floor(x);
  return F_T[i] + (F_T[i + 1] - F_T[i]) * (x - i);
};
// 物理时间 → 画面时间（二分）
export const secAt = (physT: number) => {
  if (physT <= 0) return physT;
  if (physT >= T_ARRIVE) return G_ARRIVE + (physT - T_ARRIVE);
  const lo = bisect(F_T, physT);
  return (lo + (physT - F_T[lo]) / (F_T[lo + 1] - F_T[lo])) / CLOCK_STEPS_PER_SEC;
};
export const secAtDist = (s: number) => secAt(timeAtDist(s));
// 时钟倍率（画面上 1 秒对应多少物理秒），前后各半格（1/48 秒）差分
const RATE_HALF_WINDOW = 1 / 48;
export const clockRate = (g: number) => (physicalTime(g + RATE_HALF_WINDOW) - physicalTime(g - RATE_HALF_WINDOW)) / (2 * RATE_HALF_WINDOW);
export const pierceSecs = Object.fromEntries(ORDER.map((n) => [n, secAt(pierceTimes[n])])) as Record<BossName, number>;
// 子弹时间各段在画面上从哪一刻开始放慢、哪一刻慢到底、哪一刻开始回升、哪一刻恢复原速（秒）
export const slowMoTimes = SPANS.map((span) => ({ startedAt: span.gIn, bottom: span.gHold, rise: span.gOut, recover: span.gNormal }));
