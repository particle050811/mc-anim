// 6-1-2 斩娜迦的声音：台词（src/配音/）和原版音效（src/音效/），落点挂在 编排.ts 的常量上。
// 编排里的时间是剧情帧（助跑中途跳过了一段，见 编排.ts 的 `story`），这里一律经 编排.ts 的 `segFrame` 换成段内帧（Remotion 帧）放。
// 台词：李樱「暮色的boss就算加强了十倍，也不过如此。」，滑停站稳就开口（编排.ts 的 `lineStartFrame`），没说完的后半截在 6-1-3 接着放（6-1-3 编排.ts 的 `nagaLineCarriesOver`）；
// 九胡「等等我啊，狗修金Sama！」在迷宫里开跑后边跑边喊（编排.ts 的 `MAZE_SHOUT`，用户 10-20），说进 6-1-3 的后半截那边接着放。
// 音效（照 1.20.1 和各模组，javap 核对过）：
// - 脚步：`Entity.playStepSound`，volume = soundType.volume × 0.15、pitch = soundType.pitch，放脚下方块的 step 声：林道、草地是 block.grass.step，
//   迷宫通道的石砖和中心空地的蚀刻娜迦石是 block.stone.step，按每步落在哪一格查 脚下方块.ts（片场存档读的）。游戏按走过的距离放，这里对着画面脚落地那一下放：
//   李樱按冲刺步态相位（编排.ts 的 `lyPhase`，u 过整数右脚、过半整数左脚落地），九胡按跑过的距离（`jhDist`、`mazeDist` 每过半个步幅 `JH_STRIDE` / 2 一声）。
//   起跳原版没有声音，蹬地那一下按最后一步放；迅冲斩完贴地滑停，落地、滑、停各一声。照游戏音量整片里基本听不到，照游戏放
//   （用户 10-11：脚步由 AI 生成，参考视频不再刻意让它听得见）。
// - 挥刀：刀光（编排.ts 的 `bladeTrailFrames`）甩出去那一下放夜幕挥刀的 efn:whoosh_light_1（volume 1、pitch 1，同 6-4-3）；
//   刀挥到正前方（`BLADE` 的 t104 = 剧情帧 116，拔刀剑斩击实体生成）后第 2 刻放 item.trident.throw（volume 0.8、pitch 0.625 + r × 0.1）。
// - 斩中：刀穿过脖子那一帧（`CUT_FRAME`）放史诗战斗的 epicfight:entity.hit.blade（volume 1、pitch 1，在被砍的实体处）和娜迦受伤声 naga.hurt（pitch (r1 − r2) × 0.2 + 1）。
// - 收刀：刀完全收进鞘（编排.ts 的 `sheathFrames.入鞘`）放拔刀剑的 block.chain.hit（SlashBlade `playQuickSheathSoundAction`：volume 1、pitch 1）。
//   史诗战斗 uchigatana_scrap 动画自己放的 epicfight:entity.weapon.sword_in 游戏音效.json 里没有，刀是拔刀剑的，按拔刀剑放。
// - 娜迦死：收刀的下一帧（`DIS`）两截自毁。`Naga.getDeathSound` 也是 NAGA_HURT，放在头那里；身体一节节自毁只有粒子没有声音。
// - 战利品箱冒出来（编排.ts 的 `chestAppearFrame`）：`IBossLootBuffer` 放 boss_chest.appear，volume 128、pitch (r1 − r2) × 0.175 + 0.5，在箱子处（等于不衰减）。
// - 九胡被瞬移进迷宫：女仆跟随传送（`EntityMaid.teleportToOwner`）没有声音，不加。
// - 开头接 6-1-1：九胡落地那一帧就是本段第 0 帧，6-1-1 的落地脚步、换维度的 block.portal.travel（9.5 秒）接着放；
//   本段末尾没放完的（宝箱冒出 7 秒、换维度的尾巴、九胡的脚步）由 6-1-3 的 声音.tsx 接着放（帧号挪 `FRAMES` − 1）。换维度音量依据见 6-1-1 的 声音.tsx 的 `portalSoundGain`。
// 听者 = 镜头机位（src/音效/游戏音效.tsx），坐标都是庭院本地坐标（同 6-1-1 暮色森林那一半、6-1-3）。
import React from 'react';
import { rng, type V3 } from '../../../../engine/model/parts.tsx';
import { LineTrack } from '../../../../world/配音/台词轨.tsx';
import { GameSoundTrack, randomPitch, type SoundCue } from '../../../../engine/audio/游戏音效.tsx';
import * as K11 from '../6-1-1/声音.tsx';
import * as choreo from './编排.ts';
import { hitStopFrames as 停顿于, sheathLateFrames, official } from './动作改进.ts';
import { stepSound } from './脚下方块.ts';

export const lineId = '6-1-2-李樱-不值一提';
export const jiuhuLineId = '6-1-3-九胡-等等我';
// 台词轨和口型（娜迦参考模型.tsx）共用：打击停顿以后的台词跟着往后挪
export const nagaLineCues = (hitStop: number) => [
  { id: lineId, 帧: choreo.lineStartFrame + hitStop },
  { id: jiuhuLineId, 帧: choreo.segFrame(choreo.S3 + choreo.MAZE_SHOUT) + hitStop },
];
const toRealFrame = (s: number) => choreo.segFrame(s) + 1;
const toStoryFrame = (f: number) => choreo.story(f);
const stepCue = (frame: number, p: number[], name: string, pick: number): SoundCue => ({ 名: name, 事件: stepSound(p), 帧: frame, 位置: [p[0], p[1], p[2]], 音量: 0.15, 音高: 1, 选: pick });

// 一个随实际帧单调增的量 q(f) 每过 步 一次就是一声：返回过的那一刻（实际帧，带小数，线性插值）
const crossings = (measure: (frame: number) => number, f0: number, f1: number, step: number) => {
  const out: number[] = [];
  for (let frame = f0; frame < f1; frame++) {
    const qStart = measure(frame);
    const qEnd = measure(frame + 1);
    for (let k = Math.floor(qStart / step) + 1; k * step <= qEnd; k++) out.push(frame + (k * step - qStart) / (qEnd - qStart));
  }
  return out;
};

// ---------- 九胡在迷宫里跑（6-1-3 接着用）：t = 传送后过了几帧（编排.ts 的 jiuhuMaze） ----------
// 每过半个步幅一声，停稳（MAZE_ARRIVE）时两脚叉开站稳再一声
export const mazeSteps = (t0: number, t1: number): { t: number; p: V3 }[] => {
  const ts = crossings(choreo.mazeDist, Math.floor(t0), Math.ceil(t1), choreo.JH_STRIDE / 2);
  if (choreo.MAZE_ARRIVE >= t0 && choreo.MAZE_ARRIVE < t1 && ts.every((t) => Math.abs(t - choreo.MAZE_ARRIVE) > 3)) ts.push(choreo.MAZE_ARRIVE);
  return ts.filter((t) => t >= t0 && t < t1).map((t) => ({ t, p: choreo.jiuhuMaze(t).pose.loc as V3 }));
};
// 迷宫里 t = 0 那一帧（S3）的段内帧
const mazeStartFrame = choreo.segFrame(choreo.S3);

const sounds: SoundCue[] = (() => {
  const rand = rng(6121);
  const out: SoundCue[] = [];
  // 李樱冲刺：起跑（GO）后步态权重拉满起，到起跳（TAKEOFF）为止，相位每过 0.5 一声
  const takeoffFrame = toRealFrame(choreo.TAKEOFF);
  const liyingSteps = crossings((f) => 2 * choreo.lyPhase(toStoryFrame(f)), choreo.GO + 2, takeoffFrame, 1).filter((f) => takeoffFrame - f > 1.5);
  for (const frame of [...liyingSteps, takeoffFrame]) out.push(stepCue(frame - 1, choreo.liying(toStoryFrame(Math.round(frame))).pose.loc, frame === takeoffFrame ? '李樱起跳蹬地' : '李樱脚步', rand()));
  // 九胡在林道上跑（晚 20 帧起跑），到切进迷宫（`S3`）为止。这一路都不在画面里，切到庭院后离镜头 60～130 米、隔着墙和树，照游戏衰减听不见；
  // 后半截跑到墙外水沟（游戏里是蹚水放游泳声），反正听不见，没改。
  for (const frame of crossings((x) => choreo.jhDist(toStoryFrame(x)), choreo.JH_GO, toRealFrame(choreo.S3), choreo.JH_STRIDE / 2))
    out.push(stepCue(frame - 1, choreo.jiuhu(toStoryFrame(Math.round(frame))).pose.loc, '九胡脚步', rand()));
  // 迅冲斩完贴地滑停：剧情帧 118 落地、121 滑、124 停（编排.ts 的 SLIDE）
  for (const storyFrame of [118, 121, 124]) out.push(stepCue(choreo.segFrame(storyFrame), choreo.liying(storyFrame).pose.loc, '李樱滑停', rand()));
  // 挥刀、斩击、斩中
  const swingStart = choreo.bladeTrailFrames.start;
  out.push({ 名: '挥刀', 事件: 'efn:whoosh_light_1', 帧: choreo.segFrame(swingStart), 位置: choreo.liying(Math.round(swingStart)).pose.loc as V3, 音量: 1, 音高: 1, 选: rand() });
  const slashFrame = 116 + (2 * 24) / 20; // 刀到正前方（t104 = 剧情帧 116）后第 2 刻
  out.push({ 名: '斩击', 事件: 'item.trident.throw', 帧: choreo.segFrame(slashFrame), 位置: choreo.liying(Math.round(slashFrame)).pose.loc as V3, 音量: 0.8, 音高: 0.625 + rand() * 0.1, 选: rand() });
  const cutPoint: V3 = [choreo.CUT_X, choreo.DASH_Y, 1];
  out.push({ 名: '刀砍中', 事件: 'epicfight:entity.hit.blade', 帧: choreo.segFrame(choreo.CUT_FRAME), 位置: cutPoint, 音量: 1, 音高: 1, 选: rand(), 档: '重' }); // 主角出招命中（用户 10-18 分档）
  out.push({ 名: '娜迦受伤', 事件: 'twilightforest:entity.twilightforest.naga.hurt', 帧: choreo.segFrame(choreo.CUT_FRAME), 位置: cutPoint, 音量: 1, 音高: randomPitch.voice(rand(), rand()), 选: rand() });
  // 收刀入鞘、娜迦死、宝箱冒出。娜迦死和台词同时，不用重档免得盖住台词
  out.push({ 名: '收刀入鞘', 事件: 'block.chain.hit', 帧: choreo.segFrame(choreo.sheathFrames.sheathed), 位置: choreo.liying(choreo.sheathFrames.sheathed).pose.loc as V3, 音量: 1, 音高: 1, 选: rand(), 档: '中' });
  out.push({ 名: '娜迦死', 事件: 'twilightforest:entity.twilightforest.naga.hurt', 帧: choreo.segFrame(choreo.DIS), 位置: choreo.naga(choreo.DIS).pose.head.loc as V3, 音量: 1, 音高: randomPitch.voice(rand(), rand()), 选: rand(), 档: '中' });
  const chestLoc = choreo.chest(choreo.chestAppearFrame).loc;
  out.push({ 名: '宝箱冒出', 事件: 'twilightforest:block.twilightforest.boss_chest.appear', 帧: choreo.segFrame(choreo.chestAppearFrame), 位置: [chestLoc[0], chestLoc[1], chestLoc[2] + 0.5], 音量: 128, 音高: (rand() - rand()) * 0.175 + 0.5, 选: rand() });
  // 九胡在迷宫里跑（6-1-3 接着跑完）
  // 单独一串随机数（种子同 6-1-3 的 声音.tsx）：末尾没放完的那几声 6-1-3 接着放，两段挑的是同一个文件
  const mazeRand = rng(6123);
  for (const step of mazeSteps(0, choreo.MAZE_T612 + 1)) out.push(stepCue(mazeStartFrame + step.t, step.p, '九胡迷宫脚步', mazeRand()));
  // 6-1-1 接过来的（6-1-1 末帧 = 本段第 0 帧）
  for (const sound of K11.twilightSounds) out.push({ ...sound, 帧: sound.帧 - K11.lastSegFrame });
  return out;
})();
export const nagaPortalSounds = K11.portalSounds.map((s) => ({ ...s, 帧: s.帧 - K11.lastSegFrame }));

const listener = (g: number) => choreo.camera(choreo.story(g + 1)).pos as V3;

// 打击停顿（正式版，见 动作改进.ts）：斩中那一下画面定格 `n` 帧，之后的台词、音效都往后挪 `n` 帧；斩中那一刻的刀砍中、娜迦受伤（帧 = `segFrame(CUT_FRAME)`）在定格第一帧响，不挪。听者也按定格后的时间轴取。`n` = 0 就是原版。
// 收刀晚：动作改进版把收刀拉长，入鞘晚这么多帧，娜迦自毁、宝箱冒出跟着晚（动作改进.ts 的 `nagaWarp`），收刀声、娜迦死、宝箱冒出三声跟着挪。
// 听者：换了机位（新机位）时按换过的机位听
const shiftBy = (n: number, sheathLateFrames: number) => (sound: SoundCue): SoundCue => {
  const hitFrame = choreo.segFrame(choreo.CUT_FRAME);
  const name = (sound as { 名?: string }).名 ?? '';
  return { ...sound, 帧: sound.帧 + (sound.帧 > hitFrame ? n : 0) + (['收刀入鞘', '娜迦死', '宝箱冒出'].includes(name) ? sheathLateFrames : 0) };
};
export const NagaShotSound: React.FC<{ hitStopFrames?: number; sheathLateFrames?: number; listener?: (frame: number) => { pos: number[] } }> = ({ hitStopFrames: hitStop = 0, sheathLateFrames = 0, listener: camFn }) => {
  const shift = shiftBy(hitStop, sheathLateFrames);
  const warpFrame = 停顿于(hitStop);
  const modified = hitStop > 0 || sheathLateFrames > 0 || camFn !== undefined;
  return (
    <>
      <LineTrack 句们={nagaLineCues(hitStop)} />
      <GameSoundTrack sounds={modified ? sounds.map(shift) : sounds} listener={modified ? (g) => (camFn ?? choreo.camera)(warpFrame(choreo.story(g + 1))).pos as V3 : listener} />
      <GameSoundTrack sounds={modified ? nagaPortalSounds.map(shift) : nagaPortalSounds} listener={() => [0, 0, 0]} />
    </>
  );
};
// 同步表、核对用（原版的帧号）
export const nagaShotSounds = sounds;
// 正式版（动作改进.ts 的 `official`：打击停顿、收刀晚 8）挪过的帧号：6-1-3 接着放 6-1-2 末尾没放完的声音按这个挪（6-1-3 第 0 帧 = 正式版末帧）
export const officialSounds = sounds.map(shiftBy(official.hitStopFrames, sheathLateFrames));
export const officialPortalSounds = nagaPortalSounds.map(shiftBy(official.hitStopFrames, sheathLateFrames));
