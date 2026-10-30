import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 世界目录, 列出世界, 解析声明 } from './声明.ts';
import { 预生成计划们 } from './预生成/计划.ts';

const 基 = `"名称" = "甲"\n"服务端" = "服"\n"维度" = "minecraft:overworld"\n`;

describe('世界声明', () => {
  it('包继承 烘焙.原点，默认套编辑、登记', () => {
    const w = 解析声明(`${基}["烘焙"]\n"原点" = [0, 64, 2048]\n[["烘焙"."包"]]\n"名" = "a"\n[["烘焙"."包"]]\n"名" = "b"\n"原点" = [2048, 64, 0]\n"登记" = false\n"套编辑" = false`, '甲');
    expect(w.包维度).toBe('主世界');
    expect(w.存档).toBe('甲');
    expect(w.包.map((b) => [b.名, b.原点.join(), b.套编辑, b.登记])).toEqual([
      ['a', '0,64,2048', true, true],
      ['b', '2048,64,0', false, false],
    ]);
  });

  it('原点不是 2048 的倍数、oy 不对、名称和文件名不一致都报错', () => {
    expect(() => 解析声明(`${基}["烘焙"]\n"原点" = [100, 64, 0]`, '甲')).toThrow(/2048/);
    expect(() => 解析声明(`${基}[["烘焙"."包"]]\n"名" = "a"\n"原点" = [0, 0, 0]`, '甲')).toThrow(/oy/);
    expect(() => 解析声明(基, '乙')).toThrow(/名称/);
  });

  it('预生成块：两角换成中心和半边，不是正方形的用 rectangle 和两个半径', () => {
    const w = 解析声明(`${基}[["预生成"."块"]]\n"名" = "k"\n"两角" = [-100, 0, 100, 50]`, '甲');
    const [k] = 预生成计划们(w);
    expect(k!.选区).toEqual({ 形状: 'rectangle', 中心: [0, 25], 半边: [100, 25] });
    expect(k!.步骤).toContainEqual(['chunky radius 100 25', 'Radius changed for x to']);
    expect(k!.步骤).toContainEqual(['chunky shape rectangle', 'Shape changed to rectangle']);
    expect(k!.区块数).toBe((2 * 7 + 1) * (2 * 2 + 1)); // 中心区块 (0, 1)，半径 ⌈100/16⌉ = 7、⌈25/16⌉ = 2
  });

  it('走廊：折线、半宽、去掉；去掉的不是矩形块、块重名都报错', () => {
    const 走 = `[["预生成"."块"]]\n"名" = "岛"\n"中心" = [0, 0]\n"半边" = [64, 64]\n[["预生成"."块"]]\n"名" = "线"\n"折线" = [[0, 0], [512, 0]]\n"半宽" = 32\n"去掉" = ["岛"]\n`;
    const w = 解析声明(基 + 走, '甲');
    expect(w.预生成.块.map((k) => k.形状)).toEqual(['矩形', '走廊']);
    const p = 预生成计划们(w, '线')[0]!;
    expect(p.图案).toBe('csv');
    expect(p.csv名).toMatch(/^anim-[0-9a-f]{10}$/);
    // 区块中心离 z = 0 不超过 32：cz = −3…1（中心 −40…24 里 |z| ≤ 32 的是 −24、−8、8、24），岛占了 cx −4…4
    expect(new Set(p.区块!.map((c) => c[1]))).toEqual(new Set([-2, -1, 0, 1]));
    expect(p.区块!.some(([cx]) => cx >= -4 && cx <= 4)).toBe(false);
    expect(p.区块![0]![0]).toBeLessThan(p.区块!.at(-1)![0]); // 沿折线从起点往终点排
    expect(() => 解析声明(基 + 走.replace('"去掉" = ["岛"]', '"去掉" = ["海"]'), '甲')).toThrow(/没有这个矩形块/);
    expect(() => 解析声明(基 + 走.replace('"名" = "线"', '"名" = "岛"'), '甲')).toThrow(/重名/);
    expect(() => 解析声明(基 + 走.replace('"半宽" = 32', ''), '甲')).toThrow(/半宽/);
  });

  it('仓库里的世界声明都解析得了', () => {
    for (const 名 of 列出世界()) expect(() => 解析声明(fs.readFileSync(path.join(世界目录(), `${名}.toml`), 'utf8'), 名)).not.toThrow();
  });
});
