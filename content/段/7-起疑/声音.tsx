// 7-4-4 起疑的声音：只用游戏原声，没有台词、没有配乐（脚本：只有纸声）。听者是镜头。
// - 原版没有「纸」的声音，最接近的是书的翻页声 item.book.page_turn（open_flip1～3）：开头手放上书页时一声；攥皱时用它压低音高（0.8）连着两声当纸被揉的声音。
//   游戏里攥纸不出声，这两声是为脚本的「纸声」借来的。
import React from 'react';
import { rng } from '../../../engine/model/parts.tsx';
import { GameSoundTrack, type SoundCue } from '../../../engine/audio/游戏音效.tsx';
import * as choreo from './编排.ts';

export const sounds: SoundCue[] = (() => {
  const rand = rng(7404);
  const bookPos = choreo.roomToWorld(choreo.bookOnDesk);
  return [
    { 名: '翻页', 事件: 'item.book.page_turn', 帧: 6, 位置: bookPos, 音量: 1, 音高: 1, 选: rand() },
    // 攥纸是这段唯一要听见的声音（脚本：只有纸声），中档；翻页照游戏规则
    { 名: '攥纸1', 事件: 'item.book.page_turn', 帧: 118, 位置: bookPos, 音量: 1, 音高: 0.8, 选: rand(), 档: '中' },
    { 名: '攥纸2', 事件: 'item.book.page_turn', 帧: 138, 位置: bookPos, 音量: 1, 音高: 0.7, 选: rand(), 档: '中' },
  ];
})();

export const SuspicionSound: React.FC = () => <GameSoundTrack sounds={sounds} listener={(f) => choreo.camAt(f).pos} />;
