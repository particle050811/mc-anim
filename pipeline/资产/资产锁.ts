// 资产锁 assets/资产锁.json（工具生成，人不手改）：id → { sha256, 大小, 库, 后缀 }，键排序、UTF-8、缩进 2。
// 登记在作品资产表（<作品根>/资产表/）的 id 写在 <作品根>/资产锁.json，格式一样；一部作品用的是两份并起来（读作品资产锁）。
// 字节按内容寻址放在数据根：可见性=私有 的进 私有/，其余进 store/，路径 <库>/<sha 前 2 位>/<sha256>，无后缀，只增不改。
// 这个文件也被 remotion.config.ts 打进 Remotion 的配置包，只能用 Node 自带模块和本仓库的纯 TS。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { 数据根 } from '../环境/配置.ts';
import { 代码根 } from '../环境/路径.ts';

export type 库 = 'store' | '私有';
export type 锁条目 = { sha256: string; 大小: number; 库: 库; 后缀: string };
export type 资产锁 = Record<string, 锁条目>;

export const 资产锁路径 = () => path.join(代码根(), 'assets', '资产锁.json');
export const 作品资产锁路径 = (作品根: string) => path.join(作品根, '资产锁.json');

export const 读资产锁 = (file = 资产锁路径()): 资产锁 => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as 资产锁;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error(`${file} 读不了：${(e as Error).message}`);
  }
};

/** 打包一部作品用的锁：共用的 assets/资产锁.json 并上 <作品根>/资产锁.json（没有就只用共用的）；同一个 id 两边都有就报错 */
export const 读作品资产锁 = (作品根: string): 资产锁 => {
  const 共用 = 读资产锁();
  const 作品 = 读资产锁(作品资产锁路径(作品根));
  const 重 = Object.keys(作品).filter((id) => id in 共用);
  if (重.length) throw new Error(`资产 id 在共用锁和 ${作品资产锁路径(作品根)} 里都有：${重.join('、')}（一个 id 只登记在一侧）`);
  return { ...共用, ...作品 };
};

export const 写资产锁 = (锁: 资产锁, file = 资产锁路径()) => {
  // 条目里的字段也排序，和 Python json.dumps(sort_keys=True, ensure_ascii=False, indent=2) 写出的逐字节一样
  const 排 = (o: object): object => Object.fromEntries(Object.keys(o).sort().map((k) => [k, (o as Record<string, unknown>)[k]]));
  const 排好 = Object.fromEntries(Object.keys(锁).sort().map((k) => [k, 排(锁[k]!)]));
  fs.writeFileSync(file, JSON.stringify(排好, null, 2) + '\n', 'utf8');
};

export const 字节路径 = (条目: Pick<锁条目, 'sha256' | '库'>, 根 = 数据根()) => path.join(根, 条目.库, 条目.sha256.slice(0, 2), 条目.sha256);

export const 文件sha256 = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** 资产 id 规则：<类>/<名>，Windows 文件名合法、不含空格 */
export const id合法 = (id: string) => /^[^/\s]+(\/[^/\s]+)+$/.test(id) && !/[<>:"\\|?*\x00-\x1f]/.test(id);

export class 缺资产 extends Error {}

/** 按 id 查锁、确认字节在库里；查不到给出该跑的命令 */
export const 解析资产 = (id: string, 锁: 资产锁, 根 = 数据根()) => {
  const 条目 = 锁[id];
  if (!条目) {
    throw new 缺资产(
      `资产锁里没有「${id}」：先在 assets/registry/<类>.toml（只有一部作品用的在 <作品根>/资产表/）登记，再跑 anim assets add ${id} <文件> 入库、写资产锁`,
    );
  }
  const file = 字节路径(条目, 根);
  if (!fs.existsSync(file)) throw new 缺资产(`资产「${id}」的字节不在 ${file}：数据根不全（检查 ANIM_DATA，或从别的机器同步 store/、私有/）`);
  return { 条目, 文件: file };
};

/** 文件放进库（APFS 上是克隆，不占空间），返回锁条目；同 sha 已在就不动 */
export const 入库 = (源: string, 库名: 库, 根 = 数据根()): 锁条目 => {
  const sha256 = 文件sha256(源);
  const 条目: 锁条目 = { sha256, 大小: fs.statSync(源).size, 库: 库名, 后缀: path.extname(源).toLowerCase() };
  const 目标 = 字节路径(条目, 根);
  if (!fs.existsSync(目标)) {
    fs.mkdirSync(path.dirname(目标), { recursive: true });
    const tmp = `${目标}.写入中-${process.pid}`;
    fs.copyFileSync(源, tmp, fs.constants.COPYFILE_FICLONE);
    fs.chmodSync(tmp, 0o444);
    fs.renameSync(tmp, 目标);
  }
  return 条目;
};
