// 平台数据在数据根里的存放：平台/<平台目录>/<UTC 月日-时分>/数据.json，原样存浏览器取数脚本下载的包；B 站、抖音共用。
import fs from 'node:fs';
import path from 'node:path';
import { utcMonthDayTime } from '../../运行记录/记录.ts';

type Timestamped = { 取于: string };

/** 把浏览器下载的包挪进 根；目录名按包里的取数时间（UTC）。校验 不过时抛错 */
export const importPackage = <T extends Timestamped>(file: string, root: string, validatePack: (loaded: T) => boolean) => {
  const loaded = JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  if (typeof loaded.取于 !== 'string' || !validatePack(loaded)) throw new Error(`${file} 不是取数脚本打的包`);
  const dir = path.join(root, utcMonthDayTime(Date.parse(loaded.取于)));
  const targetPath = path.join(dir, '数据.json');
  if (fs.existsSync(targetPath)) throw new Error(`${targetPath} 已经有了，不覆盖`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.renameSync(file, targetPath);
  } catch {
    fs.copyFileSync(file, targetPath); // 跨卷时 rename 不行
    fs.rmSync(file);
  }
  return { 目标: targetPath, 包: loaded };
};

/** 根下按包里的 取于 最新的一份（目录名是 月日-时分，跨年时按目录名排不对）；没有返回 null */
export const latestPackage = <T extends Timestamped>(root: string): { f: string; 包: T } | null => {
  const withData = fs.existsSync(root) ? fs.readdirSync(root).filter((n) => fs.existsSync(path.join(root, n, '数据.json'))) : [];
  const packs = withData.map((n) => {
    const f = path.join(root, n, '数据.json');
    return { f, 包: JSON.parse(fs.readFileSync(f, 'utf8')) as T };
  });
  packs.sort((a, b) => Date.parse(a.包.取于) - Date.parse(b.包.取于));
  return packs.at(-1) ?? null;
};
