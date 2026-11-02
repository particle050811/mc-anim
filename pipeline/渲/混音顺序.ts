// Remotion 4.0.537 把每个声音写成一个 wav，按起点排序后混音；起点相同的按写入先后，而写入先后是 @remotion/media 异步解码完成的次序，渲两遍可能不同。
// inline 声音多于 10 条时，每 10 条先混成 16 位中间 wav，再逐层合并；同起点组跨过十条分组边界时，次序会改变分组（merge-inline-audio-tracks.js 的 MAX_INLINE_AUDIO_INPUTS）。
// 起点相同的改按文件内容排，和解码先后无关；内容相同的两条换位不影响结果。
// 不写 node_modules，也不进段指纹（只定次序）。版本锁定，依赖布局变了这里直接报错，不能静默漏修。
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

type 混音项 = { outName: string; startInSamples: number; durationInSamples: number };

export const 按起点和内容排 = <T extends 混音项>(列表: readonly T[]): T[] => {
  const 内容 = new Map<string, string>();
  const 校验 = (文件: string) => {
    let v = 内容.get(文件);
    if (v === undefined) {
      v = crypto.createHash('sha256').update(fs.readFileSync(文件)).digest('hex');
      内容.set(文件, v);
    }
    return v;
  };
  return [...列表].sort((a, b) => {
    if (a.startInSamples !== b.startInSamples) return a.startInSamples - b.startInSamples;
    const x = 校验(a.outName);
    const y = 校验(b.outName);
    return x < y ? -1 : x > y ? 1 : 0;
  });
};

const 已固定 = Symbol('混音顺序已固定');

/** 只供渲染器.ts 绑定 CJS 入口：download-map 每次从导出上取工厂；ESM 的内置工厂不受此补丁影响 */
export const 固定混音顺序 = () => {
  const require = createRequire(import.meta.url);
  const 模块路径 = path.join(path.dirname(require.resolve('@remotion/renderer')), 'assets', 'inline-audio-mixing.js');
  const 模块 = require(模块路径) as { makeInlineAudioMixing?: ((...a: unknown[]) => { getListOfAssets: () => 混音项[] }) & { [已固定]?: true } };
  const 原 = 模块.makeInlineAudioMixing;
  if (typeof 原 !== 'function') throw new Error(`${模块路径} 没有 makeInlineAudioMixing：Remotion 布局变了，要重新核对混音顺序`);
  if (原[已固定]) return;
  const 换 = ((...参数: unknown[]) => {
    const 混 = 原(...参数);
    return { ...混, getListOfAssets: () => 按起点和内容排(混.getListOfAssets()) };
  }) as NonNullable<typeof 模块.makeInlineAudioMixing>;
  换[已固定] = true;
  模块.makeInlineAudioMixing = 换;
};
