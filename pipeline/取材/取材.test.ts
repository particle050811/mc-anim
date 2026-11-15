import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listWorks } from '../环境/作品.ts';
import { readWorkAssetLock, readAssetLock, type AssetLock } from '../资产/资产锁.ts';
import { needsGate } from './mcai.ts';
import { checkArtifacts } from './提取.ts';
import { canRunDirectly, fillTemplate, expandArtifacts, expandSteps, parseManifest, readManifest, selectEntries, type ExpandEnv } from './清单.ts';

const manifestText = `
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
const jarText = `
[["Mojang"."客户端"]]
"id" = "a"
"到" = "缓存/a.jar"
[["Mojang"."映射"]]
"id" = "a-mappings"
"到" = "缓存/a.txt"
[["模组"]]
"id" = "b"
"到" = "mods/b.jar"
`;
const v: ExpandEnv = { jarPath: (id) => `/游戏/${id}.jar`, prismData: '/prism', scriptDir: '/仓库/sourcing/extract', workRoot: '/仓库/作品/乙作', python: 'python3', mcai: ['python3', '/仓库/mcai.py'] };

describe('取材清单', () => {
  const q = parseManifest(manifestText, jarText);

  it('读出条目、组、jar', () => {
    expect([...q.entryMap.keys()]).toEqual(['甲', '乙', '丙', '丁']);
    expect(q.entryMap.get('丁')?.作品).toBe('乙作');
    expect(q.jars.get('b')?.到).toBe('mods/b.jar');
    expect(q.jars.get('a-mappings')?.到).toBe('缓存/a.txt');
    expect(q.entryMap.get('乙')?.前置).toEqual(['甲']);
  });

  it('另批的 extract.<名>.toml 并进同一张表：名称、组不能重，只认 [[取材]] 和 [组]', () => {
    const extraFileText = `["组"]\n"录" = ["戊"]\n[["取材"]]\n"名称" = "戊"\n"要开游戏" = true\n"公开版" = "提取"\n"步骤" = [["python", "x.py"]]\n`;
    const q2 = parseManifest(manifestText, jarText, { 'extract.录制.toml': extraFileText });
    expect([...q2.entryMap.keys()]).toEqual(['甲', '乙', '丙', '丁', '戊']);
    expect(selectEntries(q2, ['录'], false).map((e) => e.名称)).toEqual(['戊']);
    expect(() => parseManifest(manifestText, jarText, { 'extract.x.toml': `[["取材"]]\n"名称" = "甲"\n` })).toThrow(/两条/);
    expect(() => parseManifest(manifestText, jarText, { 'extract.x.toml': `["组"]\n"一组" = []\n` })).toThrow(/已经有了/);
    expect(() => parseManifest(manifestText, jarText, { 'extract.x.toml': `["程序"]\n"a" = []\n` })).toThrow(/只认/);
  });

  it('--全部 只选有步骤、不用开游戏、不待迁移的，写了别的作品的不选；组按组里的先后', () => {
    expect(selectEntries(q, [], true).map((e) => e.名称)).toEqual(['甲', '丁']);
    expect(selectEntries(q, [], true, '甲作').map((e) => e.名称)).toEqual(['甲']);
    expect(selectEntries(q, [], true, '乙作').map((e) => e.名称)).toEqual(['甲', '丁']);
    expect(selectEntries(q, ['一组', '甲'], false).map((e) => e.名称)).toEqual(['乙', '甲']);
    expect(() => selectEntries(q, ['没有'], false)).toThrow('没有「没有」');
    expect(canRunDirectly(q.entryMap.get('丙')!)).toBe(false);
  });

  it('展开简称、占位符和 {输出}', () => {
    expect(fillTemplate('{jar:a,b}|{prism数据}/x|{脚本}/y.py|{作品根}/z', v)).toBe('/游戏/a.jar,/游戏/b.jar|/prism/x|/仓库/sourcing/extract/y.py|/仓库/作品/乙作/z');
    expect(expandSteps(q, q.entryMap.get('甲')!.步骤[0]!, v)).toEqual([
      'uv',
      'run',
      '/仓库/sourcing/extract/导出模型.py',
      '/游戏/a.jar,/游戏/b.jar',
      'out.png',
      { 输出: ['python3', 'x.py'] },
    ]);
    expect(expandSteps(q, q.entryMap.get('乙')!.步骤[0]!, v)).toEqual(['python3', '/仓库/mcai.py', 'mesh', 'out=src/乙.网格']);
    expect(() => expandSteps(q, q.entryMap.get('丙')!.步骤[0]!, v)).toThrow('ts');
  });

  it('产物的 <id 目录>/* 按资产锁里这一层的 id 展开，不跨层', () => {
    const assetLock = { '贴图/甲/x': {}, '贴图/甲/y': {}, '贴图/甲/深/z': {}, '贴图/甲乙': {} } as unknown as AssetLock;
    expect(expandArtifacts({ '贴图/甲/*': 'src/甲.贴图/*.png', '贴图/空/*': 'a/*.png' }, assetLock)).toEqual({
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
  const lockEntry = (s: string) => ({ sha256: sha(s), 大小: s.length, 库: 'store' as const, 后缀: '.png' });

  it('一样、不一样、缺、没登记的分开报，前置的产物也算', () => {
    const q = parseManifest(manifestText, jarText);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), '取材-'));
    const writeFile = (f: string, s: string) => {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.writeFileSync(path.join(dir, f), s);
    };
    writeFile('src/甲.贴图/x.png', 'X');
    writeFile('src/甲.贴图/y.png', '另一版');
    writeFile('src/多出来.txt', '?');
    const assetLock: AssetLock = { '贴图/甲/x': lockEntry('X'), '贴图/甲/y': lockEntry('Y'), '模型/甲': lockEntry('M') };
    const r = checkArtifacts(q, [q.entryMap.get('乙')!], dir, assetLock, false);
    expect(r.consistent).toEqual(['贴图/甲/x']);
    expect(r.mismatched.map((x) => x.id)).toEqual(['贴图/甲/y']);
    expect(r.missingFiles).toEqual([{ id: '模型/甲', 文件: 'src/甲.json' }]);
    expect(r.unregistered).toEqual(['src/多出来.txt']);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('仓库里的清单', () => {
  it('extract.toml、jars.toml 能读，「需要」都在 jars.toml，产物都在资产锁里（写了作品的在那部作品的锁里）', () => {
    const q = readManifest();
    const sharedLock = readAssetLock();
    const works = listWorks();
    for (const e of q.entryMap.values()) {
      const workRoot = e.作品 === undefined ? undefined : works.get(e.作品);
      if (e.作品 !== undefined) expect(workRoot, `${e.名称} 的作品 ${e.作品}`).toBeDefined();
      const assetLock = workRoot ? readWorkAssetLock(workRoot) : sharedLock;
      for (const i of e.需要) expect(q.jars.has(i), `${e.名称} 需要 ${i}`).toBe(true);
      for (const p of e.前置) expect(q.entryMap.has(p)).toBe(true);
      const { 对: pairs, 空: unmatched } = expandArtifacts(e.产物, assetLock);
      expect(unmatched, e.名称).toEqual([]);
      for (const [id] of [...pairs, ...Object.entries(e.输入)]) expect(assetLock[id], `${e.名称} 的 ${id}`).toBeDefined();
    }
  });
});

describe('anim mcai 过闸', () => {
  it('只有起游戏和编译过闸', () => {
    expect(needsGate(['game', 'start', 'world=片场'])).toBe(true);
    expect(needsGate(['build'])).toBe(true);
    expect(needsGate(['game', 'stop'])).toBe(false);
    expect(needsGate(['mesh', 'from=0,0,0'])).toBe(false);
  });
});
