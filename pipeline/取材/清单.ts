// 读 sourcing/extract.toml（取材条目）和 sourcing/jars.toml（jar 登记），格式见两个文件开头。
// 这里只做解析、选条目、展开步骤和产物，跑和查在 提取.ts。
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { 代码根 } from '../环境/路径.ts';
import type { 资产锁 } from '../资产/资产锁.ts';

export type 输出参数 = { 输出: string[] };
export type 步骤 = (string | 输出参数)[];
export type 取材条目 = {
  名称: string;
  需要: string[];
  前置: string[];
  要开游戏: boolean;
  待迁移?: string;
  公开版?: string;
  /** 产物登记在这部作品的资产表：只在选了它时跑、查 */
  作品?: string;
  步骤: 步骤[];
  输入: Record<string, string>;
  产物: Record<string, string>;
  说明?: string;
};
export type jar登记 = { id: string; 到: string; sha256?: string };
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
      公开版: raw['公开版'] as string | undefined,
      作品: raw['作品'] as string | undefined,
      步骤: (raw['步骤'] as 步骤[] | undefined) ?? [],
      输入: (raw['输入'] as Record<string, string> | undefined) ?? {},
      产物: (raw['产物'] as Record<string, string> | undefined) ?? {},
      说明: raw['说明'] as string | undefined,
    };
    if (条目.has(e.名称)) throw new Error(`取材清单里「${e.名称}」写了两条`);
    条目.set(e.名称, e);
  }
  const j = parse(jar文本) as { Mojang?: { 客户端?: jar登记[]; 要自己生成?: jar登记[] }; 模组?: jar登记[] };
  const jars = new Map<string, jar登记>();
  for (const x of [...(j.Mojang?.客户端 ?? []), ...(j.Mojang?.要自己生成 ?? []), ...(j.模组 ?? [])]) jars.set(x.id, x);
  return { 程序: (d['程序'] as Record<string, string[]>) ?? {}, 组: (d['组'] as Record<string, string[]>) ?? {}, 条目, jars };
};

export const 读清单 = () =>
  解析清单(fs.readFileSync(path.join(取材目录(), 'extract.toml'), 'utf8'), fs.readFileSync(path.join(取材目录(), 'jars.toml'), 'utf8'));

/** 能直接跑的：有步骤、不用开游戏、不待迁移（--全部 就是这些） */
export const 可直接跑 = (e: 取材条目) => e.步骤.length > 0 && !e.要开游戏 && !e.待迁移;

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

export type 展开环境 = { jar路径: (id: string) => string; prism数据: string; 脚本: string; 作品根: string; python: string; mcai: string[] };

/** 参数里的 {jar:a,b}、{prism数据}、{脚本}、{作品根} 换成本机路径 */
export const 填 = (a: string, v: 展开环境) =>
  a
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
