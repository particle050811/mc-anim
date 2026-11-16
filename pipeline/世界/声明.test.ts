import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { worldDir, listWorlds, parseDecl } from './声明.ts';
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
