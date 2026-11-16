// 按句放台词：<台词句轨 句们={[{ 句: 出征暮色, 帧: 24 }]} 声音={{ [出征暮色.id]: 出征暮色声 }} />，句来自作品的 台词/<id>.ts，声音是 import 'asset:<句.配音>' 的地址。
// 放法（开口对帧、开头静音让出来、截到文件完多 1 格）原样用 台词轨.tsx 的 做台词轨。帧 是 1/每秒 秒一格（默认 24）。
import React, { useMemo } from 'react';
import { makeLineTrack, type LineEntry } from './台词轨.tsx';
import type { LineCue } from './台词句.ts';

export const LineCueTrack: React.FC<{ lineCues: readonly LineCue[]; sound: Readonly<Record<string, string>>; perSec?: number }> = ({ lineCues, sound: sounds, perSec: perSec = 24 }) => {
  // 句们常是现写的数组字面量：按内容记住，免得每帧换一个组件类型、音频重挂
  const cacheKey = lineCues.map(({ 句: sentence }) => `${sentence.id}@${sentence.finishedSha}:${sounds[sentence.id] ?? ''}`).join('|');
  const LineTrack = useMemo(() => {
    const lineTable: Record<string, LineEntry> = {};
    for (const { 句: sentence } of lineCues) {
      if (!sounds[sentence.id]) throw new Error(`台词句轨：没给 ${sentence.id} 的声音（import 'asset:${sentence.voice}'）`);
      lineTable[sentence.id] = { 字: sentence.spoken, 角色: sentence.character, 段: '', 文件: sentence.id, 时长: sentence.duration, 开口: sentence.mouthOpen, 有声长: sentence.有声长 };
    }
    return makeLineTrack(lineTable, sounds).LineTrack;
  }, [cacheKey]); // 键 已经概括了 句们、声音
  return <LineTrack perSec={perSec} lines={lineCues.map(({ 句: sentence, frame: frame, 音量: volume }) => ({ id: sentence.id, frame: frame, ...(volume === undefined ? {} : { 音量: volume }) }))} />;
};
