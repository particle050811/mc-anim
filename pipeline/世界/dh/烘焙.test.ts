// 从 DH 库烘包（烘焙.ts）端到端：小库 → 区段包。核对各级写了哪些区段、能细分的位图、第 0 级逐列最高的方块、并过的雪层不把区段撑高、同样输入烘两次逐字节一样。
// 体素库要在 Node 里注册 asset: 钩子，所以起子进程跑（同 ../烘焙/烘焙.test.ts）；数据根里没有方块表字节就跳过。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { assetJsonTable } from '../../资产/node资产.ts';
import { makeDhDb, type DhTestColumn } from './测试夹具.ts';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '世界-dh烘焙-'));
afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));

const hasBytes = (() => {
  try {
    const t = assetJsonTable();
    return !!t['数据/场景/关键帧/方块表'] && !!t['数据/场景/关键帧/群系色'];
  } catch {
    return false;
  }
})();

const fileUrl = (relPath: string) => JSON.stringify(pathToFileURL(path.join(import.meta.dirname, relPath)).href);

const P = 'minecraft:plains_DH-BSW_';
const air = `${P}AIR`, stone = `${P}minecraft:stone`, grass = `${P}minecraft:grass_block_STATE_{snowy:false}`, snowLayer = `${P}minecraft:snow_STATE_{layers:1}`;
// 第 0 级那一个区段（游戏 x、z 0～63）的地表：y = 70 + (x + 2z) % 5
const surfaceY = (x: number, z: number) => 70 + ((x + 2 * z) % 5);
const isEdge = (x: number, z: number) => x === 0 || z === 0 || x === 63 || z === 63;
// 内圈 x < 32：DH 并过的样子，雪层从地表一直连到 y 54（跨两行）；别的列草方块，四条边草方块上面一格雪层
const groundRow = (x: number, z: number): DhTestColumn => {
  const top = surfaceY(x, z);
  if (!isEdge(x, z) && x < 32) return [[air, 127 - top], [snowLayer, top - 63]];
  if (isEdge(x, z)) return [[air, 127 - top], [snowLayer, 1], [grass, 1], [stone, top - 65]];
  return [[air, 127 - top], [grass, 1], [stone, top - 64]];
};

// 子进程里跑：烘两次比目录指纹，再从包里读
const makeScript = (dbFile: string, outDir: string) => `
import { loadVoxelLib } from ${fileUrl('../体素库.ts')};
import { bakeDh } from ${fileUrl('./烘焙.ts')};
import { openDhDb } from ${fileUrl('./读库.ts')};
import { dirFingerprint } from ${fileUrl('../版本.ts')};
import { walkSections } from ${fileUrl('../烘焙/读区段.ts')};
import { PackBlockSource } from ${fileUrl('../查询/源.ts')};
import fs from 'node:fs';
import path from 'node:path';
const lib = await loadVoxelLib();
const versions = [];
let counts;
for (const name of ['a', 'b']) {
  const out = path.join(${JSON.stringify(outDir)}, name);
  fs.mkdirSync(out, { recursive: true });
  const db = openDhDb(${JSON.stringify(dbFile)});
  const r = await bakeDh({ db, dimension: '主世界', origin: [0, 64, 0], extent: [0, 0, 4096, 4096], yRange: [-64, 255], output: out, lib, visible: { fillBlock: 'minecraft:stone', faithful: [] } });
  db.close();
  counts = r.sectionCounts;
  versions.push(dirFingerprint(out));
}
const dir = path.join(${JSON.stringify(outDir)}, 'a');
const pack = new PackBlockSource(dir, lib, '包');
const tops = [];
for (let z = 0; z < 64; z++) for (let x = 0; x < 64; x++) { const t = pack.topBlockAt(x, z); tops.push(t ? [t.y, t.state] : null); }
const sections = [...walkSections(lib, dir)].map((s) => { const d = s.取(); return [d.L, d.i, d.j, d.kBottom, d.nz]; });
const canSplit = lib.sectionPack.decodeSplittable(pack.packageInfo);
// 各级里 (i, j) 能不能分：含那一个第 0 级区段的那条链上的、和它旁边的
const chain = [];
for (let L = 1; L <= 6; L++) chain.push([canSplit(L, 0, -1), canSplit(L, 1, -1), canSplit(L, 0, -2)]);
console.log(JSON.stringify({ versions, counts, tops, sections, chain, far: pack.topBlockAt(200, 200), sibling: pack.topBlockAt(100, 100) }));
`;

describe.skipIf(!hasBytes)('从 DH 库烘包（端到端，要数据根里的方块表字节）', () => {
  it('各级只写有更细数据的那一支，第 0 级和库逐列对得上，雪层高段不撑高区段', () => {
    const dbFile = path.join(tempDir, 'DistantHorizons.sqlite');
    makeDhDb(dbFile, [
      // 第 0 级只有 (0, 0) 一个区段：y 128～191 空气、64～127 地面那一行、0～63 接着的雪层和石头
      { level: 0, posX: 0, posY: 2, posZ: 0, column: (_x, _z, _y0, span) => [[air, span]] },
      { level: 0, posX: 0, posY: 1, posZ: 0, column: groundRow },
      { level: 0, posX: 0, posY: 0, posZ: 0, column: (x, z, _y0, span) => (!isEdge(x, z) && x < 32 ? [[snowLayer, 10], [stone, span - 10]] : [[stone, span]]) },
      // 第 6 级铺满这一块（64 米一列，一行 2048 格）：草方块顶在 y 100
      { level: 6, posX: 0, posY: 0, posZ: 0, column: (_x, _z, _y0, span) => [[air, span - 101], [grass, 1], [stone, 100]] },
    ]);
    const scriptFile = path.join(tempDir, '跑.mjs');
    fs.writeFileSync(scriptFile, makeScript(dbFile, path.join(tempDir, '包')));
    const r = spawnSync(process.execPath, [scriptFile], { encoding: 'utf8', cwd: path.join(import.meta.dirname, '..', '..', '..') });
    expect(r.status, r.stderr).toBe(0);
    const o = JSON.parse(r.stdout.trim().split('\n').at(-1)!) as { versions: string[]; counts: number[]; tops: ([number, string] | null)[]; sections: [number, number, number, number, number][]; chain: boolean[][]; far: unknown; sibling: { y: number; state: string } | null };
    expect(o.versions[0]).toMatch(/^[0-9a-f]{12}$/);
    expect(o.versions[1]).toBe(o.versions[0]);
    // 第 6 级 1 个；往下每级只有含那个第 0 级区段的父区段分成的四块
    expect(o.counts).toEqual([4, 4, 4, 4, 4, 4, 1]);
    for (let L = 0; L <= 5; L++) expect(o.sections.filter((s) => s[0] === L).map((s) => `${s[1]},${s[2]}`).sort()).toEqual(['0,-1', '0,-2', '1,-1', '1,-2']);
    // 能细分的：每级只有那条链上的 (0, −1)
    expect(o.chain).toEqual(Array.from({ length: 6 }, () => [true, false, false]));
    // 第 0 级 DH 原生的那个区段：逐列最高的方块和库一样（并过的雪层最上一格还是雪层）
    for (let z = 0; z < 64; z++)
      for (let x = 0; x < 64; x++) {
        const top = surfaceY(x, z);
        const want = isEdge(x, z) ? [top, 'minecraft:snow[layers=1]'] : x < 32 ? [top, 'minecraft:snow[layers=1]'] : [top, 'minecraft:grass_block[snowy=false]'];
        expect(o.tops[z * 64 + x], `(${x}, ${z})`).toEqual(want);
      }
    // 雪层连了 16～20 格、下面是并进来的：最上一格以下换成雪块，区段的底照旧是最低的地表（场景 z 6）往下 4 格，不被拉到雪层那一段的底（场景 z −10）以下。
    // 顶到 63 是四周那一圈：旁边的区段是第 6 级放大出来的，地表在那一格（64 米）的顶上
    const native = o.sections.find((s) => s[0] === 0 && s[1] === 0 && s[2] === -1)!;
    expect(native.slice(3)).toEqual([2, 62]);
    // 兄弟区段库里没有第 0 级：拿上一级放大出来的（第 6 级的草方块，量化到 64 米一格），有方块；第 0 级没写到的地方没有
    expect(o.sibling?.state).toBe('minecraft:grass_block[snowy=false]');
    expect(o.far).toBeNull();
  });
});
