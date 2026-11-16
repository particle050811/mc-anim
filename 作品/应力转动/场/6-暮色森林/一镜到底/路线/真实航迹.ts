// 规划航线的方位和内倾，叠上真实飞行的横向偏移（航迹锚、扰动），得到扫帚杆中心的实际位置、切线和操纵内倾。
import { maxBankDeg } from '@engine/flight/飞行路径.ts';
import { realFlight, type Anchor } from '@engine/flight/真实飞行.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { sub, len, D0, ORDER, placeName } from './输入表.ts';
import { samples, NP, TAB_S, bisect, routeLength, plannedPos, speedAt, headingRate, markDist, routeDist } from './航线.ts';
import { totalLength, physicalTime, secAtDist } from './时钟.ts';
import { smoothstep01, rad } from '@engine/core/数学.ts';

// ---------- 规划航线的方位、内倾 ----------
// 方位按表里的 ψ（解析的，展开成连续）
const plannedBearing = (() => {
  const unwrapped = new Float64Array(NP);
  for (let i = 0; i < NP; i++) {
    let y = samples[i][5];
    if (i > 0) y += 360 * Math.round((unwrapped[i - 1] - y) / 360);
    unwrapped[i] = y;
  }
  return (dist: number) => {
    const clamped = Math.min(Math.max(dist, 0), routeLength);
    const i = bisect(TAB_S, clamped);
    const frac = (clamped - TAB_S[i]) / Math.max(1e-12, TAB_S[i + 1] - TAB_S[i]);
    return unwrapped[i] + (unwrapped[i + 1] - unwrapped[i]) * frac;
  };
})();
// 规划内倾（用户 10-05：内倾不超过 18°）：18°·tanh(0.3·ω / 50°)，每秒 60° 压 6°、90° 压 9°；穿刺线上 ω = 0、不内倾。
// ω 是梯形，折角处横滚角速度会一帧跳 0.8°/帧，所以按前后 0.17 秒的三角窗平均后再给
export const plannedBank = (dist: number) => {
  const windowM = Math.max(1, speedAt(Math.min(dist, routeLength)) * 0.17);
  let sum = 0;
  let weightSum = 0;
  for (let k = -4; k <= 4; k++) {
    const weight = 5 - Math.abs(k);
    sum += headingRate(Math.min(routeLength, Math.max(0, dist + (k / 4) * windowM))) * weight;
    weightSum += weight;
  }
  // 起点（接 6-1-3 末帧，那里不横滚）前 0.5 秒从 0 渐上来：窗口往前看，起飞马上就拐的话首帧已经压了 0.6°
  return maxBankDeg * Math.tanh((0.3 * (sum / weightSum)) / 50) * smoothstep01(dist / (3 * windowM));
};

// ---------- 真实飞行 ----------
// 用户 10-05 要求模拟真实飞行，10-06 嫌湍流影响流畅：在规划航线上叠 lib/真实飞行.ts 的横向偏移，只留慢的部分（驾驶员追踪、航向漂移、修航向时的操纵内倾）。
// 航迹锚住（扰动为 0）：首帧；每处穿刺从速度降到 450 米/秒以下到加回 450 的地方，前后各 1 秒渐变（放不下的并成一个锚）。种子 3、侧向参数是直航时扫过定的。
// 锚点的时刻、渐变都按画面秒给（realFlight 的 fps 传 1）
const noBump = { amplitude: 0 };
const realFlightParams = {
  lateral: { frequency: 2.5, damping: 0.7, drift: 3.0, driftScale: 1500, driftHighPass: 4000 },
  vertical: { drift: 0 },
  gust: { admittance: 0 },
  bump: { pitch: noBump, roll: noBump, facing: noBump, heave: noBump },
  inputLead: 2.0,
};
const realFlightSeed = 3;
const anchorSpeed = 450;
const anchorFadeSec = 1;
const startFadeSec = 0.5;
const distPastSpeed = (s0: number, dir: 1 | -1, minSpeed: number) => {
  let dist = s0;
  while (dist > 0 && dist < routeLength && speedAt(dist) < minSpeed) dist += dir * 2;
  return dist;
};
// 起、止：画面秒；前、后：渐变秒
export type AnchorSeg = { name: string; start: number; end: number; 前: number; 后: number };
export const trackAnchors: AnchorSeg[] = (() => {
  const anchors: AnchorSeg[] = [{ name: '6-1-3 末帧', start: 0, end: 0, 前: 0, 后: startFadeSec }];
  ORDER.forEach((bossName, i) => {
    const isLast = i === ORDER.length - 1;
    const anchor: AnchorSeg = {
      name: isLast ? `${placeName(bossName)} + 降落` : placeName(bossName),
      start: secAtDist(distPastSpeed(markDist(`${bossName}.前`), -1, anchorSpeed)),
      end: isLast ? totalLength : secAtDist(distPastSpeed(markDist(`${bossName}.后`), 1, anchorSpeed)),
      前: anchorFadeSec,
      后: anchorFadeSec,
    };
    const prevAnchor = anchors[anchors.length - 1];
    if (anchor.start - prevAnchor.end < prevAnchor.后 + anchor.前) {
      prevAnchor.end = anchor.end;
      prevAnchor.name = `${prevAnchor.name} + ${anchor.name}`;
      prevAnchor.后 = anchor.后;
    } else anchors.push(anchor);
  });
  return anchors;
})();
const toAnchorPoints = (a: AnchorSeg[]): Anchor[] => a.map(({ start: start, end: end, 前: fadeBefore, 后: fadeAfter }) => ({ frame: start, 止帧: end, 前: fadeBefore, 后: fadeAfter }));
const rawFlight = realFlight({ seed: realFlightSeed, 起帧: 0, 止帧: totalLength, fps: 1, distAt: routeDist, frameToTime: physicalTime, anchors: toAnchorPoints(trackAnchors), params: realFlightParams });
const DQ = 2;
const NQ = Math.ceil(routeLength / DQ);
const offsetX = new Float64Array(NQ + 1);
const offsetY = new Float64Array(NQ + 1);
export const disturbance = (() => {
  for (let i = 0; i <= NQ; i++) {
    const dist = i * DQ;
    const bearingRad = rad(plannedBearing(dist));
    const y = rawFlight.byDistance(dist).lateral;
    offsetX[i] = Math.cos(bearingRad) * y;
    offsetY[i] = -Math.sin(bearingRad) * y;
  }
  return rawFlight;
})();
// 真实飞行的偏移（米，世界坐标；锚住的地方是 0）
export const offset = (dist: number): V3 => {
  const x = Math.min(Math.max(dist / DQ, 0), NQ);
  const i = Math.min(Math.floor(x), NQ - 1);
  const k = x - i;
  return [offsetX[i] + (offsetX[i + 1] - offsetX[i]) * k, offsetY[i] + (offsetY[i + 1] - offsetY[i]) * k, 0];
};
// 扫帚杆中心：规划航线 + 真实飞行的偏移
export const positionAt = (dist: number): V3 => {
  const planned = plannedPos(dist);
  const realOffset = offset(dist);
  return [planned[0] + realOffset[0], planned[1] + realOffset[1], planned[2] + realOffset[2]];
};
// 单位切线（前后各 1 米差分，含扰动；起点按 6-1-3 末帧的速度方向）
export const tangentAt = (dist: number): V3 => {
  if (dist <= 1) return D0;
  const behind = positionAt(Math.min(dist - 1, routeLength - 2));
  const ahead = positionAt(Math.min(dist + 1, routeLength));
  const delta = sub(ahead, behind);
  const deltaLen = len(delta) || 1;
  return [delta[0] / deltaLen, delta[1] / deltaLen, delta[2] / deltaLen];
};
// 操纵内倾（扫帚横滚里真实飞行的那一份）：只取驾驶员自己偏开、修回时压的那一点，锚点渐变里拉回的那一下压掉，再 ±8 格三角平滑。
// 表每 1/24 秒一个样本，样本之间线性插值
const STEER_SAMPLES_PER_SEC = 24;
const steerBankTable = (() => {
  const frameCount = Math.round(totalLength * STEER_SAMPLES_PER_SEC);
  const weightAt = (i: number) => disturbance.at(Math.min(frameCount - 1, Math.max(0, i)) / STEER_SAMPLES_PER_SEC).weight;
  const raw = Array.from({ length: frameCount }, (_, i) => disturbance.at(i / STEER_SAMPLES_PER_SEC).bank * weightAt(i) ** 2 * weightAt(i + 12) ** 2);
  const halfWin = 8;
  return raw.map((_, i) => {
    let sum = 0;
    let weightSum = 0;
    for (let k = -halfWin; k <= halfWin; k++) {
      const weight = halfWin + 1 - Math.abs(k);
      sum += raw[Math.min(frameCount - 1, Math.max(0, i + k))] * weight;
      weightSum += weight;
    }
    return (sum / weightSum) * weightAt(i);
  });
})();
export const steerBank = (g: number) => {
  const x = Math.min(Math.max(g * STEER_SAMPLES_PER_SEC, 0), steerBankTable.length - 1);
  const i = Math.min(Math.floor(x), steerBankTable.length - 2);
  return steerBankTable[i] + (steerBankTable[i + 1] - steerBankTable[i]) * (x - i);
};
