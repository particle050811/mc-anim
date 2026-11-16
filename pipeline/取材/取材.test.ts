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
["program"]
"导出模型" = ["uv", "run", "{脚本}/导出模型.py"]
["group"]
"一组" = ["乙", "甲"]
[["sourcing"]]
"displayName" = "甲"
"requires" = ["a"]
"publicVersion" = "提取"
"steps" = [["导出模型", "{jar:a,b}", "out.png", { "output" = ["python", "x.py"] }]]
["sourcing"."artifacts"]
"贴图/甲/*" = "src/甲.贴图/*.png"
"模型/甲" = "src/甲.json"
[["sourcing"]]
"displayName" = "乙"
"prerequisites" = ["甲"]
"needsGame" = true
"publicVersion" = "不提取"
"steps" = [["mcai", "mesh", "out=src/乙.网格"]]
[["sourcing"]]
"displayName" = "丙"
"pendingMigration" = "还没搬"
"publicVersion" = "不提取"
"steps" = [["ts", "x.ts"]]
[["sourcing"]]
"displayName" = "丁"
"work" = "乙作"
"publicVersion" = "提取"
"steps" = [["python", "{脚本}/x.py", "{作品根}/文案.txt"]]
`;
const jarText = `
[["Mojang"."client"]]
"id" = "a"
"dest" = "缓存/a.jar"
[["Mojang"."mappings"]]
"id" = "a-mappings"
"dest" = "缓存/a.txt"
[["mods"]]
"id" = "b"
"dest" = "mods/b.jar"
`;
const v: ExpandEnv = { jarPath: (id) => `/游戏/${id}.jar`, prismData: '/prism', scriptDir: '/仓库/sourcing/extract', workRoot: '/仓库/作品/乙作', python: 'python3', mcai: ['python3', '/仓库/mcai.py'] };

describe('取材清单', () => {
  const q = parseManifest(manifestText, jarText);

  it('读出条目、组、jar', () => {
    expect([...q.entryMap.keys()]).toEqual(['甲', '乙', '丙', '丁']);
    expect(q.entryMap.get('丁')?.work).toBe('乙作');
    expect(q.jars.get('b')?.dest).toBe('mods/b.jar');
    expect(q.jars.get('a-mappings')?.dest).toBe('缓存/a.txt');
    expect(q.entryMap.get('乙')?.prerequisites).toEqual(['甲']);
  });

  it('另批的 extract.<名>.toml 并进同一张表：名称、组不能重，只认 [[取材]] 和 [组]', () => {
    const extraFileText = `["group"]\n"录" = ["戊"]\n[["sourcing"]]\n"displayName" = "戊"\n"needsGame" = true\n"publicVersion" = "提取"\n"steps" = [["python", "x.py"]]\n`;
    const q2 = parseManifest(manifestText, jarText, { 'extract.录制.toml': extraFileText });
    expect([...q2.entryMap.keys()]).toEqual(['甲', '乙', '丙', '丁', '戊']);
    expect(selectEntries(q2, ['录'], false).map((e) => e.displayName)).toEqual(['戊']);
    expect(() => parseManifest(manifestText, jarText, { 'extract.x.toml': `[["sourcing"]]\n"displayName" = "甲"\n` })).toThrow(/两条/);
    expect(() => parseManifest(manifestText, jarText, { 'extract.x.toml': `["group"]\n"一组" = []\n` })).toThrow(/已经有了/);
    expect(() => parseManifest(manifestText, jarText, { 'extract.x.toml': `["program"]\n"a" = []\n` })).toThrow(/只认/);
  });

  it('--all 只选有步骤、不用开游戏、不待迁移的，写了别的作品的不选；组按组里的先后', () => {
    expect(selectEntries(q, [], true).map((e) => e.displayName)).toEqual(['甲', '丁']);
    expect(selectEntries(q, [], true, '甲作').map((e) => e.displayName)).toEqual(['甲']);
    expect(selectEntries(q, [], true, '乙作').map((e) => e.displayName)).toEqual(['甲', '丁']);
    expect(selectEntries(q, ['一组', '甲'], false).map((e) => e.displayName)).toEqual(['乙', '甲']);
    expect(() => selectEntries(q, ['没有'], false)).toThrow('没有「没有」');
    expect(canRunDirectly(q.entryMap.get('丙')!)).toBe(false);
  });

  it('展开简称、占位符和 {输出}', () => {
    expect(fillTemplate('{jar:a,b}|{prism数据}/x|{脚本}/y.py|{作品根}/z', v)).toBe('/游戏/a.jar,/游戏/b.jar|/prism/x|/仓库/sourcing/extract/y.py|/仓库/作品/乙作/z');
    expect(expandSteps(q, q.entryMap.get('甲')!.steps[0]!, v)).toEqual([
      'uv',
      'run',
      '/仓库/sourcing/extract/导出模型.py',
      '/游戏/a.jar,/游戏/b.jar',
      'out.png',
      { output: ['python3', 'x.py'] },
    ]);
    expect(expandSteps(q, q.entryMap.get('乙')!.steps[0]!, v)).toEqual(['python3', '/仓库/mcai.py', 'mesh', 'out=src/乙.网格']);
    expect(() => expandSteps(q, q.entryMap.get('丙')!.steps[0]!, v)).toThrow('ts');
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
  const lockEntry = (s: string) => ({ sha256: sha(s), size: s.length, lib: 'store' as const, suffix: '.png' });

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
    expect(r.missingFiles).toEqual([{ id: '模型/甲', file: 'src/甲.json' }]);
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
      const workRoot = e.work === undefined ? undefined : works.get(e.work);
      if (e.work !== undefined) expect(workRoot, `${e.displayName} 的作品 ${e.work}`).toBeDefined();
      const assetLock = workRoot ? readWorkAssetLock(workRoot) : sharedLock;
      for (const i of e.requires) expect(q.jars.has(i), `${e.displayName} 需要 ${i}`).toBe(true);
      for (const p of e.prerequisites) expect(q.entryMap.has(p)).toBe(true);
      const { 对: pairs, 空: unmatched } = expandArtifacts(e.artifacts, assetLock);
      expect(unmatched, e.displayName).toEqual([]);
      for (const [id] of [...pairs, ...Object.entries(e.input)]) expect(assetLock[id], `${e.displayName} 的 ${id}`).toBeDefined();
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
