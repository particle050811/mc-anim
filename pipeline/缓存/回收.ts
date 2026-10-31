// anim cache gc 的规划：数据根和代码检出里各类缓存哪些删、哪些留、为什么留。这里只有纯规划和扫描（不删东西），删在 执行.ts。
// 母版、叠层（cache/{母版,叠层}/<作品>/<键>/<指纹前 16 位>.{mkv,mov}）：只删媒体文件，旁边的 .指纹.json 一律留（stale 拿它说明哪项变了）。
//   留：各渲染级别的当前指纹、认可记录那版（verify 拿它逐像素比；没了只能退回去比块均值）、交付 manifest 引用的（edit-package 要读）、
//   每段每级别最近渲的一份（film --允许过期 取它）、近 N 天渲的（别的 worktree 正在用的指纹这边算不出来）、这段当前指纹算不出时整个目录。
// 草稿（run/草稿/<目录>）超过 N 天删；webpack 缓存（<检出>/node_modules/.cache/webpack/remotion-<环境>-<版本>/<哈希>/）换了 Remotion 版本的整个删，
// 同版本的每个环境留最近用的一份，其余超过 N 天没用的删。地形烘焙的暂存目录（run/暂存/terrain/<包>）写入锁没人拿、1 天没动的删。
// 列段、音频数这类认得但不自动删的只报大小（计划.ts 的 只报目录）；不认识的目录只报告。
// 解钉（01-推荐方案.md 第四节 D 的顺序）：交付自足了（有 全片-未拉响度.flac 和 剪辑包/画面.mp4，edit-package 不再读母版）才不再钉它引用的母版、叠层；
// 认可有了认可参考（文件名绑定认可记录的抽样哈希）才不再钉认可那版的母版。这一步 解钉 默认关（gc 删什么不变），只在报告的说明里标出「已自足」「有认可参考」。
import fs from 'node:fs';
import path from 'node:path';
import { 持有者, 持有者主机, 进程在吗 } from '../闸/锁.ts';

export type 保留类 = '当前' | '认可' | '交付' | '最近一份' | '近期' | '在用' | '算不出';
/** 报告里按这个顺序算「主要因为什么留」 */
export const 保留类顺序: readonly 保留类[] = ['当前', '认可', '交付', '最近一份', '近期', '在用', '算不出'];
export type 保留理由 = { 类: 保留类; 说明: string };

const 天 = 24 * 3600 * 1000;

/** 比较用的路径：绝对、NFC；Windows 不分大小写 */
export const 规范路径 = (p: string) => {
  const r = path.resolve(p).normalize('NFC');
  return process.platform === 'win32' ? r.toLowerCase() : r;
};

const 在目录里 = (文件: string, 目录: string) => {
  const r = path.relative(目录, 文件);
  return r !== '' && !r.startsWith('..') && !path.isAbsolute(r);
};

/** 要留的文件（按路径）和要整个留的目录 */
export class 保留集 {
  readonly 文件 = new Map<string, 保留理由[]>();
  readonly 目录 = new Map<string, 保留理由[]>();

  加(文件: string, 理由: 保留理由) {
    const k = 规范路径(文件);
    const 已有 = this.文件.get(k) ?? [];
    if (!已有.some((x) => x.类 === 理由.类 && x.说明 === 理由.说明)) 已有.push(理由);
    this.文件.set(k, 已有);
  }

  加目录(目录: string, 理由: 保留理由) {
    const k = 规范路径(目录);
    this.目录.set(k, [...(this.目录.get(k) ?? []), 理由]);
  }

  查(文件: string): 保留理由[] {
    const k = 规范路径(文件);
    const r = [...(this.文件.get(k) ?? [])];
    for (const [d, 理由们] of this.目录) if (在目录里(k, d)) r.push(...理由们);
    return r;
  }
}

// ---------- 母版、叠层 ----------

export type 缓存种 = '母版' | '叠层';
export const 媒体后缀: Record<缓存种, string> = { 母版: '.mkv', 叠层: '.mov' };

export type 媒体文件 = {
  路径: string;
  种: 缓存种;
  作品: string;
  /** 段键（叠层是 <段键>-<名>） */
  键: string;
  /** 文件名里的指纹前 16 位 */
  指纹: string;
  大小: number;
  改于: number;
  /**
   * 旁边 .指纹.json 的修改时间（没有 json 用媒体文件的）。「最近一份」按它排，和 film --允许过期 用的 历史指纹 同序：
   * 迁移时硬链接到新指纹名下的母版，媒体文件还是旧的修改时间，json 是新的
   */
  记于: number;
  /** 旁边 .指纹.json 里 渲染设置.inputProps.级别；没有 json 或读不出是 null */
  级别: string | null;
  /** 设备-inode 和硬链接数：迁移时有过把同一份母版硬链接到新指纹名下，删掉一个名字不腾空间 */
  inode: string;
  链数: number;
};
export type 带理由<T> = T & { 理由: 保留理由[] };

/** 渲染中途崩掉留下的临时文件（渲.ts 的 .渲染中-<pid>、母版.ts 原子写 的 .写入中-<pid>） */
export const 是临时名 = (名: string) => /\.(渲染中|写入中)-\d+/.test(名);
const 媒体名 = /^([0-9a-f]{16})\.(mkv|mov)$/;

export type 普通文件 = { 路径: string; 大小: number; 改于: number };

export type 媒体扫描 = { 媒体: 媒体文件[]; 临时: 普通文件[]; 不认识: 普通文件[] };

/** 读 .指纹.json 里的渲染级别；文件可能是旧算法的，只认 项.渲染设置.inputProps.级别 */
export const 读级别 = (json文件: string): string | null => {
  try {
    const j = JSON.parse(fs.readFileSync(json文件, 'utf8')) as { 项?: { 渲染设置?: { inputProps?: { 级别?: unknown } } } };
    const v = j.项?.渲染设置?.inputProps?.级别;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
};

/** 扫 cache/<种>/<作品>/ 下各键目录 */
export const 扫媒体 = (作品目录: string, 种: 缓存种, 作品: string): 媒体扫描 => {
  const r: 媒体扫描 = { 媒体: [], 临时: [], 不认识: [] };
  if (!fs.existsSync(作品目录)) return r;
  for (const 键 of fs.readdirSync(作品目录)) {
    const dir = path.join(作品目录, 键);
    const 目录st = fs.statSync(dir);
    if (!目录st.isDirectory()) {
      r.不认识.push({ 路径: dir, 大小: 目录st.size, 改于: 目录st.mtimeMs });
      continue;
    }
    for (const 名 of fs.readdirSync(dir)) {
      const f = path.join(dir, 名);
      const st = fs.lstatSync(f);
      if (!st.isFile()) {
        r.不认识.push({ 路径: f, 大小: 0, 改于: st.mtimeMs });
        continue;
      }
      const m = 媒体名.exec(名);
      if (m && `.${m[2]}` === 媒体后缀[种]) {
        const json = path.join(dir, `${m[1]}.指纹.json`);
        const 有json = fs.existsSync(json);
        r.媒体.push({
          路径: f, 种, 作品, 键, 指纹: m[1]!, 大小: st.size, 改于: st.mtimeMs, 记于: 有json ? fs.statSync(json).mtimeMs : st.mtimeMs,
          级别: 有json ? 读级别(json) : null, inode: `${st.dev}-${st.ino}`, 链数: st.nlink,
        });
      } else if (是临时名(名)) r.临时.push({ 路径: f, 大小: st.size, 改于: st.mtimeMs });
      else if (!名.endsWith('.指纹.json')) r.不认识.push({ 路径: f, 大小: st.size, 改于: st.mtimeMs });
    }
  }
  return r;
};

/**
 * 给每个媒体文件定留不留：保留集里有的留；另外每个（种、作品、键、级别）记于最新的一份留（理由「最近一份」；
 * 每个级别的都留，不分级别的 历史指纹 取的那份也就在里面），近 近期天数 天里改过的留（「近期」）。理由为空的就是要删的。
 */
export const 规划媒体 = (文件们: readonly 媒体文件[], 保留: 保留集, o: { 现在: number; 近期天数: number }): 带理由<媒体文件>[] => {
  const 最近 = new Map<string, 媒体文件>();
  for (const f of 文件们) {
    const k = [f.种, f.作品, f.键, f.级别 ?? '?'].join('\0');
    const 已 = 最近.get(k);
    if (!已 || f.记于 > 已.记于) 最近.set(k, f);
  }
  const 最近集 = new Set([...最近.values()]);
  return 文件们.map((f) => {
    const 理由 = 保留.查(f.路径);
    if (最近集.has(f)) 理由.push({ 类: '最近一份', 说明: f.级别 ?? '级别不明' });
    if (o.现在 - f.改于 < o.近期天数 * 天) 理由.push({ 类: '近期', 说明: `${o.近期天数} 天内` });
    return { ...f, 理由 };
  });
};

/** 临时残留：超过 1 天还在的就是崩掉留下的（正在渲的那份改于一直在更新） */
export const 规划临时 = (文件们: readonly 普通文件[], 现在: number): 带理由<普通文件>[] =>
  文件们.map((f) => ({ ...f, 理由: 现在 - f.改于 < 天 ? [{ 类: '近期' as const, 说明: '1 天内，可能还在写' }] : [] }));

// ---------- 认可、交付 ----------

/** 认可记录 <作品根>/认可/<平台>/<段键>.toml 的 段 和 指纹（只取这两项，别的字段坏了也不影响回收） */
export const 读认可指纹 = (file: string): { 段: string; 指纹: string } | null => {
  const t = fs.readFileSync(file, 'utf8');
  const 段 = /^"段"\s*=\s*"([^"]+)"/m.exec(t)?.[1];
  const 指纹 = /^"指纹"\s*=\s*"([0-9a-f]{16,64})"/m.exec(t)?.[1];
  return 段 && 指纹 ? { 段, 指纹 } : null;
};

export type 解钉选项 = {
  /** true：自足的交付、有认可参考的认可不再钉母版。默认 false */
  解钉?: boolean;
  /** 认可记录文件 → 它在这个平台的认可参考（验收/参考.ts 的 参考文件，按记录的抽样哈希起名）；读不出记录返回 null。不给就当都没有参考 */
  参考文件?: (认可文件: string, 平台: string) => string | null;
};

/** 认可记录里各段那版的母版进保留集（各平台的都算；别的平台的指纹本机本来就没有，加了也无妨）。读不出的记录整段目录留下 */
export const 加认可 = (保留: 保留集, 作品根: string, 母版目录: (段键: string) => string, 警告: (s: string) => void = () => {}, o: 解钉选项 = {}) => {
  const 根 = path.join(作品根, '认可');
  if (!fs.existsSync(根)) return;
  for (const 平台 of fs.readdirSync(根)) {
    const dir = path.join(根, 平台);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const 名 of fs.readdirSync(dir).filter((n) => n.endsWith('.toml'))) {
      const file = path.join(dir, 名);
      const r = 读认可指纹(file);
      const 段键 = 名.slice(0, -'.toml'.length);
      if (!r) {
        警告(`${file} 读不出 段 和 指纹，${段键} 的母版整个留着`);
        保留.加目录(母版目录(段键), { 类: '算不出', 说明: '认可记录读不出' });
        continue;
      }
      const 参考 = o.参考文件?.(file, 平台);
      const 有参考 = !!参考 && fs.existsSync(参考);
      if (有参考 && o.解钉) continue;
      保留.加(path.join(母版目录(r.段), `${r.指纹.slice(0, 16)}${媒体后缀.母版}`), { 类: '认可', 说明: 有参考 ? `${平台}（有认可参考）` : 平台 });
    }
  }
};

/**
 * 一份交付 manifest.json 引用的母版、叠层（anim film 写的：v1 段[].母版，相对数据根，早先的是绝对路径；
 * v2 段不记母版，按 cache/母版/<作品>/<键>/<指纹前 16 位>.mkv 算，和 合成/交付.ts 的 交付母版 同一条规则；叠层[].文件 两版都有）。
 * 作品 是 manifest 没写作品时的兜底（交付目录的上一级）
 */
export const 交付引用 = (manifest: unknown, 作品?: string): string[] => {
  const m = (manifest ?? {}) as { 作品?: unknown; 段?: { 母版?: unknown; 键?: unknown; 指纹?: unknown }[]; 叠层?: { 文件?: unknown }[] };
  const 品 = typeof m.作品 === 'string' ? m.作品 : 作品;
  const r: string[] = [];
  for (const s of Array.isArray(m.段) ? m.段 : []) {
    if (typeof s?.母版 === 'string') r.push(s.母版);
    else if (品 && typeof s?.键 === 'string' && typeof s?.指纹 === 'string') r.push(['cache', '母版', 品, s.键, `${s.指纹.slice(0, 16)}${媒体后缀.母版}`].join('/'));
  }
  for (const l of Array.isArray(m.叠层) ? m.叠层 : []) if (typeof l?.文件 === 'string') r.push(l.文件);
  return r;
};

/** 交付/ 下找 manifest.json（交付/<作品>/<目录>/，也认更早不分作品的 交付/<目录>/） */
export const 找交付manifest = (交付根: string, 深 = 3): string[] => {
  if (!fs.existsSync(交付根)) return [];
  const r: string[] = [];
  const 走 = (dir: string, 层: number) => {
    const m = path.join(dir, 'manifest.json');
    if (fs.existsSync(m)) {
      r.push(m);
      return;
    }
    if (层 >= 深) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) 走(path.join(dir, e.name), 层 + 1);
  };
  走(交付根, 0);
  return r.sort();
};

/**
 * 交付自足：edit-package 要的都在交付目录里了，不再读母版（文件名同 合成/交付.ts）。不管作品开没开剪辑包都要两样：
 * 没开剪辑包的作品 film 不出画面，edit-package 还得拿母版现做，这种交付就一直钉着母版
 */
export const 交付自足 = (交付目录: string) =>
  fs.existsSync(path.join(交付目录, '全片-未拉响度.flac')) && fs.existsSync(path.join(交付目录, '剪辑包', '画面.mp4'));

/** 交付 manifest 引用的母版、叠层进保留集，说明写交付目录（相对交付根） */
export const 加交付 = (保留: 保留集, 交付根: string, 数据根: string, 警告: (s: string) => void = () => {}, o: 解钉选项 = {}) => {
  for (const m of 找交付manifest(交付根)) {
    let 引用: string[];
    let 作品: string;
    try {
      const j = JSON.parse(fs.readFileSync(m, 'utf8')) as { 作品?: unknown };
      作品 = typeof j?.作品 === 'string' ? j.作品 : path.basename(path.dirname(path.dirname(m)));
      引用 = 交付引用(j, 作品);
    } catch (e) {
      警告(`${m} 读不出（${(e as Error).message}），它引用的母版不知道，按没有算`);
      continue;
    }
    const 自足 = 交付自足(path.dirname(m));
    if (自足 && o.解钉) continue;
    const 说明 = path.relative(交付根, path.dirname(m)).split(path.sep).join('/') + (自足 ? '（已自足）' : '');
    for (const p of 引用) 保留.加(path.isAbsolute(p) ? p : path.join(数据根, ...p.split('/')), { 类: '交付', 说明 });
  }
};

// ---------- 目录（草稿、webpack、不认识的） ----------

export type 目录条目 = { 路径: string; 名: string; 大小: number; 改于: number };

/** 目录总大小（不跟符号链接、junction） */
export const 目录大小 = (p: string): number => {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(p);
  } catch {
    return 0;
  }
  if (!st.isDirectory()) return st.isFile() ? st.size : 0;
  let n = 0;
  for (const e of fs.readdirSync(p)) n += 目录大小(path.join(p, e));
  return n;
};

/** 目录里最近改动的时间（递归到 深 层；webpack 写缓存是新建 pack 文件，草稿是往里加文件） */
export const 最近改于 = (p: string, 深 = 2): number => {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(p);
  } catch {
    return 0;
  }
  let t = st.mtimeMs;
  if (st.isDirectory() && 深 > 0) for (const e of fs.readdirSync(p)) t = Math.max(t, 最近改于(path.join(p, e), 深 - 1));
  return t;
};

/** 根下各条目的大小和最近改动；给了 要 就只算它挑中的（大小要整棵走一遍，cache/母版 这类大目录不该白走） */
export const 列目录 = (根: string, 深 = 2, 要: (名: string) => boolean = () => true): 目录条目[] =>
  fs.existsSync(根)
    ? fs.readdirSync(根).filter(要).map((名) => ({ 路径: path.join(根, 名), 名, 大小: 目录大小(path.join(根, 名)), 改于: 最近改于(path.join(根, 名), 深) }))
    : [];

/** 草稿：最近改动超过 天数 天的删 */
export const 规划草稿 = (条目们: readonly 目录条目[], o: { 现在: number; 天数: number }): 带理由<目录条目>[] =>
  条目们.map((e) => ({ ...e, 理由: o.现在 - e.改于 < o.天数 * 天 ? [{ 类: '近期' as const, 说明: `${o.天数} 天内` }] : [] }));

/** 只报不删：根下不在 认识 里的条目 */
export const 不认识条目 = (根: string, 认识: readonly string[]): 目录条目[] => 列目录(根, 1, (名) => !认识.includes(名));

// ---------- 地形暂存 ----------

/** 锁文件有没有活着的持有者（协议见 闸/锁.ts：空文件、别的主机的都当有人拿着） */
export const 锁有人拿 = (锁: string, 本机: string): boolean => {
  if (!fs.existsSync(锁)) return false;
  const pid = 持有者(锁);
  if (pid === null) return true;
  const 主机 = 持有者主机(锁, pid);
  return (主机 !== null && 主机 !== 本机) || 进程在吗(pid);
};

export type 暂存条目 = 目录条目 & { 锁在用: boolean };

/** run/暂存/terrain 下各包的暂存目录（世界/版本.ts 的 新暂存：锁是旁边的 <包>.写入.lock） */
export const 扫暂存 = (根: string, 本机 = ''): 暂存条目[] =>
  列目录(根, 3, (名) => !名.includes('.lock')).filter((e) => fs.statSync(e.路径).isDirectory()).map((e) => ({ ...e, 锁在用: 锁有人拿(`${e.路径}.写入.lock`, 本机) }));

/** 暂存目录：锁有人拿着的留（正在烘焙）；1 天内动过的留；别的是烘焙中断留下的（下次烘焙同一个包也会先删它） */
export const 规划暂存 = (条目们: readonly 暂存条目[], 现在: number): 带理由<目录条目>[] =>
  条目们.map(({ 锁在用, ...e }) => ({
    ...e,
    理由: 锁在用 ? [{ 类: '在用' as const, 说明: '写入锁有人拿着' }] : 现在 - e.改于 < 天 ? [{ 类: '近期' as const, 说明: '1 天内，可能还在写' }] : [],
  }));

// webpack 缓存：Remotion 按 remotion-<environment>-<VERSION>/<webpack 配置的 md5> 起名（@remotion/bundler 的 webpack-cache.js）

export type webpack条目 = 目录条目 & { 环境: string; 版本: string; 哈希: string | null };
const 环境目录名 = /^remotion-([a-z]+)-(\d+\.\d+\.\d+(?:[-+][\w.]+)?)$/;

/** 扫一个 node_modules/.cache/webpack：认得的环境目录逐个哈希列出（版本不对的整个一条），认不得的另列 */
export const 扫webpack = (根: string, 当前版本: string | null): { 条目: webpack条目[]; 不认识: 目录条目[] } => {
  const r = { 条目: [] as webpack条目[], 不认识: [] as 目录条目[] };
  for (const e of 列目录(根, 0)) {
    const m = 环境目录名.exec(e.名);
    if (!m || !fs.statSync(e.路径).isDirectory()) {
      r.不认识.push(e);
      continue;
    }
    const [, 环境, 版本] = m as unknown as [string, string, string];
    if (当前版本 !== null && 版本 !== 当前版本) {
      r.条目.push({ ...e, 改于: 最近改于(e.路径, 3), 环境, 版本, 哈希: null });
      continue;
    }
    for (const h of 列目录(e.路径, 2)) r.条目.push({ ...h, 名: `${e.名}/${h.名}`, 环境, 版本, 哈希: h.名 });
  }
  return r;
};

/**
 * 换了 Remotion 版本的整个删；同版本每个环境留最近用的 每环境留 份，其余 天数 天内用过的留。
 * 每部作品的打包入口、资产锁不同，各有各的缓存目录，所以 每环境留 默认取作品数。
 */
export const 规划webpack = (条目们: readonly webpack条目[], o: { 当前版本: string | null; 现在: number; 天数: number; 每环境留?: number }): 带理由<webpack条目>[] => {
  const 按环境 = new Map<string, webpack条目[]>();
  for (const e of 条目们) if (e.哈希 !== null) 按环境.set(`${e.环境}-${e.版本}`, [...(按环境.get(`${e.环境}-${e.版本}`) ?? []), e]);
  const 最近 = new Set([...按环境.values()].flatMap((es) => [...es].sort((a, b) => b.改于 - a.改于).slice(0, Math.max(1, o.每环境留 ?? 1))));
  return 条目们.map((e) => {
    if (e.哈希 === null) return { ...e, 理由: o.当前版本 === null ? [{ 类: '算不出' as const, 说明: '不知道装的 Remotion 版本' }] : [] };
    const 理由: 保留理由[] = [];
    if (最近.has(e)) 理由.push({ 类: '最近一份', 说明: e.环境 });
    if (o.现在 - e.改于 < o.天数 * 天) 理由.push({ 类: '近期', 说明: `${o.天数} 天内用过` });
    return { ...e, 理由 };
  });
};

// ---------- 汇总 ----------

export const 主要理由 = (理由: readonly 保留理由[]): 保留类 | null => 保留类顺序.find((c) => 理由.some((x) => x.类 === c)) ?? null;

/** 删大小只算真腾出来的：同一 inode 的名字全删了、而且没有计划外的硬链接；留大小同一 inode 只算一次 */
export type 小计 = { 删数: number; 删大小: number; 留数: number; 留大小: number; 按理由: Partial<Record<保留类, number>>; 硬链接未腾: number };
type 计项 = { 大小: number; 理由: readonly 保留理由[]; inode?: string; 链数?: number };

export const 小计 = (项: readonly 计项[]): 小计 => {
  const r: 小计 = { 删数: 0, 删大小: 0, 留数: 0, 留大小: 0, 按理由: {}, 硬链接未腾: 0 };
  const 按inode = new Map<string, 计项[]>();
  项.forEach((x, i) => {
    const k = x.inode ?? `#${i}`;
    按inode.set(k, [...(按inode.get(k) ?? []), x]);
  });
  for (const 组 of 按inode.values()) {
    const 留 = 组.filter((x) => 主要理由(x.理由) !== null);
    r.删数 += 组.length - 留.length;
    r.留数 += 留.length;
    const 大小 = 组[0]!.大小;
    if (留.length) {
      const c = 保留类顺序.find((c) => 留.some((x) => x.理由.some((y) => y.类 === c)))!;
      r.留大小 += 大小;
      r.按理由[c] = (r.按理由[c] ?? 0) + 大小;
    } else if (组.length >= (组[0]!.链数 ?? 1)) r.删大小 += 大小;
    else r.硬链接未腾 += 大小;
  }
  return r;
};

export const 大小文本 = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(0)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} KB` : `${n} B`);
