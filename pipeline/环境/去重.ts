// 内容相同的母版克隆成共享块（APFS 的 clonefile，用 cp -c）：重渲出逐字节相同的母版很常见（分镜.ts 改动让没变的段也重渲）。
// 先按大小分组，同大小的再算 sha256，相同的才克隆；克隆写临时名、改回原来的修改时间再原子改名，「最近一份」「近期」的判断不受影响。
// 只在 Mac 上做（Windows 的 NTFS 没有块克隆；Linux 的 btrfs/xfs 以后要再接）。
// 账本 <数据根>/cache/去重账.json：记每个文件算过的 sha（大小、修改时间、inode 没变就不重算）和克隆自谁，重跑不重复克隆、不重复算省了多少。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { runCapture } from './子进程.ts';

export type DedupFile = { 路径: string; 大小: number; 改于: number };
export type LedgerEntry = { 大小: number; 改于: number; ino: number; sha: string; 克隆自?: string };
export type DedupLedger = { 版本: 1; 文件: Record<string, LedgerEntry> };
/** 一组内容相同的文件：待克隆 的各 inode 换成 源 的克隆后能省 省 字节（一个 inode 的所有名字都换掉才腾得出空间） */
export type DedupGroup = { sha: string; 大小: number; 源: string; toClone: string[]; 省: number; alreadyShared: string[] };

export const canClone = () => process.platform === 'darwin';

export const readLedger = (file: string): DedupLedger => {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8')) as DedupLedger;
    if (j.版本 === 1 && j.文件 && typeof j.文件 === 'object') return j;
  } catch {
    // 没有或坏了就从头算
  }
  return { 版本: 1, 文件: {} };
};

export const writeLedger = (file: string, ledger: DedupLedger) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.写入中-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 1) + '\n', 'utf8');
  fs.renameSync(tmp, file);
};

export const fileSha = async (p: string): Promise<string> => {
  const h = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(p, { highWaterMark: 1 << 22 })) h.update(chunk as Buffer);
  return h.digest('hex');
};

/** 账本里的这一条还是不是这个文件（大小、修改时间、inode 都没变） */
const ledgerMatches = (e: LedgerEntry | undefined, st: fs.Stats): e is LedgerEntry => !!e && e.大小 === st.size && e.改于 === st.mtimeMs && e.ino === st.ino;

/**
 * 找内容相同的组：同大小的才算 sha（账本里对得上的不重算，算出来的写回 账，调用方决定存不存）。
 * 同一 inode 的（硬链接）本来就共享；每组挑一个源 inode（已经有别人克隆自它的优先，其次链接多的、最早的），
 * 别的 inode 的名字全在这批里的才换成源的克隆（有计划外的硬链接就腾不出空间，不动），之前克隆过源的跳过。
 */
export type FindDupOptions = {
  进度?: (s: string) => void;
  /** 只看不删时：这次计划里要删掉的名字数（按 inode），从硬链接数里扣掉，估的是删完以后的样子 */
  extraDeletes?: ReadonlyMap<string, number>;
  /** 账本里没有的先查这里再算（只看不删时账本不写，sha 记在这里，下次不重算） */
  shaCache?: { hash: (p: string, st: fs.Stats) => Promise<string> };
};

export const findDuplicates = async (dedupFiles: readonly DedupFile[], ledger: DedupLedger, fileKey: (p: string) => string, o: FindDupOptions = {}): Promise<DedupGroup[]> => {
  const onProgress = o.进度 ?? (() => {});
  const bySize = new Map<number, DedupFile[]>();
  for (const f of dedupFiles) if (f.大小 > 0) bySize.set(f.大小, [...(bySize.get(f.大小) ?? []), f]);
  const candidates = [...bySize.values()].filter((g) => g.length > 1).flat();
  const bytesToHash = candidates.reduce((n, f) => n + f.大小, 0);
  if (candidates.length) onProgress(`同大小的 ${candidates.length} 个文件（${(bytesToHash / 1e9).toFixed(1)} GB）比内容`);
  type FileItem = { f: DedupFile; st: fs.Stats; inode: string };
  const bySha = new Map<string, FileItem[]>();
  const computedShas = new Map<string, string>(); // 硬链接只算一次
  for (const f of candidates) {
    const st = fs.statSync(f.路径);
    const inode = `${st.dev}-${st.ino}`;
    const k = fileKey(f.路径);
    let e = ledger.文件[k];
    if (!ledgerMatches(e, st)) {
      e = { 大小: st.size, 改于: st.mtimeMs, ino: st.ino, sha: computedShas.get(inode) ?? (await (o.shaCache ? o.shaCache.hash(f.路径, st) : fileSha(f.路径))) };
      ledger.文件[k] = e;
    }
    computedShas.set(inode, e.sha);
    bySha.set(e.sha, [...(bySha.get(e.sha) ?? []), { f, st, inode }]);
  }
  const dupGroups: DedupGroup[] = [];
  for (const [sha, g] of bySha) {
    const byInode = new Map<string, FileItem[]>();
    for (const x of g) byInode.set(x.inode, [...(byInode.get(x.inode) ?? []), x]);
    if (byInode.size < 2) continue;
    const refCount = (xs: FileItem[]) => xs.reduce((n, x) => n + g.filter((y) => ledger.文件[fileKey(y.f.路径)]?.克隆自 === fileKey(x.f.路径)).length, 0);
    const sorted = [...byInode.values()].sort((a, b) => refCount(b) - refCount(a) || b.length - a.length || a[0]!.f.改于 - b[0]!.f.改于 || a[0]!.f.路径.localeCompare(b[0]!.f.路径));
    const sourceGroup = sorted[0]!;
    const sourcePath = sourceGroup[0]!.f.路径;
    const sourceKeys = new Set(sourceGroup.map((x) => fileKey(x.f.路径)));
    const toClone: string[] = [];
    const alreadyShared: string[] = [];
    let savedBytes = 0;
    for (const xs of sorted.slice(1)) {
      if (xs.every((x) => sourceKeys.has(ledger.文件[fileKey(x.f.路径)]?.克隆自 ?? ''))) {
        alreadyShared.push(...xs.map((x) => x.f.路径));
        continue;
      }
      if (xs.length < xs[0]!.st.nlink - (o.extraDeletes?.get(xs[0]!.inode) ?? 0)) continue;
      toClone.push(...xs.map((x) => x.f.路径));
      savedBytes += xs[0]!.f.大小;
    }
    if (toClone.length || alreadyShared.length) dupGroups.push({ sha, 大小: sourceGroup[0]!.f.大小, 源: sourcePath, toClone, 省: savedBytes, alreadyShared });
  }
  return dupGroups.sort((a, b) => b.省 - a.省);
};

export const savableBytes = (groups: readonly DedupGroup[]) => groups.reduce((n, g) => n + g.省, 0);

/** 把 目标 换成 源 的克隆（APFS 共享块），保留 目标 原来的修改时间；返回新的 stat */
export const cloneReplace = (sourcePath: string, targetPath: string): fs.Stats => {
  const st = fs.statSync(targetPath);
  const tmp = `${targetPath}.写入中-${process.pid}`;
  try {
    // Node 的 COPYFILE_FICLONE_FORCE 在 macOS 上是 ENOSYS（libuv 没接 clonefile），用系统的 cp -c
    runCapture(['cp', '-c', sourcePath, tmp]);
    if (fs.statSync(tmp).size !== st.size) throw new Error(`克隆出来大小不对：${tmp}`);
    fs.utimesSync(tmp, st.atime, st.mtime);
    fs.renameSync(tmp, targetPath);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  return fs.statSync(targetPath);
};

/** 按组克隆，账本跟着记（克隆自、新 inode）；单个失败记下来接着做 */
export const executeDedup = (groups: readonly DedupGroup[], ledger: DedupLedger, fileKey: (p: string) => string): { cloneCount: number; 省: number; failed: string[] } => {
  const r = { cloneCount: 0, 省: 0, failed: [] as string[] };
  for (const g of groups) {
    let allOk = true;
    for (const p of g.toClone) {
      try {
        const st = cloneReplace(g.源, p);
        ledger.文件[fileKey(p)] = { 大小: st.size, 改于: st.mtimeMs, ino: st.ino, sha: g.sha, 克隆自: fileKey(g.源) };
        r.cloneCount++;
      } catch (e) {
        allOk = false;
        r.failed.push(`${p}：${(e as Error).message}`);
      }
    }
    if (allOk) r.省 += g.省;
  }
  return r;
};
