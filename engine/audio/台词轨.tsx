// 台词：src/配音/<id>.wav（工具/配音/生成台词.py 出的副本：开头静音裁到 0.03 秒、整句拉到 -18 LUFS，表在 src/配音/台词表.json）。
// 用法：<台词轨 句们={[{ id: '6-3-1-李樱-又回到这里', 帧: 24 }]} />，帧 = 这句开口（第一个有声的时刻）落在这段的第几帧，
// 文件开头那 0.03 秒静音会往前让出来，开口正好在这一帧。帧可以是负的（上一段就开口了，这段只放剩下的）。
// 台词不跟镜头远近走（不做距离衰减）：漫剧里台词都是给观众听清的。
import { Audio } from '@remotion/media';
import React from 'react';
import { Sequence, useVideoConfig } from 'remotion';
import lineTableJson from 'asset:数据/配音/台词表';
import { lineVolume } from './混音.ts';
import { useSfxLog } from './音效清单.ts';

type LineEntry = { 字: string; 角色: string; 段: string; 文件: string | null; 时长: number; 开口: number; 有声长: number };
export const lineTable = lineTableJson as unknown as Record<string, LineEntry>;
const ctx = import.meta.webpackContext('../配音', { regExp: /\.wav$/ }) as unknown as { keys(): string[]; (k: string): string | { default: string } };
const wavUrls: Record<string, string> = {};
for (const k of ctx.keys()) {
  const wavModule = ctx(k);
  wavUrls[k.replace(/^\.\//, '')] = typeof wavModule === 'string' ? wavModule : wavModule.default;
}
// 一句从开口到说完要几帧（有声的长度）
export const lineFrameCount = (id: string, fps = 24) => Math.ceil(lineTable[id].有声长 * fps);
export type LineCue = { id: string; 帧: number; 音量?: number };
export const LineTrack: React.FC<{ 句们: LineCue[] }> = ({ 句们: lines }) => {
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
            <Audio src={wavUrls[entry.文件]} trimBefore={skipFrames} volume={lineVolume * volume} />
          </Sequence>
        );
      })}
    </>
  );
};
