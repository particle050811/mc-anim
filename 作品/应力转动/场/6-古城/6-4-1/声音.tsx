// 6-4-1 羊毛搜刮的声音：原版音效（src/音效/），时刻从 `跳搭.ts` 剧情时间线推，再按 `编排.ts` 的跳切换成成片帧；原速。听者是镜头机位（项目规则）。
// 照 1.20.1（javap 核对，规则见 src/音效/游戏音效.tsx）：
// - 远处低鸣（洞穴氛围声 ambient.cave）不放：用户 10-18 嫌意义不明，删了。
// - 垫羊毛：`BlockItem.place` 放 getPlaceSound()，volume 1、pitch 0.8，位置是羊毛方块中心，时刻 = `woolPlaceFrame`（落地前 0.22 秒）。
// - 落在羊毛上：画面无受伤闪红，按没摔伤算，只有走路踩羊毛的 block.wool.step（volume 0.15）；脚步照游戏衰减（16 格），远景基本听不到（用户 10-11 嫌脚步声太假，到时让 AI 生成）。
// - 起跳、6-3-6 末帧换掉锤：没有声音。
// - #212 开关箱：模型/物品/箱子.tsx 的 chestSound，时刻 = 跳搭.ts 的 openLidSecB、closeLidSecB（蹬地跳走时关盖）。
//   8 格内没有感测体，开箱振动没人收，不咔嗒不尖啸。
// - 跳切：落在跳掉那段里的声音不放；跳切前响起的照常放完。
// 台词：没有（「古城，前前世不知道探过多少回了。」用户 10-12 删了，配音文件留着）。
import React from 'react';
import { rng, type V3 } from '@engine/model/parts.tsx';
import { GameSoundTrack, type SoundCue } from '@engine/audio/游戏音效.tsx';
import { LineTrack } from '../../../配音/台词轨.tsx';
import { cellCenter, woolBlockAt, allWool } from '../../../地点/古城4x/布局.ts';
import { chestSound } from '@库/物品/箱子.tsx';
import * as choreo from './编排.ts';
import * as jumpBuild from './跳搭.ts';

// 剧情时间线上的全部声音（6-4-2 接着用：同一条时间线）
export const storySounds: SoundCue[] = (() => {
  const rand = rng(6401);
  const out: SoundCue[] = [];
  rand(); // 删掉的低鸣占的一个随机数，留着让后面各声的选文件、音高不变
  jumpBuild.route.forEach((k, i) => {
    const woolPos = woolBlockAt(allWool[k]);
    out.push({ 名: `垫羊毛${k}`, 事件: 'block.wool.place', 帧: jumpBuild.woolPlaceFrame(k), 位置: [woolPos[0], woolPos[1], woolPos[2] + 0.5] as V3, 音量: 1, 音高: 0.8, 选: rand() });
    out.push({ 名: `落地${k}`, 事件: 'block.wool.step', 帧: jumpBuild.jumps[i].f1, 位置: jumpBuild.jumps[i].p1, 音量: 0.15, 音高: 1, 选: rand() });
  });
  const chestPos = cellCenter(jumpBuild.chestBlockB);
  out.push({ 名: '开箱#212', ...chestSound('开', rand), 帧: jumpBuild.openLidSecB * jumpBuild.FPS, 位置: chestPos });
  out.push({ 名: '关箱#212', ...chestSound('关', rand), 帧: jumpBuild.closeLidSecB * jumpBuild.FPS, 位置: chestPos });
  return out;
})();
// 剧情帧 → 成片帧：落在哪个窗口里就换到那个窗口；不在窗口里的不放
export const cutSounds = (sounds: SoundCue[], cutFrameOf: (frame: number) => number | undefined): SoundCue[] =>
  sounds.flatMap((sound) => {
    const cutFrame = cutFrameOf(Math.round(sound.帧));
    return cutFrame === undefined ? [] : [{ ...sound, 帧: cutFrame + (sound.帧 - Math.round(sound.帧)) }];
  });
// 落在 #212 跟前那一步离镜头 18 格，照游戏规则听不见，删（用户 10-18：理论上听不到就别弄）
export const sounds: SoundCue[] = cutSounds(storySounds, choreo.cutPlan.cutFrameOf).filter((s) => s.名 !== '落地B');
// 空表留着：台词落点.ts 等按段读 台词，删句不删出口
export const lines: { id: string; 帧: number }[] = [];

const listener = (f: number) => choreo.camera(Math.min(Math.max(Math.round(f), 0), choreo.END - 1)).pos;

export const WoolSearchSound: React.FC = () => (
  <>
    {/* 跳切进 6-4-2，关箱不接过去：段尾淡掉 */}
    <GameSoundTrack sounds={sounds} listener={listener} tailFade />
    <LineTrack 句们={lines} />
  </>
);
