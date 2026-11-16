import { readModel, modelFileName, sectionFormatVersion } from '../../../engine/voxel/区段模型.ts';
// 资产：资产表字段齐全（许可是 SPDX 表达式）、资产表和资产锁一一对应、可见性私有的在 私有/ 库；
// 共用表锁（assets/）并上本作品的表锁（<作品>/资产表/、<作品>/资产锁/）：同一个 id 只登记在一侧，锁写在登记它的那一侧；
// 代码里 asset:、cue、台词表、角色包引用的 id 都已登记；段声明的地形包登记了版本；公开构建（渲染代码，私有作品自己的目录除外）的闭包里没有私有资产。
// 写了 随仓库.toml 的作品：字节/ 和按当前代码算的集合一一对上、逐件核 sha，私有的不在里面（分发/随仓库.ts）。
// 写了 随发布.toml 的作品：发布锁.json 和按当前代码算的该发的（字节、地形包）对上（分发/发布.ts）。
// 写了 材质包.toml 的作品：[段] 里的段键在清单里，每一种选用的覆盖层锁都建了、和现在登记的包对得上（资产/资产锁.ts 套材质包）。
// 粒子帧/ 下 anim extract --particle-frames 生成的模块和定义、配方、锁对得上（取材/粒子帧.ts）。
// --deep：逐个核对库里字节的 sha256 和大小，地形包按整包清单指纹核对。
import { decoderSourceStale } from '../../世界/区段解码器.ts';
import { packManifest } from '../../世界/版本.ts';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readContent, lineTablePath, readLineTable } from '../../源码/内容.ts';
import { isRenderCode, closure, type CheckReport, type CheckContext } from '../../源码/上下文.ts';
import { parseSource, walk, ts } from '../语法.ts';
import { mergeAssetRegistry, readAssetRegistry, type AssetSide, type AssetEntry } from '../../资产/资产表.ts';
import { workResourcePackTablePath, workResourcePackSelections, bytesPath, applyResourcePack, readResourcePackTable, type AssetLock } from '../../资产/资产锁.ts';
import { dataRoot as configDataRoot } from '../../环境/配置.ts';
import { compareBytes, computeRepoBundle, readRepoManifest, repoTableName, bytesDirName } from '../../分发/随仓库.ts';
import { compareReleaseLock, computeExpectedRelease, readReleaseManifest, releaseTableName } from '../../分发/发布.ts';
import { releaseLockName } from '../../分发/发布锁.ts';
import { lacksAudioMetadata } from '../../资产/补量.ts';
import { parseManifest } from '../../取材/清单.ts';
import { generatedFiles, buildSourceTable, checkParticleFrames } from '../../取材/粒子帧.ts';

/**
 * 搬来的代码还没改走 cue 的私有资产：import 那一行往上连着的 import 块顶上写一行「// 待迁移（私有资产）：原因」，算待迁移、不算违规。
 * 照旧项目 7d077904「规矩例外」注释的做法，标记就在代码里，不另开白名单；返回原因，没标就是 undefined
 */
export const pendingPrivateMigration = (sourceText: string, id: string): string | undefined => {
  const lines = sourceText.split('\n');
  const i = lines.findIndex((l) => /^import\s/.test(l) && (l.includes(`'asset:${id}'`) || l.includes(`"asset:${id}"`)));
  for (let j = i - 1; i >= 0 && j >= 0; j--) {
    const m = /^\/\/ 待迁移（私有资产）：(.+)$/.exec(lines[j]!.trim());
    if (m) return m[1];
    if (!/^import\s/.test(lines[j]!)) return undefined;
  }
  return undefined;
};

/** SPDX 许可表达式：id [WITH 例外] 用 AND/OR 和括号连。LicenseRef- 后面允许中文（用户自制的 LicenseRef-用户保留） */
export const isSpdxValid = (expression: string): boolean => {
  const tokens = expression.match(/\(|\)|[^\s()]+/g) ?? [];
  let i = 0;
  const isSpdxId = (t: string | undefined) => !!t && !['AND', 'OR', 'WITH', '(', ')'].includes(t) && (/^LicenseRef-[^\s()]+$/.test(t) || /^[A-Za-z0-9.+-]+$/.test(t));
  const checkItem = (): boolean => {
    if (tokens[i] === '(') {
      i++;
      if (!isLegal()) return false;
      return tokens[i++] === ')';
    }
    if (!isSpdxId(tokens[i])) return false;
    i++;
    if (tokens[i] === 'WITH') {
      i++;
      if (!isSpdxId(tokens[i])) return false;
      i++;
    }
    return true;
  };
  const isLegal = (): boolean => {
    if (!checkItem()) return false;
    while (tokens[i] === 'AND' || tokens[i] === 'OR') {
      i++;
      if (!checkItem()) return false;
    }
    return true;
  };
  return tokens.length > 0 && isLegal() && i === tokens.length;
};

/** 角色包里的 匹配：* 任意串（含 /），? 一个字符 */
export const globToRegex = (pattern: string) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);

const fileSha = (file: string) =>
  new Promise<string>((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject);
  });

/** 取区段包的模块（packDir 拼包的版本目录）：闭包里有它的段才会在渲染时取地形包 */
const sectionPackModule = 'engine/voxel/区段包位置.ts';

/** 文件里的字符串字面量（不含 import 来源） */
const stringLiterals = (c: CheckContext, p: string, stringsCache: Map<string, Set<string>>) => {
  let r = stringsCache.get(p);
  if (!r) {
    r = new Set();
    const sf = parseSource(p, c.读(p));
    walk(sf, (n) => {
      if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !ts.isImportDeclaration(n.parent) && !ts.isExportDeclaration(n.parent)) r!.add(n.text);
    });
    stringsCache.set(p, r);
  }
  return r;
};

/** 随仓库发的字节：没写 随仓库.toml 的作品不该有 字节/；写了的，字节/ 要和现算的集合一致 */
const checkRepoBundle = async (c: CheckContext, report: CheckReport, assetLock: AssetLock) => {
  const repoListPath = c.workPath(repoTableName);
  const bytesDir = c.workPath(bytesDirName);
  if (!c.exists(repoListPath)) {
    if (c.exists(bytesDir)) report.错(`有 ${bytesDir}/ 却没有 ${repoTableName}：随仓库发哪些段的字节要写在 ${repoListPath}（"段" = ["<段键或章>", …]）`, bytesDir);
    return;
  }
  let selectors: string[];
  try {
    selectors = readRepoManifest(c.读(repoListPath)).段;
  } catch (e) {
    report.错((e as Error).message.split('\n')[0]!, repoListPath);
    return;
  }
  const bundleSet = await computeRepoBundle(c, selectors);
  for (const q of bundleSet.issues) report.错(`随仓库：${q}`, repoListPath);
  if (bundleSet.issues.length) return;
  const r = compareBytes(bundleSet, c.absPath(c.workDir));
  const privateSha = new Map(Object.entries(assetLock).filter(([, l]) => l.库 === '私有').map(([id, l]) => [l.sha256, id]));
  const fixHint = '（anim assets vendor 照当前代码重写）';
  if (r.added.length) report.错(`${bytesDir}/ 缺 ${r.added.length} 件：${r.added.slice(0, 5).map((rel) => bundleSet.files.get(rel.split('/')[1]!)!.ids.join('、')).join('；')}${r.added.length > 5 ? ' 等' : ''}${fixHint}`, bytesDir);
  for (const rel of r.改) report.错(`${bytesDir}/${rel} 的内容 sha256 和文件名对不上${fixHint}`, `${bytesDir}/${rel}`);
  for (const rel of r.removed) {
    const privateAsset = privateSha.get(rel.split('/').at(-1)!);
    if (privateAsset) report.错(`${bytesDir}/${rel} 是私有资产「${privateAsset}」的字节，不能随仓库发${fixHint}`, `${bytesDir}/${rel}`);
    else report.错(`${bytesDir}/${rel} 多余：${repoTableName} 的段现在用不到，或不是 <sha 前两位>/<sha256>${fixHint}`, `${bytesDir}/${rel}`);
  }
  if (!r.added.length && !r.改.length && !r.removed.length) {
    report.infoLines.push(`随仓库：${bundleSet.segKeys.length} 段要的 ${r.fileCount} 件字节（${(r.大小 / 1e6).toFixed(1)} MB）都在 ${bytesDir}/、sha 对；私有不带 ${bundleSet.privateFiles.length} 件${bundleSet.privateLibItems.size ? `，私有/ 库的 ${bundleSet.privateLibItems.size} 件不随仓库（挂 Release 的才带）` : ''}`);
  }
};

/** 材质包.toml：[段] 的段键要在清单里；作品的 "包" 和 [段] 另选的每一种，覆盖层锁都要建了、对得上（不然渲到那一段才报错） */
const checkResourcePack = async (c: CheckContext, report: CheckReport, assetLock: AssetLock) => {
  const workRoot = c.absPath(c.workDir);
  const tablePath = c.workPath(path.basename(workResourcePackTablePath(workRoot)));
  if (!c.exists(tablePath)) return;
  let segKeys: string[];
  try {
    segKeys = [...(readResourcePackTable(workRoot)?.段.keys() ?? [])];
  } catch (e) {
    report.错((e as Error).message.split('\n')[0]!, tablePath);
    return;
  }
  const parsedContent = await readContent(c);
  if (!('错误' in parsedContent)) for (const k of segKeys) if (!parsedContent.segments.some((s) => s.键 === k)) report.错(`[段] 的「${k}」不是清单里的段键（写段键，不写段名、编号）`, tablePath);
  for (const packSelection of workResourcePackSelections(workRoot)) {
    try {
      applyResourcePack(assetLock, workRoot, packSelection);
    } catch (e) {
      report.错((e as Error).message, tablePath);
    }
  }
};

/** 挂 Release 发的：写了 随发布.toml 的，发布锁.json 要和现算的一致；没写的不该有发布锁 */
const checkReleaseBundle = async (c: CheckContext, report: CheckReport) => {
  const releaseListPath = c.workPath(releaseTableName);
  const lockFile = c.workPath(releaseLockName);
  if (!c.exists(releaseListPath)) {
    if (c.exists(lockFile)) report.错(`有 ${lockFile} 却没有 ${releaseTableName}`, lockFile);
    return;
  }
  let releaseTable;
  try {
    releaseTable = readReleaseManifest(c.读(releaseListPath));
  } catch (e) {
    report.错((e as Error).message, releaseListPath);
    return;
  }
  const expected = await computeExpectedRelease(c, releaseTable);
  for (const q of expected.issues) report.错(`随发布：${q}`, releaseListPath);
  if (expected.issues.length) return;
  const releaseLock = c.exists(lockFile) ? (JSON.parse(c.读(lockFile)) as Parameters<typeof compareReleaseLock>[0]) : undefined;
  const diffItems = compareReleaseLock(releaseLock, expected, releaseTable);
  for (const q of diffItems) report.错(`随发布：${q}（anim assets pack --upload 照当前代码重打、传上去）`, lockFile);
  if (!diffItems.length) report.infoLines.push(`随发布：${expected.段数} 段要的 ${expected.字节.length} 件字节、${expected.地形.length} 个地形包和 ${lockFile} 对得上${expected.私有库字节.length ? `（其中 私有/ 库 ${expected.私有库字节.length} 件）` : ''}${expected.privateFiles.length ? `；私有不发 ${expected.privateFiles.length} 件` : ''}`);
};

type TerrainTable = { 包?: Record<string, { 版本: string; 清单sha256?: string; 文件数?: number; 大小?: number; 许可?: string; 可见性?: string }> };

export const checkAssets = async (c: CheckContext, report: CheckReport) => {
  const tableDir: Record<AssetSide, string> = { 共用: 'assets/registry', 作品: c.workPath('资产表') };
  const lockFiles: Record<AssetSide, string> = { 共用: 'assets/资产锁', 作品: c.workPath('资产锁') };
  const sharedTable = readAssetRegistry(c.absPath(tableDir.共用));
  const workTable = readAssetRegistry(c.absPath(tableDir.作品), '作品');
  for (const q of sharedTable.issues) report.错(q, tableDir.共用);
  for (const q of workTable.issues) report.错(q, tableDir.作品);
  const tableLocation = (e: AssetEntry) => `${tableDir[e.side]}/${e.表}`;
  const { entryMap: entries, duplicates } = mergeAssetRegistry(sharedTable, workTable);
  for (const e of duplicates) report.错(`「${e.id}」在 ${tableLocation(sharedTable.entryMap.get(e.id)!)} 和 ${tableLocation(e)} 里都登记了（一个 id 只登记在一侧）`, tableLocation(e));
  const lockPair = c.assetLocks();
  const assetLock: AssetLock = { ...lockPair.作品, ...lockPair.共用 };
  const inBoth = new Set(Object.keys(lockPair.作品).filter((id) => id in lockPair.共用));
  for (const id of inBoth) report.错(`「${id}」在 ${lockFiles.共用} 和 ${lockFiles.作品} 里都有（一个 id 只写在登记它那一侧的锁里）`, lockFiles.作品);

  for (const e of entries.values()) {
    if (typeof e.许可 === 'string' && !isSpdxValid(e.许可)) report.错(`「${e.id}」的许可「${e.许可}」不是 SPDX 表达式（第三方照原协议，自制的 LicenseRef-用户保留，拿不准 LicenseRef-待定）`, tableLocation(e));
    const l = lockPair[e.side][e.id];
    if (!l) {
      // 写错了一侧的，下面按锁报一次就够
      if (!assetLock[e.id]) report.错(`「${e.id}」登记了但不在资产锁里（入库：anim assets add 或导入工具）`, tableLocation(e));
      // 反过来不查：用户 11-13 定全部公开，以前私有的可见性改了、字节留在 私有/ 库（搬库会让按 cue 现取的配乐改走打包、指纹全变），挂 Release 照发（docs/决策/0017-全部公开.md）
    } else if (e.可见性 === '私有' && l.库 !== '私有') report.错(`「${e.id}」可见性是私有，资产锁里却在 ${l.库} 库（私有的只进 私有/）`, lockFiles[e.side]);
  }
  for (const s of ['共用', '作品'] as const) {
    for (const [id, l] of Object.entries(lockPair[s])) {
      const e = entries.get(id);
      if (!e) report.错(`资产锁里的「${id}」没在资产表登记（资产锁是工具生成的，先登记再入库）`, lockFiles[s]);
      else if (e.side !== s && !inBoth.has(id)) report.错(`「${id}」登记在 ${tableLocation(e)}，资产锁却写在 ${lockFiles[s]}（anim assets add 写进登记它那一侧，重跑一次就挪过去）`, lockFiles[s]);
      if (!/^[0-9a-f]{64}$/.test(l.sha256) || !Number.isInteger(l.大小) || !['store', '私有'].includes(l.库)) report.错(`资产锁里「${id}」的 sha256、大小、库不完整`, lockFiles[s]);
    }
  }
  const unmeasured = Object.entries(assetLock).filter(([, l]) => lacksAudioMetadata(l)).map(([id]) => id);
  if (unmeasured.length) report.错(`${unmeasured.length} 件音频的锁里没有时长、峰值、响度（如 ${unmeasured.slice(0, 3).join('、')}）：anim assets measure 补上；anim cues 要用这些数`, lockFiles.共用);
  const pendingCount = [...entries.values()].filter((e) => e.许可 === 'LicenseRef-待定').length;
  if (pendingCount) report.infoLines.push(`${pendingCount} 件许可待定（见 assets/待确认.md）`);

  const findAsset = (id: string, where: string, file?: string): AssetEntry | undefined => {
    const e = entries.get(id);
    if (!e) report.错(`${where}引用的「${id}」没在资产表登记`, file);
    else if (!assetLock[id]) report.错(`${where}引用的「${id}」不在资产锁里`, file);
    return e;
  };

  // 代码里的 asset:。私有作品不进公开构建，它自己目录里的不查「公开构建无私有资产」（0004 用户 10-22 定）；engine/、库/ 照查
  const depGraph = await c.depGraph();
  if (depGraph.错误.length) report.错(`依赖图不全（打包失败 ${depGraph.错误.length} 处，见 结构），打不进包的文件里引的 asset: 和私有资产没查到，修好再跑一遍`);
  const privateWork = c.isWorkPrivate;
  if (privateWork) report.跳过.push(`${c.workDir} 被 .gitignore 挡住、是私有作品，它目录里 import 私有资产不查（不进公开构建）`);
  for (const [file, ids] of depGraph.资产) {
    for (const id of ids) {
      const e = findAsset(id, 'asset:', file);
      if (e?.可见性 === '私有' && isRenderCode(file) && !(privateWork && file.startsWith(`${c.workDir}/`))) {
        const privatePending = pendingPrivateMigration(c.读(file), id);
        if (privatePending) report.待(`${file} 还把私有资产 asset:${id} 打进包里（${privatePending}）`, file);
        else report.错(`公开构建的闭包里不能有私有资产：${file} import 了 asset:${id}（私有的走 cue，缺了按规矩降级或报错，不打进包）`, file);
      }
    }
  }

  // 区段解码器：改了 wasm/ 的源码没重编，解码的还是旧字节（不要求这台机器装 asc）
  if (c.exists('wasm/区段解码.ts') && decoderSourceStale(c.exists('engine/voxel/区段解码器.生成.ts') ? c.读('engine/voxel/区段解码器.生成.ts') : '', c.读('wasm/区段解码.ts'))) report.错('wasm/区段解码.ts 和 engine/voxel/区段解码器.生成.ts 记的源码 sha256 对不上：anim world decoder 重编', 'wasm/区段解码.ts');

  // 粒子帧：anim extract --particle-frames 生成的模块和粒子定义、配方、资产锁对得上（定义字节不在本机的只核头里记的 sha）
  if (generatedFiles(c.根, c.absPath(c.workDir)).length) {
    const sides = c.assetLocks();
    const q = parseManifest(c.读('sourcing/extract.toml'), c.读('sourcing/jars.toml'));
    const dataRoot = c.dataRoot ?? configDataRoot();
    for (const [f, detail] of checkParticleFrames(c.根, c.absPath(c.workDir), sides, buildSourceTable(q, { ...sides.共用, ...sides.作品 }), (e) => fs.readFileSync(bytesPath(e, dataRoot), 'utf8'))) {
      const relPath = path.relative(c.根, f).split(path.sep).join('/');
      report.错(`${relPath}：${detail}`, relPath);
    }
  }

  // 段声明的地形、cue 里的资产
  const terrainTable = (c.readJson('assets/地形版本.json') ?? {}) as TerrainTable;
  const parsedContent = await readContent(c);
  if (!('错误' in parsedContent)) {
    for (const s of parsedContent.segments) {
      for (const packName of s.definition?.地形 ?? []) if (!terrainTable.包?.[packName]) report.错(`${s.键} 用的地形包「${packName}」没在 assets/地形版本.json 登记`, s.段文件);
      for (const cue of s.definition?.声音 ?? []) if (cue.资产 !== undefined) findAsset(cue.资产, `${s.键} 第 ${cue.秒} 秒的 cue `, s.段文件);
    }
  }
  // 取了地形包的段（闭包里有 packDir）：闭包里写到的登记过的包名没在 段.地形 里，只提示。真读到时页面直接报错（engine/voxel/区段包位置.ts）；
  // 闭包里写到不等于会读（共用的 主世界地形.ts 带默认包名），报错的话段就收窄不了声明
  if (!('错误' in parsedContent) && !depGraph.错误.length) {
    const packNames = new Set(Object.keys(terrainTable.包 ?? {}));
    const stringsCache = new Map<string, Set<string>>();
    for (const s of parsedContent.segments) {
      if (!s.definition) continue;
      const entries = [`${s.目录}/画面.tsx`, s.段文件, ...(s.definition.叠层 ?? []).map((l) => `${s.目录}/${l.entry}`)].filter((p) => depGraph.edges.has(p));
      const reachableFiles = closure(depGraph, entries);
      if (!reachableFiles.has(sectionPackModule)) continue;
      const usedAssets = new Set<string>();
      for (const f of reachableFiles) if (/\.[cm]?[jt]sx?$/.test(f) && c.exists(f)) for (const t of stringLiterals(c, f, stringsCache)) if (packNames.has(t)) usedAssets.add(t);
      const missing = [...usedAssets].filter((packName) => !s.definition!.地形.includes(packName)).sort();
      if (missing.length) report.infoLines.push(`${s.键} 的闭包写到了 ${missing.join('、')}，段.ts 的 地形 里没有：真读到时渲染会报错`);
    }
  }
  for (const [packName, v] of Object.entries(terrainTable.包 ?? {})) {
    if (!v.版本 || !v.许可 || !v.可见性) report.错(`地形包「${packName}」要写 版本、许可、可见性`, 'assets/地形版本.json');
    else if (!isSpdxValid(v.许可)) report.错(`地形包「${packName}」的许可「${v.许可}」不是 SPDX 表达式`, 'assets/地形版本.json');
  }

  // 台词表的配音
  for (const t of readLineTable(c) ?? []) if (typeof t.配音 === 'string') findAsset(t.配音, `台词「${t.id}」的配音`, lineTablePath(c));

  // 角色包
  const ids = [...entries.keys()];
  for (const p of c.文件().filter((x) => /^assets\/kits\/[^/]+\.toml$/.test(x))) {
    let doc: Record<string, unknown>;
    try {
      doc = c.readToml(p)!;
    } catch (e) {
      report.错(`TOML 解析失败：${(e as Error).message.split('\n')[0]}`, p);
      continue;
    }
    const roleName = path.posix.basename(p, '.toml');
    if (doc['角色'] !== roleName) report.错(`角色 字段要和文件名一致（${roleName}）`, p);
    for (const b of (doc['基准'] ?? []) as { 资产?: string; 用途?: string }[]) if (typeof b.资产 === 'string') findAsset(b.资产, `角色包 ${roleName} 的基准「${b.用途}」`, p);
    for (const g of (doc['资产组'] ?? []) as { 资产?: string[]; 匹配?: string[]; 文字源?: string[]; 用途?: string }[]) {
      for (const id of g.资产 ?? []) findAsset(id, `角色包 ${roleName}「${g.用途}」`, p);
      for (const m of g.匹配 ?? []) if (!ids.some((id) => globToRegex(m).test(id))) report.错(`角色包 ${roleName}「${g.用途}」的匹配 ${m} 一件也没对上`, p);
      for (const f of g.文字源 ?? []) if (!c.exists(f)) report.错(`角色包 ${roleName}「${g.用途}」的文字源 ${f} 不在仓库里`, p);
    }
    for (const k of (doc['代码'] ?? []) as { 新位置?: string }[]) if (k.新位置 && !c.exists(k.新位置)) report.待(`角色包 ${roleName} 的代码 ${k.新位置} 还没搬`, p);
  }

  await checkResourcePack(c, report, assetLock);
  await checkRepoBundle(c, report, assetLock);
  await checkReleaseBundle(c, report);

  if (!c.deep) return;
  const dataRoot = c.dataRoot ?? configDataRoot();
  const checked = new Map<string, string | null>();
  for (const [id, l] of Object.entries(assetLock)) {
    const f = bytesPath(l, dataRoot);
    if (!checked.has(f)) checked.set(f, fs.existsSync(f) ? await fileSha(f) : null);
    const actualSha = checked.get(f);
    if (actualSha === null) report.错(`「${id}」的字节不在 ${f}`);
    else if (actualSha !== l.sha256) report.错(`「${id}」库里的字节 sha256 是 ${actualSha!.slice(0, 12)}，资产锁记的是 ${l.sha256.slice(0, 12)}`);
    else if (fs.statSync(f).size !== l.大小) report.错(`「${id}」库里的字节大小和资产锁不一致`);
  }
  for (const [packName, v] of Object.entries(terrainTable.包 ?? {})) {
    const dir = path.join(dataRoot, 'terrain', packName, v.版本);
    if (!fs.existsSync(dir)) {
      report.错(`地形包 ${packName}/${v.版本} 不在 ${dir}`);
      continue;
    }
    // 远景高度网格没有 .块，不属于区段格式；区段包必须带本包模型，不能靠机器上残留的全局表。
    const chunkFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.块'));
    if (chunkFiles.length) {
      try {
        const info = JSON.parse(fs.readFileSync(path.join(dir, '包.json'), 'utf8')) as { 版本: number };
        if (info.版本 !== sectionFormatVersion) throw new Error(`格式 ${info.版本} 不是现行格式 ${sectionFormatVersion}：anim world transcode`);
        readModel(fs.readFileSync(path.join(dir, modelFileName)));
        for (const f of chunkFiles) {
          const fd = fs.openSync(path.join(dir, f), 'r'), h = Buffer.alloc(8);
          try { fs.readSync(fd, h, 0, 8, 0); } finally { fs.closeSync(fd); }
          if (h.readUInt32LE(0) !== 0x4b51434d || h.readUInt32LE(4) !== sectionFormatVersion) throw new Error(`${f} 不是格式 ${sectionFormatVersion} 的块文件`);
        }
      } catch (e) { report.错(`地形包 ${packName}/${v.版本}：${(e as Error).message}`); }
    }
    const actual = await packManifest(dir);
    if (actual.清单sha256 !== v.清单sha256 || actual.文件数 !== v.文件数 || actual.大小 !== v.大小) {
      report.错(`地形包 ${packName}/${v.版本} 和 assets/地形版本.json 记的不一致（清单指纹 ${actual.清单sha256.slice(0, 12)}、${actual.文件数} 个文件、${actual.大小} 字节）`);
    }
  }
  report.infoLines.push(`深查：${checked.size} 个库对象、${Object.keys(terrainTable.包 ?? {}).length} 个地形包逐字节核过`);
};
