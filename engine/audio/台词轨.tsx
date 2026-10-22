// 台词轨：配音副本（开头静音裁到 0.03 秒、整句拉到 -18 LUFS）按台词表放进段里。台词表和各句的 wav 是作品的资产，由作品传进 做台词轨
// （作品的 配音/台词轨.tsx 绑好后导出 LineTrack 等），本文件不 import 任何资产。
// 用法：<LineTrack 句们={[{ id: '6-3-1-李樱-又回到这里', 帧: 24 }]} />，帧 = 这句开口（第一个有声的时刻）落在这段的第几帧，
// 文件开头那 0.03 秒静音会往前让出来，开口正好在这一帧。帧可以是负的（上一段就开口了，这段只放剩下的）。
// 台词不跟镜头远近走（不做距离衰减）：漫剧里台词都是给观众听清的。
import { Audio } from '@remotion/media';
import React from 'react';
import { Sequence, useVideoConfig } from 'remotion';
import { lineVolume } from './混音.ts';
import { useSfxLog } from './音效清单.ts';

export type LineEntry = { 字: string; 角色: string; 段: string; 文件: string | null; 时长: number; 开口: number; 有声长: number };
export type LineCue = { id: string; 帧: number; 音量?: number };

/** 台词表：资产 数据/配音/台词表 的内容；wav们：台词表里的 文件 名 → 打包后的地址 */
export const 做台词轨 = (台词表: unknown, wav们: Readonly<Record<string, string>>) => {
  const lineTable = 台词表 as Record<string, LineEntry>;
  // 一句从开口到说完要几帧（有声的长度）
  const lineFrameCount = (id: string, fps = 24) => Math.ceil(lineTable[id].有声长 * fps);
  const LineTrack: React.FC<{ 句们: LineCue[] }> = ({ 句们: lines }) => {
    const { fps } = useVideoConfig();
    const logLine = useSfxLog('台词清单');
    return (
      <>
        {lines.map(({ id, 帧: frame, 音量: volume = 1 }) => {
          const entry = lineTable[id];
          if (!entry?.文件) throw new Error(`台词表里没有 ${id} 的副本`);
          const fileStartFrame = frame - entry.开口 * fps; // 文件开头（带小数）
          const from = Math.max(0, Math.ceil(fileStartFrame - 1e-6));
          const skipFrames = from - fileStartFrame; // 帧
          const frameCount = Math.ceil(entry.时长 * fps - skipFrames) + 1;
          logLine({ 名: id, 文件: `配音/${entry.文件}`, from, 帧数: frameCount, 入点秒: skipFrames / fps, 速率: 1, 循环: false, gainAt: () => lineVolume * volume });
          return (
            <Sequence key={id + frame} from={from} durationInFrames={frameCount} layout="none" name={id}>
              <Audio src={wav们[entry.文件]} trimBefore={skipFrames} volume={lineVolume * volume} />
            </Sequence>
          );
        })}
      </>
    );
  };
  return { LineTrack, lineFrameCount, lineTable };
};
