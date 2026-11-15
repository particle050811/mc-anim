// anim cache gc 的整份计划（扫数据根、各检出的 webpack 缓存，算保留集）和执行。规则见 回收.ts 文件头。
import fs from 'node:fs';
import path from 'node:path';
import { codeRoot, mainCheckout } from '../环境/路径.ts';
import { listWorks } from '../环境/作品.ts';
import { config, dataRoot, dataPath, masterDir, draftRoot, runDir } from '../环境/配置.ts';
import { runCapture } from '../环境/子进程.ts';
import { scanBundles, bundleKeepReasons } from './打包.ts';
import { 读进程 } from '../闸/孤儿.ts';
import { removeBundles } from '../渲/打包残留.ts';
import { addCurrentFingerprints } from './当前指纹.ts';
import { referenceFileLookup } from './钉.ts';
import { findDuplicates, executeDedup, readLedger, writeLedger, canClone, type DedupGroup, type DedupLedger } from './去重.ts';
import { ShaCache } from './sha缓存.ts';
import {
  KeepSet, addDelivery, addApprovals, unrecognizedEntries, listDir, scanMedia, scanWebpack, latestModifiedAt, dirSize, isLockHeld, planMedia, planTemp, planDrafts, planWebpack, planStaging, scanStaging,
  type WithReasons, type MediaFile, type PlainFile, type DirEntry, type WebpackEntry,
} from './回收.ts';

export const reclaimKinds = ['母版', '残留', '草稿', '列段', 'webpack', '去重'] as const;
export type ReclaimClass = (typeof reclaimKinds)[number];

export type ReclaimOptions = {
  /** 母版、去重只看这几部作品；空是全部（cache/ 下有、代码里没有的作品整个留着） */
  作品: string[];
  类: ReadonlySet<ReclaimClass>;
  recentDays: number;
  draftDays: number;
  webpackDays: number;
  columnSegDays: number;
  now: number;
};
// 列段重解存档要几分钟到几十分钟，留得比草稿久
export const defaultDays = { recent: 2, draftDays: 14, webpack: 3, columnSeg: 90 };

export type WebpackRootPlan = { 根: string; currentVersion: string | null; entryList: WithReasons<WebpackEntry>[] };
export type ReclaimPlan = {
  media: WithReasons<MediaFile>[];
  tempFiles: WithReasons<PlainFile>[];
  drafts: WithReasons<DirEntry>[];
  columnSegs: WithReasons<DirEntry>[];
  webpack: WebpackRootPlan[];
  /** 地形烘焙中断留下的暂存目录（run/暂存/terrain/<包>），归在「残留」一类 */
  staging: WithReasons<DirEntry>[];
  打包: WithReasons<DirEntry>[];
  /** 认得、但不自动删的（只报大小和用途） */
  reportOnly: { 位置: string; 用途: string; 大小: number }[];
  /** 只报告不删 */
  unknownGroups: { 位置: string; entryList: DirEntry[] }[];
  dedupePlan: { 组: DedupGroup[]; ledger: DedupLedger; canDedupe: boolean; sha: ShaCache['统计'] } | null;
  警告: string[];
};

/**
 * 认得、不自动删的缓存和它们的用途（gc 只报大小）。删了能重建，但要么本来就小、要么是人留的对照。
 */
export const reportOnlyDirs: Record<string, string> = {
  'cache/temperature': '芯片温度探针及失败冷却标记（按架构和源码 sha 命名，删了下次重编）',
  'cache/音频数': '音频时长、峰值、响度（按 sha 寻址，anim cues 用）',
  'cache/核对': '迁移时新旧画面的对照图（人看的，不自动删）',
  'cache/映射': '官方映射等本机自取、不许再分发的文件（anim extract 用，删了下次按 jars.toml 重下）',
  'cache/动作翻译映射': '动作翻译早先临时下的官方映射（新的进 cache/映射/，1.21.11 的还靠这份）',
  'cache/浏览器': '渲染用的 chrome-headless-shell，按 Remotion 期望版本一个目录（现用那版渲染都用，删了下次渲染从 node_modules 克隆或重下）；旧版留给 anim bench --browser 做对照',
};

/** 数据根 run/、cache/ 下 anim 认得的条目（别的只报告） */
export const runKnownNames = ['草稿', '运行记录', 'logs', 'locks', 'queue', 'public', 'extract', '暂存', '地形用量', '逐帧校验', '调度'];
export const cacheKnownNames = [
  '母版', '求解', '私有配乐', '剪映解密', '发布', '缺字节', '接缝.json', '去重账.json', 'sha缓存.json', '列段',
  ...Object.keys(reportOnlyDirs).filter((k) => k.startsWith('cache/')).map((k) => k.slice('cache/'.length)),
];
export const dedupLedgerFile = () => dataPath('cache', '去重账.json');
export const shaCacheFile = () => dataPath('cache', 'sha缓存.json');
const stagingRoot = () => dataPath('run', '暂存', 'terrain');
const relativeDataKey = (p: string) => path.relative(dataRoot(), p).split(path.sep).join('/');

/** 本机所有检出（主检出、各 worktree）：webpack 缓存在各自的 node_modules/.cache/webpack */
export const allCheckouts = (): string[] => {
  const r = new Set([codeRoot(), mainCheckout()]);
  try {
    for (const l of runCapture(['git', '-C', codeRoot(), 'worktree', 'list', '--porcelain']).split('\n')) if (l.startsWith('worktree ')) r.add(path.resolve(l.slice('worktree '.length).trim()));
  } catch {
    // 不在 git 里（公开版解压包）就只有代码根
  }
  return [...r].filter((d) => fs.existsSync(d));
};

const installedRemotionVersion = (checkout: string): string | null => {
  try {
    return (JSON.parse(fs.readFileSync(path.join(checkout, 'node_modules', 'remotion', 'package.json'), 'utf8')) as { version?: string }).version ?? null;
  } catch {
    return null;
  }
};

const keptMedia = (plan: ReclaimPlan) => plan.media.filter((f) => f.理由.length);
const pendingDeleteByInode = (plan: ReclaimPlan) => {
  const m = new Map<string, number>();
  for (const f of plan.media) if (!f.理由.length) m.set(f.inode, (m.get(f.inode) ?? 0) + 1);
  return m;
};

export const computeReclaimPlan = async (o: ReclaimOptions, onProgress: (s: string) => void = () => {}): Promise<ReclaimPlan> => {
  const plan: ReclaimPlan = { media: [], tempFiles: [], staging: [], 打包: [], drafts: [], columnSegs: [], webpack: [], reportOnly: [], unknownGroups: [], dedupePlan: null, 警告: [] };
  const warn = (s: string) => plan.警告.push(s);
  const isWanted = (c: ReclaimClass) => o.类.has(c);

  if (isWanted('母版') || isWanted('残留') || isWanted('去重')) {
    const knownWorks = listWorks();
    // 只认目录：Finder 会在这里留 .DS_Store
    const masterRoot = dataPath('cache', '母版');
    const cacheEntries = new Set(fs.existsSync(masterRoot) ? fs.readdirSync(masterRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);
    const targetWorks = o.作品.length ? o.作品 : [...new Set([...knownWorks.keys(), ...cacheEntries])].sort();
    const keep = new KeepSet();
    // 自足的交付、有认可参考的认可不再钉（用户 10-30 定「这个未来用不到的就删」）
    addDelivery(keep, dataPath('交付'), dataRoot(), warn, { unpin: true });
    for (const work of targetWorks) {
      if (!cacheEntries.has(work)) continue;
      const workRoot = knownWorks.get(work);
      if (!workRoot) {
        warn(`cache/ 下有作品「${work}」，代码里没有这部作品（私有的没登记、或在别的分支上），它的母版整个留着`);
        keep.addDir(dataPath('cache', '母版', work), { 类: '算不出', 说明: '代码里没有这部作品' });
        continue;
      }
      addApprovals(keep, workRoot, (segKey) => masterDir(segKey, work), warn, { unpin: true, referenceFile: referenceFileLookup(work) });
      if (isWanted('母版') || isWanted('去重')) await addCurrentFingerprints(keep, work, warn, onProgress);
    }
    for (const work of targetWorks) {
      const mediaScan = scanMedia(dataPath('cache', '母版', work), '母版', work, { now: o.now });
      if (isWanted('母版') || isWanted('去重')) plan.media.push(...planMedia(mediaScan.media, keep, { now: o.now, recentDays: o.recentDays }));
      if (isWanted('残留')) plan.tempFiles.push(...planTemp(mediaScan.tempFiles, o.now));
      if (mediaScan.unknownFiles.length) plan.unknownGroups.push({ 位置: `cache/母版/${work}`, entryList: mediaScan.unknownFiles.map((f) => ({ ...f, 名: path.relative(dataPath('cache', '母版', work), f.路径) })) });
    }
    // 只要了去重、没要删的那一种：那一种的都按留算
    plan.media = plan.media.map((f) => (isWanted(f.种) || f.理由.length ? f : { ...f, 理由: [{ 类: '算不出' as const, 说明: `这次没选 ${f.种}` }] }));
  }

  if (isWanted('残留')) plan.打包 = scanBundles(o.now);
  if (isWanted('残留')) plan.staging = planStaging(scanStaging(stagingRoot(), config('主机')), o.now);
  if (isWanted('草稿')) plan.drafts = planDrafts(listDir(draftRoot()), { now: o.now, days: o.draftDays });
  // 区域源 读时记用过；按区域 sha 寻址，一个文件一个文件算
  if (isWanted('列段')) plan.columnSegs = planDrafts(listDir(dataPath('cache', '列段')).flatMap((d) => listDir(d.路径)), { now: o.now, days: o.columnSegDays });

  if (isWanted('webpack')) {
    for (const checkout of allCheckouts()) {
      const webpackCacheDir = path.join(checkout, 'node_modules', '.cache', 'webpack');
      if (!fs.existsSync(webpackCacheDir)) continue;
      const currentVersion = installedRemotionVersion(checkout);
      const webpackScan = scanWebpack(webpackCacheDir, currentVersion);
      plan.webpack.push({ 根: webpackCacheDir, currentVersion, entryList: planWebpack(webpackScan.entryList, { currentVersion, now: o.now, days: o.webpackDays, keepPerEnv: listWorks().size }) });
      if (webpackScan.unknownEntries.length) plan.unknownGroups.push({ 位置: webpackCacheDir, entryList: webpackScan.unknownEntries });
    }
  }

  for (const [posDir, purpose] of Object.entries(reportOnlyDirs)) {
    const p = path.join(dataRoot(), ...posDir.split('/'));
    if (fs.existsSync(p)) plan.reportOnly.push({ 位置: posDir, 用途: purpose, 大小: dirSize(p) });
  }
  plan.unknownGroups.push({ 位置: 'run', entryList: unrecognizedEntries(runDir(), runKnownNames) }, { 位置: 'cache', entryList: unrecognizedEntries(dataPath('cache'), cacheKnownNames) });
  plan.unknownGroups = plan.unknownGroups.filter((x) => x.entryList.length);

  if (isWanted('去重')) {
    const ledger = readLedger(dedupLedgerFile());
    const shaCache = new ShaCache(shaCacheFile(), dataRoot());
    // 克隆不了的平台连 sha 也不算：同大小的有几十 GB，算了也只是报个做不了的数
    if (canClone()) {
      const dupGroups = await findDuplicates(keptMedia(plan), ledger, relativeDataKey, { 进度: onProgress, extraDeletes: pendingDeleteByInode(plan), shaCache: shaCache });
      shaCache.存();
      plan.dedupePlan = { 组: dupGroups, ledger, canDedupe: true, sha: shaCache.统计 };
    } else plan.dedupePlan = { 组: [], ledger, canDedupe: false, sha: shaCache.统计 };
  }
  return plan;
};

export type ExecResult = { deletedCount: number; deletedSize: number; 跳过: string[]; failed: string[]; cloneCount: number; cloneSavedBytes: number };

const dayMs = 24 * 3600 * 1000;

/** 照计划删、克隆。删之前再看一眼：文件这会儿又被改过（近期天数内）就跳过；去重在删完以后按现状重找一遍（sha 用账本里的，不重算） */
export const runReclaim = async (plan: ReclaimPlan, o: Pick<ReclaimOptions, 'recentDays' | 'draftDays' | 'webpackDays' | 'columnSegDays'>, now = Date.now()): Promise<ExecResult> => {
  const r: ExecResult = { deletedCount: 0, deletedSize: 0, 跳过: [], failed: [], cloneCount: 0, cloneSavedBytes: 0 };
  const removeFile = (p: string, byteSize: number, isRecent: (modifiedAt: number) => boolean, recursive: boolean) => {
    try {
      if (!fs.existsSync(p)) return;
      const modifiedAt = recursive ? latestModifiedAt(p, 3) : fs.statSync(p).mtimeMs;
      if (isRecent(modifiedAt)) {
        r.跳过.push(`${p}（刚改过）`);
        return;
      }
      fs.rmSync(p, { recursive: recursive, force: true, maxRetries: 3 });
      r.deletedCount++;
      r.deletedSize += byteSize;
    } catch (e) {
      r.failed.push(`${p}：${(e as Error).message}`);
    }
  };
  const withinDays = (days: number) => (modifiedAt: number) => now - modifiedAt < days * dayMs;
  for (const f of plan.media) if (!f.理由.length) removeFile(f.路径, f.大小, withinDays(o.recentDays), false);
  const psOutput = plan.打包.some(d => !d.理由.length) ? 读进程() : '';
  for (const d of plan.打包) if (!d.理由.length) {
    try {
      const st = fs.lstatSync(d.路径, { throwIfNoEntry: false });
      if (!st) continue;
      if (!st.isDirectory()) { r.跳过.push(`${d.路径}（不再是打包目录）`); continue; }
      const reasons = bundleKeepReasons({ 路径: d.路径, 改于: latestModifiedAt(d.路径, 3) }, now, psOutput);
      if (reasons.length) { r.跳过.push(`${d.路径}（${reasons.map(x => x.说明).join('、')}）`); continue; }
      removeBundles(d.路径);
      r.deletedCount++;
      r.deletedSize += d.大小;
    } catch (e) { r.failed.push(`${d.路径}：${(e as Error).message}`); }
  }
  for (const f of plan.tempFiles) if (!f.理由.length) removeFile(f.路径, f.大小, withinDays(1), false);
  // 计划算完到删之间可能有人开始烘焙同一个包：删前再看一眼锁
  for (const d of plan.staging) if (!d.理由.length) removeFile(d.路径, d.大小, (modifiedAt) => withinDays(1)(modifiedAt) || isLockHeld(`${d.路径}.写入.lock`, config('主机')), true);
  for (const d of plan.drafts) if (!d.理由.length) removeFile(d.路径, d.大小, withinDays(o.draftDays), true);
  for (const d of plan.columnSegs) if (!d.理由.length) removeFile(d.路径, d.大小, withinDays(o.columnSegDays), false);
  for (const w of plan.webpack) for (const e of w.entryList) if (!e.理由.length) removeFile(e.路径, e.大小, e.哈希 === null ? () => false : withinDays(o.webpackDays), true);
  if (plan.dedupePlan?.canDedupe && plan.dedupePlan.组.length) {
    const shaCache = new ShaCache(shaCacheFile(), dataRoot());
    const dupGroups = await findDuplicates(keptMedia(plan).filter((f) => fs.existsSync(f.路径)), plan.dedupePlan.ledger, relativeDataKey, { shaCache: shaCache });
    const d = executeDedup(dupGroups, plan.dedupePlan.ledger, relativeDataKey);
    r.cloneCount = d.cloneCount;
    r.cloneSavedBytes = d.省;
    r.failed.push(...d.failed);
    writeLedger(dedupLedgerFile(), plan.dedupePlan.ledger);
    shaCache.存();
  }
  return r;
};
