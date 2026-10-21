// 6-3-8、6-3-10 的卫兵：城墙上放镜、低头、探身，出发从内沿跳进墙脚的落水池、上岸往西跑，坑口散开围住往下看。
import { 例外 } from '../../../../../engine/core/例外.ts';
import type { V3 } from '../../../../../engine/model/parts.tsx';
import { borderTownPos } from '../../../主世界116.ts';
import pitSurfaceTable from 'asset:数据/镜头/6-3-下坠/竖井4x.坑面'; // 古城4x 那一份（坑口形状和老片场那份一样，同一个种子）
import { guardPositions, groundZ } from '../../6-3-下坠/编排.ts';
import { LIMB_SWING_PER_CYCLE, RAMP_SEC, runLean, speedProfile } from '../../../../角色/跑步.ts';
import { chaseSpeed } from '../../../古城4x/布局/强者.ts';
import { D2R, ss, lerp, lerp3, add, sub } from './工具.ts';
import { cues } from './时间线.ts';
import { shaftMouth, yawFromTo, pitchTo } from './站位.ts';
import { poolJump, vhForDrop, type PoolJump } from './落水.ts';

// ---------- 卫兵 ----------
// 接 6-3-4：卫兵们举着望远镜追着天上的李樱（6-3-下坠/编排/卫兵.ts 的 `guardPoseAt`）。6-3-8 开头还举着望远镜对着坑上方的天——李樱一闪就砸进地里，人还没反应过来。
// 每人各算各的（用户 10-12 嫌九个人一齐放镜、一齐低头太人机）：
// - 视线：各自按脚下的位置朝坑算，身子再带 ±7° 的随意，头另外再偏一点；
// - 放镜：0.45～1.15 秒里各自放下，快的 0.2 秒、慢的 0.45 秒；低头比放镜晚 0.05～0.2 秒；
// - 1、4、6 号放下望远镜后往走道内沿走几步，潜行蹲下探身往城里看（卫兵.tsx 的 `crouch`）；
// - 2 号、7 号低头看一眼后扭头去看旁边的人（2 号看 3 号，7 号看 6 号），停一下再转回来看坑。
// lean：跑起来整个人往前倾多少度（卫兵.tsx 的 `lean`），不给是 0
export type GuardPose = { raiseSpyglass: number; headPitch: number; headYaw: number; bodyYaw: number; pos: V3; crouch: number; limbSwing: number; stride: number; capeLift: number; present: boolean; lean?: number };
const jitter = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x) - 0.5;
};
const jitter01 = (i: number, k: number) => jitter(i, k) + 0.5; // 0～1
const guardFeet = (i: number): V3 => add(borderTownPos, guardPositions[i]);
// 第 i 个卫兵各自的反应时刻、快慢（剧情秒，6-3-8 首帧 = 0）
const guardReaction = (i: number) => {
  const lowerScope = 0.45 + 0.7 * jitter01(i, 4);
  const lowerScopeDur = 0.2 + 0.25 * jitter01(i, 6);
  const lookDown = lowerScope + 0.05 + 0.15 * jitter01(i, 7);
  const lookDownDur = 0.35 + 0.4 * jitter01(i, 8);
  return { lowerScope: lowerScope, lowerScopeDur: lowerScopeDur, lookDown: lookDown, lookDownDur: lookDownDur };
};
const leaners = [1, 4, 6];
const headTurners: Record<number, number> = { 2: 3, 7: 6 }; // 谁扭头看谁
const walkSpeed = 4.3; // 原版走路 0.2158 格/刻
const leanWalkDist = 3.6; // 从缺口（y 202.2）往城里走到 y 198.6，离内沿 1.6 格
// 站在走道上（出发以前）：位置、朝向、姿势
const guardStanding = (t: number, i: number): GuardPose => {
  const reaction = guardReaction(i);
  const f0 = guardFeet(i);
  const skyPoint: V3 = add(shaftMouth(), [0, 0, 120]);
  const skyPitch = pitchTo(add(f0, [0, 0, 1.62]), skyPoint); // 正 = 往上看
  // 探身：放完望远镜 0.25 秒起往城里走，走到以后蹲下
  let walked = 0;
  let crouch = 0;
  let step = 0;
  let stride = 0;
  if (leaners.includes(i)) {
    const walkStart = reaction.lowerScope + reaction.lowerScopeDur + 0.25 + 0.3 * jitter01(i, 9);
    const walkSec = leanWalkDist / walkSpeed;
    walked = Math.min(1, Math.max(0, (t - walkStart) / walkSec)) * leanWalkDist;
    step = (walked / 0.2158) * 0.86; // 走路 limbSwingAmount 约 0.86（0.2158 × 4），步每刻加这么多
    stride = t > walkStart && t < walkStart + walkSec ? 0.86 * Math.min(1, (t - walkStart) / 0.15, (walkStart + walkSec - t) / 0.15) : 0;
    crouch = ss((t - walkStart - walkSec - 0.05) / 0.12);
  }
  const pos = sub(guardPositions[i], [0, walked, 0]);
  const feet = add(borderTownPos, pos);
  const bodyYaw = yawFromTo(feet, shaftMouth()) + 7 * jitter(i, 5);
  const pitPitch = -pitchTo(add(feet, [0, 0, 1.62 - 0.35 * crouch]), shaftMouth()) + 5 * jitter(i, 1) + 6 * crouch; // 正 = 低头；蹲着探身再多低一点
  const scopeK = ss((t - reaction.lowerScope) / reaction.lowerScopeDur);
  const headK = ss((t - reaction.lookDown) / reaction.lookDownDur);
  let headYaw = (7 * jitter(i, 2) + 3 * Math.sin(t * (0.6 + 0.5 * jitter01(i, 3)) + i)) * headK;
  let headPitch = lerp(-skyPitch, pitPitch, headK);
  const lookTarget = headTurners[i];
  if (lookTarget !== undefined) {
    const glanceStart = reaction.lookDown + reaction.lookDownDur + 0.35 + 0.3 * jitter01(i, 10);
    const k = ss((t - glanceStart) / 0.3) * (1 - ss((t - glanceStart - 1.1) / 0.4));
    const neighborYaw = yawFromTo(feet, guardFeet(lookTarget)) - bodyYaw; // 看邻居要转多少（相对身子）
    headYaw = lerp(headYaw, Math.max(-70, Math.min(70, neighborYaw)), k);
    headPitch = lerp(headPitch, 2, k);
  }
  return { raiseSpyglass: 1 - scopeK, headPitch, headYaw: headYaw, bodyYaw: bodyYaw, pos: pos, crouch, limbSwing: step, stride, capeLift: stride * 12, present: true };
};
// 出发：黄叛喊完，一排卫兵各自从站的地方往南跑过走道，从内沿直接跳下城墙，落进墙脚的落水池，蹚到池沿爬上岸，沿环城路往西跑向城门大街（用户 10-19 定：不走楼梯，跳进水池）。
// 一个个先后跳（用户 10-12 嫌卫兵齐步太人机）：起步各自错开 0～0.5 秒（蹲着探身的 1、4、6 号先站起来，但离内沿近）；1 号跑到沿上迈出去，别的在沿上一跳；落点离墙 2.4～3.7 米、东西各偏一点。
// 错开收紧到起跳 0.5 秒、落水 0.85 秒以内（用户 10-19 嫌最后一个拖太久）；迈出去比跳下去早落水 0.3 秒，所以只让最先起跳的 1 号迈：谁先跳谁先落水，跳下镜、落水镜的先后对得上。
// 走道上原版疾跑 5.6 米/秒，起步 0.25 秒加到全速（离内沿两三米，要落进 4 米宽的池子不能冲快）。跳下去、落水、上岸见 编排/落水.ts，上了路 20 米/秒。
// 跑的时候不举镜、抬头看路，披风往后扬（原版 CapeLayer 最多扬 75°）
const sprintSpeed = 5.6;
const walkwayRampSec = 例外('起停', 0.25, { 段: '6-二人登场', 原因: '卫兵走道起步；用户 10-21 定按看过的版本，RAMP_SEC 的原话是针对古城说的' });
const capeAt = (speed: number) => Math.min(75, (40 * speed) / sprintSpeed);
const guardStartSec = (i: number) => cues.出发 + 0.3 * jitter01(i, 11) + 0.02 * i + (leaners.includes(i) ? 0.45 : 0); // 蹲着探身的先站起来
const hoppers = [0, 2, 3, 4, 5, 6, 7, 8]; // 在内沿上一跳；1 号跑到沿上直接迈出去
const runDistAt = (elapsed: number) => (elapsed < walkwayRampSec ? (sprintSpeed * elapsed * elapsed) / (2 * walkwayRampSec) : sprintSpeed * (elapsed - walkwayRampSec / 2));
const guardJumps = guardPositions.map((_, i): { from: V3; to: V3; jump: PoolJump } => {
  const from = guardStanding(cues.出发, i).pos;
  const hop = hoppers.includes(i);
  const takeoffY = hop ? 197.2 : 196.7; // 跳：碰撞箱还踩着内沿就起跳；迈：碰撞箱整个离开内沿才往下掉
  const x = from[0] + 0.5 * jitter(i, 18) + (i === 0 ? 0.8 : 0); // 0 号让开刚跳下去的黄叛（x 23.3）
  const to: V3 = [x, takeoffY, from[2]];
  const runDist = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const takeoffSec = guardStartSec(i) + (runDist < (sprintSpeed * walkwayRampSec) / 2 ? Math.sqrt((2 * walkwayRampSec * runDist) / sprintSpeed) : runDist / sprintSpeed + walkwayRampSec / 2);
  const vz0 = hop ? 0.42 : 0;
  const drop = (hop ? 2.8 : 2.4) + 0.9 * jitter01(i, 19);
  return { from, to, jump: poolJump({ takeoffSec, x, y: takeoffY, vz0, vh0: vhForDrop(drop, vz0), wadeDelay: 0.12 + 0.25 * jitter01(i, 20), topSpeed: chaseSpeed.卫兵 }) };
});
export const guardPoolJump = (i: number) => guardJumps[i].jump;
// 走道上跑向内沿
const guardRunning = (t: number, i: number): GuardPose => {
  const { from, to } = guardJumps[i];
  const elapsed = t - guardStartSec(i);
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const dist = Math.min(runDistAt(elapsed), len);
  const pos = lerp3(from, to, len > 0 ? dist / len : 1);
  const heading = yawFromTo(from, to);
  const standing = guardStanding(t, i);
  const k = ss(elapsed / 0.25);
  const turnDelta = ((((heading - standing.bodyYaw) % 360) + 540) % 360) - 180;
  return {
    raiseSpyglass: 0, headPitch: lerp(standing.headPitch, 14, k), headYaw: standing.headYaw * (1 - k), bodyYaw: standing.bodyYaw + turnDelta * k, pos,
    crouch: standing.crouch * (1 - ss(elapsed / 0.1)), limbSwing: standing.limbSwing + dist / 0.28, stride: k, capeLift: 40 * k, present: true,
  };
};
// 离开内沿以后：空中往下看着水池，步子收住、披风被风掀起；水里蹚着走，披风湿着垂下；上岸、路上照跑
const guardInPool = (t: number, i: number): GuardPose => {
  const { from, to, jump } = guardJumps[i];
  const s = jump.at(t);
  const sinceTakeoff = t - jump.takeoffSec;
  const runLimb = guardStanding(jump.takeoffSec, i).limbSwing + Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.28;
  const limbSwing = runLimb + s.cycles * LIMB_SWING_PER_CYCLE;
  const pace = Math.min(1, s.speed / sprintSpeed);
  const base = { raiseSpyglass: 0, headYaw: 0, bodyYaw: s.heading, pos: s.pos, crouch: 0, limbSwing, present: true };
  if (s.phase === '空中') {
    const k = ss(sinceTakeoff / 0.4);
    return { ...base, headPitch: lerp(14, 38, k), stride: lerp(1, 0.25, k), capeLift: lerp(40, 28, k) };
  }
  if (s.phase === '水里') return { ...base, headPitch: 12, stride: 0.25 + 0.6 * pace, capeLift: 0 };
  const lean = s.phase === '路上' ? runLean(s.speed) : 0;
  return { ...base, headPitch: 8 - lean, stride: Math.max(0.3, pace), capeLift: capeAt(s.speed), lean };
};
// 坑口（6-3-10）：卫兵被两人甩在后面跑来，在坑口散开、各自停在坑沿外一个位置（井心外 6～7.5 格，北边正中留给两人起跳），转身对着井口往下看；离井口近的几个潜行蹲下探身。卫兵不下井。
// 到的先后：绕得少的（北边两侧）先到，第一个在 `cues.卫兵到`。20 米/秒（用户 10-20），最后 `RAMP_SEC` 刹住。
// 停在北半边的从北边大街上一个点直线跑过去；绕到南半边的（|角| ≥ 80）沿大街两侧离井心 8.6 格的道跑下来，到自己停的地方北边 3 格再斜着收进去，不从先到的人身上穿过去
const pitAngles = [-30, 30, -55, 55, -80, 80, -100, 100, -120]; // 度，0 = 正北，正 = 往东
const outerLane = 8.6; // 大街 x ±12，路灯在 x −11、10
// 坑面高度（城的石半砖顶面以上多少米；井口、表外 = 0），脚踩在这上面
const groundHeight = (x: number, y: number) => {
  const center = shaftMouth();
  const heights = (pitSurfaceTable as unknown as { 高: (number | null)[][]; 半宽: number }).高;
  const i = Math.round(x - center[0]) + 11;
  const j = Math.round(y - center[1]) + 11;
  const height = heights[i]?.[j];
  return typeof height === 'number' ? Math.max(height, -2) : 0;
};
// 离停下还有 s 秒时：还剩多少路、多快、步态周期数（倒着算）
const pitRun = speedProfile([[0, 0], [RAMP_SEC, chaseSpeed.卫兵]]);
// 折线 path（path[0] 是停的位置，往后是来路）上离停的位置还有 d 米的点
const pointBack = (path: V3[], d: number): V3 => {
  let left = Math.max(0, d);
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1];
    const b = path[k];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= len || k === path.length - 1) return lerp3(a, b, len > 0 ? Math.min(1, left / len) : 0);
    left -= len;
  }
  return path[0];
};
const pitSpot = (i: number) => {
  const center = shaftMouth();
  const angle = pitAngles[i % pitAngles.length] * D2R;
  const radius = 6.0 + 1.5 * jitter01(i, 12);
  const stop: V3 = [center[0] + Math.sin(angle) * radius, center[1] + Math.cos(angle) * radius, 0];
  // 到的先后：按绕的角度排（|角| 小的先到）
  const order = [...pitAngles].map(Math.abs).sort((p, q) => p - q).indexOf(Math.abs(pitAngles[i]));
  const arriveSec = cues.卫兵到 + 0.17 * order + 0.2 * jitter01(i, 13);
  // 起点：北边大街上，按到的时刻往后推满这一路（切坑时离井心 45～65 米）
  const pathLen = pitRun(arriveSec - cues.切坑).dist;
  const bend: V3 | null = Math.abs(pitAngles[i]) >= 80 ? [center[0] + Math.sign(stop[0] - center[0]) * outerLane, stop[1] + 3, 0] : null;
  const lead = bend ?? stop;
  const startX = bend ? bend[0] : center[0] + 0.8 * (stop[0] - center[0]) + 1.5 * jitter(i, 14);
  const rest = pathLen - (bend ? Math.hypot(stop[0] - bend[0], stop[1] - bend[1]) : 0);
  const dy = Math.sqrt(Math.max(1, rest * rest - (lead[0] - startX) ** 2));
  const path: V3[] = [stop, ...(bend ? [bend] : []), [startX, lead[1] + dy, 0]];
  return { stop, path, arriveSec, r: radius };
};
const PIT_SPOTS = guardPositions.map((_, i) => pitSpot(i));
const guardAtPit = (t: number, i: number): GuardPose => {
  const center = shaftMouth();
  const spot = PIT_SPOTS[i];
  const timeLeft = Math.max(0, spot.arriveSec - t); // 离停下还有几秒
  const run = pitRun(timeLeft);
  const speedFrac = run.speed / chaseSpeed.卫兵;
  const lean = runLean(run.speed);
  const [x, y] = pointBack(spot.path, run.dist);
  const pos: V3 = sub([x, y, groundZ + groundHeight(x, y)], borderTownPos);
  // 跑的方向：前后各看 0.8 米（拐弯不一下子拧过去）
  const runYaw = yawFromTo(pointBack(spot.path, run.dist + 0.8), pointBack(spot.path, run.dist - 0.8));
  const shaftYaw = yawFromTo([x, y, 0], center);
  const stopK = ss((t - spot.arriveSec + 0.1) / 0.35);
  const yawDelta = ((((shaftYaw - runYaw) % 360) + 540) % 360) - 180;
  const isNear = spot.r < 6.7; // 离井口近的蹲下探身
  const crouch = isNear ? ss((t - spot.arriveSec - 0.35) / 0.12) : 0;
  const lookDown = Math.atan2(1.62, Math.max(spot.r - 2, 1)) / D2R + 10;
  return {
    raiseSpyglass: 0, headPitch: lerp(6, lookDown + 6 * jitter(i, 15), stopK) - lean, headYaw: 6 * jitter(i, 16) * stopK, bodyYaw: runYaw + yawDelta * stopK,
    pos: pos, crouch, limbSwing: (pitRun(spot.arriveSec - cues.切坑).cycles - run.cycles) * LIMB_SWING_PER_CYCLE + 37 * i, stride: speedFrac, capeLift: capeAt(run.speed), present: true, lean,
  };
};
export const guardPoseAt = (t: number, i: number): GuardPose => {
  if (t >= cues.切坑) return guardAtPit(t, i);
  if (t >= guardJumps[i].jump.takeoffSec) return guardInPool(t, i);
  if (t >= guardStartSec(i)) return guardRunning(t, i);
  return guardStanding(t, i);
};
// 发望远镜收起声的时刻（剧情秒）：同 卫兵 里放下望远镜的那一刻
export const guardLowerSec = (i: number) => guardReaction(i).lowerScope;
export { guardPositions as 卫兵位置 };
