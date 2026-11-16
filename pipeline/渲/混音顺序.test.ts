// 混音次序和解码先后无关：用 Remotion 真的混音器和下载表，只换写入先后。
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pinMixOrder } from './混音顺序.ts';

const require = createRequire(import.meta.url);
const pkgDir = path.dirname(require.resolve('@remotion/renderer'));
const { makeDownloadMap, cleanDownloadMap } = require(path.join(pkgDir, 'assets', 'download-map.js')) as {
  makeDownloadMap: (sampleRate: number) => { inlineAudioMixing: AudioMixer };
  cleanDownloadMap: (m: unknown) => void;
};

type AudioMixer = {
  addAsset: (o: Record<string, unknown>) => void;
  finish: (o: Record<string, unknown>) => Promise<void>;
  getListOfAssets: () => { outName: string; startInSamples: number }[];
};

const makeSoundCue = (id: string, startFrame: number, value: number) => ({
  asset: { type: 'inline-audio', id, frame: startFrame, startInVideo: startFrame, audio: new Array(3200).fill(value), timestamp: 0, duration: 41666, toneFrequency: 1 },
  fps: 24,
  totalNumberOfFrames: 100,
  firstFrame: 0,
  trimLeftOffset: 0,
  trimRightOffset: 0,
});

const runOnce = async (order: ReturnType<typeof makeSoundCue>[]) => {
  const m = makeDownloadMap(48000);
  for (const a of order) m.inlineAudioMixing.addAsset(a);
  await m.inlineAudioMixing.finish({ binariesDirectory: null, indent: false, logLevel: 'error', cancelSignal: undefined, sampleRate: 48000 });
  const mixedAssets = m.inlineAudioMixing.getListOfAssets();
  const r = mixedAssets.map((x) => ({ start: x.startInSamples, content: fs.readFileSync(x.outName).toString('base64') }));
  cleanDownloadMap(m);
  return r;
};

describe('固定混音顺序', () => {
  pinMixOrder();
  const soundFirst = makeSoundCue('甲', 5, 100);
  const secondSound = makeSoundCue('乙', 5, 200);
  const soundC = makeSoundCue('丙', 5, 300);
  const earlySound = makeSoundCue('早', 1, 400);

  it('起点相同的不随写入先后变，内容相同只看内容', async () => {
    const firstRun = await runOnce([soundFirst, secondSound, soundC, earlySound]);
    const secondRun = await runOnce([soundC, earlySound, secondSound, soundFirst]);
    expect(secondRun).toEqual(firstRun);
    expect(firstRun[0]!.start).toBeLessThan(firstRun[1]!.start);
  });

  it('文件名（解码编号）不参与排序', async () => {
    const firstRun = await runOnce([soundFirst, secondSound]);
    const secondRun = await runOnce([{ ...secondSound, asset: { ...secondSound.asset, id: '阿' } }, { ...soundFirst, asset: { ...soundFirst.asset, id: '零' } }]);
    expect(secondRun).toEqual(firstRun);
  });

  it('重复调用不会包两层', () => {
    const mixingModule = require(path.join(pkgDir, 'assets', 'inline-audio-mixing.js')) as { makeInlineAudioMixing: unknown };
    const original = mixingModule.makeInlineAudioMixing;
    pinMixOrder();
    expect(mixingModule.makeInlineAudioMixing).toBe(original);
  });
});
