// 6-4-4 两次了的声音：照占位卡（已删的 镜头/占位/普通段.tsx）原样搬过来——原版音效和一句台词，音量、音高、挑的文件照占位卡
// （音高和文件是占位卡按 rng(6409) 抽的，抄在这里，不跟着占位卡变）。有了画面以后只改了一处：占位卡没有机位，听者放在声源上，
// 这里照第 6 章的规矩（听者是镜头，src/音效/游戏音效.tsx）给每声放回它在场景里的位置，镜头离它们一到五米（10-13 古城4x：兵营里感测体、尖啸体就在镜头前，李樱在 5 米外），衰减很小。
// - 感测体：block.sculk_sensor.clicking（volume 1、pitch 0.8 + r × 0.2）
// - 尖啸：block.sculk_shrieker.shriek（volume 2、pitch 0.6 + r × 0.4），要放 10 秒多，6-4-5 开头从响到的地方接着放（6-4-5/声音.tsx）
// 回放里只放这两声（用户 10-18 删了拔刀挑箭那一截，拔刀破空声和招架的「叮」跟着删）：同一刻另外七个感测体的咔嗒、斩击的三叉戟声、箭钉进洞顶的碎裂声在 6-4-3b/c 里已经响过，这里不重放。
import React from 'react';
import type { SoundCue } from '../../../../engine/audio/游戏音效.tsx';
import { GameSoundTrack } from '../../../../engine/audio/游戏音效.tsx';
import { LineTrack } from '../../../../world/配音/台词轨.tsx';
import * as choreo from './编排.ts';

const FPS = choreo.FPS;
export const shriekPitch = 0.6349319744855165;
export const sounds: SoundCue[] = [
  { 名: '感测体', 事件: 'block.sculk_sensor.clicking', 帧: choreo.clickSec * FPS, 位置: choreo.soundSources.sculkSensor, 音量: 1, 音高: 0.933178607840091, 选: 0.42693550838157535 },
  // 「烦死了！」就压在尖啸最响的那一截上，归「中」不盖住台词（用户 10-18 分档）；6-4-5 接着放的那截同档
  { 名: '尖啸', 事件: 'block.sculk_shrieker.shriek', 档: '中', 帧: choreo.shriekSec * FPS, 位置: choreo.soundSources.shriek, 音量: 2, 音高: shriekPitch, 选: 0.40560065652243793 },
];

const listener = (f: number) => choreo.camera(f).pos;

export const TwiceSound: React.FC = () => (
  <>
    <GameSoundTrack sounds={sounds} listener={listener} />
    <LineTrack 句们={Object.values(choreo.lines)} />
  </>
);
