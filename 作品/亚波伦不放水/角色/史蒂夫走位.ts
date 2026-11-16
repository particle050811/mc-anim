// 史蒂夫的走位：把一条脚底轨迹（几秒在哪）照原版算出走路的摆腿和身子朝向，交给 史蒂夫反应.ts（状态的 走、朝向、跳）。纯计算。
// 位置平移、腿不动、朝向一帧切过去看着僵（用户 11-10：「人物的动作也要非常流畅」），这里按刻往前推一遍再在两刻之间插值，结果只看时间。
// 照原版（1.20.1）：
// - 摆腿 WalkAnimationState：目标 = min(1, 这一刻水平位移 × 4)，步幅每刻往目标靠 0.4，摆 每刻加当前步幅（同 库/角色/史蒂夫.tsx 的 vanillaWalk，那个只算匀速）。
// - 身子朝向 LivingEntity.tick：这一刻水平位移超过 0.05 格时身子往移动方向转，移动方向和视线差 95°～265°（倒着走）就取反方向；每刻转差的 0.3。
//   站着不动时身子不转（头偏出 50° 再带着身子转由 steveLookAt 管）。
// 离地（跳）时水平位移照算，原版跳起来腿也照摆。
// 原版没有、给关节用的两样（用户 11-10 定史蒂夫加关节，姿势在 角色/史蒂夫关节动作.ts）：
// - 向：往前走还是倒着走（移动方向在身子朝向上的分量，每刻往目标靠一半）。原版两种摆法一样，有了膝要分：往移动方向迈的那条腿收小腿。
// - 跳：从轨迹里认出腾空的那几段（竖直加速度接近重力、连着几个采样），给出离起跳、落地多久，蓄力下蹲、空中收腿、落地缓冲用。
//   只看轨迹不看地形：脚下高一格一格变的地方竖直位置是跳变，只占一两个采样，不会认成腾空。
import type { V3 } from '@engine/model/parts.tsx';
import { ticksPerSec } from '@库/原版物理.ts';

/** 这一刻和跳的关系（都不给 = 在地上、前后都没有跳）。空长 = 说的那一跳在空中一共多久 */
export type AirSnapshot = {
  /** 在地上、0.5 秒内要起跳：还有几秒 */
  preTakeoffSec?: number;
  /** 在空中：离地多久了、还有多久落地 */
  airPhase?: { 已: number; remain: number };
  /** 在地上、0.6 秒内落过地：落地后几秒、落地时往下的速度（格/秒） */
  postLandSec?: number;
  landSpeed?: number;
  airDurSec?: number;
};
export type WalkSnapshot = { 位置: V3; facing: number; 走: { swing: number; stride: number; walkDir: number }; 跳: AirSnapshot };

const tickSec = 1 / ticksPerSec;
const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
/** 认腾空：采样间隔（秒）、竖直加速度低于多少算腾空（格/秒²；原版重力折合 32，编排里的跳用 24.6）、至少连着几个采样、往前往后各找多远（秒） */
const sampleStepSec = 1 / 120;
const airAccel = -10;
const airMinSamples = 4;
const searchTakeoffSec = 0.5;
const landSearchSec = 0.6;

/**
 * 位：脚底在哪（场景坐标，时钟自定）；看：这一刻看向哪（决定倒着走时身子朝哪）；起：从哪一秒开始推（之前当站着不动）；初朝向：起 那一刻身子朝哪（度，0 朝 +Y，正 = 往左）。
 * 返回 在(秒)：位置原样取 位(秒)，朝向和摆腿在两刻之间线性插。
 */
export const defineWalk = (settings: { 位: (sec: number) => V3; 看: (sec: number) => V3; start: number; initFacing: number }) => {
  const { 位: posAt, 看: lookAt, start: startSec } = settings;
  // 第 k 刻末的状态（k = 0 是 起）
  const stepTable: { facing: number; swing: number; stride: number; walkDir: number }[] = [{ facing: settings.initFacing, swing: 0, stride: 0, walkDir: 1 }];
  const pushTo = (k: number) => {
    while (stepTable.length <= k) {
      const n = stepTable.length;
      const prev = stepTable[n - 1]!;
      const [a, b] = [posAt(startSec + (n - 1) * tickSec), posAt(startSec + n * tickSec)];
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const distance = Math.hypot(dx, dy);
      const stride = prev.stride + (Math.min(1, distance * 4) - prev.stride) * 0.4;
      let facing = prev.facing;
      if (distance > 0.05) {
        const lookTarget = lookAt(startSec + n * tickSec);
        const viewAngle = (Math.atan2(-(lookTarget[0] - b[0]), lookTarget[1] - b[1]) * 180) / Math.PI;
        let angleDeg = (Math.atan2(-dx, dy) * 180) / Math.PI;
        if (Math.abs(wrap180(angleDeg - viewAngle)) > 95) angleDeg += 180;
        facing += wrap180(angleDeg - facing) * 0.3;
      }
      let walkDir = prev.walkDir;
      if (distance > 0.02) walkDir += (Math.cos(Math.atan2(-dx, dy) - (facing * Math.PI) / 180) - walkDir) * 0.5;
      stepTable.push({ facing, swing: prev.swing + stride, stride, walkDir });
    }
  };
  // 第 k 个采样（起 + k × 采样）的竖直加速度（位置的二阶差分）够不够腾空
  const emptyTable = new Map<number, boolean>();
  const emptySample = (k: number) => {
    let cached = emptyTable.get(k);
    if (cached === undefined) {
      const t = startSec + k * sampleStepSec;
      cached = (posAt(t + sampleStepSec)[2] - 2 * posAt(t)[2] + posAt(t - sampleStepSec)[2]) / (sampleStepSec * sampleStepSec) < airAccel;
      emptyTable.set(k, cached);
    }
    return cached;
  };
  /** 第 k 个采样所在的腾空段 [起跳时刻, 落地时刻]；不在腾空段里 = null。起跳、落地那一下差分里混着速度突变，两头各少认一个采样，补回去 */
  const emptySegment = (k: number): readonly [number, number] | null => {
    if (!emptySample(k)) return null;
    let [a, b] = [k, k];
    while (k - a < 1200 && emptySample(a - 1)) a--;
    while (b - k < 1200 && emptySample(b + 1)) b++;
    return b - a + 1 < airMinSamples ? null : [startSec + (a - 1) * sampleStepSec, startSec + (b + 1) * sampleStepSec];
  };
  const jumpAt = (sec: number): AirSnapshot => {
    const k = Math.round((sec - startSec) / sampleStepSec);
    for (const j of [k, k - 1, k + 1]) {
      const airSeg = emptySegment(j);
      if (airSeg && sec >= airSeg[0] && sec < airSeg[1]) return { airPhase: { 已: sec - airSeg[0], remain: airSeg[1] - sec }, airDurSec: airSeg[1] - airSeg[0] };
    }
    const airState: AirSnapshot = {};
    for (let j = k; j <= k + searchTakeoffSec / sampleStepSec + 1; j++) {
      const airSeg = emptySegment(j);
      if (!airSeg) continue;
      if (airSeg[0] >= sec && airSeg[0] - sec <= searchTakeoffSec) Object.assign(airState, { preTakeoffSec: airSeg[0] - sec, airDurSec: airSeg[1] - airSeg[0] });
      break;
    }
    for (let j = k; j >= k - landSearchSec / sampleStepSec - 1; j--) {
      const airSeg = emptySegment(j);
      if (!airSeg) continue;
      if (airSeg[1] <= sec && sec - airSeg[1] <= landSearchSec) {
        airState.postLandSec = sec - airSeg[1];
        airState.landSpeed = Math.max(0, (posAt(airSeg[1] - 2 * sampleStepSec)[2] - posAt(airSeg[1] - sampleStepSec)[2]) / sampleStepSec);
        airState.airDurSec ??= airSeg[1] - airSeg[0];
      }
      break;
    }
    return airState;
  };
  const stateAt = (sec: number): WalkSnapshot => {
    const tick = Math.max(0, (sec - startSec) / tickSec);
    const k = Math.floor(tick);
    const f = tick - k;
    pushTo(k + 1);
    const [fromKeyframe, toKey] = [stepTable[k]!, stepTable[k + 1]!];
    return {
      位置: posAt(sec),
      facing: fromKeyframe.facing + (toKey.facing - fromKeyframe.facing) * f,
      走: { swing: fromKeyframe.swing + (toKey.swing - fromKeyframe.swing) * f, stride: fromKeyframe.stride + (toKey.stride - fromKeyframe.stride) * f, walkDir: fromKeyframe.walkDir + (toKey.walkDir - fromKeyframe.walkDir) * f },
      跳: jumpAt(sec),
    };
  };
  return { 在: stateAt };
};
