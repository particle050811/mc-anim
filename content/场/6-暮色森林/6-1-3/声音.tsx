// 6-1-3 起飞的声音：台词（src/配音/）和原版音效（src/音效/），落点挂在 编排.ts 的 `lineFrames`、`beats` 上。配乐不在这里（起飞.tsx 的 <段配乐>，晚 `musicDelay` 帧进，drop 落在起飞那一帧）。
//
// 台词：
// - 李樱「暮色的boss就算加强了十倍，也不过如此。」：6-1-2 滑停站稳时开口（`lineFrames`.娜迦，负的 = 在 6-1-2 里开口），说进本段的话放剩下的半截；
// - 九胡「等等我啊，狗修金Sama！」：6-1-2 迷宫那一镜开跑后边跑边喊（`lineFrames`.jiuhu，负的；用户 10-20），本段放说进来的后半截。
// - 李樱「坐好了，看我速通暮色！」：唤出的扫帚停稳就说（`lineFrames`.速通，用户 10-20）。
// 音效（照 1.20.1 和车万女仆 1.5.3，javap 核对过）：
// - 九胡跑过来的脚步、刹住：同 6-1-2 的 声音.tsx 的 `mazeSteps`（每过半个步幅一声，停稳再一声；volume 0.15、pitch 1，石砖/蚀刻娜迦石放 block.stone.step，草放 block.grass.step，按每步落在哪格查 6-1-2 的 脚下方块.ts）。
// 用户 10-11 定：成片脚步由 AI 生成，参考视频不再刻意让脚步听得见。时间 t 接着 6-1-2 的迷宫时间（本段第 f 帧 = t − 6-1-2 末帧的 t），开头那几声是 6-1-2 末尾没放完的，同一组声音接着放。
// - 唤出扫帚：车万女仆 `ItemBroom.useOn` 放 block.wool.place，volume 0.75、pitch 0.8，在扫帚那里（`beats`.唤出）。
// - 跨上扫帚：原版骑乘没有声音；两人前蹲一下跳上去，蹬地那一下按脚步放（李樱上、九胡上 前 8 帧，跳起那帧）。
// - 起飞以后：扫帚飞行在车万女仆里没有声音，不加风声。
// 听者 = 镜头机位（src/音效/游戏音效.tsx），坐标是庭院本地坐标（同 6-1-2）。起飞以后镜头跟扫帚飞走，地上的声音也就远了。
import React from 'react';
import { rng, type V3 } from '../../../../engine/model/parts.tsx';
import { LineTrack } from '../../../../world/配音/台词轨.tsx';
import { GameSoundTrack, type SoundCue } from '../../../../engine/audio/游戏音效.tsx';
import * as choreo612 from '../6-1-2/编排.ts';
import { officialSounds as 斩娜迦声们, officialPortalSounds as 斩娜迦门户声们, mazeSteps } from '../6-1-2/声音.tsx';
import { officialFrames } from '../6-1-2/动作改进.ts';
import { stepSound } from '../6-1-2/脚下方块.ts';
import * as choreo from './编排.ts';

// 本段第 0 帧 = 6-1-2 末帧，九胡迷宫时间 t = MAZE_T612 + f
const T0 = choreo612.MAZE_T612;
// 6-1-2 末尾没放完的声音（宝箱冒出的 boss_chest.appear 7 秒、九胡脚步、6-1-1 换维度 portal.travel 的尾巴）：同一组声音，帧号挪到本段（−(6-1-2 帧数 − 1)），本段只放剩下的（`GameSoundTrack` 把开头在第 0 帧之前的跳过去）。
// 换维度那一声音量见 6-1-1 的 声音.tsx 的 `portalSoundGain`。6-1-2 新版转正后接的是正式版：声音按正式版挪过的帧号，段长按正式版（动作改进.ts 的 `officialFrames`）
const carryOver = (s: SoundCue): SoundCue => ({ ...s, 帧: s.帧 - (officialFrames - 1) });
const portalSounds = 斩娜迦门户声们.map(carryOver);
const stepCue = (frame: number, p: number[], name: string, pick: number): SoundCue => ({ 名: name, 事件: stepSound(p), 帧: frame, 位置: [p[0], p[1], p[2]], 音量: 0.15, 音高: 1, 选: pick });

export const takeoffSounds: SoundCue[] = (() => {
  // 迷宫脚步单独一串随机数（种子同 6-1-2 的 声音.tsx），两段都从 t = 0 数起，6-1-2 末尾没放完、本段接着放的几声挑的是同一个文件
  const mazeRand = rng(6123);
  const out: SoundCue[] = 斩娜迦声们.map(carryOver);
  // 6-1-2 已排了 t < T0 + 1 的几声（见 `carryOver`），这里从 t ≥ T0 + 1 排起
  for (const step of mazeSteps(0, choreo612.MAZE_ARRIVE + 1)) {
    const pick = mazeRand();
    if (step.t >= T0 + 1) out.push(stepCue(step.t - T0, step.p, step.t === choreo612.MAZE_ARRIVE ? '九胡刹住' : '九胡脚步', pick));
  }
  const rand = rng(6131);
  const broomLoc = choreo.broom(choreo.beats.summon).pos;
  // 扫帚从 0 缩放长出来，前 2 帧太小看不见，声音落在看得见的那一帧（用户 10-18）
  out.push({ 名: '唤出扫帚', 事件: 'block.wool.place', 帧: choreo.beats.summon + 2, 位置: [choreo.BROOM_XY[0], choreo.BROOM_XY[1], broomLoc[2]], 音量: 0.75, 音高: 0.8, 选: rand(), 档: '中' });
  const liyingJumpFrame = choreo.beats.liYingMount - 8;
  out.push(stepCue(liyingJumpFrame, choreo.liyingOnFoot(liyingJumpFrame)!.loc, '李樱跳上扫帚', rand()));
  const jiuhuJumpFrame = choreo.beats.jiuHuUp - 8;
  out.push(stepCue(jiuhuJumpFrame, choreo.jiuhuOnFoot(jiuhuJumpFrame)!.pose.loc, '九胡跳上扫帚', rand()));
  return out;
})();

const listener = (g: number) => choreo.camera(g).pos as V3;

export const TakeoffSound: React.FC = () => (
  <>
    <LineTrack 句们={choreo.lineCues} />
    <GameSoundTrack sounds={takeoffSounds} listener={listener} />
    <GameSoundTrack sounds={portalSounds} listener={() => [0, 0, 0]} />
  </>
);
