// 7-4-1 风筝的整段戏：马、刘心忠、监守者、迫击炮、风矢、音爆、黄叛，全是剧情时刻 T（秒，追逐.ts 的时间轴）的函数；成片每圈取一截（编排.ts）。
// 原版依据同 ../7-3/戏.ts 文件头：骑着的马朝向跟骑手；迫击炮瞬发、投射物不继承施法者速度；监守者击退抗性 1、挨打不打断音爆、音爆穿墙；
//   用户 10-18 定：监守者边跑边蓄、边跑边放（第 34 刻放出），瞄的是 0.1 秒前看见的马上的人（马 50 米/秒，打在马身后）。
// 每圈：它在西环道上追近，刘心忠回身往它身上放两炮（离它十几米，飞两三刻）；它跑过西环道那一截（黄叛在传送门顶上看得见的只有这截）挨一串 6 支风矢，
//   0.13～0.22 秒一支（7-3-3「拉满只要 0.2 秒」）；成片第 2、4 圈马跃上台面时它放音爆，打在马身后。
// 第 0 圈（T = 0 马在西北角）它还在从 7-3 的塔脚绕回来的路上（不演，约 T 0.8 才从西台阶上到西环道），西环道上挨打、成片取的圈都从第 1 圈起（`firstLap`）。
// 血量：进本段时的血从 7-1 的血账（../7-1/戏/伤害.ts）减去 7-3 那几下算出来；本段每一下都按 T 排好、各有伤害（`hits`），累计够了的那一支就是最后一箭（`deathT`）。
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { rng } from '@engine/model/parts.tsx';
import type { FigurePose } from '@库/角色/骨架.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import { drawBowPose, ridePose } from '../../../角色/追兵.tsx';
import { horseGait, riderFeet, steedRear, steedStand } from '@库/生物/幽灵马.tsx';
import { mortarTrajectory } from '@库/特效/苦力怕迫击炮.tsx';
import { vanillaToppleAngle } from '@库/特效/原版死亡.tsx';
import { WARDEN, pinToWardenBody, wardenBodyHit, wardenBodyPinAt, wardenBodyPoint, type BodyPin, type WardenFrame } from '@库/生物/监守者.tsx';
import { bowPointWorld, BOW_ARROW_TIP, bowTextureFor, type BowTexture } from '@库/物品/弓.tsx';
import { ARROW } from '@库/物品/箭.tsx';
import { nearYaw, toScene, yawTo } from '../../../地点/古城4x/6-4-1/古城戏.ts';
import { footOf } from '../../../地点/古城4x/布局.ts';
import * as X73 from '../../../地点/古城4x/7-3/戏.ts';
import { wardenHpAt } from '../../../地点/古城4x/7-1/戏/伤害.ts';
import { fanSize } from '../../../地点/古城4x/7-1/戏/黄叛.ts';
import type { 弓前风扇 } from '../../../地点/古城4x/7-1/弓前风扇.tsx';
import * as geom from './几何.ts';
import * as chase from './追逐.ts';

export const FPS = geom.FPS;
const ss = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const g2s = (p: number[]): V3 => toScene(p[0], p[1], p[2]);
const yawOfHeading = ([dx, dz]: [number, number]) => yawTo(dx, -dz);

// ======================= 黄叛：传送门顶上西沿，整段不动 =======================
const huangFoot = footOf(geom.huangSpot);
export const huangFeet = (_T: number): V3 => huangFoot;

// ======================= 血 =======================
const hits73 = [...X73.mortarDamages, X73.arrowDamage];
export const hpAtStart = Math.round((wardenHpAt(Infinity) - hits73.reduce((a, b) => a + b, 0)) * 10) / 10;

// ======================= 位置（死之前的跑法和勒不勒马无关） =======================
const draft = chase.simulate();
const horseAtS = (s: number) => g2s(geom.horseGame(s));
const wardenAtS = (s: number) => g2s(geom.wardenGame(s));
const liveWarden = (T: number) => wardenAtS(chase.wardenS(T));
// 马每一跃离地的时刻（起跳人立，幽灵马.tsx 的 `steedStand`）：每圈两跳的起点；勒马停住以后没跑到的不算
const takeoffsOf = (c: chase.Chase, lastT: number): number[] => {
  const out: number[] = [];
  const reach = c.horseS(lastT);
  for (let n = 0; n * geom.horseLoop.len <= reach; n++) {
    for (const leap of geom.leaps) {
      const s = n * geom.horseLoop.len + leap.s0;
      if (s > reach) return out;
      let lo = 0;
      let hi = lastT;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if (c.horseS(mid) < s) lo = mid;
        else hi = mid;
      }
      out.push(hi);
    }
  }
  return out;
};
const eyeOf = (horseFeet: V3, yaw: number, rear: number): V3 => {
  const feet = riderFeet(horseFeet, yaw, rear);
  return [feet[0], feet[1], feet[2] + 1.62];
};
const draftTakeoffs = takeoffsOf(draft, 60);
const draftLiuEye = (T: number): V3 => {
  const s = draft.horseS(T);
  return eyeOf(horseAtS(s), yawOfHeading(geom.horseLoop.heading(s)), steedStand(draftTakeoffs, T - 1 / 20));
};

export const firstLap = 1;
// ======================= 音爆：成片第 2、4 圈马跃上台面的半空中放出 =======================
const boomLaps = [firstLap + 1, firstLap + 3];
export const boomFireTs = boomLaps.map((n) => (chase.horseLapS(n, '起跳') + 0.6 * (geom.horseMarks.上台 - geom.horseMarks.起跳)) / chase.horseSpeed);
export const boomStarts = boomFireTs.map((t) => t - WARDEN.sonicBoomHitSec);
const aimLagSec = 0.1;

// 监守者身子的朝向（不含挨打一抖）：顺着环道往前跑；放音爆前 0.35 秒拧向马上的人
const bodyYaw = (T: number) => {
  const run = yawOfHeading(geom.wardenLoop.heading(chase.wardenS(T)));
  const w = liveWarden(T);
  const eye = draftLiuEye(T);
  const toLiu = nearYaw(run, yawTo(eye[0] - w[0], eye[1] - w[1]));
  const aim = Math.max(0, ...boomFireTs.map((t) => ss((T - t + 0.35) / 0.25) * (1 - ss((T - t - 0.1) / 0.3))));
  return lerp(run, toLiu, aim);
};
const liveFrame = (T: number): WardenFrame => {
  const boomStart = [...boomStarts].reverse().find((t) => T >= t && T < t + WARDEN.sonicBoomSec);
  return { p: liveWarden(T), entityYaw: bodyYaw(T) + 180, 前倾: 18, props: { 秒: T, 音爆: boomStart === undefined ? undefined : T - boomStart } };
};

// ======================= 风矢（同 6-4-3、7-1-5：1000 米/秒，弓前化出鼓风机虚影） =======================
export const arrowSpeed = 1000;
const huangHeight = 1.875;
export type 一箭 = { 放: number; 中: number; 起: V3; 落: V3; dir: V3; 钉: V3; yaw: number; 俯仰: number; 圈: number; 串首: boolean };
const makeArrow = (releaseT: number, lap: number, first: boolean): 一箭 => {
  const eye: V3 = [huangFoot[0], huangFoot[1], huangFoot[2] + 1.62];
  const target = wardenBodyPoint(liveFrame(releaseT), 0.3);
  const delta = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
  const yaw = yawTo(delta[0], delta[1]);
  const pitch = (Math.atan2(delta[2], Math.hypot(delta[0], delta[1])) * 180) / Math.PI;
  const start = bowPointWorld(drawBowPose(huangFoot, yaw, 0, pitch, 1), huangHeight, 'L', BOW_ARROW_TIP.弓拉2);
  const hitT = releaseT + Math.hypot(target[0] - start[0], target[1] - start[1], target[2] - start[2]) / arrowSpeed;
  const aim = wardenBodyPoint(liveFrame(hitT), 0.3);
  const d = [aim[0] - start[0], aim[1] - start[1], aim[2] - start[2]];
  const n = Math.hypot(d[0], d[1], d[2]);
  const dir: V3 = [d[0] / n, d[1] / n, d[2] / n];
  const surface = wardenBodyHit(liveFrame(hitT), start, dir) ?? aim;
  const tipIn = ARROW.tipAhead - 0.12; // 箭尖扎进身子 0.12 格
  const stuck: V3 = [surface[0] - dir[0] * tipIn, surface[1] - dir[1] * tipIn, surface[2] - dir[2] * tipIn];
  return { 放: releaseT, 中: hitT, 起: start, 落: surface, dir, 钉: stuck, yaw, 俯仰: pitch, 圈: lap, 串首: first };
};
// 每圈它在西环道上往南跑的时候放一串 6 支，命中时它在 z `arrowHitZ`：西环道里沿每隔 7 米一根柱子，从门顶看过去只有几截看得见它整个上身
//   （方块.py 逐 0.25 格查：z 206～212、215～222、225～228、231～235.5、238～243、245.5～257.5、259.5～262.5、266～268.5），每支都落在这几截里，间隔 0.13～0.22 秒
export const arrowHitZ = [210, 220, 232, 241, 251.5, 261];
// 它第 n 圈在西环道上走到 z 是哪一刻
const wardenTAtZ = (n: number, z: number) => {
  let lo = 0;
  let hi = 70;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (geom.wardenLoop.at(mid)[1] < z) lo = mid;
    else hi = mid;
  }
  return chase.wardenTAt(chase.wardenLapS(n, (lo + hi) / 2));
};
const laps = Array.from({ length: 6 }, (_, i) => firstLap + i); // 算 6 圈，实际成片第 5 圈就打死
const allArrows = laps.map((n) => arrowHitZ.map((z, j) => makeArrow(wardenTAtZ(n, z) - 0.04, n, j === 0))).flat();

// ======================= 苦力怕迫击炮：每圈在西环道上回身两发，砸在追上来的它身上 =======================
// 解弹道同 7-3（第 k 刻正好落在它胸口），出手不超过 2 格/刻（用户 10-18 定动画里搞快），取飞得最短的那条；
// 炸在它身上时它在 z `mortarHitZ`（两支风矢之间，离前后的箭中都有 0.07 秒以上，两个数字不叠在一起）
export const mortarShotSpeed = 2.0;
export const mortarHitZ = [226, 236.5];
const solveMortar = (hitT: number) => {
  const p = liveWarden(hitT);
  const target: V3 = [p[0], p[1], p[2] + 1.6];
  for (let k = 2; k <= 40; k++) {
    const fireT = hitT - k / 20;
    const eye = draftLiuEye(fireT);
    let dir: V3 = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
    let vlen = 0;
    for (let it = 0; it < 8; it++) {
      const norm = Math.hypot(...dir);
      const unit: V3 = [dir[0] / norm, dir[1] / norm, dir[2] / norm];
      const p0: V3 = [eye[0] + unit[0], eye[1] + unit[1], eye[2] + unit[2] - 0.25];
      const v0: V3 = [(target[0] - p0[0]) / k, (target[1] - p0[1]) / k, (target[2] - p0[2] + (0.05 * k * (k - 1)) / 2) / k];
      vlen = Math.hypot(...v0);
      dir = v0;
    }
    if (vlen > mortarShotSpeed + 0.05) continue;
    const trajectory = mortarTrajectory(eye, dir, 1, vlen);
    return { 出T: fireT, 眼: eye, 视线: dir, trajectory, tickCount: k, 中T: hitT, blastPos: trajectory.posAt(k), speed: vlen };
  }
  throw new Error(`迫击炮 ${hitT.toFixed(2)} 秒那一发够不着`);
};
const allMortars = laps.map((n) => mortarHitZ.map((z) => solveMortar(wardenTAtZ(n, z)))).flat();
const allHitTs = [...allArrows.map((a) => a.中), ...allMortars.map((m) => m.中T)].sort((a, b) => a - b);
if (allHitTs.some((t, i) => i > 0 && t - allHitTs[i - 1] < 0.065)) throw new Error('有两下命中隔得太近，数字会叠在一起');

// ======================= 伤害、最后一箭 =======================
// 每一发炮 300、每一支风矢 1500，上下 10%（同 7-3/伤害数字层.tsx）
const rollDamages = (n: number, base: number, seed: number) => {
  const rand = rng(seed);
  return Array.from({ length: n }, () => Math.round(base * (0.9 + 0.2 * rand()) * 10) / 10);
};
type Hit = { T: number; damage: number; crit: boolean; kind: '炮' | '箭'; i: number };
const hitsWith = (seed: number): Hit[] => {
  const md = rollDamages(allMortars.length, 300, seed);
  const ad = rollDamages(allArrows.length, 1500, seed + 1);
  return [
    ...allMortars.map((m, i) => ({ T: m.中T, damage: md[i], crit: false, kind: '炮' as const, i })),
    ...allArrows.map((a, i) => ({ T: a.中, damage: ad[i], crit: true, kind: '箭' as const, i })),
  ].sort((a, b) => a.T - b.T);
};
const killIndexOf = (hits: Hit[]) => {
  let sum = 0;
  for (let i = 0; i < hits.length; i++) {
    sum += hits[i].damage;
    if (sum >= hpAtStart) return i;
  }
  return -1;
};
// 种子从 7411 往上挑第一组：最后一下是风矢（用户要最后一箭打穿），而且在马跃上台面之前（马落台面就勒住，停在台面上回头看它）
const seed = (() => {
  for (let s = 7411; s < 7611; s += 2) {
    const hits = hitsWith(s);
    const k = killIndexOf(hits);
    if (k < 0 || hits[k].kind !== '箭') continue;
    const T = hits[k].T;
    const lap = Math.floor((chase.horseSpeed * T - geom.horseMarks.上台) / geom.horseLoop.len) + 1;
    if (T < chase.horseLapS(lap, '上台') / chase.horseSpeed - 0.15) return s;
  }
  throw new Error('挑不出最后一下是风矢的伤害种子');
})();
const allHits = hitsWith(seed);
const killIndex = killIndexOf(allHits);
export const deathT = allHits[killIndex].T;
export const hits = allHits.slice(0, killIndex + 1);
export const arrows = allArrows.filter((a) => a.中 <= deathT);
export const mortars = allMortars.filter((m) => m.中T <= deathT);
export const booms = boomFireTs.filter((t) => t < deathT).map((fireT) => ({ fireT, origin: liveWarden(fireT), target: draftLiuEye(fireT - aimLagSec) }));
export const hpBefore = (T: number) => hpAtStart - hits.filter((h) => h.T < T).reduce((s, h) => s + h.damage, 0);
// 最后一下在第几圈（0 起，和马、它的圈号一致）
export const killLap = allArrows[allHits[killIndex].i].圈;

// ======================= 马 =======================
export const run = chase.simulate(deathT);
const horseLegMaxRate = (2 * Math.PI * 5) / 0.6662; // 同 7-3：一秒最多 5 个步子
const wardenLegMaxRate = (2 * Math.PI * 4.5) / 0.8662;
const phaseTable = (rate: (T: number) => number, lastT: number) => {
  const step = 1 / 240;
  const table = [0];
  for (let t = 0; t < lastT; t += step) table.push(table[table.length - 1] + rate(t + step / 2) * step);
  return (T: number) => {
    const k = Math.min(table.length - 1.001, Math.max(0, T / step));
    const i = Math.floor(k);
    return table[i] + (table[i + 1] - table[i]) * (k - i);
  };
};
export const endStoryT = deathT + 8;
const horseTakeoffs = takeoffsOf(run, endStoryT);
// 死后（原版 LivingEntity 死了照样按地面摩擦 0.6 × 0.91 每刻减速）：带着 60 米/秒顺着环道往前滑 3 格多才停，边滑边倒（原版死亡.tsx）
const groundDrag = 0.6 * 0.91;
const deathS = chase.wardenS(deathT);
const slideAfter = (sec: number) => {
  const perTick = chase.wardenSpeed / 20;
  return (perTick * groundDrag * (1 - groundDrag ** (sec * 20))) / (1 - groundDrag);
};
const deadPos = (T: number) => wardenAtS(deathS + slideAfter(T - deathT));
// 停稳 0.3 秒后勒马转过来朝着它倒下的地方（7-4-2 第一镜举杖从这里接）
export const turnSec = 0.4;
const faceBackT = run.stopT + 0.3;
const horseYaw = (T: number) => {
  const run0 = yawOfHeading(geom.horseLoop.heading(run.horseS(T)));
  if (T < faceBackT) return run0;
  const h = horseAtS(run.stopS);
  const dead = deadPos(deathT + 1);
  return lerp(run0, nearYaw(run0, yawTo(dead[0] - h[0], dead[1] - h[1])), ss((T - faceBackT) / turnSec));
};
const horseTurning = (T: number) => T > faceBackT && T < faceBackT + turnSec;
const horseLegPhase = phaseTable((t) => Math.max(Math.min(1.8 * run.horseV(t), horseLegMaxRate), horseTurning(t) ? 6 : 0), endStoryT);
export const horseState = (T: number) => {
  const p = horseAtS(run.horseS(T));
  const yaw = horseYaw(T);
  const speed = run.horseV(T);
  const amplitude = Math.max(horseGait(speed, 0).幅度 * (1 + 0.5 * ss((speed - 20) / 60)), horseTurning(T) ? 0.3 : 0);
  return { p, yaw, entityYaw: yaw + 180, 行走: { 相位: horseLegPhase(T), 幅度: amplitude }, 速度: speed, 人立: steedRear(horseTakeoffs, T) };
};
export const liuEye = (T: number): V3 => {
  const horse = horseState(T);
  return eyeOf(horse.p, horse.yaw, horse.人立.骑手);
};

// ======================= 监守者 =======================
const arrowHitTs = arrows.map((a) => a.中);
const hitTs = hits.map((h) => h.T);
const wardenLegPhase = phaseTable((t) => (t >= deathT ? 0 : Math.min(4 * chase.wardenSpeed, wardenLegMaxRate)), endStoryT);
const deathFrame = liveFrame(deathT);
export const wardenState = (T: number) => {
  const dead = T >= deathT;
  const frame = dead ? deathFrame : liveFrame(T);
  const p = dead ? deadPos(T) : frame.p;
  const v = dead ? 0 : chase.wardenSpeed;
  const flinch = arrowHitTs.reduce((sum, t) => sum + (T >= t && T < t + 0.6 ? ((T - t) / 0.05) * Math.exp(1 - (T - t) / 0.05) : 0), 0);
  return {
    p,
    entityYaw: frame.entityYaw - 6 * Math.min(1.5, flinch),
    秒: T,
    行走: { 相位: wardenLegPhase(T), 幅度: Math.min(1, v / 5.7) },
    受伤: hitTs.some((t) => T >= t && T < t + 0.5) ? 1 : 0,
    头仰: 0, // 跑起来平视
    音爆: dead ? undefined : frame.props.音爆,
    前倾: (frame.前倾 ?? 0) - 9 * Math.min(1.5, flinch),
    速度: v,
    secSinceDeath: dead ? T - deathT : undefined,
  };
};
export const wardenFrame = (T: number): WardenFrame => {
  const w = wardenState(T);
  return { p: w.p, entityYaw: w.entityYaw, 前倾: w.前倾, props: { 秒: w.秒, 行走: w.行走, headPitch: w.头仰, 音爆: w.音爆 } };
};
export const wardenChest = (T: number): V3 => wardenBodyPoint(wardenFrame(T), 0);
// 倒下（原版死亡.tsx 的 VanillaTopple：在朝向、前倾之后再绕实体前后轴转）：身上的点跟着转
const toppleMatrix = (T: number) => {
  const w = wardenState(T);
  if (w.secSinceDeath === undefined) return undefined;
  const frame = new THREE.Matrix4()
    .makeTranslation(w.p[0], w.p[1], w.p[2])
    .multiply(new THREE.Matrix4().makeRotationZ((w.entityYaw * Math.PI) / 180))
    .multiply(new THREE.Matrix4().makeRotationX((w.前倾 * Math.PI) / 180));
  return frame.clone().multiply(new THREE.Matrix4().makeRotationY(vanillaToppleAngle(w.secSinceDeath))).multiply(frame.invert());
};

// ======================= 炮弹 =======================
export const mortarShells = (T: number) =>
  mortars
    .filter((m) => T >= m.出T && T < m.中T)
    .map((m) => {
      const tick = (T - m.出T) * 20;
      return { at: m.trajectory.drawPos(tick), vel: m.trajectory.drawVelAt(tick) };
    });

// ======================= 刘心忠 =======================
// 头和身子一直对着它（同 7-3）；放炮前 0.3 秒回身、右手连杖往它一指；跑得快伏低
export const liuXinzhongPose = (T: number, extra: Partial<FigurePose> = {}): FigurePose => {
  const horse = horseState(T);
  const chest = wardenState(T).p;
  const eye = liuEye(T);
  const depression = (Math.atan2(eye[2] - chest[2] - 1.6, Math.hypot(chest[0] - eye[0], chest[1] - eye[1])) * 180) / Math.PI;
  const yawToWarden = nearYaw(horse.yaw, yawTo(chest[0] - eye[0], chest[1] - eye[1]));
  const yawOffset = Math.max(-100, Math.min(100, yawToWarden - horse.yaw));
  const look = T >= deathT ? 1 - ss((T - deathT - 1.2) / 0.6) : 1;
  const crouch = ss((horse.速度 - 6.5) / 40);
  const castArm = (t: number) => ss((T - t + 0.3) / 0.25) * (1 - ss((T - t - 0.35) / 0.4));
  const point = Math.max(0, ...mortars.map((m) => castArm(m.出T)));
  const twist = yawOffset * 0.45 * Math.max(point, look * 0.8);
  return ridePose(horse, {
    pitch: -10 * ss(horse.速度 / 6.5) - 16 * crouch,
    headPitch: lerp(4, -Math.min(50, depression), look),
    headYaw: Math.max(-70, Math.min(70, (yawOffset - twist) * look)),
    twist,
    armR: lerp(36, 85 - depression * 0.6, point),
    ...extra,
  });
};

// ======================= 黄叛 =======================
// 一串里每支拉 0.18 秒就放（串首那支从 0.35 秒前举弓），放完立刻搭下一支；瞄的方向在相邻两支之间转过去。一串打完弓慢慢放低，身子转到下一串第一支的方向。
const drawLead = (i: number) => (arrows[i].串首 ? 0.35 : arrows[i].放 - arrows[i - 1].放 - 0.02);
export const huangPanState = (T: number): { pose: FigurePose; bow: BowTexture } => {
  const i = arrows.findIndex((a) => a.放 > T);
  const cur = i < 0 ? arrows[arrows.length - 1] : arrows[i];
  const prev = i < 0 ? cur : i > 0 ? arrows[i - 1] : undefined;
  const drawStart = i < 0 ? Infinity : cur.放 - drawLead(i);
  if (i >= 0 && T >= drawStart) {
    // 拉弓
    const k = (T - drawStart) / (cur.放 - drawStart);
    const fromYaw = cur.串首 || !prev ? cur.yaw : nearYaw(cur.yaw, prev.yaw);
    const fromPitch = cur.串首 || !prev ? cur.俯仰 : prev.俯仰;
    const yaw = lerp(fromYaw, cur.yaw, ss(k * 1.6));
    const pitch = lerp(fromPitch, cur.俯仰, ss(k * 1.6));
    const draw = cur.串首 ? ss((k - 0.35) / 0.65) : ss(k);
    return { pose: drawBowPose(huangFoot, yaw, 0, pitch, Math.max(draw, 0.0001)), bow: bowTextureFor(true, T - drawStart) };
  }
  // 一串打完（或第一串之前）：放完拉弦手一甩、弓慢慢放低，转向下一串
  const last = prev ?? cur;
  const after = T - last.放;
  const lower = prev ? ss((after - 0.15) / 0.5) : 1;
  const nextYaw = i >= 0 ? nearYaw(last.yaw, cur.yaw) : last.yaw;
  const turn = i >= 0 && prev ? ss((T - (last.放 + 0.6)) / Math.max(0.3, drawStart - last.放 - 0.6)) : i >= 0 ? 1 : 0;
  const yaw = lerp(last.yaw, nextYaw, turn);
  let pose: FigurePose = drawBowPose(huangFoot, yaw, 0, lerp(last.俯仰, i >= 0 ? cur.俯仰 : last.俯仰, turn), Math.max(1 - lower, 0.0001));
  if (lower >= 1) pose = { ...standPose(huangFoot), yaw, headPitch: lerp(last.俯仰, i >= 0 ? cur.俯仰 : last.俯仰, turn), armL: 25, armLRoll: 4, armR: 12, armRRoll: 6, elbowR: 15 };
  const rel = prev ? ss(after / 0.12) * (1 - lower) : 0;
  if (rel > 0) pose = { ...pose, armR: pose.armR - 15 * rel, armRYaw: (pose.armRYaw ?? 0) * (1 - rel) - 25 * rel, elbowR: 25 * rel };
  return { pose, bow: bowTextureFor(false, 0) };
};
// 鼓风机虚影和风道（同 7-1、7-3，画法见 ../7-1/弓前风扇.tsx）：每一支都开；随拉弓化出、放箭后 0.15 秒散
export const fansAt = (T: number): 弓前风扇[] =>
  arrows.flatMap((arrow, i) => {
    const lead = drawLead(i);
    const visibility = ss((T - (arrow.放 - lead)) / 0.08) * (1 - ss((T - arrow.放) / 0.15));
    if (visibility <= 0) return [];
    const off = ARROW.tipAhead + 0.04 + fanSize / 2;
    const center: V3 = [0, 1, 2].map((k) => arrow.起[k] + arrow.dir[k] * off) as V3;
    const mouth: V3 = [0, 1, 2].map((k) => center[k] + (arrow.dir[k] * fanSize) / 2) as V3;
    return [{ 显: visibility, dir: arrow.dir, 心: center, 口: mouth, 边长: fanSize, 转起: arrow.放 - lead, 风停: arrow.放 + 0.15, 转速: 256, 快放: 880, 种子: 7461 + 2 * i }];
  });
export const flyingArrows = (T: number) =>
  arrows
    .filter((a) => T >= a.放 && T < a.中)
    .map((a) => {
      const k = (T - a.放) / (a.中 - a.放);
      return { p: [lerp(a.起[0], a.钉[0], k), lerp(a.起[1], a.钉[1], k), lerp(a.起[2], a.钉[2], k)] as V3, dir: a.dir };
    });

// ======================= 身上插着的箭 =======================
// 7-1、7-3 留下的（按 7-3-3 末帧钉在身子上的位置接着），加上本段已经射中的；都跟着身子走
const oldPins = X73.stuckArrows(X73.endT).map((a) => pinToWardenBody(X73.wardenFrame(X73.endT), a.p, a.dir));
const freshPins = new Map<number, BodyPin>();
const freshPin = (i: number) => {
  if (!freshPins.has(i)) freshPins.set(i, pinToWardenBody(liveFrame(arrows[i].中), arrows[i].钉, arrows[i].dir));
  return freshPins.get(i)!;
};
export const stuckArrows = (T: number) => {
  if (T >= deathT + 1) return [];
  const frame = wardenFrame(T);
  const topple = toppleMatrix(T);
  const fresh = arrows.map((a, i) => (T >= a.中 ? freshPin(i) : null)).filter((p): p is BodyPin => p !== null);
  return [...oldPins, ...fresh].map((pin) => {
    const at = wardenBodyPinAt(frame, pin);
    if (!topple) return at;
    return { p: new THREE.Vector3(...at.p).applyMatrix4(topple).toArray() as V3, dir: new THREE.Vector3(...at.dir).transformDirection(topple).toArray() as V3 };
  });
};
// 白烟（死后 1 秒）在它滑停、倒平的地方
export const deathPos = (): V3 => wardenState(deathT + 1).p;
