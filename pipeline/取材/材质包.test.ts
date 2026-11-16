import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { maxUpscale, copyTextures } from './材质包.ts';
import { workResourcePackSelections, resourcePackSelectionKey, applyResourcePack, currentResourcePackSelection, groupByResourcePackSelection, verifySegResourcePacks, withResourcePackSelection, resourcePackLockPath, readResourcePackSelection, readResourcePackTable, type ResourcePackSelection, type ResourcePackLock, type AssetLock } from '../资产/资产锁.ts';

const lockEntry = (c: string) => ({ sha256: c.repeat(64), size: 1, lib: 'store' as const, suffix: '.png' });

describe('材质包覆盖层', () => {
  it('选用：环境变量顶掉作品的 材质包.toml，短名补 材质包/，「原版」关掉；没写或空数组 = 原版', () => {
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
    expect(readResourcePackSelection(workRoot, undefined, undefined)).toEqual({ pack: [], source: '无' });
    fs.writeFileSync(path.join(workRoot, '材质包.toml'), '# 注释里的 "pack" = ["x"] 不算\n"pack" = []\n');
    expect(readResourcePackSelection(workRoot, undefined, undefined)).toEqual({ pack: [], source: '无' });
    fs.writeFileSync(path.join(workRoot, '材质包.toml'), '"pack" = [\n  "材质包/甲",\n  "乙",\n]\n');
    expect(readResourcePackSelection(workRoot, undefined, undefined)).toEqual({ pack: ['材质包/甲', '材质包/乙'], source: '作品' });
    expect(readResourcePackSelection(workRoot, '丙, 材质包/丁', undefined)).toEqual({ pack: ['材质包/丙', '材质包/丁'], source: '环境' });
    expect(readResourcePackSelection(workRoot, '原版', undefined)).toEqual({ pack: [], source: '无' });
  });

  it('封顶：材质包.toml 的 "cap"、环境变量 ANIM_PACKS_RES（顶掉作品的），只认 16 起的 2 的幂；没选包就没有封顶；试样锁名带 @封顶', () => {
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
    fs.writeFileSync(path.join(workRoot, '材质包.toml'), '"pack" = ["甲"]\n"cap" = 16\n');
    expect(readResourcePackSelection(workRoot, undefined, undefined)).toEqual({ pack: ['材质包/甲'], source: '作品', resolutionCap: 16 });
    expect(readResourcePackSelection(workRoot, undefined, '32')).toEqual({ pack: ['材质包/甲'], source: '作品', resolutionCap: 32 });
    expect(readResourcePackSelection(workRoot, '乙', '16')).toEqual({ pack: ['材质包/乙'], source: '环境', resolutionCap: 16 });
    expect(readResourcePackSelection(workRoot, '乙', undefined)).toEqual({ pack: ['材质包/乙'], source: '环境' });
    expect(readResourcePackSelection(workRoot, '原版', '16')).toEqual({ pack: [], source: '无' });
    expect(() => readResourcePackSelection(workRoot, '乙', '24')).toThrow(/2 的幂/);
    expect(path.basename(resourcePackLockPath(workRoot, { pack: ['材质包/乙', '材质包/丙'], source: '环境', resolutionCap: 16 }, '/数据'))).toBe('乙+丙@16.锁.json');
    expect(path.basename(resourcePackLockPath(workRoot, { pack: ['材质包/乙'], source: '环境' }, '/数据'))).toBe('乙.锁.json');
  });

  it('试验倍数：ANIM_PACKS_TRY 只跟环境变量选的包一起起作用，锁名、分组键带 @试验', () => {
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
    fs.writeFileSync(path.join(workRoot, '材质包.toml'), '"pack" = ["甲"]\n');
    expect(readResourcePackSelection(workRoot, '乙', undefined, undefined, '256')).toEqual({ pack: ['材质包/乙'], source: '环境', trial: 256 });
    expect(readResourcePackSelection(workRoot, '', '', undefined, '256')).toEqual({ pack: ['材质包/甲'], source: '作品' });
    expect(readResourcePackSelection(workRoot, '原版', undefined, undefined, '256')).toEqual({ pack: [], source: '无' });
    expect(() => readResourcePackSelection(workRoot, '乙', undefined, undefined, '100')).toThrow(/2 的幂/);
    expect(path.basename(resourcePackLockPath(workRoot, { pack: ['材质包/乙'], source: '环境', trial: 128 }, '/数据'))).toBe('乙@试验128.锁.json');
    expect(resourcePackSelectionKey({ pack: ['材质包/乙'], source: '环境', trial: 128 })).not.toBe(resourcePackSelectionKey({ pack: ['材质包/乙'], source: '环境' }));
  });

  it('分辨率：材质包.toml 的 "resolution" 给作品和 [segment] 另选的包都带上，[] 原版和环境变量试样不带', () => {
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
    fs.writeFileSync(path.join(workRoot, '材质包.toml'), '"pack" = ["甲"]\n"resolution" = 64\n\n[segment]\n"2-雷雨" = []\n"2-抢龙蛋" = ["乙"]\n');
    expect(readResourcePackSelection(workRoot, '', '')).toEqual({ pack: ['材质包/甲'], source: '作品', resolution: 64 });
    expect(readResourcePackSelection(workRoot, '', '', '2-抢龙蛋')).toEqual({ pack: ['材质包/乙'], source: '段', resolution: 64 });
    expect(readResourcePackSelection(workRoot, '', '', '2-雷雨')).toEqual({ pack: [], source: '无' });
    expect(readResourcePackSelection(workRoot, '丙', '')).toEqual({ pack: ['材质包/丙'], source: '环境' });
    fs.writeFileSync(path.join(workRoot, '材质包.toml'), '"pack" = ["甲"]\n"resolution" = 60\n');
    expect(() => readResourcePackSelection(workRoot, '', '')).toThrow(/2 的幂/);
  });

  it('按段选：[segment] 里的段换包或 [] 退回原版，没写的段跟 "pack"；和 "pack" 一样的算作品的；环境变量顶掉所有段；锁各一份', () => {
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
    fs.writeFileSync(path.join(workRoot, '材质包.toml'), '"pack" = ["甲"]\n"cap" = 32\n\n[segment]\n# 注释\n"2-雷雨" = []\n"2-抢龙蛋" = ["乙", "甲"]\n"2-初入" = ["材质包/甲"]\n');
    expect([...readResourcePackTable(workRoot)!.segment]).toEqual([['2-雷雨', []], ['2-抢龙蛋', ['材质包/乙', '材质包/甲']], ['2-初入', ['材质包/甲']]]);
    expect(readResourcePackSelection(workRoot, '', '', '2-雷雨')).toEqual({ pack: [], source: '无' });
    expect(readResourcePackSelection(workRoot, '', '', '2-抢龙蛋')).toEqual({ pack: ['材质包/乙', '材质包/甲'], source: '段', resolutionCap: 32 });
    expect(readResourcePackSelection(workRoot, '', '', '2-初入')).toEqual({ pack: ['材质包/甲'], source: '作品', resolutionCap: 32 });
    expect(readResourcePackSelection(workRoot, '', '', '2-归隐')).toEqual({ pack: ['材质包/甲'], source: '作品', resolutionCap: 32 });
    expect(readResourcePackSelection(workRoot, '', '')).toEqual({ pack: ['材质包/甲'], source: '作品', resolutionCap: 32 });
    expect(readResourcePackSelection(workRoot, '丙', '', '2-雷雨')).toEqual({ pack: ['材质包/丙'], source: '环境' });
    expect(path.basename(resourcePackLockPath(workRoot, readResourcePackSelection(workRoot, '', '', '2-抢龙蛋')))).toBe('材质包-乙+甲@32.锁.json');
    expect(workResourcePackSelections(workRoot).map((x) => x.source)).toEqual(['作品', '段']);
    const packGroups = groupByResourcePackSelection(workRoot, ['2-归隐', '2-雷雨', '2-初入', '2-抢龙蛋', '2-烟花'], (x) => x);
    expect(packGroups.map((g) => [g.选.source, g.items])).toEqual([['作品', ['2-归隐', '2-初入', '2-烟花']], ['无', ['2-雷雨']], ['段', ['2-抢龙蛋']]]);
    // 写错了报出来，不悄悄当原版
    for (const badToml of ['"pack" = []\n[segment]\n2-雷雨 = []\n', '"pack" = []\n[别的]\n', '"pack" = []\n[segment]\n"甲" = []\n"甲" = []\n', '"pack" = []\n[segment]\n"甲" = [乙]\n']) {
      fs.writeFileSync(path.join(workRoot, '材质包.toml'), badToml);
      expect(() => readResourcePackSelection(workRoot, '', '', '甲')).toThrow(/材质包\.toml/);
    }
  });

  it('照材质包选用 里 读作品资产锁 默认按那一组；渲一段前核对打包的选用和这一段的一样', () => {
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-材质包-'));
    fs.writeFileSync(path.join(workRoot, '材质包.toml'), '"pack" = []\n[segment]\n"甲" = ["某"]\n');
    expect(currentResourcePackSelection(workRoot)).toEqual({ pack: [], source: '无' });
    expect(() => verifySegResourcePacks(workRoot, '乙')).not.toThrow();
    expect(() => verifySegResourcePacks(workRoot, '甲')).toThrow(/调用处要按材质包分组/);
    const packA = readResourcePackSelection(workRoot, '', '', '甲');
    withResourcePackSelection(packA, () => {
      expect(currentResourcePackSelection(workRoot)).toBe(packA);
      expect(() => verifySegResourcePacks(workRoot, '甲')).not.toThrow();
      expect(() => verifySegResourcePacks(workRoot, '乙')).toThrow(/这次打包按的是 材质包\/某/);
    });
    expect(currentResourcePackSelection(workRoot)).toEqual({ pack: [], source: '无' });
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
    expect(applyResourcePack(assetLock, workRoot, { pack: [], source: '无' })).toBe(assetLock);
    const packSelection: ResourcePackSelection = { pack: ['材质包/某'], source: '作品' };
    expect(() => applyResourcePack(assetLock, workRoot, packSelection)).toThrow(/覆盖层锁 .* 不存在/);
    const writeLock = (resourcePackLock: ResourcePackLock) => fs.writeFileSync(resourcePackLockPath(workRoot, packSelection), JSON.stringify(resourcePackLock));
    writeLock({ pack: [{ id: '材质包/某', sha256: 'd'.repeat(64) }], overrides: { '贴图/甲': { ...lockEntry('c'), lib: '私有' } } });
    expect(applyResourcePack(assetLock, workRoot, packSelection)).toEqual({ ...assetLock, '贴图/甲': { ...lockEntry('c'), lib: '私有' } });
    writeLock({ pack: [{ id: '材质包/某', sha256: 'e'.repeat(64) }], overrides: {} });
    expect(() => applyResourcePack(assetLock, workRoot, packSelection)).toThrow(/重跑 anim assets packs/);
    writeLock({ pack: [{ id: '材质包/某', sha256: 'd'.repeat(64) }], overrides: { '贴图/丙': lockEntry('c') } });
    expect(() => applyResourcePack(assetLock, workRoot, packSelection)).toThrow(/作品锁里没有的 id/);
    writeLock({ pack: [{ id: '材质包/某', sha256: 'd'.repeat(64) }], resolutionCap: 16, overrides: {} });
    expect(() => applyResourcePack(assetLock, workRoot, packSelection)).toThrow(/封顶 16 建的/);
  });

  it('extract.toml 的「导出模型」照搬产物：通配和单件都认出包内路径，别的步骤不算', () => {
    const resourcePackText = `
[["sourcing"]]
"displayName" = "甲"
"steps" = [["导出模型", "{jar:client-1.20.1}", "src/甲", "a=assets/minecraft/textures/block/a.png", "b=assets/minecraft/textures/block/b.png"]]
["sourcing"."artifacts"]
"贴图/甲/*" = "src/甲/*.png"

[["sourcing"]]
"displayName" = "乙"
"steps" = [["导出模型", "{jar:client-1.20.1}", "src/乙", "sun=assets/minecraft/textures/environment/sun.png"], ["python", "x.py"]]
["sourcing"."artifacts"]
"贴图/环境/太阳" = "src/乙/sun.png"
"模型/乙" = "src/乙/乙.json"

[["sourcing"]]
"displayName" = "丙"
"steps" = [["导出模型", "{jar:client-1.20.1}", "src/丙/水面.png", "water_still=assets/minecraft/textures/block/water_still.png"]]
["sourcing"."artifacts"]
"贴图/丙/水面" = "src/丙/水面.png"
`;
    expect(Object.fromEntries(copyTextures(resourcePackText))).toEqual({
      '贴图/甲/a': { packPath: 'assets/minecraft/textures/block/a.png', group: '甲#0' },
      '贴图/甲/b': { packPath: 'assets/minecraft/textures/block/b.png', group: '甲#0' },
      '贴图/环境/太阳': { packPath: 'assets/minecraft/textures/environment/sun.png', group: '乙#0' },
      '贴图/丙/水面': { packPath: 'assets/minecraft/textures/block/water_still.png', group: '丙#0' },
    });
  });

  it('extract.toml 的单写路径、路径通配（按锁里有的 id 展开）、「导出实体模型」的 --贴图 也认', () => {
    const resourcePackText = `
[["sourcing"]]
"displayName" = "粒子"
"steps" = [["导出模型", "{jar:client-1.20.1}", "src/粒子", "assets/minecraft/textures/particle/spark_*.png", "assets/minecraft/textures/particle/heart.png"]]
["sourcing"."artifacts"]
"贴图/粒子/*" = "src/粒子/*.png"

[["sourcing"]]
"displayName" = "猪"
"steps" = [["python", "x.py"], ["导出实体模型", "{jar:client-1.20.1}", "src/猪/猪.json", "--贴图", "皮=assets/minecraft/textures/entity/pig/pig.png", "--动画", "走"]]
["sourcing"."artifacts"]
"模型/猪" = "src/猪/猪.json"
"贴图/猪" = "src/猪/猪.png"

[["sourcing"]]
"displayName" = "箱"
"steps" = [["导出实体模型", "{jar:client-1.20.1}", "src/箱/箱.json", "--贴图", "普通=assets/minecraft/textures/entity/chest/normal.png", "陷阱=assets/minecraft/textures/entity/chest/trapped.png"]]
["sourcing"."artifacts"]
"贴图/箱/普通" = "src/箱/箱.普通.png"
"贴图/箱/陷阱" = "src/箱/箱.陷阱.png"
`;
    expect(Object.fromEntries(copyTextures(resourcePackText, ['贴图/粒子/spark_0', '贴图/粒子/spark_7', '贴图/粒子/别的', '贴图/粒子/子/spark_1']))).toEqual({
      '贴图/粒子/spark_0': { packPath: 'assets/minecraft/textures/particle/spark_0.png', group: '粒子#0' },
      '贴图/粒子/spark_7': { packPath: 'assets/minecraft/textures/particle/spark_7.png', group: '粒子#0' },
      '贴图/粒子/heart': { packPath: 'assets/minecraft/textures/particle/heart.png', group: '粒子#0' },
      '贴图/猪': { packPath: 'assets/minecraft/textures/entity/pig/pig.png', group: '猪#1' },
      '贴图/箱/普通': { packPath: 'assets/minecraft/textures/entity/chest/normal.png', group: '箱#0' },
      '贴图/箱/陷阱': { packPath: 'assets/minecraft/textures/entity/chest/trapped.png', group: '箱#0' },
    });
  });
});
