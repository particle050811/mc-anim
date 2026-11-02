// 混音次序和解码先后无关：用 Remotion 真的混音器和下载表，只换写入先后。
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 固定混音顺序 } from './混音顺序.ts';

const require = createRequire(import.meta.url);
const 目录 = path.dirname(require.resolve('@remotion/renderer'));
const { makeDownloadMap, cleanDownloadMap } = require(path.join(目录, 'assets', 'download-map.js')) as {
  makeDownloadMap: (采样率: number) => { inlineAudioMixing: 混音器 };
  cleanDownloadMap: (m: unknown) => void;
};

type 混音器 = {
  addAsset: (o: Record<string, unknown>) => void;
  finish: (o: Record<string, unknown>) => Promise<void>;
  getListOfAssets: () => { outName: string; startInSamples: number }[];
};

const 声音 = (id: string, 起帧: number, 值: number) => ({
  asset: { type: 'inline-audio', id, frame: 起帧, startInVideo: 起帧, audio: new Array(3200).fill(值), timestamp: 0, duration: 41666, toneFrequency: 1 },
  fps: 24,
  totalNumberOfFrames: 100,
  firstFrame: 0,
  trimLeftOffset: 0,
  trimRightOffset: 0,
});

const 走一遍 = async (次序: ReturnType<typeof 声音>[]) => {
  const m = makeDownloadMap(48000);
  for (const a of 次序) m.inlineAudioMixing.addAsset(a);
  await m.inlineAudioMixing.finish({ binariesDirectory: null, indent: false, logLevel: 'error', cancelSignal: undefined, sampleRate: 48000 });
  const 列表 = m.inlineAudioMixing.getListOfAssets();
  const r = 列表.map((x) => ({ 起: x.startInSamples, 内容: fs.readFileSync(x.outName).toString('base64') }));
  cleanDownloadMap(m);
  return r;
};

describe('固定混音顺序', () => {
  固定混音顺序();
  const 甲 = 声音('甲', 5, 100);
  const 乙 = 声音('乙', 5, 200);
  const 丙 = 声音('丙', 5, 300);
  const 早 = 声音('早', 1, 400);

  it('起点相同的不随写入先后变，内容相同只看内容', async () => {
    const 一 = await 走一遍([甲, 乙, 丙, 早]);
    const 二 = await 走一遍([丙, 早, 乙, 甲]);
    expect(二).toEqual(一);
    expect(一[0]!.起).toBeLessThan(一[1]!.起);
  });

  it('文件名（解码编号）不参与排序', async () => {
    const 一 = await 走一遍([甲, 乙]);
    const 二 = await 走一遍([{ ...乙, asset: { ...乙.asset, id: '阿' } }, { ...甲, asset: { ...甲.asset, id: '零' } }]);
    expect(二).toEqual(一);
  });

  it('重复调用不会包两层', () => {
    const 模块 = require(path.join(目录, 'assets', 'inline-audio-mixing.js')) as { makeInlineAudioMixing: unknown };
    const 前 = 模块.makeInlineAudioMixing;
    固定混音顺序();
    expect(模块.makeInlineAudioMixing).toBe(前);
  });
});
