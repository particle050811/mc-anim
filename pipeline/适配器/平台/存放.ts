// 平台数据在数据根里的存放：平台/<平台目录>/<UTC 月日-时分>/数据.json，原样存浏览器取数脚本下载的包；B 站、抖音共用。
import fs from 'node:fs';
import path from 'node:path';
import { utc月日时分 } from '../../运行记录/记录.ts';

type 带时间 = { 取于: string };

/** 把浏览器下载的包挪进 根；目录名按包里的取数时间（UTC）。校验 不过时抛错 */
export const 导入包 = <T extends 带时间>(文件: string, 根: string, 校验: (包: T) => boolean) => {
  const 包 = JSON.parse(fs.readFileSync(文件, 'utf8')) as T;
  if (typeof 包.取于 !== 'string' || !校验(包)) throw new Error(`${文件} 不是取数脚本打的包`);
  const dir = path.join(根, utc月日时分(Date.parse(包.取于)));
  const 目标 = path.join(dir, '数据.json');
  if (fs.existsSync(目标)) throw new Error(`${目标} 已经有了，不覆盖`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.renameSync(文件, 目标);
  } catch {
    fs.copyFileSync(文件, 目标); // 跨卷时 rename 不行
    fs.rmSync(文件);
  }
  return { 目标, 包 };
};

/** 根下按包里的 取于 最新的一份（目录名是 月日-时分，跨年时按目录名排不对）；没有返回 null */
export const 最新包 = <T extends 带时间>(根: string): { f: string; 包: T } | null => {
  const 有 = fs.existsSync(根) ? fs.readdirSync(根).filter((n) => fs.existsSync(path.join(根, n, '数据.json'))) : [];
  const 们 = 有.map((n) => {
    const f = path.join(根, n, '数据.json');
    return { f, 包: JSON.parse(fs.readFileSync(f, 'utf8')) as T };
  });
  们.sort((a, b) => Date.parse(a.包.取于) - Date.parse(b.包.取于));
  return 们.at(-1) ?? null;
};
