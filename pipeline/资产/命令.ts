// anim assets add <id> <文件>：把一件已在资产表登记的资产按 sha 放进 store/（私有的进 私有/），写进登记它那一侧的资产锁：
// 共用表 assets/registry/ 登记的写 assets/资产锁.json，作品资产表 <作品根>/资产表/ 登记的写 <作品根>/资产锁.json（作品按 --作品 选）。
// 从旧项目批量导入走 M2 的导入工具；这里只管单件（自制的、新生成的）。
import fs from 'node:fs';
import path from 'node:path';
import type { 命令 } from '../cli/命令.ts';
import { 用法错误, 解析参数 } from '../cli/参数.ts';
import { 作品根 } from '../环境/作品.ts';
import { 相对代码根 } from '../环境/路径.ts';
import { 库名, 读两侧资产表 } from './资产表.ts';
import { 作品资产锁路径, 入库, 写资产锁, 资产锁路径, 读资产锁, type 锁条目 } from './资产锁.ts';

export type 登记入库选项 = { 作品根: string; 替换?: boolean; 共用表目录?: string; 共用锁?: string; 数据根?: string };

/** 一件资产入库、写锁；返回锁条目、写的是哪份锁、有没有从另一份锁挪过来 */
export const 登记入库 = (id: string, 文件: string, o: 登记入库选项): { 条目: 锁条目; 锁文件: string; 挪自?: string } => {
  const { 条目: 登记, 重复 } = 读两侧资产表(o.作品根, o.共用表目录);
  const e = 登记.get(id);
  if (!e) throw new Error(`资产表里没有「${id}」，先在 assets/registry/<类>.toml（各作品共用）或 <作品根>/资产表/<类>.toml（只有这部作品用）里写好 id、类别、来源、许可、可见性`);
  if (重复.some((x) => x.id === id)) throw new Error(`「${id}」在共用表和作品资产表里都登记了，删掉一侧再入库`);
  if (!fs.statSync(文件).isFile()) throw new Error(`${文件} 不是文件`);
  const 共用锁 = o.共用锁 ?? 资产锁路径();
  const [锁文件, 另一份] = e.侧 === '作品' ? [作品资产锁路径(o.作品根), 共用锁] : [共用锁, 作品资产锁路径(o.作品根)];
  const 锁 = 读资产锁(锁文件);
  const 另锁 = 读资产锁(另一份);
  const 新 = 入库(path.resolve(文件), 库名(e.可见性), o.数据根);
  const 旧 = 锁[id] ?? 另锁[id];
  if (旧 && 旧.sha256 !== 新.sha256 && !o.替换) {
    throw new Error(`「${id}」资产锁里已有另一份（sha ${旧.sha256.slice(0, 12)}），确实要换成新的加 --替换（旧字节留在库里）`);
  }
  锁[id] = 新;
  写资产锁(锁, 锁文件);
  // 登记从一侧挪到另一侧（比如原来共用、改成只给一部作品用）：锁跟着挪，不留两份
  if (!另锁[id]) return { 条目: 新, 锁文件 };
  delete 另锁[id];
  写资产锁(另锁, 另一份);
  return { 条目: 新, 锁文件, 挪自: 另一份 };
};

export const 资产命令: Record<string, 命令> = {
  assets: {
    用法: 'assets add <id> <文件> [--替换]',
    说明: '一件资产入库（按 sha 放进 store/ 或 私有/），写进登记它那一侧的资产锁（共用的或作品的）',
    跑: async (args, 记录) => {
      const p = 解析参数(args, { 开关: ['--替换'] });
      const [子, id, 文件] = p.位置;
      if (子 !== 'add' || !id || !文件 || p.位置.length !== 3) throw new 用法错误('要 anim assets add <id> <文件>');
      const { 条目: 新, 锁文件, 挪自 } = 登记入库(id, 文件, { 作品根: 作品根(), 替换: p.开关.has('--替换') });
      记录.产物.push(`${id} → ${新.库}/${新.sha256}`);
      console.log(`${id}：${新.库}/${新.sha256.slice(0, 2)}/${新.sha256}（${新.大小} 字节，${新.后缀}）→ ${相对代码根(锁文件)}`);
      if (挪自) console.log(`  从 ${相对代码根(挪自)} 挪过来（登记换了一侧）`);
    },
  },
};
