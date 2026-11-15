import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { maxUpscale, copyTextures } from './材质包.ts';
import { workResourcePackSelections, resourcePackSelectionKey, applyResourcePack, currentResourcePackSelection, groupByResourcePackSelection, verifySegResourcePacks, withResourcePackSelection, resourcePackLockPath, readResourcePackSelection, readResourcePackTable, type ResourcePackSelection, type ResourcePackLock, type AssetLock } from './资产锁.ts';

const lockEntry = (c: string) => ({ sha256: c.repeat(64), 大小: 1, 库: 'store' as const, 后缀: '.png' });

describe('材质包覆盖层', () => {
  it('选用：环境变量顶掉作品的 材质包.toml，短名补 材质包/，「原版」关掉；没写或空数组 = 原版', () => {
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
    expect(readResourcePackSelection(workRoot, undefined, undefined)).toEqual({ 包: [], source: '无' });
    fs.writeFileSync(path.join(workRoot, '材质包.toml'), '# 注释里的 "包" = ["x"] 不算\n"包" = []\n');
    expect(readResourcePackSelection(workRoot, undefined, undefined)).toEqual({ 包: [], source: '无' });
    fs.writeFileSync(path.join(workRoot, '材质包.toml'), '"包" = [\n  "材质包/甲",\n  "乙",\n]\n');
    expect(readResourcePackSelection(workRoot, undefined, undefined)).toEqual({ 包: ['材质包/甲', '材质包/乙'], source: '作品' });
    expect(readResourcePackSelection(workRoot, '丙, 材质包/丁', undefined)).toEqual({ 包: ['材质包/丙', '材质包/丁'], source: '环境' });
    expect(readResourcePackSelection(workRoot, '原版', undefined)).toEqual({ 包: [], source: '无' });
  });

  it('封顶：材质包.toml 的 "封顶"、环境变量 ANIM_PACKS_RES（顶掉作品的），只认 16 起的 2 的幂；没选包就没有封顶；试样锁名带 @封顶', () => {
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
    fs.writeFileSync(path.join(workRoot, '材质包.toml'), '"包" = ["甲"]\n"封顶" = 16\n');
    expect(readResourcePackSelection(workRoot, undefined, undefined)).toEqual({ 包: ['材质包/甲'], source: '作品', 封顶: 16 });
    expect(readResourcePackSelection(workRoot, undefined, '32')).toEqual({ 包: ['材质包/甲'], source: '作品', 封顶: 32 });
    expect(readResourcePackSelection(workRoot, '乙', '16')).toEqual({ 包: ['材质包/乙'], source: '环境', 封顶: 16 });
    expect(readResourcePackSelection(workRoot, '乙', undefined)).toEqual({ 包: ['材质包/乙'], source: '环境' });
    expect(readResourcePackSelection(workRoot, '原版', '16')).toEqual({ 包: [], source: '无' });
    expect(() => readResourcePackSelection(workRoot, '乙', '24')).toThrow(/2 的幂/);
    expect(path.basename(resourcePackLockPath(workRoot, { 包: ['材质包/乙', '材质包/丙'], source: '环境', 封顶: 16 }, '/数据'))).toBe('乙+丙@16.锁.json');
    expect(path.basename(resourcePackLockPath(workRoot, { 包: ['材质包/乙'], source: '环境' }, '/数据'))).toBe('乙.锁.json');
  });

  it('试验倍数：ANIM_PACKS_TRY 只跟环境变量选的包一起起作用，锁名、分组键带 @试验', () => {
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
    fs.writeFileSync(path.join(workRoot, '材质包.toml'), '"包" = ["甲"]\n');
    expect(readResourcePackSelection(workRoot, '乙', undefined, undefined, '256')).toEqual({ 包: ['材质包/乙'], source: '环境', 试验: 256 });
    expect(readResourcePackSelection(workRoot, '', '', undefined, '256')).toEqual({ 包: ['材质包/甲'], source: '作品' });
    expect(readResourcePackSelection(workRoot, '原版', undefined, undefined, '256')).toEqual({ 包: [], source: '无' });
    expect(() => readResourcePackSelection(workRoot, '乙', undefined, undefined, '100')).toThrow(/2 的幂/);
    expect(path.basename(resourcePackLockPath(workRoot, { 包: ['材质包/乙'], source: '环境', 试验: 128 }, '/数据'))).toBe('乙@试验128.锁.json');
    expect(resourcePackSelectionKey({ 包: ['材质包/乙'], source: '环境', 试验: 128 })).not.toBe(resourcePackSelectionKey({ 包: ['材质包/乙'], source: '环境' }));
  });

  it('分辨率：材质包.toml 的 "分辨率" 给作品和 [段] 另选的包都带上，[] 原版和环境变量试样不带', () => {
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
    fs.writeFileSync(path.join(workRoot, '材质包.toml'), '"包" = ["甲"]\n"分辨率" = 64\n\n[段]\n"2-雷雨" = []\n"2-抢龙蛋" = ["乙"]\n');
    expect(readResourcePackSelection(workRoot, '', '')).toEqual({ 包: ['材质包/甲'], source: '作品', 分辨率: 64 });
    expect(readResourcePackSelection(workRoot, '', '', '2-抢龙蛋')).toEqual({ 包: ['材质包/乙'], source: '段', 分辨率: 64 });
    expect(readResourcePackSelection(workRoot, '', '', '2-雷雨')).toEqual({ 包: [], source: '无' });
    expect(readResourcePackSelection(workRoot, '丙', '')).toEqual({ 包: ['材质包/丙'], source: '环境' });
    fs.writeFileSync(path.join(workRoot, '材质包.toml'), '"包" = ["甲"]\n"分辨率" = 60\n');
    expect(() => readResourcePackSelection(workRoot, '', '')).toThrow(/2 的幂/);
  });

  it('按段选：[段] 里的段换包或 [] 退回原版，没写的段跟 "包"；和 "包" 一样的算作品的；环境变量顶掉所有段；锁各一份', () => {
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
    fs.writeFileSync(path.join(workRoot, '材质包.toml'), '"包" = ["甲"]\n"封顶" = 32\n\n[段]\n# 注释\n"2-雷雨" = []\n"2-抢龙蛋" = ["乙", "甲"]\n"2-初入" = ["材质包/甲"]\n');
    expect([...readResourcePackTable(workRoot)!.段]).toEqual([['2-雷雨', []], ['2-抢龙蛋', ['材质包/乙', '材质包/甲']], ['2-初入', ['材质包/甲']]]);
    expect(readResourcePackSelection(workRoot, '', '', '2-雷雨')).toEqual({ 包: [], source: '无' });
    expect(readResourcePackSelection(workRoot, '', '', '2-抢龙蛋')).toEqual({ 包: ['材质包/乙', '材质包/甲'], source: '段', 封顶: 32 });
    expect(readResourcePackSelection(workRoot, '', '', '2-初入')).toEqual({ 包: ['材质包/甲'], source: '作品', 封顶: 32 });
    expect(readResourcePackSelection(workRoot, '', '', '2-归隐')).toEqual({ 包: ['材质包/甲'], source: '作品', 封顶: 32 });
    expect(readResourcePackSelection(workRoot, '', '')).toEqual({ 包: ['材质包/甲'], source: '作品', 封顶: 32 });
    expect(readResourcePackSelection(workRoot, '丙', '', '2-雷雨')).toEqual({ 包: ['材质包/丙'], source: '环境' });
    expect(path.basename(resourcePackLockPath(workRoot, readResourcePackSelection(workRoot, '', '', '2-抢龙蛋')))).toBe('材质包-乙+甲@32.锁.json');
    expect(workResourcePackSelections(workRoot).map((x) => x.source)).toEqual(['作品', '段']);
    const packGroups = groupByResourcePackSelection(workRoot, ['2-归隐', '2-雷雨', '2-初入', '2-抢龙蛋', '2-烟花'], (x) => x);
    expect(packGroups.map((g) => [g.选.source, g.items])).toEqual([['作品', ['2-归隐', '2-初入', '2-烟花']], ['无', ['2-雷雨']], ['段', ['2-抢龙蛋']]]);
    // 写错了报出来，不悄悄当原版
    for (const badToml of ['"包" = []\n[段]\n2-雷雨 = []\n', '"包" = []\n[别的]\n', '"包" = []\n[段]\n"甲" = []\n"甲" = []\n', '"包" = []\n[段]\n"甲" = [乙]\n']) {
      fs.writeFileSync(path.join(workRoot, '材质包.toml'), badToml);
      expect(() => readResourcePackSelection(workRoot, '', '', '甲')).toThrow(/材质包\.toml/);
    }
  });

  it('照材质包选用 里 读作品资产锁 默认按那一组；渲一段前核对打包的选用和这一段的一样', () => {
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
    fs.writeFileSync(path.join(workRoot, '材质包.toml'), '"包" = []\n[段]\n"甲" = ["某"]\n');
    expect(currentResourcePackSelection(workRoot)).toEqual({ 包: [], source: '无' });
    expect(() => verifySegResourcePacks(workRoot, '乙')).not.toThrow();
    expect(() => verifySegResourcePacks(workRoot, '甲')).toThrow(/调用处要按材质包分组/);
    const packA = readResourcePackSelection(workRoot, '', '', '甲');
    withResourcePackSelection(packA, () => {
      expect(currentResourcePackSelection(workRoot)).toBe(packA);
      expect(() => verifySegResourcePacks(workRoot, '甲')).not.toThrow();
      expect(() => verifySegResourcePacks(workRoot, '乙')).toThrow(/这次打包按的是 材质包\/某/);
    });
    expect(currentResourcePackSelection(workRoot)).toEqual({ 包: [], source: '无' });
  });

  it('放大上限：倍数要同时整除 像素N 和 正交顶面（整像素），取 2 的幂；封顶再往下压；没有 画风.ts 不放大', () => {
    const artStyleSource = (N: number, topDepth?: number) => `export const 像素N = ${N};\n${topDepth ? `export const 正交顶面 = ${topDepth};\n` : ''}`;
    expect(maxUpscale(artStyleSource(6, 2)).factor).toBe(2); // 本作品：32x 原样，64x 缩到 32x
    expect(maxUpscale(artStyleSource(6, 2), 16).factor).toBe(1);
    expect(maxUpscale(artStyleSource(6, 2), 64).factor).toBe(2);
    expect(maxUpscale(artStyleSource(8, 4)).factor).toBe(4);
    expect(maxUpscale(artStyleSource(8)).factor).toBe(8);
    expect(maxUpscale(artStyleSource(12, 4), 32).factor).toBe(2);
    expect(maxUpscale(artStyleSource(3, 3)).factor).toBe(1);
    expect(maxUpscale(null).factor).toBe(1);
    expect(maxUpscale(artStyleSource(6, 2), undefined, 256).factor).toBe(16); // 试验：不按整除
    expect(maxUpscale(artStyleSource(6, 2), 64, 256).factor).toBe(4);
  });

  it('不选就是原锁；选了按覆盖层锁盖上；包换了、锁没建、盖了没登记的 id 都报错', () => {
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
    const assetLock: AssetLock = { '贴图/甲': lockEntry('a'), '贴图/乙': lockEntry('b'), '材质包/某': lockEntry('d') };
    expect(applyResourcePack(assetLock, workRoot, { 包: [], source: '无' })).toBe(assetLock);
    const packSelection: ResourcePackSelection = { 包: ['材质包/某'], source: '作品' };
    expect(() => applyResourcePack(assetLock, workRoot, packSelection)).toThrow(/覆盖层锁 .* 不存在/);
    const writeLock = (resourcePackLock: ResourcePackLock) => fs.writeFileSync(resourcePackLockPath(workRoot, packSelection), JSON.stringify(resourcePackLock));
    writeLock({ 包: [{ id: '材质包/某', sha256: 'd'.repeat(64) }], 覆盖: { '贴图/甲': { ...lockEntry('c'), 库: '私有' } } });
    expect(applyResourcePack(assetLock, workRoot, packSelection)).toEqual({ ...assetLock, '贴图/甲': { ...lockEntry('c'), 库: '私有' } });
    writeLock({ 包: [{ id: '材质包/某', sha256: 'e'.repeat(64) }], 覆盖: {} });
    expect(() => applyResourcePack(assetLock, workRoot, packSelection)).toThrow(/重跑 anim assets 材质包/);
    writeLock({ 包: [{ id: '材质包/某', sha256: 'd'.repeat(64) }], 覆盖: { '贴图/丙': lockEntry('c') } });
    expect(() => applyResourcePack(assetLock, workRoot, packSelection)).toThrow(/作品锁里没有的 id/);
    writeLock({ 包: [{ id: '材质包/某', sha256: 'd'.repeat(64) }], 封顶: 16, 覆盖: {} });
    expect(() => applyResourcePack(assetLock, workRoot, packSelection)).toThrow(/封顶 16 建的/);
  });

  it('extract.toml 的「导出模型」照搬产物：通配和单件都认出包内路径，别的步骤不算', () => {
    const resourcePackText = `
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
    expect(Object.fromEntries(copyTextures(resourcePackText))).toEqual({
      '贴图/甲/a': { packPath: 'assets/minecraft/textures/block/a.png', 组: '甲#0' },
      '贴图/甲/b': { packPath: 'assets/minecraft/textures/block/b.png', 组: '甲#0' },
      '贴图/环境/太阳': { packPath: 'assets/minecraft/textures/environment/sun.png', 组: '乙#0' },
      '贴图/丙/水面': { packPath: 'assets/minecraft/textures/block/water_still.png', 组: '丙#0' },
    });
  });

  it('extract.toml 的单写路径、路径通配（按锁里有的 id 展开）、「导出实体模型」的 --贴图 也认', () => {
    const resourcePackText = `
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
    expect(Object.fromEntries(copyTextures(resourcePackText, ['贴图/粒子/spark_0', '贴图/粒子/spark_7', '贴图/粒子/别的', '贴图/粒子/子/spark_1']))).toEqual({
      '贴图/粒子/spark_0': { packPath: 'assets/minecraft/textures/particle/spark_0.png', 组: '粒子#0' },
      '贴图/粒子/spark_7': { packPath: 'assets/minecraft/textures/particle/spark_7.png', 组: '粒子#0' },
      '贴图/粒子/heart': { packPath: 'assets/minecraft/textures/particle/heart.png', 组: '粒子#0' },
      '贴图/猪': { packPath: 'assets/minecraft/textures/entity/pig/pig.png', 组: '猪#1' },
      '贴图/箱/普通': { packPath: 'assets/minecraft/textures/entity/chest/normal.png', 组: '箱#0' },
      '贴图/箱/陷阱': { packPath: 'assets/minecraft/textures/entity/chest/trapped.png', 组: '箱#0' },
    });
  });
});
