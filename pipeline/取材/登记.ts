// anim extract --登记 / --许可：取材产物自动写资产表、资产锁，许可按 jar 继承（许可.ts）。
// 资产表是人写的 TOML，这里只做两种文本改动，别的行（注释、旧路径、说明）一字不动：
//   追加：新 id 在表尾加一条 [["资产"]]（表文件 = id 第一段，<类>.toml；配方写了「作品」的进 <作品根>/资产表/）；
//   改许可：已登记、许可是 LicenseRef-待定 的，只换那一条的「许可」行。
import fs from 'node:fs';
import path from 'node:path';
import { 作品资产表目录, 资产表目录, 库名, type 可见性, type 资产条目 } from '../资产/资产表.ts';
import { 入库, 写资产锁, 读资产锁, 作品资产锁路径, 资产锁路径, 文件sha256, type 资产锁 } from '../资产/资产锁.ts';
import { 带音频元数据 } from '../资产/音频量.ts';
import type { 取材条目, 取材清单 } from './清单.ts';
import { 默认部分, 继承许可, 许可表, 待定许可, type 继承结果 } from './许可.ts';

const 引 = (s: string) => JSON.stringify(s);

/** 一条资产表条目的 TOML 文本（和 assets/registry 里现有的写法一样：id 裸键，中文键加引号） */
export const 条目文本 = (e: Pick<资产条目, 'id' | '类别' | '来源' | '许可' | '可见性' | '说明'>) =>
  [
    '[["资产"]]',
    `id = ${引(e.id)}`,
    `"类别" = ${引(e.类别)}`,
    `"来源" = ${引(e.来源)}`,
    `"许可" = ${引(e.许可)}`,
    `"可见性" = ${引(e.可见性)}`,
    ...(e.说明 ? [`"说明" = ${引(e.说明)}`] : []),
  ].join('\n') + '\n';

/** 在资产表文本尾部追加几条（文件不存在时由调用方给表头） */
export const 追加条目 = (原文: string, 条目们: Parameters<typeof 条目文本>[0][]) =>
  条目们.reduce((t, e) => `${t.replace(/\n*$/, '\n')}\n${条目文本(e)}`, 原文);

/** 把表里 id 那一条的「许可」行换成新值；找不到那一条或那一条没有许可行就报错 */
export const 改许可 = (原文: string, id: string, 新许可: string): string => {
  const 块们 = 原文.split(/(?=^\[\["资产"\]\]$)/m);
  const i = 块们.findIndex((b) => new RegExp(`^id = ${引(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm').test(b));
  if (i < 0) throw new Error(`表里没有 id = ${引(id)}`);
  const 新块 = 块们[i]!.replace(/^"许可" = "[^"\n]*"$/m, `"许可" = ${引(新许可)}`);
  if (新块 === 块们[i] && !/^"许可" = /m.test(块们[i]!)) throw new Error(`「${id}」那一条没有 "许可" 行`);
  块们[i] = 新块;
  return 块们.join('');
};

const 配方名 = (来源: string) => /^提取:([^@]+)@/.exec(来源)?.[1];

/** 一条资产按 jar 继承许可：部分取配方的「许可部分」，没写按类别 */
export const 资产继承许可 = (q: 取材清单, e: Pick<资产条目, '来源' | '类别'>, 表 = 许可表(q.jars.values())): 继承结果 => {
  const 写的 = q.条目.get(配方名(e.来源) ?? '')?.许可部分;
  const 部分 = Array.isArray(写的) ? 写的 : 写的?.[e.类别];
  return 继承许可(e.来源, 部分 ?? 默认部分(e.类别), 表);
};

export type 补许可结果 = { 能补: { e: 资产条目; 许可: string }[]; 仍待定: { e: 资产条目; 缺: string[] }[] };

/** jars.toml 没记 sha256 的（资源索引）按本机文件现算前 12 位；文件不在返回 undefined */
export const 本机sha12 = (q: 取材清单, jar路径: (id: string) => string) => (id: string) => {
  const j = q.jars.get(id);
  if (j?.sha256) return j.sha256.slice(0, 12);
  try {
    return 文件sha256(jar路径(id)).slice(0, 12);
  } catch {
    return undefined;
  }
};

/** 资产表里 许可 = LicenseRef-待定、来源是 提取: 的，按 jar 算出许可；不是提取来的（手工、派生）不碰 */
export const 算补许可 = (q: 取材清单, 条目们: Iterable<资产条目>, jar路径?: (id: string) => string): 补许可结果 => {
  const 表 = 许可表(q.jars.values(), jar路径 && 本机sha12(q, jar路径));
  const r: 补许可结果 = { 能补: [], 仍待定: [] };
  for (const e of 条目们) {
    if (e.许可 !== 待定许可 || !e.来源.startsWith('提取:')) continue;
    const x = 资产继承许可(q, e, 表);
    if (x.许可) r.能补.push({ e, 许可: x.许可 });
    else r.仍待定.push({ e, 缺: x.缺 });
  }
  return r;
};

/** 表文件路径：共用的 assets/registry/<表>，作品的 <作品根>/资产表/<表> */
const 表路径 = (e: Pick<资产条目, '侧' | '表'>, 作品根: string) => path.join(e.侧 === '作品' ? 作品资产表目录(作品根) : 资产表目录(), e.表);

/** 把 能补 的写回各自的表文件；返回改了哪些文件 */
export const 写补许可 = (能补: 补许可结果['能补'], 作品根: string): string[] => {
  const 按表 = new Map<string, { id: string; 许可: string }[]>();
  for (const { e, 许可 } of 能补) {
    const f = 表路径(e, 作品根);
    if (!按表.has(f)) 按表.set(f, []);
    按表.get(f)!.push({ id: e.id, 许可 });
  }
  for (const [f, 改们] of 按表) fs.writeFileSync(f, 改们.reduce((t, x) => 改许可(t, x.id, x.许可), fs.readFileSync(f, 'utf8')), 'utf8');
  return [...按表.keys()];
};

/**
 * 配方产物的来源串：提取:<名称>@<用到的各 jar sha256 前 12 位>；jars.toml 没记 sha 的（资源索引）现算本机文件。
 * 用到：脚本在产物来源里写了这件用到哪几个 jar 就只记那几个（一条配方读好几个 jar 时，一件产物往往只来自其中一个）；没写记「需要」的全部
 */
export const 来源串 = (q: 取材清单, e: 取材条目, jar路径: (id: string) => string, 用到: readonly string[] = e.需要) => {
  const sha = 本机sha12(q, jar路径);
  const shas = 用到.map((id) => {
    if (!q.jars.has(id)) throw new Error(`「${e.名称}」需要的 ${id} 不在 jars.toml`);
    const x = sha(id);
    if (!x) throw new Error(`「${e.名称}」用到的 ${id} 不在本机（${jar路径(id)}），算不出 sha`);
    return x;
  });
  if (!shas.length) throw new Error(`「${e.名称}」没写「需要」，来源记不出 jar sha，手工登记`);
  return `提取:${e.名称}@${[...new Set(shas)].join('+')}`;
};

/** 产物来源里写的 jar 路径 → 配方「需要」里的 jar id；对不上的报错（脚本读了配方没声明的 jar） */
export const 反查jar = (e: 取材条目, jar路径: (id: string) => string, 路径们: readonly string[]): string[] =>
  路径们.map((p) => {
    const id = e.需要.find((i) => path.resolve(jar路径(i)) === path.resolve(p));
    if (!id) throw new Error(`「${e.名称}」的产物来源写了 ${p}，不是「需要」里哪个 jar（${e.需要.join('、')}）`);
    return id;
  });

/** --登记 时写进资产表的可见性：配方写了就用；公开版 = 提取 的默认「提取」 */
export const 配方可见性 = (e: 取材条目): 可见性 => {
  if (e.可见性) return e.可见性;
  if (e.公开版 === '提取') return '提取';
  throw new Error(`「${e.名称}」公开版不是「提取」，--登记 不知道新产物的可见性：在配方里写 "可见性" = "发布" / "私有" / "公开"`);
};

export type 待登记 = { id: string; 文件: string };
export type 登记结果 = { 新登记: string[]; 补许可: string[]; 仍待定: { id: string; 缺: string[] }[]; 入锁: string[]; 表文件: string[] };

/**
 * 一条配方跑完后，把还没登记、没进锁的产物登记、入库、写锁。已经在锁里的不动（sha 不一样照旧只报告，换版本要人定）。
 * 产物来源：脚本写的 {文件: [jar 路径…]}（提取.ts 读产物来源），有就按件记来源、算许可。
 * 已在资产表登记、只是没进锁的，按它登记的那一侧写锁；新登记的按配方（写了「作品」进作品那侧）。共用表、锁默认在仓库里；测试传 目录 覆盖。
 */
export const 登记产物 = (
  q: 取材清单,
  e: 取材条目,
  dir: string,
  产物: 待登记[],
  o: {
    作品根: string;
    已登记: Map<string, 资产条目>;
    锁: 资产锁;
    jar路径: (id: string) => string;
    产物来源?: Record<string, string[]>;
    共用表目录?: string;
    共用锁?: string;
    数据根?: string;
    量音频?: boolean;
  },
): 登记结果 => {
  const r: 登记结果 = { 新登记: [], 补许可: [], 仍待定: [], 入锁: [], 表文件: [] };
  const 锁路径 = (侧: '共用' | '作品') => (侧 === '作品' ? 作品资产锁路径(o.作品根) : (o.共用锁 ?? 资产锁路径()));
  const 配方侧 = e.作品 === undefined ? '共用' : '作品';
  const 表目录 = 配方侧 === '作品' ? 作品资产表目录(o.作品根) : (o.共用表目录 ?? 资产表目录());
  const 新 = 产物.filter((p) => !o.锁[p.id]);
  if (!新.length) return r;
  const 可见 = 配方可见性(e);
  const 表 = 许可表(q.jars.values(), 本机sha12(q, o.jar路径));
  const 按表 = new Map<string, Parameters<typeof 条目文本>[0][]>();
  for (const p of 新) {
    if (o.已登记.has(p.id)) continue;
    const 用到 = o.产物来源?.[p.文件];
    const 来源 = 来源串(q, e, o.jar路径, 用到 ? 反查jar(e, o.jar路径, 用到) : undefined);
    const 类别 = p.id.split('/')[0]!;
    const x = 资产继承许可(q, { 来源, 类别 }, 表);
    if (!x.许可) r.仍待定.push({ id: p.id, 缺: x.缺 });
    const f = path.join(表目录, `${类别}.toml`);
    if (!按表.has(f)) 按表.set(f, []);
    按表.get(f)!.push({ id: p.id, 类别, 来源, 许可: x.许可 ?? 待定许可, 可见性: 可见, 说明: `anim extract --登记 自动登记（${p.文件}）` });
    r.新登记.push(p.id);
  }
  for (const [f, 条目们] of 按表) {
    const 原 = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : `# 资产表：${path.basename(f, '.toml')}。人写；anim extract --登记 自动追加取材产物。\n# 字段和取值见 assets/README.md。\n`;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, 追加条目(原, 条目们), 'utf8');
    r.表文件.push(f);
  }
  const 锁们 = new Map<string, 资产锁>();
  for (const p of 新) {
    const 登记 = o.已登记.get(p.id);
    const f = 锁路径(登记?.侧 ?? 配方侧);
    if (!锁们.has(f)) 锁们.set(f, 读资产锁(f));
    const 文件 = path.join(dir, p.文件);
    const 字节 = 入库(文件, 库名(登记?.可见性 ?? 可见), o.数据根);
    锁们.get(f)![p.id] = o.量音频 === false ? 字节 : 带音频元数据(字节, 文件);
    r.入锁.push(p.id);
  }
  for (const [f, 锁] of 锁们) 写资产锁(锁, f);
  return r;
};
