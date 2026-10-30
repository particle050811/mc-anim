// 新段的画面外壳：定义画面(段, 声音地址, 组件) 把本段的 段.ts 和 anim cues 生成的声音地址放进 context，自动挂上 <段声音>；
// 组件里用 use段() 取段、当前帧、事件的段内帧。段.ts 里每条 cue 只写一次，画面里不再 import 音效字节、不再手挂音轨。
// 声音的放法在 放法.ts；和音效轨.tsx 一样用 @remotion/media 的 Audio（不用 remotion 自带的：变速时那个只变速不变调），渲染时照样打清单日志。
import { Audio } from '@remotion/media';
import React, { createContext, useContext } from 'react';
import { Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { lineVolume } from '../audio/混音.ts';
import { tagSrc } from '../audio/同源区分.ts';
import { useFirstVisibleFrame, useSfxLog } from '../audio/音效清单.ts';
import type { 段定义 } from './段定义.ts';
import { 段放法, type 一声 } from './放法.ts';
import type { 声音表 } from './声音助手.ts';

/** anim cues 生成的 声音地址.生成.ts 的默认导出：资产 id → 打包后的地址，和本段的声音表 */
export type 声音地址 = { 地址: Readonly<Record<string, string>>; 表: 声音表 };

type 段上下文 = { 段: 段定义; 声音: 声音地址 };
const 段Context = createContext<段上下文 | null>(null);

const 放一声: React.FC<{ 声: 一声; src: string }> = ({ 声, src }) => {
  const { fps } = useVideoConfig();
  const 记 = useSfxLog(声.类);
  const 外露 = useFirstVisibleFrame();
  记({ 名: 声.名, ...(声.档 !== undefined ? { 档: 声.档 } : {}), 文件: 声.资产, from: 声.起帧, 帧数: 声.帧数, 入点秒: 声.入点秒, 速率: 声.速率, 循环: 声.循环, gainAt: 声.增益 });
  // 外面的 Sequence 带 trimBefore 时声音从 外露 那帧才露出来，Remotion 给 volume 的帧从露出来那帧数起（见 音效清单.ts）
  const 跳 = Math.max(0, 外露 - 声.起帧);
  return (
    <Sequence from={声.起帧} durationInFrames={声.帧数} layout="none" name={声.名}>
      <Audio
        src={声.区分 ? tagSrc(src, 声.区分) : src}
        trimBefore={声.入点秒 * fps}
        {...(声.速率 !== 1 ? { playbackRate: 声.速率 } : {})}
        {...(声.循环 ? { loop: true, loopVolumeCurveBehavior: 'extend' as const } : {})}
        volume={(f) => 声.增益(f + 跳)}
      />
    </Sequence>
  );
};

/** 照 段.ts 的 cue 表放出全部声音（台词、音效、配乐）。定义画面 已经自动挂了，只在关掉自动声音、要挂进别的 Sequence 时手放 */
export const 段声音: React.FC = () => {
  const c = useContext(段Context);
  if (!c) throw new Error('<段声音> 要放在 定义画面(…) 包着的画面里');
  const { fps } = useVideoConfig();
  if (fps !== c.段.fps) throw new Error(`Composition 是 ${fps} fps，段.ts 是 ${c.段.fps} fps`);
  const 声们 = 段放法(c.段, c.声音.表, { 台词增益: lineVolume });
  return (
    <>
      {声们.map((声, i) => {
        const src = c.声音.地址[声.资产];
        if (src === undefined) throw new Error(`声音地址表里没有「${声.资产}」：段.ts 的声音改过，跑 anim cues 重新生成`);
        return <放一声 key={`${i}-${声.资产}`} 声={声} src={src} />;
      })}
    </>
  );
};

/**
 * 段的画面：export default 定义画面(段, 声音地址, () => …)。
 * 段：本段 段.ts 的默认导出；声音地址：本段 声音地址.生成.ts 的默认导出（anim cues 生成）。声音：false 时不自动挂 <段声音>。
 */
export const 定义画面 = (段: 段定义, 声音: 声音地址, 画面: React.FC, 选项: { 声音?: boolean } = {}): React.FC => {
  const 值: 段上下文 = { 段, 声音 };
  const 组件: React.FC = () => (
    <段Context.Provider value={值}>
      {选项.声音 !== false && <段声音 />}
      <画面 />
    </段Context.Provider>
  );
  return 组件;
};

/**
 * 画面里取本段：段、当前帧（同 useCurrentFrame，在嵌套的 Sequence 里是相对那一层的）、秒、场时间线帧、各事件的段内帧。
 * 传本段的 段.ts 进来就按它推出事件名的类型，并核对挂的是不是同一段。
 */
export const use段 = <S extends 段定义 = 段定义>(本段?: S) => {
  const c = useContext(段Context);
  if (!c) throw new Error('use段() 要在 定义画面(…) 包着的画面里用');
  if (本段 && 本段 !== c.段) throw new Error('use段(段) 传进来的段和 定义画面 挂的不是同一个');
  const 段 = c.段 as S;
  const 帧 = useCurrentFrame();
  const 起帧 = 段.场窗口?.起帧 ?? 0;
  type 事件表 = S extends { 事件帧: infer E } ? E : Readonly<Record<string, number>>;
  const 事件 = ((段 as { 事件帧?: unknown }).事件帧 ?? {}) as 事件表;
  return { 段, 帧, 秒: 帧 / 段.fps, 场帧: 起帧 + 帧, 事件 };
};
