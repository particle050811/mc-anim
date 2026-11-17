// 裁过的包缺级（docs/世界.md「裁级」）：这一帧真要的区段包里没有、粗高度图又说有，报「缺级」并停下出片；同一块文件里别的区段照常取到；
// 猜的预取要到没有的区段不报、不停，哪一帧真要到时重取、在那一路报。取包、Range、工人都换成假的，只走 导入地形.ts 自己的取法。
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cancelRender = vi.fn();
vi.mock('remotion', () => ({ cancelRender, continueRender: () => {}, delayRender: () => 0 }));
vi.mock('./真实方块表.ts', () => ({ voxelFromState: () => 0, blockProps: { tint: new Uint8Array(1) }, buildTintTable: () => ({ t: new Uint8Array(3), C: 1 }), biomeIndex: () => 0 }));
vi.mock('./区段模型.ts', async (orig) => ({ ...(await orig<typeof import('./区段模型.ts')>()), readModel: () => {} }));
vi.mock('./冻结粗高度.ts', () => ({ checkFrozenCoarse: () => {} }));
vi.mock('./群系色.ts', () => ({ variesByPos: () => false }));
const fakeData = { 假: true, palette: new Uint16Array(1), runCounts: new Uint16Array(1), paletteIndex: new Uint16Array(1), runLengths: new Uint16Array(1) };
const fetchSectionsInPool = vi.fn(async (_url: string, _start: number, _len: number, parts: { id: unknown }[]) => parts.map(() => ({ data: fakeData, voxels: null })));
vi.mock('./区段工人池.ts', () => ({ fetchSectionsInPool, registerSource: () => 1, registerModel: () => {} }));

const sp = await import('./区段包.ts');
// 块 (0,0)：第 0 级 (0,0) 在，(1,0) 裁掉了（索引长 0）；粗高度图 2×1 格都有地
const index = new Uint32Array(2 * sp.tileEntryCount);
const slot = sp.sectionInTile({ L: 0, i: 0, j: 0 }).slot;
index[2 * slot] = sp.tileHeaderLen;
index[2 * slot + 1] = 10;
const header = sp.encodeTileHeader(0, 0, index);
const heights = Buffer.from(new Int16Array([10, 10]).buffer).toString('base64');
const info = { version: sp.formatVersion, dimension: '主世界', origin: [0, 0, 0], state: ['minecraft:air'], biome: ['minecraft:plains'], coarseHeight: { cell: 64, x0: 0, y0: 0, nx: 2, ny: 1, height: heights }, trim: { from: '完整版本', keepSha256: 'x', method: '只留用到的' } };
let packSeq = 0;
vi.mock('../core/数据源.ts', () => ({
  dataUrl: (rel: string) => `/${rel}`,
  fetchJson: async () => info,
  fetchRange: async () => header.slice().buffer,
  loadOnce: <T,>(_k: string, load: () => Promise<T>) => load(),
}));
vi.mock('./区段包位置.ts', () => ({ packDir: (name: string) => `terrain/${name}/裁过${++packSeq}` }));
(globalThis as { location?: { href: string } }).location = { href: 'http://本机/' };
globalThis.fetch = (async () => new Response(new Uint8Array(4))) as typeof fetch;

const { openImportedTerrain } = await import('./导入地形.ts');
const here = { L: 0, i: 0, j: 0 }, trimmedAway = { L: 0, i: 1, j: 0 };
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('裁过的包缺级', () => {
  beforeEach(() => cancelRender.mockClear());

  it('真要的区段缺：报缺级、停下出片；同一块里在的区段照常取到', async () => {
    const t = await openImportedTerrain('测试包', [], []);
    const p = t.source.prefetch!([here, trimmedAway]);
    await expect(p).rejects.toThrow(/缺级：地形包 测试包.*从完整包 完整版本 裁过的，没有区段 0\|1\|0.*anim world trim 测试包/);
    await settle();
    expect(cancelRender).toHaveBeenCalledTimes(1);
    expect(String(cancelRender.mock.calls[0]![0])).toMatch(/缺级/);
    expect(await t.sectionData([here])).toEqual([fakeData]);
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
