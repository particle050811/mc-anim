// fallbackSampler、fallbackHeightRange 和 buildOverworld 拼出来的地形逐点相等，也和拆出来之前 buildOverworld 里的写法（照抄在下面）相等。
// 点阵跨着导入范围的边、远景网格的边和交界修正的边。
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImportedTerrain } from './导入地形.ts';
import type { Seam } from './交界修正.ts';

vi.mock('remotion', () => ({ cancelRender: () => {}, continueRender: () => {}, delayRender: () => 0 }));
vi.mock('./区段工人池.ts', () => ({ fetchSectionsInPool: async () => [], registerSource: () => 1, registerModel: () => {} }));

const { buildOverworld } = await import('./主世界地形.ts');
const { fallbackHeightRange, fallbackSampler } = await import('./远景兜底采样.ts');
const { seamCorrection } = await import('./交界修正.ts');
const { buildDetailLayer, distantTop } = await import('./远景网格.ts');
const { coarseHeightAt } = await import('./区段包.ts');
type DistantGrid = import('./远景网格.ts').DistantGrid;
type CoarseHeightMap = import('./区段包.ts').CoarseHeightMap;

const origin: [number, number, number] = [100, 64, -200];
const coarse: CoarseHeightMap = { cell: 16, x0: -96, y0: -64, nx: 12, ny: 8, height: new Int16Array(96).map((_, k) => (k % 11 === 5 ? -32768 : ((k * 29) % 70) - 10)) };
const nx = 40, nz = 30;
const grid: DistantGrid = {
  packName: '测试-远景',
  x0: -400,
  z0: -600,
  step: 32,
  nx,
  nz,
  seaLevel: 63,
  height: new Int16Array(nx * nz).map((_, k) => 40 + ((k * 13) % 50)),
  biomeIndex: new Uint8Array(nx * nz),
  biomeNames: ['minecraft:plains'],
  biomeTemperature: [0.8],
  layers: [buildDetailLayer('中', { step: 16, tileEdge: 64, n: 4, tile: [[0, -256], [64, -256]] }, new Int16Array(32).map((_, k) => ((k * 7) % 41) - 20))],
};
const seam: Seam = { x0: -160, y0: -112, cellSize: 16, nx: 22, ny: 15, deltas: new Int16Array(22 * 15).map((_, k) => ((k * 17) % 61) - 30), basis: { coarseHeightFingerprint: '对不上', farLayers: [] } };
const fakeImported = (heightRange: [number, number]) => ({ origin, coarse, heightRange, source: { 采样: () => {}, sections: () => null }, 位置: () => [0, 0, 0] }) as unknown as ImportedTerrain;
const points: [number, number][] = [];
for (let y = -700; y <= 600; y += 13.7) for (let x = -620; x <= 900; x += 11.3) points.push([x, y]);

// 拆出来之前 buildOverworld 里的写法
const before = (seamOrNull: Seam | null) => {
  const [ox, oy, oz] = origin;
  const correction = seamOrNull ? seamCorrection(seamOrNull, origin) : undefined;
  const distantGround = (x: number, y: number) => {
    const groundY = distantTop(grid, x + ox, oz - y) + (correction ? correction(x + ox, oz - y) : 0);
    return Math.max(Math.round(groundY) + 1 - oy, grid.seaLevel - oy);
  };
  return (x: number, y: number) => {
    const coarseTop = coarseHeightAt(coarse, x, y);
    return coarseTop === -Infinity ? distantGround(x, y) : coarseTop;
  };
};

afterEach(() => vi.restoreAllMocks());

describe('远景兜底采样', () => {
  it.each([
    ['带交界修正', seam],
    ['不修交界', null],
  ] as const)('%s：和 buildOverworld 的采样、地面逐点相等', (_name, seamOrNull) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const built = buildOverworld(fakeImported([-128, 60]), grid, seamOrNull);
    const sample = fallbackSampler(coarse, grid, seamOrNull, origin);
    const reference = before(seamOrNull);
    const out = { z: 0, crown: 0 };
    const fromSampler = points.map(([x, y]) => sample(x, y));
    expect(points.map(([x, y]) => (built.source.采样(x, y, out), out.z))).toEqual(fromSampler);
    expect(points.map(([x, y]) => built.ground(x, y))).toEqual(fromSampler);
    expect(points.map(([x, y]) => reference(x, y))).toEqual(fromSampler);
    // 点阵确实跨着导入范围的边
    expect(points.some(([x, y]) => coarseHeightAt(coarse, x, y) === -Infinity)).toBe(true);
    expect(points.some(([x, y]) => coarseHeightAt(coarse, x, y) !== -Infinity)).toBe(true);
  });

  it('竖直范围：和 buildOverworld 一样，补充包的顶也算', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const maxHeight = Math.max(...grid.height);
    expect(maxHeight + 1 - origin[1] + 26).toBeGreaterThan(20);
    expect(buildOverworld(fakeImported([-128, 20]), grid, null).heightRange).toEqual([-128, maxHeight + 1 - origin[1] + 26]);
    expect(fallbackHeightRange([-128, 20], grid, origin, 26)).toEqual([-128, maxHeight + 1 - origin[1] + 26]);
    const supplement = fakeImported([-96, 500]);
    expect(buildOverworld(fakeImported([-128, 60]), grid, null, { fillCoarse: false, treeHeight: 10, supplement }).heightRange).toEqual([-128, 500]);
    expect(fallbackHeightRange([-128, 60], grid, origin, 10, 500)).toEqual([-128, 500]);
  });
});
