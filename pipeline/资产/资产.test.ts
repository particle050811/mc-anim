import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { esbuildAssetPlugin } from './esbuild插件.ts';
import { registerAsset } from './命令.ts';
import { readAssetRegistryBoth, readAssetRegistry } from './资产表.ts';
import { isValidId, importToStore, writeAssetLock, resolveAsset, readWorkAssetLock, readAssetLock, bytesPath, type LockEntry } from './资产锁.ts';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'anim-资产-'));

describe('资产锁', () => {
  it('一件一个文件：字段排序、缩进 2、末尾换行（和 Python sort_keys 一致）；读回来键按 id 排', () => {
    const d = path.join(tmp(), '资产锁');
    writeAssetLock({ 'b/乙': { 库: 'store', 后缀: '.png', 大小: 1, sha256: 'b'.repeat(64) }, 'b/甲/深': { sha256: 'a'.repeat(64), 大小: 2, 库: '私有', 后缀: '.wav' }, 'b-c/丙': { sha256: 'c'.repeat(64), 大小: 3, 库: 'store', 后缀: '.png' } }, d);
    const f = path.join(d, 'b', '甲', '深.json');
    const text = fs.readFileSync(f, 'utf8');
    expect(text).toBe(JSON.stringify({ sha256: 'a'.repeat(64), 后缀: '.wav', 大小: 2, 库: '私有' }, null, 2) + '\n');
    // 按 id 的码位排：'-' U+002D 在 '/' U+002F 前面（按文件路径排就会反过来）；乙 U+4E59 在 甲 U+7532 前面
    expect(Object.keys(readAssetLock(d))).toEqual(['b-c/丙', 'b/乙', 'b/甲/深']);
    const py = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', 'import json,sys; d=json.load(open(sys.argv[1],encoding="utf-8")); sys.stdout.buffer.write((json.dumps(d,sort_keys=True,ensure_ascii=False,indent=2)+"\\n").encode())', f], { encoding: 'utf8' });
    if (py.status === 0) expect(py.stdout).toBe(text);
  });

  it('写锁只动变了的文件：没变的不重写，删掉的连空目录一起删；整份一个文件的旧格式在就报错', () => {
    const root = tmp();
    const d = path.join(root, '资产锁');
    const lockEntry = (c: string) => ({ sha256: c.repeat(64), 大小: 1, 库: 'store' as const, 后缀: '.png' });
    writeAssetLock({ '贴图/甲': lockEntry('a'), '贴图/深/乙': lockEntry('b') }, d);
    const textureFile = path.join(d, '贴图', '甲.json');
    fs.utimesSync(textureFile, 0, 0);
    writeAssetLock({ '贴图/甲': lockEntry('a'), '音效/丙': lockEntry('c') }, d);
    expect(fs.statSync(textureFile).mtimeMs).toBe(0);
    expect(fs.existsSync(path.join(d, '贴图', '深'))).toBe(false);
    expect(Object.keys(readAssetLock(d))).toEqual(['贴图/甲', '音效/丙']);
    fs.writeFileSync(`${d}.json`, '{}');
    expect(() => readAssetLock(d)).toThrow(/旧资产锁/);
  });

  it('入库按 sha 放、同 sha 不重复写；查不到的 id 报出该跑的命令', () => {
    const root = tmp();
    const sourcePath = path.join(root, 'x.PNG');
    fs.writeFileSync(sourcePath, 'abc');
    const e = importToStore(sourcePath, 'store', root);
    expect(e).toMatchObject({ 大小: 3, 库: 'store', 后缀: '.png', sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' });
    expect(fs.readFileSync(bytesPath(e, root), 'utf8')).toBe('abc');
    expect(importToStore(sourcePath, 'store', root)).toEqual(e);
    expect(resolveAsset('核对/x', { '核对/x': e }, root).文件).toBe(bytesPath(e, root));
    expect(() => resolveAsset('核对/没有', {}, root)).toThrow(/anim assets add 核对\/没有/);
    expect(() => resolveAsset('核对/x', { '核对/x': { ...e, sha256: 'f'.repeat(64) } }, root)).toThrow(/字节不在/);
  });

  it('id 规则', () => {
    expect(isValidId('贴图/实体/九胡')).toBe(true);
    expect(isValidId('九胡')).toBe(false);
    expect(isValidId('贴图/有 空格')).toBe(false);
    expect(isValidId('贴图/a:b')).toBe(false);
  });
});

describe('资产表', () => {
  it('中文键要加引号；缺字段、取值不对、来源格式不对、重复 id 都报出来', () => {
    const d = tmp();
    fs.writeFileSync(
      path.join(d, '贴图.toml'),
      ['[["资产"]]', 'id = "贴图/甲"', '"类别" = "贴图"', '"来源" = "手工:画的"', '"许可" = "MIT"', '"可见性" = "公开"', '', '[["资产"]]', 'id = "贴图/乙"', '"类别" = "贴图"', '"来源" = "随便"', '"许可" = "MIT"', '"可见性" = "半公开"', '', '[["资产"]]', 'id = "贴图/丙"', '"类别" = "贴图"', '"来源" = "提取:网格图集@多个jar"', '"许可" = "MIT"', '"可见性" = "提取"', '', '[["资产"]]', 'id = "贴图/丁"', '"类别" = "贴图"', '"来源" = "提取:网格图集@0bdc89263616+56b71336d2b4"', '"许可" = "MIT"', '"可见性" = "提取"'].join('\n'),
    );
    fs.writeFileSync(path.join(d, '音效.toml'), ['[["资产"]]', 'id = "贴图/甲"', '"类别" = "音效"', '"来源" = "提取:原版音效@0123456789ab"', '"许可" = "MIT"', '"可见性" = "提取"'].join('\n'));
    const { entryMap, issues } = readAssetRegistry(d);
    expect(entryMap.get('贴图/甲')?.表).toBe('音效.toml');
    expect(issues).toEqual([
      '贴图.toml 的「贴图/乙」：可见性只能是 公开、提取、发布、私有',
      '贴图.toml 的「贴图/乙」：来源要写成 提取:<配方>@<jar sha256 前 12 位>[+…] / 手工:<说明> / 派生:<输入 sha>+<参数>',
      '贴图.toml 的「贴图/丙」：来源要写成 提取:<配方>@<jar sha256 前 12 位>[+…] / 手工:<说明> / 派生:<输入 sha>+<参数>',
      '音效.toml 的「贴图/甲」：id 和 贴图.toml 里的重复',
    ]);
  });

  it('仓库里的资产表没有问题、资产锁里的都登记了', () => {
    const { entryMap, issues } = readAssetRegistry();
    expect(issues).toEqual([]);
    for (const id of Object.keys(readAssetLock())) expect(entryMap.has(id)).toBe(true);
  });
});

const assetToml = (id: string, visibility = '公开') => ['[["资产"]]', `id = "${id}"`, `"类别" = "${id.split('/')[0]}"`, '"来源" = "手工:测试"', '"许可" = "MIT"', `"可见性" = "${visibility}"`].join('\n');

/** 一个临时的共用侧（资产表目录、资产锁）、一部作品（作品根下 资产表/、资产锁/）和数据根 */
const makeSides = (sharedEntries: string[], workEntries: string[]) => {
  const d = tmp();
  const sharedTableDir = path.join(d, 'registry');
  const workRoot = path.join(d, '作品', '示例');
  fs.mkdirSync(sharedTableDir, { recursive: true });
  fs.mkdirSync(path.join(workRoot, '资产表'), { recursive: true });
  fs.writeFileSync(path.join(sharedTableDir, '贴图.toml'), sharedEntries.join('\n\n'));
  fs.writeFileSync(path.join(workRoot, '资产表', '配乐.toml'), workEntries.join('\n\n'));
  const sharedLockPath = path.join(d, '资产锁');
  writeAssetLock({ '贴图/共用甲': { sha256: 'a'.repeat(64), 大小: 1, 库: 'store', 后缀: '.png' } }, sharedLockPath);
  const sourcePath = path.join(d, '曲.m4a');
  fs.writeFileSync(sourcePath, '曲子');
  return { sharedTableDir, workRoot, sharedLockPath, dataRoot: path.join(d, '数据'), 源: sourcePath };
};

describe('作品资产表', () => {
  it('共用表并上作品资产表：条目记着在哪一侧，两侧都登记的 id 进 重复', () => {
    const t = makeSides([assetToml('贴图/共用甲'), assetToml('配乐/撞名')], [assetToml('配乐/曲', '私有'), assetToml('配乐/撞名')]);
    const { entryMap, duplicates } = readAssetRegistryBoth(t.workRoot, t.sharedTableDir);
    expect(entryMap.get('贴图/共用甲')?.side).toBe('共用');
    expect(entryMap.get('配乐/曲')).toMatchObject({ side: '作品', 表: '配乐.toml', 可见性: '私有' });
    expect(entryMap.get('配乐/撞名')?.side).toBe('共用');
    expect(duplicates.map((e) => e.id)).toEqual(['配乐/撞名']);
    // 作品没有 资产表/ 就只有共用的
    expect([...readAssetRegistryBoth(path.join(t.workRoot, '没有'), t.sharedTableDir).entryMap.keys()]).toEqual(['贴图/共用甲', '配乐/撞名']);
  });

  it('assets add：作品资产表登记的只写作品的锁，共用锁一个字节不变；共用表登记的写共用锁', () => {
    const t = makeSides([assetToml('贴图/共用甲'), assetToml('贴图/共用乙')], [assetToml('配乐/曲', '私有')]);
    const sharedAssetFile = path.join(t.sharedLockPath, '贴图', '共用甲.json');
    const sharedLockOriginal = fs.readFileSync(sharedAssetFile);
    const r = registerAsset('配乐/曲', t.源, t);
    expect(r.lockFile).toBe(path.join(t.workRoot, '资产锁'));
    expect(readAssetLock(r.lockFile)).toEqual({ '配乐/曲': r.entry });
    expect(r.entry.库).toBe('私有');
    expect(fs.existsSync(bytesPath(r.entry, t.dataRoot))).toBe(true);
    expect(fs.readdirSync(t.sharedLockPath, { recursive: true })).toEqual(['贴图', path.join('贴图', '共用甲.json')]);
    expect(fs.readFileSync(sharedAssetFile)).toEqual(sharedLockOriginal);

    const pngPath = path.join(path.dirname(t.源), '图.png');
    fs.writeFileSync(pngPath, 'png');
    const r2 = registerAsset('贴图/共用乙', pngPath, t);
    expect(r2.lockFile).toBe(t.sharedLockPath);
    expect(Object.keys(readAssetLock(t.sharedLockPath))).toEqual(['贴图/共用乙', '贴图/共用甲']);
    expect(Object.keys(readAssetLock(r.lockFile))).toEqual(['配乐/曲']);
  });

  it('assets add：没登记、两侧都登记报错；sha 变了要 --replace；登记换了一侧，锁跟着挪', () => {
    const t = makeSides([assetToml('贴图/共用甲'), assetToml('配乐/撞名')], [assetToml('配乐/撞名'), assetToml('贴图/共用甲')]);
    expect(() => registerAsset('配乐/没有', t.源, t)).toThrow(/资产表里没有「配乐\/没有」.*<作品根>\/资产表/);
    expect(() => registerAsset('配乐/撞名', t.源, t)).toThrow(/在共用表和作品资产表里都登记了/);

    // 贴图/共用甲 原来在共用锁；现在只登记在作品资产表
    fs.writeFileSync(path.join(t.sharedTableDir, '贴图.toml'), '');
    expect(() => registerAsset('贴图/共用甲', t.源, t)).toThrow(/已有另一份.*--replace/);
    const r = registerAsset('贴图/共用甲', t.源, { ...t, replace: true });
    expect(r.movedFrom).toBe(t.sharedLockPath);
    expect(readAssetLock(t.sharedLockPath)).toEqual({});
    expect(Object.keys(readAssetLock(r.lockFile))).toEqual(['贴图/共用甲']);
  });

  it('打包用的锁：共用锁并上作品锁，同一个 id 两边都有报错', () => {
    const workRoot = tmp();
    const sharedLock = readAssetLock();
    expect(readWorkAssetLock(workRoot)).toEqual(sharedLock);
    writeAssetLock({ '配乐/只在作品': { sha256: 'c'.repeat(64), 大小: 1, 库: '私有', 后缀: '.m4a' } }, path.join(workRoot, '资产锁'));
    expect(readWorkAssetLock(workRoot)['配乐/只在作品']?.库).toBe('私有');
    const clashKey = Object.keys(sharedLock)[0]!;
    writeAssetLock({ [clashKey]: sharedLock[clashKey]! }, path.join(workRoot, '资产锁'));
    expect(() => readWorkAssetLock(workRoot)).toThrow(/在共用锁和 .* 里都有/);
  });

  it('换用.toml：这部作品里共用 id 换成作品那件的字节；换用 = false 是没换的；右边没登记、写法不对报错', () => {
    const workRoot = tmp();
    const sharedLock = readAssetLock();
    const originalId = Object.keys(sharedLock).find((id) => sharedLock[id]!.后缀 === '.png')!;
    const lockEntry: LockEntry = { sha256: 'd'.repeat(64), 大小: 2, 库: '私有', 后缀: '.png' };
    fs.writeFileSync(path.join(workRoot, '换用.toml'), `# 说明\n"${originalId}" = "贴图/附加/甲"  # 行尾注释\n`);
    expect(() => readWorkAssetLock(workRoot)).toThrow(/贴图\/附加\/甲 不在资产锁里/);
    writeAssetLock({ '贴图/附加/甲': lockEntry }, path.join(workRoot, '资产锁'));
    expect(readWorkAssetLock(workRoot)[originalId]).toEqual(lockEntry);
    expect(readWorkAssetLock(workRoot, undefined, false)[originalId]).toEqual(sharedLock[originalId]);
    fs.writeFileSync(path.join(workRoot, '换用.toml'), `${originalId} = 贴图/附加/甲\n`);
    expect(() => readWorkAssetLock(workRoot)).toThrow(/认不出/);
  });
});

describe('esbuild 的 asset: 解析', () => {
  it('记下用到的 id 和 sha；锁里没有就构建失败', async () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, 'a.ts'), "import x from 'asset:核对/甲'; console.log(x);");
    const assetRecord = new Map<string, string>();
    const assetLock = { '核对/甲': { sha256: 'a'.repeat(64), 大小: 1, 库: 'store' as const, 后缀: '.png' } };
    await build({ entryPoints: [path.join(d, 'a.ts')], bundle: true, write: false, logLevel: 'silent', plugins: [esbuildAssetPlugin(assetLock, assetRecord)] });
    expect([...assetRecord]).toEqual([['核对/甲', 'a'.repeat(64)]]);
    fs.writeFileSync(path.join(d, 'b.ts'), "import x from 'asset:核对/乙'; console.log(x);");
    await expect(build({ entryPoints: [path.join(d, 'b.ts')], bundle: true, write: false, logLevel: 'silent', plugins: [esbuildAssetPlugin(assetLock, assetRecord)] })).rejects.toThrow(
      /资产锁里没有「核对\/乙」.*anim assets add/,
    );
  });
});
