// 段里取时间：一律用秒（用户 11-06 定「直接原生 60 FPS」「不应该都是按函数那种写的吗」，docs/决策/0015-原生60帧.md）。
// use当前秒() = Composition 帧 ÷ 帧率，带小数；嵌套 Sequence 的偏移照常算进去（里面拿到的是从那个 Sequence 起算的秒）。
// 原生段（段.ts 写 时钟: '秒'）外面包 <原生时钟>：Composition 按成片帧率跑，段界的零头（出帧.ts 的 相位）用负的 from 补上，第 0 秒就是段起点。
// 没迁的段还包着兼容层 编排时钟.tsx（里面的帧是 24 帧编排帧），这里的工具在两边都按秒对：共用组件先迁到秒，老段新段都能用。
// 段、场、库代码不直接调 useCurrentFrame()（anim check 的「时间」规则）；非要一帧一个的（核对视图）用 取档（按时取值.ts）按秒取下标。
import React, { useContext, type ReactNode } from 'react';
import { Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { 编排fpsContext } from './编排时钟.tsx';

/** 当前时钟一秒几帧：兼容层里是段.ts 的 fps，原生段和别处是 Composition 的。只给时间工具自己和声音换算用，画面代码用秒 */
export const use帧率 = (): number => {
  const 兼容 = useContext(编排fpsContext);
  const { fps } = useVideoConfig();
  return 兼容 ?? fps;
};

/** 当前时刻（秒，带小数）：段内从段起点算，在 <秒Sequence> 里从它的起点算 */
export const use当前秒 = (): number => useCurrentFrame() / use帧率();

/** 按秒写的 Sequence：起秒、长秒、剪秒（= trimBefore，里面的第 0 秒对应外面内容的第几秒）。帧号可以是小数，不对齐到任何帧网格 */
export const 秒Sequence: React.FC<{ 起秒?: number; 长秒?: number; 剪秒?: number; name?: string; layout?: 'none' | 'absolute-fill'; children: ReactNode }> = ({ 起秒 = 0, 长秒, 剪秒 = 0, name, layout, children }) => {
  const r = use帧率();
  return (
    <Sequence from={起秒 * r} {...(长秒 !== undefined ? { durationInFrames: 长秒 * r } : {})} {...(剪秒 ? { trimBefore: 剪秒 * r } : {})} {...(name ? { name } : {})} {...(layout ? { layout } : {})}>
      {children}
    </Sequence>
  );
};

/** 原生段的根：段起点不在输出帧上时（相位秒 > 0，见 出帧.ts），从 −相位 起，里面第 0 帧 = 段起点、第 g 个输出帧 = 段内 g ÷ fps + 相位秒 */
export const 原生时钟: React.FC<{ 相位秒: number; children: ReactNode }> = ({ 相位秒, children }) => {
  const { fps } = useVideoConfig();
  return 相位秒 === 0 ? (
    <>{children}</>
  ) : (
    <Sequence from={-相位秒 * fps} layout="none" name="原生时钟">
      {children}
    </Sequence>
  );
};

/** 核对 Composition「一帧一个视图」的视图下标（第几个输出帧，整数）。只给核对用：正片画面一律按秒写 */
export const use视图下标 = (): number => Math.floor(useCurrentFrame() + 1e-9);
