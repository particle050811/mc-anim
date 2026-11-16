// 用 ffmpeg 现造的小母版（64×36、2 秒、带正弦音）测抽帧、签名、认可记录、和认可版比，还有 YUV 换 RGB、块平均差、并排图；不碰数据根和真母版。
// 样例用无损 x264（qp 0）：有损编码时后面帧的改动会让前面没改的帧也差几个灰阶，那是真母版的噪声底，阈值另定。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../环境/配置.ts';
import { runCapture } from '../环境/子进程.ts';
import { decode } from 'fast-png';
import { Envelope, findOnsets, compareBlockMeans, compareOnsets, readThresholds, onsetToString, onsetFromString, yuvToRgb, computeBlockDiff, judgeBlockDiff, blocksToView, sideBySide, TileEdge, type Threshold } from './比较.ts';
import { frameStream, readStream, blockMeans, sampleFrames, pickFrameBatch, frameSelectExpr, framesPerBatch } from './帧流.ts';
import { readApproval, writeApproval, approvalFile, type ApprovalRecord } from './认可.ts';
import { isChanged, scanMaster } from './验收.ts';

const threshold: Threshold = { block8Threshold: 24, block16Threshold: 10, block64Threshold: 4, glanceThreshold: 6, blockMeanTol: 1, loudnessTolLu: 0.5, onsetTolFrames: 1 };
let dir = '';
// 声音：静 0.5 秒后起一声 440 Hz（延后、音量可调），起音落在 0.5 秒 + 延后
const makeVideo = (fileName: string, videoFilter: string, soundOpts: { delayMs?: number; volumeDb?: number } = {}) => {
  const f = path.join(dir, fileName);
  runCapture([
    config('ffmpeg'), '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=64x36:rate=24:duration=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.2:sample_rate=48000',
    '-vf', videoFilter, '-af', `volume=${soundOpts.volumeDb ?? -6}dB,adelay=${500 + (soundOpts.delayMs ?? 0)}:all=1,apad=whole_dur=2`,
    '-c:v', 'libx264', '-qp', '0', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-ac', '2', f,
  ]);
  return f;
};
let originalFile = '';
let secondHalfChanged = '';
let smallDot = '';
let lateOneFrame = '';
let veryLate = '';
let loudFile = '';

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-验收样例-'));
  originalFile = makeVideo('原.mkv', 'null');
  secondHalfChanged = makeVideo('后半变.mkv', "drawbox=x=0:y=0:w=32:h=18:color=red:t=fill:enable='gte(n,30)'");
  smallDot = makeVideo('小点.mkv', "drawbox=x=0:y=0:w=2:h=2:color=white:t=fill:enable='gte(n,30)'"); // 四个像素，占 4/2304
  lateOneFrame = makeVideo('晚一帧内.mkv', 'null', { delayMs: 30 });
  veryLate = makeVideo('晚很多.mkv', 'null', { delayMs: 200 });
  loudFile = makeVideo('响了.mkv', 'null', { volumeDb: -3 });
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const makeApproval = async (masterPath: string): Promise<ApprovalRecord> => ({
  segment: '核对-样例', fingerprint: 'f'.repeat(64), platform: 'test', renderLevel: '视频', approvedAt: '2026-10-21T00:00:00Z', commit: 'abc', reason: '测试', prevFingerprint: null,
  ...(await scanMaster(masterPath)).signature,
});

describe('anim verify', () => {
  it('抽样：首帧、每 24 帧、末帧', () => {
    expect(sampleFrames(48)).toEqual([0, 24, 47]);
    expect(sampleFrames(50)).toEqual([0, 24, 48, 49]);
    expect(sampleFrames(1)).toEqual([0]);
    expect(() => sampleFrames(0)).toThrow();
  });

  it('签名可重复：同一母版扫两次一样；认可记录写出去读回来不变', async () => {
    const a = await scanMaster(originalFile);
    const b = await scanMaster(originalFile);
    expect(a.signature).toEqual(b.signature);
    expect(a.signature).toMatchObject({ width: 64, height: 36, frameCount: 48, interval: 24 });
    expect(a.signature.frame.map((f) => f.frame)).toEqual([0, 24, 47]);
    expect(a.signature.frame[0]!.blockMeans).toHaveLength(9);
    expect(a.signature.audioSha).toMatch(/^[0-9a-f]{64}$/);
    expect(a.signature.loudness).toBeLessThan(-10);
    expect(a.signature.onsets!.map((x) => x.sec)).toEqual([0.5]);
    const r = await makeApproval(originalFile);
    const file = approvalFile('核对-样例', 'test', dir);
    writeApproval(file, r);
    expect(file).toBe(path.join(dir, '认可', 'test', '核对-样例.toml'));
    expect(readApproval(file)).toEqual(r);
  });

  it('合规样例放行：和认可版一模一样', async () => {
    const r = await scanMaster(originalFile, { approval: await makeApproval(originalFile), oldMaster: originalFile, threshold: threshold });
    expect(r.frameVerdicts.map((f) => f.verdict)).toEqual(['一样', '一样', '一样']);
    expect(r.audioVerdict).toBe('一样');
    expect(isChanged(r)).toBe(false);
  });

  it('画面变了被拦：有旧母版比块平均差，没有就比块均值；变了的帧写 旧|新|差 并排图进预览', async () => {
    const approval = await makeApproval(originalFile);
    const previewDir = fs.mkdtempSync(path.join(dir, '预览-'));
    const blockDiff = await scanMaster(secondHalfChanged, { approval: approval, oldMaster: originalFile, threshold: threshold, 预览: { 目录: () => previewDir, filePrefix: '核对-样例' } });
    expect(blockDiff.compareMethod).toBe('块差');
    expect(blockDiff.frameVerdicts.map((f) => f.verdict)).toEqual(['一样', '一样', '变了']);
    expect(blockDiff.frameVerdicts[2]!.note).toMatch(/块平均差 16×16 \d+\.\d（门槛 10）/);
    expect(blockDiff.audioVerdict).toBe('一样');
    expect(isChanged(blockDiff)).toBe(true);
    expect(fs.readdirSync(previewDir).sort()).toEqual(['核对-样例-第0047帧-变了-认可-现在-差.png']);
    const decodedPng = decode(fs.readFileSync(path.join(previewDir, '核对-样例-第0047帧-变了-认可-现在-差.png')));
    expect([decodedPng.width, decodedPng.height]).toEqual([64 * 3, 36 * 2]);

    const scanResult = await scanMaster(secondHalfChanged, { approval: approval, oldMaster: path.join(dir, '不在.mkv'), threshold: threshold });
    expect(scanResult.compareMethod).toBe('块均值');
    expect(scanResult.frameVerdicts[2]).toMatchObject({ verdict: '变了', note: expect.stringMatching(/只比了块均值/) });
  });

  it('只差四个像素的小点在容差内（块平均差小），不出图；8×8 门槛压低就拦', async () => {
    const previewDir = fs.mkdtempSync(path.join(dir, '预览-'));
    const r = await scanMaster(smallDot, { approval: await makeApproval(originalFile), oldMaster: originalFile, threshold: threshold, 预览: { 目录: () => previewDir, filePrefix: '核对-小点' } });
    expect(r.frameVerdicts[2]).toMatchObject({ verdict: '容差内', note: expect.stringMatching(/块平均差/) });
    expect(r.frameVerdicts[2]!.看一眼).toBeUndefined();
    expect(isChanged(r)).toBe(false);
    expect(fs.readdirSync(previewDir)).toEqual([]);
    expect((await scanMaster(smallDot, { approval: await makeApproval(originalFile), oldMaster: originalFile, threshold: { ...threshold, block8Threshold: 0.5 } })).frameVerdicts[2]!.verdict).toBe('变了');
  });

  it('16×16 在看一眼门槛和块16门槛之间：不判失败，出「看一眼」并排图', async () => {
    const previewDir = fs.mkdtempSync(path.join(dir, '预览-'));
    const looseThresholds = { ...threshold, block8Threshold: 1e4, block16Threshold: 1e4, block64Threshold: 1e4, glanceThreshold: 1 };
    const r = await scanMaster(secondHalfChanged, { approval: await makeApproval(originalFile), oldMaster: originalFile, threshold: looseThresholds, 预览: { 目录: () => previewDir, filePrefix: '核对-样例' } });
    expect(r.frameVerdicts[2]).toMatchObject({ verdict: '容差内', 看一眼: true });
    expect(isChanged(r)).toBe(false);
    expect(fs.readdirSync(previewDir)).toEqual(['核对-样例-第0047帧-看一眼-认可-现在-差.png']);
  });

  it('声音比响度和起音：一帧内的挪动放行，挪多了、响了都拦；只靠认可记录（没有旧母版）也能比', async () => {
    const approval = await makeApproval(originalFile);
    const nearFrame = await scanMaster(lateOneFrame, { approval: approval, threshold: threshold });
    expect(nearFrame.frameVerdicts.every((f) => f.verdict === '一样')).toBe(true);
    expect(nearFrame.audioVerdict).toBe('容差内');
    const farScan = await scanMaster(veryLate, { approval: approval, threshold: threshold });
    expect(farScan.audioVerdict).toBe('变了');
    expect(farScan.audioNote).toMatch(/0\.5 秒起的声音，现在前后 1 帧内没有/);
    const audioScan = await scanMaster(loudFile, { approval: approval, threshold: threshold });
    expect(audioScan.audioVerdict).toBe('变了');
    expect(audioScan.audioNote).toMatch(/响度差 3\.\d+ LU/);
    // 认可记录没有响度和起音就比不了（不从旧母版补）
    const legacy = { ...approval, loudness: null, onsets: null };
    expect((await scanMaster(lateOneFrame, { approval: legacy, threshold: threshold })).audioNote).toMatch(/比不了/);
  });

  it('抽一百多帧只起一个 ffmpeg：帧号、字节和整段解一遍取到的一样；中间的帧、跳着抽也对', async () => {
    const lengthPath = path.join(dir, '长.mkv');
    runCapture([config('ffmpeg'), '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=64x36:rate=24:duration=8', '-c:v', 'libx264', '-qp', '0', '-pix_fmt', 'yuv420p', lengthPath]);
    const allFrames: Buffer[] = [];
    for await (const rgb of readStream([config('ffmpeg'), '-v', 'error', '-nostdin', '-i', lengthPath, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], 64 * 36 * 3)) allFrames.push(Buffer.from(rgb));
    expect(allFrames.length).toBe(192);
    const sparseFrames = allFrames.map((_, f) => f).filter((f) => f % 7 === 0 || f % 11 === 3 || f === 100);
    const firstHalf = sparseFrames.filter((f) => f < 96);
    for (const frames of [allFrames.map((_, f) => f), sparseFrames, firstHalf, [0], [191], [90, 91]]) {
      expect(pickFrameBatch(frames).length).toBe(1);
      const rgbFrames: Buffer[] = [];
      for await (const rgb of frameStream(lengthPath, frames, 64, 36)) rgbFrames.push(Buffer.from(rgb));
      expect(rgbFrames.length).toBe(frames.length);
      frames.forEach((f, i) => expect(rgbFrames[i]!.equals(allFrames[f]!), `第 ${f} 帧`).toBe(true));
    }
    const missingFrames: Buffer[] = [];
    for await (const rgb of frameStream(lengthPath, [190, 191, 192], 64, 36)) missingFrames.push(Buffer.from(rgb));
    expect(missingFrames.length).toBe(2); // 调用方（扫母版）按帧号要，少了报「抽不出」
  });

  it('超过一批的上限才多起一个 ffmpeg：跨批的帧照样按序，整批帧数的表达式 ffmpeg 收得下、长度不超过 Windows 命令行上限', async () => {
    const frames = Array.from({ length: framesPerBatch + 3 }, (_, f) => f);
    expect(pickFrameBatch(frames).map((batch) => batch.length)).toEqual([framesPerBatch, 3]);
    const largeFrames = frames.slice(0, framesPerBatch).map((f) => f + 100000);
    expect(frameSelectExpr(largeFrames).length).toBeLessThan(32000);
    const extraLengthPath = path.join(dir, '超长.mkv');
    runCapture([config('ffmpeg'), '-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=16x16:rate=24:duration=${(framesPerBatch + 3) / 24}`, '-c:v', 'libx264', '-qp', '0', '-pix_fmt', 'yuv420p', extraLengthPath]);
    const allFrames: Buffer[] = [];
    for await (const rgb of readStream([config('ffmpeg'), '-v', 'error', '-nostdin', '-i', extraLengthPath, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], 16 * 16 * 3)) allFrames.push(Buffer.from(rgb));
    let i = 0;
    for await (const rgb of frameStream(extraLengthPath, frames, 16, 16)) expect(rgb.equals(allFrames[i++]!)).toBe(true);
    expect(i).toBe(framesPerBatch + 3);
  }, 120_000);

  it('帧数尺寸不一样直接算变了', async () => {
    const approval = { ...(await makeApproval(originalFile)), frameCount: 49 };
    const r = await scanMaster(originalFile, { approval: approval, oldMaster: originalFile, threshold: threshold });
    expect(r.sizeChanged).toMatch(/认可的是 64×36 49 帧，现在是 64×36 48 帧/);
    expect(isChanged(r)).toBe(true);
  });

  it('比较函数和阈值文件', () => {
    expect(compareBlockMeans(blockMeans(Buffer.alloc(16 * 9 * 3, 10), 16, 9), blockMeans(Buffer.alloc(16 * 9 * 3, 12), 16, 9))).toBe(2);
    // 起音：静 0.1 秒后一声方波，包络在 0.1 秒跳起；记录写成「秒@强度」读得回来
    const pcm = Buffer.alloc(48000 * 4 * 0.3);
    for (let n = 4800; n < 48000 * 0.3; n++) for (const ch of [0, 2]) pcm.writeInt16LE(n % 100 < 50 ? 8000 : -8000, n * 4 + ch);
    const envelope = new Envelope();
    envelope.加(pcm.subarray(0, 1001));
    envelope.加(pcm.subarray(1001));
    const onsets = findOnsets(envelope.finish());
    expect(onsets.map((x) => x.sec)).toEqual([0.1]);
    expect(onsetFromString(onsetToString(onsets[0]!))).toEqual(onsets[0]);
    expect(compareOnsets([{ sec: 1.04, strength: 20 }], [{ sec: 1, strength: 20 }], 1 / 24)).toEqual({ oldOnly: [], newOnly: [] });
    expect(compareOnsets([{ sec: 1.1, strength: 20 }], [{ sec: 1, strength: 20 }], 1 / 24)).toEqual({ oldOnly: [1], newOnly: [1.1] });
    expect(compareOnsets([{ sec: 1.1, strength: 8 }], [], 1 / 24).newOnly).toEqual([]); // 弱起音只当对面的凭据，自己不要求对得上
    expect(readThresholds()).toEqual({ block8Threshold: 24, block16Threshold: 10, block64Threshold: 4, glanceThreshold: 6, blockMeanTol: 1, loudnessTolLu: 0.5, onsetTolFrames: 1 });
  });
});

describe('换算和块差', () => {
  /** 宽×高 的 yuv420p，Y、U、V 各给一个函数 */
  const yuv = (width: number, height: number, Y: (x: number, y: number) => number, U: (x: number, y: number) => number, V: (x: number, y: number) => number) => {
    const b = Buffer.alloc((width * height * 3) / 2);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) b[y * width + x] = Y(x, y);
    for (let y = 0; y < height / 2; y++) {
      for (let x = 0; x < width / 2; x++) {
        b[width * height + y * (width / 2) + x] = U(x, y);
        b[width * height + (width * height) / 4 + y * (width / 2) + x] = V(x, y);
      }
    }
    return b;
  };

  it('转rgb：BT.601 有限范围的黑、白、灰、红（手算 Q16），色度 2×2 共用', () => {
    const yuvPixel = (Y: number, U: number, V: number) => [...yuvToRgb(yuv(2, 2, () => Y, () => U, () => V), 2, 2).subarray(0, 3)];
    expect(yuvPixel(16, 128, 128)).toEqual([0, 0, 0]);
    expect(yuvPixel(235, 128, 128)).toEqual([255, 255, 255]);
    expect(yuvPixel(126, 128, 128)).toEqual([128, 128, 128]);
    expect(yuvPixel(81, 90, 240)).toEqual([254, 0, 0]); // 1.164383×65 + 1.596027×112 = 254.4
    expect(yuvPixel(0, 0, 0)).toEqual([0, 136, 0]); // 越界截到 0～255
    // 色度：左边 2×2 用 U=128，右边 2×2 用 U=200（偏蓝）
    const rgb = yuvToRgb(yuv(4, 2, () => 126, (x) => (x === 0 ? 128 : 200), () => 128), 4, 2);
    for (const [x, y] of [[0, 0], [1, 1]]) expect(rgb[(y! * 4 + x!) * 3 + 2]).toBe(128);
    for (const [x, y] of [[2, 0], [3, 1]]) expect(rgb[(y! * 4 + x!) * 3 + 2]).toBeGreaterThan(200);
    expect(() => yuvToRgb(Buffer.alloc(6), 3, 2)).toThrow(/偶数/);
    expect(() => yuvToRgb(Buffer.alloc(5), 2, 2)).toThrow(/字节/);
  });

  it('转rgb 和 ffmpeg 解成 rgb24 只差一两级（swscale 各版本取整不一样，所以 verify 不用它）', async () => {
    const y: Buffer[] = [];
    const r: Buffer[] = [];
    for await (const f of frameStream(originalFile, [0, 30], 64, 36, { 格式: 'yuv420p' })) y.push(Buffer.from(f));
    for await (const f of frameStream(originalFile, [0, 30], 64, 36)) r.push(Buffer.from(f));
    for (const [i, f] of y.entries()) {
      const rgbValues = yuvToRgb(f, 64, 36);
      let maxDiff = 0;
      for (let k = 0; k < rgbValues.length; k++) maxDiff = Math.max(maxDiff, Math.abs(rgbValues[k]! - r[i]![k]!));
      expect(maxDiff).toBeLessThanOrEqual(2);
    }
  });

  /** 照定义逐个窗口算，核 算块差 的积分图 */
  const naiveCalc = (newPixels: Buffer, oldBuf: Buffer, width: number, height: number, w: number) => {
    let maxDiff = 0;
    let maxPos = [0, 0];
    for (let y0 = 0; y0 + w <= height; y0 += 4) {
      for (let x0 = 0; x0 + w <= width; x0 += 4) {
        for (let c = 0; c < 3; c++) {
          let s = 0;
          for (let y = y0; y < y0 + w; y++) for (let x = x0; x < x0 + w; x++) s += newPixels[(y * width + x) * 3 + c]! - oldBuf[(y * width + x) * 3 + c]!;
          if (Math.abs(s) / (w * w) > maxDiff) [maxDiff, maxPos] = [Math.abs(s) / (w * w), [x0, y0]];
        }
      }
    }
    return { 差: maxDiff, x: maxPos[0]!, y: maxPos[1]! };
  };

  it('算块差和逐窗口笨算一样（窗口在 4 像素网格上；正负差在窗口里抵消；比窗口小的画面是 0）', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 16) & 255;
    const [width, height] = [134, 74]; // 不是 4 的倍数：右边、下边不满一格的像素不进窗口
    const oldBuf = Buffer.alloc(width * height * 3);
    for (let i = 0; i < oldBuf.length; i++) oldBuf[i] = random();
    const perturbed = Buffer.from(oldBuf);
    for (let i = 0; i < perturbed.length; i++) perturbed[i] = Math.max(0, Math.min(255, perturbed[i]! + (random() % 9) - 4));
    for (let y = 30; y < 50; y++) for (let x = 70; x < 90; x++) perturbed[(y * width + x) * 3 + 1] = Math.min(255, oldBuf[(y * width + x) * 3 + 1]! + 40);
    const d = computeBlockDiff(perturbed, oldBuf, width, height);
    for (const w of TileEdge) {
      const naive = naiveCalc(perturbed, oldBuf, width, height, w);
      expect(d[w].差).toBeCloseTo(naive.差, 9);
      expect([d[w].x, d[w].y]).toEqual([naive.x, naive.y]);
    }
    expect(d[16].差).toBeGreaterThan(20);
    // 棋盘格 ±50：单个像素差很大，块平均是 0
    const grayBuffer = Buffer.alloc(oldBuf.length, 128);
    const checkerboard = Buffer.from(grayBuffer.map((_, i) => (Math.floor(i / 3) + Math.floor(i / 3 / width)) % 2 ? 78 : 178));
    expect(computeBlockDiff(checkerboard, grayBuffer, width, height)[16].差).toBe(0);
    expect(computeBlockDiff(Buffer.alloc(32 * 18 * 3, 9), Buffer.alloc(32 * 18 * 3), 32, 18)).toMatchObject({ 8: { 差: 9 }, 16: { 差: 9 }, 64: { 差: 0 } });
    expect(() => computeBlockDiff(Buffer.alloc(3), Buffer.alloc(6), 1, 1)).toThrow();
  });

  it('判块差：三档门槛任一条超就变了，16×16 在看一眼门槛和块16门槛之间看一眼；要看的块挑超得最多的那档', () => {
    const d = (a: number, b: number, c: number) => ({ 8: { 差: a, x: 0, y: 0 }, 16: { 差: b, x: 4, y: 4 }, 64: { 差: c, x: 8, y: 8 } });
    expect(judgeBlockDiff(d(16.8, 8.77, 2.5), threshold)).toBe('看一眼'); // 实测噪声最高的三个值（不在同一帧）
    expect(judgeBlockDiff(d(16.8, 5.9, 2.5), threshold)).toBe('容差内');
    expect(judgeBlockDiff(d(16.8, 6, 2.5), threshold)).toBe('容差内'); // 等于门槛不算超
    expect(judgeBlockDiff(d(10, 10, 4), threshold)).toBe('看一眼');
    expect(judgeBlockDiff(d(10, 10.01, 1), threshold)).toBe('变了');
    expect(judgeBlockDiff(d(10, 3, 4.01), threshold)).toBe('变了');
    expect(judgeBlockDiff(d(24.01, 3, 1), threshold)).toBe('变了');
    expect(blocksToView(d(10, 3, 1), threshold)).toBe(16);
    expect(blocksToView(d(30, 11, 1), threshold)).toBe(8); // 30/24 > 11/10
    expect(blocksToView(d(30, 11, 6), threshold)).toBe(64);
  });

  it('并排图：上排 旧|新|差，下排放大裁切；窗口外画红框', () => {
    const [width, height] = [96, 54];
    const oldBuf = Buffer.alloc(width * height * 3, 100);
    const patched = Buffer.from(oldBuf);
    for (let y = 20; y < 36; y++) for (let x = 40; x < 56; x++) patched[(y * width + x) * 3] = 140;
    const image = sideBySide(patched, oldBuf, width, height, { x: 40, y: 20, side: 16 });
    expect(image.length).toBe(width * 3 * height * 2 * 3);
    const pixelAt = (x: number, y: number) => [...image.subarray((y * width * 3 + x) * 3, (y * width * 3 + x) * 3 + 3)];
    expect(pixelAt(45, 25)).toEqual([100, 100, 100]); // 旧
    expect(pixelAt(width + 45, 25)).toEqual([140, 100, 100]); // 新
    expect(pixelAt(width * 2 + 45, 25)).toEqual([160, 160, 160]); // 差 40×4
    expect(pixelAt(width * 2 + 10, 10)).toEqual([0, 0, 0]);
    expect(pixelAt(width + 37, 25)).toEqual([255, 0, 0]); // 框在窗口外 3 像素
  });
});
