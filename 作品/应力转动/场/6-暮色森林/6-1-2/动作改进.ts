// 6-1-2 动作改进：「斩中 → 急停 → 收刀」（剧情帧 111～153）和前后的静止段。用户 10-13 嫌动作僵硬，
// 调研（参考模型库/预览/1013-纯渲染光影材质与动作/00-说明.md「二、人物动作」）：迅冲、急停、说台词都僵，出刀收刀各部位同一帧起停，插值不冲过头，斩中没有停顿。
// 只做其中四件（原版 编排.ts 的 `liying`() 不带改法的一点不变；用户 10-13 看完转正，原版改名 6-1-2-斩娜迦-旧动作，见文件末 `official`）：
// 1. 打击停顿：刀穿过脖子（`CUT_TIME`）时整个世界定格几帧，不闪白、不震屏（游戏里没有这种演出，用户 10-13、10-18 否了）；
// 2. 错开起止：出刀髋先动、胸、臂、刀依次跟上；收刀反过来手先动；收势换成允许冲过头的 back 插值；
// 3. 急停收势：120 米/秒急停时前倾、下沉、右臂前甩，按欠阻尼弹簧冲过再回弹；
// 4. 微动：迅冲时身体随气流起伏，站定后呼吸、头左右看、重心左右挪。
// 全部是剧情时间（秒）的纯函数（弹簧从固定起点积分打表），Remotion 每帧单独算也一样。注释里的「帧」是原来排的 1/24 秒一格。
import { exception } from '@engine/core/例外.ts';
import { type Key, holdTime } from '@engine/anim/anim.ts';
import { springTable } from '@engine/flight/真实飞行.ts';
import type { FigurePose } from '@库/角色/骨架.tsx';
import * as choreo from './编排.ts';
import type { SheathTiming } from '@库/物品/拔刀剑收刀.ts';
import { rad, smoothstep01 } from '@engine/core/数学.ts';
import { onTick } from '../时刻.ts';
// ---------- 1. 打击停顿 ----------
// 停 3 帧：刀穿过脖子那一帧连放 4 次（1/6 秒）。规矩表「打击停顿」的单位是帧（1/24 秒一格），这里换成秒用
export const nagaHitStop = exception('打击停顿', 3, { 段: '6-斩娜迦', 原因: '刀穿过脖子那帧连放 4 次；用户 10-21 定按看过的版本' });
const nagaHitStopSec = nagaHitStop / 24;
// 输出剧情时间 → 原剧情时间：在 CUT_TIME 停住 sec 秒，之后整体顺延（人、娜迦、刀光、粒子、镜头一起停）
export const hitStopTimes = (sec: number) => (sec > 0 ? holdTime([choreo.CUT_TIME, sec]) : (t: number) => t);

// ---------- 2. 错开起止 ----------
// 各通道晚几帧（负 = 提前）。刀（和出鞘开关）不挪：刀穿过脖子（f117）、收刀入鞘（f147）、刀光和音效都挂在刀上，所以身体相对刀提前（出刀）或推后（收刀）。
// 出刀：转身提前 4 帧、腿提前 3 帧（髋先发力），胸扭转、头左右提前 3 帧，抬头提前 2 帧，手臂提前 1 帧，刀最后甩出。
// 转身、胸比整数梯子多提前 1 帧：原版转身、胸本来就比刀晚 2 帧到最快，不多提前峰值还和刀挤在同一帧（剧情帧 115～116）。
// 前倾不挪：出刀时的前倾是俯冲轨迹的姿态，提前了人会在冲过脖子前就抬起身
const drawDelays: Partial<Record<choreo.LiyingChannel, number>> = {
  legR: -3 / 24, legL: -3 / 24, kneeR: -3 / 24, kneeL: -3 / 24, yaw: -4 / 24,
  twist: -3 / 24, head: -2 / 24, headYaw: -3 / 24,
  armR: -1 / 24, armRRoll: -1 / 24, elbowR: -1 / 24, armL: -1 / 24, armLRoll: -1 / 24, elbowL: -1 / 24,
};
// 收刀：手先动（手臂提前 1 帧），刀不挪，身体跟着 `sheathTimingV2` 往后挪（刀从右侧翻到身前时胸跟着拧回来）：胸扭转、头晚 5 帧，转身晚 6 帧，前倾、腿晚 8 帧（参考里刀往鞘里滑时从半蹲站起来）。
// 手臂由 收刀.ts 的 IK 追刀柄、鞘口，这里的手臂延迟只管松手后回按刀那一下
const sheathDelays: Partial<Record<choreo.LiyingChannel, number>> = {
  armR: -1 / 24, armRRoll: -1 / 24, elbowR: -1 / 24, armL: -1 / 24, armLRoll: -1 / 24, elbowL: -1 / 24,
  twist: 5 / 24, head: 5 / 24, headYaw: 5 / 24,
  yaw: 0.25,
  pitch: 8 / 24, legR: 8 / 24, legL: 8 / 24, kneeR: 8 / 24, kneeL: 8 / 24,
};
// 收刀节奏（剧情帧，打击停顿之前）：照参考（AI 生成的收刀，126～145 帧）：刀先横在右侧停一拍、3 帧翻到身前刀尖进鞘口、7 帧滑进去，入鞘后右手一直按刀柄。
// 这里 139 起、143～145 横在右侧、148 刀尖进鞘口、155 入鞘（原版 147，晚 8 帧；娜迦自毁、宝箱跟着晚，见 `nagaWarp`），按着刀柄说完台词，185～195 松手、鞘转回腰上（6-1-3 接松手以后的样子）
export const sheathTimingV2: SheathTiming = { start: 139 / 24, side: [143 / 24, 145 / 24], tipIn: 148 / 24, sheathed: 155 / 24, release: [185 / 24, 195 / 24] };
export const sheathLate = sheathTimingV2.sheathed - choreo.sheathTimes.sheathed;
// 娜迦、宝箱的时间：原版入鞘的下一帧（DIS）娜迦两截炸开。新版入鞘晚了 `sheathLate` 秒，娜迦在剧情帧 144 停住这么多帧（它已快爬停，0.07 格/帧看不出），炸开、宝箱跟着晚
export const nagaWarp = holdTime([144 / 24, sheathLate]);
// 换挡时刻选在所有通道都停着的地方：剧情帧 100 在迅冲停住段（98～110）里；130 在出刀收势后、收刀前的静止段（108～127）里
const delay = (channel: choreo.LiyingChannel | 'bladeOn', t: number) => {
  if (channel === 'bladeOn') return 0;
  if (t < 100 / 24) return 0;
  return (t < 130 / 24 ? drawDelays : sheathDelays)[channel] ?? 0;
};

// 收尾冲过头：把收势的几段换成 back（冲过终值约 10% 再退回），终点往后挪 1～3 帧留出退回时间。关键帧时间是停住 12 帧前的 t
const replaceKeys = (keys: Key[], dropTimes: number[], addKeys: Key[]): Key[] =>
  [...keys.filter(([k]) => !dropTimes.includes(k)), ...addKeys].sort((a, b) => a[0] - b[0]);
const backEase = 'back' as const;
const keyOverrides: Partial<Record<choreo.LiyingChannel, Key[]>> = {
  // 出刀：转身、胸、头的甩出（t104 刀到正前以后）冲过再回来；刀 t105（斩中那一帧）照旧，之后的送刀冲过一点
  yaw: replaceKeys(choreo.liyingKeys.yaw, [104 / 24, 105 / 24, 106 / 24, 108 / 24, 131 / 24, 133 / 24, 135 / 24], [[104 / 24, 33, backEase], [109 / 24, -17], [131 / 24, -4, backEase], [136 / 24, 29]]),
  twist: replaceKeys(choreo.liyingKeys.twist, [104 / 24, 105 / 24, 106 / 24, 108 / 24], [[104 / 24, 8, backEase], [109 / 24, -35]]),
  headYaw: replaceKeys(choreo.liyingKeys.headYaw, [104 / 24, 105 / 24, 106 / 24, 108 / 24], [[104 / 24, -25, backEase], [109 / 24, 55]]),
  blade: replaceKeys(choreo.liyingKeys.blade, [105 / 24, 106 / 24, 108 / 24], [[105 / 24, 295, backEase], [110 / 24, 332]]),
  // 收刀起身：前倾 -35 → -4 站直、头 35 → 4 回正、右腿收回，都冲过一点（微微后仰、点一下头）再站稳
  pitch: replaceKeys(choreo.liyingKeys.pitch, [127 / 24, 135 / 24], [[127 / 24, -35, backEase], [137 / 24, -4]]),
  head: replaceKeys(choreo.liyingKeys.head, [127 / 24, 135 / 24], [[127 / 24, 35, backEase], [137 / 24, 4]]),
  legR: replaceKeys(choreo.liyingKeys.legR, [131 / 24, 135 / 24], [[131 / 24, 32, backEase], [136 / 24, 8]]),
};

// ---------- 3. 急停收势：欠阻尼弹簧 ----------
// 120 米/秒落地滑停（剧情帧 118～124，见 编排.ts 的 `SLIDE`），上身、腰腿、举刀右臂被惯性往前甩再弹回。
// 弹簧 x'' = ω²(u − x) − 2ζω·x'，ζ 0.45、ω 14 rad/s，u 是减速几帧的「惯性推力」（平滑鼓包），x 是叠在关键帧上的偏移。从剧情帧 110 起积分，按帧查表，和前一帧状态无关。
const decelPush = (t: number) => smoothstep01((t - 117.5 / 24) / (2 / 24)) * (1 - smoothstep01((t - 121 / 24) / (3 / 24)));
const makeSpring = (amp: number) => {
  const table = springTable((t) => amp * decelPush(t), 110 / 24, 160 / 24, 14, 0.45);
  // 剧情帧 137～141 收到 0，接收刀（之后的残余不到 0.1°，收掉免得叠进收刀）
  return (t: number) => (t < 110 / 24 ? 0 : table(t).value * (1 - smoothstep01((t - 137 / 24) / (4 / 24))));
};
const pitchSpring = makeSpring(-16); // 上身往前扑（负 = 前倾）
const sinkSpring = makeSpring(16); // 屈髋屈膝往下坐（大腿前摆、膝折两倍，骨架按腿算髋高，脚不离地）
const armRSpring = makeSpring(20); // 举刀的右臂往前上甩

// ---------- 4. 微动 ----------
// 迅冲（剧情帧 95～112，原来停住时人一动不动平移 86 格）：身子随气流起伏，腿、左臂跟着飘
const dashWeight = (t: number) => smoothstep01((t - 94 / 24) / (3 / 24)) * (1 - smoothstep01((t - 110 / 24) / (3 / 24)));
// 站定（剧情帧 123 起渐入）：呼吸 1.6 秒一次，头 2.6 秒左右看一个来回（±2°），重心 3.4 秒左右挪（两腿一起侧摆 ±1.2°，脚底反方向补回去，脚不滑）。周期互不整除，不会重复一模一样
const standWeight = (t: number) => smoothstep01((t - 123 / 24) / (14 / 24));
const cycle = (t: number, periodSec: number, phase = 0) => Math.sin((2 * Math.PI * t) / periodSec + phase);

const overlay = (pose: FigurePose, t: number) => {
  const lean = pitchSpring(t);
  const sink = sinkSpring(t);
  pose.pitch += lean;
  pose.headPitch -= 0.5 * lean; // 头不跟着全甩：眼睛还盯着前面
  pose.legR += sink;
  pose.legL += sink;
  pose.kneeR = (pose.kneeR ?? 0) + 2 * sink;
  pose.kneeL = (pose.kneeL ?? 0) + 2 * sink;
  pose.armR += armRSpring(t);
  const dashW = dashWeight(t);
  if (dashW > 0) {
    pose.pitch += 2.5 * dashW * cycle(t, 0.42);
    pose.headPitch -= 1.5 * dashW * cycle(t, 0.42);
    pose.legR += 4 * dashW * cycle(t, 0.5, 1);
    pose.legL += 3 * dashW * cycle(t, 0.5, 2.6);
    pose.armL += 3 * dashW * cycle(t, 0.37, 0.5);
    pose.twist = (pose.twist ?? 0) + 1.5 * dashW * cycle(t, 0.6, 2);
  }
  const standW = standWeight(t);
  if (standW > 0) {
    const breath = cycle(t, 1.6);
    pose.pitch += 1.2 * standW * breath;
    pose.headPitch -= 0.6 * standW * breath;
    pose.armR += 0.8 * standW * breath;
    pose.armL += 0.8 * standW * breath;
    pose.headYaw += 2 * standW * cycle(t, 2.6, 1.3);
    const swayDeg = 1.2 * standW * cycle(t, 3.4, 0.7);
    pose.legRRoll = (pose.legRRoll ?? 0) + swayDeg;
    pose.legLRoll = (pose.legLRoll ?? 0) - swayDeg;
    // 两腿往左摆 r 度，脚底往左挪了 12 像素 × sin r；人整体往右挪回去，髋就往右、脚原地不动
    const shift = ((12 * Math.sin(rad(swayDeg))) * 1.875) / 32;
    const y = rad(pose.yaw ?? 0);
    pose.loc = [pose.loc[0] + shift * Math.cos(y), pose.loc[1] + shift * Math.sin(y), pose.loc[2]];
  }
};

export const liyingTweakV2: choreo.LiyingTweak = { keys: keyOverrides, delay, overlay, sheathTiming: sheathTimingV2 };
export const liyingV2 = (t: number) => choreo.liying(t, liyingTweakV2);
// 核对用
export const stopSprings = { leanForwardSpring: pitchSpring, sinkSpring: sinkSpring, rightArmSpring: armRSpring };

// ---------- 新机位（用户 10-13：镜头里人太小，收刀要像参考那样拉近）----------
// 只给正式版用，旧动作版机位不动。
// - 侧跟迅冲（S2～S2C）：机位水平方向往人身上推近到 55%、高度差不变（原来高 8 格是为高过树冠，连高度一起推近会钻进西墙外树冠）；
// - 俯拍斩击（S2C～S2B）：顺着原视线推近到 55%（庭院中心上空没有遮挡）；
// 收刀（S2B～S3）：照参考换成正面略偏的低机位近景：机位在他东边偏北 5.6 格、离地 1.15 格（0.75 格在草丛里挡住下半身），平视略仰，42mm，人约占画面高一半
const pushIn = (c: { lens: number; pos: number[]; tgt: number[] }, k: number, pushHeight = true) => ({
  ...c,
  pos: c.pos.map((v, i) => (i === 2 && !pushHeight ? v : c.tgt[i] + (v - c.tgt[i]) * k)),
});
export const cameraV2 = (t: number) => {
  const baseCam = choreo.camera(t);
  if (t >= choreo.S2 && t < choreo.S2C) return pushIn(baseCam, 0.55, false);
  if (t >= choreo.S2C && t < choreo.S2B) return pushIn(baseCam, 0.55);
  if (t >= choreo.S2B && t < choreo.S3) return { lens: 42, pos: [2.6 + 5.2, -0.8 + 2.2, 1.15], tgt: [2.6, -0.8, 1.0] };
  return baseCam;
};

// ---------- 正式版（用户 10-13 看完新旧对比「就这样可以」，新版转正） ----------
// 正式 Composition 6-1-2-斩娜迦 = 动作改进 + 打击停顿 3 帧 + 新机位，不震屏（用户 10-18 嫌冲击镜头不好）、不闪白。凡要和正式 6-1-2 同帧对齐的（伤害数字层、6-1-3 接台词和声音、6-1-3 首帧接末帧的李樱）都从这里取，
// 不要拿 编排.ts 的 `LENGTH`、台词开口、`liying`（原版时间轴）
export const official = { motionImproved: true, hitStopSec: nagaHitStopSec, newCams: true } as const;
// 正式版段长（秒，不含）：末帧在 officialLength − 1/24
export const officialLength = choreo.LENGTH + official.hitStopSec;
// 落到刻上，同 娜迦参考模型.tsx 的 `nagaShotCam`
export const officialStoryTime = (sec: number) => onTick(hitStopTimes(official.hitStopSec)(choreo.story(sec + 1 / 24)));
// 剧情时间 → 正式版段内秒：剧情时间第一次到这一刻的段内秒（真值，不再落到 1/24 秒的格上，用户 11-16 定；切镜的剧情时间换成段内秒，第 1 场段界用）。
// 每 1/240 秒往后找到第一个到了的点，再在前一步里二分
const SEC_OF_SCAN_STEP = 1 / 240;
export const officialSecOf = (storyTime: number) => {
  const reached = (sec: number) => officialStoryTime(sec) >= storyTime;
  if (reached(0)) return 0;
  let k = 1;
  while (k * SEC_OF_SCAN_STEP < officialLength && !reached(k * SEC_OF_SCAN_STEP)) k++;
  if (k * SEC_OF_SCAN_STEP >= officialLength) return officialLength;
  let lo = (k - 1) * SEC_OF_SCAN_STEP;
  let hi = k * SEC_OF_SCAN_STEP;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (reached(mid)) hi = mid;
    else lo = mid;
  }
  return onTick(hi);
};
// 台词开口（编排 的 `lineStoryTime`，滑停站稳）在打击停顿之后，段内秒跟着晚停顿那么久
export const officialLineStart = choreo.segSec(choreo.lineStoryTime) + official.hitStopSec;
// 九胡在迷宫里开跑后喊的那句（编排.ts 的 `MAZE_SHOUT`），同样晚停顿那么久
export const officialJiuhuLineStart = choreo.segSec(choreo.S3 + choreo.MAZE_SHOUT) + official.hitStopSec;
// 正式版的李樱（6-1-3 首帧接末帧、站定的呼吸接着往下演都用它）
export const officialLiying = liyingV2;
