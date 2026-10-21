// 6-1-2 动作改进：「斩中 → 急停 → 收刀」（剧情帧 111～153）和前后的静止段。用户 10-13 嫌动作僵硬，
// 调研（参考模型库/预览/1013-纯渲染光影材质与动作/00-说明.md「二、人物动作」）：迅冲、急停、说台词都僵，出刀收刀各部位同一帧起停，插值不冲过头，斩中没有停顿。
// 只做其中四件（原版 编排.ts 的 `liying`() 不带改法的一点不变；用户 10-13 看完转正，原版改名 6-1-2-斩娜迦-旧动作，见文件末 `official`）：
// 1. 打击停顿：刀穿过脖子（`CUT_FRAME`）时整个世界定格几帧，不闪白、不震屏（游戏里没有这种演出，用户 10-13、10-18 否了）；
// 2. 错开起止：出刀髋先动、胸、臂、刀依次跟上；收刀反过来手先动；收势换成允许冲过头的 back 插值；
// 3. 急停收势：120 米/秒急停时前倾、下沉、右臂前甩，按欠阻尼弹簧冲过再回弹；
// 4. 微动：迅冲时身体随气流起伏，站定后呼吸、头左右看、重心左右挪。
// 全部是剧情帧的纯函数（弹簧从固定起点积分打表），Remotion 每帧单独算也一样。
import { Key, rad, holdTime } from '../../../../engine/anim/anim.ts';
import { springTable } from '../../../../engine/flight/真实飞行.ts';
import type { FigurePose } from '../../../../world/角色/骨架.tsx';
import * as choreo from './编排.ts';
import type { SheathTiming } from '../../../../world/物品/拔刀剑收刀.ts';

const ss = (x: number) => { const clamped = Math.min(1, Math.max(0, x)); return clamped * clamped * (3 - 2 * clamped); };

// ---------- 1. 打击停顿 ----------
// 停 3 帧：刀穿过脖子那一帧连放 4 次（1/6 秒）
// 规矩例外（打击停顿）：不用默认的 `HIT_STOP_FRAMES`（lib/anim.ts，1 帧），用户 10-21 定按看过的版本
export const nagaHitStop = 3;
// 输出剧情帧 → 原剧情帧：在 CUT_FRAME 停住 n 帧，之后整体顺延 n 帧（人、娜迦、刀光、粒子、镜头一起停）
export const hitStopFrames = (n: number) => (n > 0 ? holdTime([choreo.CUT_FRAME, n]) : (f: number) => f);

// ---------- 2. 错开起止 ----------
// 各通道晚几帧（负 = 提前）。刀（和出鞘开关）不挪：刀穿过脖子（f117）、收刀入鞘（f147）、刀光和音效都挂在刀上，所以身体相对刀提前（出刀）或推后（收刀）。
// 出刀：转身提前 4 帧、腿提前 3 帧（髋先发力），胸扭转、头左右提前 3 帧，抬头提前 2 帧，手臂提前 1 帧，刀最后甩出。
// 转身、胸比整数梯子多提前 1 帧：原版转身、胸本来就比刀晚 2 帧到最快，不多提前峰值还和刀挤在同一帧（剧情帧 115～116）。
// 前倾不挪：出刀时的前倾是俯冲轨迹的姿态，提前了人会在冲过脖子前就抬起身
const drawDelays: Partial<Record<choreo.LiyingChannel, number>> = {
  legR: -3, legL: -3, kneeR: -3, kneeL: -3, yaw: -4,
  twist: -3, head: -2, headYaw: -3,
  armR: -1, armRRoll: -1, elbowR: -1, armL: -1, armLRoll: -1, elbowL: -1,
};
// 收刀：手先动（手臂提前 1 帧），刀不挪，身体跟着 `sheathTimingV2` 往后挪（刀从右侧翻到身前时胸跟着拧回来）：胸扭转、头晚 5 帧，转身晚 6 帧，前倾、腿晚 8 帧（参考里刀往鞘里滑时从半蹲站起来）。
// 手臂由 收刀.ts 的 IK 追刀柄、鞘口，这里的手臂延迟只管松手后回按刀那一下
const sheathDelays: Partial<Record<choreo.LiyingChannel, number>> = {
  armR: -1, armRRoll: -1, elbowR: -1, armL: -1, armLRoll: -1, elbowL: -1,
  twist: 5, head: 5, headYaw: 5,
  yaw: 6,
  pitch: 8, legR: 8, legL: 8, kneeR: 8, kneeL: 8,
};
// 收刀节奏（剧情帧，打击停顿之前）：照参考（AI 生成的收刀，126～145 帧）：刀先横在右侧停一拍、3 帧翻到身前刀尖进鞘口、7 帧滑进去，入鞘后右手一直按刀柄。
// 这里 139 起、143～145 横在右侧、148 刀尖进鞘口、155 入鞘（原版 147，晚 8 帧；娜迦自毁、宝箱跟着晚，见 `nagaWarp`），按着刀柄说完台词，185～195 松手、鞘转回腰上（6-1-3 接松手以后的样子）
export const sheathTimingV2: SheathTiming = { start: 139, side: [143, 145], tipIn: 148, sheathed: 155, release: [185, 195] };
export const sheathLateFrames = sheathTimingV2.sheathed - choreo.sheathFrames.sheathed;
// 娜迦、宝箱的时间：原版入鞘的下一帧（DIS）娜迦两截炸开。新版入鞘晚了 `sheathLateFrames` 帧，娜迦在剧情帧 144 停住这么多帧（它已快爬停，0.07 格/帧看不出），炸开、宝箱跟着晚
export const nagaWarp = holdTime([144, sheathLateFrames]);
// 换挡时刻选在所有通道都停着的地方：剧情帧 100 在迅冲停住段（98～110）里；130 在出刀收势后、收刀前的静止段（108～127）里
const delay = (channel: choreo.LiyingChannel | 'bladeOn', frame: number) => {
  if (channel === 'bladeOn') return 0;
  if (frame < 100) return 0;
  return (frame < 130 ? drawDelays : sheathDelays)[channel] ?? 0;
};

// 收尾冲过头：把收势的几段换成 back（冲过终值约 10% 再退回），终点往后挪 1～3 帧留出退回时间。关键帧时间是停住 12 帧前的 t
const replaceKeys = (keys: Key[], dropTimes: number[], addKeys: Key[]): Key[] =>
  [...keys.filter(([k]) => !dropTimes.includes(k)), ...addKeys].sort((a, b) => a[0] - b[0]);
const backEase = 'back' as const;
const keyOverrides: Partial<Record<choreo.LiyingChannel, Key[]>> = {
  // 出刀：转身、胸、头的甩出（t104 刀到正前以后）冲过再回来；刀 t105（斩中那一帧）照旧，之后的送刀冲过一点
  yaw: replaceKeys(choreo.liyingKeys.yaw, [104, 105, 106, 108, 131, 133, 135], [[104, 33, backEase], [109, -17], [131, -4, backEase], [136, 29]]),
  twist: replaceKeys(choreo.liyingKeys.twist, [104, 105, 106, 108], [[104, 8, backEase], [109, -35]]),
  headYaw: replaceKeys(choreo.liyingKeys.headYaw, [104, 105, 106, 108], [[104, -25, backEase], [109, 55]]),
  blade: replaceKeys(choreo.liyingKeys.blade, [105, 106, 108], [[105, 295, backEase], [110, 332]]),
  // 收刀起身：前倾 -35 → -4 站直、头 35 → 4 回正、右腿收回，都冲过一点（微微后仰、点一下头）再站稳
  pitch: replaceKeys(choreo.liyingKeys.pitch, [127, 135], [[127, -35, backEase], [137, -4]]),
  head: replaceKeys(choreo.liyingKeys.head, [127, 135], [[127, 35, backEase], [137, 4]]),
  legR: replaceKeys(choreo.liyingKeys.legR, [131, 135], [[131, 32, backEase], [136, 8]]),
};

// ---------- 3. 急停收势：欠阻尼弹簧 ----------
// 120 米/秒落地滑停（剧情帧 118～124，见 编排.ts 的 `SLIDE`），上身、腰腿、举刀右臂被惯性往前甩再弹回。
// 弹簧 x'' = ω²(u − x) − 2ζω·x'，ζ 0.45、ω 14 rad/s，u 是减速几帧的「惯性推力」（平滑鼓包），x 是叠在关键帧上的偏移。从剧情帧 110 起积分，按帧查表，和前一帧状态无关。
const decelPush = (f: number) => ss((f - 117.5) / 2) * (1 - ss((f - 121) / 3));
const makeSpring = (amp: number) => {
  const table = springTable((t) => amp * decelPush(t * choreo.FPS), 110 / choreo.FPS, 160 / choreo.FPS, 14, 0.45);
  // 剧情帧 137～141 收到 0，接收刀（之后的残余不到 0.1°，收掉免得叠进收刀）
  return (f: number) => (f < 110 ? 0 : table(f / choreo.FPS).value * (1 - ss((f - 137) / 4)));
};
const pitchSpring = makeSpring(-16); // 上身往前扑（负 = 前倾）
const sinkSpring = makeSpring(16); // 屈髋屈膝往下坐（大腿前摆、膝折两倍，骨架按腿算髋高，脚不离地）
const armRSpring = makeSpring(20); // 举刀的右臂往前上甩

// ---------- 4. 微动 ----------
// 迅冲（剧情帧 95～112，原来停住时人一动不动平移 86 格）：身子随气流起伏，腿、左臂跟着飘
const dashWeight = (f: number) => ss((f - 94) / 3) * (1 - ss((f - 110) / 3));
// 站定（剧情帧 123 起渐入）：呼吸 1.6 秒一次，头 2.6 秒左右看一个来回（±2°），重心 3.4 秒左右挪（两腿一起侧摆 ±1.2°，脚底反方向补回去，脚不滑）。周期互不整除，不会重复一模一样
const standWeight = (f: number) => ss((f - 123) / 14);
const cycle = (f: number, periodSec: number, phase = 0) => Math.sin((2 * Math.PI * f) / (periodSec * choreo.FPS) + phase);

const overlay = (pose: FigurePose, frame: number) => {
  const lean = pitchSpring(frame);
  const sink = sinkSpring(frame);
  pose.pitch += lean;
  pose.headPitch -= 0.5 * lean; // 头不跟着全甩：眼睛还盯着前面
  pose.legR += sink;
  pose.legL += sink;
  pose.kneeR = (pose.kneeR ?? 0) + 2 * sink;
  pose.kneeL = (pose.kneeL ?? 0) + 2 * sink;
  pose.armR += armRSpring(frame);
  const dashW = dashWeight(frame);
  if (dashW > 0) {
    pose.pitch += 2.5 * dashW * cycle(frame, 0.42);
    pose.headPitch -= 1.5 * dashW * cycle(frame, 0.42);
    pose.legR += 4 * dashW * cycle(frame, 0.5, 1);
    pose.legL += 3 * dashW * cycle(frame, 0.5, 2.6);
    pose.armL += 3 * dashW * cycle(frame, 0.37, 0.5);
    pose.twist = (pose.twist ?? 0) + 1.5 * dashW * cycle(frame, 0.6, 2);
  }
  const standW = standWeight(frame);
  if (standW > 0) {
    const breath = cycle(frame, 1.6);
    pose.pitch += 1.2 * standW * breath;
    pose.headPitch -= 0.6 * standW * breath;
    pose.armR += 0.8 * standW * breath;
    pose.armL += 0.8 * standW * breath;
    pose.headYaw += 2 * standW * cycle(frame, 2.6, 1.3);
    const swayDeg = 1.2 * standW * cycle(frame, 3.4, 0.7);
    pose.legRRoll = (pose.legRRoll ?? 0) + swayDeg;
    pose.legLRoll = (pose.legLRoll ?? 0) - swayDeg;
    // 两腿往左摆 r 度，脚底往左挪了 12 像素 × sin r；人整体往右挪回去，髋就往右、脚原地不动
    const shift = ((12 * Math.sin(rad(swayDeg))) * 1.875) / 32;
    const y = rad(pose.yaw ?? 0);
    pose.loc = [pose.loc[0] + shift * Math.cos(y), pose.loc[1] + shift * Math.sin(y), pose.loc[2]];
  }
};

export const liyingTweakV2: choreo.LiyingTweak = { keys: keyOverrides, delay, overlay, sheathTiming: sheathTimingV2 };
export const liyingV2 = (f: number) => choreo.liying(f, liyingTweakV2);
// 核对用
export const stopSprings = { 前倾弹簧: pitchSpring, 下沉弹簧: sinkSpring, 右臂弹簧: armRSpring };

// ---------- 新机位（用户 10-13：镜头里人太小，收刀要像参考那样拉近）----------
// 只给正式版用，旧动作版机位不动。
// - 侧跟迅冲（S2～S2C）：机位水平方向往人身上推近到 55%、高度差不变（原来高 8 格是为高过树冠，连高度一起推近会钻进西墙外树冠）；
// - 俯拍斩击（S2C～S2B）：顺着原视线推近到 55%（庭院中心上空没有遮挡）；
// 收刀（S2B～S3）：照参考换成正面略偏的低机位近景：机位在他东边偏北 5.6 格、离地 1.15 格（0.75 格在草丛里挡住下半身），平视略仰，42mm，人约占画面高一半
const pushIn = (c: { lens: number; pos: number[]; tgt: number[] }, k: number, pushHeight = true) => ({
  ...c,
  pos: c.pos.map((v, i) => (i === 2 && !pushHeight ? v : c.tgt[i] + (v - c.tgt[i]) * k)),
});
export const cameraV2 = (frame: number) => {
  const baseCam = choreo.camera(frame);
  if (frame >= choreo.S2 && frame < choreo.S2C) return pushIn(baseCam, 0.55, false);
  if (frame >= choreo.S2C && frame < choreo.S2B) return pushIn(baseCam, 0.55);
  if (frame >= choreo.S2B && frame < choreo.S3) return { lens: 42, pos: [2.6 + 5.2, -0.8 + 2.2, 1.15], tgt: [2.6, -0.8, 1.0] };
  return baseCam;
};

// ---------- 正式版（用户 10-13 看完新旧对比「就这样可以」，新版转正） ----------
// 正式 Composition 6-1-2-斩娜迦 = 动作改进 + 打击停顿 3 帧 + 新机位，不震屏（用户 10-18 嫌冲击镜头不好）、不闪白。凡要和正式 6-1-2 同帧对齐的（伤害数字层、6-1-3 接台词和声音、6-1-3 首帧接末帧的李樱）都从这里取，
// 不要拿 编排.ts 的 `FRAMES`、台词开口、`liying`（原版时间轴）
export const official = { 动作改进: true, hitStopFrames: nagaHitStop, newCams: true } as const;
export const officialFrames = choreo.FRAMES + official.hitStopFrames;
export const officialStoryFrame = (frame: number) => hitStopFrames(official.hitStopFrames)(choreo.story(frame + 1));
// 剧情帧 → 正式版段内帧：这一剧情帧第一次出现的那一帧（切镜的剧情帧换成段内帧，第 1 场段界用）
export const officialFrameOf = (storyFrame: number) => {
  let frame = 0;
  while (frame < officialFrames && officialStoryFrame(frame) < storyFrame) frame++;
  return frame;
};
// 台词开口（编排 的 `lineStoryFrame`，滑停站稳）在打击停顿之后，段内帧跟着晚停顿的帧数
export const officialLineStart = choreo.segFrame(choreo.lineStoryFrame) + official.hitStopFrames;
// 九胡在迷宫里开跑后喊的那句（编排.ts 的 `MAZE_SHOUT`），同样晚停顿的帧数
export const officialJiuhuLineStart = choreo.segFrame(choreo.S3 + choreo.MAZE_SHOUT) + official.hitStopFrames;
// 正式版的李樱（6-1-3 首帧接末帧、站定的呼吸接着往下演都用它）
export const officialLiying = liyingV2;
