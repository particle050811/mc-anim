// 盘上数据改键名的一次性迁移（代码改英文第三步，用户 11-15 定一次迁完）：按格式找文件、按键表只换键记号、改前在内存里核对、
// 数据根的先打 tar 备份、写完逐个读回再核对。重跑幂等（改过的文件没有可改的键，不写）。
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse as parseToml } from 'smol-toml';
import { FORMATS, type DiskFormat } from './格式.ts';
import { duplicateJsonKeys, jsonSkeleton, renameJson, renameJsonl, type RenameResult } from './改json.ts';
import { renameToml, tomlSkeleton } from './改toml.ts';
import { leftoverKeys, loadKeyTable, renameParsed, type KeyTable } from './键表.ts';

export type Roots = { repo: string; data: string };

const walk = (abs: string, rel: string, out: string[]) => {
  if (!fs.existsSync(abs)) return;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const r = `${rel}/${e.name}`;
    if (e.isDirectory()) walk(path.join(abs, e.name), r, out);
    else if (e.isFile()) out.push(r);
  }
};

const repoFiles = (repo: string) => {
  try {
    return execFileSync('git', ['ls-files', '-z'], { cwd: repo, maxBuffer: 1 << 28, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean);
  } catch {
    // 不是 Git 检出（试跑用的假仓库）：整个走一遍
    const out: string[] = [];
    for (const e of fs.readdirSync(repo, { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') walk(path.join(repo, e.name), e.name, out);
    return out;
  }
};

/** 这种格式的所有文件（相对根的 posix 路径） */
export const listFiles = (f: DiskFormat, roots: Roots, repoList?: string[]) => {
  if (f.root === 'repo') return (repoList ?? repoFiles(roots.repo)).filter((p) => f.file.test(p)).sort();
  if (f.root === 'terrain') return [];
  const out: string[] = [];
  for (const d of f.dirs ?? []) walk(path.join(roots.data, d), d, out);
  for (const p of f.files ?? []) if (fs.existsSync(path.join(roots.data, p))) out.push(p);
  return out.filter((p) => f.file.test(p)).sort();
};

const parse = (lang: DiskFormat['lang'], text: string): unknown =>
  lang === 'toml' ? parseToml(text) : lang === 'json' ? JSON.parse(text) : text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

const renameText = (lang: DiskFormat['lang'], text: string, t: KeyTable): RenameResult =>
  lang === 'toml' ? renameToml(text, t) : lang === 'json' ? renameJson(text, t) : renameJsonl(text, t);

const skeleton = (lang: DiskFormat['lang'], text: string, t: KeyTable) =>
  lang === 'toml' ? tomlSkeleton(text, t) : lang === 'json' ? jsonSkeleton(text, t) : text.split('\n').map((l) => (l.trim() ? jsonSkeleton(l.replace(/\r$/, ''), t) : l)).join('\n');

/** 新文本对不对：还能解析、改前解析后改键 = 改后解析、除了键记号逐字节一样、表里的中文键一个不剩。返回问题（空 = 过） */
export const verifyRename = (lang: DiskFormat['lang'], before: string, after: string, t: KeyTable) => {
  const problems: string[] = [];
  let b: unknown;
  let a: unknown;
  try {
    b = parse(lang, before);
    a = parse(lang, after);
  } catch (e) {
    return [`解析不了：${(e as Error).message}`];
  }
  if (!isDeepStrictEqual(renameParsed(t, b), a)) problems.push('改后的值和改前按表改键对不上（撞名或漏改）');
  if (skeleton(lang, before, t) !== skeleton(lang, after, t)) problems.push('键以外的字节变了');
  if (lang !== 'toml') {
    const dup = after.split(lang === 'jsonl' ? '\n' : '\0').flatMap((l) => (l.trim() ? duplicateJsonKeys(l, t) : []));
    if (dup.length) problems.push(`改完同一对象里重名：${[...new Set(dup)].slice(0, 5).join('、')}`);
  }
  const left = leftoverKeys(t, a);
  if (left.missed.size) problems.push(`还剩表里的中文键：${[...left.missed].join('、')}`);
  return problems;
};

export type FilePlan = { format: string; root: 'repo' | 'data'; rel: string; renamed: number; before: string; after: string; problems: string[]; unlisted: string[] };

/** 算一个文件要怎么改（不写） */
export const planFile = (f: DiskFormat, t: KeyTable, rootDir: string, rel: string): FilePlan => {
  const before = fs.readFileSync(path.join(rootDir, rel), 'utf8');
  const base = { format: f.id, root: f.root as 'repo' | 'data', rel, before };
  let r: RenameResult;
  try {
    r = renameText(f.lang, before, t);
  } catch (e) {
    return { ...base, renamed: 0, after: before, problems: [(e as Error).message], unlisted: [] };
  }
  const problems = r.collisions.map((c) => `撞名：${c}`);
  if (r.renamed) problems.push(...verifyRename(f.lang, before, r.text, t));
  let unlisted: string[] = [];
  try {
    unlisted = [...leftoverKeys(t, parse(f.lang, r.text)).unlisted];
  } catch {}
  return { ...base, renamed: r.renamed, after: r.text, problems, unlisted };
};

export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

/** 写一个文件：同目录临时文件 + 改名，权限和修改时间照旧（按修改时间算年龄的回收、ls -t 不受影响） */
export const writeKeepingTimes = (abs: string, text: string) => {
  const st = fs.statSync(abs);
  const tmp = `${abs}.盘键迁移-${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, { mode: st.mode });
  fs.utimesSync(tmp, st.atime, st.mtime);
  fs.renameSync(tmp, abs);
};

export const utcStamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');

/** 数据根要改的文件先打包：<数据根>/archive/盘键迁移-<UTC>/备份.tar + 清单.tsv（相对路径、改前 sha256、改后 sha256） */
export const backupDataFiles = (data: string, plans: FilePlan[], stamp = utcStamp()) => {
  const dir = path.join(data, 'archive', `盘键迁移-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  const list = path.join(dir, '文件.txt');
  fs.writeFileSync(list, plans.map((p) => p.rel).join('\n') + '\n');
  execFileSync('tar', ['-cf', path.join(dir, '备份.tar'), '-C', data, '-T', list]);
  fs.writeFileSync(path.join(dir, '清单.tsv'), '相对路径\t改前sha256\t改后sha256\n' + plans.map((p) => `${p.rel}\t${sha256(p.before)}\t${sha256(p.after)}\n`).join(''));
  // 包里的文件数对不上（路径带怪字符没打进去之类）就不往下改
  const listed = execFileSync('tar', ['-tf', path.join(dir, '备份.tar')], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean);
  if (listed.length !== plans.length) throw new Error(`备份包里 ${listed.length} 个文件，该有 ${plans.length} 个`);
  return dir;
};

export type RunOptions = { roots: Roots; only?: string[]; dryRun: boolean; log: (s: string) => void; stamp?: string };
export type FormatSummary = { format: string; files: number; changed: number; keys: number; problems: number; unlisted: string[] };

export const selectedFormats = (only?: string[]) => {
  const fs_ = FORMATS.filter((f) => f.root !== 'terrain' && (!only?.length || only.includes(f.id)));
  const unknown = (only ?? []).filter((id) => !FORMATS.some((f) => f.id === id));
  if (unknown.length) throw new Error(`没有这种格式：${unknown.join('、')}`);
  return fs_;
};

/** 跑一遍迁移：先全部算好、核对；有问题一个都不写。返回各格式小结和备份目录 */
export const runMigration = (o: RunOptions) => {
  const formats = selectedFormats(o.only);
  const repoList = formats.some((f) => f.root === 'repo') ? repoFiles(o.roots.repo) : [];
  const plans: FilePlan[] = [];
  const summaries: FormatSummary[] = [];
  for (const f of formats) {
    const t = loadKeyTable(f.id);
    const files = listFiles(f, o.roots, repoList);
    const rootDir = f.root === 'repo' ? o.roots.repo : o.roots.data;
    const ps = files.map((rel) => planFile(f, t, rootDir, rel));
    const changed = ps.filter((p) => p.renamed > 0 || p.problems.length);
    plans.push(...changed);
    summaries.push({
      format: f.id,
      files: files.length,
      changed: ps.filter((p) => p.renamed > 0).length,
      keys: ps.reduce((n, p) => n + p.renamed, 0),
      problems: ps.filter((p) => p.problems.length).length,
      unlisted: [...new Set(ps.flatMap((p) => p.unlisted))].sort(),
    });
    o.log(`${f.id}：${files.length} 个文件，要改 ${summaries.at(-1)!.changed} 个、${summaries.at(-1)!.keys} 处键${summaries.at(-1)!.problems ? `，${summaries.at(-1)!.problems} 个有问题` : ''}`);
  }
  const bad = plans.filter((p) => p.problems.length);
  if (bad.length) {
    for (const p of bad.slice(0, 50)) o.log(`  !! ${p.format} ${p.rel}：${p.problems.join('；')}`);
    return { summaries, plans, backup: null, written: 0, failed: bad.length };
  }
  if (o.dryRun) return { summaries, plans, backup: null, written: 0, failed: 0 };
  const dataPlans = plans.filter((p) => p.root === 'data');
  const backup = dataPlans.length ? backupDataFiles(o.roots.data, dataPlans, o.stamp) : null;
  let written = 0;
  const readBack: string[] = [];
  for (const p of plans) {
    const abs = path.join(p.root === 'repo' ? o.roots.repo : o.roots.data, p.rel);
    // 算完到写之间被别的进程改了（调度日志、渲染明细在追加）：不覆盖，报出来；迁移要在没有 anim 进程时跑
    if (fs.readFileSync(abs, 'utf8') !== p.before) {
      readBack.push(`${p.rel}：算完以后被改过，没写`);
      continue;
    }
    writeKeepingTimes(abs, p.after);
    written++;
    const f = FORMATS.find((x) => x.id === p.format)!;
    const again = fs.readFileSync(abs, 'utf8');
    const problems = again === p.after ? verifyRename(f.lang, p.before, again, loadKeyTable(f.id)) : ['读回来和写进去的不一样'];
    if (problems.length) readBack.push(`${p.rel}：${problems.join('；')}`);
  }
  for (const s of readBack) o.log(`  !! 读回核对：${s}`);
  if (backup) fs.writeFileSync(path.join(backup, '小结.json'), JSON.stringify({ 时间: new Date().toISOString(), summaries, written, readBackFailed: readBack.length }, null, 2) + '\n');
  return { summaries, plans, backup, written, failed: readBack.length };
};

/** 只核对：每种格式的每个文件解析一遍，看表里的中文键还剩没剩 */
export const verifyAll = (o: Omit<RunOptions, 'dryRun'>) => {
  const formats = selectedFormats(o.only);
  const repoList = formats.some((f) => f.root === 'repo') ? repoFiles(o.roots.repo) : [];
  let missedFiles = 0;
  for (const f of formats) {
    const t = loadKeyTable(f.id);
    const files = listFiles(f, o.roots, repoList);
    const missed = new Set<string>();
    const unlisted = new Set<string>();
    let bad = 0;
    for (const rel of files) {
      try {
        const left = leftoverKeys(t, parse(f.lang, fs.readFileSync(path.join(f.root === 'repo' ? o.roots.repo : o.roots.data, rel), 'utf8')));
        if (left.missed.size) missedFiles++;
        left.missed.forEach((k) => missed.add(k));
        left.unlisted.forEach((k) => unlisted.add(k));
      } catch {
        bad++;
      }
    }
    o.log(`${f.id}：${files.length} 个文件${missed.size ? `，还剩中文键 ${[...missed].join('、')}` : '，表里的键都改了'}${unlisted.size ? `；表外含汉字的键 ${unlisted.size} 个` : ''}${bad ? `；${bad} 个解析不了` : ''}`);
  }
  return missedFiles;
};
