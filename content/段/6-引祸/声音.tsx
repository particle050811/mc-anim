// 6-4-5 引祸的声音：占位卡（已删的 镜头/占位/普通段.tsx）的两声原样搬过来，再补上画面里的垫羊毛（照 6-4-1/声音.tsx 的规矩）。听者是镜头。
// - 尖啸（接 6-4-4）：6-4-4 回放里那一声尖啸（音高 0.63，要放 10 秒多），这一段开头从响到的地方接着放（6-4-4 → 6-4-5 是硬切，从 6-4-4 段尾那一刻接）。
//   声源还是李樱脚边西北那个尖啸体（6-4-4/编排.ts 的 声源）。
// - 收刀：block.chain.hit（volume 1、pitch 1，占位卡的数），刀入鞘那一刻（编排.ts 的 入鞘，0.6 秒），位置在他左腰的鞘口。
// - 垫羊毛：第一跳落地前往落点垫的那块 R1：block.wool.place（volume (1 + 1) / 2 = 1、pitch 0.8），落在上面那一步 block.wool.step（volume 0.15）。
//   R2 那块垫在段尾以后，不放。
// - 跳：起跳没有声音；他只踩羊毛，不发振动，感测体、尖啸体都不响。
// 不放的（见 ../6-4-6/编排.ts 文件头）：6-4-3 那次尖啸后 4.5 秒尖啸体的回应（黑暗 + 监守者低吼 entity.warden.nearby_closer），参考视频不演。
import React from 'react';
import { rng, type V3 } from '../../../engine/model/parts.tsx';
import { GameSoundTrack, type SoundCue } from '../../../engine/audio/游戏音效.tsx';
import { LineTrack } from '../../../world/配音/台词轨.tsx';
import { woolBlockAt, wool645 } from '../../../world/地点/古城4x/布局.ts';
import * as K644 from '../../场/6-古城/6-4-4/编排.ts';
import { sounds as 声们644 } from '../../场/6-古城/6-4-4/声音.tsx';
import * as choreo from '../../场/6-古城/6-4-5/编排.ts';

const FPS = choreo.FPS;
const r1Center = (() => {
  const block = woolBlockAt(wool645.R1);
  return [block[0], block[1], block[2] + 0.5] as V3;
})();

export const sounds: SoundCue[] = (() => {
  const rand = rng(6415);
  const out: SoundCue[] = [];
  // 6-4-4 还没放完的（尖啸）：6-4-4 的第 帧数 帧 = 这一段第 0 帧
  for (const sound of 声们644) out.push({ ...sound, 名: `${sound.名}（接 6-4-4）`, 帧: sound.帧 - K644.frameCount });
  out.push({ 名: '收刀', 事件: 'block.chain.hit', 档: '中', 帧: choreo.sheathedSec * FPS, 位置: [choreo.FOOT[0], choreo.FOOT[1], choreo.FOOT[2] + 0.9], 音量: 1, 音高: 1, 选: 0.5096602365374565 });
  out.push({ 名: '垫羊毛R1', 事件: 'block.wool.place', 帧: choreo.placeR1Frame, 位置: r1Center, 音量: 1, 音高: 0.8, 选: rand() });
  out.push({ 名: '落在R1', 事件: 'block.wool.step', 帧: choreo.jump1.f1, 位置: choreo.jump1.p1, 音量: 0.15, 音高: 1, 选: rand() });
  return out;
})();

const listener = (f: number) => choreo.camera(f).pos;

export const LureSound: React.FC = () => (
  <>
    <GameSoundTrack sounds={sounds} listener={listener} />
    <LineTrack 句们={Object.values(choreo.lines)} />
  </>
);
