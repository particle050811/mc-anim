// 声音的共用包装，保证 导出音效清单.mjs 收得全（音效清单.ts）：
// - 声音Sequence：里面有声音组件的 Sequence 一律用它代替 <Sequence>。晚起的 Sequence 第 0 帧还没挂上里面的组件，打不出清单；它报出自己露出来那一帧，导出时补渲。
// - 清单Audio：直接放一个文件的声音（不走 游戏声音轨、台词轨、配乐的），同时记进清单；不要再写裸的 <Audio>。
import { Audio } from '@remotion/media';
import React from 'react';
import { Sequence, useVideoConfig } from 'remotion';
import { useLateSequenceLog, useSfxLog } from './音效清单.ts';

export const 声音Sequence: React.FC<{ from?: number; durationInFrames?: number; name?: string; children: React.ReactNode }> = ({ from = 0, durationInFrames = Infinity, name, children }) => {
  useLateSequenceLog(from, durationInFrames);
  return (
    <Sequence from={from} durationInFrames={durationInFrames} layout="none" name={name}>
      {children}
    </Sequence>
  );
};

// from：在所在时间线上第几帧起放（从文件开头放）；文件：相对 src/，清单和 音效拆分.py 按它找文件；时长：文件多少秒，只用来记清单里的帧数，
// 渲染时不按它截（文件重新生成变长了也放完，不会悄悄截掉）
export const 清单Audio: React.FC<{ kind: '音效清单' | '台词清单'; 名: string; src: string; 文件: string; 时长: number; from: number; volume: number }> = ({ kind, 名: label, src, 文件: file, 时长: durationSec, from, volume }) => {
  const { fps } = useVideoConfig();
  const log = useSfxLog(kind);
  const frames = Math.ceil(durationSec * fps);
  log({ 名: label, 文件: file, from, 帧数: frames, 入点秒: 0, 速率: 1, 循环: false, gainAt: () => volume });
  return (
    <Sequence from={from} layout="none" name={label}>
      <Audio src={src} volume={volume} />
    </Sequence>
  );
};
