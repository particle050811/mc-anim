// 默克尔图的几条边界：环（强连通分量整体哈希）、略过的边（外壳到 清单.ts）、一次建图按组取 = 每组单独算。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { 代码根 } from '../环境/路径.ts';
import { 读资产锁 } from '../资产/资产锁.ts';
import { 建默克尔图, 算默克尔 } from './默克尔.ts';

const 相对 = (p: string) => path.relative(代码根(), p).split(path.sep).join('/');

let d: string;
beforeEach(() => {
  d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-默克尔-')));
});
afterEach(() => fs.rmSync(d, { recursive: true, force: true }));

const 写 = (名: string, 内容: string | Buffer) => {
  const f = path.join(d, 名);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, 内容);
  return 相对(f);
};

describe('环', () => {
  it('互相 import 的两个模块哈希相同（按分量整体算），从哪个进都一样；改环里任何一个都变', async () => {
    const 甲 = 写('甲.ts', "import { 乙 } from './乙.ts'; export const 甲 = () => 乙() + 1;");
    const 乙 = 写('乙.ts', "import { 甲 } from './甲.ts'; export const 乙 = () => (甲 ? 2 : 0);");
    const 入 = 写('入.ts', "import { 甲 } from './甲.ts'; export default 甲;");
    const r = await 算默克尔([甲, 乙, 入]);
    expect(r.根[0]).toBe(r.根[1]);
    expect(r.根[2]).not.toBe(r.根[0]);
    expect((await 算默克尔([乙])).根[0]).toBe(r.根[0]);
    写('乙.ts', "import { 甲 } from './甲.ts'; export const 乙 = () => (甲 ? 3 : 0);");
    const 改 = await 算默克尔([甲, 乙, 入]);
    expect(改.根[0]).not.toBe(r.根[0]);
    expect(改.根[2]).not.toBe(r.根[2]);
  });

  it('自己 import 自己也按环算，不死循环', async () => {
    const 甲 = 写('甲.ts', "import * as 我 from './甲.ts'; export const x = 1; export default 我;");
    const r = await 算默克尔([甲]);
    expect(r.根[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(r.明细.模块)).toEqual([甲]);
  });
});

describe('略过', () => {
  const 略过 = (importer: string, 目标: string) => path.basename(importer) === '注册.tsx' && path.basename(目标) === '清单.ts';

  it('略过的边不进哈希、不进明细的模块；改清单不改根，改别处照样改', async () => {
    写('清单.ts', "import 图 from 'asset:核对/冒烟色块'; export const 清单 = ['甲']; export const 图片 = 图;");
    写('其他.ts', 'export const 其他 = 1;');
    const 注册 = 写('注册.tsx', "import { 清单 } from './清单.ts'; import { 其他 } from './其他.ts'; export default [清单, 其他];");
    const r = await 算默克尔([注册], { 略过 });
    expect(Object.keys(r.明细.模块).sort()).toEqual([相对(path.join(d, '其他.ts')), 注册].sort());
    // 资产照 esbuild 单独打包读到的记（略过的边也读），缺字节按它判
    expect(r.明细.资产).toEqual({ '核对/冒烟色块': 读资产锁()['核对/冒烟色块']!.sha256 });
    写('清单.ts', "export const 清单 = ['甲', '乙'];");
    expect((await 算默克尔([注册], { 略过 })).根[0]).toBe(r.根[0]);
    写('其他.ts', 'export const 其他 = 2;');
    expect((await 算默克尔([注册], { 略过 })).根[0]).not.toBe(r.根[0]);
    // 不给略过就跟进去
    expect(Object.keys((await 算默克尔([注册])).明细.模块)).toContain(相对(path.join(d, '清单.ts')));
  });
});

describe('一次建图', () => {
  it('按组取的结果（根、明细、键的顺序）和每组单独算一样', async () => {
    写('共用.ts', "import 图 from 'asset:核对/冒烟色块'; export const 共用 = 图;");
    写('只甲.ts', "import 音 from 'asset:核对/冒烟音'; export const 只甲 = 音;");
    写('图.png', Buffer.from([1, 2, 3]));
    写('工人.ts', "import { 共用 } from './共用.ts'; export const 工 = 共用;");
    // 注释里的 new URL：规范化后没了（不进哈希），单独打包时仍当额外入口读到它的依赖
    写('注释工人.ts', "import x from './图.png'; export default x;");
    const 甲 = 写('甲.tsx', "import { 共用 } from './共用.ts'; import { 只甲 } from './只甲.ts'; export const w = () => new Worker(new URL('./工人.ts', import.meta.url)); export default [共用, 只甲];");
    const 乙 = 写('乙.tsx', "import { 共用 } from './共用.ts';\n// new URL('./注释工人.ts', import.meta.url)\nexport default 共用;");
    const 丙 = 写('丙.tsx', "import 图 from './图.png'; import { 只甲 } from './只甲.ts'; export default [图, 只甲];");
    const 组 = [[甲], [乙], [丙], [甲, 丙], [乙, 甲]];
    const 图 = await 建默克尔图(组.flat());
    for (const g of 组) expect(JSON.stringify(图.取(g))).toBe(JSON.stringify(await 算默克尔(g)));
    expect(Object.keys(图.取([乙]).明细.模块)).toContain(相对(path.join(d, '图.png')));
    expect(Object.keys(图.取([乙]).明细.资产)).toEqual(['核对/冒烟色块']);
    expect(Object.keys(图.取([甲]).明细.资产)).toEqual(['核对/冒烟色块', '核对/冒烟音']);
    expect(() => 图.取([写('不在图里.ts', 'export {}')])).toThrow(/不在建图时给的入口里/);
  });
});
