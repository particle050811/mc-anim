// 默克尔图的几条边界：环（强连通分量整体哈希）、略过的边（外壳到 清单.ts）、一次建图按组取 = 每组单独算。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codeRoot } from '../环境/路径.ts';
import { readAssetLock } from '../资产/资产锁.ts';
import { buildMerkleGraph, computeMerkle } from './默克尔.ts';

const relPath = (p: string) => path.relative(codeRoot(), p).split(path.sep).join('/');

let d: string;
beforeEach(() => {
  d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-默克尔-')));
});
afterEach(() => fs.rmSync(d, { recursive: true, force: true }));

const writeFile = (fileName: string, content: string | Buffer) => {
  const f = path.join(d, fileName);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
  return relPath(f);
};

describe('环', () => {
  it('互相 import 的两个模块哈希相同（按分量整体算），从哪个进都一样；改环里任何一个都变', async () => {
    const moduleA = writeFile('甲.ts', "import { 乙 } from './乙.ts'; export const 甲 = () => 乙() + 1;");
    const secondFile = writeFile('乙.ts', "import { 甲 } from './甲.ts'; export const 乙 = () => (甲 ? 2 : 0);");
    const thirdMod = writeFile('入.ts', "import { 甲 } from './甲.ts'; export default 甲;");
    const r = await computeMerkle([moduleA, secondFile, thirdMod]);
    expect(r.根[0]).toBe(r.根[1]);
    expect(r.根[2]).not.toBe(r.根[0]);
    expect((await computeMerkle([secondFile])).根[0]).toBe(r.根[0]);
    writeFile('乙.ts', "import { 甲 } from './甲.ts'; export const 乙 = () => (甲 ? 3 : 0);");
    const merkle = await computeMerkle([moduleA, secondFile, thirdMod]);
    expect(merkle.根[0]).not.toBe(r.根[0]);
    expect(merkle.根[2]).not.toBe(r.根[2]);
  });

  it('自己 import 自己也按环算，不死循环', async () => {
    const moduleA = writeFile('甲.ts', "import * as 我 from './甲.ts'; export const x = 1; export default 我;");
    const r = await computeMerkle([moduleA]);
    expect(r.根[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(r.明细.模块)).toEqual([moduleA]);
  });
});

describe('略过', () => {
  const skip = (importer: string, target: string) => path.basename(importer) === '注册.tsx' && path.basename(target) === '清单.ts';

  it('略过的边不进哈希、不进明细的模块；改清单不改根，改别处照样改', async () => {
    writeFile('清单.ts', "import 图 from 'asset:核对/冒烟色块'; export const 清单 = ['甲']; export const 图片 = 图;");
    writeFile('其他.ts', 'export const 其他 = 1;');
    const registrationFile = writeFile('注册.tsx', "import { 清单 } from './清单.ts'; import { 其他 } from './其他.ts'; export default [清单, 其他];");
    const r = await computeMerkle([registrationFile], { skip });
    expect(Object.keys(r.明细.模块).sort()).toEqual([relPath(path.join(d, '其他.ts')), registrationFile].sort());
    // 资产照 esbuild 单独打包读到的记（略过的边也读），缺字节按它判
    expect(r.明细.资产).toEqual({ '核对/冒烟色块': readAssetLock()['核对/冒烟色块']!.sha256 });
    writeFile('清单.ts', "export const 清单 = ['甲', '乙'];");
    expect((await computeMerkle([registrationFile], { skip })).根[0]).toBe(r.根[0]);
    writeFile('其他.ts', 'export const 其他 = 2;');
    expect((await computeMerkle([registrationFile], { skip })).根[0]).not.toBe(r.根[0]);
    // 不给略过就跟进去
    expect(Object.keys((await computeMerkle([registrationFile])).明细.模块)).toContain(relPath(path.join(d, '清单.ts')));
  });
});

describe('一次建图', () => {
  it('按组取的结果（根、明细、键的顺序）和每组单独算一样', async () => {
    writeFile('共用.ts', "import 图 from 'asset:核对/冒烟色块'; export const 共用 = 图;");
    writeFile('只甲.ts', "import 音 from 'asset:核对/冒烟音'; export const 只甲 = 音;");
    writeFile('图.png', Buffer.from([1, 2, 3]));
    writeFile('工人.ts', "import { 共用 } from './共用.ts'; export const 工 = 共用;");
    // 注释里的 new URL：规范化后没了（不进哈希），单独打包时仍当额外入口读到它的依赖
    writeFile('注释工人.ts', "import x from './图.png'; export default x;");
    const moduleA = writeFile('甲.tsx', "import { 共用 } from './共用.ts'; import { 只甲 } from './只甲.ts'; export const w = () => new Worker(new URL('./工人.ts', import.meta.url)); export default [共用, 只甲];");
    const second = writeFile('乙.tsx', "import { 共用 } from './共用.ts';\n// new URL('./注释工人.ts', import.meta.url)\nexport default 共用;");
    const nodeC = writeFile('丙.tsx', "import 图 from './图.png'; import { 只甲 } from './只甲.ts'; export default [图, 只甲];");
    const leafGroups = [[moduleA], [second], [nodeC], [moduleA, nodeC], [second, moduleA]];
    const merkleTree = await buildMerkleGraph(leafGroups.flat());
    for (const g of leafGroups) expect(JSON.stringify(merkleTree.取(g))).toBe(JSON.stringify(await computeMerkle(g)));
    expect(Object.keys(merkleTree.取([second]).明细.模块)).toContain(relPath(path.join(d, '图.png')));
    expect(Object.keys(merkleTree.取([second]).明细.资产)).toEqual(['核对/冒烟色块']);
    expect(Object.keys(merkleTree.取([moduleA]).明细.资产)).toEqual(['核对/冒烟色块', '核对/冒烟音']);
    expect(() => merkleTree.取([writeFile('不在图里.ts', 'export {}')])).toThrow(/不在建图时给的入口里/);
  });
});
