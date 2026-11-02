import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 照搬贴图 } from './材质包.ts';
import { 套材质包, 材质包锁路径, 读材质包选用, type 材质包选用, type 材质包锁, type 资产锁 } from './资产锁.ts';

const 条 = (c: string) => ({ sha256: c.repeat(64), 大小: 1, 库: 'store' as const, 后缀: '.png' });

describe('材质包覆盖层', () => {
  it('选用：环境变量顶掉作品的 材质包.toml，短名补 材质包/，「原版」关掉；没写或空数组 = 原版', () => {
    const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
    expect(读材质包选用(根, undefined)).toEqual({ 包: [], 来自: '无' });
    fs.writeFileSync(path.join(根, '材质包.toml'), '# 注释里的 "包" = ["x"] 不算\n"包" = []\n');
    expect(读材质包选用(根, undefined)).toEqual({ 包: [], 来自: '无' });
    fs.writeFileSync(path.join(根, '材质包.toml'), '"包" = [\n  "材质包/甲",\n  "乙",\n]\n');
    expect(读材质包选用(根, undefined)).toEqual({ 包: ['材质包/甲', '材质包/乙'], 来自: '作品' });
    expect(读材质包选用(根, '丙, 材质包/丁')).toEqual({ 包: ['材质包/丙', '材质包/丁'], 来自: '环境' });
    expect(读材质包选用(根, '原版')).toEqual({ 包: [], 来自: '无' });
  });

  it('不选就是原锁；选了按覆盖层锁盖上；包换了、锁没建、盖了没登记的 id 都报错', () => {
    const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
    const 锁: 资产锁 = { '贴图/甲': 条('a'), '贴图/乙': 条('b'), '材质包/某': 条('d') };
    expect(套材质包(锁, 根, { 包: [], 来自: '无' })).toBe(锁);
    const 选: 材质包选用 = { 包: ['材质包/某'], 来自: '作品' };
    expect(() => 套材质包(锁, 根, 选)).toThrow(/覆盖层锁 .* 不存在/);
    const 写 = (盖: 材质包锁) => fs.writeFileSync(材质包锁路径(根, 选), JSON.stringify(盖));
    写({ 包: [{ id: '材质包/某', sha256: 'd'.repeat(64) }], 覆盖: { '贴图/甲': { ...条('c'), 库: '私有' } } });
    expect(套材质包(锁, 根, 选)).toEqual({ ...锁, '贴图/甲': { ...条('c'), 库: '私有' } });
    写({ 包: [{ id: '材质包/某', sha256: 'e'.repeat(64) }], 覆盖: {} });
    expect(() => 套材质包(锁, 根, 选)).toThrow(/重跑 anim assets 材质包/);
    写({ 包: [{ id: '材质包/某', sha256: 'd'.repeat(64) }], 覆盖: { '贴图/丙': 条('c') } });
    expect(() => 套材质包(锁, 根, 选)).toThrow(/作品锁里没有的 id/);
  });

  it('extract.toml 的「导出模型」照搬产物：通配和单件都认出包内路径，别的步骤不算', () => {
    const 表 = `
[["取材"]]
"名称" = "甲"
"步骤" = [["导出模型", "{jar:client-1.20.1}", "src/甲", "a=assets/minecraft/textures/block/a.png", "b=assets/minecraft/textures/block/b.png"]]
["取材"."产物"]
"贴图/甲/*" = "src/甲/*.png"

[["取材"]]
"名称" = "乙"
"步骤" = [["导出模型", "{jar:client-1.20.1}", "src/乙", "sun=assets/minecraft/textures/environment/sun.png"], ["python", "x.py"]]
["取材"."产物"]
"贴图/环境/太阳" = "src/乙/sun.png"
"模型/乙" = "src/乙/乙.json"

[["取材"]]
"名称" = "丙"
"步骤" = [["导出模型", "{jar:client-1.20.1}", "src/丙/水面.png", "water_still=assets/minecraft/textures/block/water_still.png"]]
["取材"."产物"]
"贴图/丙/水面" = "src/丙/水面.png"
`;
    expect(Object.fromEntries(照搬贴图(表))).toEqual({
      '贴图/甲/a': 'assets/minecraft/textures/block/a.png',
      '贴图/甲/b': 'assets/minecraft/textures/block/b.png',
      '贴图/环境/太阳': 'assets/minecraft/textures/environment/sun.png',
      '贴图/丙/水面': 'assets/minecraft/textures/block/water_still.png',
    });
  });
});
