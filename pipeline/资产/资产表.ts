// 资产表 assets/registry/<类>.toml（人写）：每条 [["资产"]] 写 id、类别、来源、许可、可见性，可选 旧路径、说明。
// 只有一部作品用的可以登记在作品那一侧 <作品根>/资产表/<类>.toml（格式一样，锁是 <作品根>/资产锁.json）；私有作品的资产这样就不进公开仓库。
// TOML 1.0 的裸键只能是 ASCII，中文键要加引号（"类别" = …）。
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { 代码根 } from '../环境/路径.ts';
import { id合法, type 库 } from './资产锁.ts';

export const 可见性取值 = ['公开', '提取', '发布', '私有'] as const;
export type 可见性 = (typeof 可见性取值)[number];

/** 登记在哪一侧：共用 = assets/registry/，作品 = <作品根>/资产表/ */
export type 侧 = '共用' | '作品';
export type 资产条目 = { id: string; 类别: string; 来源: string; 许可: string; 可见性: 可见性; 旧路径?: string; 说明?: string; 表: string; 侧: 侧 };

export const 资产表目录 = () => path.join(代码根(), 'assets', 'registry');
export const 作品资产表目录 = (作品根: string) => path.join(作品根, '资产表');

// 提取的 @ 后面是用到的 jar（原版声音是资源索引文件）sha256 前 12 位，几个用 + 连
const 来源格式 = /^(提取:[^@]+@[0-9a-f]{12}(\+[0-9a-f]{12})*|手工:.+|派生:.+\+.+)$/;

/** 读全部资产表；字段缺失、取值不对、id 重复都报出来（不在第一条就停） */
export const 读资产表 = (dir = 资产表目录(), 侧: 侧 = '共用'): { 条目: Map<string, 资产条目>; 问题: string[] } => {
  const 条目 = new Map<string, 资产条目>();
  const 问题: string[] = [];
  if (!fs.existsSync(dir)) return { 条目, 问题 };
  for (const 名 of fs.readdirSync(dir).filter((n) => n.endsWith('.toml')).sort()) {
    const 表 = path.join(dir, 名);
    let doc: Record<string, unknown>;
    try {
      doc = parse(fs.readFileSync(表, 'utf8'));
    } catch (e) {
      问题.push(`${名}：TOML 解析失败：${(e as Error).message.split('\n')[0]}`);
      continue;
    }
    for (const raw of (doc['资产'] ?? []) as Record<string, unknown>[]) {
      const e = { ...raw, 表: 名, 侧 } as 资产条目;
      const 位置 = `${名} 的「${String(raw.id)}」`;
      for (const k of ['id', '类别', '来源', '许可', '可见性'] as const) if (typeof e[k] !== 'string' || !e[k]) 问题.push(`${位置}：缺 ${k}`);
      if (typeof e.id !== 'string') continue;
      if (!id合法(e.id)) 问题.push(`${位置}：id 要是 <类>/<名>，不含空格和 Windows 不许的字符`);
      if (!可见性取值.includes(e.可见性)) 问题.push(`${位置}：可见性只能是 ${可见性取值.join('、')}`);
      if (typeof e.来源 === 'string' && !来源格式.test(e.来源)) 问题.push(`${位置}：来源要写成 提取:<配方>@<jar sha256 前 12 位>[+…] / 手工:<说明> / 派生:<输入 sha>+<参数>`);
      if (条目.has(e.id)) 问题.push(`${位置}：id 和 ${条目.get(e.id)!.表} 里的重复`);
      条目.set(e.id, e);
    }
  }
  return { 条目, 问题 };
};

type 读表结果 = { 条目: Map<string, 资产条目>; 问题: string[] };

/** 共用表并上作品表；同一个 id 两侧都登记的，条目留共用那条，作品那条放进 重复（作品专有的 id 不强制带作品名前缀，靠这条兜底，0004 用户 10-22 定） */
export const 合并资产表 = (共用: 读表结果, 作品: 读表结果): { 条目: Map<string, 资产条目>; 重复: 资产条目[] } => {
  const 条目 = new Map(共用.条目);
  const 重复: 资产条目[] = [];
  for (const [id, e] of 作品.条目) {
    if (条目.has(id)) 重复.push(e);
    else 条目.set(id, e);
  }
  return { 条目, 重复 };
};

/** 一部作品看得到的全部登记：共用表并上 <作品根>/资产表/（没有就只有共用的） */
export const 读两侧资产表 = (作品根: string, 共用目录 = 资产表目录()) => 合并资产表(读资产表(共用目录), 读资产表(作品资产表目录(作品根), '作品'));

export const 库名 = (v: 可见性): 库 => (v === '私有' ? '私有' : 'store');
