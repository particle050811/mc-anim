// 挂 GitHub Release 发的字节的锁 <作品根>/发布锁.json（anim assets pack 生成，人不手改；见 docs/决策/0006-挂Release发字节.md）：
// 仓库、标签和这一版的附件，每个附件记名字、sha256、大小，和里面是什么（store/ 的一批字节，或一个地形包的一个版本）。
// 这里只读锁、查数据根还缺什么（render 这些命令开头提示要不要 anim assets pull）；打包、下载在 资产/发布.ts。
import fs from 'node:fs';
import path from 'node:path';

export const 发布锁名 = '发布锁.json';

export type 附件 = {
  名: string;
  sha256: string;
  大小: number;
  /** 一批 store/ 字节：sha256 */
  字节?: string[];
  /** 一个地形包：解开是 terrain/<包>/<版本>/ 下的文件 */
  地形?: { 包: string; 版本: string };
};
export type 发布锁 = { 仓库: string; 标签: string; 附件: 附件[] };

export const 发布锁路径 = (作品根: string) => path.join(作品根, 发布锁名);

export const 读发布锁 = (作品根: string): 发布锁 | undefined => {
  const f = 发布锁路径(作品根);
  if (!fs.existsSync(f)) return undefined;
  return JSON.parse(fs.readFileSync(f, 'utf8')) as 发布锁;
};

export const 写发布锁 = (锁: 发布锁, 作品根: string) => fs.writeFileSync(发布锁路径(作品根), JSON.stringify(锁, null, 2) + '\n', 'utf8');

export const 地形目录 = (根: string, 包: string, 版本: string) => path.join(根, 'terrain', 包, 版本);

/** 这个附件的东西数据根里还缺：字节缺几件，地形包整个目录不在 */
export const 附件缺 = (a: 附件, 根: string): number => {
  if (a.地形) return fs.existsSync(地形目录(根, a.地形.包, a.地形.版本)) ? 0 : 1;
  return (a.字节 ?? []).filter((sha) => !fs.existsSync(path.join(根, 'store', sha.slice(0, 2), sha))).length;
};

/** 有发布锁、数据根又缺它的东西时打一行（render、still、film、studio 开头）；不自动下：地形包上 GB */
export const 提示发布缺 = (作品根: string, 根: string) => {
  const 锁 = 读发布锁(作品根);
  if (!锁) return;
  const 缺 = 锁.附件.filter((a) => 附件缺(a, 根) > 0);
  if (!缺.length) return;
  const 大 = 缺.reduce((s, a) => s + a.大小, 0);
  console.error(`!! 数据根还缺这部作品挂 Release 发的 ${缺.length} 个附件（${(大 / 1e9).toFixed(2)} GB）：先 anim assets pull，不然用到的段渲不了`);
};
