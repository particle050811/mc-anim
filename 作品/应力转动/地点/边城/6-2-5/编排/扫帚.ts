// 扫帚（航线 + 真实飞行的偏移，转弯内倾、穿云拉起、收势放平、最后转朝南）和两个骑手的身子。
import type { V3 } from '@engine/model/parts.tsx';
import { triangleSmooth, bankAngle, headingPitch } from '@engine/flight/飞行路径.ts';
import type { RideLiYing } from '@库/角色/骑扫帚.tsx';
import { ss, lerp } from './工具.ts';
import { ROUTE } from './航线.ts';
import { odometer, cloudPierceG, decelStartG, stopG } from './时间线.ts';
import { baseline, baselineDir, rightNormal, perturb } from './真实飞行.ts';

// ---------- 扫帚 ----------
export type BroomState = { 位置: V3; 朝向: number; 俯仰: number; 横滚: number; 速度: number };
const raw = (globalFrame: number) => {
  const dist = Math.min(odometer(globalFrame), ROUTE.length);
  return { s: dist, p: baseline(dist), d: ROUTE.dir(Math.min(dist, ROUTE.length - 3)), dz: baselineDir(Math.min(dist, ROUTE.length - 3)), v: (odometer(globalFrame + 0.5) - odometer(globalFrame - 0.5)) * 24 };
};
// 航线自己的转向角速度（度/秒，正 = 往左）
const routeYawRate = (globalFrame: number) => {
  const yawBefore = headingPitch(raw(globalFrame - 1).d).yaw;
  const yawAfter = headingPitch(raw(globalFrame + 1).d).yaw;
  let dy = yawAfter - yawBefore;
  dy -= 360 * Math.round(dy / 360);
  return (dy / 2) * 24;
};
// 转弯内倾：航线的转向过 lib/飞行路径.ts 的 `内倾`（最多 18°），前后 12 帧（半秒）三角平滑；再加驾驶员修航向的那一份（`合成内倾` 减去只按航线算的内倾）。
// 扰动那一份不进三角平滑：它本来就是光滑的低频量，进了平滑锚点边上 12 帧会把锚点外的扰动卷进来，首尾和接入前差零点零几度
const bank = (G: number) => bankAngle(routeYawRate(G));
const perturbBank = (G: number) => perturb.combineBank(G, routeYawRate(G)) - bank(G);
// 收势：扫帚的俯仰就是航线的俯仰，顺着收势那段曲线从爬升的 27° 抬到 35° 上下（减速时扫帚头微微上扬）再慢慢放平；
// 最后两秒速度太小、航线切线的俯仰会在 5° 上下晃，停住前 2 秒到停住后 6 帧乘一个从 1 降到 0 的权，一路收到 0，悬停时轻轻起伏。
const flattenWeight = (G: number) => 1 - ss((G - (stopG - 48)) / 54);
const firstPitch = 55; // 见 编排.ts 文件头：草束朝镜头的一面背着太阳
// 不带扰动的朝向：航线切线的朝向；最后转到朝南（城门在北，悬停时面朝城里）。原来急刹后一秒里、还在 400 米/秒时就转过来，
// 扫帚横着往前滑；现在放在快停住的时候转（转向前 1.5 秒起、到停住后 8 帧转完，开始转时已经慢到一百米每秒上下，急刹以后扰动是 0）
const turnSouth = [stopG - 36, stopG + 8] as const;
export const routeYaw = (globalFrame: number) => {
  let yaw = headingPitch(raw(globalFrame).d).yaw;
  const ys = ss((globalFrame - turnSouth[0]) / (turnSouth[1] - turnSouth[0]));
  let delta = 180 - yaw;
  delta -= 360 * Math.round(delta / 360);
  return yaw + delta * ys;
};
// 航线的俯仰（含真实飞行的那一份）。穿云那一下从 58° 的俯冲转到 31° 的下滑：航线在航点 W2 上是个折角，向心 Catmull-Rom 过折角时切线在三帧里
// 先翘到 −26° 再落回 −31°（每帧 11°、12°、−4.5°），推近以后人在画面中间猛地一点头，是穿云那段「一抖」里最大的一下。
// 前后各 拉起半宽 帧换成一段三次 Hermite（两头的值和斜率照原样），扫帚在不到一秒里平滑地拉起来；位置不动，只改画出来的俯仰
const routePitch = (G: number) => headingPitch(raw(G).dz).pitch + perturb.at(G).俯仰;
const pullUpHalfWidth = 10;
const pullUpPitch = (() => {
  const winStart = cloudPierceG - pullUpHalfWidth;
  const winEnd = cloudPierceG + pullUpHalfWidth;
  const span = winEnd - winStart;
  const [p0, p1] = [routePitch(winStart), routePitch(winEnd)];
  const m0 = ((routePitch(winStart + 1) - routePitch(winStart - 1)) / 2) * span;
  const m1 = ((routePitch(winEnd + 1) - routePitch(winEnd - 1)) / 2) * span;
  return (globalFrame: number) => {
    const t = (globalFrame - winStart) / span;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
  };
})();
// 扫帚：航线 + 真实飞行的偏移和航向扰动（扰动只有慢的大弯，见 真实飞行.ts），镜头也按它摆
export const broom = (globalFrame: number): BroomState => {
  const track = raw(globalFrame);
  const pert = perturb.at(globalFrame);
  const normal = rightNormal(track.d);
  const roll = triangleSmooth(bank, globalFrame, 12) + perturbBank(globalFrame);
  // 33.1 往前一压：首帧扫帚头抬着 55°（6-2-4 末尾往上窜），14 帧里压到航线的俯仰
  let pitch = lerp(firstPitch, Math.abs(globalFrame - cloudPierceG) < pullUpHalfWidth ? pullUpPitch(globalFrame) : routePitch(globalFrame), ss(globalFrame / 14));
  if (globalFrame > stopG - 48) pitch *= flattenWeight(globalFrame);
  const ys = ss((globalFrame - turnSouth[0]) / (turnSouth[1] - turnSouth[0]));
  const yaw = routeYaw(globalFrame) + pert.航向;
  const hover = globalFrame > stopG ? 0.6 * Math.sin(((globalFrame - stopG) * 2 * Math.PI) / 48) : 0;
  return {
    位置: [track.p[0] + normal[0] * pert.横, track.p[1] + normal[1] * pert.横, track.p[2] + pert.竖 + hover],
    朝向: yaw,
    俯仰: pitch,
    横滚: roll * ss((globalFrame - 6) / 10) * (1 - ys),
    速度: track.v,
  };
};

// ---------- 骑手 ----------
export type Riders = { 李樱: RideLiYing; 九胡: { lean: number; hugWaist: number; tailPhase: number; 风: number; headRaise: number; headTurn?: number } };
export const riders = (globalFrame: number): Riders => {
  // 收势：减速开始后一秒半里慢慢直起身子
  const brake = ss((globalFrame - decelStartG) / 36) * (1 - ss((globalFrame - stopG) / 12));
  const stop = ss((globalFrame - stopG) / 12);
  const go = ss(globalFrame / 20);
  return {
    // 起飞时身子压低；减速时慢慢直起身子，停住以后坐直往下看
    李樱: { lean: lerp(lerp(lerp(30, 46, go), 12, brake), 18, stop), headRaise: lerp(25, -20, stop) },
    九胡: { lean: lerp(lerp(lerp(25, 34, go), 10, brake), 20, stop), hugWaist: 1, tailPhase: globalFrame / 9, 风: ss(globalFrame / 10) * (1 - stop), headRaise: lerp(10, -25, stop), headTurn: 20 * stop },
  };
};
