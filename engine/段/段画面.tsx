// 新段的画面外壳：定义画面(段, 声音地址, 组件) 把本段的 段.ts 和 anim cues 生成的声音地址放进 context，自动挂上 <段声音>；
// 组件里用 use段() 取段、当前秒、事件的段内秒。段.ts 里每条 cue 只写一次，画面里不再 import 音效字节、不再手挂音轨。
// 声音的放法在 放法.ts；用 @remotion/media 的 Audio（不用 remotion 自带的：变速时那个只变速不变调）。
import { Audio } from '@remotion/media';
import React, { createContext, useContext } from 'react';
import { Internals, Sequence } from 'remotion';
import { lineVolume } from '../audio/混音.ts';
import { tagSrc } from '../audio/同源区分.ts';
import type { 段定义 } from './段定义.ts';
import { 段放法, type 一声 } from './放法.ts';
import type { 声音表 } from './声音助手.ts';
import { use当前秒, use帧率, use输出帧零头 } from './时间.tsx';

/** anim cues 生成的 声音地址.生成.ts 的默认导出：资产 id → 打包后的地址，和本段的声音表 */
export type 声音地址 = { 地址: Readonly<Record<string, string>>; 表: 声音表 };

type 段上下文 = { 段: 段定义; 声音: 声音地址 };
const 段Context = createContext<段上下文 | null>(null);

// 帧号在这里由秒现算，可以带小数：Remotion 的 Sequence 收小数 from，@remotion/media 的 Audio 按 (当前帧 − from) ÷ fps 秒取文件（不取整）。
// Sequence 要到 from 之后第一个输出帧才露出来，直接放会切掉声音开头不到一帧的那截。所以没入点、不循环的 cue 把 Sequence 前移 d 帧到
// 它前面那个输出帧上，trimBefore 给 −d：文件第 0 秒以前那截 @remotion/media 补静音（extract-audio 的 leadingSilence），起点按样本准。
// 有入点的（接着放的）前移会多放入点以前的那截、循环的会把静音也循环进去，这两种照旧切（决策 0015 量过）。
// 结尾不准：最后一个露出来的帧照样取满一帧，cue 尾最多多放不到一帧。增益每个输出帧取一次（Remotion 一帧一个音量），取这一帧开头那一刻的。

// 这一层时间线上露出来的第一帧（外面的 Sequence 带 trimBefore、或从负帧起时 > 0）：Remotion 给 volume 回调的帧从声音露出来那一帧数起
const use露出帧 = () => Math.max(0, -(useContext(Internals.SequenceContext)?.cumulatedNegativeFrom ?? 0));

const 放一声: React.FC<{ 声: 一声; src: string }> = ({ 声, src }) => {
  const r = use帧率();
  const 零头 = use输出帧零头();
  const 外露 = use露出帧();
  const 起 = 声.起秒 * r;
  const 余 = (((起 - 零头) % 1) + 1) % 1;
  const d = 声.入点秒 === 0 && !声.循环 && 余 > 1e-6 && 余 < 1 - 1e-6 ? 余 : 0;
  const from = 起 - d;
  // 外面的 Sequence 带 trimBefore、从负帧起时声音从 外露 那帧才露出来，Remotion 给 volume 的帧从露出来那帧数起
  const 跳 = Math.max(0, 外露 - from);
  return (
    <Sequence from={from} durationInFrames={声.秒数 * r + d} layout="none" name={声.名}>
      <Audio
        src={声.区分 ? tagSrc(src, 声.区分) : src}
        trimBefore={d ? -d * 声.速率 : 声.入点秒 * r}
        {...(声.速率 !== 1 ? { playbackRate: 声.速率 } : {})}
        {...(声.循环 ? { loop: true, loopVolumeCurveBehavior: 'extend' as const } : {})}
        volume={(f) => 声.增益((f + 跳 - d) / r)}
      />
    </Sequence>
  );
};

/** 照 段.ts 的 cue 表放出全部声音（台词、音效、配乐）。定义画面 已经自动挂了，只在关掉自动声音、要挂进别的 Sequence 时手放 */
export const 段声音: React.FC = () => {
  const c = useContext(段Context);
  if (!c) throw new Error('<段声音> 要放在 定义画面(…) 包着的画面里');
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
 * 画面里取本段：段、当前秒（use当前秒，在嵌套的 秒Sequence 里是相对那一层的）、场时间线上的秒、各事件的段内秒（窗口段.ts 的 事件秒）。
 * 传本段的 段.ts 进来就按它推出事件名的类型，并核对挂的是不是同一段。
 */
export const use段 = <S extends 段定义 = 段定义>(本段?: S) => {
  const c = useContext(段Context);
  if (!c) throw new Error('use段() 要在 定义画面(…) 包着的画面里用');
  if (本段 && 本段 !== c.段) throw new Error('use段(段) 传进来的段和 定义画面 挂的不是同一个');
  const 段 = c.段 as S;
  const 秒 = use当前秒();
  type 事件表 = S extends { 事件秒: infer E } ? E : Readonly<Record<string, number>>;
  const 事件 = ((段 as { 事件秒?: unknown }).事件秒 ?? {}) as 事件表;
  return { 段, 秒, 场秒: (段.场窗口?.起秒 ?? 0) + 秒, 事件 };
};
