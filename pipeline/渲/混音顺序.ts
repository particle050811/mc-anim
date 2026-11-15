// Remotion 4.0.537 把每个声音写成一个 wav，按起点排序后混音；起点相同的按写入先后，而写入先后是 @remotion/media 异步解码完成的次序，渲两遍可能不同。
// inline 声音多于 10 条时，每 10 条先混成 16 位中间 wav，再逐层合并；同起点组跨过十条分组边界时，次序会改变分组（merge-inline-audio-tracks.js 的 MAX_INLINE_AUDIO_INPUTS）。
// 起点相同的改按文件内容排，和解码先后无关；内容相同的两条换位不影响结果。
// 不写 node_modules，也不进段指纹（只定次序）。版本锁定，依赖布局变了这里直接报错，不能静默漏修。
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

type MixItem = { outName: string; startInSamples: number; durationInSamples: number };

export const sortByStartAndContent = <T extends MixItem>(items: readonly T[]): T[] => {
  const contentByFile = new Map<string, string>();
  const checkFile = (file: string) => {
    let v = contentByFile.get(file);
    if (v === undefined) {
      v = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      contentByFile.set(file, v);
    }
    return v;
  };
  return [...items].sort((a, b) => {
    if (a.startInSamples !== b.startInSamples) return a.startInSamples - b.startInSamples;
    const x = checkFile(a.outName);
    const y = checkFile(b.outName);
    return x < y ? -1 : x > y ? 1 : 0;
  });
};

const mixOrderPinned = Symbol('混音顺序已固定');

/** 只供渲染器.ts 绑定 CJS 入口：download-map 每次从导出上取工厂；ESM 的内置工厂不受此补丁影响 */
export const pinMixOrder = () => {
  const require = createRequire(import.meta.url);
  const modulePath = path.join(path.dirname(require.resolve('@remotion/renderer')), 'assets', 'inline-audio-mixing.js');
  const mixingModule = require(modulePath) as { makeInlineAudioMixing?: ((...a: unknown[]) => { getListOfAssets: () => MixItem[] }) & { [mixOrderPinned]?: true } };
  const makeMixing = mixingModule.makeInlineAudioMixing;
  if (typeof makeMixing !== 'function') throw new Error(`${modulePath} 没有 makeInlineAudioMixing：Remotion 布局变了，要重新核对混音顺序`);
  if (makeMixing[mixOrderPinned]) return;
  const patched = ((...params: unknown[]) => {
    const base = makeMixing(...params);
    return { ...base, getListOfAssets: () => sortByStartAndContent(base.getListOfAssets()) };
  }) as NonNullable<typeof mixingModule.makeInlineAudioMixing>;
  patched[mixOrderPinned] = true;
  mixingModule.makeInlineAudioMixing = patched;
};
