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

/** 这段之前渲过的指纹（新的在前），anim stale 拿最近一份比差异 */
export const 历史指纹 = (键: string, dir = 母版目录(键)): (段指纹 & { 算于?: string })[] => {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.指纹.json'))
    .map((n) => path.join(dir, n))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    .map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
};

/** 指纹记录里的渲染级别（项.渲染设置.inputProps.级别）；读不出是 null */
export const 指纹级别 = (h: { 项?: { 渲染设置?: Record<string, unknown> } }): string | null => {
  const v = (h.项?.渲染设置?.inputProps as { 级别?: unknown } | undefined)?.级别;
  return typeof v === 'string' ? v : null;
};

/**
 * film --允许过期 能用的旧渲染：同一渲染级别、文件还在的最近一份（历史 新的在前）。视频级成片接上预览级母版，分辨率、画质都不对；
 * 读不出级别的旧记录不用。另返回别的级别有没有能用的，报错时说清楚
 */
export const 最近同级别 = <T extends { 指纹: string; 项?: { 渲染设置?: Record<string, unknown> } }>(历史: readonly T[], 级别: string, 文件: (指纹: string) => string) => {
  const 在 = 历史.filter((h) => fs.existsSync(文件(h.指纹)));
  return { 旧: 在.find((h) => 指纹级别(h) === 级别), 别的级别: [...new Set(在.map(指纹级别).filter((x) => x !== 级别).map((x) => x ?? '级别不明'))] };
};
