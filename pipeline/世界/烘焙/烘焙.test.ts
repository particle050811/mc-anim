// 烘焙端到端：小存档 → 套编辑 → 区段包，再用查询的两种来源（存档、包）对每列最高的方块，并核对同样的输入烘两次逐字节一样（版本 = 目录指纹靠这个）；旧格式转码回来也一样。
// 体素库要在 Node 里注册 asset: 钩子才载得进来，vitest 自己转 import 不认，所以起一个子进程跑；数据根里没有方块表字节（刚 clone）就跳过。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { 资产json表 } from '../../资产/node资产.ts';
import { 造世界 } from '../测试夹具.ts';

const 临时 = fs.mkdtempSync(path.join(os.tmpdir(), '世界-烘焙-'));
afterAll(() => fs.rmSync(临时, { recursive: true, force: true }));

const 有字节 = (() => {
  try {
    const t = 资产json表();
    return !!t['数据/场景/关键帧/方块表'] && !!t['数据/场景/关键帧/群系色'];
  } catch {
    return false;
  }
})();

const 模 = (相对: string) => JSON.stringify(pathToFileURL(path.join(import.meta.dirname, 相对)).href);

// 子进程里跑：烘两次（第二次换个输出目录），比目录指纹；套编辑后的存档和包逐列比最高的方块
const 脚本 = (世界: string, 输出: string) => `
import { 载入体素库 } from ${模('../体素库.ts')};
import { 烘焙 } from ${模('./烘焙.ts')};
import { 区域源 } from ${模('../区域源.ts')};
import { 解析编辑 } from ${模('../编辑/编辑文件.ts')};
import { 编辑套用器 } from ${模('../编辑/套用.ts')};
import { 目录指纹 } from ${模('../版本.ts')};
import { 块文件们, 块里的区段, 块号, 编格式1区段 } from ${模('./读区段.ts')};
import { 转码目录, 逐格比目录 } from ${模('./转码.ts')};
import { 包方块源, 存档方块源 } from ${模('../查询/源.ts')};
import fs from 'node:fs';
import path from 'node:path';
const 库 = await 载入体素库();
const 编辑 = 解析编辑('[["步"]]\\n"命令" = ["setblock 5 70 5 minecraft:glass", "fill 20 61 2 22 63 4 minecraft:oak_planks"]', '/x/测.编辑.toml', 库.知识, () => { throw new Error('没有结构'); });
const 区目录 = path.join(${JSON.stringify(世界)}, 'region');
const 源们 = () => {
  const 器 = new 编辑套用器(编辑, new 区域源(区目录, '1', null));
  return new 区域源(区目录, '1', null, (r) => 器.套(r));
};
const 版本们 = [];
for (const 名 of ['a', 'b']) {
  const 出 = path.join(${JSON.stringify(输出)}, 名);
  fs.mkdirSync(出, { recursive: true });
  const 源 = 源们();
  await 烘焙({ 区域们: [[0, 0]], 取区域: (rx, rz) => 源.区域(rx, rz), 维度: '主世界', 原点: [0, 64, 0], 输出: 出, 库 });
  版本们.push(目录指纹(出));
}
const 存 = new 存档方块源(源们(), '存档');
const 包 = new 包方块源(path.join(${JSON.stringify(输出)}, 'a'), 库, '包');
const 不同 = [];
let 比了 = 0;
for (let z = 0; z < 16; z++)
  for (let x = 0; x < 32; x++) {
    const a = 存.顶(x, z), b = 包.顶(x, z);
    比了++;
    if (a?.y !== b?.y || a?.状态 !== b?.状态) 不同.push([x, z, a, b]);
  }

// 把烘出来的包倒成格式 1（旧包的样子），转码回来要和直接烘的字节相同；改掉一格，逐格比要报出来
const 写旧包 = (源, 目标, 改一格) => {
  fs.mkdirSync(目标, { recursive: true });
  for (const 名 of 块文件们(源)) {
    const 索引 = new Uint32Array(2 * 库.区段包.tileEntryCount), 段们 = [];
    let off = 库.区段包.tileHeaderLen, 改了 = false;
    for (const s of 块里的区段(库, path.join(源, 名))) {
      const d = s.取();
      if (改一格 && !改了 && d.palette.length > 2) {
        d.paletteIndex[0] = d.paletteIndex[0] === 1 ? 0 : 1;
        改了 = true;
      }
      const gz = 编格式1区段(d);
      索引[2 * s.slot] = off;
      索引[2 * s.slot + 1] = gz.length;
      off += gz.length;
      段们.push(gz);
    }
    const [ti, tj] = 块号(名);
    const 头 = 库.区段包.encodeTileHeader(ti, tj, 索引);
    new DataView(头.buffer).setUint32(4, 1, true);
    fs.writeFileSync(path.join(目标, 名), Buffer.concat([头, ...段们]));
  }
  fs.writeFileSync(path.join(目标, '包.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(源, '包.json'), 'utf8')), 版本: 1 }));
  fs.copyFileSync(path.join(源, '缺失.tsv'), path.join(目标, '缺失.tsv'));
};
const 根 = ${JSON.stringify(输出)};
写旧包(path.join(根, 'a'), path.join(根, '旧'), false);
fs.mkdirSync(path.join(根, '转'));
await 转码目录(path.join(根, '旧'), path.join(根, '转'), 1);
const 转版本 = 目录指纹(path.join(根, '转'));
fs.mkdirSync(path.join(根, '重转'));
await 转码目录(path.join(根, '旧'), path.join(根, '重转'), 2);
const 重转版本 = 目录指纹(path.join(根, '重转'));
const 模型大小 = fs.statSync(path.join(根, 'a', '模型.bin')).size;
const 逐格 = await 逐格比目录(path.join(根, '旧'), path.join(根, '转'), 1);
写旧包(path.join(根, 'a'), path.join(根, '坏'), true);
const 比坏 = await 逐格比目录(path.join(根, '坏'), path.join(根, '转'), 1).then(() => '没报', (e) => e.message);
console.log(JSON.stringify({ 版本们, 比了, 不同: 不同.slice(0, 5), 玻璃: 包.顶(5, 5), 木板: 包.顶(21, 3), 空: 包.列(40, 3), 转版本, 重转版本, 模型大小, 逐格, 比坏 }));
`;

describe.skipIf(!有字节)('烘焙（端到端，要数据根里的方块表字节）', () => {
  it('套编辑烘出的包和存档逐列对得上，同样输入烘两次一样', () => {
    const 世界 = path.join(临时, '世界');
    // 两个区块（x 0～31，z 0～15）：y < 60 石头、60 草方块；(3, 61, 5) 一根原木
    造世界(世界, 1n, [
      [0, 0, (x, y, z) => (x === 3 && z === 5 && y === 61 ? 'minecraft:oak_log[axis=y]' : y < 60 ? 'minecraft:stone' : y === 60 ? 'minecraft:grass_block[snowy=false]' : 'minecraft:air')],
      [1, 0, (_x, y) => (y < 60 ? 'minecraft:stone' : y === 60 ? 'minecraft:grass_block[snowy=false]' : 'minecraft:air')],
    ]);
    // 写成文件跑：转码起 Worker，Worker 继承 execArgv，--input-type 它不认
    const 脚本文件 = path.join(临时, '跑.mjs');
    fs.writeFileSync(脚本文件, 脚本(世界, path.join(临时, '包')));
    const r = spawnSync(process.execPath, [脚本文件], { encoding: 'utf8', cwd: path.join(import.meta.dirname, '..', '..', '..') });
    expect(r.status, r.stderr).toBe(0);
    const o = JSON.parse(r.stdout.trim().split('\n').at(-1)!) as { 版本们: string[]; 比了: number; 不同: unknown[]; 玻璃: { y: number; 状态: string } | null; 木板: { y: number; 状态: string } | null; 空: unknown; 转版本: string; 重转版本: string; 模型大小: number; 逐格: { 区段: number; 格: number }; 比坏: string };
    expect(o.版本们[0]).toMatch(/^[0-9a-f]{12}$/);
    expect(o.版本们[1]).toBe(o.版本们[0]);
    expect(o.比了).toBe(512);
    expect(o.不同).toEqual([]);
    expect(o.玻璃).toMatchObject({ y: 70, 状态: 'minecraft:glass' });
    expect(o.木板).toMatchObject({ y: 63, 状态: 'minecraft:oak_planks' });
    expect(o.空).toBeNull(); // 区块 (2, 0) 没生成
    expect(o.转版本).toBe(o.版本们[0]); // anim world 转码 和直接烘的字节相同
    expect(o.重转版本).toBe(o.转版本);
    expect(o.模型大小).toBe(16); // 极小包比较了含表的总成本，中性表更小
    expect(o.逐格.区段).toBeGreaterThan(0);
    expect(o.逐格.格).toBeGreaterThan(0);
    expect(o.比坏).toMatch(/格不一样/);
  });
});

// 有顶的维度（下界）：同一个存档不开、开 全高 各烘一次，逐列看存下了哪几段
const 全高脚本 = (世界: string, 输出: string) => `
import { 载入体素库 } from ${模('../体素库.ts')};
import { 烘焙 } from ${模('./烘焙.ts')};
import { 区域源 } from ${模('../区域源.ts')};
import { 目录指纹 } from ${模('../版本.ts')};
import { 包方块源 } from ${模('../查询/源.ts')};
import fs from 'node:fs';
import path from 'node:path';
const 库 = await 载入体素库();
const 区目录 = path.join(${JSON.stringify(世界)}, 'region');
const 出 = {};
for (const [名, 全高] of [['露天', undefined], ['露天2', false], ['全高', true], ['全高2', true]]) {
  const dir = path.join(${JSON.stringify(输出)}, 名);
  fs.mkdirSync(dir, { recursive: true });
  const 源 = new 区域源(区目录, '1', null);
  await 烘焙({ 区域们: [[0, 0]], 取区域: (rx, rz) => 源.区域(rx, rz), 维度: '下界', 原点: [0, 0, 0], 全高, 输出: dir, 库 });
  const 包 = new 包方块源(dir, 库, 名);
  出[名] = { 版本: 目录指纹(dir), 海: 包.列(5, 5), 洞: 包.列(20, 5) };
}
console.log(JSON.stringify(出));
`;

describe.skipIf(!有字节)('烘焙 全高（有顶的维度）', () => {
  it('不开只存到基岩顶，开了熔岩海、洞腔、岩顶都在；不给和给 false 逐字节一样', () => {
    const 世界 = path.join(临时, '下界');
    // 两个区块，y 0～127：顶上 y 120～127 基岩，底下 y 0～9 下界岩。区块 0 是熔岩海（y 10～31 熔岩，往上到岩顶是空的）；
    // 区块 1 全是下界岩，中间 y 40～59 一个封闭的洞
    造世界(
      世界,
      1n,
      [
        [0, 0, (_x, y) => (y >= 120 ? 'minecraft:bedrock' : y < 10 ? 'minecraft:netherrack' : y < 32 ? 'minecraft:lava[level=0]' : 'minecraft:air')],
        [1, 0, (_x, y) => (y >= 120 ? 'minecraft:bedrock' : y >= 40 && y < 60 ? 'minecraft:air' : 'minecraft:netherrack')],
      ],
      { y底: 0, 段数: 8, 群系: 'minecraft:nether_wastes' },
    );
    const 脚本文件 = path.join(临时, '跑全高.mjs');
    fs.writeFileSync(脚本文件, 全高脚本(世界, path.join(临时, '下界包')));
    const r = spawnSync(process.execPath, [脚本文件], { encoding: 'utf8', cwd: path.join(import.meta.dirname, '..', '..', '..') });
    expect(r.status, r.stderr).toBe(0);
    type 列 = { y底: number; y顶: number; 段: { 底: number; 顶: number; 状态: string | null }[] } | null;
    const o = JSON.parse(r.stdout.trim().split('\n').at(-1)!) as Record<string, { 版本: string; 海: 列; 洞: 列 }>;
    expect(o.露天2!.版本).toBe(o.露天!.版本);
    expect(o.全高2!.版本).toBe(o.全高!.版本);
    expect(o.全高!.版本).not.toBe(o.露天!.版本);
    // 不开：地表 = 基岩顶（y 128），只留它下面 4 格
    expect(o.露天!.海!.y底).toBe(124);
    expect(o.露天!.海!.段.some((s) => s.状态?.startsWith('minecraft:lava'))).toBe(false);
    // 开：整个区段从最低的空当（熔岩底 y 10）往下 4 格起存；熔岩、空腔、基岩顶都在
    const 段 = (c: 列) => c!.段.map((s) => [s.状态, s.底, s.顶]);
    expect(o.全高!.海!.y底).toBe(6);
    expect(段(o.全高!.海)).toEqual([
      ['minecraft:bedrock', 120, 127],
      ['minecraft:air', 32, 119],
      ['minecraft:lava[level=0]', 10, 31],
      ['minecraft:netherrack', 6, 9],
    ]);
    expect(段(o.全高!.洞)).toEqual([
      ['minecraft:bedrock', 120, 127],
      ['minecraft:netherrack', 60, 119],
      ['minecraft:air', 40, 59],
      ['minecraft:netherrack', 6, 39],
    ]);
  });
});
