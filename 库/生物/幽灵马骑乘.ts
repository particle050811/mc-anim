// 幽灵马的尺寸、骑乘姿势常数、步态和人立量、骑手脚底：纯数，不带模型字节和 react。出处见 幽灵马.tsx 文件头（同一套字节码依据）。
// 编排、时间线要这些数就从这里引，不用把 幽灵马.tsx（模型、贴图、组件）拖进闭包；幽灵马.tsx 原样转出。
import type { V3 } from '../../engine/core/坐标.ts';

export const STEED = {
  scale: 1.1,
  box: [1.3964844, 1.6] as [number, number],
  riderHeight: 1.6 * 0.75 - 0.35, // 骑手脚底离马脚底
  summonForward: 1.5, // 出生在施法者前方 1.5 格、高 0.15 格
};
// 原版 HumanoidModel 骑乘姿势（setupAnim 里 riding 那一支），给骨架.tsx 换算用：度，原版 ModelPart 的 xRot/yRot
export const VANILLA_RIDE = { legXRot: -81, legYRot: 18, armXRot: -36 };

// 匀速跑时的 limbSwingAmount、limbSwing：原版 WalkAnimationState.update(min(每刻位移×4, 1), 0.4)，匀速时 amount 收敛到 min(1, 4×速度/20)，
// limbSwing 每刻 += amount。速度单位 格/秒；秒 = 跑了多久
export const horseGait = (speed: number, runSec: number) => {
  const swingAmount = Math.min(1, (4 * speed) / 20);
  return { legPhase: runSec * 20 * swingAmount, amplitude: swingAmount };
};

// 人立量 standAnim（AbstractHorse.tick）：立着每刻 s += (1 − s)×0.4 + 0.05（封顶 1，5 刻立满），放下每刻 s += (0.8s³ − s)×0.6 − 0.05（到 0，5 刻落平）。
// 起跳那一刻 setStanding(true)，往后 19 刻立着、第 20 刻放下（standCounter 过 20）；没落平又起跳就重新数。刻与刻之间按 partialTick 线性插值。
// takeoffs：这匹马每一跃离地的时刻（秒，升序，可以有负的——上一场的跳）；t 秒。
const STAND_TICKS = 19;
const FADE_TICKS = 5;
export const steedStand = (takeoffs: readonly number[], t: number): number => {
  let last = -1;
  for (let i = 0; i < takeoffs.length; i++) if (takeoffs[i] <= t) last = i;
  if (last < 0) return 0;
  // 往前找连着的那几跳（上一跳还没落平就又跳了），从其中第一跳那一刻起逐刻算
  let first = last;
  while (first > 0 && takeoffs[first] - takeoffs[first - 1] < (STAND_TICKS + FADE_TICKS + 1) / 20) first--;
  const starts = takeoffs.slice(first, last + 1).map((t0) => (t0 - takeoffs[first]) * 20);
  const tau = (t - takeoffs[first]) * 20;
  const k = Math.floor(tau);
  if (k > starts[starts.length - 1] + STAND_TICKS + FADE_TICKS + 1) return 0;
  let prev = 0;
  let cur = 0;
  for (let tick = 1; tick <= k + 1; tick++) {
    prev = cur;
    const standing = starts.some((start) => tick > start && tick <= start + STAND_TICKS);
    cur = standing ? Math.min(1, cur + (1 - cur) * 0.4 + 0.05) : Math.max(0, cur + (0.8 * cur * cur * cur - cur) * 0.6 - 0.05);
  }
  return prev + (cur - prev) * (tau - k);
};
// 马和骑手的人立量：骑手（positionRider）用的是上一刻的 standAnimO，比马晚 1 刻
export const steedRear = (takeoffs: readonly number[], t: number) => ({ horse: steedStand(takeoffs, t), rider: steedStand(takeoffs, t - 1 / 20) });
// 骑手脚底（AbstractHorse.positionRider）：马脚底 + 骑乘高，人立时再往后 0.7 格、往上 0.15 格 × 骑手人立量。yaw 同骨架（正 = 往左，0 朝 +Y）
export const riderFeet = (horseFeet: V3, yaw: number, rear = 0): V3 => {
  const yawRad = (yaw * Math.PI) / 180;
  return [horseFeet[0] + 0.7 * rear * Math.sin(yawRad), horseFeet[1] - 0.7 * rear * Math.cos(yawRad), horseFeet[2] + STEED.riderHeight + 0.15 * rear];
};
