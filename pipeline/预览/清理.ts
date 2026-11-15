// 预览清理：用户 11-02 定预览里冗余的要删，不靠人记着删。anim preview new 每次顺手做一遍，也能单独 anim preview 清理 [--执行]。
// 过时的夹（名字里的 UTC 时间早于 保留天数）：文字挪进数据根 archive/预览/<夹>/（说明里有用户的答复，规矩表的出处引它），图、视频、声音删掉；
// archive/预览/ 里已有的夹同样只留文字。Git 管的文件按完整路径引用的（比如代码注释引的参照图）照留。发 B 站的成片不放预览，放数据根 发布/<作品>/。
// 草稿（run/草稿/）只顺手删按日期起名、超过 cache gc 草稿天数没动的；配音候选这类不按日期起名的归 anim cache gc 管。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { dataPath, draftRoot } from '../环境/配置.ts';
import { mainCheckout } from '../环境/路径.ts';
import { listDir, planDrafts, type DirEntry } from '../缓存/回收.ts';
import { defaultDays } from '../缓存/计划.ts';

/** Agent 定的：用户常回头看前一两天的图，留 3 天 */
export const previewKeepDays = 3;
export const previewArchiveRoot = () => dataPath('archive', '预览');

const dayMs = 24 * 3600 * 1000;
const textSuffixes = new Set(['.md', '.txt', '.toml', '.tsv', '.csv', '.json', '.jsonl', '.srt', '.vtt', '.html']);
/** 文字也有大的（内嵌图表的 html），超过就当媒体删 */
const textMaxBytes = 2 * 1024 * 1024;

export const isTextFile = (fileName: string, byteSize: number) => textSuffixes.has(path.extname(fileName).toLowerCase()) && byteSize <= textMaxBytes;

/** 夹名开头的 UTC「月日-时分」换成毫秒；没写年份，取不晚于明天的最近一年。认不出返回 null */
export const folderTime = (dirName: string, now: number): number | null => {
  const m = /^(\d{2})(\d{2})-(\d{2})(\d{2})-/.exec(dirName);
  if (!m) return null;
  const [month, day, hour, minute] = m.slice(1).map(Number) as [number, number, number, number];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const year = new Date(now).getUTCFullYear();
  const t = Date.UTC(year, month - 1, day, hour, minute);
  return t > now + dayMs ? Date.UTC(year - 1, month - 1, day, hour, minute) : t;
};

/** git grep 的输出里取「预览/<夹>/<文件>」，返回「<夹>/<文件>」；中文标点、通配符处截断 */
export const parseReferences = (text: string): Set<string> =>
  new Set(
    text
      .split('\n')
      .map((s) => s.normalize('NFC').replace(/^预览\//, '').split(/[，。、；：）」』】*]/)[0]!.replace(/[.,;:]+$/, ''))
      .filter((s) => s.includes('/')),
  );

/** 主检出里 Git 管的文件按完整路径引用的预览文件 */
export const referencedPreviewFiles = (root = mainCheckout()): Set<string> => {
  const r = spawnSync('git', ['grep', '-ohE', '预览/[^[:space:]`"\'()]+'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status === 1) return new Set(); // 一处都没有
  if (r.status !== 0) throw new Error(`git grep 找预览引用失败，不清理（引用的会被误删）：${r.stderr || r.error?.message}`);
  return parseReferences(r.stdout);
};

type FileEntry = { 相对: string; 大小: number };
const listFiles = (dir: string, pathPrefix = ''): FileEntry[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const relPath = path.join(pathPrefix, e.name);
    return e.isDirectory() ? listFiles(path.join(dir, e.name), relPath) : [{ 相对: relPath, 大小: fs.lstatSync(path.join(dir, e.name)).size }];
  });
const subDirs = (root: string) => (fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);

/** 归档到 不是 null 的是 预览/ 里过时的夹：留的挪过去，整夹删；null 的是归档里的夹，只删媒体 */
export type FolderPlan = { 名: string; 目录: string; archiveTo: string | null; 留: string[]; removed: FileEntry[] };

export const planPreviewCleanup = (o: { previewRoot: string; archiveRoot: string; now: number; days: number; 引用: Set<string> }): FolderPlan[] => {
  const plan: FolderPlan[] = [];
  const addMove = (dirName: string, dir: string, archiveTo: string | null) => {
    const kept: string[] = [];
    const removed: FileEntry[] = [];
    for (const f of listFiles(dir)) {
      const refKey = `${dirName}/${f.相对.split(path.sep).join('/')}`.normalize('NFC');
      if (isTextFile(f.相对, f.大小) || o.引用.has(refKey)) kept.push(f.相对);
      else removed.push(f);
    }
    if (archiveTo || removed.length) plan.push({ 名: dirName, 目录: dir, archiveTo, 留: kept, removed });
  };
  for (const dirName of subDirs(o.previewRoot)) {
    const previewDir = path.join(o.previewRoot, dirName);
    const t = folderTime(dirName, o.now) ?? fs.statSync(previewDir).mtimeMs;
    if (o.now - t >= o.days * dayMs) addMove(dirName, previewDir, path.join(o.archiveRoot, dirName));
  }
  for (const dirName of subDirs(o.archiveRoot)) addMove(dirName, path.join(o.archiveRoot, dirName), null);
  return plan;
};

/** 草稿里按日期起名、超过天数没动的 */
export const planDraftCleanup = (draftRoot: string, now: number, days = defaultDays.draftDays): DirEntry[] =>
  planDrafts(listDir(draftRoot, 2, (entryName) => /^\d{4}-\d{4}-/.test(entryName)), { now, days }).filter((d) => !d.理由.length);

const uniqueName = (p: string) => {
  if (!fs.existsSync(p)) return p;
  const { dir, name, ext } = path.parse(p);
  for (let i = 2; ; i++) if (!fs.existsSync(path.join(dir, `${name}-${i}${ext}`))) return path.join(dir, `${name}-${i}${ext}`);
};

/** 别的进程同时在清，文件没了就算了 */
const okIfGone = (f: () => void) => {
  try {
    f();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
};

const moveFile = (fromPath: string, destPath: string) => {
  try {
    fs.renameSync(fromPath, destPath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    fs.copyFileSync(fromPath, destPath);
    fs.rmSync(fromPath, { force: true });
  }
};

const removeEmptyDir = (dir: string): boolean => {
  if (!fs.existsSync(dir)) return true;
  const isEmpty = fs.readdirSync(dir, { withFileTypes: true }).every((e) => e.isDirectory() && removeEmptyDir(path.join(dir, e.name)));
  if (isEmpty) fs.rmdirSync(dir);
  return isEmpty;
};

export type CleanResult = { archivedFolders: number; deletedFiles: number; deletedBytes: number; deletedDrafts: number; draftBytes: number };

export const executeCleanup = (plan: FolderPlan[], drafts: DirEntry[]): CleanResult => {
  const r: CleanResult = { archivedFolders: 0, deletedFiles: 0, deletedBytes: 0, deletedDrafts: 0, draftBytes: 0 };
  for (const p of plan) {
    for (const f of p.removed) {
      fs.rmSync(path.join(p.目录, f.相对), { force: true });
      r.deletedFiles++;
      r.deletedBytes += f.大小;
    }
    if (p.archiveTo) {
      for (const relPath of p.留)
        okIfGone(() => {
          const destPath = uniqueName(path.join(p.archiveTo!, relPath));
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          moveFile(path.join(p.目录, relPath), destPath);
        });
      fs.rmSync(p.目录, { recursive: true, force: true });
      r.archivedFolders++;
    } else removeEmptyDir(p.目录);
  }
  for (const d of drafts) {
    fs.rmSync(d.路径, { recursive: true, force: true });
    r.deletedDrafts++;
    r.draftBytes += d.大小;
  }
  return r;
};

export const planDefaultCleanup = (now = Date.now(), days = previewKeepDays) => ({
  plan: planPreviewCleanup({ previewRoot: path.join(mainCheckout(), '预览'), archiveRoot: previewArchiveRoot(), now, days, 引用: referencedPreviewFiles() }),
  drafts: planDraftCleanup(draftRoot(), now),
});

const MB = (n: number) => `${(n / 1024 / 1024).toFixed(0)} MB`;
export const cleanupSummary = (r: CleanResult) =>
  [r.archivedFolders && `${r.archivedFolders} 个过时的预览夹只留文字挪进 archive/预览/`, r.deletedFiles && `删了 ${r.deletedFiles} 个图、视频、声音（${MB(r.deletedBytes)}）`, r.deletedDrafts && `删了 ${r.deletedDrafts} 个旧草稿（${MB(r.draftBytes)}）`]
    .filter(Boolean)
    .join('，');
