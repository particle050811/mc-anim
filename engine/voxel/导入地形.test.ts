// 裁过的包缺级（docs/世界.md「裁级」）：这一帧真要的区段包里没有、粗高度图又说有，报「缺级」并停下出片；同一块文件里别的区段照常取到；
// 猜的预取要到没有的区段不报、不停，哪一帧真要到时重取、在那一路报。取包、Range、工人都换成假的，只走 导入地形.ts 自己的取法。
// 地形覆盖页：只记不取，挑出 0 个也记下有体素世界从这个包挑（pipeline/渲/地形覆盖.ts 据此认量错）。
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cancelRender = vi.fn();
vi.mock('remotion', () => ({ cancelRender, continueRender: () => {}, delayRender: () => 0 }));
vi.mock('./区段模型.ts', async (orig) => ({ ...(await orig<typeof import('./区段模型.ts')>()), readModel: () => {} }));
vi.mock('./冻结粗高度.ts', () => ({ checkFrozenCoarse: () => {} }));
const fakeData = { fake: true, palette: new Uint16Array(1), runCounts: new Uint16Array(1), paletteIndex: new Uint16Array(1), runLengths: new Uint16Array(1) };
const fetchSectionsInPool = vi.fn(async (_url: string, _start: number, _len: number, parts: { id: unknown }[]) => parts.map(() => ({ data: fakeData, voxels: null })));
vi.mock('./区段工人池.ts', () => ({ fetchSectionsInPool, registerSource: () => 1, registerModel: () => {} }));

const sp = await import('./区段包.ts');
// 块 (0,0)：第 0 级 (0,0) 在，(1,0) 裁掉了（块头里没有）；粗高度图 2×1 格都有地
const file = Buffer.concat(sp.encodeTile(0, 0, 6, [{ id: { L: 0, i: 0, j: 0 }, bytes: new Uint8Array(10) }]));
const maps = sp.encodePackMaps({ coarse: { cell: 64, x0: 0, y0: 0, nx: 2, ny: 1, height: new Int16Array([10, 10]) } });
const info = { version: sp.formatVersion, dimension: '主世界', origin: [0, 0, 0], state: ['minecraft:air'], biome: ['minecraft:plains'], coarsestLevel: 6, tileHeaderMax: sp.tileHeaderLength(file), coarseHeight: maps.coarseHeight, trim: { from: '完整版本', keepSha256: 'x', method: '只留用到的' } };
let packSeq = 0;
const ranges: [number, number][] = [];
vi.mock('../core/数据源.ts', () => ({
  dataUrl: (rel: string) => `/${rel}`,
  fetchJson: async () => info,
  fetchGunzip: async () => maps.bytes.slice().buffer,
  // 越过文件尾截到文件尾（同 Remotion 的静态服务）
  fetchRange: async (_rel: string, start: number, len: number) => (ranges.push([start, len]), new Uint8Array(file.subarray(start, start + len)).buffer),
  loadOnce: <T,>(_k: string, load: () => Promise<T>) => load(),
}));
vi.mock('./区段包位置.ts', () => ({ packDir: (name: string) => `terrain/${name}/裁过${++packSeq}` }));
(globalThis as { location?: { href: string } }).location = { href: 'http://本机/' };
globalThis.fetch = (async () => new Response(new Uint8Array(4))) as typeof fetch;

const { openImportedTerrain } = await import('./导入地形.ts');
const here = { L: 0, i: 0, j: 0 }, trimmedAway = { L: 0, i: 1, j: 0 };
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('裁过的包缺级', () => {
  beforeEach(() => {
    cancelRender.mockClear();
    ranges.length = 0;
  });

  it('真要的区段缺：报缺级、停下出片；同一块里在的区段照常取到', async () => {
    const t = await openImportedTerrain('测试包', [], []);
    const p = t.source.prefetch!([here, trimmedAway]);
    await expect(p).rejects.toThrow(/缺级：地形包 测试包.*从完整包 完整版本 裁过的，没有区段 0\|1\|0.*anim world trim 测试包/);
    await settle();
    expect(cancelRender).toHaveBeenCalledTimes(1);
    expect(String(cancelRender.mock.calls[0]![0])).toMatch(/缺级/);
    expect(await t.sectionData([here])).toEqual([fakeData]);
    expect(ranges).toEqual([[0, info.tileHeaderMax]]); // 块头一次取齐（区段走工人，不经 fetchRange）
  });

  it('猜的预取要到缺的区段：不报、不停；之后真要到时重取并报', async () => {
    const t = await openImportedTerrain('测试包', [], []);
    await t.source.prefetch!([trimmedAway], true)?.catch(() => undefined);
    await settle();
    expect(cancelRender).not.toHaveBeenCalled();
    await expect(t.source.prefetch!([trimmedAway])).rejects.toThrow(/缺级/);
    await settle();
    expect(cancelRender).toHaveBeenCalledTimes(1);
  });
});

const env = await import('../段/地形环境.ts');
describe('地形覆盖页', () => {
  const g = globalThis as { terrainUsage?: Map<string, { version: string; sections: Set<string> }>; terrainCoverFirst?: Map<string, Map<string, number>>; terrainCoverWorlds?: Set<string> };
  beforeEach(() => {
    fetchSectionsInPool.mockClear();
    process.env[env.terrainUsageSegEnv] = '作品/段';
    process.env[env.terrainCoverEnv] = '段';
    g.terrainUsage = new Map([['测试包', { version: 'v', sections: new Set() }]]); // packDir 换成假的了，不经它记包
    return () => {
      delete process.env[env.terrainUsageSegEnv];
      delete process.env[env.terrainCoverEnv];
      delete g.terrainUsage;
      delete g.terrainCoverFirst;
      delete g.terrainCoverWorlds;
    };
  });

  it('只记不取：要的区段（包里有的）记下；挑出 0 个也记下「有体素世界从这个包挑」', async () => {
    const t = await openImportedTerrain('测试包', [], []);
    expect(t.source.prefetch!([])).toBeUndefined();
    expect([...g.terrainCoverWorlds!]).toEqual(['测试包']);
    expect(g.terrainCoverFirst!.get('测试包')!.size).toBe(0);
    expect(t.source.prefetch!([here, { L: 0, i: 5, j: 0 }])).toBeUndefined();
    expect([...g.terrainCoverFirst!.get('测试包')!.keys()]).toEqual(['0|0|0']);
    expect(fetchSectionsInPool).not.toHaveBeenCalled();
  });
});

