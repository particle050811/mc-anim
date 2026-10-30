// 读 sourcing/extract.toml（取材条目）和 sourcing/jars.toml（jar 登记），格式见两个文件开头。
// 这里只做解析、选条目、展开步骤和产物，跑和查在 提取.ts。
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { 代码根 } from '../环境/路径.ts';
import type { 资产锁 } from '../资产/资产锁.ts';
import type { 可见性 } from '../资产/资产表.ts';
import { 读jar许可, 许可部分取值, type jar许可, type 许可部分 } from './许可.ts';

export type 输出参数 = { 输出: string[] };
export type 步骤 = (string | 输出参数)[];
export type 取材条目 = {
  名称: string;
  需要: string[];
  前置: string[];
  要开游戏: boolean;
  待迁移?: string;
  /** 步骤只是记录（网格头反填的范围，网格配方.ts）：锁里那一版重导对不上，anim extract 不跑，--只打印 照样列 */
  不重导?: string;
  公开版?: string;
  /** 产物登记在这部作品的资产表：只在选了它时跑、查 */
  作品?: string;
  步骤: 步骤[];
  输入: Record<string, string>;
  产物: Record<string, string>;
  说明?: string;
  /** --登记 写进资产表的可见性；不写时 公开版="提取" 的取「提取」，别的要写 */
  可见性?: 可见性;
  /** 产物的许可取 jar 的哪几部分：数组 = 全部产物，表 = 按 id 第一段（类别）分别写；没写的按类别默认（许可.ts 默认部分） */
  许可部分?: 许可部分[] | Record<string, 许可部分[]>;
};
/**
 * 根：「到」相对哪个目录，游戏 = anim 配置 ANIM_GAME，mc资源 = ANIM_MC_ASSETS（资源索引在那），
 * 数据 = 数据根（ANIM_DATA；官方映射这类不许再分发、本机按「下载」自取的放 cache/映射/，anim extract --下载 取）。
 * 也认：「到」没有时依次再找的位置，写成「<根>:<相对路径>」（早先放在游戏目录里的照样认）
 */
export const jar根取值 = ['游戏', 'mc资源', '数据'] as const;
export type jar根 = (typeof jar根取值)[number];
export type jar登记 = { id: string; 到: string; sha256?: string; sha1?: string; 下载?: string; 根?: jar根; 也认?: string[]; 许可?: jar许可; 旧sha256前缀?: string[] };

/** 「<根>:<相对路径>」→ [根, 相对路径]；没写根的按游戏 */
export const 拆位置 = (x: string): [jar根, string] => {
  const m = /^([^:/\\]+):(.+)$/.exec(x);
  if (!m) return ['游戏', x];
  if (!(jar根取值 as readonly string[]).includes(m[1]!)) throw new Error(`jars.toml 的位置「${x}」：根只认 ${jar根取值.join('、')}`);
  return [m[1] as jar根, m[2]!];
};
export type 取材清单 = { 程序: Record<string, string[]>; 组: Record<string, string[]>; 条目: Map<string, 取材条目>; jars: Map<string, jar登记> };

export const 取材目录 = () => path.join(代码根(), 'sourcing');
export const 脚本目录 = () => path.join(取材目录(), 'extract');

export const 解析清单 = (清单文本: string, jar文本: string): 取材清单 => {
  const d = parse(清单文本) as Record<string, unknown>;
  const 条目 = new Map<string, 取材条目>();
  for (const raw of (d['取材'] ?? []) as Record<string, unknown>[]) {
    const e: 取材条目 = {
      名称: String(raw['名称']),
      需要: (raw['需要'] as string[] | undefined) ?? [],
      前置: (raw['前置'] as string[] | undefined) ?? [],
      要开游戏: raw['要开游戏'] === true,
      待迁移: raw['待迁移'] as string | undefined,
      不重导: raw['不重导'] as string | undefined,
      公开版: raw['公开版'] as string | undefined,
      作品: raw['作品'] as string | undefined,
      步骤: (raw['步骤'] as 步骤[] | undefined) ?? [],
      输入: (raw['输入'] as Record<string, string> | undefined) ?? {},
      产物: (raw['产物'] as Record<string, string> | undefined) ?? {},
      说明: raw['说明'] as string | undefined,
      可见性: raw['可见性'] as 可见性 | undefined,
      许可部分: raw['许可部分'] as 取材条目['许可部分'],
    };
    const 部分们 = Array.isArray(e.许可部分) ? e.许可部分 : Object.values(e.许可部分 ?? {}).flat();
    const 坏部分 = 部分们.filter((p) => !(许可部分取值 as readonly string[]).includes(p));
    if (坏部分.length) throw new Error(`取材清单「${e.名称}」的 许可部分 只认 ${许可部分取值.join('、')}：${坏部分.join('、')}`);
    if (条目.has(e.名称)) throw new Error(`取材清单里「${e.名称}」写了两条`);
    条目.set(e.名称, e);
  }
  type 原jar = Omit<jar登记, '许可'> & { 许可?: unknown };
  // 映射：官方 client.txt 这类非 jar 文件，登记、查 sha 和 jar 一样
  const j = parse(jar文本) as { Mojang?: { 资源索引?: 原jar[] | 原jar; 客户端?: 原jar[]; 映射?: 原jar[]; 要自己生成?: 原jar[] }; 模组?: 原jar[] };
  const jars = new Map<string, jar登记>();
  // 资源索引旧写法是单张表、没有 id，只给人看，不进 jar 表
  const 索引 = Array.isArray(j.Mojang?.资源索引) ? j.Mojang.资源索引 : [];
  for (const x of [...索引, ...(j.Mojang?.客户端 ?? []), ...(j.Mojang?.映射 ?? []), ...(j.Mojang?.要自己生成 ?? []), ...(j.模组 ?? [])]) {
    if (jars.has(x.id)) throw new Error(`jars.toml 里 id「${x.id}」写了两条`);
    if (x.根 !== undefined && !(jar根取值 as readonly string[]).includes(x.根)) throw new Error(`jars.toml 的 ${x.id}：根只认 ${jar根取值.join('、')}，写的是「${x.根}」`);
    for (const y of x.也认 ?? []) 拆位置(y);
    jars.set(x.id, { ...x, 许可: x.许可 === undefined ? undefined : 读jar许可(x.许可) });
  }
  return { 程序: (d['程序'] as Record<string, string[]>) ?? {}, 组: (d['组'] as Record<string, string[]>) ?? {}, 条目, jars };
};

export const 读清单 = () =>
  解析清单(fs.readFileSync(path.join(取材目录(), 'extract.toml'), 'utf8'), fs.readFileSync(path.join(取材目录(), 'jars.toml'), 'utf8'));

/** 能直接跑的：有步骤、不用开游戏、不待迁移、不是不重导（--全部 就是这些） */
export const 可直接跑 = (e: 取材条目) => e.步骤.length > 0 && !e.要开游戏 && !e.待迁移 && !e.不重导;

/** 条目属于所选作品（没写「作品」的各作品都算） */
export const 属于作品 = (e: 取材条目, 作品: string) => e.作品 === undefined || e.作品 === 作品;

/** 名称或组名 → 条目（去重、保持先后）；--全部 见 可直接跑，给了 作品 时不选写了别的作品的 */
export const 选条目 = (q: 取材清单, 名们: readonly string[], 全部: boolean, 作品?: string): 取材条目[] => {
  const out: string[] = [];
  if (全部) out.push(...[...q.条目.values()].filter((e) => 可直接跑(e) && (作品 === undefined || 属于作品(e, 作品))).map((e) => e.名称));
  for (const n of 名们) {
    const got = q.条目.has(n) ? [n] : q.组[n];
    if (!got) throw new Error(`取材清单里没有「${n}」（条目或组）；anim extract --列出 看有哪些`);
    for (const k of got) if (!out.includes(k)) out.push(k);
  }
  return out.map((k) => {
    const e = q.条目.get(k);
    if (!e) throw new Error(`组里的「${k}」不是条目`);
    return e;
  });
};

/**
 * 产物清单：这条配方按资产锁展开的产物（[{id, 文件}] 的 JSON 文件；--新 要的 id 也在里面），给按锁反推要导什么的脚本用（导出音效.py --按产物）。
 * 产物来源：脚本写的 JSON {文件: [用到的 jar 路径…]}（文件相对暂存目录），--登记 照它给每件产物记真正用到的 jar；不写就记配方「需要」的全部 jar
 */
export type 展开环境 = { jar路径: (id: string) => string; prism数据: string; 脚本: string; 作品根: string; python: string; mcai: string[]; 产物清单?: string; 产物来源?: string };

const 只在跑时 = (名: '产物清单' | '产物来源', v: 展开环境) => {
  const f = v[名];
  if (!f) throw new Error(`步骤用了 {${名}}，这里没有（只在 anim extract 跑条目时有）`);
  return f.split(path.sep).join('/');
};

/** 参数里的 {jar:a,b}、{prism数据}、{脚本}、{作品根}、{产物清单}、{产物来源} 换成本机路径 */
export const 填 = (a: string, v: 展开环境) =>
  a
    .replace(/\{产物清单\}/g, () => 只在跑时('产物清单', v))
    .replace(/\{产物来源\}/g, () => 只在跑时('产物来源', v))
    .replace(/\{jar:([^}]+)\}/g, (_, ids: string) => ids.split(',').map((i) => v.jar路径(i).split(path.sep).join('/')).join(','))
    .replaceAll('{prism数据}', v.prism数据.split(path.sep).join('/'))
    .replaceAll('{脚本}', v.脚本.split(path.sep).join('/'))
    .replaceAll('{作品根}', v.作品根.split(path.sep).join('/'));

/** 一步 → 参数（简称、python、mcai 换成真的命令；ts 是旧项目的工具，还没搬） */
export const 展开步骤 = (q: 取材清单, 步: 步骤, v: 展开环境): 步骤 => {
  const [头, ...余] = 步;
  if (typeof 头 !== 'string') throw new Error('步骤的第一个参数要是程序名');
  let argv: 步骤;
  if (q.程序[头]) argv = [...q.程序[头]!, ...余];
  else if (头 === 'python') argv = [v.python, ...余];
  else if (头 === 'mcai') argv = [...v.mcai, ...余];
  else if (头 === 'ts') throw new Error('步骤用了 ts（旧项目 工具/一镜到底/ 的工具），还没搬过来');
  else argv = 步;
  return argv.map((a) => (typeof a === 'string' ? 填(a, v) : { 输出: 展开步骤(q, a.输出, v) as string[] }));
};

/** 产物表 → [id, 相对暂存目录的文件]；<id 目录>/* 按资产锁里这个目录下一层的 id 展开 */
export const 展开产物 = (表: Record<string, string>, 锁: 资产锁): { 对: [string, string][]; 空: string[] } => {
  const 对: [string, string][] = [];
  const 空: string[] = [];
  for (const [k, f] of Object.entries(表)) {
    if (!k.endsWith('/*')) {
      对.push([k, f]);
      continue;
    }
    const 前缀 = k.slice(0, -1);
    const ids = Object.keys(锁)
      .filter((id) => id.startsWith(前缀) && !id.slice(前缀.length).includes('/'))
      .sort();
    if (!ids.length) 空.push(k);
    for (const id of ids) 对.push([id, f.replace('*', id.slice(前缀.length))]);
  }
  return { 对, 空 };
};

/** --登记 用：<id 目录>/* 再按暂存目录里实有的文件展开（新产物还不在锁里）；文件那边的 * 只匹配一层 */
export const 按文件展开产物 = (表: Record<string, string>, 文件们: readonly string[]): [string, string][] => {
  const 对: [string, string][] = [];
  for (const [k, f] of Object.entries(表)) {
    if (!k.endsWith('/*')) {
      if (文件们.includes(f)) 对.push([k, f]);
      continue;
    }
    const [前, 后] = f.split('*') as [string, string];
    for (const x of 文件们) {
      if (!x.startsWith(前) || !x.endsWith(后) || x.length < 前.length + 后.length + 1) continue;
      const 名 = x.slice(前.length, x.length - 后.length);
      if (!名.includes('/')) 对.push([k.slice(0, -1) + 名, x]);
    }
  }
  return 对.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
};

/** --新：锁里还没有的 id 按产物表找文件（先找写死的那一项，再找 <id 目录>/*：文件把 * 换成 id 最后一段）；对不上任何一项的放进 不认 */
export const 按id展开产物 = (表: Record<string, string>, ids: readonly string[]): { 对: [string, string][]; 不认: string[] } => {
  const 对: [string, string][] = [];
  const 不认: string[] = [];
  for (const id of ids) {
    const 项们 = Object.entries(表);
    const 中 = 项们.find(([k]) => k === id) ?? 项们.find(([k]) => k.endsWith('/*') && id.startsWith(k.slice(0, -1)) && id.length > k.length - 1 && !id.slice(k.length - 1).includes('/'));
    if (!中) 不认.push(id);
    else 对.push([id, 中[0].endsWith('/*') ? 中[1].replace('*', id.slice(中[0].length - 1)) : 中[1]]);
  }
  return { 对, 不认 };
};
