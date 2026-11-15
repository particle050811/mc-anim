// anim extract --register / --licenses：取材产物自动写资产表、资产锁，许可按 jar 继承（许可.ts）。
// 资产表是人写的 TOML，这里只做两种文本改动，别的行（注释、旧路径、说明）一字不动：
//   追加：新 id 在表尾加一条 [["资产"]]（表文件 = id 第一段，<类>.toml；配方写了「作品」的进 <作品根>/资产表/）；
//   改许可：已登记、许可是 LicenseRef-待定 的，只换那一条的「许可」行。
import fs from 'node:fs';
import path from 'node:path';
import { workAssetRegistryDir, assetRegistryDir, libName, type Visibility, type AssetEntry } from '../资产/资产表.ts';
import { importToStore, writeAssetLock, readAssetLock, workAssetLockPath, assetLockPath, fileSha256, type AssetLock } from '../资产/资产锁.ts';
import { withAudioMetadata } from '../资产/音频量.ts';
import type { SourcingEntry, SourcingManifest } from './清单.ts';
import { defaultParts, inheritLicense, licenseTable, pendingLicense, type InheritResult } from './许可.ts';

const quote = (s: string) => JSON.stringify(s);

/** 一条资产表条目的 TOML 文本（和 assets/registry 里现有的写法一样：id 裸键，中文键加引号） */
export const entryText = (e: Pick<AssetEntry, 'id' | '类别' | '来源' | '许可' | '可见性' | '说明'>) =>
  [
    '[["资产"]]',
    `id = ${quote(e.id)}`,
    `"类别" = ${quote(e.类别)}`,
    `"来源" = ${quote(e.来源)}`,
    `"许可" = ${quote(e.许可)}`,
    `"可见性" = ${quote(e.可见性)}`,
    ...(e.说明 ? [`"说明" = ${quote(e.说明)}`] : []),
  ].join('\n') + '\n';

/** 在资产表文本尾部追加几条（文件不存在时由调用方给表头） */
export const appendEntries = (raw: string, entries: Parameters<typeof entryText>[0][]) =>
  entries.reduce((t, e) => `${t.replace(/\n*$/, '\n')}\n${entryText(e)}`, raw);

/** 把表里 id 那一条的「许可」行换成新值；找不到那一条或那一条没有许可行就报错 */
export const setLicense = (raw: string, id: string, newLicense: string): string => {
  const sections = raw.split(/(?=^\[\["资产"\]\]$)/m);
  const i = sections.findIndex((b) => new RegExp(`^id = ${quote(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm').test(b));
  if (i < 0) throw new Error(`表里没有 id = ${quote(id)}`);
  const newBlock = sections[i]!.replace(/^"许可" = "[^"\n]*"$/m, `"许可" = ${quote(newLicense)}`);
  if (newBlock === sections[i] && !/^"许可" = /m.test(sections[i]!)) throw new Error(`「${id}」那一条没有 "许可" 行`);
  sections[i] = newBlock;
  return sections.join('');
};

const recipeName = (source: string) => /^提取:([^@]+)@/.exec(source)?.[1];

/** 一条资产按 jar 继承许可：部分取配方的「许可部分」，没写按类别 */
export const assetInheritLicense = (q: SourcingManifest, e: Pick<AssetEntry, '来源' | '类别'>, licenses = licenseTable(q.jars.values())): InheritResult => {
  const written = q.entryMap.get(recipeName(e.来源) ?? '')?.许可部分;
  const part = Array.isArray(written) ? written : written?.[e.类别];
  return inheritLicense(e.来源, part ?? defaultParts(e.类别), licenses);
};

export type LicenseFillResult = { fillable: { e: AssetEntry; 许可: string }[]; stillPending: { e: AssetEntry; missing: string[] }[] };

/** jars.toml 没记 sha256 的（资源索引）按本机文件现算前 12 位；文件不在返回 undefined */
export const localSha12 = (q: SourcingManifest, jarPath: (id: string) => string) => (id: string) => {
  const j = q.jars.get(id);
  if (j?.sha256) return j.sha256.slice(0, 12);
  try {
    return fileSha256(jarPath(id)).slice(0, 12);
  } catch {
    return undefined;
  }
};

/** 资产表里 许可 = LicenseRef-待定、来源是 提取: 的，按 jar 算出许可；不是提取来的（手工、派生）不碰 */
export const computeLicenseFills = (q: SourcingManifest, entries: Iterable<AssetEntry>, jarPath?: (id: string) => string): LicenseFillResult => {
  const licenses = licenseTable(q.jars.values(), jarPath && localSha12(q, jarPath));
  const r: LicenseFillResult = { fillable: [], stillPending: [] };
  for (const e of entries) {
    if (e.许可 !== pendingLicense || !e.来源.startsWith('提取:')) continue;
    const x = assetInheritLicense(q, e, licenses);
    if (x.许可) r.fillable.push({ e, 许可: x.许可 });
    else r.stillPending.push({ e, missing: x.missing });
  }
  return r;
};

/** 表文件路径：共用的 assets/registry/<表>，作品的 <作品根>/资产表/<表> */
const tablePath = (e: Pick<AssetEntry, 'side' | '表'>, workRoot: string) => path.join(e.side === '作品' ? workAssetRegistryDir(workRoot) : assetRegistryDir(), e.表);

/** 把 能补 的写回各自的表文件；返回改了哪些文件 */
export const writeLicenseFills = (fillable: LicenseFillResult['fillable'], workRoot: string): string[] => {
  const byFile = new Map<string, { id: string; 许可: string }[]>();
  for (const { e, 许可: license } of fillable) {
    const f = tablePath(e, workRoot);
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f)!.push({ id: e.id, 许可: license });
  }
  for (const [f, edits] of byFile) fs.writeFileSync(f, edits.reduce((t, x) => setLicense(t, x.id, x.许可), fs.readFileSync(f, 'utf8')), 'utf8');
  return [...byFile.keys()];
};

/**
 * 配方产物的来源串：提取:<名称>@<用到的各 jar sha256 前 12 位>；jars.toml 没记 sha 的（资源索引）现算本机文件。
 * 用到：脚本在产物来源里写了这件用到哪几个 jar 就只记那几个（一条配方读好几个 jar 时，一件产物往往只来自其中一个）；没写记「需要」的全部
 */
export const sourceString = (q: SourcingManifest, e: SourcingEntry, jarPath: (id: string) => string, usedIds: readonly string[] = e.需要) => {
  const sha = localSha12(q, jarPath);
  const shas = usedIds.map((id) => {
    if (!q.jars.has(id)) throw new Error(`「${e.名称}」需要的 ${id} 不在 jars.toml`);
    const x = sha(id);
    if (!x) throw new Error(`「${e.名称}」用到的 ${id} 不在本机（${jarPath(id)}），算不出 sha`);
    return x;
  });
  if (!shas.length) throw new Error(`「${e.名称}」没写「需要」，来源记不出 jar sha，手工登记`);
  return `提取:${e.名称}@${[...new Set(shas)].join('+')}`;
};

/** 产物来源里写的 jar 路径 → 配方「需要」里的 jar id；对不上的报错（脚本读了配方没声明的 jar） */
export const reverseLookupJar = (e: SourcingEntry, jarPath: (id: string) => string, paths: readonly string[]): string[] =>
  paths.map((p) => {
    const id = e.需要.find((i) => path.resolve(jarPath(i)) === path.resolve(p));
    if (!id) throw new Error(`「${e.名称}」的产物来源写了 ${p}，不是「需要」里哪个 jar（${e.需要.join('、')}）`);
    return id;
  });

/** --register 时写进资产表的可见性：配方写了就用；公开版 = 提取 的默认「提取」 */
export const recipeVisibility = (e: SourcingEntry): Visibility => {
  if (e.可见性) return e.可见性;
  if (e.公开版 === '提取') return '提取';
  throw new Error(`「${e.名称}」公开版不是「提取」，--register 不知道新产物的可见性：在配方里写 "可见性" = "发布" / "私有" / "公开"`);
};

export type PendingRegister = { id: string; 文件: string };
export type RegisterResult = { newRegistered: string[]; licenseFilled: string[]; stillPending: { id: string; missing: string[] }[]; lockAdded: string[]; tableFiles: string[] };

/**
 * 一条配方跑完后，把还没登记、没进锁的产物登记、入库、写锁。已经在锁里的不动（sha 不一样照旧只报告，换版本要人定）。
 * 产物来源：脚本写的 {文件: [jar 路径…]}（提取.ts 读产物来源），有就按件记来源、算许可。
 * 已在资产表登记、只是没进锁的，按它登记的那一侧写锁；新登记的按配方（写了「作品」进作品那侧）。共用表、锁默认在仓库里；测试传 目录 覆盖。
 */
export const registerArtifacts = (
  q: SourcingManifest,
  e: SourcingEntry,
  dir: string,
  artifacts: PendingRegister[],
  o: {
    workRoot: string;
    registered: Map<string, AssetEntry>;
    assetLock: AssetLock;
    jarPath: (id: string) => string;
    artifactSources?: Record<string, string[]>;
    sharedTableDir?: string;
    sharedLockPath?: string;
    dataRoot?: string;
    measureAudio?: boolean;
  },
): RegisterResult => {
  const r: RegisterResult = { newRegistered: [], licenseFilled: [], stillPending: [], lockAdded: [], tableFiles: [] };
  const lockPath = (side: '共用' | '作品') => (side === '作品' ? workAssetLockPath(o.workRoot) : (o.sharedLockPath ?? assetLockPath()));
  const recipeSide = e.作品 === undefined ? '共用' : '作品';
  const tableDir = recipeSide === '作品' ? workAssetRegistryDir(o.workRoot) : (o.sharedTableDir ?? assetRegistryDir());
  const unlocked = artifacts.filter((p) => !o.assetLock[p.id]);
  if (!unlocked.length) return r;
  const visibility = recipeVisibility(e);
  const licenses = licenseTable(q.jars.values(), localSha12(q, o.jarPath));
  const byFile = new Map<string, Parameters<typeof entryText>[0][]>();
  for (const p of unlocked) {
    if (o.registered.has(p.id)) continue;
    const usedIds = o.artifactSources?.[p.文件];
    const source = sourceString(q, e, o.jarPath, usedIds ? reverseLookupJar(e, o.jarPath, usedIds) : undefined);
    const category = p.id.split('/')[0]!;
    const x = assetInheritLicense(q, { 来源: source, 类别: category }, licenses);
    if (!x.许可) r.stillPending.push({ id: p.id, missing: x.missing });
    const f = path.join(tableDir, `${category}.toml`);
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f)!.push({ id: p.id, 类别: category, 来源: source, 许可: x.许可 ?? pendingLicense, 可见性: visibility, 说明: `anim extract --register 自动登记（${p.文件}）` });
    r.newRegistered.push(p.id);
  }
  for (const [f, entries] of byFile) {
    const tomlText = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : `# 资产表：${path.basename(f, '.toml')}。人写；anim extract --register 自动追加取材产物。\n# 字段和取值见 assets/README.md。\n`;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, appendEntries(tomlText, entries), 'utf8');
    r.tableFiles.push(f);
  }
  const locks = new Map<string, AssetLock>();
  for (const p of unlocked) {
    const registeredEntry = o.registered.get(p.id);
    const f = lockPath(registeredEntry?.side ?? recipeSide);
    if (!locks.has(f)) locks.set(f, readAssetLock(f));
    const file = path.join(dir, p.文件);
    const storedBytes = importToStore(file, libName(registeredEntry?.可见性 ?? visibility), o.dataRoot);
    locks.get(f)![p.id] = o.measureAudio === false ? storedBytes : withAudioMetadata(storedBytes, file);
    r.lockAdded.push(p.id);
  }
  for (const [f, assetLock] of locks) writeAssetLock(assetLock, f);
  return r;
};
