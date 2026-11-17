// 裁级：留表补祖先和 L3 以上；裁过的包留下的每段和完整包逐字节一样、没留的索引是 0；改坏一个字节逐段核对查得出。
// 块头格式用 engine 那份（真实方块表要 asset:，vitest 里换成空表）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../engine/voxel/真实方块表.ts', () => ({ voxelFromState: () => 0, blockProps: {}, buildTintTable: () => ({}), biomeIndex: () => 0 }));
vi.mock('../体素库.ts', () => ({ loadVoxelLib: async () => ({ sectionPack: await import('../../../engine/voxel/区段包.ts'), sections: await import('../../../engine/voxel/区段.ts') }) }));

const sp = await import('../../../engine/voxel/区段包.ts');
const { keepTable, keepTableText, writeTrimmed, compareTrimmed, packSections, keepFileName, fullRecordFileName, sha256 } = await import('./裁剪.ts');
const { sectionKey } = await import('../../../engine/voxel/区段.ts');

/** 一个块文件：给的区段各写一段可辨认的字节，按给的先后排 */
const writeTile = (dir: string, ti: number, tj: number, sections: { L: number; i: number; j: number }[]) => {
  const index = new Uint32Array(2 * sp.tileEntryCount);
  const bodies: Buffer[] = [];
  let off = sp.tileHeaderLen;
  for (const q of sections) {
    const { slot } = sp.sectionInTile(q);
    const body = Buffer.from(`区段 ${sectionKey(q)} 的字节`.repeat(1 + ((q.i + q.j + q.L) & 3)));
    index[2 * slot] = off;
    index[2 * slot + 1] = body.length;
    bodies.push(body);
    off += body.length;
  }
  fs.writeFileSync(path.join(dir, sp.tileFileName(ti, tj)), Buffer.concat([sp.encodeTileHeader(ti, tj, index), ...bodies]));
};

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), '裁级-'));
// 块 (0,0)：L0 两块、L1、L2 各一块、L3～L6 各一块；块 (-1,0)：只有 L6 和一块 L0
const fullSections = [
  { L: 0, i: 3, j: 5 },
  { L: 0, i: 40, j: 2 },
  { L: 1, i: 1, j: 2 },
  { L: 2, i: 0, j: 1 },
  { L: 3, i: 0, j: 0 },
  { L: 4, i: 0, j: 0 },
  { L: 5, i: 0, j: 0 },
  { L: 6, i: 0, j: 0 },
];
const otherTile = [
  { L: 0, i: -1, j: 0 },
  { L: 6, i: -1, j: 0 },
];
const makeFull = () => {
  const dir = tmp();
  writeTile(dir, 0, 0, fullSections);
  writeTile(dir, -1, 0, otherTile);
  fs.writeFileSync(path.join(dir, '包.json'), JSON.stringify({ version: sp.formatVersion, dimension: '主世界', origin: [0, 0, 0], state: [], biome: [], coarseHeight: { cell: 64, x0: 0, y0: 0, nx: 0, ny: 0, height: '' }, splittable: [null, { i0: 0, j0: 0, ni: 1, nj: 1, bits: 'AQ==' }] }));
  fs.writeFileSync(path.join(dir, '模型.bin'), Buffer.from([1, 2, 3]));
  return dir;
};
const record = { pack: '测试包', record: { version: 'abc123abc123', source: '测试', license: 'CC0-1.0', visibility: '发布', fileCount: 4, size: 1, manifestSha256: '0' } };

describe('裁级', () => {
  it('留表：用到的区段连同各级祖先，L3 以上整包全留，只留包里有的', async () => {
    const present = await packSections(makeFull());
    expect(present.size).toBe(fullSections.length + otherTile.length);
    // L0 (3,5) 的祖先：L1 (1,2)、L2 (0,1)、L3～L6 (0,0)；负的区段号也按向下取整算祖先
    const t = (await keepTable(['0|3|5'], present)).map(sectionKey);
    expect(t).toEqual(['0|3|5', '1|1|2', '2|0|1', '3|0|0', '4|0|0', '5|0|0', '6|-1|0', '6|0|0']);
    expect((await keepTable(['0|-1|0'], present)).map(sectionKey)).toContain('0|-1|0');
    // 包里没有的区段（覆盖记到了、粗高度图却说没地）不进留表
    expect((await keepTable(['0|7|7'], present)).map(sectionKey)).not.toContain('0|7|7');
  });

  it('裁出来的包逐段和完整包一样；改坏一个字节查得出', async () => {
    const full = makeFull();
    const present = await packSections(full);
    const table = await keepTable(['0|3|5'], present);
    const out = tmp();
    const keepSha = await writeTrimmed(full, record, table, out);
    expect(keepSha).toBe(sha256(keepTableText(table)));
    expect(fs.readFileSync(path.join(out, keepFileName), 'utf8')).toBe(keepTableText(table));
    expect(JSON.parse(fs.readFileSync(path.join(out, fullRecordFileName), 'utf8'))).toEqual(record);
    const info = JSON.parse(fs.readFileSync(path.join(out, '包.json'), 'utf8'));
    expect(info.trim).toMatchObject({ from: 'abc123abc123', keepSha256: keepSha });
    // 完整包自带的 splittable 原样留着，不按留表改（裁过的包挑区段要和完整包一样）
    expect(info.splittable).toEqual([null, { i0: 0, j0: 0, ni: 1, nj: 1, bits: 'AQ==' }]);
    expect(fs.readFileSync(path.join(out, '模型.bin'))).toEqual(Buffer.from([1, 2, 3]));
    // 没留的 L0 (40,2)、块 (-1,0) 的 L0 索引是 0；两个块文件都在
    expect([...(await packSections(out))].sort()).toEqual(table.map(sectionKey).sort());
    expect(fs.existsSync(path.join(out, sp.tileFileName(-1, 0)))).toBe(true);
    expect(await compareTrimmed(full, out)).toEqual({ checked: table.length, problems: [] });

    const tile = path.join(out, sp.tileFileName(0, 0));
    const b = fs.readFileSync(tile);
    b[b.length - 1] ^= 1;
    fs.writeFileSync(tile, b);
    expect((await compareTrimmed(full, out)).problems.some((p) => p.includes('字节和完整包不一样'))).toBe(true);
  });

  it('裁过的包不能再当完整包裁', async () => {
    const full = makeFull();
    const out = tmp();
    await writeTrimmed(full, record, await keepTable([], await packSections(full)), out);
    await expect(writeTrimmed(out, record, [], tmp())).rejects.toThrow('已经是裁过的包');
  });
});
