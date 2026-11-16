import { describe, expect, it } from 'vitest';
import { splitDoorFrac, halfScreenFraming, framing, groundLineFromBottom, fullScreenFraming, fullScreenShot, fullScreenShotCount, treeTopHeight, orthoTop, pxPerCell, pixelCount, defaultSkyArc } from './场/2-门口/参数.ts';
import { skyBrightness, celestialPosition, skySphereAngle, moonPhase } from './地点/天体.ts';
import { sideRig, sideProjection } from './地点/侧剖面.tsx';
import { cherryTreeBlocks, isTreeGrown } from './地点/樱花树.ts';

const doorBoxRight = 2; // 地点/门口小木屋.tsx 门口.站位.箱子右（那边是 tsx，测试不引）

describe('天体：照原版 timeOfDay', () => {
  it('正午太阳在头顶，日出在东（右）、日落在西（左），月亮在对面', () => {
    const arc = { 心: [0, 0] as const, radius: 6 };
    const noon = celestialPosition(6000, arc);
    expect(skySphereAngle(6000)).toBeCloseTo(0, 6);
    expect(noon.sun.x).toBeCloseTo(0, 6);
    expect(noon.sun.z).toBeCloseTo(6, 6);
    expect(noon.moon.z).toBeCloseTo(-6, 6);
    const morning = celestialPosition(0, arc);
    expect(morning.sun.x).toBeGreaterThan(5);
    expect(morning.sun.height).toBeGreaterThan(0);
    const dusk = celestialPosition(12000, arc);
    expect(dusk.sun.x).toBeLessThan(-5);
    expect(celestialPosition(18000, arc).moon.z).toBeCloseTo(6, 6);
  });

  it('天亮：正午 1、午夜 0；月相每天换一格、8 天一轮', () => {
    expect(skyBrightness(6000)).toBe(1);
    expect(skyBrightness(18000)).toBe(0);
    expect([0, 24000, 48000, 7 * 24000, 8 * 24000].map(moonPhase)).toEqual([0, 1, 2, 7, 0]);
  });

  it('默认天弧：正午太阳（2 格见方）不出画面顶边，早晚不出左右边', () => {
    for (const N of [6, 8]) {
      const framing = fullScreenFraming(N);
      const arc = defaultSkyArc(framing, 1280, 720);
      const topY = framing.center[1] + 720 / framing.pxPerCell;
      const halfWidth = 1280 / framing.pxPerCell;
      expect(celestialPosition(6000, arc).sun.z + 1).toBeLessThan(topY);
      expect(Math.abs(celestialPosition(0, arc).sun.x) + 1).toBeLessThan(halfWidth);
    }
  });
});

describe('樱花树：树苗或整棵（用户 10-25 起不再一截截长）', () => {
  it('不到 1 是树苗，到 1 才长成', () => {
    expect([0, 0.5, 0.99, 1].map(isTreeGrown)).toEqual([false, false, false, true]);
    expect(cherryTreeBlocks(false, [-5, 1, 0])).toEqual([{ state: 'minecraft:cherry_sapling', 位: [-5, 1, 0] }]);
  });

  it('整棵树顶 9 格（比屋脊 6.5 格高），格子不重复，地上有花簇', () => {
    const treeBlocks = cherryTreeBlocks(true, [-5, 1, 0]);
    expect(Math.max(...treeBlocks.map((b) => b.位[2] + 1))).toBe(9);
    const cellKeys = treeBlocks.map((b) => b.位.join(','));
    expect(new Set(cellKeys).size).toBe(cellKeys.length);
    expect(treeBlocks.some((b) => b.state.startsWith('minecraft:pink_petals'))).toBe(true);
  });
});

describe('门口取景：贴图像素落在整像素上', () => {
  it('N 是偶数，地面线、门边落在偶数像素（预览级 1280×720 也对齐）', () => {
    expect(pixelCount % 2).toBe(0);
    expect(pxPerCell).toBe(16 * pixelCount);
    expect(framing.center[1] * pxPerCell).toBe(1440 / 2 - groundLineFromBottom());
    expect(groundLineFromBottom()).toBe(300);
    expect([6, 8, 10].map((N) => groundLineFromBottom(N) % 2)).toEqual([0, 0, 0]);
    expect(() => fullScreenFraming(7)).toThrow();
    const h = halfScreenFraming(1280, splitDoorFrac);
    expect(Math.abs(h.center[0] * pxPerCell - Math.round(h.center[0] * pxPerCell))).toBeLessThan(1e-9);
    expect(Math.abs(Math.round(h.center[0] * pxPerCell)) % 2).toBe(0);
    expect(() => halfScreenFraming(1280, 0.7001)).toThrow();
    expect(() => halfScreenFraming(1280, 0.5 + 1 / 1280)).toThrow();
  });

  it('长成的树冠（x −9.5～−1.5，斜投影里的树顶）和整间屋（到屋檐 8.5）在 N = 6、8 的整屏里；N = 6 分屏右边看得到整个树冠和箱子右边站的人', () => {
    for (const N of [6, 8]) {
      const framing = fullScreenFraming(N);
      const halfWidth = 1280 / framing.pxPerCell;
      expect(-9.5).toBeGreaterThanOrEqual(framing.center[0] - halfWidth);
      expect(8.5).toBeLessThanOrEqual(framing.center[0] + halfWidth);
      expect(treeTopHeight(N)).toBeLessThanOrEqual(framing.center[1] + 720 / framing.pxPerCell);
    }
    const h = halfScreenFraming(1280, splitDoorFrac);
    expect(-9.5).toBeGreaterThanOrEqual(h.center[0] - 640 / pxPerCell);
    expect(doorBoxRight).toBeLessThanOrEqual(h.center[0] + 640 / pxPerCell - 0.5);
  });
});

describe('门这个机位的整屏镜头（第 8、9、10 句，第 15 句开头）', () => {
  it('N = 10；门在画面正中，地面线离底 1.5 格、落在偶数成片像素上；描边一个贴图像素宽', () => {
    expect(fullScreenShotCount).toBe(10);
    const framing = fullScreenShot.framing;
    expect(framing.pxPerCell).toBe(16 * fullScreenShotCount);
    const project = sideProjection(framing, 1280, 720);
    expect(project(0, 0).x).toBe(640);
    const bottomDist = (720 - project(0, 0).y) * 2;
    expect(bottomDist).toBe(240);
    expect(bottomDist % 2).toBe(0);
    expect(fullScreenShot.outlineWidth).toBe(fullScreenShotCount);
    expect(pixelCount).toBe(6); // 核对-门口 还是 6（分屏现在是 N = 8，见 场/2-门口/分屏参数.ts）
  });

  it('屋脊（斜投影里往里 3 格的屋顶）还在画里，屋子西边的屋檐也在', () => {
    const framing = fullScreenShot.framing;
    const topY = framing.center[1] + 720 / framing.pxPerCell;
    expect(6.5 + (3 * orthoTop) / fullScreenShotCount).toBeLessThan(topY);
    expect(-1.5).toBeGreaterThan(framing.center[0] - 1280 / framing.pxPerCell);
  });
});

describe('侧剖面机位：看点在剖面上，斜投影往里抬', () => {
  it('门洞中心的地面落在画面正中往下 地面线离底 处；往里 3 格抬 3 × 顶面 ÷ N 格', () => {
    const project = sideProjection(framing, 1280, 720, 2);
    expect(project(0, 0)).toEqual({ x: 640, y: 720 - groundLineFromBottom() / 2 });
    expect(project(0, 0).y - project(0, 0, 3).y).toBeCloseTo((3 * 2 / pixelCount) * pxPerCell / 2, 9);
    expect(sideRig(framing, 2)).toEqual({ kind: '正交', N: pixelCount, topDepth: 2, 看: [0, 0, framing.center[1]], facing: '北' });
  });
});
