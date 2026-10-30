// 烘焙端到端：小存档 → 套编辑 → 区段包，再用查询的两种来源（存档、包）对每列最高的方块，并核对同样的输入烘两次逐字节一样（版本 = 目录指纹靠这个）。
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
console.log(JSON.stringify({ 版本们, 比了, 不同: 不同.slice(0, 5), 玻璃: 包.顶(5, 5), 木板: 包.顶(21, 3), 空: 包.列(40, 3) }));
`;

describe.skipIf(!有字节)('烘焙（端到端，要数据根里的方块表字节）', () => {
  it('套编辑烘出的包和存档逐列对得上，同样输入烘两次一样', () => {
    const 世界 = path.join(临时, '世界');
    // 两个区块（x 0～31，z 0～15）：y < 60 石头、60 草方块；(3, 61, 5) 一根原木
    造世界(世界, 1n, [
      [0, 0, (x, y, z) => (x === 3 && z === 5 && y === 61 ? 'minecraft:oak_log[axis=y]' : y < 60 ? 'minecraft:stone' : y === 60 ? 'minecraft:grass_block[snowy=false]' : 'minecraft:air')],
      [1, 0, (_x, y) => (y < 60 ? 'minecraft:stone' : y === 60 ? 'minecraft:grass_block[snowy=false]' : 'minecraft:air')],
    ]);
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', 脚本(世界, path.join(临时, '包'))], { encoding: 'utf8', cwd: path.join(import.meta.dirname, '..', '..', '..') });
    expect(r.status, r.stderr).toBe(0);
    const o = JSON.parse(r.stdout.trim().split('\n').at(-1)!) as { 版本们: string[]; 比了: number; 不同: unknown[]; 玻璃: { y: number; 状态: string } | null; 木板: { y: number; 状态: string } | null; 空: unknown };
    expect(o.版本们[0]).toMatch(/^[0-9a-f]{12}$/);
    expect(o.版本们[1]).toBe(o.版本们[0]);
    expect(o.比了).toBe(512);
    expect(o.不同).toEqual([]);
    expect(o.玻璃).toMatchObject({ y: 70, 状态: 'minecraft:glass' });
    expect(o.木板).toMatchObject({ y: 63, 状态: 'minecraft:oak_planks' });
    expect(o.空).toBeNull(); // 区块 (2, 0) 没生成
  });
});
