import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 放大上限, 照搬贴图 } from './材质包.ts';
import { 作品的材质包选用们, 材质包选用键, 套材质包, 当前材质包选用, 按材质包分组, 核对段材质包, 照材质包选用, 材质包锁路径, 读材质包选用, 读材质包表, type 材质包选用, type 材质包锁, type 资产锁 } from './资产锁.ts';

const 条 = (c: string) => ({ sha256: c.repeat(64), 大小: 1, 库: 'store' as const, 后缀: '.png' });

describe('材质包覆盖层', () => {
  it('选用：环境变量顶掉作品的 材质包.toml，短名补 材质包/，「原版」关掉；没写或空数组 = 原版', () => {
    const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
    expect(读材质包选用(根, undefined, undefined)).toEqual({ 包: [], 来自: '无' });
    fs.writeFileSync(path.join(根, '材质包.toml'), '# 注释里的 "包" = ["x"] 不算\n"包" = []\n');
    expect(读材质包选用(根, undefined, undefined)).toEqual({ 包: [], 来自: '无' });
    fs.writeFileSync(path.join(根, '材质包.toml'), '"包" = [\n  "材质包/甲",\n  "乙",\n]\n');
    expect(读材质包选用(根, undefined, undefined)).toEqual({ 包: ['材质包/甲', '材质包/乙'], 来自: '作品' });
    expect(读材质包选用(根, '丙, 材质包/丁', undefined)).toEqual({ 包: ['材质包/丙', '材质包/丁'], 来自: '环境' });
    expect(读材质包选用(根, '原版', undefined)).toEqual({ 包: [], 来自: '无' });
  });

  it('封顶：材质包.toml 的 "封顶"、环境变量 ANIM_PACKS_RES（顶掉作品的），只认 16 起的 2 的幂；没选包就没有封顶；试样锁名带 @封顶', () => {
    const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
    fs.writeFileSync(path.join(根, '材质包.toml'), '"包" = ["甲"]\n"封顶" = 16\n');
    expect(读材质包选用(根, undefined, undefined)).toEqual({ 包: ['材质包/甲'], 来自: '作品', 封顶: 16 });
    expect(读材质包选用(根, undefined, '32')).toEqual({ 包: ['材质包/甲'], 来自: '作品', 封顶: 32 });
    expect(读材质包选用(根, '乙', '16')).toEqual({ 包: ['材质包/乙'], 来自: '环境', 封顶: 16 });
    expect(读材质包选用(根, '乙', undefined)).toEqual({ 包: ['材质包/乙'], 来自: '环境' });
    expect(读材质包选用(根, '原版', '16')).toEqual({ 包: [], 来自: '无' });
    expect(() => 读材质包选用(根, '乙', '24')).toThrow(/2 的幂/);
    expect(path.basename(材质包锁路径(根, { 包: ['材质包/乙', '材质包/丙'], 来自: '环境', 封顶: 16 }, '/数据'))).toBe('乙+丙@16.锁.json');
    expect(path.basename(材质包锁路径(根, { 包: ['材质包/乙'], 来自: '环境' }, '/数据'))).toBe('乙.锁.json');
  });

  it('试验倍数：ANIM_PACKS_TRY 只跟环境变量选的包一起起作用，锁名、分组键带 @试验', () => {
    const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
    fs.writeFileSync(path.join(根, '材质包.toml'), '"包" = ["甲"]\n');
    expect(读材质包选用(根, '乙', undefined, undefined, '256')).toEqual({ 包: ['材质包/乙'], 来自: '环境', 试验: 256 });
    expect(读材质包选用(根, '', '', undefined, '256')).toEqual({ 包: ['材质包/甲'], 来自: '作品' });
    expect(读材质包选用(根, '原版', undefined, undefined, '256')).toEqual({ 包: [], 来自: '无' });
    expect(() => 读材质包选用(根, '乙', undefined, undefined, '100')).toThrow(/2 的幂/);
    expect(path.basename(材质包锁路径(根, { 包: ['材质包/乙'], 来自: '环境', 试验: 128 }, '/数据'))).toBe('乙@试验128.锁.json');
    expect(材质包选用键({ 包: ['材质包/乙'], 来自: '环境', 试验: 128 })).not.toBe(材质包选用键({ 包: ['材质包/乙'], 来自: '环境' }));
  });

  it('分辨率：材质包.toml 的 "分辨率" 给作品和 [段] 另选的包都带上，[] 原版和环境变量试样不带', () => {
    const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
    fs.writeFileSync(path.join(根, '材质包.toml'), '"包" = ["甲"]\n"分辨率" = 64\n\n[段]\n"2-雷雨" = []\n"2-抢龙蛋" = ["乙"]\n');
    expect(读材质包选用(根, '', '')).toEqual({ 包: ['材质包/甲'], 来自: '作品', 分辨率: 64 });
    expect(读材质包选用(根, '', '', '2-抢龙蛋')).toEqual({ 包: ['材质包/乙'], 来自: '段', 分辨率: 64 });
    expect(读材质包选用(根, '', '', '2-雷雨')).toEqual({ 包: [], 来自: '无' });
    expect(读材质包选用(根, '丙', '')).toEqual({ 包: ['材质包/丙'], 来自: '环境' });
    fs.writeFileSync(path.join(根, '材质包.toml'), '"包" = ["甲"]\n"分辨率" = 60\n');
    expect(() => 读材质包选用(根, '', '')).toThrow(/2 的幂/);
  });

  it('按段选：[段] 里的段换包或 [] 退回原版，没写的段跟 "包"；和 "包" 一样的算作品的；环境变量顶掉所有段；锁各一份', () => {
    const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
    fs.writeFileSync(path.join(根, '材质包.toml'), '"包" = ["甲"]\n"封顶" = 32\n\n[段]\n# 注释\n"2-雷雨" = []\n"2-抢龙蛋" = ["乙", "甲"]\n"2-初入" = ["材质包/甲"]\n');
    expect([...读材质包表(根)!.段]).toEqual([['2-雷雨', []], ['2-抢龙蛋', ['材质包/乙', '材质包/甲']], ['2-初入', ['材质包/甲']]]);
    expect(读材质包选用(根, '', '', '2-雷雨')).toEqual({ 包: [], 来自: '无' });
    expect(读材质包选用(根, '', '', '2-抢龙蛋')).toEqual({ 包: ['材质包/乙', '材质包/甲'], 来自: '段', 封顶: 32 });
    expect(读材质包选用(根, '', '', '2-初入')).toEqual({ 包: ['材质包/甲'], 来自: '作品', 封顶: 32 });
    expect(读材质包选用(根, '', '', '2-归隐')).toEqual({ 包: ['材质包/甲'], 来自: '作品', 封顶: 32 });
    expect(读材质包选用(根, '', '')).toEqual({ 包: ['材质包/甲'], 来自: '作品', 封顶: 32 });
    expect(读材质包选用(根, '丙', '', '2-雷雨')).toEqual({ 包: ['材质包/丙'], 来自: '环境' });
    expect(path.basename(材质包锁路径(根, 读材质包选用(根, '', '', '2-抢龙蛋')))).toBe('材质包-乙+甲@32.锁.json');
    expect(作品的材质包选用们(根).map((x) => x.来自)).toEqual(['作品', '段']);
    const 组 = 按材质包分组(根, ['2-归隐', '2-雷雨', '2-初入', '2-抢龙蛋', '2-烟花'], (x) => x);
    expect(组.map((g) => [g.选.来自, g.项们])).toEqual([['作品', ['2-归隐', '2-初入', '2-烟花']], ['无', ['2-雷雨']], ['段', ['2-抢龙蛋']]]);
    // 写错了报出来，不悄悄当原版
    for (const 坏 of ['"包" = []\n[段]\n2-雷雨 = []\n', '"包" = []\n[别的]\n', '"包" = []\n[段]\n"甲" = []\n"甲" = []\n', '"包" = []\n[段]\n"甲" = [乙]\n']) {
      fs.writeFileSync(path.join(根, '材质包.toml'), 坏);
      expect(() => 读材质包选用(根, '', '', '甲')).toThrow(/材质包\.toml/);
    }
  });

  it('照材质包选用 里 读作品资产锁 默认按那一组；渲一段前核对打包的选用和这一段的一样', () => {
    const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
    fs.writeFileSync(path.join(根, '材质包.toml'), '"包" = []\n[段]\n"甲" = ["某"]\n');
    expect(当前材质包选用(根)).toEqual({ 包: [], 来自: '无' });
    expect(() => 核对段材质包(根, '乙')).not.toThrow();
    expect(() => 核对段材质包(根, '甲')).toThrow(/调用处要按材质包分组/);
    const 甲 = 读材质包选用(根, '', '', '甲');
    照材质包选用(甲, () => {
      expect(当前材质包选用(根)).toBe(甲);
      expect(() => 核对段材质包(根, '甲')).not.toThrow();
      expect(() => 核对段材质包(根, '乙')).toThrow(/这次打包按的是 材质包\/某/);
    });
    expect(当前材质包选用(根)).toEqual({ 包: [], 来自: '无' });
  });

  it('放大上限：倍数要同时整除 像素N 和 正交顶面（整像素），取 2 的幂；封顶再往下压；没有 画风.ts 不放大', () => {
    const 画风 = (N: number, 顶?: number) => `export const 像素N = ${N};\n${顶 ? `export const 正交顶面 = ${顶};\n` : ''}`;
    expect(放大上限(画风(6, 2)).倍).toBe(2); // 本作品：32x 原样，64x 缩到 32x
    expect(放大上限(画风(6, 2), 16).倍).toBe(1);
    expect(放大上限(画风(6, 2), 64).倍).toBe(2);
    expect(放大上限(画风(8, 4)).倍).toBe(4);
    expect(放大上限(画风(8)).倍).toBe(8);
    expect(放大上限(画风(12, 4), 32).倍).toBe(2);
    expect(放大上限(画风(3, 3)).倍).toBe(1);
    expect(放大上限(null).倍).toBe(1);
    expect(放大上限(画风(6, 2), undefined, 256).倍).toBe(16); // 试验：不按整除
    expect(放大上限(画风(6, 2), 64, 256).倍).toBe(4);
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
    写({ 包: [{ id: '材质包/某', sha256: 'd'.repeat(64) }], 封顶: 16, 覆盖: {} });
    expect(() => 套材质包(锁, 根, 选)).toThrow(/封顶 16 建的/);
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
      '贴图/甲/a': { 包内: 'assets/minecraft/textures/block/a.png', 组: '甲#0' },
      '贴图/甲/b': { 包内: 'assets/minecraft/textures/block/b.png', 组: '甲#0' },
      '贴图/环境/太阳': { 包内: 'assets/minecraft/textures/environment/sun.png', 组: '乙#0' },
      '贴图/丙/水面': { 包内: 'assets/minecraft/textures/block/water_still.png', 组: '丙#0' },
    });
  });

  it('extract.toml 的单写路径、路径通配（按锁里有的 id 展开）、「导出实体模型」的 --贴图 也认', () => {
    const 表 = `
[["取材"]]
"名称" = "粒子"
"步骤" = [["导出模型", "{jar:client-1.20.1}", "src/粒子", "assets/minecraft/textures/particle/spark_*.png", "assets/minecraft/textures/particle/heart.png"]]
["取材"."产物"]
"贴图/粒子/*" = "src/粒子/*.png"

[["取材"]]
"名称" = "猪"
"步骤" = [["python", "x.py"], ["导出实体模型", "{jar:client-1.20.1}", "src/猪/猪.json", "--贴图", "皮=assets/minecraft/textures/entity/pig/pig.png", "--动画", "走"]]
["取材"."产物"]
"模型/猪" = "src/猪/猪.json"
"贴图/猪" = "src/猪/猪.png"

[["取材"]]
"名称" = "箱"
"步骤" = [["导出实体模型", "{jar:client-1.20.1}", "src/箱/箱.json", "--贴图", "普通=assets/minecraft/textures/entity/chest/normal.png", "陷阱=assets/minecraft/textures/entity/chest/trapped.png"]]
["取材"."产物"]
"贴图/箱/普通" = "src/箱/箱.普通.png"
"贴图/箱/陷阱" = "src/箱/箱.陷阱.png"
`;
    expect(Object.fromEntries(照搬贴图(表, ['贴图/粒子/spark_0', '贴图/粒子/spark_7', '贴图/粒子/别的', '贴图/粒子/子/spark_1']))).toEqual({
      '贴图/粒子/spark_0': { 包内: 'assets/minecraft/textures/particle/spark_0.png', 组: '粒子#0' },
      '贴图/粒子/spark_7': { 包内: 'assets/minecraft/textures/particle/spark_7.png', 组: '粒子#0' },
      '贴图/粒子/heart': { 包内: 'assets/minecraft/textures/particle/heart.png', 组: '粒子#0' },
      '贴图/猪': { 包内: 'assets/minecraft/textures/entity/pig/pig.png', 组: '猪#1' },
      '贴图/箱/普通': { 包内: 'assets/minecraft/textures/entity/chest/normal.png', 组: '箱#0' },
      '贴图/箱/陷阱': { 包内: 'assets/minecraft/textures/entity/chest/trapped.png', 组: '箱#0' },
    });
  });
});
