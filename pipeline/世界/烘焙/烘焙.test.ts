// 烘焙端到端：小存档 → 套编辑 → 区段包，再用查询的两种来源（存档、包）对每列最高的方块，并核对同样的输入烘两次逐字节一样（版本 = 目录指纹靠这个）；旧格式转码回来也一样，格式 4 换容器成格式 5 也一样。
// 可见变换：烘焙时做和烘完再 转码（格式 4 → 4）做逐字节一样，封死的腔填实、埋住的换石头，保真范围碰到的区段原样。
// 体素库要在 Node 里注册 asset: 钩子才载得进来，vitest 自己转 import 不认，所以起一个子进程跑；数据根里没有方块表字节（刚 clone）就跳过。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { assetJsonTable } from '../../资产/node资产.ts';
import { makeWorld } from '../测试夹具.ts';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), '世界-烘焙-'));
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

// 子进程里跑：烘两次（第二次换个输出目录），比目录指纹；套编辑后的存档和包逐列比最高的方块
const makeScript = (worldDir: string, outDir: string) => `
import { loadVoxelLib } from ${fileUrl('../体素库.ts')};
import { bake } from ${fileUrl('./烘焙.ts')};
import { RegionSource } from ${fileUrl('../区域源.ts')};
import { parseEdits } from ${fileUrl('../编辑/编辑文件.ts')};
import { EditApplier } from ${fileUrl('../编辑/套用.ts')};
import { dirFingerprint } from ${fileUrl('../版本.ts')};
import { blockFiles, sectionsInBlock, encodeFormat1Section } from ${fileUrl('./读区段.ts')};
import { toColumnMajor, fromColumnMajor } from ${fileUrl('./区段编码.ts')};
import { transcodeDir, compareDirPerCell, rewrapDir, compareRewrap } from ${fileUrl('./转码.ts')};
import { legacySlotOf, legacyEntryCount, legacyHeaderLen, encodeLegacyTileHeader } from ${fileUrl('./旧块头.ts')};
import { readPackDoc } from ${fileUrl('./包信息.ts')};
import { PackBlockSource, SaveBlockSource } from ${fileUrl('../查询/源.ts')};
import fs from 'node:fs';
import path from 'node:path';
const lib = await loadVoxelLib();
const 编辑 = parseEdits('[["step"]]\\n"command" = ["setblock 5 70 5 minecraft:glass", "fill 20 61 2 22 63 4 minecraft:oak_planks"]', '/x/测.编辑.toml', lib.knowledge, () => { throw new Error('没有结构'); });
const 区目录 = path.join(${JSON.stringify(worldDir)}, 'region');
const 源们 = () => {
  const 器 = new EditApplier(编辑, new RegionSource(区目录, '1', null));
  return new RegionSource(区目录, '1', null, (r) => 器.applyEdits(r));
};
const 版本们 = [];
for (const name of ['a', 'b']) {
  const 出 = path.join(${JSON.stringify(outDir)}, name);
  fs.mkdirSync(出, { recursive: true });
  const 源 = 源们();
  await bake({ regions: [[0, 0]], getRegion: (rx, rz) => 源.region(rx, rz), dimension: '主世界', origin: [0, 64, 0], output: 出, lib });
  版本们.push(dirFingerprint(出));
}
const 存 = new SaveBlockSource(源们(), '存档');
const pack = new PackBlockSource(path.join(${JSON.stringify(outDir)}, 'a'), lib, '包');
const 不同 = [];
let 比了 = 0;
for (let z = 0; z < 16; z++)
  for (let x = 0; x < 32; x++) {
    const a = 存.topBlockAt(x, z), b = pack.topBlockAt(x, z);
    比了++;
    if (a?.y !== b?.y || a?.state !== b?.state) 不同.push([x, z, a, b]);
  }

// 把烘出来的包倒成格式 1（旧包的样子：一个 66 列的区段拆成 2×2 个 34 列的，核心全是空气的不要，按 2048 米一块放），
// 转码回来要和直接烘的字节相同（这个小包每列都在一个旧区段的范围里，不用补填充）；改掉一格核心，逐格比要报出来
const 拆成旧 = (d) => {
  const cm = toColumnMajor(d), out = [];
  for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) {
    const q = new Uint16Array(34 * 34 * d.nz);
    let 有 = false;
    for (let y = 0; y < 34; y++) for (let x = 0; x < 34; x++) {
      const src = ((y + 32 * b) * 66 + x + 32 * a) * d.nz, dst = (y * 34 + x) * d.nz;
      for (let k = 0; k < d.nz; k++) { q[dst + k] = cm[src + k]; if (cm[src + k] && x > 0 && y > 0 && x < 33 && y < 33) 有 = true; }
    }
    if (有) out.push(fromColumnMajor({ L: d.L, i: 2 * d.i + a, j: 2 * d.j + b }, d.kBottom, d.nz, q, d.palette, 34 * 34));
  }
  return out;
};
const 写旧包 = (源, target, 改一格) => {
  fs.mkdirSync(target, { recursive: true });
  const 块们 = new Map();
  let 改了 = false;
  for (const name of blockFiles(源)) for (const s of sectionsInBlock(lib, path.join(源, name))) for (const d of 拆成旧(s.取())) {
    if (改一格 && !改了 && d.palette.length > 2) {
      let r = 0;
      for (let c = 0; c < 35; c++) r += d.runCounts[c];
      d.paletteIndex[r] = d.paletteIndex[r] === 1 ? 0 : 1;
      改了 = true;
    }
    const at = legacySlotOf(d), key = at.ti + '.' + at.tj;
    if (!块们.has(key)) 块们.set(key, { ti: at.ti, tj: at.tj, 段们: [] });
    块们.get(key).段们.push({ slot: at.slot, gz: encodeFormat1Section(d) });
  }
  for (const { ti, tj, 段们 } of 块们.values()) 写旧块(target, ti, tj, 1, 段们);
  写旧包信息(源, target, 1);
  fs.copyFileSync(path.join(源, '缺失.tsv'), path.join(target, '缺失.tsv'));
};
// 旧块文件：定长头 + 各段按给的先后
const 写旧块 = (target, ti, tj, version, 段们) => {
  const index = new Uint32Array(2 * legacyEntryCount);
  let off = legacyHeaderLen;
  for (const { slot, gz } of 段们) { index[2 * slot] = off; index[2 * slot + 1] = gz.length; off += gz.length; }
  fs.writeFileSync(path.join(target, lib.sectionPack.tileFileName(ti, tj)), Buffer.concat([encodeLegacyTileHeader(ti, tj, version, index), ...段们.map((x) => x.gz)]));
};
// 旧 包.json：粗高度图、splittable 是 base64，没有 coarsestLevel、tileHeaderMax
const 写旧包信息 = (源, target, version) => {
  const doc = readPackDoc(lib, 源), b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
  const { height, ...coarse } = doc.maps.coarse;
  const splittable = doc.maps.splittable?.map((s) => (s ? { i0: s.i0, j0: s.j0, ni: s.ni, nj: s.nj, bits: b64(s.bits) } : null));
  fs.writeFileSync(path.join(target, '包.json'), JSON.stringify({ version, dimension: doc.dimension, origin: doc.origin, state: doc.state, biome: doc.biome, coarseHeight: { ...coarse, height: b64(height) }, ...(splittable ? { splittable } : {}), ...doc.extra }));
};
// 格式 4：区段字节和格式 5 一样，只有块头、包.json 是旧的
const 写四包 = (源, target) => {
  fs.mkdirSync(target, { recursive: true });
  for (const name of blockFiles(源)) {
    const 段们 = [...sectionsInBlock(lib, path.join(源, name))].map((s) => ({ ...legacySlotOf(s.id), gz: s.bytes }));
    写旧块(target, 段们[0].ti, 段们[0].tj, 4, 段们);
  }
  写旧包信息(源, target, 4);
  for (const f of ['缺失.tsv', '模型.bin']) fs.copyFileSync(path.join(源, f), path.join(target, f));
};
const root = ${JSON.stringify(outDir)};
写旧包(path.join(root, 'a'), path.join(root, '旧'), false);
fs.mkdirSync(path.join(root, '转'));
await transcodeDir(path.join(root, '旧'), path.join(root, '转'), 1);
const 转版本 = dirFingerprint(path.join(root, '转'));
fs.mkdirSync(path.join(root, '重转'));
await transcodeDir(path.join(root, '旧'), path.join(root, '重转'), 2);
const 重转版本 = dirFingerprint(path.join(root, '重转'));
const 模型大小 = fs.statSync(path.join(root, 'a', '模型.bin')).size;
const 逐格 = await compareDirPerCell(path.join(root, '旧'), path.join(root, '转'), 1);
写旧包(path.join(root, 'a'), path.join(root, '坏'), true);
const 比坏 = await compareDirPerCell(path.join(root, '坏'), path.join(root, '转'), 1).then(() => '没报', (e) => e.message);
写四包(path.join(root, 'a'), path.join(root, '四'));
fs.mkdirSync(path.join(root, '换容器'));
await rewrapDir(path.join(root, '四'), path.join(root, '换容器'));
const 换容器版本 = dirFingerprint(path.join(root, '换容器'));
const 换容器核对 = await compareRewrap(path.join(root, '四'), path.join(root, '换容器'));
const 换坏块 = path.join(root, '换容器', blockFiles(path.join(root, '换容器'))[0]), 换坏 = fs.readFileSync(换坏块);
换坏[换坏.length - 1] ^= 1;
fs.writeFileSync(换坏块, 换坏);
const 换容器比坏 = await compareRewrap(path.join(root, '四'), path.join(root, '换容器')).then(() => '没报', (e) => e.message);
console.log(JSON.stringify({ versions: 版本们, compared: 比了, 不同: 不同.slice(0, 5), glassSample: pack.topBlockAt(5, 5), plankSample: pack.topBlockAt(21, 3), 空: pack.列(70, 3), convertedVersion: 转版本, reconvertedVersion: 重转版本, modelSize: 模型大小, perCellResult: 逐格, mismatchMessage: 比坏, rewrapVersion: 换容器版本, rewrapResult: 换容器核对, rewrapMismatch: 换容器比坏 }));
`;

describe.skipIf(!hasBytes)('烘焙（端到端，要数据根里的方块表字节）', () => {
  it('套编辑烘出的包和存档逐列对得上，同样输入烘两次一样', () => {
    const worldDir = path.join(tempDir, '世界');
    // 两个区块（x 0～31，z 0～15）：y < 60 石头、60 草方块；(3, 61, 5) 一根原木
    makeWorld(worldDir, 1n, [
      [0, 0, (x, y, z) => (x === 3 && z === 5 && y === 61 ? 'minecraft:oak_log[axis=y]' : y < 60 ? 'minecraft:stone' : y === 60 ? 'minecraft:grass_block[snowy=false]' : 'minecraft:air')],
      [1, 0, (_x, y) => (y < 60 ? 'minecraft:stone' : y === 60 ? 'minecraft:grass_block[snowy=false]' : 'minecraft:air')],
    ]);
    // 写成文件跑：转码起 Worker，Worker 继承 execArgv，--input-type 它不认
    const scriptFile = path.join(tempDir, '跑.mjs');
    fs.writeFileSync(scriptFile, makeScript(worldDir, path.join(tempDir, '包')));
    const r = spawnSync(process.execPath, [scriptFile], { encoding: 'utf8', cwd: path.join(import.meta.dirname, '..', '..', '..') });
    expect(r.status, r.stderr).toBe(0);
    const o = JSON.parse(r.stdout.trim().split('\n').at(-1)!) as { versions: string[]; compared: number; 不同: unknown[]; glassSample: { y: number; state: string } | null; plankSample: { y: number; state: string } | null; 空: unknown; convertedVersion: string; reconvertedVersion: string; modelSize: number; perCellResult: { sections: number; cell: number }; mismatchMessage: string; rewrapVersion: string; rewrapResult: { sections: number; bytes: number }; rewrapMismatch: string };
    expect(o.versions[0]).toMatch(/^[0-9a-f]{12}$/);
    expect(o.versions[1]).toBe(o.versions[0]);
    expect(o.compared).toBe(512);
    expect(o.不同).toEqual([]);
    expect(o.glassSample).toMatchObject({ y: 70, state: 'minecraft:glass' });
    expect(o.plankSample).toMatchObject({ y: 63, state: 'minecraft:oak_planks' });
    expect(o.空).toBeNull(); // x 64 起的区段不在包里（同一个区段里没生成的区块是整列空气，不是 null）
    expect(o.convertedVersion).toBe(o.versions[0]); // anim world transcode 和直接烘的字节相同
    expect(o.reconvertedVersion).toBe(o.convertedVersion);
    expect(o.modelSize).toBe(16); // 极小包比较了含表的总成本，中性表更小
    expect(o.perCellResult.sections).toBeGreaterThan(0);
    expect(o.perCellResult.cell).toBeGreaterThan(0);
    expect(o.mismatchMessage).toMatch(/格不一样/);
    // 格式 4 → 5 换容器：和直接烘的格式 5 逐字节一样，逐区段核对查得出改坏的字节
    expect(o.rewrapVersion).toBe(o.versions[0]);
    expect(o.rewrapResult.sections).toBeGreaterThan(0);
    expect(o.rewrapMismatch).not.toBe('没报');
  });
});

// 有顶的维度（下界）：同一个存档不开、开 全高 各烘一次，逐列看存下了哪几段
const fullHeightScript = (worldDir: string, outDir: string) => `
import { loadVoxelLib } from ${fileUrl('../体素库.ts')};
import { bake } from ${fileUrl('./烘焙.ts')};
import { RegionSource } from ${fileUrl('../区域源.ts')};
import { dirFingerprint } from ${fileUrl('../版本.ts')};
import { PackBlockSource } from ${fileUrl('../查询/源.ts')};
import fs from 'node:fs';
import path from 'node:path';
const lib = await loadVoxelLib();
const 区目录 = path.join(${JSON.stringify(worldDir)}, 'region');
const 出 = {};
for (const [name, 全高] of [['露天', undefined], ['露天2', false], ['全高', true], ['全高2', true]]) {
  const dir = path.join(${JSON.stringify(outDir)}, name);
  fs.mkdirSync(dir, { recursive: true });
  const 源 = new RegionSource(区目录, '1', null);
  await bake({ regions: [[0, 0]], getRegion: (rx, rz) => 源.region(rx, rz), dimension: '下界', origin: [0, 0, 0], fullHeight: 全高, output: dir, lib });
  const pack = new PackBlockSource(dir, lib, name);
  出[name] = { version: dirFingerprint(dir), 海: pack.列(5, 5), caveColumn: pack.列(20, 5) };
}
console.log(JSON.stringify(出));
`;

describe.skipIf(!hasBytes)('烘焙 全高（有顶的维度）', () => {
  it('不开只存到基岩顶，开了熔岩海、洞腔、岩顶都在；不给和给 false 逐字节一样', () => {
    const worldDir = path.join(tempDir, '下界');
    // 两个区块，y 0～127：顶上 y 120～127 基岩，底下 y 0～9 下界岩。区块 0 是熔岩海（y 10～31 熔岩，往上到岩顶是空的）；
    // 区块 1 全是下界岩，中间 y 40～59 一个封闭的洞
    makeWorld(
      worldDir,
      1n,
      [
        [0, 0, (_x, y) => (y >= 120 ? 'minecraft:bedrock' : y < 10 ? 'minecraft:netherrack' : y < 32 ? 'minecraft:lava[level=0]' : 'minecraft:air')],
        [1, 0, (_x, y) => (y >= 120 ? 'minecraft:bedrock' : y >= 40 && y < 60 ? 'minecraft:air' : 'minecraft:netherrack')],
      ],
      { yBottom: 0, 段数: 8, biome: 'minecraft:nether_wastes' },
    );
    const fullScriptFile = path.join(tempDir, '跑全高.mjs');
    fs.writeFileSync(fullScriptFile, fullHeightScript(worldDir, path.join(tempDir, '下界包')));
    const r = spawnSync(process.execPath, [fullScriptFile], { encoding: 'utf8', cwd: path.join(import.meta.dirname, '..', '..', '..') });
    expect(r.status, r.stderr).toBe(0);
    type Column = { yBottom: number; yTop: number; segment: { bottom: number; topY: number; state: string | null }[] } | null;
    const o = JSON.parse(r.stdout.trim().split('\n').at(-1)!) as Record<string, { version: string; 海: Column; caveColumn: Column }>;
    expect(o.露天2!.version).toBe(o.露天!.version);
    expect(o.全高2!.version).toBe(o.全高!.version);
    expect(o.全高!.version).not.toBe(o.露天!.version);
    // 不开：地表 = 基岩顶（y 128），只留它下面 4 格
    expect(o.露天!.海!.yBottom).toBe(124);
    expect(o.露天!.海!.segment.some((s) => s.state?.startsWith('minecraft:lava'))).toBe(false);
    // 开：整个区段从最低的空当（熔岩底 y 10）往下 4 格起存；熔岩、空腔、基岩顶都在
    const segTuples = (c: Column) => c!.segment.map((s) => [s.state, s.bottom, s.topY]);
    expect(o.全高!.海!.yBottom).toBe(6);
    expect(segTuples(o.全高!.海)).toEqual([
      ['minecraft:bedrock', 120, 127],
      ['minecraft:air', 32, 119],
      ['minecraft:lava[level=0]', 10, 31],
      ['minecraft:netherrack', 6, 9],
    ]);
    expect(segTuples(o.全高!.caveColumn)).toEqual([
      ['minecraft:bedrock', 120, 127],
      ['minecraft:netherrack', 60, 119],
      ['minecraft:air', 40, 59],
      ['minecraft:netherrack', 6, 39],
    ]);
  });
});

// 可见变换：不做、做、保真盒罩住 各烘一次，再把不做的那份 转码 做上，比目录指纹和几列
const visibleScript = (world: string, outDir: string) => `
import { loadVoxelLib } from ${fileUrl('../体素库.ts')};
import { bake } from ${fileUrl('./烘焙.ts')};
import { RegionSource } from ${fileUrl('../区域源.ts')};
import { dirFingerprint } from ${fileUrl('../版本.ts')};
import { transcodeDir, compareDirPerCell } from ${fileUrl('./转码.ts')};
import { PackBlockSource } from ${fileUrl('../查询/源.ts')};
import fs from 'node:fs';
import path from 'node:path';
const lib = await loadVoxelLib();
const 区目录 = path.join(${JSON.stringify(world)}, 'region'), root = ${JSON.stringify(outDir)};
const 远 = { fillBlock: 'minecraft:stone', faithful: [[1000, 1000, 1001, 1001]] }, 罩 = { fillBlock: 'minecraft:stone', faithful: [[9, 9, 9, 9]] };
const 出 = {};
for (const [name, visible] of [['原样', null], ['做', 远], ['罩住', 罩]]) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  const 源 = new RegionSource(区目录, '1', null);
  await bake({ regions: [[0, 0]], getRegion: (rx, rz) => 源.region(rx, rz), dimension: '主世界', origin: [0, 64, 0], output: dir, lib, visible: visible });
  const pack = new PackBlockSource(dir, lib, name);
  出[name] = { version: dirFingerprint(dir), cavity: pack.列(9, 9), ground: pack.列(20, 5), visible: JSON.parse(fs.readFileSync(path.join(dir, '包.json'), 'utf8')).visible ?? null };
}
fs.mkdirSync(path.join(root, '后做'));
const 变换 = (await transcodeDir(path.join(root, '原样'), path.join(root, '后做'), 2, undefined, 远)).transformCounts;
出.laterVersion = dirFingerprint(path.join(root, '后做'));
出.perCellResult = await compareDirPerCell(path.join(root, '原样'), path.join(root, '做'), 1, undefined, 远);
出.transformCounts = 变换;
出.settingMismatch = await compareDirPerCell(path.join(root, '原样'), path.join(root, '做'), 1, undefined, 罩).then(() => '没报', (e) => e.message);
console.log(JSON.stringify(出));
`;

describe.skipIf(!hasBytes)('烘焙 可见变换', () => {
  it('烘时做和烘完转码做一样；腔填实、埋住的换石头、地表不动；保真盒罩住的区段原样', () => {
    const worldDir = path.join(tempDir, '可见');
    // 两个区块（x 0～31，z 0～15）：y 60 草方块，往下泥土；x 8～10、z 8～10、y 57～58 一个封死的空腔（四面、顶上是泥土）；(3, 14) 一根石柱露出地面（状态表里要有石头）
    const cavity = (x: number, y: number, z: number) => x >= 8 && x <= 10 && z >= 8 && z <= 10 && y >= 57 && y <= 58;
    makeWorld(worldDir, 1n, [
      [0, 0, (x, y, z) => (cavity(x, y, z) ? 'minecraft:air' : x === 3 && z === 14 && y <= 62 ? 'minecraft:stone' : y < 60 ? 'minecraft:dirt' : y === 60 ? 'minecraft:grass_block[snowy=false]' : 'minecraft:air')],
      [1, 0, (_x, y) => (y < 60 ? 'minecraft:dirt' : y === 60 ? 'minecraft:grass_block[snowy=false]' : 'minecraft:air')],
    ]);
    const scriptFile = path.join(tempDir, '跑可见.mjs');
    fs.writeFileSync(scriptFile, visibleScript(worldDir, path.join(tempDir, '可见包')));
    const r = spawnSync(process.execPath, [scriptFile], { encoding: 'utf8', cwd: path.join(import.meta.dirname, '..', '..', '..') });
    expect(r.status, r.stderr).toBe(0);
    type Column = { segment: { bottom: number; topY: number; state: string | null }[] } | null;
    type Pack = { version: string; cavity: Column; ground: Column; visible: unknown };
    const o = JSON.parse(r.stdout.trim().split('\n').at(-1)!) as { 原样: Pack; 做: Pack; 罩住: Pack; laterVersion: string; perCellResult: Record<string, number>; transformCounts: Record<string, number>; settingMismatch: string };
    const segTuples = (c: Column) => c!.segment.filter((s) => s.state !== 'minecraft:air').map((s) => [s.state, s.bottom, s.topY]);
    expect(o.laterVersion).toBe(o.做.version); // 烘焙、转码同一条路
    expect(o.做.version).not.toBe(o.原样.version);
    expect(o.做.visible).toEqual({ fill: 'minecraft:stone', faithful: [[1000, 1000, 1001, 1001]] });
    expect(o.原样.visible).toBeNull();
    // 包只存到地表往下 3 格（y 57），腔贴着最下一层（再往下当实心）。原样：腔在；做了：腔填实，草下面埋住的泥土换石头，草不动
    const grass = ['minecraft:grass_block[snowy=false]', 60, 60];
    expect(segTuples(o.原样.cavity)).toEqual([grass, ['minecraft:dirt', 59, 59]]);
    expect(segTuples(o.原样.ground)).toEqual([grass, ['minecraft:dirt', 57, 59]]);
    expect(segTuples(o.做.cavity)).toEqual([grass, ['minecraft:stone', 57, 59]]);
    expect(segTuples(o.做.ground)).toEqual([grass, ['minecraft:stone', 57, 59]]);
    // 保真盒碰到这个区段，整块原样（各级都是）
    expect(segTuples(o.罩住.cavity)).toEqual(segTuples(o.原样.cavity));
    expect(segTuples(o.罩住.ground)).toEqual(segTuples(o.原样.ground));
    expect(o.transformCounts.filledCount).toBe(9 * 2);
    expect(o.transformCounts.buriedCount).toBeGreaterThan(0);
    expect(o.perCellResult.changedSectionCount).toBeGreaterThan(0);
    expect(o.perCellResult.meshCheckCount).toBe(o.perCellResult.changedSectionCount);
    expect(o.settingMismatch).toMatch(/可见/);
  });
});
