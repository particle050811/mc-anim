// 段里取时间：一律用秒（用户 11-06 定「直接原生 60 FPS」「不应该都是按函数那种写的吗」，docs/决策/0015-原生60帧.md）。
// use当前秒() = Composition 帧 ÷ 帧率，带小数；嵌套 Sequence 的偏移照常算进去（里面拿到的是从那个 Sequence 起算的秒）。
// Composition 按成片帧率跑，第 0 帧就是段起点（段长对齐到 1/60 秒，段界没有零头）。
// 段、场、库代码不直接调 useCurrentFrame()（anim check 的「时间」规则）；非要一帧一个的（核对视图）用 use视图下标。
import React, { type ReactNode } from 'react';
import { Sequence, useCurrentFrame, useVideoConfig } from 'remotion';

/** Composition 一秒几帧。只给时间工具自己和声音换算用，画面代码用秒 */
export const use帧率 = (): number => useVideoConfig().fps;

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

/**
 * 输出帧落在当前时间轴的哪个零头（0 ≤ x < 1）：这一层的第 g 个输出帧在帧号 整数 + x 上（带小数 from 的 Sequence 算进去）。
 * 只给声音用（段画面.tsx 放一声：把 cue 起点前移到输出帧上、用负的 trimBefore 补静音，起点按样本准）
 */
export const use输出帧零头 = (): number => {
  const f = useCurrentFrame();
  const x = f - Math.floor(f);
  return x < 1e-6 || x > 1 - 1e-6 ? 0 : x;
};

/** 这一层的第几个输出帧（整数）。只给按输出帧排的东西用（注册工厂.tsx 的字幕层：字幕是 pipeline 按输出帧切好的），画面一律按秒写 */
export const use输出帧 = (): number => Math.round(useCurrentFrame());

/**
 * 核对 Composition 的视图下标：一个视图占 1 ÷ 每秒 秒（段长 = 视图数 ÷ 每秒），第几个视图按秒算。只给核对用：正片画面一律按秒写。
 * 每秒 = 1：第 i 个视图在第 i 秒（60 帧输出时第 60i 帧起）
 */
export const use视图下标 = (每秒 = 1): number => Math.max(0, Math.floor(use当前秒() * 每秒 + 1e-9));
