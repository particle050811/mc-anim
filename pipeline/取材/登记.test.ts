import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encode } from 'fast-png';
import { describe, expect, it } from 'vitest';
import { readAssetRegistry } from '../资产/资产表.ts';
import { readAssetLock } from '../资产/资产锁.ts';
import { isSpdxValid } from '../检查/规则/资产.ts';
import { pixelSha, pixelsMatch } from './像素.ts';
import { reverseLookupJar, setLicense, sourceString, entryText, registerArtifacts, computeLicenseFills, appendEntries } from './登记.ts';
import { conjunction, inheritLicense, licenseTable, readJarLicense } from './许可.ts';
import { expandArtifactsById, expandArtifactsByFile, fillTemplate, parseManifest, readManifest } from './清单.ts';

const jarText = `
[["Mojang"."资源索引"]]
"id" = "索引"
"根" = "mc资源"
"到" = "indexes/5.json"
"旧sha256前缀" = ["aaaaaaaaaaaa"]
"许可" = { "代码" = "LicenseRef-Minecraft-EULA", "资源" = "LicenseRef-Minecraft-EULA" }
[["模组"]]
"id" = "机械"
"到" = "mods/c.jar"
"sha256" = "${'c'.repeat(64)}"
"许可" = { "代码" = "MIT", "资源" = "LicenseRef-All-Rights-Reserved" }
[["模组"]]
"id" = "暮色"
"到" = "mods/t.jar"
"sha256" = "${'d'.repeat(64)}"
"许可" = { "代码" = "LGPL-2.1-only", "资源" = "LicenseRef-待核-CC-BY-NC-SA", "声音" = "LicenseRef-All-Rights-Reserved" }
[["模组"]]
"id" = "旧写法"
"到" = "mods/o.jar"
"sha256" = "${'e'.repeat(64)}"
"许可" = "OSI"
`;
const manifestText = `
[["取材"]]
"名称" = "图"
"需要" = ["机械", "暮色"]
"公开版" = "提取"
"步骤" = [["python", "x.py"]]
["取材"."产物"]
"贴图/图/*" = "out/*.png"
[["取材"]]
"名称" = "实体"
"需要" = ["暮色"]
"公开版" = "提取"
"许可部分" = ["资源", "代码"]
"步骤" = [["python", "x.py"]]
`;
const q = parseManifest(manifestText, jarText);
const licenseMap = licenseTable(q.jars.values());

describe('许可按 jar 继承', () => {
  it('结构化字段；旧的一句话写法当成没定', () => {
    expect(q.jars.get('机械')?.许可).toEqual({ 代码: 'MIT', 资源: 'LicenseRef-All-Rights-Reserved' });
    expect(q.jars.get('旧写法')?.许可).toEqual({ 原文: 'OSI' });
    expect(() => readJarLicense({ 美术: 'MIT' })).toThrow('美术');
  });

  it('按类别取部分（音效取声音，没写声音退回资源），几个 jar 用 AND 合起来、去重', () => {
    expect(inheritLicense(`提取:x@${'c'.repeat(12)}`, ['声音'], licenseMap)).toEqual({ 许可: 'LicenseRef-All-Rights-Reserved', missing: [] });
    expect(inheritLicense(`提取:x@${'c'.repeat(12)}+${'d'.repeat(12)}`, ['声音'], licenseMap).许可).toBe('LicenseRef-All-Rights-Reserved');
    expect(inheritLicense(`提取:x@aaaaaaaaaaaa+${'c'.repeat(12)}`, ['资源'], licenseMap).许可).toBe('LicenseRef-Minecraft-EULA AND LicenseRef-All-Rights-Reserved');
  });

  it('有一个 jar 的那部分待核或不认识，就不给许可、说清卡在哪', () => {
    const r = inheritLicense(`提取:x@${'c'.repeat(12)}+${'d'.repeat(12)}`, ['资源'], licenseMap);
    expect(r.许可).toBeUndefined();
    expect(r.missing).toEqual(['暮色 的资源许可 LicenseRef-待核-CC-BY-NC-SA']);
    expect(inheritLicense(`提取:x@${'f'.repeat(12)}`, ['资源'], licenseMap).missing[0]).toContain('不是 jars.toml');
    expect(inheritLicense(`提取:x@${'e'.repeat(12)}`, ['资源'], licenseMap).missing[0]).toContain('原文：OSI');
    expect(inheritLicense('手工:画的', ['资源'], licenseMap).missing.length).toBe(1);
  });

  it('合取：带 OR 的加括号，结果是合法 SPDX', () => {
    const x = conjunction(['MIT', 'OFL-1.1 OR GPL-2.0-or-later', 'MIT']);
    expect(x).toBe('MIT AND (OFL-1.1 OR GPL-2.0-or-later)');
    expect(isSpdxValid(x)).toBe(true);
  });

  it('补许可只碰 待定 且 提取来的；配方的 许可部分 优先于类别', () => {
    const assetRow = (id: string, source: string, license = 'LicenseRef-待定') => ({ id, 类别: id.split('/')[0]!, 来源: source, 许可: license, 可见性: '提取' as const, 表: 'x.toml', side: '共用' as const });
    const r = computeLicenseFills(q, [
      assetRow('音效/a', `提取:图@${'c'.repeat(12)}`),
      assetRow('模型/b', `提取:实体@${'d'.repeat(12)}`),
      assetRow('贴图/c', '手工:画的'),
      assetRow('贴图/d', `提取:图@${'c'.repeat(12)}`, 'MIT'),
    ]);
    expect(r.fillable.map((x) => [x.e.id, x.许可])).toEqual([['音效/a', 'LicenseRef-All-Rights-Reserved']]);
    expect(r.stillPending.map((x) => x.e.id)).toEqual(['模型/b']);
  });
});

describe('资产表文本改动', () => {
  const tomlText = `# 头注释\n\n[["资产"]]\nid = "贴图/甲"\n"类别" = "贴图"\n"来源" = "手工:x"\n"许可" = "LicenseRef-待定"\n"可见性" = "提取"\n"旧路径" = "a/b.png"\n\n[["资产"]]\nid = "贴图/甲乙"\n"类别" = "贴图"\n"来源" = "手工:x"\n"许可" = "LicenseRef-待定"\n"可见性" = "提取"\n`;

  it('改许可只换那一条的许可行，别的不动', () => {
    const updated = setLicense(tomlText, '贴图/甲', 'MIT');
    expect(updated).toBe(tomlText.replace('"许可" = "LicenseRef-待定"', '"许可" = "MIT"'));
    expect(() => setLicense(tomlText, '贴图/没有', 'MIT')).toThrow('没有');
  });

  it('追加的条目读得回来', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), '登记-'));
    fs.writeFileSync(path.join(dir, '贴图.toml'), appendEntries(tomlText, [{ id: '贴图/丙', 类别: '贴图', 来源: '提取:图@cccccccccccc', 许可: 'MIT', 可见性: '提取', 说明: '说"明"' }]));
    const r = readAssetRegistry(dir);
    expect(r.issues).toEqual([]);
    expect(r.entryMap.get('贴图/丙')?.说明).toBe('说"明"');
    expect(r.entryMap.size).toBe(3);
    expect(entryText({ id: 'a/b', 类别: 'a', 来源: '手工:x', 许可: 'MIT', 可见性: '公开' })).not.toContain('说明');
    fs.rmSync(dir, { recursive: true });
  });
});

describe('--register', () => {
  it('锁里没有的产物登记进 <类>.toml、入库、写锁；已登记的不重复登记', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), '登记-'));
    const staging = path.join(root, '暂存');
    fs.mkdirSync(path.join(staging, 'out'), { recursive: true });
    fs.writeFileSync(path.join(staging, 'out/新.png'), 'PNG新');
    fs.writeFileSync(path.join(staging, 'out/旧.png'), 'PNG旧');
    const tableDir = path.join(root, 'registry');
    fs.mkdirSync(tableDir);
    const lockFile = path.join(root, '资产锁');
        const artifacts = expandArtifactsByFile(q.entryMap.get('图')!.产物, ['out/新.png', 'out/旧.png', 'out/深/x.png', 'other.txt']);
    expect(artifacts).toEqual([
      ['贴图/图/新', 'out/新.png'],
      ['贴图/图/旧', 'out/旧.png'],
    ]);
    const registered = new Map([['贴图/图/旧', { id: '贴图/图/旧', 类别: '贴图', 来源: '手工:x', 许可: 'MIT', 可见性: '私有' as const, 表: '贴图.toml', side: '共用' as const }]]);
    const r = registerArtifacts(q, q.entryMap.get('图')!, staging, artifacts.map(([id, file]) => ({ id, 文件: file })), {
      workRoot: path.join(root, '作品'),
      registered,
      assetLock: {},
      jarPath: () => '/没有',
      sharedTableDir: tableDir,
      sharedLockPath: lockFile,
      dataRoot: path.join(root, '数据'),
    });
    expect(r.newRegistered).toEqual(['贴图/图/新']);
    expect(r.stillPending.map((x) => x.id)).toEqual(['贴图/图/新']); // 暮色的资源待核
    const assetTable = readAssetRegistry(tableDir);
    expect(assetTable.issues).toEqual([]);
    expect(assetTable.entryMap.get('贴图/图/新')).toMatchObject({ 来源: `提取:图@${'c'.repeat(12)}+${'d'.repeat(12)}`, 许可: 'LicenseRef-待定', 可见性: '提取' });
    const assetLock = readAssetLock(lockFile);
    expect(Object.keys(assetLock)).toEqual(['贴图/图/新', '贴图/图/旧']);
    expect(assetLock['贴图/图/旧']!.库).toBe('私有'); // 照已登记的可见性
    expect(fs.existsSync(path.join(root, '数据', 'store', assetLock['贴图/图/新']!.sha256.slice(0, 2), assetLock['贴图/图/新']!.sha256))).toBe(true);
    fs.chmodSync(path.join(root, '数据', 'store', assetLock['贴图/图/新']!.sha256.slice(0, 2), assetLock['贴图/图/新']!.sha256), 0o644);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('{产物清单} 只在跑条目时有', () => {
    const v = { jarPath: (i: string) => i, prismData: '', scriptDir: '', workRoot: '', python: 'python3', mcai: [] };
    expect(fillTemplate('--按产物 {产物清单}', { ...v, 产物清单: '/数据/音效.json' })).toBe('--按产物 /数据/音效.json');
    expect(() => fillTemplate('{产物清单}', v)).toThrow('产物清单');
  });
});

describe('--new、产物来源', () => {
  const soundManifest = parseManifest(
    `
[["取材"]]
"名称" = "音"
"需要" = ["索引", "机械"]
"公开版" = "提取"
"步骤" = [["python", "x.py", "--按产物", "{产物清单}", "--来源", "{产物来源}"]]
["取材"."产物"]
"音效/*" = "src/音效/*.ogg"
"音效/表" = "src/音效/表.json"
`,
    jarText,
  );
  const soundEntry = soundManifest.entryMap.get('音')!;

  it('按id展开产物：通配换最后一段，精确的照写；多一层、对不上的进 不认', () => {
    expect(expandArtifactsById(soundEntry.产物, ['音效/block.x.1', '音效/表', '音效/深/y', '贴图/z', '音效/'])).toEqual({
      对: [
        ['音效/block.x.1', 'src/音效/block.x.1.ogg'],
        ['音效/表', 'src/音效/表.json'],
      ],
      unrecognized: ['音效/深/y', '贴图/z', '音效/'],
    });
  });

  it('{产物来源} 只在跑条目时有', () => {
    const v = { jarPath: (i: string) => i, prismData: '', scriptDir: '', workRoot: '', python: 'python3', mcai: [] };
    expect(fillTemplate('--来源 {产物来源}', { ...v, 产物来源: '/数据/音.json' })).toBe('--来源 /数据/音.json');
    expect(() => fillTemplate('{产物来源}', v)).toThrow('产物来源');
  });

  it('来源按件只记用到的 jar；没记 sha256 的资源索引按本机文件现算，许可照样认', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), '登记-'));
    const indexFile = path.join(root, 'indexes', '5.json');
    fs.mkdirSync(path.dirname(indexFile), { recursive: true });
    fs.writeFileSync(indexFile, '{"objects":{}}');
    const shortHash = crypto.createHash('sha256').update('{"objects":{}}').digest('hex').slice(0, 12);
    const jarPath = (id: string) => (id === '索引' ? indexFile : path.join(root, 'mods', `${id}.jar`));
    expect(reverseLookupJar(soundEntry, jarPath, [path.join(root, 'mods', '..', 'mods', '机械.jar')])).toEqual(['机械']);
    expect(() => reverseLookupJar(soundEntry, jarPath, ['/别处/x.jar'])).toThrow('不是「需要」里');
    expect(sourceString(soundManifest, soundEntry, jarPath)).toBe(`提取:音@${shortHash}+${'c'.repeat(12)}`);

    const staging = path.join(root, '暂存');
    fs.mkdirSync(path.join(staging, 'src/音效'), { recursive: true });
    fs.writeFileSync(path.join(staging, 'src/音效/a.ogg'), '原版');
    fs.writeFileSync(path.join(staging, 'src/音效/create.b.ogg'), '模组');
    const tableDir = path.join(root, 'registry');
    const lockFile = path.join(root, '资产锁');
        const r = registerArtifacts(
      soundManifest,
      soundEntry,
      staging,
      [
        { id: '音效/a', 文件: 'src/音效/a.ogg' },
        { id: '音效/create.b', 文件: 'src/音效/create.b.ogg' },
      ],
      {
        workRoot: path.join(root, '作品'),
        registered: new Map(),
        assetLock: {},
        jarPath,
        artifactSources: { 'src/音效/a.ogg': [indexFile], 'src/音效/create.b.ogg': [jarPath('机械')] },
        sharedTableDir: tableDir,
        sharedLockPath: lockFile,
        dataRoot: path.join(root, '数据'),
        measureAudio: false,
      },
    );
    expect(r.stillPending).toEqual([]);
    const assetTable = readAssetRegistry(tableDir).entryMap;
    expect(assetTable.get('音效/a')).toMatchObject({ 来源: `提取:音@${shortHash}`, 许可: 'LicenseRef-Minecraft-EULA' });
    expect(assetTable.get('音效/create.b')).toMatchObject({ 来源: `提取:音@${'c'.repeat(12)}`, 许可: 'LicenseRef-All-Rights-Reserved' });
    for (const x of Object.values(readAssetLock(lockFile))) fs.chmodSync(path.join(root, '数据', 'store', x.sha256.slice(0, 2), x.sha256), 0o644);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('已在作品资产表登记、只是没进锁的，写进作品那份锁', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), '登记-'));
    const staging = path.join(root, '暂存');
    fs.mkdirSync(path.join(staging, 'out'), { recursive: true });
    fs.writeFileSync(path.join(staging, 'out/作品的.png'), 'PNG');
    const workRoot = path.join(root, '作品');
    fs.mkdirSync(workRoot);
    const sharedLockPath = path.join(root, '资产锁');
        const registered = new Map([['贴图/图/作品的', { id: '贴图/图/作品的', 类别: '贴图', 来源: '手工:x', 许可: 'MIT', 可见性: '公开' as const, 表: '贴图.toml', side: '作品' as const }]]);
    const r = registerArtifacts(q, q.entryMap.get('图')!, staging, [{ id: '贴图/图/作品的', 文件: 'out/作品的.png' }], {
      workRoot,
      registered,
      assetLock: {},
      jarPath: () => '/没有',
      sharedTableDir: path.join(root, 'registry'),
      sharedLockPath,
      dataRoot: path.join(root, '数据'),
    });
    expect(r.newRegistered).toEqual([]);
    expect(Object.keys(readAssetLock(sharedLockPath))).toEqual([]);
    const workLock = readAssetLock(path.join(workRoot, '资产锁'));
    expect(Object.keys(workLock)).toEqual(['贴图/图/作品的']);
    fs.chmodSync(path.join(root, '数据', 'store', workLock['贴图/图/作品的']!.sha256.slice(0, 2), workLock['贴图/图/作品的']!.sha256), 0o644);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('许可表：没记 sha256 的按 现算 的前缀也认', () => {
    const altLicenseTable = licenseTable(q.jars.values(), (id) => (id === '索引' ? 'bbbbbbbbbbbb' : undefined));
    expect(inheritLicense('提取:x@bbbbbbbbbbbb', ['声音'], altLicenseTable).许可).toBe('LicenseRef-Minecraft-EULA');
    expect(inheritLicense('提取:x@bbbbbbbbbbbb', ['声音'], licenseMap).许可).toBeUndefined();
  });
});

describe('PNG 像素 sha', () => {
  const width = 3;
  const height = 2;
  const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);

  it('同样像素、不同编码（RGBA / RGB / 调色板 / 压缩级别）像素 sha 一样；改一个像素就不一样', () => {
    const a = encode({ width: width, height: height, data: rgba, channels: 4, depth: 8 });
    const rgb = new Uint8Array(width * height * 3).map((_, i) => rgba[Math.floor(i / 3) * 4 + (i % 3)]!);
    const b = encode({ width: width, height: height, data: rgb, channels: 3, depth: 8 }, { zlib: { level: 0 } });
    const c = encode({ width: width, height: height, data: new Uint8Array([0, 1, 2, 0, 1, 2]), channels: 1, depth: 8, palette: [[255, 0, 0], [0, 255, 0], [0, 0, 255]] });
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).not.toBe(0);
    expect(pixelsMatch(a, b)).toBe(true);
    expect(pixelSha(c)).toBe(pixelSha(a));
    const tampered = rgba.slice();
    tampered[0] = 254;
    expect(pixelsMatch(a, encode({ width: width, height: height, data: tampered, channels: 4, depth: 8 }))).toBe(false);
    expect(pixelSha(new TextEncoder().encode('不是 png'))).toBeNull();
  });
});

describe('仓库里的 jars.toml', () => {
  it('每个 jar 都写了结构化许可（代码、资源），值是 SPDX', () => {
    for (const j of readManifest().jars.values()) {
      expect(j.许可?.代码, `${j.id} 的代码许可`).toBeTruthy();
      expect(j.许可?.资源, `${j.id} 的资源许可`).toBeTruthy();
      for (const [k, v] of Object.entries(j.许可 ?? {})) if (k !== '原文' && k !== '依据') expect(isSpdxValid(v!), `${j.id} ${k} ${v}`).toBe(true);
    }
  });
});
