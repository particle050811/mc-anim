// 地形包的版本：<数据根>/terrain/<包>/<版本>/，版本是内容指纹（目录指纹，照旧项目 工具/导入/区段包版本.mjs），发布后不再改，旧版本不删。
// 烘焙先写进暂存目录（<数据根>/run/暂存/terrain/<包>，同一个包同时只许一个进程写，拿 <暂存>.写入.lock），写完 发布：算指纹、改名成版本目录。
// 登记进 assets/地形版本.json 另是一步（登记）：表被 engine/voxel/区段包位置.ts 整个 import，改一个字节，所有用地形的段都会过期。
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { 地形根, 数据路径, 配置 } from '../环境/配置.ts';
import { 代码根 } from '../环境/路径.ts';
import { 包清单 } from '../检查/规则/资产.ts';
import { 持有者, 放, 试拿 } from '../闸/锁.ts';

/** 目录的内容指纹：目录里每个文件（不进子目录，跳过 . 开头的）按文件名 UTF-8 字节排序，逐个把「名 \0 sha256 \n」喂进 sha256，取前 12 位 */
export const 目录指纹 = (dir: string) => {
  const names = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  const outer = createHash('sha256');
  const buf = Buffer.alloc(1 << 22);
  for (const name of names) {
    const inner = createHash('sha256');
    const fd = fs.openSync(path.join(dir, name), 'r');
    try {
      for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0; ) inner.update(buf.subarray(0, n));
    } finally {
      fs.closeSync(fd);
    }
    outer.update(`${name}\0${inner.digest('hex')}\n`);
  }
  return outer.digest('hex').slice(0, 12);
};

export const 暂存目录 = (包: string) => 数据路径('run', '暂存', 'terrain', 包);
export const 版本目录 = (包: string, 版本: string) => path.join(地形根(), 包, 版本);

/** 拿写入锁、新开暂存目录（上次中断留下的先删）；返回目录和放锁的函数 */
export const 新暂存 = (包: string) => {
  const dir = 暂存目录(包);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const 锁 = `${dir}.写入.lock`;
  if (!试拿(锁, 配置('主机'))) throw new Error(`地形包 ${包} 正在被另一个进程（pid ${持有者(锁) ?? '?'}）写，等它写完再跑`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir);
  return { dir, 放: () => 放(锁) };
};

/** 暂存目录写完：算指纹、改名成 <包>/<版本>/（同样内容的版本已经有了就丢掉暂存）。返回版本和是不是新写的 */
export const 发布 = (包: string, dir: string) => {
  const 版本 = 目录指纹(dir);
  const dest = 版本目录(包, 版本);
  const 已有 = fs.existsSync(dest);
  if (已有) fs.rmSync(dir, { recursive: true, force: true });
  else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(dir, dest);
  }
  return { 版本, 目录: dest, 已有 };
};

export type 地形登记 = { 版本: string; 旧路径?: string; 来源: string; 许可: string; 可见性: string; 说明?: string; 文件数: number; 大小: number; 清单sha256: string };
export const 地形表路径 = () => path.join(代码根(), 'assets', '地形版本.json');
export const 读地形表 = () => JSON.parse(fs.readFileSync(地形表路径(), 'utf8')) as { 说明: string; 包: Record<string, 地形登记> };

/** 这一版应登记成什么（不写文件）；同一版已登记就原样返回旧条目 */
export const 登记条目 = async (包: string, 版本: string, 默认: Pick<地形登记, '来源' | '许可' | '可见性'> & { 说明?: string }): Promise<地形登记> => {
  const 旧 = 读地形表().包[包];
  if (旧?.版本 === 版本) return 旧;
  const 实 = await 包清单(版本目录(包, 版本));
  return { 版本, 来源: 默认.来源, 许可: 旧?.许可 ?? 默认.许可, 可见性: 旧?.可见性 ?? 默认.可见性, ...(默认.说明 ?? 旧?.说明 ? { 说明: 默认.说明 ?? 旧?.说明 } : {}), 文件数: 实.文件数, 大小: 实.大小, 清单sha256: 实.清单sha256 };
};

/** 写进 assets/地形版本.json（键顺序保持，新包加在末尾）；返回原来登记的版本 */
export const 登记 = (包: string, 条目: 地形登记) => {
  const 表 = 读地形表();
  const 原 = 表.包[包]?.版本;
  表.包[包] = 条目;
  fs.writeFileSync(地形表路径(), JSON.stringify(表, null, 2) + '\n');
  return 原;
};
