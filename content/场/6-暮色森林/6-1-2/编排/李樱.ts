// 李樱：助跑、起跳、迅冲斩的位移，冲刺步态，全部姿态关键帧和收刀约束，刀光、残影、扬尘。
import { type Key, type VKey, rad, sample, sampleLag, sampleV, track } from '../../../../../engine/anim/anim.ts';
import type { V3 } from '../../../../../engine/model/parts.tsx';
import type { FigurePose } from '../../../../../world/角色/骨架.tsx';
import { originalTiming, sheathConstraint as 收刀约束, type SheathTiming } from '../../../../../world/物品/拔刀剑收刀.ts';
import { FPS, S2, END, HOLD, warp, real, segFrame, lerp3, LANE_E, HX, HY, lanePt, laneZ, LANE_YAW, GO } from './时间轴.ts';

// 收刀（uchigatana_scrap，`BLADE` 关键帧 127～135）在剧情帧上的起止：起 = 刀从前上方落下，入鞘 = 刀完全收进鞘里
export const sheathFrames = { start: 127 + HOLD, sheathed: 135 + HOLD };
// 李樱「暮色的boss就算加强了十倍，也不过如此。」滑停站稳就开口（滑行 `SLIDE` 停在 124），说着收刀。
// 用户 10-20 换成这句长的（3.2 秒），照原来收刀那一下（139）开口会说到九胡开喊（6-1-3 的 `MAZE_SHOUT`）才完
export const lineStoryFrame = 126;
export const lineStartFrame = segFrame(lineStoryFrame);

// ---------- 李樱 ----------
const LY_OFF = 0.4; // 在跑动方向右手边（南边），和九胡并排站在 2×2 的传送门上
export const DASH_Y = LANE_E[1] - LY_OFF;
const V_LY = 40 / FPS;
const LY_ACC = 8; // 8 帧（1/3 秒）从静止加到 40 米/秒
export const TAKEOFF = 84;
const lyDist = (f: number) =>
  f <= GO ? 0 : f <= GO + LY_ACC ? (V_LY * (f - GO) ** 2) / (2 * LY_ACC) : (V_LY * LY_ACC) / 2 + V_LY * (f - GO - LY_ACC);
// 起跑点 = 从传送门跃出后的落脚点（场景 x -130.3），起跳时 L = 8；传送门中心在 L 45.5
export const START_L = 8 + lyDist(real(TAKEOFF));
export const lyL = (f: number) => START_L - lyDist(real(Math.min(f, TAKEOFF)));
// 滞空点、迅冲斩的弧线（二次贝塞尔：滞空点 → 控制点 → 娜迦身前贴地）
const APEX: V3 = [...lanePt(1, LY_OFF), 36] as V3;
const APEX_TOP: V3 = [APEX[0], APEX[1], APEX[2] + 0.4];
export const DASH0 = 98;
export const DASH1 = 116;
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
  [117, [CUT_X, DASH_Y, 0.1]],
  [118, [1.4, DASH_Y, 0]],
  [120, [2.3, DASH_Y, 0]],
  [124, SLIDE_END],
];
export const lyLoc = (frame: number): number[] => {
  if (frame <= TAKEOFF) {
    const laneDist = lyL(frame);
    return [...lanePt(laneDist, LY_OFF), laneZ(laneDist)];
  }
  if (frame <= S2) {
    const t = (frame - TAKEOFF) / (S2 - TAKEOFF);
    const eased = 1 - (1 - t) ** 2;
    return [...lanePt(8 - 7 * eased, LY_OFF), laneZ(8) + (APEX[2] - laneZ(8)) * eased];
  }
  if (frame <= DASH0) return lerp3(APEX, APEX_TOP, track([[S2, 0], [DASH0, 1]], frame));
  if (frame <= DASH1) return bez((frame - DASH0) / (DASH1 - DASH0));
  return sampleV(SLIDE, frame);
};
const LY_HEADING: Key[] = [[1, LANE_YAW], [END, LANE_YAW]];

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
const LY_PHASE = (() => {
  const out: number[] = [];
  let phase = U0;
  for (let frame = 0; frame <= END; frame++) {
    out[frame] = phase;
    if (frame >= GO) phase += track(CADENCE, frame) / FPS;
  }
  return out;
})();
export const lyPhase = (story: number) => {
  const realFrame = real(story);
  const i = Math.min(Math.max(Math.floor(realFrame), 0), END - 1);
  return LY_PHASE[i] + (LY_PHASE[i + 1] - LY_PHASE[i]) * (realFrame - i);
};
// 冲刺前倾：起步猛压到 -48，全速收到 -34（不然像在扑而不是跑）
const RUN_PITCH: [number, number][] = [[GO, -11], [GO + 2.5, -48], [GO + LY_ACC, -42], [26, -34]];
const RUN_W: Key[] = [[1, 0], [GO, 0], [GO + 2.5, 1], [TAKEOFF - 2, 1], [TAKEOFF, 0]];
const LY_SCALE = 1.875 / 32;
const THIGH = 6;

// 姿态关键帧取材自史诗战斗（Epic Fight）模组动画，换算和出处见 工具/游戏取材/史诗战斗动作参考.md。
// 帧号按停住后的时间轴：起跳 84、滞空蓄势 93～98、出刀 98～108、收刀 127～135；起跑前 f1～8 是按刀蓄势。位移轨迹和机位是镜头自己的设计。
const LY_PITCH: Key[] = [
  [1, -20], [5, -11], [GO, -11],                        // 落地 → 蓄势
  [84, -30, 'linear'], [86, -14], [90, -11],            // 起跳
  [94.7, -27], [98, -30, 'linear'],                     // 滞空蓄势
  [104, -50, 'linear'], [106, -40, 'linear'],           // 俯冲是镜头自己的设计，保留 -50；落地接收势
  [111, -35], [127, -35],                               // 滑停：uchigatana_sheath_auto 收势
  [135, -4], [END, -4],                                 // 收刀后按刀站定，基本站直
];
// 压低身体靠屈膝（骨架按腿自动算髋高），不整体压扁；开头落地蹲得比蓄势低，4 帧内起身
const LY_SQUASH: Key[] = [[1, 0.88], [5, 1], [END, 1]];
const LY_HEAD: Key[] = [
  [1, 10], [GO, 10],
  [84, 30], [86, 12], [88.7, 0], [93, -28], [98, -20],  // 越墙低头盯娜迦；fall 是 -17，方向一致
  [104, 22], [106, 35], [127, 35],                      // 出刀抬头：sheath_auto 10 → 22 → 35
  [135, 4], [END, 4],
];
// 大腿（相对躯干的前摆角）和膝（小腿往后折）。冲刺段由冲刺步态接管
const LEG_R: Key[] = [
  [1, 51], [GO, 51],                                    // 蓄势：右脚在前半蹲
  [84, 82], [85, 12], [86, -11], [90, -15],             // 起跳：右腿蹬直在后
  [93, 58], [98, 58],                                   // 滞空蓄势：battojutsu_dash@0.5，收腿
  [104, 90], [106, 100], [108, 106],                    // 俯冲迈右腿，落地成弓步：sheath_auto 收势
  [127, 106], [131, 32], [135, 8], [END, 8],            // 收刀起身：uchigatana_scrap
];
const KNEE_R: Key[] = [
  [1, 51], [GO, 51],
  [84, 77], [85, 49], [86, 38], [90, 43],
  [93, 57], [98, 57],
  [104, 72], [106, 68], [108, 73],
  [127, 73], [131, 10], [135, 8], [END, 8],
];
const LEG_L: Key[] = [
  [1, 19], [GO, 19],
  [84, 33], [85, 68], [86, 72], [90, 66],               // 起跳左膝前提
  [93, 74], [98, 76],
  [104, 25], [106, 8], [108, -6],
  [127, -6], [131, -15], [135, 0], [END, 0],
];
const KNEE_L: Key[] = [
  [1, 39], [GO, 39],
  [84, 83], [85, 49], [86, 35], [90, 39],
  [93, 57], [98, 57],
  [104, 38], [106, 30], [108, 20],
  [127, 20], [131, 2], [135, 4], [END, 4],
];
const GROUND: Key[] = [[1, 1], [84, 1], [85, 0], [105, 0], [106, 1], [END, 1]];
// 手臂、转身、刀取自动作数据的 rig（导出史诗战斗动作.py --rig）。
const ARM_R: Key[] = [
  [1, 21], [GO, 21],
  [84, -85], [85, -45], [86, -5], [90, -23],
  [93, 21], [98, 21],
  [100.4, 39], [101.6, 66], [102.8, 127], [104, 154], [105, 175], [106, 183], [108, 193],
  [127, 193],
  [129, 135], [130, 101], [131, 97], [133, 51], [135, 25],   // f131 手臂指向正前，之后换成等价的另一组解接回按刀姿势
  [END, 21],
];
const ARM_R_ROLL: Key[] = [
  [1, 79], [GO, 79], [84, -10], [86, -4], [90, -4], [93, 79], [98, 79],
  [100.4, 89], [101.6, 90], [102.8, 130], [104, 79], [105, 45], [106, 47], [108, 49],
  [127, 49], [129, 47], [130, 47], [131, 76], [133, 101], [135, 74], [END, 79],
];
const ELBOW_R: Key[] = [
  [1, 0], [GO, 0], [84, 85], [85, 70], [86, 36], [90, 69], [93, 0], [101.6, 0], [102.8, -45], [104, 0], [END, 0],
];
const ARM_L: Key[] = [
  [1, -66], [GO, -66],
  [84, -91], [85, -47], [86, -1], [90, -18],
  [93, -66], [98, -66],
  [100.4, -56], [101.6, -30], [102.8, -39], [104, -60], [105, -67], [106, -60], [108, -55],
  [127, -55], [129, -33], [130, -26], [131, -29], [133, 4], [135, -50], [END, -66],
];
const ARM_L_ROLL: Key[] = [
  [1, 3], [GO, 3], [84, -1], [86, -5], [90, -1], [93, 3], [98, 3],
  [100.4, -58], [101.6, -70], [102.8, -103], [104, -71], [105, -37], [106, -6], [108, -1],
  [127, -1], [129, -7], [130, -25], [131, -49], [133, -36], [135, 4], [END, 3],
];
const ELBOW_L: Key[] = [
  [1, 92], [GO, 92], [84, 94], [85, 83], [86, 52], [90, 82], [93, 92], [98, 92],
  [100.4, 110], [101.6, 88], [102.8, 55], [104, 73], [105, 74], [106, 61], [108, 56],
  [127, 56], [129, 61], [130, 38], [131, 34], [133, 77], [135, 78], [END, 92],
];
const LY_YAW: Key[] = [
  [1, 29], [GO, 29], [91, 0], [93, 29], [98, 29],
  [100.4, 38], [101.6, 43], [102.8, 48], [104, 33], [105, 18], [106, -4], [108, -17],
  [127, -17], [129, -28], [130, -17], [131, -4], [133, 11], [135, 29], [END, 29],
];
const LY_TWIST: Key[] = [
  [1, 18], [GO, 18], [91, 0], [93, 18], [98, 18],
  [100.4, 22], [101.6, 24], [102.8, 26], [104, 8], [105, -11], [106, -33], [108, -35],
  [127, -35], [129, 23], [131, 21], [133, 20], [135, 18], [END, 18],
];
const LY_HEAD_YAW: Key[] = [
  [1, -48], [GO, -48], [91, 0], [93, -48], [98, -48],
  [102.8, -50], [104, -25], [105, 2], [106, 36], [108, 55],
  [127, 55], [129, 4], [130, -6], [131, -18], [133, -32], [135, -48], [END, -48],
];
// 刀的方向（身体坐标系，去掉转身和前倾）：BLADE 是前后竖直面里的角，0 上 / 90 后 / 180 下 / 270 前；
// BLADE_SIDE 是刀尖往右偏出这个面多少度。握持点上怎么转由 骨架.tsx 的 bladeInHand 倒推
const BLADE: Key[] = [
  [1, 122], [98, 122],
  [100.4, 106], [101.6, 98], [102.8, 82],                  // 顺着鞘抽，刀角变化不大
  [104, 276],                                              // 一帧甩到正前：正是横穿娜迦身体的这一帧
  [105, 295], [106, 313], [108, 332],                      // 减速送到前上
  [127, 332], [129, 228], [130, 128], [131, 106], [133, 127], [135, 122],   // 刀落到身前、横过来对准鞘口、推进去
];
const BLADE_SIDE: Key[] = [
  [1, 11], [98, 11], [100.4, -20], [101.6, -26], [102.8, -31], [104, -9], [105, 14], [106, 39], [108, 44],
  [127, 44], [129, -29], [130, -52], [131, -30], [133, -28], [135, 11],
];
// 出鞘区间：f98 迅冲时拔刀，f135 收刀入鞘；区间外刀在鞘里，只露刀柄
const bladeOn = (f: number) => f >= 98 && f < 136;

const reach = (a: number, knee: number, pitch: number) => THIGH * Math.cos(rad(a + pitch)) + THIGH * Math.cos(rad(a + pitch - knee));

export const heading = (f: number) => sample(LY_HEADING, f);
// 李樱脚底的轨迹（不含姿态）：跟拍对比的机位按它跟
export const liyingLoc = (f: number) => lyLoc(f);

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
  delay?: (channel: LiyingChannel | 'bladeOn', frame: number) => number;
  overlay?: (pose: FigurePose, frame: number) => void;
  // 收刀节奏（见 收刀.ts）：不给按原版；'关' = 不加收刀约束（核对用）
  sheathTiming?: SheathTiming | '关';
};

// 姿态 + 收刀约束：收刀时刀由鞘带着插入，手用 IK 追刀柄和鞘口（收刀.ts，修过刀横穿身体的穿模）
export const liying = (frame: number, tweak?: LiyingTweak) => {
  const raw = liyingRaw(frame, tweak);
  if (tweak?.sheathTiming === '关') return { ...raw, sheath: undefined, sheathBlade: undefined };
  const timing = tweak?.sheathTiming ?? originalTiming;
  const constraint = 收刀约束(raw.pose, frame, timing, (t) => {
    const rawAt = liyingRaw(t, tweak);
    return [rawAt.pose, rawAt.blade, rawAt.bladeSide];
  });
  return { ...raw, bladeOn: constraint.bladeOut ?? raw.bladeOn, sheath: constraint.sheath, sheathBlade: constraint.blade };
};

const liyingRaw = (frame: number, tweak?: LiyingTweak) => {
  // 关键帧按停住 12 帧后的时间取（见 warp）；位置、跑步相位按实际帧
  const t = warp(frame);
  const k = (c: LiyingChannel) => sampleLag(tweak?.keys?.[c] ?? liyingKeys[c], frame, tweak?.delay?.(c, frame) ?? 0, warp);
  const phase = lyPhase(frame);
  const runWeight = sample(RUN_W, t);
  const mix = (key: number, run: number) => key + (run - key) * runWeight;
  const pitch = mix(k('pitch'), track(RUN_PITCH, frame));
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
  const loc = lyLoc(frame);
  const pose: FigurePose = {
    loc: [loc[0], loc[1], loc[2] + runWeight * (hipPx - 12) * LY_SCALE],
    pitch,
    squash: sample(LY_SQUASH, t),
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
    ground: sample(GROUND, t) * (1 - runWeight),
    yaw: heading(frame) + mix(k('yaw'), hipTurn),
    twist: mix(k('twist'), chestTurn),
  };
  tweak?.overlay?.(pose, frame);
  const tOn = warp(frame - (tweak?.delay?.('bladeOn', frame) ?? 0));
  return { pose, blade: k('blade'), bladeSide: k('bladeSide'), bladeOn: bladeOn(tOn) };
};

// 刀光（模型/特效/夜幕刀光.tsx 的夜幕阎魔刀拖尾）：刀开始甩出（t102.8，实际帧 114.8）到停住（t108，实际帧 120），之后 0.15 秒收完。
// 命中：f117 刀穿过脖子（同 `neckSlash` 那一帧），在脖子那节放命中闪光和血滴
export const bladeTrailFrames = { start: 102.8 + HOLD, end: 108 + HOLD, hit: 117 };

export const ghosts = (f: number): { f: number; opacity: number }[] =>
  f >= DASH0 + 1 && f <= DASH1 + 4 ? [1, 2, 3].map((d, i) => ({ f: f - d, opacity: 0.24 - i * 0.07 })).filter((g) => g.f >= DASH0) : [];

export const dust = (frame: number): [V3, number][] => {
  const out: [V3, number][] = [];
  const spawn = (f0: number, p: V3, life = 14) => out.push([p, (frame - f0) / life]);
  const [tx, ty] = lanePt(8, LY_OFF);
  for (const offset of [-0.3, 0.3]) spawn(TAKEOFF, [tx + HY * offset, ty - HX * offset, laneZ(8)], 16);
  // 滑行时朝东，尘团落在脚后（西边）、左右各一
  for (let k = 0; k < 7; k++) {
    const f0 = DASH1 + 1 + k;
    const [x, y] = lyLoc(f0);
    spawn(f0, [x - 0.3, y + (k % 2 ? 0.45 : -0.45), 0], 16);
  }
  return out;
};
