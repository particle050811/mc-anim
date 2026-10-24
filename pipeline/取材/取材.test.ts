import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 作品们 } from '../环境/作品.ts';
import { 读作品资产锁, 读资产锁, type 资产锁 } from '../资产/资产锁.ts';
import { 要过闸 } from './mcai.ts';
import { 核对产物 } from './提取.ts';
import { 可直接跑, 填, 展开产物, 展开步骤, 解析清单, 读清单, 选条目, type 展开环境 } from './清单.ts';

const 清单文本 = `
["程序"]
"导出模型" = ["uv", "run", "{脚本}/导出模型.py"]
["组"]
"一组" = ["乙", "甲"]
[["取材"]]
"名称" = "甲"
"需要" = ["a"]
"公开版" = "提取"
"步骤" = [["导出模型", "{jar:a,b}", "out.png", { "输出" = ["python", "x.py"] }]]
["取材"."产物"]
"贴图/甲/*" = "src/甲.贴图/*.png"
"模型/甲" = "src/甲.json"
[["取材"]]
"名称" = "乙"
"前置" = ["甲"]
"要开游戏" = true
"公开版" = "不提取"
"步骤" = [["mcai", "mesh", "out=src/乙.网格"]]
[["取材"]]
"名称" = "丙"
"待迁移" = "还没搬"
"公开版" = "不提取"
"步骤" = [["ts", "x.ts"]]
[["取材"]]
"名称" = "丁"
"作品" = "乙作"
"公开版" = "提取"
"步骤" = [["python", "{脚本}/x.py", "{作品根}/文案.txt"]]
`;
const jar文本 = `
[["Mojang"."客户端"]]
"id" = "a"
"到" = "缓存/a.jar"
[["模组"]]
"id" = "b"
"到" = "mods/b.jar"
`;
const v: 展开环境 = { jar路径: (id) => `/游戏/${id}.jar`, prism数据: '/prism', 脚本: '/仓库/sourcing/extract', 作品根: '/仓库/作品/乙作', python: 'python3', mcai: ['python3', '/仓库/mcai.py'] };

describe('取材清单', () => {
  const q = 解析清单(清单文本, jar文本);

  it('读出条目、组、jar', () => {
    expect([...q.条目.keys()]).toEqual(['甲', '乙', '丙', '丁']);
    expect(q.条目.get('丁')?.作品).toBe('乙作');
    expect(q.jars.get('b')?.到).toBe('mods/b.jar');
    expect(q.条目.get('乙')?.前置).toEqual(['甲']);
  });

  it('--全部 只选有步骤、不用开游戏、不待迁移的，写了别的作品的不选；组按组里的先后', () => {
    expect(选条目(q, [], true).map((e) => e.名称)).toEqual(['甲', '丁']);
    expect(选条目(q, [], true, '甲作').map((e) => e.名称)).toEqual(['甲']);
    expect(选条目(q, [], true, '乙作').map((e) => e.名称)).toEqual(['甲', '丁']);
    expect(选条目(q, ['一组', '甲'], false).map((e) => e.名称)).toEqual(['乙', '甲']);
    expect(() => 选条目(q, ['没有'], false)).toThrow('没有「没有」');
    expect(可直接跑(q.条目.get('丙')!)).toBe(false);
  });

  it('展开简称、占位符和 {输出}', () => {
    expect(填('{jar:a,b}|{prism数据}/x|{脚本}/y.py|{作品根}/z', v)).toBe('/游戏/a.jar,/游戏/b.jar|/prism/x|/仓库/sourcing/extract/y.py|/仓库/作品/乙作/z');
    expect(展开步骤(q, q.条目.get('甲')!.步骤[0]!, v)).toEqual([
      'uv',
      'run',
      '/仓库/sourcing/extract/导出模型.py',
      '/游戏/a.jar,/游戏/b.jar',
      'out.png',
      { 输出: ['python3', 'x.py'] },
    ]);
    expect(展开步骤(q, q.条目.get('乙')!.步骤[0]!, v)).toEqual(['python3', '/仓库/mcai.py', 'mesh', 'out=src/乙.网格']);
    expect(() => 展开步骤(q, q.条目.get('丙')!.步骤[0]!, v)).toThrow('ts');
  });

  it('产物的 <id 目录>/* 按资产锁里这一层的 id 展开，不跨层', () => {
    const 锁 = { '贴图/甲/x': {}, '贴图/甲/y': {}, '贴图/甲/深/z': {}, '贴图/甲乙': {} } as unknown as 资产锁;
    expect(展开产物({ '贴图/甲/*': 'src/甲.贴图/*.png', '贴图/空/*': 'a/*.png' }, 锁)).toEqual({
      对: [
        ['贴图/甲/x', 'src/甲.贴图/x.png'],
        ['贴图/甲/y', 'src/甲.贴图/y.png'],
      ],
      空: ['贴图/空/*'],
    });
  });
});

describe('核对产物', () => {
  const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
  const 条 = (s: string) => ({ sha256: sha(s), 大小: s.length, 库: 'store' as const, 后缀: '.png' });

  it('一样、不一样、缺、没登记的分开报，前置的产物也算', () => {
    const q = 解析清单(清单文本, jar文本);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), '取材-'));
    const 写 = (f: string, s: string) => {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.writeFileSync(path.join(dir, f), s);
    };
    写('src/甲.贴图/x.png', 'X');
    写('src/甲.贴图/y.png', '另一版');
    写('src/多出来.txt', '?');
    const 锁: 资产锁 = { '贴图/甲/x': 条('X'), '贴图/甲/y': 条('Y'), '模型/甲': 条('M') };
    const r = 核对产物(q, [q.条目.get('乙')!], dir, 锁, false);
    expect(r.一致).toEqual(['贴图/甲/x']);
    expect(r.不一致.map((x) => x.id)).toEqual(['贴图/甲/y']);
    expect(r.缺文件).toEqual([{ id: '模型/甲', 文件: 'src/甲.json' }]);
    expect(r.未登记).toEqual(['src/多出来.txt']);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('仓库里的清单', () => {
  it('extract.toml、jars.toml 能读，「需要」都在 jars.toml，产物都在资产锁里（写了作品的在那部作品的锁里）', () => {
    const q = 读清单();
    const 共用锁 = 读资产锁();
    const 们 = 作品们();
    for (const e of q.条目.values()) {
      const 根 = e.作品 === undefined ? undefined : 们.get(e.作品);
      if (e.作品 !== undefined) expect(根, `${e.名称} 的作品 ${e.作品}`).toBeDefined();
      const 锁 = 根 ? 读作品资产锁(根) : 共用锁;
      for (const i of e.需要) expect(q.jars.has(i), `${e.名称} 需要 ${i}`).toBe(true);
      for (const p of e.前置) expect(q.条目.has(p)).toBe(true);
      const { 对, 空 } = 展开产物(e.产物, 锁);
      expect(空, e.名称).toEqual([]);
      for (const [id] of [...对, ...Object.entries(e.输入)]) expect(锁[id], `${e.名称} 的 ${id}`).toBeDefined();
    }
  });
});

describe('anim mcai 过闸', () => {
  it('只有起游戏和编译过闸', () => {
    expect(要过闸(['game', 'start', 'world=片场'])).toBe(true);
    expect(要过闸(['build'])).toBe(true);
    expect(要过闸(['game', 'stop'])).toBe(false);
    expect(要过闸(['mesh', 'from=0,0,0'])).toBe(false);
  });
});
