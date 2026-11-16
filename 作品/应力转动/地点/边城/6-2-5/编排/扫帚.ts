// 扫帚（航线 + 真实飞行的偏移，转弯内倾、穿云拉起、收势放平、最后转朝南）和两个骑手的身子。
import type { V3 } from '@engine/model/parts.tsx';
import { triangleSmooth, bankAngle, headingPitch } from '@engine/flight/飞行路径.ts';
import type { RideLiYing } from '@库/角色/骑扫帚.tsx';
import { ROUTE } from './航线.ts';
import { odometer, cloudPierceSec, decelStartSec, stopSec } from './时间线.ts';
import { baseline, baselineDir, rightNormal, perturb } from './真实飞行.ts';
import { smoothstep01, lerp } from '@engine/core/数学.ts';

// ---------- 扫帚 ----------
export type BroomState = { 位置: V3; facing: number; pitch: number; roll: number; speed: number };
// 差分步长和三角平滑的采样间隔照旧版 1/24 秒一格（换了间隔，转弯内倾、速度会差一点）
const diffStepSec = 1 / 24;
const raw = (globalSec: number) => {
  const dist = Math.min(odometer(globalSec), ROUTE.length);
  return { s: dist, p: baseline(dist), d: ROUTE.dir(Math.min(dist, ROUTE.length - 3)), dz: baselineDir(Math.min(dist, ROUTE.length - 3)), v: (odometer(globalSec + diffStepSec / 2) - odometer(globalSec - diffStepSec / 2)) / diffStepSec };
};
// 航线自己的转向角速度（度/秒，正 = 往左）
const routeYawRate = (globalSec: number) => {
  const yawBefore = headingPitch(raw(globalSec - diffStepSec).d).yaw;
  const yawAfter = headingPitch(raw(globalSec + diffStepSec).d).yaw;
  let dy = yawAfter - yawBefore;
  dy -= 360 * Math.round(dy / 360);
  return dy / (2 * diffStepSec);
};
// 转弯内倾：航线的转向过 lib/飞行路径.ts 的 `内倾`（最多 18°），前后半秒（各 12 格）三角平滑；再加驾驶员修航向的那一份（`合成内倾` 减去只按航线算的内倾）。
// 扰动那一份不进三角平滑：它本来就是光滑的低频量，进了平滑锚点边上半秒会把锚点外的扰动卷进来，首尾和接入前差零点零几度
const bank = (T: number) => bankAngle(routeYawRate(T));
const perturbBank = (T: number) => perturb.combineBank(T, routeYawRate(T)) - bank(T);
const smoothedBank = (T: number) => triangleSmooth((cell) => bank(cell * diffStepSec), T / diffStepSec, 12);
// 收势：扫帚的俯仰就是航线的俯仰，顺着收势那段曲线从爬升的 27° 抬到 35° 上下（减速时扫帚头微微上扬）再慢慢放平；
// 最后两秒速度太小、航线切线的俯仰会在 5° 上下晃，停住前 2 秒到停住后 1/4 秒乘一个从 1 降到 0 的权，一路收到 0，悬停时轻轻起伏。
const flattenWeight = (T: number) => 1 - smoothstep01((T - (stopSec - 2)) / 2.25);
const firstPitch = 55; // 见 编排.ts 文件头：草束朝镜头的一面背着太阳
// 不带扰动的朝向：航线切线的朝向；最后转到朝南（城门在北，悬停时面朝城里）。原来急刹后一秒里、还在 400 米/秒时就转过来，
// 扫帚横着往前滑；现在放在快停住的时候转（停住前 1.5 秒起、到停住后 1/3 秒转完，开始转时已经慢到一百米每秒上下，急刹以后扰动是 0）
const turnSouth = [stopSec - 1.5, stopSec + 1 / 3] as const;
export const routeYaw = (globalSec: number) => {
  let yaw = headingPitch(raw(globalSec).d).yaw;
  const ys = smoothstep01((globalSec - turnSouth[0]) / (turnSouth[1] - turnSouth[0]));
  let delta = 180 - yaw;
  delta -= 360 * Math.round(delta / 360);
  return yaw + delta * ys;
};
// 航线的俯仰（含真实飞行的那一份）。穿云那一下从 58° 的俯冲转到 31° 的下滑：航线在航点 W2 上是个折角，向心 Catmull-Rom 过折角时切线在三格（1/8 秒）里
// 先翘到 −26° 再落回 −31°（每格 11°、12°、−4.5°），推近以后人在画面中间猛地一点头，是穿云那段「一抖」里最大的一下。
// 前后各 拉起半宽 秒换成一段三次 Hermite（两头的值和斜率照原样），扫帚在不到一秒里平滑地拉起来；位置不动，只改画出来的俯仰
const routePitch = (T: number) => headingPitch(raw(T).dz).pitch + perturb.at(T).pitch;
const pullUpHalfWidth = 5 / 12;
const pullUpPitch = (() => {
  const winStart = cloudPierceSec - pullUpHalfWidth;
  const winEnd = cloudPierceSec + pullUpHalfWidth;
  const span = winEnd - winStart;
  const [p0, p1] = [routePitch(winStart), routePitch(winEnd)];
  const m0 = ((routePitch(winStart + diffStepSec) - routePitch(winStart - diffStepSec)) / (2 * diffStepSec)) * span;
  const m1 = ((routePitch(winEnd + diffStepSec) - routePitch(winEnd - diffStepSec)) / (2 * diffStepSec)) * span;
  return (globalSec: number) => {
    const t = (globalSec - winStart) / span;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
  };
})();
// 扫帚：航线 + 真实飞行的偏移和航向扰动（扰动只有慢的大弯，见 真实飞行.ts），镜头也按它摆
export const broom = (globalSec: number): BroomState => {
  const track = raw(globalSec);
  const pert = perturb.at(globalSec);
  const normal = rightNormal(track.d);
  const roll = smoothedBank(globalSec) + perturbBank(globalSec);
  // 33.1 往前一压：首帧扫帚头抬着 55°（6-2-4 末尾往上窜），7/12 秒里压到航线的俯仰
  let pitch = lerp(firstPitch, Math.abs(globalSec - cloudPierceSec) < pullUpHalfWidth ? pullUpPitch(globalSec) : routePitch(globalSec), smoothstep01(globalSec / (7 / 12)));
  if (globalSec > stopSec - 2) pitch *= flattenWeight(globalSec);
  const ys = smoothstep01((globalSec - turnSouth[0]) / (turnSouth[1] - turnSouth[0]));
  const yaw = routeYaw(globalSec) + pert.heading;
  const hover = globalSec > stopSec ? 0.6 * Math.sin(((globalSec - stopSec) * 2 * Math.PI) / 2) : 0; // 2 秒一个起伏
  return {
    位置: [track.p[0] + normal[0] * pert.lateral, track.p[1] + normal[1] * pert.lateral, track.p[2] + pert.vertical + hover],
    facing: yaw,
    pitch: pitch,
    roll: roll * smoothstep01((globalSec - 1 / 4) / (5 / 12)) * (1 - ys),
    speed: track.v,
  };
};

// ---------- 骑手 ----------
export type Riders = { 李樱: RideLiYing; 九胡: { lean: number; hugWaist: number; tailPhase: number; wind: number; headRaise: number; headTurn?: number } };
export const riders = (globalSec: number): Riders => {
  // 收势：减速开始后一秒半里慢慢直起身子
  const brake = smoothstep01((globalSec - decelStartSec) / 1.5) * (1 - smoothstep01((globalSec - stopSec) / 0.5));
  const stop = smoothstep01((globalSec - stopSec) / 0.5);
  const go = smoothstep01(globalSec / (5 / 6));
  return {
    // 起飞时身子压低；减速时慢慢直起身子，停住以后坐直往下看
    李樱: { lean: lerp(lerp(lerp(30, 46, go), 12, brake), 18, stop), headRaise: lerp(25, -20, stop) },
    九胡: { lean: lerp(lerp(lerp(25, 34, go), 10, brake), 20, stop), hugWaist: 1, tailPhase: (globalSec * 8) / 3, wind: smoothstep01(globalSec / (5 / 12)) * (1 - stop), headRaise: lerp(10, -25, stop), headTurn: 20 * stop },
  };
};
