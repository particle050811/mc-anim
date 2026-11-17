// anim diff：挑窗口、超门槛块数、差图配色、配对、视频帧号对到段内帧号、复查命令。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encode } from 'fast-png';
import { describe, expect, it } from 'vitest';
import { computeBlockDiff } from './比较.ts';
import { analyzePair, diffPanel, hotspotDirection, identicalAnalysis, teleRect } from './对比.ts';
import { frameKey, pairDirs, parseStillName, pickVideoFrames, planDiff, readPairs, segFrameFromManifest } from './对比配对.ts';
import { recheckCommand, runDiff } from './对比报告.ts';

const threshold = { block8Threshold: 24, block16Threshold: 10, block64Threshold: 4, glanceThreshold: 6, blockMeanTol: 1, loudnessTolLu: 0.5, onsetTolFrames: 1 };

/** w×h 的灰图，fill 填 (x, y) 处的颜色 */
const image = (w: number, h: number, fill: (x: number, y: number) => [number, number, number] | null = () => null) => {
  const b = Buffer.alloc(w * h * 3, 100);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = fill(x, y);
      if (c) b.set(c, (y * w + x) * 3);
    }
  return b;
};

describe('analyzePair', () => {
  it('挑出差得最多的块、给居中的望远框，已挑的框里不再挑；块差和 computeBlockDiff 一样', () => {
    const [w, h] = [384, 216];
    const old = image(w, h);
    // 两处：(40..56, 40..56) 亮 50 级，(300..316, 150..166) 暗 20 级
    const neu = image(w, h, (x, y) => (x >= 40 && x < 56 && y >= 40 && y < 56 ? [150, 150, 150] : x >= 300 && x < 316 && y >= 150 && y < 166 ? [80, 80, 80] : null));
    const a = analyzePair(neu, old, w, h, threshold, { hotspots: 5, zoom: 8 });
    expect(a.frame.block).toEqual(computeBlockDiff(neu, old, w, h));
    expect(a.frame.verdict).toBe('变了');
    expect(a.hotspots.length).toBeGreaterThanOrEqual(2);
    const [first, second] = a.hotspots;
    expect(first!.x + first!.edge / 2).toBeCloseTo(48, -1);
    expect(hotspotDirection(first!)).toBe('亮了');
    expect(second!.x).toBeGreaterThan(250);
    expect(hotspotDirection(second!)).toBe('暗了');
    // 望远框宽 = 全宽 / 8，夹在画面里
    expect(first!.tele.width).toBe(48);
    expect(first!.tele.x).toBeGreaterThanOrEqual(0);
    // 不重叠的 16×16 块：亮的那块正好盖住一块（40 不在 16 的格上，跨四块，各 1/4 面积 = 12.5 级 > 10）
    expect(a.tiles[16].over).toBe(4);
    expect(a.tiles[16].total).toBe(24 * 13);
  });

  it('一样的两帧：没有窗口、判一样；identicalAnalysis 的块总数和真算的一样', () => {
    const [w, h] = [128, 72];
    const a = analyzePair(image(w, h), image(w, h), w, h, threshold);
    expect(a.hotspots).toEqual([]);
    expect(a.frame.over[0]).toBe(0);
    expect(identicalAnalysis(w, h, threshold).tiles).toEqual(a.tiles);
  });

  it('teleRect 贴边时夹进画面', () => {
    expect(teleRect(0, 0, 3840, 2160, 8)).toEqual({ x: 0, y: 0, width: 480, height: 270 });
    expect(teleRect(3840, 2160, 3840, 2160, 8)).toEqual({ x: 3360, y: 1890, width: 480, height: 270 });
  });

  it('亮了、暗了、颜色变了', () => {
    expect(hotspotDirection({ meanRgb: [30, 10, -5] })).toBe('亮了');
    expect(hotspotDirection({ meanRgb: [-3, -9, -2] })).toBe('暗了');
    expect(hotspotDirection({ meanRgb: [20, -18, 0] })).toBe('颜色变了');
  });
});

describe('diffPanel', () => {
  it('三格横排、缩到格宽以内；差图红亮蓝暗、缩小时零星的差不被平均掉', () => {
    const [w, h] = [64, 32];
    const old = image(w, h);
    const neu = image(w, h, (x, y) => (x === 1 && y === 1 ? [200, 200, 200] : x === 40 && y === 20 ? [0, 0, 0] : null));
    const p = diffPanel(neu, old, w, h, [], { panelWidth: 32, gain: 8 });
    expect(p.scale).toBe(2);
    expect([p.width, p.height]).toEqual([32 * 3 + 16, 16]);
    const px = (panel: number, x: number, y: number) => [...p.rgb.subarray((y * p.width + panel * 40 + x) * 3, (y * p.width + panel * 40 + x) * 3 + 3)];
    expect(px(2, 0, 0)[0]).toBe(255); // 亮了 100 级 × 8 → 红到顶
    expect(px(2, 20, 10)[2]).toBe(255); // 暗了 → 蓝
    expect(px(2, 5, 5)).toEqual([15, 15, 15]); // 没差：旧图亮度的 15%
    expect(px(0, 5, 5)).toEqual([100, 100, 100]);
  });
});

describe('配对', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'anim-diff-'));
  const png = (w: number, h: number, v: number) => encode({ width: w, height: h, data: new Uint8Array(w * h * 3).fill(v), channels: 3, depth: 8 });

  it('静帧名拆出段键、帧号、后缀；配对帧号认「第N帧」或最后一串数字', () => {
    expect(parseStillName('6-飞越主世界俯冲边城-第0700帧.png')).toEqual({ segKey: '6-飞越主世界俯冲边城', frame: 700, variant: '' });
    expect(parseStillName('6-飞越-第1960帧-望远-x2360-y645-宽480.png')?.variant).toBe('-望远-x2360-y645-宽480');
    expect(frameKey('frame-0012.png')).toBe(12);
    expect(frameKey('无数字.png')).toBeNull();
  });

  it('同名先配；剩下按帧号配，两边都只有一张这个帧号才配', () => {
    const [a, b] = [tmp(), tmp()];
    for (const n of ['s-第0001帧.png', 's-第0002帧.png', 'x-第0005帧.png', 'p-第0007帧.png', 'q-第0007帧.png']) fs.writeFileSync(path.join(a, n), png(4, 4, 1));
    for (const n of ['s-第0001帧.png', 's-第0002帧.png', 'y-第0005帧.png', 'r-第0007帧.png', '多出来.png']) fs.writeFileSync(path.join(b, n), png(4, 4, 2));
    const r = pairDirs(a, b);
    expect(r.pairs.map((p) => path.basename(p.aFile))).toEqual(['s-第0001帧.png', 's-第0002帧.png', 'x-第0005帧.png']);
    expect(r.pairs[2]!.bFile.endsWith('y-第0005帧.png')).toBe(true);
    expect(r.onlyA.sort()).toEqual(['p-第0007帧.png', 'q-第0007帧.png']);
    expect(r.onlyB.sort()).toEqual(['r-第0007帧.png', '多出来.png']);
  });

  it('字节一样的不解码、判一样；不一样的照常比，00-说明.md 带汇总和「你的回复：」', async () => {
    const [a, b, out] = [tmp(), tmp(), tmp()];
    fs.writeFileSync(path.join(a, 's-第0001帧.png'), png(64, 36, 9));
    fs.writeFileSync(path.join(b, 's-第0001帧.png'), png(64, 36, 9));
    fs.writeFileSync(path.join(a, 's-第0002帧.png'), png(64, 36, 9));
    fs.writeFileSync(path.join(b, 's-第0002帧.png'), png(64, 36, 30));
    const plan = planDiff(a, b);
    const kinds = [];
    for await (const d of readPairs(plan)) kinds.push('identical' in d ? '一样' : 'error' in d ? '出错' : '解了');
    expect(kinds).toEqual(['一样', '解了']);
    const logs: string[] = [];
    const { code, results } = await runDiff(plan, { outDir: out, threshold, aName: 'A', bName: 'B', log: (s) => logs.push(s) });
    expect(code).toBe(1);
    expect(results.map((r) => r.verdict)).toEqual(['一样', '变了']);
    expect(results[1]!.image).toBe('02-s-第0002帧-变了.png');
    expect(fs.existsSync(path.join(out, results[1]!.image!))).toBe(true);
    const note = fs.readFileSync(path.join(out, '00-说明.md'), 'utf8');
    expect(note).toMatch(/## 汇总/);
    expect(note.trimEnd().endsWith('你的回复：')).toBe(true);
    expect(logs.join('\n')).toMatch(/变了 1，一样 1/);
  });

  it('视频帧号对到段内帧号：试看片 --frames 的一截从 frames[0] 起', () => {
    const m = { frames: [600, 779] as [number, number], segment: [{ key: '6-飞越', frameCount: 180, filmStartFrame: 0 }] };
    expect(segFrameFromManifest(m, 10)).toEqual({ segKey: '6-飞越', frame: 610 });
    const film = { segment: [{ key: 'a', frameCount: 100, filmStartFrame: 0 }, { key: 'b', frameCount: 50, filmStartFrame: 100 }] };
    expect(segFrameFromManifest(film, 120)).toEqual({ segKey: 'b', frame: 20 });
    expect(segFrameFromManifest(film, 150)).toBeNull();
  });

  it('视频抽哪几帧：默认每秒一帧含末帧，--frames 截到视频里，和 --every 一起时从起点隔 n 帧', () => {
    expect(pickVideoFrames(130, 60, {})).toEqual([0, 60, 120, 129]);
    expect(pickVideoFrames(100, 60, { frames: [90, 95, 99, 100, 105] })).toEqual([90, 95, 99]);
    expect(pickVideoFrames(1000, 60, { frames: Array.from({ length: 11 }, (_, i) => 10 + i), every: 5 })).toEqual([10, 15, 20]);
  });
});

describe('复查命令', () => {
  const hotspot = { edge: 16 as const, x: 100, y: 100, diff: 12, ratio: 1.2, meanRgb: [12, 12, 12] as [number, number, number], tele: { x: 0, y: 0, width: 480, height: 270 } };
  const analysis = { frame: {} as never, tiles: {} as never, hotspots: [hotspot, { ...hotspot, tele: { x: 480, y: 270, width: 480, height: 270 } }] };
  const pair = { label: 'x', aFile: '', bFile: '', frame: 7, segFrame: { segKey: '6-飞越', frame: 7 }, variant: '' };

  it('几块望远拼成一条，试看参数照设，--vs 带上', () => {
    const c = recheckCommand({ pair, width: 3840, analysis }, { topic: '工作-复查', vsTarget: 'main', trialEnv: { REMOTION_ANIM_TRIAL: '{"台阶并色":{"off":true}}' } });
    expect(c.command).toBe(`REMOTION_ANIM_TRIAL='{"台阶并色":{"off":true}}' anim still 6-飞越 7 --to-preview 工作-复查 --tele '0,0,480;480,270,480' --vs main`);
  });

  it('预览级加 --level 预览；望远出的图、尺寸认不出的不给命令', () => {
    expect(recheckCommand({ pair, width: 1280, analysis }, { topic: 't' }).command).toMatch(/--level 预览 --tele/);
    expect(recheckCommand({ pair: { ...pair, variant: '-望远-x1-y1-宽480' }, width: 3840, analysis }, { topic: 't' }).command).toBeNull();
    expect(recheckCommand({ pair, width: 1000, analysis }, { topic: 't' }).command).toBeNull();
    expect(recheckCommand({ pair: { ...pair, segFrame: null }, width: 3840, analysis }, { topic: 't' }).command).toMatch(/anim still <段> <帧>/);
  });
});
