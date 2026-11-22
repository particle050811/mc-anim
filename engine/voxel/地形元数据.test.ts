// readPackMeta 和 导入地形.ts 自己推的元数据逐项对照（导入地形.ts 还没改走数据源，两份推导靠这里守着一致）：
// 粗高度图（粗图.bin.gz）、竖直范围、各级能不能细分、哪些区段有地。导入地形那边的取包、工人照 导入地形.test.ts 换成假的。
import { gzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import type { PackageInfo } from './区段包.ts';
import type { SectionId } from './区段.ts';

vi.mock('remotion', () => ({ cancelRender: () => {}, continueRender: () => {}, delayRender: () => 0 }));
vi.mock('./区段模型.ts', async (orig) => ({ ...(await orig<typeof import('./区段模型.ts')>()), readModel: () => {} }));
vi.mock('./冻结粗高度.ts', () => ({ checkFrozenCoarse: () => {} }));
vi.mock('./区段工人池.ts', () => ({ fetchSectionsInPool: async () => [], registerSource: () => 1, registerModel: () => {} }));
const recorded: string[][] = [];
vi.mock('./地形用量.ts', () => ({ recordSectionRead: (_pack: string, keys: string[]) => recorded.push(keys) }));
let currentInfo: PackageInfo;
let currentMaps: Uint8Array;
vi.mock('../core/数据源.ts', () => ({ dataUrl: (rel: string) => `/${rel}`, fetchJson: async () => currentInfo, fetchGunzip: async () => currentMaps.slice().buffer, loadOnce: <T,>(_k: string, load: () => Promise<T>) => load() }));
let packSeq = 0;
vi.mock('./区段包位置.ts', () => ({ packDir: (name: string) => `terrain/${name}/v${++packSeq}` }));
(globalThis as { location?: { href: string } }).location = { href: 'http://本机/' };
globalThis.fetch = (async () => new Response(new Uint8Array(4))) as typeof fetch;

const sp = await import('./区段包.ts');
const { sectionKey } = await import('./区段.ts');
const { openImportedTerrain } = await import('./导入地形.ts');
const { readPackMeta } = await import('./地形元数据.ts');
const { memoryDataSource } = await import('../core/内存数据源.ts');

// 12×8 格、16 米一格的粗高度图，起点不在区段边上；−32768 是没数据
const nx = 12, ny = 8;
const heights = new Int16Array(nx * ny).map((_, k) => (k % 7 === 3 || (k >= 40 && k < 52) ? -32768 : ((k * 37) % 90) - 20));
const coarse = { cell: 16, x0: -48, y0: -32, nx, ny, height: heights };
const bits = (n: number, on: (k: number) => boolean) => Uint8Array.from(Array.from({ length: Math.ceil(n / 8) }, (_, b) => Array.from({ length: 8 }, (_, t) => (on(b * 8 + t) ? 1 << t : 0)).reduce((x, y) => x | y, 0)));
const pack = (head: Pick<PackageInfo, 'dimension' | 'origin' | 'state' | 'biome'>, maps: import('./区段包.ts').PackMaps) => {
  const { bytes, coarseHeight, splittable } = sp.encodePackMaps(maps);
  return { info: { version: sp.formatVersion, ...head, coarsestLevel: 6, tileHeaderMax: 100, coarseHeight, ...(splittable ? { splittable } : {}) } as PackageInfo, maps: bytes };
};
const packs: Record<string, { info: PackageInfo; maps: Uint8Array }> = {
  overworldFull: pack({ dimension: '主世界', origin: [100, 64, -200], state: ['minecraft:air'], biome: ['minecraft:plains'] }, { coarse }),
  twilightSplittable: pack(
    { dimension: '暮色', origin: [0, 0, 0], state: ['minecraft:air'], biome: ['twilightforest:forest'] },
    { coarse, splittable: [null, { i0: -2, j0: -1, ni: 4, nj: 3, bits: bits(12, (k) => k % 3 !== 0) }, { i0: -1, j0: -1, ni: 2, nj: 2, bits: bits(4, (k) => k !== 2) }] },
  ),
};
const sections: SectionId[] = [];
for (let L = 0; L <= 3; L++) for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) sections.push({ L, i, j });

describe('readPackMeta 和 openImportedTerrain 对照', () => {
  it.each(Object.keys(packs))('%s', async (name) => {
    ({ info: currentInfo, maps: currentMaps } = packs[name]!);
    const imported = await openImportedTerrain(name, [], []);
    const dir = `terrain/${name}/v`;
    const meta = await readPackMeta(memoryDataSource({ [`${dir}/包.json`]: JSON.stringify(currentInfo), [`${dir}/粗图.bin.gz`]: gzipSync(currentMaps) }), dir);
    expect(meta.coarse).toEqual(imported.coarse);
    expect([...meta.coarse.height]).toEqual([...heights]);
    expect(imported.source.coarsestLevel).toBe(6);
    expect(meta.heightRange).toEqual(imported.heightRange);
    expect(meta.maxTop).toBe(imported.heightRange[1]);
    expect(meta.info).toEqual(currentInfo);
    const importedSplit = imported.source.canSplit;
    expect(meta.canSplit === undefined).toBe(importedSplit === undefined);
    if (importedSplit) {
      const split = sections.map((q) => meta.canSplit!(q.L, q.i, q.j));
      expect(split).toEqual(sections.map((q) => importedSplit(q.L, q.i, q.j)));
      expect(new Set(split)).toEqual(new Set([true, false]));
    }
    // 导入地形按粗高度图过滤后记进地形用量的，就是它认为包里有的区段
    recorded.length = 0;
    imported.noteSections(sections);
    expect(recorded).toEqual([sections.filter(meta.hasSection).map(sectionKey)]);
    expect(recorded[0]!.length).toBeGreaterThan(0);
    expect(recorded[0]!.length).toBeLessThan(sections.length);
  });

  it('格式不对：和导入地形同一句报错', async () => {
    const dir = 'terrain/旧格式/v';
    const old = { ...packs.overworldFull!.info, version: sp.formatVersion - 1 };
    await expect(readPackMeta(memoryDataSource({ [`${dir}/包.json`]: JSON.stringify(old) }), dir)).rejects.toThrow(`地形包是格式 ${sp.formatVersion - 1}，这版代码只读格式 ${sp.formatVersion}`);
    currentInfo = old;
    await expect(openImportedTerrain('旧格式', [], [])).rejects.toThrow(`地形包是格式 ${sp.formatVersion - 1}，这版代码只读格式 ${sp.formatVersion}`);
  });
});
