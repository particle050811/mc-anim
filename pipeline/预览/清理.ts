// 预览清理：用户 11-02 定预览里冗余的要删，不靠人记着删。anim preview new 每次顺手做一遍，也能单独 anim preview 清理 [--执行]。
// 过时的夹（名字里的 UTC 时间早于 保留天数）：文字挪进数据根 archive/预览/<夹>/（说明里有用户的答复，规矩表的出处引它），图、视频、声音删掉；
// archive/预览/ 里已有的夹同样只留文字。Git 管的文件按完整路径引用的（比如代码注释引的参照图）照留。发 B 站的成片不放预览，放数据根 发布/<作品>/。
// 草稿（run/草稿/）只顺手删按日期起名、超过 cache gc 草稿天数没动的；配音候选这类不按日期起名的归 anim cache gc 管。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { 数据路径, 草稿根 } from '../环境/配置.ts';
import { 主检出 } from '../环境/路径.ts';
import { 列目录, 规划草稿, type 目录条目 } from '../缓存/回收.ts';
import { 默认天数 } from '../缓存/计划.ts';

/** Agent 定的：用户常回头看前一两天的图，留 3 天 */
export const 预览保留天数 = 3;
export const 预览归档根 = () => 数据路径('archive', '预览');

const 天 = 24 * 3600 * 1000;
const 文字后缀 = new Set(['.md', '.txt', '.toml', '.tsv', '.csv', '.json', '.jsonl', '.srt', '.vtt', '.html']);
/** 文字也有大的（内嵌图表的 html），超过就当媒体删 */
const 文字上限 = 2 * 1024 * 1024;

export const 是文字 = (名: string, 大小: number) => 文字后缀.has(path.extname(名).toLowerCase()) && 大小 <= 文字上限;

/** 夹名开头的 UTC「月日-时分」换成毫秒；没写年份，取不晚于明天的最近一年。认不出返回 null */
export const 夹时间 = (名: string, 现在: number): number | null => {
  const m = /^(\d{2})(\d{2})-(\d{2})(\d{2})-/.exec(名);
  if (!m) return null;
  const [月, 日, 时, 分] = m.slice(1).map(Number) as [number, number, number, number];
  if (月 < 1 || 月 > 12 || 日 < 1 || 日 > 31 || 时 > 23 || 分 > 59) return null;
  const 年 = new Date(现在).getUTCFullYear();
  const t = Date.UTC(年, 月 - 1, 日, 时, 分);
  return t > 现在 + 天 ? Date.UTC(年 - 1, 月 - 1, 日, 时, 分) : t;
};

/** git grep 的输出里取「预览/<夹>/<文件>」，返回「<夹>/<文件>」；中文标点、通配符处截断 */
export const 解析引用 = (文本: string): Set<string> =>
  new Set(
    文本
      .split('\n')
      .map((s) => s.normalize('NFC').replace(/^预览\//, '').split(/[，。、；：）」』】*]/)[0]!.replace(/[.,;:]+$/, ''))
      .filter((s) => s.includes('/')),
  );

/** 主检出里 Git 管的文件按完整路径引用的预览文件 */
export const 被引用的预览文件 = (根 = 主检出()): Set<string> => {
  const r = spawnSync('git', ['grep', '-ohE', '预览/[^[:space:]`"\'()]+'], { cwd: 根, encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status === 1) return new Set(); // 一处都没有
  if (r.status !== 0) throw new Error(`git grep 找预览引用失败，不清理（引用的会被误删）：${r.stderr || r.error?.message}`);
  return 解析引用(r.stdout);
};

type 文件 = { 相对: string; 大小: number };
const 列文件 = (目录: string, 前缀 = ''): 文件[] =>
  fs.readdirSync(目录, { withFileTypes: true }).flatMap((e) => {
    const 相对 = path.join(前缀, e.name);
    return e.isDirectory() ? 列文件(path.join(目录, e.name), 相对) : [{ 相对, 大小: fs.lstatSync(path.join(目录, e.name)).size }];
  });
const 子目录 = (根: string) => (fs.existsSync(根) ? fs.readdirSync(根, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);

/** 归档到 不是 null 的是 预览/ 里过时的夹：留的挪过去，整夹删；null 的是归档里的夹，只删媒体 */
export type 夹计划 = { 名: string; 目录: string; 归档到: string | null; 留: string[]; 删: 文件[] };

export const 规划预览清理 = (o: { 预览根: string; 归档根: string; 现在: number; 天数: number; 引用: Set<string> }): 夹计划[] => {
  const 计划: 夹计划[] = [];
  const 分 = (名: string, 目录: string, 归档到: string | null) => {
    const 留: string[] = [];
    const 删: 文件[] = [];
    for (const f of 列文件(目录)) {
      const 键 = `${名}/${f.相对.split(path.sep).join('/')}`.normalize('NFC');
      if (是文字(f.相对, f.大小) || o.引用.has(键)) 留.push(f.相对);
      else 删.push(f);
    }
    if (归档到 || 删.length) 计划.push({ 名, 目录, 归档到, 留, 删 });
  };
  for (const 名 of 子目录(o.预览根)) {
    const 目录 = path.join(o.预览根, 名);
    const t = 夹时间(名, o.现在) ?? fs.statSync(目录).mtimeMs;
    if (o.现在 - t >= o.天数 * 天) 分(名, 目录, path.join(o.归档根, 名));
  }
  for (const 名 of 子目录(o.归档根)) 分(名, path.join(o.归档根, 名), null);
  return 计划;
};

/** 草稿里按日期起名、超过天数没动的 */
export const 规划草稿清理 = (根: string, 现在: number, 天数 = 默认天数.草稿): 目录条目[] =>
  规划草稿(列目录(根, 2, (名) => /^\d{4}-\d{4}-/.test(名)), { 现在, 天数 }).filter((d) => !d.理由.length);

const 不撞名 = (p: string) => {
  if (!fs.existsSync(p)) return p;
  const { dir, name, ext } = path.parse(p);
  for (let i = 2; ; i++) if (!fs.existsSync(path.join(dir, `${name}-${i}${ext}`))) return path.join(dir, `${name}-${i}${ext}`);
};

/** 别的进程同时在清，文件没了就算了 */
const 没了也行 = (f: () => void) => {
  try {
    f();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
};

const 挪 = (从: string, 到: string) => {
  try {
    fs.renameSync(从, 到);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    fs.copyFileSync(从, 到);
    fs.rmSync(从, { force: true });
  }
};

const 删空目录 = (目录: string): boolean => {
  if (!fs.existsSync(目录)) return true;
  const 空 = fs.readdirSync(目录, { withFileTypes: true }).every((e) => e.isDirectory() && 删空目录(path.join(目录, e.name)));
  if (空) fs.rmdirSync(目录);
  return 空;
};

export type 清理结果 = { 归档夹: number; 删文件: number; 删字节: number; 删草稿: number; 草稿字节: number };

export const 执行清理 = (计划: 夹计划[], 草稿: 目录条目[]): 清理结果 => {
  const r: 清理结果 = { 归档夹: 0, 删文件: 0, 删字节: 0, 删草稿: 0, 草稿字节: 0 };
  for (const p of 计划) {
    for (const f of p.删) {
      fs.rmSync(path.join(p.目录, f.相对), { force: true });
      r.删文件++;
      r.删字节 += f.大小;
    }
    if (p.归档到) {
      for (const 相对 of p.留)
        没了也行(() => {
          const 到 = 不撞名(path.join(p.归档到!, 相对));
          fs.mkdirSync(path.dirname(到), { recursive: true });
          挪(path.join(p.目录, 相对), 到);
        });
      fs.rmSync(p.目录, { recursive: true, force: true });
      r.归档夹++;
    } else 删空目录(p.目录);
  }
  for (const d of 草稿) {
    fs.rmSync(d.路径, { recursive: true, force: true });
    r.删草稿++;
    r.草稿字节 += d.大小;
  }
  return r;
};

export const 规划默认清理 = (现在 = Date.now(), 天数 = 预览保留天数) => ({
  计划: 规划预览清理({ 预览根: path.join(主检出(), '预览'), 归档根: 预览归档根(), 现在, 天数, 引用: 被引用的预览文件() }),
  草稿: 规划草稿清理(草稿根(), 现在),
});

const MB = (n: number) => `${(n / 1024 / 1024).toFixed(0)} MB`;
export const 清理小结 = (r: 清理结果) =>
  [r.归档夹 && `${r.归档夹} 个过时的预览夹只留文字挪进 archive/预览/`, r.删文件 && `删了 ${r.删文件} 个图、视频、声音（${MB(r.删字节)}）`, r.删草稿 && `删了 ${r.删草稿} 个旧草稿（${MB(r.草稿字节)}）`]
    .filter(Boolean)
    .join('，');
