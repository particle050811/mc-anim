import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 世界目录, 列出世界, 解析声明 } from './声明.ts';
import { 预生成计划们 } from './预生成.ts';

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

  it('预生成块：两角换成中心和半边', () => {
    const w = 解析声明(`${基}[["预生成"."块"]]\n"名" = "k"\n"两角" = [-100, 0, 100, 50]`, '甲');
    const [k] = 预生成计划们(w);
    expect(k!.中心).toEqual([0, 25]);
    expect(k!.半边).toEqual([100, 25]);
    expect(k!.命令).toContain('chunky radius 100 25');
  });

  it('仓库里的世界声明都解析得了', () => {
    for (const 名 of 列出世界()) expect(() => 解析声明(fs.readFileSync(path.join(世界目录(), `${名}.toml`), 'utf8'), 名)).not.toThrow();
  });
});
