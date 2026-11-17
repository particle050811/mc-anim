import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { worldDir, listWorlds, parseDecl, regionDir } from './声明.ts';
import { pregenPlans } from './预生成/计划.ts';

const baseDecl = `"displayName" = "甲"\n"server" = "服"\n"dimension" = "minecraft:overworld"\n`;

describe('世界声明', () => {
  it('包继承 烘焙.原点，默认套编辑、登记', () => {
    const w = parseDecl(`${baseDecl}["bake"]\n"origin" = [0, 64, 2048]\n[["bake"."pack"]]\n"name" = "a"\n[["bake"."pack"]]\n"name" = "b"\n"origin" = [2048, 64, 0]\n"entries" = false\n"套编辑" = false`, '甲');
    expect(w.packDimension).toBe('主世界');
    expect(w.save).toBe('甲');
    expect(w.pack.map((b) => [b.name, b.origin.join(), b.applyEdits, b.entries])).toEqual([
      ['a', '0,64,2048', true, true],
      ['b', '2048,64,0', false, false],
    ]);
  });

  it('下界认得：包维度 下界、oy 0、默认全高；露天维度默认不全高，[烘焙] 全高 可以改', () => {
    const tomlText = `"displayName" = "甲"\n"server" = "服"\n"dimension" = "minecraft:the_nether"\n["bake"]\n"origin" = [0, 0, 0]\n[["bake"."pack"]]\n"name" = "a"\n`;
    const w = parseDecl(tomlText, '甲');
    expect([w.packDimension, w.fullHeight, w.pack[0]!.origin.join()]).toEqual(['下界', true, '0,0,0']);
    expect(() => parseDecl(tomlText.replace('[0, 0, 0]', '[0, 64, 0]'), '甲')).toThrow(/oy/);
    expect(parseDecl(tomlText.replace('["bake"]', '["bake"]\n"全高" = false'), '甲').fullHeight).toBe(false);
    expect(parseDecl(`${baseDecl}["bake"]\n"origin" = [0, 64, 0]`, '甲').fullHeight).toBe(false);
    expect(parseDecl(`${baseDecl}["bake"]\n"origin" = [0, 64, 0]\n"全高" = true`, '甲').fullHeight).toBe(true);
    expect(() => parseDecl(`${baseDecl}["bake"]\n"全高" = 1`, '甲')).toThrow(/全高/);
  });

  it('立方存档：saveFormat = mcr3d 要写对齐 cube 的 yRange，区域目录是 cubes；包可以写许可、可见性', () => {
    const tomlText = `${baseDecl}"saveFormat" = "mcr3d"\n"yRange" = [4096, 8959]\n["bake"]\n"origin" = [0, 64, 0]\n[["bake"."pack"]]\n"name" = "a"\n"license" = "LicenseRef-Origin-Unverified"\n"visibility" = "提取"\n`;
    const w = parseDecl(tomlText, '甲');
    expect(w.saveFormat).toEqual({ kind: 'mcr3d', yRange: [4096, 8959] });
    expect(regionDir(w, '/存档')).toBe(path.join('/存档', 'cubes'));
    expect([w.pack[0]!.license, w.pack[0]!.visibility]).toEqual(['LicenseRef-Origin-Unverified', '提取']);
    expect(parseDecl(baseDecl, '甲').saveFormat).toEqual({ kind: 'mca' });
    expect(() => parseDecl(tomlText.replace('[4096, 8959]', '[4100, 8959]'), '甲')).toThrow(/yRange/);
    expect(() => parseDecl(tomlText.replace('"saveFormat" = "mcr3d"\n', ''), '甲')).toThrow(/yRange/);
    expect(() => parseDecl(tomlText.replace('mcr3d', 'anvil'), '甲')).toThrow(/saveFormat/);
    expect(() => parseDecl(tomlText.replace('提取', '半公开'), '甲')).toThrow(/visibility/);
  });

  it('[dh]：从 DH 的 LOD 库烘的包，范围和原点对齐 4096、高度对齐 64；原点不写用 [bake] 的', () => {
    const tomlText = `${baseDecl}["bake"]\n"origin" = [0, 64, 0]\n["dh"]\n"db" = "data/DistantHorizons.sqlite"\n"pack" = "甲-DH"\n"extent" = [-8192, -4096, 4096, 8192]\n"yRange" = [-64, 8959]\n"license" = "LicenseRef-Origin-Unverified"\n"visibility" = "提取"\n`;
    const w = parseDecl(tomlText, '甲');
    expect(w.dh).toEqual({ db: 'data/DistantHorizons.sqlite', pack: '甲-DH', origin: [0, 64, 0], extent: [-8192, -4096, 4096, 8192], yRange: [-64, 8959], source: undefined, license: 'LicenseRef-Origin-Unverified', visibility: '提取' });
    expect(parseDecl(baseDecl, '甲').dh).toBeUndefined();
    expect(parseDecl(tomlText.replace('"pack" = "甲-DH"', '"pack" = "甲-DH"\n"origin" = [4096, 64, -4096]'), '甲').dh!.origin).toEqual([4096, 64, -4096]);
    expect(() => parseDecl(tomlText.replace('[-8192, -4096, 4096, 8192]', '[-8192, -4096, 4096, 8000]'), '甲')).toThrow(/extent/);
    expect(() => parseDecl(tomlText.replace('[-8192, -4096, 4096, 8192]', '[4096, -4096, -8192, 8192]'), '甲')).toThrow(/extent/);
    expect(() => parseDecl(tomlText.replace('[0, 64, 0]', '[2048, 64, 0]'), '甲')).toThrow(/4096/);
    expect(() => parseDecl(tomlText.replace('[-64, 8959]', '[-60, 8959]'), '甲')).toThrow(/yRange/);
    expect(() => parseDecl(tomlText.replace('"pack" = "甲-DH"\n', ''), '甲')).toThrow(/pack/);
    expect(() => parseDecl(tomlText.replace('提取', '半公开'), '甲')).toThrow(/visibility/);
  });

  it('原点不是 2048 的倍数、oy 不对、名称和文件名不一致都报错', () => {
    expect(() => parseDecl(`${baseDecl}["bake"]\n"origin" = [100, 64, 0]`, '甲')).toThrow(/2048/);
    expect(() => parseDecl(`${baseDecl}[["bake"."pack"]]\n"name" = "a"\n"origin" = [0, 0, 0]`, '甲')).toThrow(/oy/);
    expect(() => parseDecl(baseDecl, '乙')).toThrow(/名称/);
  });

  it('预生成块：两角换成中心和半边，不是正方形的用 rectangle 和两个半径', () => {
    const w = parseDecl(`${baseDecl}[["pregen"."tile"]]\n"name" = "k"\n"corners" = [-100, 0, 100, 50]`, '甲');
    const [k] = pregenPlans(w);
    expect(k!.selection).toEqual({ shape: 'rectangle', center: [0, 25], halfSide: [100, 25] });
    expect(k!.steps).toContainEqual(['chunky radius 100 25', 'Radius changed for x to']);
    expect(k!.steps).toContainEqual(['chunky shape rectangle', 'Shape changed to rectangle']);
    expect(k!.chunkCount).toBe((2 * 7 + 1) * (2 * 2 + 1)); // 中心区块 (0, 1)，半径 ⌈100/16⌉ = 7、⌈25/16⌉ = 2
  });

  it('走廊：折线、半宽、去掉；去掉的不是矩形块、块重名都报错', () => {
    const extraToml = `[["pregen"."tile"]]\n"name" = "岛"\n"center" = [0, 0]\n"halfSide" = [64, 64]\n[["pregen"."tile"]]\n"name" = "线"\n"polyline" = [[0, 0], [512, 0]]\n"halfWidth" = 32\n"exclude" = ["岛"]\n`;
    const w = parseDecl(baseDecl + extraToml, '甲');
    expect(w.pregen.tile.map((k) => k.shape)).toEqual(['矩形', '走廊']);
    const p = pregenPlans(w, '线')[0]!;
    expect(p.pattern).toBe('csv');
    expect(p.csvName).toMatch(/^anim-[0-9a-f]{10}$/);
    // 区块中心离 z = 0 不超过 32：cz = −3…1（中心 −40…24 里 |z| ≤ 32 的是 −24、−8、8、24），岛占了 cx −4…4
    expect(new Set(p.chunks!.map((c) => c[1]))).toEqual(new Set([-2, -1, 0, 1]));
    expect(p.chunks!.some(([cx]) => cx >= -4 && cx <= 4)).toBe(false);
    expect(p.chunks![0]![0]).toBeLessThan(p.chunks!.at(-1)![0]); // 沿折线从起点往终点排
    expect(() => parseDecl(baseDecl + extraToml.replace('"exclude" = ["岛"]', '"exclude" = ["海"]'), '甲')).toThrow(/没有这个矩形块/);
    expect(() => parseDecl(baseDecl + extraToml.replace('"name" = "线"', '"name" = "岛"'), '甲')).toThrow(/重名/);
    expect(() => parseDecl(baseDecl + extraToml.replace('"halfWidth" = 32', ''), '甲')).toThrow(/半宽/);
  });

  it('仓库里的世界声明都解析得了', () => {
    for (const worldName of listWorlds()) expect(() => parseDecl(fs.readFileSync(path.join(worldDir(), `${worldName}.toml`), 'utf8'), worldName)).not.toThrow();
  });
});
