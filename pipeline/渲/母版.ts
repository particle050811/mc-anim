// 母版缓存：<数据根>/cache/母版/<作品>/<段键>/ 下按指纹前 16 位起名（用户 10-30 定母版改存 CRF12，存法见 转码.ts）：
//   <指纹>.mkv        CRF1，Remotion 直出；10-30 以前渲的都是它，现在只在渲完到转码完之间短暂存在（verify 的无损抽样帧从它抽）
//   <指纹>.crf12.mkv  CRF12，film、edit-package、render --到预览 读它
//   <指纹>.指纹.json  逐项展开；<指纹>.用过 修改时间是最后一次被 render、film、verify、edit-package 用的时间（不是账本，各文件各记各的）
// 透明叠层同样存法：cache/叠层/<段键>-<名>/<指纹前 16 位>.mov（ProRes 4444 带透明，很小，不转码）。
import fs from 'node:fs';
import path from 'node:path';
import { 叠层目录, 母版目录 } from '../环境/配置.ts';
import type { 段指纹 } from '../指纹/指纹.ts';

export const 压缩后缀 = '.crf12.mkv';
/** CRF1 那份（也是 认可、交付、当前指纹 钉母版时用的「逻辑名」：同一指纹的 CRF12 按它找理由） */
export const 原母版路径 = (键: string, 指纹: string, 作品?: string) => path.join(母版目录(键, 作品), `${指纹.slice(0, 16)}.mkv`);
export const 压缩母版路径 = (键: string, 指纹: string, 作品?: string) => path.join(母版目录(键, 作品), `${指纹.slice(0, 16)}${压缩后缀}`);
/** 同一目录里 CRF1 名 → CRF12 名 */
export const 压缩名 = (原: string) => 原.replace(/\.mkv$/, 压缩后缀);
/** 这个指纹渲过、母版还在（CRF1、CRF12 哪份都算） */
export const 有母版 = (键: string, 指纹: string, 作品?: string) => fs.existsSync(压缩母版路径(键, 指纹, 作品)) || fs.existsSync(原母版路径(键, 指纹, 作品));
/** 现有的母版文件：CRF12 优先，没有就 CRF1，都没有 null（只看在不在；要读像素出片用 转存.ts 的 备好母版） */
export const 现母版 = (键: string, 指纹: string, 作品?: string): string | null =>
  [压缩母版路径(键, 指纹, 作品), 原母版路径(键, 指纹, 作品)].find((f) => fs.existsSync(f)) ?? null;
export const 叠层路径 = (叠层键: string, 指纹: string) => path.join(叠层目录(叠层键), `${指纹.slice(0, 16)}.mov`);
export const 指纹文件 = (键: string, 指纹: string, 目录 = 母版目录(键)) => path.join(目录, `${指纹.slice(0, 16)}.指纹.json`);

/** render 渲完自动删旧母版时，近这么久被用过的不删（film、verify、edit-package 正在用的，别的 worktree 刚渲的） */
export const 近期用过毫秒 = 2 * 3600 * 1000;
export const 用过文件 = (目录: string, 指纹: string) => path.join(目录, `${指纹.slice(0, 16)}.用过`);
/** 记一笔「刚用过」：只改这一个小文件的修改时间；写不了（只读数据根）就算了，不影响出片 */
export const 记用过 = (目录: string, 指纹: string) => {
  try {
    fs.mkdirSync(目录, { recursive: true });
    fs.writeFileSync(用过文件(目录, 指纹), `${new Date().toISOString()}\n`, 'utf8');
  } catch {
    // 记不上只是少一层保护
  }
};
/** 最后一次用的时间（毫秒），没记过 null */
export const 用过于 = (目录: string, 指纹: string): number | null => {
  try {
    return fs.statSync(用过文件(目录, 指纹)).mtimeMs;
  } catch {
    return null;
  }
};

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
