// 李樱：助跑、起跳、迅冲斩的位移，冲刺步态，全部姿态关键帧和收刀约束，刀光、残影、扬尘。
import { type Key, type VKey, sample, sampleLag, sampleV, track } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import type { FigurePose } from '@库/角色/骨架.tsx';
import { originalTiming, sheathConstraint as sheathConstraint, type SheathTiming } from '@库/物品/拔刀剑收刀.ts';
import { S2, END, HOLD, warp, real, segSec, LANE_E, HX, HY, lanePt, laneZ, LANE_YAW, GO } from './时间轴.ts';
import { rad, lerpV } from '@engine/core/数学.ts';

// 收刀（uchigatana_scrap，`BLADE` 关键帧 127～135）在剧情帧上的起止：起 = 刀从前上方落下，入鞘 = 刀完全收进鞘里
export const sheathTimes = { start: 127 / 24 + HOLD, sheathed: 135 / 24 + HOLD };
// 李樱「暮色的boss就算加强了十倍，也不过如此。」滑停站稳就开口（滑行 `SLIDE` 停在 124），说着收刀。
// 用户 10-20 换成这句长的（3.2 秒），照原来收刀那一下（139）开口会说到九胡开喊（6-1-3 的 `MAZE_SHOUT`）才完
export const lineStoryTime = 126 / 24;
export const lineStartSec = segSec(lineStoryTime);

// ---------- 李樱 ----------
const LY_OFF = 0.4; // 在跑动方向右手边（南边），和九胡并排站在 2×2 的传送门上
export const DASH_Y = LANE_E[1] - LY_OFF;
const V_LY = 40;
const LY_ACC = 8 / 24; // 1/3 秒从静止加到 40 米/秒
export const TAKEOFF = 84 / 24;
const lyDist = (t: number) =>
  t <= GO ? 0 : t <= GO + LY_ACC ? (V_LY * (t - GO) ** 2) / (2 * LY_ACC) : (V_LY * LY_ACC) / 2 + V_LY * (t - GO - LY_ACC);
// 起跑点 = 从传送门跃出后的落脚点（场景 x -130.3），起跳时 L = 8；传送门中心在 L 45.5
export const START_L = 8 + lyDist(real(TAKEOFF));
export const lyL = (t: number) => START_L - lyDist(real(Math.min(t, TAKEOFF)));
// 滞空点、迅冲斩的弧线（二次贝塞尔：滞空点 → 控制点 → 娜迦身前贴地）
const APEX: V3 = [...lanePt(1, LY_OFF), 36] as V3;
const APEX_TOP: V3 = [APEX[0], APEX[1], APEX[2] + 0.4];
export const DASH0 = 98 / 24;
export const DASH1 = 116 / 24;
const DASH_CTRL: V3 = [-55, DASH_Y, 48];
export const CUT_X = -1; // 娜迦身体（南北向）的中线，刀锋横穿这里
const DASH_END: V3 = [CUT_X - 3.2, DASH_Y, 0.3];
const bez = (t: number): V3 => {
  const wStart = (1 - t) ** 2;
  const wCtrl = 2 * t * (1 - t);
  const wEnd = t * t;
  return [0, 1, 2].map((k) => wStart * APEX_TOP[k] + wCtrl * DASH_CTRL[k] + wEnd * DASH_END[k]) as V3;
};
// 冲过娜迦身体（x -2..0）之后急停：120 米/秒停不下来，靠一团扬尘和几帧滑行交代
const SLIDE_END: V3 = [2.6, DASH_Y, 0];
// f117 刀正好穿过娜迦脖子，这一帧前后位置不能从脖子左跳到右（审片读成瞬移）
const SLIDE: VKey[] = [
  [DASH1, DASH_END, 'linear'],
  [117 / 24, [CUT_X, DASH_Y, 0.1]],
  [118 / 24, [1.4, DASH_Y, 0]],
  [120 / 24, [2.3, DASH_Y, 0]],
  [124 / 24, SLIDE_END],
];
export const lyLoc = (t: number): number[] => {
  if (t <= TAKEOFF) {
    const laneDist = lyL(t);
    return [...lanePt(laneDist, LY_OFF), laneZ(laneDist)];
  }
  if (t <= S2) {
    const u = (t - TAKEOFF) / (S2 - TAKEOFF);
    const eased = 1 - (1 - u) ** 2;
    return [...lanePt(8 - 7 * eased, LY_OFF), laneZ(8) + (APEX[2] - laneZ(8)) * eased];
  }
  if (t <= DASH0) return lerpV(APEX, APEX_TOP, track([[S2, 0], [DASH0, 1]], t));
  if (t <= DASH1) return bez((t - DASH0) / (DASH1 - DASH0));
  return sampleV(SLIDE, t);
};
const LY_HEADING: Key[] = [[1 / 24, LANE_YAW], [END, LANE_YAW]];

// 冲刺步态：按短跑运动学写的一个周期（u = 0 右脚落地，到 0.2 蹬离，左脚 0.5～0.7 着地），10 等分。大腿用相对竖直线的角度（正 = 往前），换成相对躯干要减去前倾；膝是小腿往后折的角度。
const SPRINT = {
  thigh: [28, 2, -30, -18, 20, 55, 76, 82, 66, 45],
  knee: [22, 42, 18, 78, 130, 128, 108, 84, 44, 22],
  // 手臂相对躯干（前摆 +）：和同侧腿反相，右腿蹬离时右臂在最前；肘前摆时折得更紧（手到下巴），后摆时打开
  arm: [55, 85, 95, 80, 45, 5, -25, -35, -20, 20],
  elbow: [88, 100, 105, 98, 85, 70, 60, 60, 68, 78],
};
const cyc = (tab: number[], phase: number) => {
  const count = tab.length;
  const x = (((phase % 1) + 1) % 1) * count;
  const i = Math.floor(x);
  const t = x - i;
  const p0 = tab[(i + count - 1) % count];
  const p1 = tab[i];
  const p2 = tab[(i + 1) % count];
  const p3 = tab[(i + 2) % count];
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
};
// 步频：起步 2.6 步周期/秒，8 帧内加到 3.75；再快 24 帧下会糊
const CADENCE: [number, number][] = [[GO, 2.6], [GO + LY_ACC, 3.75]];
const U0 = 0.05; // 起步时右脚在前刚踩实，左腿先往前摆
// 相位按 1/24 秒一步积分成表，中间线性插（逐格积分的老做法，换步长相位会漂）
const PHASE_SAMPLES_PER_SEC = 24;
const PHASE_LAST = Math.round(END * PHASE_SAMPLES_PER_SEC);
const LY_PHASE = (() => {
  const out: number[] = [];
  let phase = U0;
  for (let k = 0; k <= PHASE_LAST; k++) {
    out[k] = phase;
    if (k / PHASE_SAMPLES_PER_SEC >= GO) phase += track(CADENCE, k / PHASE_SAMPLES_PER_SEC) / PHASE_SAMPLES_PER_SEC;
  }
  return out;
})();
export const lyPhase = (story: number) => {
  const x = real(story) * PHASE_SAMPLES_PER_SEC;
  const i = Math.min(Math.max(Math.floor(x), 0), PHASE_LAST - 1);
  return LY_PHASE[i] + (LY_PHASE[i + 1] - LY_PHASE[i]) * (x - i);
};
// 冲刺前倾：起步猛压到 -48，全速收到 -34（不然像在扑而不是跑）
const RUN_PITCH: [number, number][] = [[GO, -11], [GO + 2.5 / 24, -48], [GO + LY_ACC, -42], [26 / 24, -34]];
const RUN_W: Key[] = [[1 / 24, 0], [GO, 0], [GO + 2.5 / 24, 1], [TAKEOFF - 2 / 24, 1], [TAKEOFF, 0]];
const LY_SCALE = 1.875 / 32;
const THIGH = 6;

// 姿态关键帧取材自史诗战斗（Epic Fight）模组动画，换算和出处见 工具/游戏取材/史诗战斗动作参考.md。
// 帧号按停住后的时间轴：起跳 84、滞空蓄势 93～98、出刀 98～108、收刀 127～135；起跑前 f1～8 是按刀蓄势。位移轨迹和机位是镜头自己的设计。
const LY_PITCH: Key[] = [
  [1 / 24, -20], [5 / 24, -11], [GO, -11],                        // 落地 → 蓄势
  [84 / 24, -30, 'linear'], [86 / 24, -14], [90 / 24, -11],            // 起跳
  [94.7 / 24, -27], [98 / 24, -30, 'linear'],                     // 滞空蓄势
  [104 / 24, -50, 'linear'], [106 / 24, -40, 'linear'],           // 俯冲是镜头自己的设计，保留 -50；落地接收势
  [111 / 24, -35], [127 / 24, -35],                               // 滑停：uchigatana_sheath_auto 收势
  [135 / 24, -4], [END, -4],                                 // 收刀后按刀站定，基本站直
];
// 压低身体靠屈膝（骨架按腿自动算髋高），不整体压扁；开头落地蹲得比蓄势低，4 帧内起身
const LY_SQUASH: Key[] = [[1 / 24, 0.88], [5 / 24, 1], [END, 1]];
const LY_HEAD: Key[] = [
  [1 / 24, 10], [GO, 10],
  [84 / 24, 30], [86 / 24, 12], [88.7 / 24, 0], [93 / 24, -28], [98 / 24, -20],  // 越墙低头盯娜迦；fall 是 -17，方向一致
  [104 / 24, 22], [106 / 24, 35], [127 / 24, 35],                      // 出刀抬头：sheath_auto 10 → 22 → 35
  [135 / 24, 4], [END, 4],
];
// 大腿（相对躯干的前摆角）和膝（小腿往后折）。冲刺段由冲刺步态接管
const LEG_R: Key[] = [
  [1 / 24, 51], [GO, 51],                                    // 蓄势：右脚在前半蹲
  [84 / 24, 82], [85 / 24, 12], [86 / 24, -11], [90 / 24, -15],             // 起跳：右腿蹬直在后
  [93 / 24, 58], [98 / 24, 58],                                   // 滞空蓄势：battojutsu_dash@0.5，收腿
  [104 / 24, 90], [106 / 24, 100], [108 / 24, 106],                    // 俯冲迈右腿，落地成弓步：sheath_auto 收势
  [127 / 24, 106], [131 / 24, 32], [135 / 24, 8], [END, 8],            // 收刀起身：uchigatana_scrap
];
const KNEE_R: Key[] = [
  [1 / 24, 51], [GO, 51],
  [84 / 24, 77], [85 / 24, 49], [86 / 24, 38], [90 / 24, 43],
  [93 / 24, 57], [98 / 24, 57],
  [104 / 24, 72], [106 / 24, 68], [108 / 24, 73],
  [127 / 24, 73], [131 / 24, 10], [135 / 24, 8], [END, 8],
];
const LEG_L: Key[] = [
  [1 / 24, 19], [GO, 19],
  [84 / 24, 33], [85 / 24, 68], [86 / 24, 72], [90 / 24, 66],               // 起跳左膝前提
  [93 / 24, 74], [98 / 24, 76],
  [104 / 24, 25], [106 / 24, 8], [108 / 24, -6],
  [127 / 24, -6], [131 / 24, -15], [135 / 24, 0], [END, 0],
];
const KNEE_L: Key[] = [
  [1 / 24, 39], [GO, 39],
  [84 / 24, 83], [85 / 24, 49], [86 / 24, 35], [90 / 24, 39],
  [93 / 24, 57], [98 / 24, 57],
  [104 / 24, 38], [106 / 24, 30], [108 / 24, 20],
  [127 / 24, 20], [131 / 24, 2], [135 / 24, 4], [END, 4],
];
const GROUND: Key[] = [[1 / 24, 1], [84 / 24, 1], [85 / 24, 0], [105 / 24, 0], [106 / 24, 1], [END, 1]];
// 手臂、转身、刀取自动作数据的 rig（导出史诗战斗动作.py --rig）。
const ARM_R: Key[] = [
  [1 / 24, 21], [GO, 21],
  [84 / 24, -85], [85 / 24, -45], [86 / 24, -5], [90 / 24, -23],
  [93 / 24, 21], [98 / 24, 21],
  [100.4 / 24, 39], [101.6 / 24, 66], [102.8 / 24, 127], [104 / 24, 154], [105 / 24, 175], [106 / 24, 183], [108 / 24, 193],
  [127 / 24, 193],
  [129 / 24, 135], [130 / 24, 101], [131 / 24, 97], [133 / 24, 51], [135 / 24, 25],   // f131 手臂指向正前，之后换成等价的另一组解接回按刀姿势
  [END, 21],
];
const ARM_R_ROLL: Key[] = [
  [1 / 24, 79], [GO, 79], [84 / 24, -10], [86 / 24, -4], [90 / 24, -4], [93 / 24, 79], [98 / 24, 79],
  [100.4 / 24, 89], [101.6 / 24, 90], [102.8 / 24, 130], [104 / 24, 79], [105 / 24, 45], [106 / 24, 47], [108 / 24, 49],
  [127 / 24, 49], [129 / 24, 47], [130 / 24, 47], [131 / 24, 76], [133 / 24, 101], [135 / 24, 74], [END, 79],
];
const ELBOW_R: Key[] = [
  [1 / 24, 0], [GO, 0], [84 / 24, 85], [85 / 24, 70], [86 / 24, 36], [90 / 24, 69], [93 / 24, 0], [101.6 / 24, 0], [102.8 / 24, -45], [104 / 24, 0], [END, 0],
];
const ARM_L: Key[] = [
  [1 / 24, -66], [GO, -66],
  [84 / 24, -91], [85 / 24, -47], [86 / 24, -1], [90 / 24, -18],
  [93 / 24, -66], [98 / 24, -66],
  [100.4 / 24, -56], [101.6 / 24, -30], [102.8 / 24, -39], [104 / 24, -60], [105 / 24, -67], [106 / 24, -60], [108 / 24, -55],
  [127 / 24, -55], [129 / 24, -33], [130 / 24, -26], [131 / 24, -29], [133 / 24, 4], [135 / 24, -50], [END, -66],
];
const ARM_L_ROLL: Key[] = [
  [1 / 24, 3], [GO, 3], [84 / 24, -1], [86 / 24, -5], [90 / 24, -1], [93 / 24, 3], [98 / 24, 3],
  [100.4 / 24, -58], [101.6 / 24, -70], [102.8 / 24, -103], [104 / 24, -71], [105 / 24, -37], [106 / 24, -6], [108 / 24, -1],
  [127 / 24, -1], [129 / 24, -7], [130 / 24, -25], [131 / 24, -49], [133 / 24, -36], [135 / 24, 4], [END, 3],
];
const ELBOW_L: Key[] = [
  [1 / 24, 92], [GO, 92], [84 / 24, 94], [85 / 24, 83], [86 / 24, 52], [90 / 24, 82], [93 / 24, 92], [98 / 24, 92],
  [100.4 / 24, 110], [101.6 / 24, 88], [102.8 / 24, 55], [104 / 24, 73], [105 / 24, 74], [106 / 24, 61], [108 / 24, 56],
  [127 / 24, 56], [129 / 24, 61], [130 / 24, 38], [131 / 24, 34], [133 / 24, 77], [135 / 24, 78], [END, 92],
];
const LY_YAW: Key[] = [
  [1 / 24, 29], [GO, 29], [91 / 24, 0], [93 / 24, 29], [98 / 24, 29],
  [100.4 / 24, 38], [101.6 / 24, 43], [102.8 / 24, 48], [104 / 24, 33], [105 / 24, 18], [106 / 24, -4], [108 / 24, -17],
  [127 / 24, -17], [129 / 24, -28], [130 / 24, -17], [131 / 24, -4], [133 / 24, 11], [135 / 24, 29], [END, 29],
];
const LY_TWIST: Key[] = [
  [1 / 24, 18], [GO, 18], [91 / 24, 0], [93 / 24, 18], [98 / 24, 18],
  [100.4 / 24, 22], [101.6 / 24, 24], [102.8 / 24, 26], [104 / 24, 8], [105 / 24, -11], [106 / 24, -33], [108 / 24, -35],
  [127 / 24, -35], [129 / 24, 23], [131 / 24, 21], [133 / 24, 20], [135 / 24, 18], [END, 18],
];
const LY_HEAD_YAW: Key[] = [
  [1 / 24, -48], [GO, -48], [91 / 24, 0], [93 / 24, -48], [98 / 24, -48],
  [102.8 / 24, -50], [104 / 24, -25], [105 / 24, 2], [106 / 24, 36], [108 / 24, 55],
  [127 / 24, 55], [129 / 24, 4], [130 / 24, -6], [131 / 24, -18], [133 / 24, -32], [135 / 24, -48], [END, -48],
];
// 刀的方向（身体坐标系，去掉转身和前倾）：BLADE 是前后竖直面里的角，0 上 / 90 后 / 180 下 / 270 前；
// BLADE_SIDE 是刀尖往右偏出这个面多少度。握持点上怎么转由 骨架.tsx 的 bladeInHand 倒推
const BLADE: Key[] = [
  [1 / 24, 122], [98 / 24, 122],
  [100.4 / 24, 106], [101.6 / 24, 98], [102.8 / 24, 82],                  // 顺着鞘抽，刀角变化不大
  [104 / 24, 276],                                              // 一帧甩到正前：正是横穿娜迦身体的这一帧
  [105 / 24, 295], [106 / 24, 313], [108 / 24, 332],                      // 减速送到前上
  [127 / 24, 332], [129 / 24, 228], [130 / 24, 128], [131 / 24, 106], [133 / 24, 127], [135 / 24, 122],   // 刀落到身前、横过来对准鞘口、推进去
];
const BLADE_SIDE: Key[] = [
  [1 / 24, 11], [98 / 24, 11], [100.4 / 24, -20], [101.6 / 24, -26], [102.8 / 24, -31], [104 / 24, -9], [105 / 24, 14], [106 / 24, 39], [108 / 24, 44],
  [127 / 24, 44], [129 / 24, -29], [130 / 24, -52], [131 / 24, -30], [133 / 24, -28], [135 / 24, 11],
];
// 出鞘区间：f98 迅冲时拔刀，f135 收刀入鞘；区间外刀在鞘里，只露刀柄
const bladeOn = (t: number) => t >= 98 / 24 && t < 136 / 24;

const reach = (a: number, knee: number, pitch: number) => THIGH * Math.cos(rad(a + pitch)) + THIGH * Math.cos(rad(a + pitch - knee));

export const heading = (t: number) => sample(LY_HEADING, t);
// 李樱脚底的轨迹（不含姿态）：跟拍对比的机位按它跟
export const liyingLoc = (t: number) => lyLoc(t);

export const liyingKeys = {
  pitch: LY_PITCH, head: LY_HEAD, headYaw: LY_HEAD_YAW,
  legR: LEG_R, legL: LEG_L, kneeR: KNEE_R, kneeL: KNEE_L,
  armR: ARM_R, armRRoll: ARM_R_ROLL, elbowR: ELBOW_R, armL: ARM_L, armLRoll: ARM_L_ROLL, elbowL: ELBOW_L,
  yaw: LY_YAW, twist: LY_TWIST, blade: BLADE, bladeSide: BLADE_SIDE,
};
export type LiyingChannel = keyof typeof liyingKeys;
// 动作改法（用户 10-13 转正为 6-1-2-斩娜迦 正式版）：不给就是原版，结果不变。`键`：换某些通道的关键帧；`delay`：某通道在 f 时晚几帧（负 = 提前），在停住 12 帧（`warp`）之前加；
// `overlay`：在姿态上叠弹簧收势、呼吸等不走关键帧的量
export type LiyingTweak = {
  keys?: Partial<Record<LiyingChannel, Key[]>>;
  delay?: (channel: LiyingChannel | 'bladeOn', t: number) => number;
  overlay?: (pose: FigurePose, t: number) => void;
  // 收刀节奏（剧情时间，秒；见 收刀.ts）：不给按原版；'关' = 不加收刀约束（核对用）
  sheathTiming?: SheathTiming | '关';
};

// 库/物品/拔刀剑收刀.ts 还按 1/24 秒一格算（对口前 3 格开始拧胸、松手按区间少 1 格、每半格解一次 IK），没改成秒：传进去前换成格。原版节奏 `originalTiming` 本来就是格
const SHEATH_STEPS_PER_SEC = 24;
const timingInSteps = (tm: SheathTiming): SheathTiming => {
  const k = (x: number) => x * SHEATH_STEPS_PER_SEC;
  return { start: k(tm.start), ...(tm.side ? { side: [k(tm.side[0]), k(tm.side[1])] as [number, number] } : {}), tipIn: k(tm.tipIn), sheathed: k(tm.sheathed), release: [k(tm.release[0]), k(tm.release[1])] };
};

// 姿态 + 收刀约束：收刀时刀由鞘带着插入，手用 IK 追刀柄和鞘口（收刀.ts，修过刀横穿身体的穿模）
export const liying = (t: number, tweak?: LiyingTweak) => {
  const raw = liyingRaw(t, tweak);
  if (tweak?.sheathTiming === '关') return { ...raw, sheath: undefined, sheathBlade: undefined };
  const timing = tweak?.sheathTiming ? timingInSteps(tweak.sheathTiming) : originalTiming;
  const constraint = sheathConstraint(raw.pose, t * SHEATH_STEPS_PER_SEC, timing, (step) => {
    const rawAt = liyingRaw(step / SHEATH_STEPS_PER_SEC, tweak);
    return [rawAt.pose, rawAt.blade, rawAt.bladeSide];
  });
  return { ...raw, bladeOn: constraint.bladeOut ?? raw.bladeOn, sheath: constraint.sheath, sheathBlade: constraint.blade };
};

const liyingRaw = (t: number, tweak?: LiyingTweak) => {
  // 关键帧按停住 12 帧后的时间取（见 warp）；位置、跑步相位按实际帧
  const tw = warp(t);
  const k = (c: LiyingChannel) => sampleLag(tweak?.keys?.[c] ?? liyingKeys[c], t, tweak?.delay?.(c, t) ?? 0, warp);
  const phase = lyPhase(t);
  const runWeight = sample(RUN_W, tw);
  const mix = (key: number, run: number) => key + (run - key) * runWeight;
  const pitch = mix(k('pitch'), track(RUN_PITCH, t));
  const uL = phase + 0.5;
  const legR = mix(k('legR'), cyc(SPRINT.thigh, phase) - pitch);
  const legL = mix(k('legL'), cyc(SPRINT.thigh, uL) - pitch);
  const kneeR = mix(k('kneeR'), cyc(SPRINT.knee, phase));
  const kneeL = mix(k('kneeL'), cyc(SPRINT.knee, uL));
  const armRun = (v: number) => 6 + (6 * (v + 35)) / 130; // 手臂往前摆时往身体中线收一点
  // 髋和肩的反向扭转：右腿往前时右髋往前送，胸往反方向拧回来，头始终朝前
  const hipTurn = 6 * Math.cos(2 * Math.PI * (phase - 0.7));
  const chestTurn = -10 * Math.cos(2 * Math.PI * (phase - 0.7));
  // 髋的高度：着地的腿把身体撑在它上面；腾空段（u 0.25～0.45、0.75～0.95）髋比着地时再高一点，两只脚都离地
  const flight = 11.05 - 0.85 * Math.cos(2 * Math.PI * 2 * (phase - 0.1));
  // 多垫 0.35 像素：靴子是方块，小腿斜着落地时鞋尖的角会插进地面
  const hipPx = Math.max(reach(legR, kneeR, pitch), reach(legL, kneeL, pitch), flight) + 0.35;
  const loc = lyLoc(t);
  const pose: FigurePose = {
    loc: [loc[0], loc[1], loc[2] + runWeight * (hipPx - 12) * LY_SCALE],
    pitch,
    squash: sample(LY_SQUASH, tw),
    headPitch: mix(k('head'), -pitch * 0.8),
    headYaw: mix(k('headYaw'), -(hipTurn + chestTurn)),
    legR,
    legL,
    kneeR,
    kneeL,
    legRRoll: 3 * runWeight,
    legLRoll: 3 * runWeight,
    armR: mix(k('armR'), cyc(SPRINT.arm, phase)),
    armRRoll: mix(k('armRRoll'), armRun(cyc(SPRINT.arm, phase))),
    armL: mix(k('armL'), cyc(SPRINT.arm, uL)),
    armLRoll: mix(k('armLRoll'), armRun(cyc(SPRINT.arm, uL))),
    elbowR: mix(k('elbowR'), cyc(SPRINT.elbow, phase)),
    elbowL: mix(k('elbowL'), cyc(SPRINT.elbow, uL)),
    ground: sample(GROUND, tw) * (1 - runWeight),
    yaw: heading(t) + mix(k('yaw'), hipTurn),
    twist: mix(k('twist'), chestTurn),
  };
  tweak?.overlay?.(pose, t);
  const tOn = warp(t - (tweak?.delay?.('bladeOn', t) ?? 0));
  return { pose, blade: k('blade'), bladeSide: k('bladeSide'), bladeOn: bladeOn(tOn) };
};

// 刀光（模型/特效/夜幕刀光.tsx 的夜幕阎魔刀拖尾）：刀开始甩出（t102.8，实际帧 114.8）到停住（t108，实际帧 120），之后 0.15 秒收完。
// 命中：f117 刀穿过脖子（同 `neckSlash` 那一帧），在脖子那节放命中闪光和血滴
export const bladeTrailTimes = { start: 102.8 / 24 + HOLD, end: 108 / 24 + HOLD, hit: 117 / 24 };

export const ghosts = (t: number): { t: number; opacity: number }[] =>
  t >= DASH0 + 1 / 24 && t <= DASH1 + 4 / 24 ? [1, 2, 3].map((d, i) => ({ t: t - d / 24, opacity: 0.24 - i * 0.07 })).filter((g) => g.t >= DASH0) : [];

export const dust = (t: number): [V3, number][] => {
  const out: [V3, number][] = [];
  const spawn = (t0: number, p: V3, life = 14 / 24) => out.push([p, (t - t0) / life]);
  const [tx, ty] = lanePt(8, LY_OFF);
  for (const offset of [-0.3, 0.3]) spawn(TAKEOFF, [tx + HY * offset, ty - HX * offset, laneZ(8)], 16 / 24);
  // 滑行时朝东，尘团落在脚后（西边）、左右各一，1/24 秒一团
  for (let k = 0; k < 7; k++) {
    const t0 = DASH1 + (1 + k) / 24;
    const [x, y] = lyLoc(t0);
    spawn(t0, [x - 0.3, y + (k % 2 ? 0.45 : -0.45), 0], 16 / 24);
  }
  return out;
};
