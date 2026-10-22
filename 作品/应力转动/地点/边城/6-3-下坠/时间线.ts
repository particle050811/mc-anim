// 6-3 下坠：6-3-3 俯冲、6-3-4 城防、6-3-5 举锤、6-3-6 砸穿是同一次下坠，放在一条共用时间线上，各段是其中一个窗口。
// 6-3-1（回边城）、6-3-2（思索，用户 10-10 挪到跃出前）在负的全局帧上（见 镜头/6-3-1/编排.ts、镜头/6-3-2/），起点接 6-2-6 末帧悬停（只读引用其末帧状态，不抄数值）。
// 站起、拔锤、跃出、翻身不上画面（用户 10-19：扫帚上跳下来那段做得烂，不渲了），思索末尾放大里面的李樱、淡到天空，接上已经头朝下俯冲的他（6-3-2/转场.ts）。
// 跃出照旧按物理算（起跳点、轨迹、撞击时刻都从它来），只是发生在思索界面盖着的时候：全局帧 0 的物理时间是 `刻`.俯冲起，不是 0。
// 这里的段是旧段号的窗口（编排、声音按它分），成片的段界（拼成哪几个 Composition）见 ../6-2至6-3段界/段表.ts。
//
// 三层时间：
// - 全局帧 G（24 帧/秒）：G = 0 是 6-3-3 首帧（= 6-3-2 末帧，思索转场开始淡出那一帧）；6-3-1、6-3-2 在 G < 0。
// - 物理时间 w（秒）：人、扫帚、碎块全按它走。跃出到翻成头朝下是重力加空气阻力；翻完被推着下冲（见 `鼓风机`）。
//   G < 0 是 0 往前倒推的负数（两人还坐在扫帚上）；G = 0 跳到 `刻`.俯冲起，这一跳藏在不透明的思索界面后面。
//   用户 10-05：下坠是有人用鼓风机加速，不按重力算，选「翻身后约 1 秒冲到 300～400 米/秒，几秒内砸地」，卫兵转身举镜那段慢放像子弹时间。
// - 时钟（画面 1 秒对应多少物理秒）：除了城墙上的子弹时间都是原速（用户 10-19：「为什么要放慢 原速度不行啊」）。
//   子弹时间（用户 10-05 要的）：听见回头 0.3 → 看见金光、举镜 0.24 → 镜中 0.1，关键帧之间 smoothstep。
// 两条线并行（用户 10-19 定）：6-3-3 俯冲切城墙那一刻起，城墙上（6-3-4）和李樱（6-3-5、6-3-6）是同一段剧情时间的两边。
//   6-3-4 演完（望远镜里看见他抡着锤、发金光）硬切回李樱，物理时间退回切城墙那一刻，6-3-5 原速一直拍到砸地，「ロードローラーだッ！」整句在 6-3-5 里。
//   所以 物理时间 在 6-3-4 → 6-3-5 处往回跳，两边各自单调；6-3-5 首帧不和 6-3-4 末帧共用。
import { 例外 } from '@engine/core/例外.ts';
import type { V3 } from '@engine/model/parts.tsx';
import * as K626 from '../6-2-6/编排.ts';
import { segmentFrames as 思索帧数 } from '../6-3-2/台词.ts';

export const FPS = 24;
const ss = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};

// ---------- 起点：6-2-6 末帧 ----------
const F626 = K626.FRAMES - 1;
export const 起点 = {
  broom: K626.broom(F626),
  camera: K626.camera(F626),
  riders: K626.riders(F626),
  visibility: K626.visibility(F626),
};

// ---------- 段表（全局帧，含两头） ----------
// 各段帧数只在 `段长` 里写（含两头 = Composition 的 durationInFrames），起止由 `buildSegmentTable` 累加（用户 10-13：段长不要耦合）。
// 连着拍的两段共用一帧（下一段首帧 = 上一段末帧）；`跳回` 里的段是硬切、物理时间往回跳，首帧接在上一段末帧后面，不共用。
// 锚点：全局帧 0 = 6-3-3 首帧，6-3-1、6-3-2 往负帧倒排。`不共用帧` 里的段首帧接在上一段末帧后面（硬切）。段内节点写成「本段起点 + 偏移」或「本段末帧 − 偏移」，不写绝对全局帧。
export type 段名 = '6-3-1' | '6-3-2' | '6-3-3' | '6-3-4' | '6-3-5' | '6-3-6';
// 6-3-4 城防各拍的帧数（按顺序，第一拍从段首帧起；含义见 `城防`）。分拍依据用户 10-13：先瞭望、听到回头、看到金光再举镜。
// 瞭望原速，太长的话卫兵举镜时他已经砸地了。回头、见光两拍按卫兵的反应（编排/卫兵.ts 的 `REACT`）一起缩（用户 10-20：反应太慢，「整个镜头都要对应缩短」）。
// 举镜：一排人在物理时间 0.3 秒里先后举好，全举好再停一下就切镜中
export const 城防拍长 = { 瞭望: 24, 回头: 23, 见光: 20, 举镜: 30, 镜中: 30 };
export const 段长: Record<段名, number> = {
  // 6-3-1 在负的全局帧上（用户 10-02 要在悬停处预留确认古城在边城的对话）；11 秒：两句台词按正常语速各留足加 0.5 秒（镜头/6-3-1/编排.ts 的 `cues631`）
  '6-3-1': 265, // 11.0 秒
  // 思索：界面盖住画面，李樱配音；时长由台词定，末帧是转场淡出天空的第一帧（镜头/6-3-2/台词.ts）
  '6-3-2': 思索帧数,
  // 原速：从思索里放大的李樱淡到真的天空，跟着他往下冲，到切城墙为止。用户 10-20 嫌思索过后下落太短，加到 41 帧，多出来的那段路由扫帚拉高补上（`思索拉高`）；
  // 切城墙那一刻（`刻`.俯冲起 + 41 / 24 ≈ 3.958 秒）≈ 6-3-5 首帧的物理时间（两边从同一刻起演）
  '6-3-3': 41,
  '6-3-4': Object.values(城防拍长).reduce((a, b) => a + b, 0), // 首帧硬切到城墙，末帧是镜中最后一帧，硬切 6-3-5
  // 原速，从切城墙那一刻拍到砸地前（首帧物理时间 = 撞击时刻 − (78 − 1 + 撞击段内帧) / 24 ≈ 切城墙那一刻），装得下整句台词（../6-3-下坠/声音.tsx 的 `RoadRoller`）
  '6-3-5': 78,
  // 竖井用古城4x 的（用户 10-13 嫌坑浅）：岩层 141 米、入井速度 140，落地半蹲缓冲、起身、扫一眼（../6-3-6/落地.ts）。
  // 撞击时刻、首帧、第 `撞击段内帧` 帧砸地不动；6-3-6 → 6-3-8 硬切（6-3-8 的 `afterImpact` 按这里的段长算）
  '6-3-6': 109,
};
const segmentNames: 段名[] = ['6-3-1', '6-3-2', '6-3-3', '6-3-4', '6-3-5', '6-3-6'];
const 不共用帧: 段名[] = ['6-3-4', '6-3-5'];
const segmentTitles: Record<段名, string> = { '6-3-1': '又回到边城', '6-3-2': '思索', '6-3-3': '俯冲', '6-3-4': '城防', '6-3-5': '举锤', '6-3-6': '砸穿' };
const anchorSegment: 段名 = '6-3-3'; // 这一段的首帧是全局帧 0
const buildSegmentTable = () => {
  const t = {} as Record<段名, { 起: number; 止: number; 名: string; refVideo: boolean }>;
  const anchorIdx = segmentNames.indexOf(anchorSegment);
  let cursorFrame = 0;
  for (let i = anchorIdx; i < segmentNames.length; i++) {
    const seg = segmentNames[i];
    if (i > anchorIdx && 不共用帧.includes(seg)) cursorFrame++;
    t[seg] = { 起: cursorFrame, 止: cursorFrame + 段长[seg] - 1, 名: segmentTitles[seg], refVideo: true };
    cursorFrame = t[seg].止;
  }
  cursorFrame = 0;
  for (let i = anchorIdx - 1; i >= 0; i--) {
    const seg = segmentNames[i];
    t[seg] = { 起: cursorFrame - (段长[seg] - 1), 止: cursorFrame, 名: segmentTitles[seg], refVideo: true };
    cursorFrame = t[seg].起;
  }
  // 对象按段的先后排（Object.keys 的顺序给同步表、台词落点用）
  return Object.fromEntries(segmentNames.map((s) => [s, t[s]])) as typeof t;
};
export const 段表 = buildSegmentTable();
export const 段帧数 = (seg: 段名) => 段表[seg].止 - 段表[seg].起 + 1;
export const 撞击段内帧 = 3; // 6-3-6 第 3 帧锤头砸到地面（剪的时候按它对齐）
// 6-3-4 的节点（全局帧，= 段首 + 前面各拍帧数之和，见 `城防拍长`）。各拍之间硬切（用户 10-13），世界和物理时间连续，只换机位：
// 切墙（段首帧）：北城墙中远景，卫兵值守——瞭望；察觉：4 号先回头，其余陆续跟着；回看：身后高处，镜头抬到天上——看见金光；
// 举镜：城里一侧仰看一排人陆续举望远镜（中景，不给单人特写）；镜中：切进望远镜（原版镜筒遮罩），里面是抡着锤、发着金光的李樱，段末硬切 6-3-5。
// 卫兵动作按物理时间排（编排/卫兵.ts），回头、见光、举镜各拍帧数照那些时刻在各拍时钟下算出
const cityDefenseMarks = () => {
  const beatLen = 城防拍长;
  let cursorFrame = 段表['6-3-4'].起;
  const cutToWall = cursorFrame;
  const notice = (cursorFrame += beatLen.瞭望);
  const glanceBack = (cursorFrame += beatLen.回头);
  const raiseScope = (cursorFrame += beatLen.见光);
  const inScope = (cursorFrame += beatLen.举镜);
  return { 切墙: cutToWall, 察觉: notice, 回看: glanceBack, 举镜: raiseScope, 镜中: inScope };
};
export const 城防 = cityDefenseMarks();

// ---------- 动作的物理时刻（秒） ----------
export const 刻 = {
  standUp: 0.12, // 李樱从跨坐站起来（0.12～0.7）
  releaseWaist: 0.15, // 九胡松开抱着的腰、改扶扫帚杆（她在驾驶扫帚，一直坐在后座上）
  reachForMace: 0.62, // 右手往右肩后面够（0.62～0.86），够到时锤出现
  maceAppears: 0.86,
  swingOut: 1.2, // 锤从背后抡到身前，左手也握上去
  下蹲: 1.24, // 蹲下蓄力（1.24～1.5）
  leap: 1.55, // 脚一蹬，头朝下纵身跃出（往前 1.5 米/秒、往下 12 米/秒）
  flipDone: 1.97, // 往前翻成头朝下（跃出后 0.42 秒），鼓风机从这一刻起推
  开抡: 2.3, // 翻完收住架势（6-3-3/下落攻击.ts 2.275 秒）马上把锤往回抡、边冲边喊（编排/李樱.ts 的 `strikeTracks`，用户 10-19 定）
  俯冲起: 2.25, // 全局帧 0：上画面的第一刻。翻完的架势已经收稳（臂 168°、腿并拢），锤还没往回抡，思索里的李樱摆的就是这一刻的姿势
};
// 思索盖着的时候九胡把扫帚拉高几米，李樱从更高处跃出（拉高在物理时间 0～`刻`.standUp，藏在全局帧 0 那一跳里，不上画面）。
// 用户 10-20 嫌思索过后下落太短：6-3-3 加长 1 秒，拉高的就是这 1 秒在极速下冲的路，切城墙到砸地（6-3-4～6-3-6）和以前一样。改 6-3-3 段长要跟着改，核对 6-3-5 首帧物理时间 ≈ 切城墙那一刻
export const 思索拉高 = 360;
// 跃出到翻完这 0.42 秒没有推力，只有重力加空气阻力（李樱头朝下俯冲的终端速度 90）
export const 李樱终端速度 = 90;
const G_ACC = 9.81;

// ---------- 鼓风机推力 ----------
// 只是推力的数值，画面上不画鼓风机、没有嗡鸣（用户 10-10）；声音.tsx 的风声（`AirCurrentSound`）还按它的 `开`、`rpm` 算。
// 照机械动力 6.0.8 鼓风机吹实体（`AirCurrent.tickAffectedEntities` 字节码）：每刻速度往目标速度拉 clamp(差, ±5 格/刻) × 0.125，
// 即最多 250 米/秒²、离目标不到 100 米/秒后按时间常数 0.4 秒贴近。目标速度竖直朝下，起跳往前的 1.5 米/秒被拉回 0；原版叠加的重力和 0.98 阻力省掉。
// 极速 360 米/秒（约 1.05 马赫）：用户选的「约 1 秒冲到 300～400」的中间；翻完开推，1.18 秒到 300、1.68 秒过音速。
// 横向：目标速度的水平分量（米/秒），编排/李樱.ts 的 `设置瞄准` 按落点反算
export const 鼓风机 = { topSpeed: 360, maxAccel: 250, timeConst: 0.4, 开: 刻.flipDone, rpm: 256, 横向: [0, 0] as [number, number] };

// ---------- 时钟 ----------
// 关键帧 [全局帧, 倍率]，相邻两点平滑过渡，只管 6-3-4 末帧以前（6-3-5、6-3-6 原速，从撞击时刻倒推，见 `物理时间`）
export const 子弹时间 = 例外('不放慢', { 卫兵: 0.3, raiseScope: 0.24, 望远镜: 0.1 }, { 段: '6-城墙瞭望', 原因: '用户 10-05 要慢放才看得清，10-19 去慢放时单留这段' });
const CLOCK: [number, number][] = [
  [段表['6-3-1'].起, 1],
  // 听见、回头：子弹时间 0.3；看见金光时再慢一点，举镜也按这个慢放
  [城防.察觉 - 8, 1],
  [城防.察觉 + 4, 子弹时间.卫兵],
  [城防.回看, 子弹时间.卫兵],
  [Math.round((城防.回看 + 城防.举镜) / 2), 子弹时间.raiseScope],
  [城防.镜中 - 1, 子弹时间.raiseScope],
  // 切进望远镜：镜中追着他
  [城防.镜中, 子弹时间.望远镜],
  [段表['6-3-4'].止, 子弹时间.望远镜],
];
const clockAt = (globalFrame: number) => {
  for (let i = 1; i < CLOCK.length; i++) {
    const [g0, r0] = CLOCK[i - 1];
    const [g1, r1] = CLOCK[i];
    if (globalFrame <= g1) return r0 + (r1 - r0) * ss((globalFrame - g0) / (g1 - g0));
  }
  return CLOCK[CLOCK.length - 1][1];
};
// 积分表：每 1/8 帧，从 G = 0（物理时间 `刻`.俯冲起）到 6-3-5 首帧（6-3-4 末帧往后半帧也要算）
const SUB = 8;
const G5 = 段表['6-3-5'].起;
let W_TAB: number[] | null = null;
const wTab = () => {
  if (W_TAB) return W_TAB;
  W_TAB = [刻.俯冲起];
  for (let i = 1; i <= G5 * SUB; i++) W_TAB.push(W_TAB[i - 1] + clockAt((i - 0.5) / SUB) / FPS / SUB);
  return W_TAB;
};

// ---------- 下落物理 ----------
// 质点：鼓风机开推前是重力 + 二次空气阻力（k = g / 终端速度²），开推后三个分量各自往目标速度拉（见 `鼓风机`）。RK4，步长 1/480 秒，打表
type FallTable = { t0: number; dt: number; p: V3[]; v: V3[] };
const integrate = (p0: V3, v0: V3, t0: number, vt: number, tEnd: number, stopZ = -Infinity): FallTable => {
  const k = G_ACC / (vt * vt);
  const targetVel: V3 = [鼓风机.横向[0], 鼓风机.横向[1], -鼓风机.topSpeed];
  const maxAcc = 鼓风机.maxAccel;
  const acc = (t: number, vel: number[]) => {
    if (t >= 鼓风机.开) return vel.map((x, i) => Math.max(-maxAcc, Math.min(maxAcc, (targetVel[i] - x) / 鼓风机.timeConst)));
    const speed = Math.hypot(vel[0], vel[1], vel[2]);
    return [-k * speed * vel[0], -k * speed * vel[1], -G_ACC - k * speed * vel[2]];
  };
  const dt = 1 / 480;
  const positions: V3[] = [p0];
  const Vs: V3[] = [v0];
  let pos = [...p0];
  let vel = [...v0];
  for (let t = t0; t < tEnd && pos[2] > stopZ; t += dt) {
    const a1 = acc(t, vel);
    const v2 = vel.map((x, i) => x + (a1[i] * dt) / 2);
    const a2 = acc(t + dt / 2, v2);
    const v3 = vel.map((x, i) => x + (a2[i] * dt) / 2);
    const a3 = acc(t + dt / 2, v3);
    const v4 = vel.map((x, i) => x + a3[i] * dt);
    const a4 = acc(t + dt, v4);
    pos = pos.map((x, i) => x + (dt / 6) * (vel[i] + 2 * v2[i] + 2 * v3[i] + v4[i]));
    vel = vel.map((x, i) => x + (dt / 6) * (a1[i] + 2 * a2[i] + 2 * a3[i] + a4[i]));
    positions.push(pos as V3);
    Vs.push(vel as V3);
  }
  return { t0, dt, p: positions, v: Vs };
};
const at = (fallTable: FallTable, t: number): { p: V3; v: V3 } => {
  const x = Math.min(Math.max((t - fallTable.t0) / fallTable.dt, 0), fallTable.p.length - 1);
  const i = Math.min(Math.floor(x), fallTable.p.length - 2);
  const frac = x - i;
  const lp = (a: V3, b: V3): V3 => [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac, a[2] + (b[2] - a[2]) * frac];
  if (t - fallTable.t0 > (fallTable.p.length - 1) * fallTable.dt) {
    // 表外：按末速度直线外推（只在撞击以后用到一点点）
    const overSec = (t - fallTable.t0) - (fallTable.p.length - 1) * fallTable.dt;
    const lastPos = fallTable.p[fallTable.p.length - 1];
    const lastVel = fallTable.v[fallTable.v.length - 1];
    return { p: [lastPos[0] + lastVel[0] * overSec, lastPos[1] + lastVel[1] * overSec, lastPos[2] + lastVel[2] * overSec], v: lastVel };
  }
  return { p: lp(fallTable.p[i], fallTable.p[i + 1]), v: lp(fallTable.v[i], fallTable.v[i + 1]) };
};

// 扫帚坐标系里的方向（朝向 0 = +Y 北，正 = 往左转）
export const yawVec = (yawDeg: number) => {
  const rad = (yawDeg * Math.PI) / 180;
  return { fwd: [-Math.sin(rad), Math.cos(rad)], right: [Math.cos(rad), Math.sin(rad)] };
};

// 李樱离开扫帚那刻的位置由 编排/李樱.ts 按骨架算（髋关节），这里只接初速度往下积分；为免循环引用，编排/李樱.ts 调 `设置起跳`() 填起点。九胡一直坐在扫帚上，不掉下来
let LY_T: FallTable | null = null;
let LY_HIP0: V3 = [0, 0, 0];
export const 设置起跳 = (liYingHip: V3) => {
  const { fwd } = yawVec(起点.broom.朝向);
  LY_HIP0 = liYingHip;
  // 李樱：往前（扫帚头的方向）1.5 米/秒、往下 12 米/秒，头朝下扎下去
  LY_T = integrate(liYingHip, [fwd[0] * 1.5, fwd[1] * 1.5, -12], 刻.leap, 李樱终端速度, 60, 0);
};
// 改推力的水平分量，重新积分（编排/李樱.ts 按落点反算，调用以后要重新 设置撞击）
export const 设置瞄准 = (lateral: [number, number]) => {
  鼓风机.横向 = lateral;
  设置起跳(LY_HIP0);
};
export const 李樱下落 = (w: number) => at(LY_T!, w);
// 撞击：锤头碰到地面（石半砖顶面）的物理时刻。打击姿势时锤头在髋下方 打击深 米（编排/李樱.ts 按骨架算好传进来）
let W_IMP = NaN;
export const 设置撞击 = (groundZ: number, strikeDepth: number) => {
  const fallTable = LY_T!;
  const target = groundZ + strikeDepth;
  let i = 0;
  while (i < fallTable.p.length - 1 && fallTable.p[i + 1][2] > target) i++;
  const z0 = fallTable.p[i][2];
  const z1 = fallTable.p[i + 1][2];
  W_IMP = fallTable.t0 + (i + (z0 - target) / (z0 - z1)) * fallTable.dt;
};
export const 撞击时刻 = () => W_IMP;

// 负帧（6-3-1、6-3-2）：从 0 往回积分，每 1/8 帧一格，`W_NEG`[i] 是 G = -i/8 的物理时间（负的；G = 0 本身是 `刻`.俯冲起，见文件头）
let W_NEG: number[] | null = null;
const wNeg = () => {
  if (W_NEG) return W_NEG;
  const stepCount = -段表['6-3-1'].起 * SUB;
  W_NEG = [0];
  for (let i = 1; i <= stepCount; i++) W_NEG.push(W_NEG[i - 1] - clockAt(-(i - 0.5) / SUB) / FPS / SUB);
  return W_NEG;
};

// ---------- 全局帧 → 物理时间 ----------
// 6-3-5 起（G ≥ `G5`）是并行的另一边：原速，按撞击时刻倒推（6-3-6 第 `撞击段内帧` 帧砸地）；0 ≤ G < `G5` 积分时钟；G < 0 扫帚上，见 `wNeg`
export const 物理时间 = (globalFrame: number): number => {
  if (globalFrame >= G5) return 撞击时刻() + (globalFrame - 段表['6-3-6'].起 - 撞击段内帧) / FPS;
  if (globalFrame < 0) {
    const negTable = wNeg();
    const x = -globalFrame * SUB;
    if (x >= negTable.length - 1) return negTable[negTable.length - 1] - (x - (negTable.length - 1)) / SUB / FPS; // 6-3-1 之前（用不到）：原速外推
    const i = Math.floor(x);
    return negTable[i] + (negTable[i + 1] - negTable[i]) * (x - i);
  }
  const physTimes = wTab();
  const x = globalFrame * SUB;
  const i = Math.min(Math.floor(x), physTimes.length - 2);
  return physTimes[i] + (physTimes[i + 1] - physTimes[i]) * (x - i);
};
export const 时钟 = (G: number) => (G >= G5 ? 1 : clockAt(G));
// 物理时间 → 全局帧（带小数）：两边各自单调。`城墙这边` = true 只在 6-3-4 末帧以前找（城墙上、俯冲、更早），否则物理时间在城墙结束以后的落在 6-3-5 起那边。
// 0 ～ `刻`.俯冲起 之间（跃出、翻身，没上画面）都落在 G = 0
export const 墙末物理时间 = () => 物理时间(段表['6-3-4'].止 + 0.5);
export const 全局帧 = (physSec: number, 城墙这边 = physSec <= 墙末物理时间()): number => {
  if (!城墙这边) return G5 + (physSec - 物理时间(G5)) * FPS;
  let lo = 段表['6-3-1'].起 - 48;
  let hi = 段表['6-3-4'].止 + 0.5;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (物理时间(mid) < physSec) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};
export const 段起物理时间 = (seg: 段名) => 物理时间(段表[seg].起);
// 全局帧属于哪一段（段首帧算这一段）
export const 所在段 = (globalFrame: number): 段名 => {
  const order: 段名[] = ['6-3-6', '6-3-5', '6-3-4', '6-3-3', '6-3-2', '6-3-1'];
  return order.find((s) => globalFrame >= 段表[s].起) ?? '6-3-1';
};
