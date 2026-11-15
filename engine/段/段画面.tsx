// 新段的画面外壳：定义画面(段, 声音地址, 组件) 把本段的 段.ts 和 anim cues 生成的声音地址放进 context，自动挂上 <段声音>；
// 组件里用 use段() 取段、当前秒、事件的段内秒。段.ts 里每条 cue 只写一次，画面里不再 import 音效字节、不再手挂音轨。
// 声音的放法在 放法.ts；用 @remotion/media 的 Audio（不用 remotion 自带的：变速时那个只变速不变调）。
import { Audio } from '@remotion/media';
import React, { createContext, useContext } from 'react';
import { Internals, Sequence } from 'remotion';
import { lineVolume } from '../audio/混音.ts';
import { tagSrc } from '../audio/同源区分.ts';
import type { SegmentDef } from './段定义.ts';
import { segPlayPlan, type SoundItem } from './放法.ts';
import type { SoundTable } from './声音助手.ts';
import { useCurrentSec, useFrameRate, useOutputFrameRemainder } from './时间.tsx';

/** anim cues 生成的 声音地址.生成.ts 的默认导出：资产 id → 打包后的地址，和本段的声音表 */
export type SoundUrl = { urls: Readonly<Record<string, string>>; 表: SoundTable };

type SegContext = { 段: SegmentDef; 声音: SoundUrl };
const segContext = createContext<SegContext | null>(null);

// 帧号在这里由秒现算，可以带小数：Remotion 的 Sequence 收小数 from，@remotion/media 的 Audio 按 (当前帧 − from) ÷ fps 秒取文件（不取整）。
// Sequence 要到 from 之后第一个输出帧才露出来，直接放会切掉声音开头不到一帧的那截。所以没入点、不循环的 cue 把 Sequence 前移 d 帧到
// 它前面那个输出帧上，trimBefore 给 −d：文件第 0 秒以前那截 @remotion/media 补静音（extract-audio 的 leadingSilence），起点按样本准。
// 有入点的（接着放的）前移会多放入点以前的那截、循环的会把静音也循环进去，这两种照旧切（决策 0015 量过）。
// 结尾不准：最后一个露出来的帧照样取满一帧，cue 尾最多多放不到一帧。增益每个输出帧取一次（Remotion 一帧一个音量），取这一帧开头那一刻的。

// 这一层时间线上露出来的第一帧（外面的 Sequence 带 trimBefore、或从负帧起时 > 0）：Remotion 给 volume 回调的帧从声音露出来那一帧数起
const useExposedFrame = () => Math.max(0, -(useContext(Internals.SequenceContext)?.cumulatedNegativeFrom ?? 0));

const PlaySound: React.FC<{ 声: SoundItem; src: string }> = ({ 声: sound, src }) => {
  const r = useFrameRate();
  const remainder = useOutputFrameRemainder();
  const exposeFrame = useExposedFrame();
  const start = sound.startSec * r;
  const fraction = (((start - remainder) % 1) + 1) % 1;
  const d = sound.入点秒 === 0 && !sound.循环 && fraction > 1e-6 && fraction < 1 - 1e-6 ? fraction : 0;
  const from = start - d;
  // 外面的 Sequence 带 trimBefore、从负帧起时声音从 外露 那帧才露出来，Remotion 给 volume 的帧从露出来那帧数起
  const shiftFrames = Math.max(0, exposeFrame - from);
  return (
    <Sequence from={from} durationInFrames={sound.durSec * r + d} layout="none" name={sound.名}>
      <Audio
        src={sound.distinctKey ? tagSrc(src, sound.distinctKey) : src}
        trimBefore={d ? -d * sound.速率 : sound.入点秒 * r}
        {...(sound.速率 !== 1 ? { playbackRate: sound.速率 } : {})}
        {...(sound.循环 ? { loop: true, loopVolumeCurveBehavior: 'extend' as const } : {})}
        volume={(f) => sound.增益((f + shiftFrames - d) / r)}
      />
    </Sequence>
  );
};

/** 照 段.ts 的 cue 表放出全部声音（台词、音效、配乐）。定义画面 已经自动挂了，只在关掉自动声音、要挂进别的 Sequence 时手放 */
export const SegSound: React.FC = () => {
  const c = useContext(segContext);
  if (!c) throw new Error('<段声音> 要放在 定义画面(…) 包着的画面里');
  const sounds = segPlayPlan(c.段, c.声音.表, { lineGain: lineVolume });
  return (
    <>
      {sounds.map((sound, i) => {
        const src = c.声音.urls[sound.资产];
        if (src === undefined) throw new Error(`声音地址表里没有「${sound.资产}」：段.ts 的声音改过，跑 anim cues 重新生成`);
        return <PlaySound key={`${i}-${sound.资产}`} 声={sound} src={src} />;
      })}
    </>
  );
};

/**
 * 段的画面：export default 定义画面(段, 声音地址, () => …)。
 * 段：本段 段.ts 的默认导出；声音地址：本段 声音地址.生成.ts 的默认导出（anim cues 生成）。声音：false 时不自动挂 <段声音>。
 */
export const definePicture = (seg: SegmentDef, soundUrl: SoundUrl, Picture: React.FC, options: { 声音?: boolean } = {}): React.FC => {
  const value: SegContext = { 段: seg, 声音: soundUrl };
  const component: React.FC = () => (
    <segContext.Provider value={value}>
      {options.声音 !== false && <SegSound />}
      <Picture />
    </segContext.Provider>
  );
  return component;
};

/**
 * 画面里取本段：段、当前秒（use当前秒，在嵌套的 秒Sequence 里是相对那一层的）、场时间线上的秒、各事件的段内秒（窗口段.ts 的 事件秒）。
 * 传本段的 段.ts 进来就按它推出事件名的类型，并核对挂的是不是同一段。
 */
export const useSeg = <S extends SegmentDef = SegmentDef>(segment?: S) => {
  const c = useContext(segContext);
  if (!c) throw new Error('use段() 要在 定义画面(…) 包着的画面里用');
  if (segment && segment !== c.段) throw new Error('use段(段) 传进来的段和 定义画面 挂的不是同一个');
  const seg = c.段 as S;
  const sec = useCurrentSec();
  type EventTable = S extends { eventSec: infer E } ? E : Readonly<Record<string, number>>;
  const events = ((seg as { eventSec?: unknown }).eventSec ?? {}) as EventTable;
  return { 段: seg, 秒: sec, sceneSec: (seg.sceneWindow?.startSec ?? 0) + sec, 事件: events };
};
