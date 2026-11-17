// Node 数据源：按链接表读盘；拿它读真地形包（数据根里没有就跳过），和现有代码本来就核的两样独立真值对上：
// 包.json 的粗高度指纹 = assets/冻结粗高度/主世界-116.json 的 fingerprint；交界修正的依据 = 现读的粗高度指纹、远景各加密层块数。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { coarseHeightFingerprint } from '../../engine/voxel/区段包.ts';
import { readPackMeta } from '../../engine/voxel/地形元数据.ts';
import { readDistantGrid } from '../../engine/voxel/远景网格.ts';
import { readSeam, seamBasisMatches } from '../../engine/voxel/交界修正.ts';
import { codeRoot } from '../环境/路径.ts';
import { terrainRoot } from '../环境/配置.ts';
import { nodeDataSource } from './node数据源.ts';
import { readTerrainTable } from './版本.ts';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '世界-node数据源-'));
afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));

describe('nodeDataSource', () => {
  const root = path.join(tempDir, '地形');
  fs.mkdirSync(path.join(root, '包', 'v1'), { recursive: true });
  fs.writeFileSync(path.join(root, '包', 'v1', 'a.json'), '{"x":1}');
  fs.writeFileSync(path.join(root, '包', 'v1', 'b.bin.gz'), gzipSync(Buffer.from([1, 2, 3])));
  const src = nodeDataSource({ terrain: root });

  it('第一段按链接表换成目录', async () => {
    expect(src.kind).toBe('node');
    expect(await src.json('terrain/包/v1/a.json')).toEqual({ x: 1 });
    expect(new Uint8Array(await src.gunzip('terrain/包/v1/b.bin.gz'))).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('没有的：IfAny 给 null，别的报取不到和提示', async () => {
    expect(await src.jsonIfAny('terrain/包/v1/无.json')).toBeNull();
    await expect(src.json('terrain/包/v1/无.json', '先烘')).rejects.toThrow('取不到 terrain/包/v1/无.json（ENOENT），先烘');
    await expect(src.json('别处/包/a.json')).rejects.toThrow(/第一段不是 public 目录里的链接/);
  });

  it('once 按实例隔离', async () => {
    let n = 0;
    const load = async () => ++n;
    expect(await src.once('k', load)).toBe(1);
    expect(await src.once('k', load)).toBe(1);
    expect(await nodeDataSource({ terrain: root }).once('k', load)).toBe(2);
  });
});

// 读哪一版：登记的完整包，本机没有就读裁过的
const localVersion = (pack: string) => {
  const entry = readTerrainTable().pack[pack];
  if (!entry) return null;
  for (const version of [entry.version, entry.trimmed?.version]) if (version && fs.existsSync(path.join(terrainRoot(), pack, version))) return version;
  return null;
};
const packVersion = localVersion('主世界-116'), distantVersion = localVersion('主世界-116-远景');

describe.skipIf(!packVersion || !distantVersion)('Node 源读真包 主世界-116', () => {
  it('粗高度指纹对上冻结的那份；交界修正的依据对上现读的导入包和远景包', async () => {
    const src = nodeDataSource();
    const meta = await readPackMeta(src, `terrain/主世界-116/${packVersion}`);
    const fingerprint = coarseHeightFingerprint(meta.coarse);
    const frozen = JSON.parse(fs.readFileSync(path.join(codeRoot(), 'assets', '冻结粗高度', '主世界-116.json'), 'utf8')) as { fingerprint: string };
    expect(fingerprint).toBe(frozen.fingerprint);
    expect(meta.heightRange[0]).toBe(-64 - meta.info.origin[1]);

    const distantDir = `terrain/主世界-116-远景/${distantVersion}`;
    const grid = await readDistantGrid(src, distantDir, '主世界-116-远景');
    const seam = await readSeam(src, distantDir, '主世界-116');
    expect(seam).not.toBeNull();
    expect(seam!.basis?.coarseHeightFingerprint).toBe(fingerprint);
    expect(seam!.basis?.farLayers).toEqual(grid.layers.map((F) => `${F.name}:${F.tile.size}`));
    expect(seamBasisMatches(seam!, meta.coarse, grid)).toBe(true);
    expect(grid.height.length).toBe(grid.nx * grid.nz);
  });
});
