// 6-2-4 出发：时间轴、人物、扫帚、镜头，纯函数，输入帧号 f（0 = 段首 = 29.1；24 帧/秒，共 `segmentFrames('6-2-4')` 帧）。
// 故事（脚本 正篇/06-古城寻卷/脚本规划.md 第 2 场、「室内转室外」）：基地工坊里，李樱把结构指南针递给九胡，九胡伸右手接过去、低头看一眼，之后一直握在右手里
// （用户 10-20：「这边是九胡导航，所以前一段时间理应把指南针递给九胡，而不是自己收起来」；握法见 模型/角色/九胡持指南针.tsx），
// 李樱唤出扫帚，二人跨上去（李樱在前、九胡在后），扫帚离地一点、原地转向西墙的门，镜头绕到扫帚后面；
// 扫帚往前一冲，从西墙的门飞出去，出了门扫帚头往上一抬、往上窜，尾巴的草束迎着镜头扫上来，盖满整个画面——这一帧就是 6-2-5 的首帧（遮挡转场）。
// 台词：九胡坐稳后一句「九胡导航」，开口帧在 出发.tsx 的 `lineCues`。
// 门（10-12 剪映注释：房间至少给一个出口，不要钻屋顶；用户定「不要还走一段路，直接飞」）：出发朝向（西北偏西）那面西墙开了一道门
// （基地工坊.布局.ts：本地 y 1～3、3 格宽、3 格高，门框是两边的云杉原木柱和上面一道去皮云杉横梁），扫帚离地只升到 1.25 格（人头顶约 2.65 格，门洞顶 3 格），对着门口冲出去，出了门才抬头往上窜。
// 卡点（`frameInSegment('6-2-4', [bar, beat])`，配乐表 src/配乐/第六章飞行.ts；音乐对齐等画面定稿再统一对）：
//   29.1 递指南针；30.1 跨上扫帚；31.1 扫帚离地；32.4 扫帚正好穿过门口；末帧 = 33.1 前一帧 = 6-2-5 首帧。
// 场景：模型/场景/基地工坊.tsx（按场景描述用游戏方块摆的房间），摆在主世界-116 基地小岛的真实地形上（模型/场景/基地小岛.tsx：岛东南部，不转向，东墙、南墙的大窗正对东、南）。
// 房间按本地坐标写，屋子正中 (0, 0) 唤出扫帚，扫帚头先朝本地 +Y（北）。
// 末帧（草束盖满画面）= 6-2-5 首帧：草束贴着镜头、看不到别的东西，所以只要扫帚和镜头的相对位置、扫帚相对太阳的朝向一样，两帧就一样，不用在同一个地方。
// 相对位置：镜头 3 推到草束末端后面，同 6-2-5 的 `FIRST_CAM` 偏移；朝向：扫帚离地后在屋里原地转到 6-2-5 首帧的朝向；灯用 6-2-5 的 `FlightSky`（日光 `SUN_OW` 在世界坐标里固定）。
// 只读引用 6-2-5 的 `broom(0)` / `riders(0)`，不改 6-2-5：它的航线改了，这里重渲染就跟着变（扫帚转的角度变，屋里的东西不变）。
import { sample } from '../../../../engine/anim/anim.ts';
import type { V3 } from '../../../../engine/model/parts.tsx';
import { handPosition, standPose, type FigurePose } from '../../../../world/角色/骨架.tsx';
import type { RideJiuhu, RideLiYing } from '../../../../world/角色/骑扫帚.tsx';
import { BROOM } from '../../../../world/物品/扫帚.tsx';
import * as THREE from 'three';
import type { BonePose } from '../../../../engine/model/基岩模型.tsx';
import { jiuhuStandBones } from '../../../../world/角色/九胡.tsx';
import { COMPASS_SCALE, jiuhuCompassMatrix } from '../../../../world/角色/九胡持指南针.tsx';
import { segmentFrames, frameInSegment } from '../../../../world/配乐/配乐音轨.tsx';
import { roomOrigin, roomHeading } from '../../../../world/地点/基地小岛.tsx';
import { overworldWindowView } from '../../../../engine/voxel/主世界地形.ts';
import * as choreo625 from '../../../../world/地点/边城/6-2-5/编排.ts';

export const segmentId = '6-2-4';
export const FRAMES = segmentFrames(segmentId);
const beatFrame = (bar: number, beat: number) => frameInSegment(segmentId, [bar, beat]);
export const beats = {
  递: 0, // 29.1 李樱把指南针递给九胡（从 6-2-3 末帧递出的半途接着往她面前送，第 12 帧送到）
  receive: 4, // 九胡低头看、伸右手去接
  handoff: 16, // 九胡的手托住指南针（14～18 两只手都在上面，指南针从他手上换到她手上）
  release: 18, // 李樱松手、手放下；九胡把指南针收到身前低处
  lookUp: 40, // 九胡看完抬头
  summon: 50, // 扫帚冒出来
  跨上: beatFrame(30, 1), // 30.1 跨上扫帚这一拍（李樱正蹲身起跳，4 帧后落座）
  liYingMount: beatFrame(30, 1) + 4, // 30.1 李樱跳上前座（落座那一帧）
  jiuHuUp: beatFrame(30, 1) + 20,
  seated: beatFrame(30, 1) + 36,
  liftOff: beatFrame(31, 1), // 31.1 扫帚慢慢离地、原地转向门口，镜头开始绕到后面
  charge: beatFrame(32, 4) - 45, // 转好了，冲之前往下一沉
  rush: beatFrame(32, 4) - 39, // 往门口冲（匀加速）
  throughDoor: beatFrame(32, 4), // 32.4 扫帚正好穿过门口（杆中心过西墙中线）
  lastFrame: FRAMES - 1,
};

const ss = (x: number) => { const clamped = Math.min(1, Math.max(0, x)); return clamped * clamped * (3 - 2 * clamped); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const D2R = Math.PI / 180;

// ---------- 6-2-5 首帧（世界坐标），末帧要和它一模一样 ----------
const END = choreo625.broom(0);
const END_RIDERS = choreo625.riders(0);

// ---------- 扫帚（本地坐标） ----------
const wrap = (a: number) => a - 360 * Math.round(a / 360);
const HOVER = 0.65; // 唤出后悬停：杆中心离地 0.65 格（同 6-1-3）
const SETTLE = 0.25; // 坐稳以后再升一点
// 31.1～蓄力 慢慢升到这个高度：要从门里飞出去，门洞顶 3 格，人坐在杆上头顶比杆高约 1.4 格，1.25 格时头顶约 2.65 格，离门楣 0.35 格；再低，脚就要擦地（脚比杆低约 0.45 格）
const LIFT = 1.25;
const DIP = 0.1; // 冲之前往下一沉
export type BroomState = { 位置: V3; 朝向: number; pitch: number; roll: number; appear: number };
// 不带悬停起伏、不带下沉、不带出门后往上窜的高度（镜头跟它走，免得画面跟着扫帚一颤一颤）
const baseZ = (frame: number) => {
  let z = HOVER + SETTLE * ss((frame - beats.seated) / 24);
  z += (LIFT - HOVER - SETTLE) * ss((frame - beats.liftOff) / (beats.charge - beats.liftOff));
  return z;
};
// ---------- 房间在世界里的摆法：本地 → 世界 = 绕竖轴转 ROOM.朝向，再平移 ROOM.位置（基地小岛.tsx 定的，不转） ----------
export const ROOM = { heading: roomHeading, origin: roomOrigin };
// 出发的朝向（本地，度，正 = 往左转）：6-2-5 首帧扫帚的朝向换到房间本地，取 -180～180 里转得少的那一边。
// 西墙的门开在屋子正中沿这个方向出去的地方（约 69°；杆中心过西墙中线 x −6.5 时 y ≈ 2.5，门洞是 y 1～4）
export const departYaw = wrap(END.朝向 - ROOM.heading);
const DIR = [-Math.sin(departYaw * D2R), Math.cos(departYaw * D2R)]; // 出发方向（水平单位向量，本地）
// ---------- 冲出门：沿出发方向匀加速，卡.出门 那一帧杆中心正好过西墙的中线（本地 x −6.5） ----------
const S_DOOR = 6.5 / -DIR[0]; // 从屋子正中到门口的路程
const ACC = (2 * S_DOOR) / ((beats.throughDoor - beats.rush) / 24) ** 2; // 格/秒²
export const dashS = (frame: number) => {
  const sec = Math.max(0, (Math.min(frame, beats.lastFrame) - beats.rush) / 24);
  return 0.5 * ACC * sec * sec;
};
const S_END = dashS(beats.lastFrame);
// 出了墙（墙外皮在 x −7，墙外一圈勒脚到 x −8）才抬头往上窜：从 `S_CLIMB` 起，杆中心升 `CLIMB` 格、扫帚头抬到 6-2-5 首帧的俯仰。
// 墙外地比屋里地板高一格（存档里西北半边是 y 69 的草地），升得快一点，脚不擦地
const S_CLIMB = 7.0 / -DIR[0];
const CLIMB = 2.5;
const climbK = (s: number) => ss((s - S_CLIMB) / (S_END - S_CLIMB));
const zAt = (frame: number) => {
  const bob = 0.05 * Math.sin((2 * Math.PI * frame) / 40) * (1 - ss((frame - beats.charge + 12) / 12));
  const dip = -DIP * ss((frame - beats.charge) / 6) * (1 - ss((frame - beats.rush) / 10));
  return baseZ(frame) + bob + dip + CLIMB * climbK(dashS(frame));
};
export const Z_END = zAt(beats.lastFrame);
const pitchAt = (frame: number) => {
  // 冲之前扫帚头微微翘起蓄力（3°），冲起来压平；出了门抬到 6-2-5 首帧的俯仰
  const pre = 3 * ss((frame - beats.charge) / 6) * (1 - ss((frame - beats.rush) / 8));
  return lerp(pre, END.俯仰, climbK(dashS(frame)));
};
// 31.1 离地起，扫帚一边慢慢升、一边原地转到出发朝向（对着门口），蓄力之前转完
const yawAt = (f: number) => departYaw * ss((f - beats.liftOff) / (beats.charge - beats.liftOff));
const posAt = (frame: number): V3 => {
  const dist = dashS(frame);
  return [DIR[0] * dist, DIR[1] * dist, zAt(frame)];
};
export const broom = (frame: number): BroomState => {
  const appear = frame < beats.summon ? 0 : sample([[beats.summon, 0], [beats.summon + 6, 1.15], [beats.summon + 10, 1]], frame);
  if (frame >= beats.lastFrame) return { 位置: posAt(beats.lastFrame), 朝向: departYaw, pitch: END.俯仰, roll: 0, appear: 1 };
  return { 位置: posAt(frame), 朝向: yawAt(frame), pitch: pitchAt(frame), roll: 0, appear };
};
export const toWorld = (pt: number[]): number[] => {
  const yawRad = ROOM.heading * D2R;
  return [pt[0] * Math.cos(yawRad) - pt[1] * Math.sin(yawRad) + ROOM.origin[0], pt[0] * Math.sin(yawRad) + pt[1] * Math.cos(yawRad) + ROOM.origin[1], pt[2] + ROOM.origin[2]];
};

// ---------- 骑手 ----------
export const riders = (frame: number): { liYing: RideLiYing | false; jiuhu: RideJiuhu | false } => {
  if (frame >= beats.lastFrame) return { liYing: { ...END_RIDERS.李樱 }, jiuhu: { ...END_RIDERS.九胡 } };
  // 冲出去的一路慢慢压成 6-2-5 首帧的骑姿
  const k = ss((frame - beats.rush) / (beats.lastFrame - beats.rush));
  const sink = ss((frame - beats.charge) / 6) * (1 - k);
  const ly = END_RIDERS.李樱;
  const jh = END_RIDERS.九胡;
  return {
    liYing: frame >= beats.liYingMount ? { lean: lerp(22 + 10 * sink, ly.lean ?? 30, k), headRaise: lerp(6 - 6 * sink, ly.headRaise ?? 0, k) } : false,
    jiuhu: frame >= beats.jiuHuUp
      ? {
          lean: lerp(16 + 8 * sink, jh.lean ?? 20, k),
          hugWaist: lerp(ss((frame - beats.jiuHuUp) / 6), jh.hugWaist ?? 1, k),
          // 尾巴的相位到末帧正好是 6-2-5 首帧的 0
          tailPhase: (frame - beats.lastFrame) / 9,
          风: 0,
          headRaise: lerp(4, jh.headRaise ?? 0, k),
        }
      : false,
  };
};

// ---------- 站着的两个人（本地坐标）：面对面站在屋子正中两侧，扫帚在两人中间冒出来 ----------
// 两人东西相对（镜头 1 在北边拍侧脸的双人镜头），各自往北（镜头这边）侧过来一点，脸露得多一点
const LY_AT: V3 = [0.6, 0.1, 0];
const JH_AT: V3 = [-0.6, -0.1, 0];
const yawFacing = (from: number[], to: number[]) => Math.atan2(-(to[0] - from[0]), to[1] - from[1]) / D2R;
const LY_YAW = yawFacing(LY_AT, JH_AT) - 28;
const JH_YAW = yawFacing(JH_AT, LY_AT) + 15;
const SEAT_FRONT = BROOM.seatFront;
const SEAT_BACK = BROOM.seatBack;

// 李樱：右手平托着结构指南针，往九胡面前再送一点 → 她接住后松手、手放下 → 唤出扫帚（右手往前上方一伸）→ 跳上前座，落座时转成朝北（扫帚头的方向）
const giveK = (f: number) => lerp(0.3, 1, ss(f / 12)) * (1 - ss((f - beats.release) / 10));
// 平托的右臂 [armR, armRRoll, elbowR]：首帧（6-2-3 末帧）→ 第 12 帧往她面前送。肘弯成直角、前臂端平，往里收向她那边；
// 再把手伸出去递给她（`GIVE_REACH` 这几帧），肩和身子跟着朝她转过去一点（GIVE_TURN 度）
const HOLD_NEAR = [5, 15, 85];
const HOLD_FAR = [18, 20, 72];
const HOLD_GIVE = [42, 16, 46];
const GIVE_REACH = [5, 15];
const GIVE_TURN = 14;
const giveReach = (f: number) => ss((f - GIVE_REACH[0]) / (GIVE_REACH[1] - GIVE_REACH[0]));
export const liyingOnFoot = (frame: number): FigurePose | null => {
  if (frame >= beats.liYingMount) return null;
  const give = giveK(frame);
  const hold = 1 - ss((frame - beats.release) / 10);
  const arm = HOLD_NEAR.map((v, i) => lerp(lerp(v, HOLD_FAR[i], ss(frame / 12)), HOLD_GIVE[i], giveReach(frame)) * hold);
  const summon = ss((frame - (beats.summon - 7)) / 7) * (1 - ss((frame - (beats.summon + 8)) / 8));
  const hopK = ss((frame - (beats.liYingMount - 8)) / 8);
  const crouch = frame > beats.liYingMount - 12 ? Math.sin(Math.PI * Math.min(1, (frame - (beats.liYingMount - 12)) / 6)) : 0;
  const z = 0.9 * Math.sin(Math.PI * Math.min(1, hopK * 1.6)) * (frame > beats.liYingMount - 8 ? 1 : 0);
  const basePose = standPose([lerp(LY_AT[0], 0, hopK), lerp(LY_AT[1], SEAT_FRONT, hopK), z]);
  return {
    ...basePose,
    pitch: -12 * crouch,
    headPitch: -8 * give * (1 - summon) + 6 * summon,
    legR: 30 * crouch,
    legL: 30 * crouch,
    kneeR: 55 * crouch,
    kneeL: 55 * crouch,
    armR: arm[0] + 120 * summon,
    armRRoll: arm[1] + 20 * summon,
    elbowR: arm[2] + 20 * (1 - hold) * (1 - summon),
    yaw: lerp(LY_YAW + GIVE_TURN * giveReach(frame), 0, hopK),
  };
};

// 九胡：低头看他递过来的指南针、伸右手接住，收到身前低处再看一眼 → 抬头，扫帚冒出来时往后一缩 → 跳上后座（右手一直握着指南针）
// bones：右臂的骨骼姿势（Figure 没有九胡的肘，弯肘、接东西的手臂直接给骨骼），叠在 `jiuhuStandBones` 上
export type JiuhuOnFoot = { pose: FigurePose; tail: number; bend: number; bones: Record<string, BonePose> } | null;
const JH_STEP = { dist: 0.25, frames: [4, 13] };
const jiuhuBody = (frame: number) => {
  const look = ss((frame - beats.receive) / 8) * (1 - ss((frame - beats.lookUp) / 8));
  const flinch = Math.sin(Math.PI * Math.min(1, Math.max(0, (frame - beats.summon) / 12)));
  const hopK = ss((frame - (beats.jiuHuUp - 8)) / 8);
  const crouch = frame > beats.jiuHuUp - 12 ? Math.sin(Math.PI * Math.min(1, (frame - (beats.jiuHuUp - 12)) / 6)) : 0;
  const hopZ = 0.9 * Math.sin(Math.PI * Math.min(1, hopK * 1.6)) * (frame > beats.jiuHuUp - 8 ? 1 : 0);
  // 伸手去接时往他那边迈一小步（`JH_STEP`），之后就站在那里
  const stepT = Math.min(1, Math.max(0, (frame - JH_STEP.frames[0]) / (JH_STEP.frames[1] - JH_STEP.frames[0])));
  const back = 0.35 * flinch * (1 - hopK) - JH_STEP.dist * ss(stepT);
  const stepSwing = Math.sin(Math.PI * stepT);
  const fx = -Math.sin(JH_YAW * D2R);
  const fy = Math.cos(JH_YAW * D2R);
  const basePose = standPose([lerp(JH_AT[0] - fx * back, 0, hopK), lerp(JH_AT[1] - fy * back, SEAT_BACK, hopK), hopZ]);
  return {
    pose: {
      ...basePose,
      pitch: -10 * crouch + 6 * flinch * (1 - hopK),
      headPitch: -22 * look + 10 * flinch * (1 - hopK),
      legR: 30 * crouch + 22 * stepSwing,
      legL: 30 * crouch - 8 * stepSwing,
      armR: -15 * crouch,
      armL: -15 * crouch,
      yaw: lerp(JH_YAW, 0, hopK),
    } as FigurePose,
    tail: frame / 9,
    bend: 6 * look,
  };
};
// 九胡模型根（脚底为原点、正面 +Y）→ 房间本地，同 九胡.tsx 的 `Jiuhu`
const jiuhuRoot = (pose: FigurePose) =>
  new THREE.Matrix4()
    .makeTranslation(pose.loc[0], pose.loc[1], pose.loc[2])
    .multiply(new THREE.Matrix4().makeRotationZ((pose.yaw ?? 0) * D2R))
    .multiply(new THREE.Matrix4().makeRotationX(pose.pitch * D2R))
    .multiply(new THREE.Matrix4().makeScale(1, 1, pose.squash));
type ArmRot = number[]; // [RightArm x, y, z, RightForeArm x, y]（基岩动画约定，相对模型原样）
const armBones = (x: ArmRot): Record<string, BonePose> => ({ RightArm: { rot: [x[0], x[1], x[2]] }, RightForeArm: { rot: [x[3], x[4], 0] } });
// 坐标下降法解右臂，让指南针（握在她手里，`jiuhuCompassMatrix`）的中心落到 target、表盘法线朝 normal、贴图上方朝 top（都在房间本地）
const solveArm = (frame: number, target: number[], normal: number[], top: number[], guess: ArmRot): { arm: ArmRot; 误差: number } => {
  const body = jiuhuBody(frame);
  const root = jiuhuRoot(body.pose);
  const base = jiuhuStandBones(body.pose, body.tail, body.bend, 0, 0);
  const wantN = new THREE.Vector3(...normal).normalize();
  const wantT = new THREE.Vector3(...top).normalize();
  const err = (x: ArmRot) => {
    const m = root.clone().multiply(jiuhuCompassMatrix({ ...base, ...armBones(x) }));
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    const n = new THREE.Vector3().setFromMatrixColumn(m, 2).normalize();
    const t = new THREE.Vector3().setFromMatrixColumn(m, 1).normalize();
    const reg = x.reduce((sum, v, i) => sum + (v - guess[i]) ** 2, 0) * 1e-7;
    return p.distanceToSquared(new THREE.Vector3(...target)) + 0.02 * (1 - n.dot(wantN)) ** 2 + 0.005 * (1 - t.dot(wantT)) ** 2 + reg;
  };
  const x = [...guess];
  let error = err(x);
  for (let step = 16; step > 0.02; ) {
    let better = false;
    for (let i = 0; i < x.length; i++)
      for (const delta of [step, -step]) {
        const y = [...x];
        y[i] += delta;
        y[3] = Math.min(0, Math.max(-130, y[3])); // 肘只往前弯
        const ey = err(y);
        if (ey < error) {
          error = ey;
          better = true;
          x.splice(0, x.length, ...y);
        }
      }
    if (!better) step /= 2;
  }
  return { arm: x, 误差: Math.sqrt(error) };
};

// ---------- 结构指南针（本地坐标）：先平托在李樱右手上（表盘朝上、贴图上方朝北），递到九胡手里以后握在她右手上 ----------
// 用户 10-18 定：平托，竖着举太诡异（同 6-3-1）。
// 握持偏移按身体朝向给（右、前、上，格）：表盘中心在拳头前面 11 厘米、上面 17.5 厘米，拳头顶着表壳底下靠身子那一半。
// 再放低，前臂就从表壳底下戳进来；前臂往下斜着放低手，表盘就离开拳头浮在前面（拿李樱模型真实的面逐帧核过，离表壳最近 1 厘米）
export const COMPASS_GRIP = [0, 0.11, 0.175];
const LY_H = 1.875; // 同 李樱.tsx
export const gripAt = (pose: FigurePose, grip: number[]) => {
  const hand = handPosition(pose, LY_H, 'R');
  const yawRad = (pose.yaw ?? 0) * D2R;
  return [hand[0] + grip[0] * Math.cos(yawRad) - grip[1] * Math.sin(yawRad), hand[1] + grip[0] * Math.sin(yawRad) + grip[1] * Math.cos(yawRad), hand[2] + grip[2]];
};
// 李樱递到的地方（`GIVE_REACH` 以后他的手不再动）
const GIVEN_AT = gripAt(liyingOnFoot(GIVE_REACH[1])!, COMPASS_GRIP);
// 九胡右臂的两个姿势：接（指南针中心就在他递到的地方、表盘朝上、贴图上方朝北，和他手上的一样）、拿（收到自己身前低处，表盘朝上往她脸那边仰 20°，低头看得到）
const ARM_REST: ArmRot = [0, 0, 0, 0, 0];
const ARM_TAKE = solveArm(beats.handoff, GIVEN_AT, [0, 0, 1], [0, 1, 0], [-55, 0, -10, -30, 0]);
const HOLD_AT = (() => {
  const body = jiuhuBody(beats.release + 14).pose;
  const yawRad = (body.yaw ?? 0) * D2R;
  const fwd = [-Math.sin(yawRad), Math.cos(yawRad)];
  const right = [Math.cos(yawRad), Math.sin(yawRad)];
  // 身前 0.3 格、往右 0.06 格、离地 0.9 格（肚子前面）
  return { pos: [body.loc[0] + fwd[0] * 0.3 + right[0] * 0.06, body.loc[1] + fwd[1] * 0.3 + right[1] * 0.06, 0.9], normal: [-fwd[0] * Math.sin(20 * D2R), -fwd[1] * Math.sin(20 * D2R), Math.cos(20 * D2R)], top: [fwd[0], fwd[1], 0] };
})();
const ARM_HOLD = solveArm(beats.release + 14, HOLD_AT.pos, HOLD_AT.normal, HOLD_AT.top, [-30, 0, -10, -60, 0]);
export const jiuhuArmSolve = { take: ARM_TAKE, hold: ARM_HOLD }; // 核对用
const armAt = (frame: number): ArmRot => {
  const reachK = ss((frame - beats.receive) / (beats.handoff - beats.receive));
  const holdK = ss((frame - beats.release) / 14);
  return ARM_REST.map((v, i) => lerp(lerp(v, ARM_TAKE.arm[i], reachK), ARM_HOLD.arm[i], holdK));
};
export const jiuhuOnFoot = (frame: number): JiuhuOnFoot => {
  if (frame >= beats.jiuHuUp) return null;
  const body = jiuhuBody(frame);
  return { ...body, bones: frame > beats.receive ? armBones(armAt(frame)) : {} };
};

// pos：表盘中心；quat：物品坐标系（正面 +Z、贴图上方 +Y）在房间本地的朝向；scale 同 `COMPASS_SCALE`。上了扫帚以后挂在 骑扫帚.tsx 的九胡右手上，这里返回 null
export type CompassPose = { pos: number[]; quat: THREE.Quaternion; scale: number };
const inJiuhuHand = (frame: number): CompassPose => {
  const jh = jiuhuOnFoot(frame)!;
  const m = jiuhuRoot(jh.pose).multiply(jiuhuCompassMatrix({ ...jiuhuStandBones(jh.pose, jh.tail, jh.bend, 0, 0), ...jh.bones }));
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  m.decompose(pos, quat, new THREE.Vector3());
  return { pos: [pos.x, pos.y, pos.z], quat, scale: COMPASS_SCALE };
};
export const compass = (frame: number): CompassPose | null => {
  if (frame >= beats.jiuHuUp) return null;
  const ly = liyingOnFoot(frame);
  const fromLiYing = { pos: ly ? gripAt(ly, COMPASS_GRIP) : GIVEN_AT, quat: new THREE.Quaternion(), scale: COMPASS_SCALE };
  // 14～18 两只手都托着，从他手上的位置、朝向换到她手上的
  const k = ss((frame - (beats.handoff - 2)) / 4);
  if (k <= 0) return fromLiYing;
  const toJiuhu = inJiuhuHand(frame);
  if (k >= 1) return toJiuhu;
  return { pos: lerp3(fromLiYing.pos, toJiuhu.pos, k), quat: fromLiYing.quat.clone().slerp(toJiuhu.quat, k), scale: COMPASS_SCALE };
};

// ---------- 镜头（先在本地坐标里算，再换到世界） ----------
export type Cam = { pos: number[]; tgt: number[]; lens: number };
const anchor = (f: number) => [0, 0, baseZ(f)]; // 镜头跟着的扫帚位置（不带起伏和下沉；冲之前扫帚在屋子正中不动）
// 镜头 1（0～31.1）：屋子北边的中景，平视两人的侧脸（李樱在画面右边、九胡在左边），背景是南墙的窗户和窗前摆着战利品的桌子；
// 慢慢往前推、往东挪一点（两人坐上扫帚以后脸朝镜头，九胡从李樱身后露出半个身子）。坐上扫帚以后视线跟着抬到人身上
const C1 = { from: [-0.4, 5.6, 1.75], to: [2.2, 4.3, 1.7], tgt: [0, -0.3, 1.1] };
const shot1 = (frame: number): Cam => {
  const t = Math.min(1, Math.max(0, frame / beats.liftOff));
  const eased = ss(t) * 0.6 + t * 0.4;
  const riding = ss((frame - beats.liYingMount) / 30);
  return { pos: lerp3(C1.from, C1.to, eased), tgt: lerp3(C1.tgt, [0, 0, baseZ(frame) + 0.85], riding), lens: 28 };
};
// 镜头 2（31.1～冲）：扫帚慢慢离地、原地转到出发朝向（对着西墙的门），镜头绕到扫帚正后方、高 1.1 格，看着二人的背影和前面的门口。
// 绕哪一边：镜头实际转的角度 = 绕人转的角度 + 扫帚转的角度，经左手边转出来超过 240°（画面甩一大圈，看着晕）就改从右手边绕，转得少
const ORBIT_END = { r: 3.4, h: 1.1 };
const O0 = (() => {
  const camPos = shot1(beats.liftOff).pos;
  const anchorPos = anchor(beats.liftOff);
  const offset = [camPos[0] - anchorPos[0], camPos[1] - anchorPos[1], camPos[2] - anchorPos[2]];
  return { r: Math.hypot(offset[0], offset[1]), h: offset[2], phi: Math.atan2(offset[1], offset[0]) / D2R };
})();
// 镜头相对扫帚的角度（0 = 扫帚头那一边）：开头在扫帚头往右一点（O0.phi − 90），最后在正后方（180）
const ORBIT_SWEEP = (() => {
  const rel0 = O0.phi - 90;
  const left = 180 - rel0 + departYaw;
  const right = -180 - rel0 + departYaw;
  return Math.abs(left) <= 240 ? left : right;
})();
const rotZ = (pt: number[], deg: number) => {
  const rad = deg * D2R;
  return [pt[0] * Math.cos(rad) - pt[1] * Math.sin(rad), pt[0] * Math.sin(rad) + pt[1] * Math.cos(rad), pt[2]];
};
const orbit = (frame: number): Cam => {
  const eased = ss((frame - beats.liftOff) / (beats.rush - beats.liftOff));
  const anchorPos = anchor(frame);
  const phi = (O0.phi + ORBIT_SWEEP * eased) * D2R;
  const radius = lerp(O0.r, ORBIT_END.r, eased);
  const height = lerp(O0.h, ORBIT_END.h, eased);
  // 视线从人身上慢慢移到扫帚头前面（跟着扫帚转），最后看着门口
  const ahead = rotZ([0, 3, 0], yawAt(frame));
  return {
    pos: [anchorPos[0] + radius * Math.cos(phi), anchorPos[1] + radius * Math.sin(phi), anchorPos[2] + height],
    tgt: lerp3([anchorPos[0], anchorPos[1], anchorPos[2] + 0.85], [anchorPos[0] + ahead[0], anchorPos[1] + ahead[1], anchorPos[2] + 0.6], eased),
    lens: lerp(28, 24, eased),
  };
};
// 镜头 3（冲～末帧）：跟在扫帚后面一起冲出门（离扫帚 3.4 格 → 2.2 格；高度不跟着往上窜，过门洞时离门楣还有 0.6 格），
// 出了门扫帚往上窜、扫帚头抬起来，草束从镜头下方扫上来；最后 12 帧镜头贴到草束末端后面 0.14 格，盖满画面。
// 末帧镜头相对扫帚的位置就是 6-2-5 的 `FIRST_CAM`：草束末端后 0.14 格、高 0.04 格（扫帚本地），顺着扫帚往前看，24mm
const TAIL = BROOM.tailY;
// 扫帚本地（杆中心为原点）→ 房间本地：扫帚在第 f 帧的位置、朝向 出发朝向、俯仰（先俯仰、再朝向，同 骑扫帚.tsx）
const onBroom = (frame: number, offset: number[]) => {
  const pitch = (frame >= beats.lastFrame ? END.俯仰 : pitchAt(frame)) * D2R;
  const rotated = rotZ([offset[0], offset[1] * Math.cos(pitch) - offset[2] * Math.sin(pitch), offset[1] * Math.sin(pitch) + offset[2] * Math.cos(pitch)], departYaw);
  const broomPos = posAt(Math.min(frame, beats.lastFrame));
  return [broomPos[0] + rotated[0], broomPos[1] + rotated[1], broomPos[2] + rotated[2]];
};
const CHASE_Z = LIFT + ORBIT_END.h; // 冲出去时镜头的高度（不跟着扫帚往上窜）
const rush = (frame: number): Cam => {
  const progress = Math.min(1, Math.max(0, (frame - beats.rush) / (beats.lastFrame - beats.rush)));
  const dist = dashS(frame);
  const chaseDist = lerp(ORBIT_END.r, 2.2, ss(progress));
  const chase = { pos: [DIR[0] * (dist - chaseDist), DIR[1] * (dist - chaseDist), CHASE_Z], tgt: [DIR[0] * (dist + 3), DIR[1] * (dist + 3), LIFT + 0.6] };
  const tail = { pos: onBroom(frame, [0, TAIL - 0.14, 0.04]), tgt: onBroom(frame, [0, TAIL + 6, 0.1]) };
  const eased = ss((frame - (beats.lastFrame - 12)) / 12);
  return { pos: lerp3(chase.pos, tail.pos, eased), tgt: lerp3(chase.tgt, tail.tgt, eased), lens: 24 };
};
const cameraLocal = (f: number): Cam => (f < beats.liftOff ? shot1(f) : f < beats.rush ? orbit(f) : rush(f));
export const camera = (frame: number): Cam => {
  const localCam = cameraLocal(Math.min(frame, beats.lastFrame));
  return { pos: toWorld(localCam.pos), tgt: toWorld(localCam.tgt), lens: localCam.lens };
};
// 雾：窗外的海要一直到地平线都是海，用基地窗外那一套（lib/体素/主世界地形.ts 的 `overworldWindowView`）。末帧草束离镜头 0.14 格，雾对它没有影响，和 6-2-5 首帧照样一样
export const VISIBILITY = overworldWindowView.visibility;
// 核对用：末帧扫帚和镜头的世界坐标。和 6-2-5 首帧不在同一个地方，要对上的是扫帚的朝向、俯仰和镜头相对扫帚的偏移
export const endState = () => {
  const broomState = broom(beats.lastFrame);
  return { broom: { ...broomState, 位置: toWorld(broomState.位置), 朝向: broomState.朝向 + ROOM.heading }, camera: camera(beats.lastFrame) };
};
