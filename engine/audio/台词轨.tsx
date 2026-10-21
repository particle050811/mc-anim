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
import { 资产目录 } from '../core/资产目录.ts';
// 待迁移（私有资产）：九胡的配音私有，M5 台词改走段.ts 的声音 cue 后不再打进包
import 资_0 from 'asset:配音/6-李樱-出征暮色';
import 资_1 from 'asset:配音/6-李樱-不值一提';
import 资_2 from 'asset:配音/6-九胡-等等我';
import 资_3 from 'asset:配音/6-李樱-看我速通暮色';
import 资_4 from 'asset:配音/6-九胡-什么也没有';
import 资_5 from 'asset:配音/6-李樱-没有最终boss';
import 资_6 from 'asset:配音/6-李樱-不算白跑';
import 资_7 from 'asset:配音/6-李樱-熔炼温度';
import 资_8 from 'asset:配音/6-李樱-锁链基底';
import 资_9 from 'asset:配音/6-李樱-夸克古卷';
import 资_10 from 'asset:配音/6-李樱-沉淀';
import 资_11 from 'asset:配音/6-李樱-古城寻宝';
import 资_12 from 'asset:配音/6-九胡-导航';
import 资_13 from 'asset:配音/6-九胡-怎么下去';
import 资_14 from 'asset:配音/6-九胡-边城脚下';
import 资_15 from 'asset:配音/6-李樱-又回到这里';
import 资_16 from 'asset:配音/6-李樱-RoadRoller';
import 资_17 from 'asset:配音/6-黄叛-又出现了';
import 资_18 from 'asset:配音/6-黄叛-纳命来';
import 资_19 from 'asset:配音/6-李樱-两次了';
import 资_20 from 'asset:配音/6-李樱-烦死了';
import 资_21 from 'asset:配音/6-李樱-会会你们';
import 资_22 from 'asset:配音/6-刘心忠-怕了我们';
import 资_23 from 'asset:配音/6-黄叛-结构奇怪';
import 资_24 from 'asset:配音/6-刘心忠-贵族生活';
import 资_25 from 'asset:配音/7-刘心忠-怎么回事';
import 资_26 from 'asset:配音/7-刘心忠-不可能';
import 资_27 from 'asset:配音/7-黄叛-受死';
import 资_28 from 'asset:配音/7-李樱-五万血';
import 资_29 from 'asset:配音/7-李樱-溜了';
import 资_30 from 'asset:配音/7-李樱-开到了';
import 资_31 from 'asset:配音/7-刘心忠-风筝';

type LineEntry = { 字: string; 角色: string; 段: string; 文件: string | null; 时长: number; 开口: number; 有声长: number };
export const lineTable = lineTableJson as unknown as Record<string, LineEntry>;
const ctx = 资产目录({ './6-1-1-李樱-出征暮色.wav': 资_0, './6-1-2-李樱-不值一提.wav': 资_1, './6-1-3-九胡-等等我.wav': 资_2, './6-1-3-李樱-看我速通暮色.wav': 资_3, './6-1-9-九胡-什么也没有.wav': 资_4, './6-1-9-李樱-没有最终boss.wav': 资_5, './6-2-1-李樱-不算白跑.wav': 资_6, './6-2-1-李樱-熔炼温度.wav': 资_7, './6-2-1-李樱-锁链基底.wav': 资_8, './6-2-2-李樱-夸克古卷.wav': 资_9, './6-2-2-李樱-沉淀.wav': 资_10, './6-2-3-李樱-古城寻宝.wav': 资_11, './6-2-4-九胡-导航.wav': 资_12, './6-3-1-九胡-怎么下去.wav': 资_13, './6-3-1-九胡-边城脚下.wav': 资_14, './6-3-1-李樱-又回到这里.wav': 资_15, './6-3-5-李樱-RoadRoller.wav': 资_16, './6-3-8-黄叛-又出现了.wav': 资_17, './6-4-3a-黄叛-纳命来.wav': 资_18, './6-4-4-李樱-两次了.wav': 资_19, './6-4-4-李樱-烦死了.wav': 资_20, './6-4-5-李樱-会会你们.wav': 资_21, './6-4-6-刘心忠-怕了我们.wav': 资_22, './6-4-6-黄叛-结构奇怪.wav': 资_23, './6-4-7-刘心忠-贵族生活.wav': 资_24, './7-1-1-刘心忠-怎么回事.wav': 资_25, './7-1-3-刘心忠-不可能.wav': 资_26, './7-1-5-黄叛-受死.wav': 资_27, './7-2-1-李樱-五万血.wav': 资_28, './7-2-1-李樱-溜了.wav': 资_29, './7-2-2-李樱-开到了.wav': 资_30, './7-4-1-刘心忠-风筝.wav': 资_31 }) as unknown as { keys(): string[]; (k: string): string | { default: string } };
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
