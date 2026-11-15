// 随仓库发的字节（用户 10-25 定「这个渲片用到的贴图 音频都放上去」，见 docs/决策/0005-随仓库发字节.md）：
// <作品根>/字节/<sha 前两位>/<sha256> 只放 <作品根>/随仓库.toml 列的段渲片要用的非私有资产（用户点名的范围，不扩大），布局同数据根 store/，按内容寻址。
// 集合按当前代码现算：这些段的 画面、段.ts、设置.ts、作品外壳（和段指纹同一组入口）沿依赖图走到的 asset:，加 cue 里的资产、台词的配音，
// 加 anim film 自己要读的（音效起音；有台词时字幕卡的像素字）。可见性是私有的一律不带：私有配乐缺了换静音（资产/私有配乐.ts）。
// 字节在 私有/ 库、可见性已改成公开的（用户 11-13 定全部公开，库不搬，见 docs/决策/0017-全部公开.md）记进 私有库件：随仓库的 字节/ 只放 store 布局，不带它们，挂 Release 的带。
// 选了材质包的段按它的选用取字节（材质包.toml，资产锁.ts 套材质包）：带的是换过的那份；环境变量的试样不算。
// 同一个包里别的段（核对段等）import、又不在集合里的字节，公开仓库没有，打包时换成占位（资产/缺字节.ts）。
// anim assets vendor 照它重写 字节/（从数据根 store 拷、逐件核 sha），anim check 核对 字节/ 和集合一致；
// anim film/still/studio 开头 补字节：字节/ 里数据根 store/ 还没有的核过 sha 补进去（APFS 克隆，别的文件系统退成普通复制），已有的不动。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { closure, type CheckContext } from '../检查/上下文.ts';
import { readContent } from '../检查/内容.ts';
import { readLineTable } from '../检查/规则/台词.ts';
import { readAssetRegistryBoth } from './资产表.ts';
import { pixelFontAsset } from '../合成/字幕卡.ts';
import { hintMissingRelease } from './发布锁.ts';
import { bytesPath, applySwap, applyResourcePack, resourcePackSelectionKey, readResourcePackSelection, type AssetLock, type LockEntry } from './资产锁.ts';

export const repoTableName = '随仓库.toml';
export const bytesDirName = '字节';
export const bytesDir = (workRoot: string) => path.join(workRoot, bytesDirName);

const fileSha = (f: string) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const shaNamePattern = /^[0-9a-f]{64}$/;

/** 随仓库.toml：段 = [段键或章, …]（章写成字符串，如 "2"；「全部」是清单里的每一段） */
export const readRepoManifest = (text: string): { 段: string[] } => {
  const doc = parse(text) as { 段?: unknown };
  if (!Array.isArray(doc.段) || !doc.段.length || doc.段.some((x) => typeof x !== 'string' || !x)) throw new Error(`${repoTableName} 要写 "段" = ["<段键或章>", …]（章也写成字符串）`);
  return { 段: doc.段 as string[] };
};

export type BundledItem = { entry: LockEntry; ids: string[] };
export type BundleSet = {
  /** sha256 → 锁条目和引用它的 id（几个 id 同一份字节只放一份） */
  files: Map<string, BundledItem>;
  /** 用到了、但可见性是私有、不带的 id */
  privateFiles: string[];
  /** 字节在 私有/ 库、可见性不是私有的（旧私有改公开、按 cue 现取的配乐）：sha256 → 条目和 id；只挂 Release 发 */
  privateLibItems: Map<string, BundledItem>;
  /** 这些段声明的地形包（随仓库不带，挂 Release 的才发，见 资产/发布.ts） */
  地形: string[];
  /** 选中的段键 */
  segKeys: string[];
  issues: string[];
};

/** 按 随仓库.toml 的段现算要随仓库发的资产（用 anim check 的依赖图和纯模块执行结果） */
export const computeRepoBundle = async (c: CheckContext, selectors: string[]): Promise<BundleSet> => {
  const bundleSet: BundleSet = { files: new Map(), privateFiles: [], privateLibItems: new Map(), segKeys: [], 地形: [], issues: [] };
  const parsedContent = await readContent(c);
  if ('错误' in parsedContent) {
    bundleSet.issues.push(parsedContent.错误);
    return bundleSet;
  }
  const depGraph = await c.depGraph();
  if (depGraph.错误.length) bundleSet.issues.push(`依赖图不全（打包失败 ${depGraph.错误.length} 处），随仓库的集合算不全，先修好 anim check 的 结构`);
  // 「全部」= 清单里的每一段（用户 11-13 定全部公开，以后加章不用再改表）
  const matchesSeg = (s: { 键: string; 章: number | '核对' }, x: string) => x === '全部' || x === s.键 || x === String(s.章);
  for (const x of selectors) if (!parsedContent.segments.some((s) => matchesSeg(s, x))) bundleSet.issues.push(`${repoTableName} 的「${x}」没对上清单里的段（只认段键、章或「全部」）`);
  const lockPair = c.assetLocks();
  const workRoot = c.absPath(c.workDir);
  // 换用.toml 换过的 id 拿的是作品那件的字节（和打包一样，资产锁.ts 读作品资产锁），发的也得是那件
  const assetLock: AssetLock = applySwap({ ...lockPair.作品, ...lockPair.共用 }, workRoot);
  const entries = readAssetRegistryBoth(workRoot, c.absPath('assets/registry')).entryMap;
  const appliedCache = new Map<string, AssetLock | null>();
  /** 这一段的选用下的锁；覆盖层锁没建、过期的记成问题，返回 null */
  const segmentLock = (segKey: string) => {
    const packSelection = readResourcePackSelection(workRoot, '', '', segKey);
    const k = resourcePackSelectionKey(packSelection);
    if (!appliedCache.has(k)) {
      try {
        appliedCache.set(k, applyResourcePack(assetLock, workRoot, packSelection));
      } catch (e) {
        bundleSet.issues.push((e as Error).message);
        appliedCache.set(k, null);
      }
    }
    return appliedCache.get(k)!;
  };
  /** id → 用到它的段的锁（材质包按段选时同一个 id 在不同段可以是不同的字节） */
  const usedBy = new Map<string, Set<AssetLock>>();
  const addUse = (id: string, l: AssetLock) => usedBy.set(id, (usedBy.get(id) ?? new Set()).add(l));
  const voiceById = new Map((readLineTable(c) ?? []).map((t) => [t.id, t.配音]));
  let hasLine = false;
  for (const s of parsedContent.segments.filter((s) => selectors.some((x) => matchesSeg(s, x)))) {
    bundleSet.segKeys.push(s.键);
    if (!s.definition) {
      bundleSet.issues.push(`${s.键}：${s.错误 ?? '段.ts 读不出来'}`);
      continue;
    }
    const l = segmentLock(s.键);
    if (!l) continue;
    for (const terrainName of s.definition.地形) if (!bundleSet.地形.includes(terrainName)) bundleSet.地形.push(terrainName);
    const entries = [`${s.目录}/画面.tsx`, s.段文件, 'engine/段/设置.ts', c.workPath('index.ts'), ...(s.definition.叠层 ?? []).map((l) => `${s.目录}/${l.entry}`)];
    for (const f of closure(depGraph, entries.filter((p) => depGraph.edges.has(p)))) for (const id of depGraph.资产.get(f) ?? []) addUse(id, l);
    for (const cue of s.definition.声音 ?? []) {
      if (cue.资产 !== undefined) addUse(cue.资产, l);
      else {
        hasLine = true;
        const id = voiceById.get(cue.台词);
        if (id) addUse(id, l);
      }
    }
  }
  // 不经 cue 引用、直接按 id 读的：有台词时字幕卡的像素字
  if (hasLine && assetLock[pixelFontAsset]) addUse(pixelFontAsset, assetLock);
  bundleSet.地形.sort();
  for (const id of [...usedBy.keys()].sort()) {
    for (const l of usedBy.get(id)!) {
      const entry = l[id];
      if (!entry) {
        bundleSet.issues.push(`「${id}」不在资产锁里`);
        break;
      }
      if (entries.get(id)?.可见性 === '私有') {
        if (!bundleSet.privateFiles.includes(id)) bundleSet.privateFiles.push(id);
        continue;
      }
      const shaMap = entry.库 === '私有' ? bundleSet.privateLibItems : bundleSet.files;
      const existing = shaMap.get(entry.sha256);
      if (!existing) shaMap.set(entry.sha256, { entry, ids: [id] });
      else if (!existing.ids.includes(id)) existing.ids.push(id);
    }
  }
  return bundleSet;
};

/** 字节/ 下现有的文件：相对 字节/ 的正斜杠路径 → 绝对路径 */
const existingBytes = (dir: string): Map<string, string> => {
  const out = new Map<string, string>();
  const walk = (rel: string[]) => {
    for (const e of fs.readdirSync(path.join(dir, ...rel), { withFileTypes: true })) {
      if (e.isDirectory()) walk([...rel, e.name]);
      else out.set([...rel, e.name].join('/'), path.join(dir, ...rel, e.name));
    }
  };
  if (fs.existsSync(dir)) walk([]);
  return out;
};

/** 字节/ 里一件该在的相对路径 */
export const bytesRelPath = (sha: string) => `${sha.slice(0, 2)}/${sha}`;

export type CompareResult = { added: string[]; 改: string[]; removed: string[]; fileCount: number; 大小: number };

/** 字节/ 和集合比：缺的（添）、内容和文件名对不上的（改）、多余或放错位置的（删），都是相对 字节/ 的正斜杠路径 */
export const compareBytes = (bundleSet: BundleSet, workRoot: string): CompareResult => {
  const dir = bytesDir(workRoot);
  const existing = existingBytes(dir);
  const r: CompareResult = { added: [], 改: [], removed: [], fileCount: bundleSet.files.size, 大小: 0 };
  for (const [sha, { entry }] of bundleSet.files) {
    r.大小 += entry.大小;
    const rel = bytesRelPath(sha);
    if (!existing.has(rel)) r.added.push(rel);
    else if (fileSha(existing.get(rel)!) !== sha) r.改.push(rel);
  }
  for (const rel of existing.keys()) {
    const m = /^([0-9a-f]{2})\/([0-9a-f]{64})$/.exec(rel);
    if (!m || !bundleSet.files.has(m[2]!) || m[1] !== m[2]!.slice(0, 2)) r.removed.push(rel);
  }
  return r;
};

/**
 * 照集合重写 <作品根>/字节/：缺的从数据根 store 拷（先核 store 里那份的 sha），内容不对的重拷，多余的删掉。
 * 只查 = true 时不写，只返回要做的改动。数据根里缺字节就报错，列出全部缺的。
 */
export const writeRepoBundle = (bundleSet: BundleSet, workRoot: string, dataRoot: string, checkOnly = false): CompareResult => {
  const dir = bytesDir(workRoot);
  const r = compareBytes(bundleSet, workRoot);
  if (checkOnly) return r;
  const missingSources: string[] = [];
  const toCopy: { 源: string; 目标: string }[] = [];
  for (const rel of [...r.added, ...r.改]) {
    const sha = rel.split('/')[1]!;
    const { entry, ids } = bundleSet.files.get(sha)!;
    const sourcePath = bytesPath(entry, dataRoot);
    if (!fs.existsSync(sourcePath)) {
      missingSources.push(`${ids.join('、')}（${sourcePath}）`);
      continue;
    }
    const actualSha = fileSha(sourcePath);
    if (actualSha !== sha) throw new Error(`数据根里 ${ids.join('、')} 的字节 ${sourcePath} sha256 是 ${actualSha.slice(0, 12)}，资产锁记的是 ${sha.slice(0, 12)}（anim check --深 查一遍数据根）`);
    toCopy.push({ 源: sourcePath, 目标: path.join(dir, ...rel.split('/')) });
  }
  if (missingSources.length) throw new Error(`数据根里缺这些资产的字节，拷不进 字节/：\n  ${missingSources.join('\n  ')}`);
  for (const { 源: sourcePath, 目标: targetPath } of toCopy) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const tmp = `${targetPath}.写入中-${process.pid}`;
    try {
      fs.copyFileSync(sourcePath, tmp, fs.constants.COPYFILE_FICLONE);
      // 库里是只读的；进 Git 的文件照常可写（Windows 上改名盖不掉只读文件）
      fs.chmodSync(tmp, 0o644);
      fs.renameSync(tmp, targetPath);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
  for (const rel of r.removed) fs.rmSync(path.join(dir, ...rel.split('/')), { force: true });
  // 删空了的子目录
  if (fs.existsSync(dir)) for (const d of fs.readdirSync(dir)) if (fs.statSync(path.join(dir, d)).isDirectory() && !fs.readdirSync(path.join(dir, d)).length) fs.rmdirSync(path.join(dir, d));
  return r;
};

export type FillBytesResult = { copied: number; 共: number };

/**
 * 把 <作品根>/字节/ 里数据根 store/ 还没有的补进去：先核文件内容的 sha256 和文件名一致，不一致就报错（字节/ 被改坏或换行被改了）。
 * store 只增不改：已有的不动、不重核（anim check --深 核数据根）。先写临时名再改名，几个命令同时补也不会留下半个文件。
 */
export const fillBytes = (workRoot: string, dataRoot: string): FillBytesResult => {
  const dir = bytesDir(workRoot);
  const r: FillBytesResult = { copied: 0, 共: 0 };
  const parts = [...existingBytes(dir)];
  for (const [rel, sourcePath] of parts) {
    const [hashPrefix, digest, ...extraSegments] = rel.split('/');
    if (extraSegments.length || !digest || !shaNamePattern.test(digest) || hashPrefix !== digest.slice(0, 2)) throw new Error(`${sourcePath}：${bytesDirName}/ 里只放 <sha 前两位>/<sha256>（anim assets vendor 重写一遍）`);
  }
  for (const [rel, sourcePath] of parts) {
    const [hashPrefix, digest] = rel.split('/') as [string, string];
    r.共++;
    const targetPath = path.join(dataRoot, 'store', hashPrefix, digest);
    if (fs.existsSync(targetPath)) continue;
    const actualSha = fileSha(sourcePath);
    if (actualSha !== digest) throw new Error(`${sourcePath} 的内容 sha256 是 ${actualSha.slice(0, 12)}，和文件名对不上（字节/ 被改过？git 要按二进制检出，见 .gitattributes；或重新 clone）`);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const tmp = `${targetPath}.写入中-${process.pid}`;
    try {
      fs.copyFileSync(sourcePath, tmp, fs.constants.COPYFILE_FICLONE);
      fs.chmodSync(tmp, 0o444);
      try {
        fs.renameSync(tmp, targetPath);
      } catch (e) {
        // 别的命令同时补进了同一份（Windows 上改名盖不掉已有的只读文件）：内容寻址，有了就行
        if (!fs.existsSync(targetPath)) throw e;
      }
    } finally {
      fs.rmSync(tmp, { force: true });
    }
    r.copied++;
  }
  return r;
};

/** 补字节，补了才打一行；挂 Release 发的还没下，提示 anim assets pull */
export const fillBytesAndReport = (workRoot: string, dataRoot: string) => {
  const r = fillBytes(workRoot, dataRoot);
  hintMissingRelease(workRoot, dataRoot);
  if (r.copied) console.log(`从 ${path.relative(process.cwd(), bytesDir(workRoot)) || bytesDir(workRoot)} 补了 ${r.copied} 件字节进 ${path.join(dataRoot, 'store')}（共 ${r.共} 件，其余已有）`);
  return r;
};
