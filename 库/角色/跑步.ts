// 人跑起来的步态跟着速度：步频、步长、前倾按速度取，编排按跑过的路或时间换成相位（用户 10-20 嫌边城快追「看起来像在走」）。
// 步频：原版疾跑 5.6 米/秒约每秒 2.1 个周期（limbSwing 每刻 +1、一个周期 2π / 0.6662），往上每快 1 米/秒加 0.075，封顶 3.75（同 6-1-2 李樱 40 米/秒：24 帧再快腿会糊）；
//   比原版疾跑慢时步长不变、步频跟着速度降（原版 limbSwing 跟着路程走）。快了以后靠步子迈得大。
// 前倾：0.6°/(米/秒)，最多 25°（30 米/秒 18°）。
import type { V3 } from '../../engine/model/parts.tsx';
import { standPose, type FigurePose } from './骨架.tsx';

// 起步加到全速、刹车停下默认 0.3 秒，人、马、监守者一样（用户 10-18 对古城定的）；例外（6-3-8 卫兵走道起步、7-3 塔顶刹车）在各段写明原因
export const RAMP_SEC = 0.3;

const VANILLA_SPRINT = 5.6;
const VANILLA_CADENCE = 2.1;
export const runCadence = (v: number) => (v <= VANILLA_SPRINT ? (VANILLA_CADENCE * Math.max(0, v)) / VANILLA_SPRINT : Math.min(3.75, VANILLA_CADENCE + 0.075 * (v - VANILLA_SPRINT)));
// 一个周期（左右各一步）跑多远，米
export const runStride = (v: number) => (v <= VANILLA_SPRINT ? VANILLA_SPRINT / VANILLA_CADENCE : v / runCadence(v));
export const runLean = (v: number) => Math.min(25, 0.6 * Math.max(0, v));
// 跑的姿势（追兵.tsx 的 walkPose 那一套）：相位按步态周期数 cycles（∫步频，见下面 `speedProfile`），v 米/秒。
// 快了步子迈得大，两步之间身子腾空一点，像跳着跑；摆腿频率不往上加（用户 10-20：7-4-2 黄叛「步幅改大一点类似跳着走 摆腿频率不要这么高」）
export const runPoseAt = (loc: V3, yaw: number, cycles: number, v: number): FigurePose => {
  const lean = Math.max(10, runLean(v));
  const fast = Math.min(1, Math.max(0, (v - VANILLA_SPRINT) / 34));
  const fastK = fast * fast * (3 - 2 * fast);
  const s = Math.sin(cycles * Math.PI * 2);
  const sw = (50 + 10 * fastK) * s;
  const lift = 0.15 * fastK * Math.abs(s); // 两腿叉开时离地最高，并拢（落脚）时最低
  return { ...standPose([loc[0], loc[1], loc[2] + lift]), yaw, pitch: -lean, headPitch: lean - 6, legR: sw, legL: -sw, armR: -sw * 0.9, armL: sw * 0.9, armRRoll: 4, armLRoll: 4 };
};
// 原版 HumanoidModel 的 limbSwing 一个周期是多少（cos(limbSwing × 0.6662)）
export const LIMB_SWING_PER_CYCLE = (2 * Math.PI) / 0.6662;

// 速度按关键点 [秒, 米/秒] 线性变（第一个关键点以前按它的速度，最后一个以后匀速）：τ 秒时跑过的路、当时的速度、步态周期数（∫步频 dτ）
export type SpeedKey = [number, number];
export const speedProfile = (keys: SpeedKey[]) => {
  const cyclesIn = (v0: number, v1: number, span: number, u: number) => {
    // 一段里步频对时间不是线性（步频对速度是折线），按 16 格辛普森积
    if (u <= 0) return 0;
    const n = 16;
    const h = u / n;
    let sum = 0;
    for (let j = 0; j <= n; j++) sum += (j === 0 || j === n ? 1 : j % 2 ? 4 : 2) * runCadence(v0 + ((v1 - v0) * j * h) / span);
    return (sum * h) / 3;
  };
  const cum: { dist: number; cycles: number }[] = [{ dist: 0, cycles: 0 }];
  for (let i = 1; i < keys.length; i++) {
    const [t0, v0] = keys[i - 1];
    const [t1, v1] = keys[i];
    const span = t1 - t0;
    cum.push({ dist: cum[i - 1].dist + ((v0 + v1) / 2) * span, cycles: cum[i - 1].cycles + cyclesIn(v0, v1, span, span) });
  }
  return (tau: number) => {
    const [tFirst, vFirst] = keys[0];
    if (tau <= tFirst) return { dist: vFirst * (tau - tFirst), speed: vFirst, cycles: runCadence(vFirst) * (tau - tFirst) };
    for (let i = 1; i < keys.length; i++) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1] = keys[i];
      if (tau > t1) continue;
      const span = t1 - t0;
      const u = tau - t0;
      return { dist: cum[i - 1].dist + v0 * u + ((v1 - v0) * u * u) / (2 * span), speed: v0 + ((v1 - v0) * u) / span, cycles: cum[i - 1].cycles + cyclesIn(v0, v1, span, u) };
    }
    const [tLast, vLast] = keys[keys.length - 1];
    const last = cum[cum.length - 1];
    return { dist: last.dist + vLast * (tau - tLast), speed: vLast, cycles: last.cycles + runCadence(vLast) * (tau - tLast) };
  };
};
