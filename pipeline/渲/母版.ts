// 母版缓存：<数据根>/cache/母版/<段键>/<指纹前 16 位>.mkv，旁边 <指纹前 16 位>.指纹.json 存逐项展开。
// 透明叠层同样存法：cache/叠层/<段键>-<名>/<指纹前 16 位>.mov（ProRes 4444 带透明）。
import fs from 'node:fs';
import path from 'node:path';
import { 叠层目录, 母版目录 } from '../环境/配置.ts';
import type { 段指纹 } from '../指纹/指纹.ts';

export const 母版路径 = (键: string, 指纹: string) => path.join(母版目录(键), `${指纹.slice(0, 16)}.mkv`);
export const 叠层路径 = (叠层键: string, 指纹: string) => path.join(叠层目录(叠层键), `${指纹.slice(0, 16)}.mov`);
export const 指纹文件 = (键: string, 指纹: string, 目录 = 母版目录(键)) => path.join(目录, `${指纹.slice(0, 16)}.指纹.json`);

/** 先写临时名再原子改名，中途失败不留半截文件 */
export const 原子写 = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.写入中-${process.pid}`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
};

export const 写指纹 = (fp: 段指纹, 目录 = 母版目录(fp.段)) => 原子写(指纹文件(fp.段, fp.指纹, 目录), JSON.stringify({ ...fp, 算于: new Date().toISOString() }, null, 2) + '\n');

/** 这段之前渲过的指纹（新的在前），sr stale 拿最近一份比差异 */
export const 历史指纹 = (键: string, dir = 母版目录(键)): (段指纹 & { 算于?: string })[] => {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.指纹.json'))
    .map((n) => path.join(dir, n))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    .map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
};
