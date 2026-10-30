// 内容相同的母版、叠层克隆成共享块（APFS 的 clonefile，用 cp -c）：重渲出逐字节相同的母版很常见（分镜.ts 改动让没变的段也重渲）。
// 先按大小分组，同大小的再算 sha256，相同的才克隆；克隆写临时名、改回原来的修改时间再原子改名，「最近一份」「近期」的判断不受影响。
// 只在 Mac 上做（Windows 的 NTFS 没有块克隆；Linux 的 btrfs/xfs 以后要再接）。
// 账本 <数据根>/cache/去重账.json：记每个文件算过的 sha（大小、修改时间、inode 没变就不重算）和克隆自谁，重跑不重复克隆、不重复算省了多少。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { 跑出 } from '../环境/子进程.ts';

export type 去重文件 = { 路径: string; 大小: number; 改于: number };
export type 账条目 = { 大小: number; 改于: number; ino: number; sha: string; 克隆自?: string };
export type 去重账 = { 版本: 1; 文件: Record<string, 账条目> };
/** 一组内容相同的文件：待克隆 的各 inode 换成 源 的克隆后能省 省 字节（一个 inode 的所有名字都换掉才腾得出空间） */
export type 去重组 = { sha: string; 大小: number; 源: string; 待克隆: string[]; 省: number; 已共享: string[] };

export const 能克隆 = () => process.platform === 'darwin';

export const 读账 = (file: string): 去重账 => {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8')) as 去重账;
    if (j.版本 === 1 && j.文件 && typeof j.文件 === 'object') return j;
  } catch {
    // 没有或坏了就从头算
  }
  return { 版本: 1, 文件: {} };
};

export const 写账 = (file: string, 账: 去重账) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.写入中-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(账, null, 1) + '\n', 'utf8');
  fs.renameSync(tmp, file);
};

export const 文件sha = async (p: string): Promise<string> => {
  const h = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(p, { highWaterMark: 1 << 22 })) h.update(chunk as Buffer);
  return h.digest('hex');
};

/** 账本里的这一条还是不是这个文件（大小、修改时间、inode 都没变） */
const 账还对 = (e: 账条目 | undefined, st: fs.Stats): e is 账条目 => !!e && e.大小 === st.size && e.改于 === st.mtimeMs && e.ino === st.ino;

/**
 * 找内容相同的组：同大小的才算 sha（账本里对得上的不重算，算出来的写回 账，调用方决定存不存）。
 * 同一 inode 的（硬链接）本来就共享；每组挑一个源 inode（已经有别人克隆自它的优先，其次链接多的、最早的），
 * 别的 inode 的名字全在这批里的才换成源的克隆（有计划外的硬链接就腾不出空间，不动），之前克隆过源的跳过。
 */
export type 找重复选项 = {
  进度?: (s: string) => void;
  /** 只看不删时：这次计划里要删掉的名字数（按 inode），从硬链接数里扣掉，估的是删完以后的样子 */
  另删?: ReadonlyMap<string, number>;
};

export const 找重复 = async (文件们: readonly 去重文件[], 账: 去重账, 键: (p: string) => string, o: 找重复选项 = {}): Promise<去重组[]> => {
  const 进度 = o.进度 ?? (() => {});
  const 按大小 = new Map<number, 去重文件[]>();
  for (const f of 文件们) if (f.大小 > 0) 按大小.set(f.大小, [...(按大小.get(f.大小) ?? []), f]);
  const 候选 = [...按大小.values()].filter((g) => g.length > 1).flat();
  const 要算 = 候选.reduce((n, f) => n + f.大小, 0);
  if (候选.length) 进度(`同大小的 ${候选.length} 个文件（${(要算 / 1e9).toFixed(1)} GB）比内容`);
  type 项 = { f: 去重文件; st: fs.Stats; inode: string };
  const 按sha = new Map<string, 项[]>();
  const 已算 = new Map<string, string>(); // 硬链接只算一次
  for (const f of 候选) {
    const st = fs.statSync(f.路径);
    const inode = `${st.dev}-${st.ino}`;
    const k = 键(f.路径);
    let e = 账.文件[k];
    if (!账还对(e, st)) {
      e = { 大小: st.size, 改于: st.mtimeMs, ino: st.ino, sha: 已算.get(inode) ?? (await 文件sha(f.路径)) };
      账.文件[k] = e;
    }
    已算.set(inode, e.sha);
    按sha.set(e.sha, [...(按sha.get(e.sha) ?? []), { f, st, inode }]);
  }
  const 组: 去重组[] = [];
  for (const [sha, g] of 按sha) {
    const 按inode = new Map<string, 项[]>();
    for (const x of g) 按inode.set(x.inode, [...(按inode.get(x.inode) ?? []), x]);
    if (按inode.size < 2) continue;
    const 被引 = (xs: 项[]) => xs.reduce((n, x) => n + g.filter((y) => 账.文件[键(y.f.路径)]?.克隆自 === 键(x.f.路径)).length, 0);
    const 排 = [...按inode.values()].sort((a, b) => 被引(b) - 被引(a) || b.length - a.length || a[0]!.f.改于 - b[0]!.f.改于 || a[0]!.f.路径.localeCompare(b[0]!.f.路径));
    const 源组 = 排[0]!;
    const 源 = 源组[0]!.f.路径;
    const 源键们 = new Set(源组.map((x) => 键(x.f.路径)));
    const 待克隆: string[] = [];
    const 已共享: string[] = [];
    let 省 = 0;
    for (const xs of 排.slice(1)) {
      if (xs.every((x) => 源键们.has(账.文件[键(x.f.路径)]?.克隆自 ?? ''))) {
        已共享.push(...xs.map((x) => x.f.路径));
        continue;
      }
      if (xs.length < xs[0]!.st.nlink - (o.另删?.get(xs[0]!.inode) ?? 0)) continue;
      待克隆.push(...xs.map((x) => x.f.路径));
      省 += xs[0]!.f.大小;
    }
    if (待克隆.length || 已共享.length) 组.push({ sha, 大小: 源组[0]!.f.大小, 源, 待克隆, 省, 已共享 });
  }
  return 组.sort((a, b) => b.省 - a.省);
};

export const 可省 = (组们: readonly 去重组[]) => 组们.reduce((n, g) => n + g.省, 0);

/** 把 目标 换成 源 的克隆（APFS 共享块），保留 目标 原来的修改时间；返回新的 stat */
export const 克隆替换 = (源: string, 目标: string): fs.Stats => {
  const st = fs.statSync(目标);
  const tmp = `${目标}.写入中-${process.pid}`;
  try {
    // Node 的 COPYFILE_FICLONE_FORCE 在 macOS 上是 ENOSYS（libuv 没接 clonefile），用系统的 cp -c
    跑出(['cp', '-c', 源, tmp]);
    if (fs.statSync(tmp).size !== st.size) throw new Error(`克隆出来大小不对：${tmp}`);
    fs.utimesSync(tmp, st.atime, st.mtime);
    fs.renameSync(tmp, 目标);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  return fs.statSync(目标);
};

/** 按组克隆，账本跟着记（克隆自、新 inode）；单个失败记下来接着做 */
export const 执行去重 = (组们: readonly 去重组[], 账: 去重账, 键: (p: string) => string): { 克隆数: number; 省: number; 失败: string[] } => {
  const r = { 克隆数: 0, 省: 0, 失败: [] as string[] };
  for (const g of 组们) {
    let 全成 = true;
    for (const p of g.待克隆) {
      try {
        const st = 克隆替换(g.源, p);
        账.文件[键(p)] = { 大小: st.size, 改于: st.mtimeMs, ino: st.ino, sha: g.sha, 克隆自: 键(g.源) };
        r.克隆数++;
      } catch (e) {
        全成 = false;
        r.失败.push(`${p}：${(e as Error).message}`);
      }
    }
    if (全成) r.省 += g.省;
  }
  return r;
};
