// 交付目录（anim film 出的 交付/<作品>/<UTC>-<名>/）的约定：manifest 的两个版本、作品的交付选项、「自足」的判断。
// 自足 = edit-package 不用再读母版：有 全片-未拉响度.flac（拉响度之前的整片声音，无损）和 剪辑包/画面.mp4。
//   作品没开剪辑包（交付.toml）的 film 不出画面，这种交付不自足，母版一直钉着（edit-package 要拿母版现做画面）。
// manifest v1（10-30 以前）每段记 母版（相对数据根，更早的是绝对路径）；v2 不记母版，记 指纹、字节sha、段签（相对数据根），母版路径按作品、段键、指纹现算。
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { 数据根下, 母版目录, 配置 } from '../环境/配置.ts';
import { 低优先级, 跑 } from '../环境/子进程.ts';
import { 声音路径, 读段签 } from '../段签/段签.ts';

export const 未拉响度文件 = '全片-未拉响度.flac';
export const 剪辑画面文件 = path.join('剪辑包', '画面.mp4');
export const manifest版本 = 2;

/**
 * 作品的交付选项：<作品根>/交付.toml（不写就是默认）。剪辑包 = true 时 film 同一遍出 剪辑包/画面.mp4（不带字幕），
 * edit-package 不再读母版（01-推荐方案.md 第四节 C5：应力转动开，把回忆拼好给你先关）
 */
export type 交付设置 = { 剪辑包: boolean };
export const 读交付设置 = (作品根: string): 交付设置 => {
  const f = path.join(作品根, '交付.toml');
  if (!fs.existsSync(f)) return { 剪辑包: false };
  const t = parse(fs.readFileSync(f, 'utf8')) as Record<string, unknown>;
  const 不认识 = Object.keys(t).filter((k) => k !== '剪辑包');
  if (不认识.length) throw new Error(`${f} 里有不认识的项：${不认识.join('、')}（只能写 剪辑包）`);
  if (t['剪辑包'] !== undefined && typeof t['剪辑包'] !== 'boolean') throw new Error(`${f} 的 剪辑包 要写 true 或 false`);
  return { 剪辑包: t['剪辑包'] === true };
};

/** 剪辑包画面的编码参数（用户 10-14 定：2K、CRF 32、每帧关键帧，剪映里拖播放头哪帧都能直接解）；film 和 edit-package 共用 */
export const 剪辑画面编码 = (fps: number) => ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '32', '-g', '1', '-keyint_min', '1', '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart'];
export const 剪辑画面宽 = 2560;
export const 剪辑画面高 = 1440;

/** 读交付manifest 统一成这样：母版、声音都是绝对路径（母版不一定还在；声音是段签的 声音.flac，v1 或没段签的没有）。bili 时间轴直接读原 JSON，只用帧数这些 */
export type 交付段 = { 编号: string | null; 键: string; 指纹: string; 帧数: number; 全片起帧: number; 母版: string; 声音?: string | null; 字节sha?: string | null };
export type 交付manifest = {
  版本?: number;
  作品?: string;
  名: string;
  级别?: string;
  帧率: number;
  宽: number;
  高: number;
  总帧数: number;
  响度: { 增益dB: number };
  段: 交付段[];
  叠层: { 键: string; 段: string; 文件: string; 全片起帧: number }[];
  文件: Record<string, string>;
};

type 原段 = { 编号?: string | null; 键: string; 指纹: string; 帧数: number; 全片起帧: number; 母版?: string; 声音?: string | null; 字节sha?: string | null };

/** 母版在数据根里的位置（v2 不记，按 cache/母版/<作品>/<段键>/<指纹前 16 位>.mkv 现算） */
export const 交付母版 = (作品: string, 键: string, 指纹: string) => path.join(母版目录(键, 作品), `${指纹.slice(0, 16)}.mkv`);

/** 交付目录 → manifest（v1、v2 都认；早先的 v1 没有 作品，按交付目录的上一级算） */
export const 读交付manifest = (dir: string): 交付manifest & { 版本: number; 作品: string } => {
  const 原 = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as Record<string, unknown> & { 段: 原段[]; 叠层?: 交付manifest['叠层']; 文件?: Record<string, string> };
  const 版本 = typeof 原['版本'] === 'number' ? (原['版本'] as number) : 1;
  if (版本 > manifest版本) throw new Error(`${dir}/manifest.json 是 v${版本}，这版代码只认到 v${manifest版本}`);
  const 作品 = (原['作品'] as string | undefined) ?? path.basename(path.dirname(dir));
  return {
    ...(原 as unknown as 交付manifest),
    版本,
    作品,
    段: 原.段.map((s) => ({
      编号: s.编号 ?? null,
      键: s.键,
      指纹: s.指纹,
      帧数: s.帧数,
      全片起帧: s.全片起帧,
      母版: s.母版 ? 数据根下(s.母版) : 交付母版(作品, s.键, s.指纹),
      声音: s.声音 ? 数据根下(s.声音) : null,
      字节sha: s.字节sha ?? null,
    })),
    叠层: (原.叠层 ?? []).map((l) => ({ ...l, 文件: 数据根下(l.文件) })),
    文件: 原.文件 ?? {},
  };
};

/** 交付自足吗：缺哪几样（空就是自足；和 缓存/回收.ts 的 交付自足 同一个判断） */
export const 交付缺 = (dir: string): string[] => [未拉响度文件, 剪辑画面文件].filter((f) => !fs.existsSync(path.join(dir, f)));

const 采样率 = 48000;

/** 各段声音从哪读：manifest 记的段签声音 > 现有段签的 声音.flac > 母版；都不在是 null */
export const 段声音源 = (m: 交付manifest & { 作品: string }) =>
  m.段.map((s) => {
    const 签 = 读段签(s.键, s.指纹, m.作品);
    for (const f of [s.声音, 签 && 声音路径(签), s.母版]) if (f && fs.existsSync(f)) return f;
    return null;
  });

/** 拼 全片-未拉响度.flac：各段按样本截（end_sample = 帧数 × 每帧样本）、接，FLAC 无损；film、补声音、edit-package 共用 */
export const 拼未拉响度 = async (源: string[], m: { 段: { 帧数: number }[]; 帧率: number }, 出: string) => {
  const 每帧样本 = 采样率 / m.帧率;
  const 滤镜 = m.段.map((s, k) => `[${k}:a]atrim=start_sample=0:end_sample=${s.帧数 * 每帧样本},asetpts=PTS-STARTPTS,aresample=${采样率},aformat=channel_layouts=stereo[a${k}]`);
  滤镜.push(`${m.段.map((_, k) => `[a${k}]`).join('')}concat=n=${m.段.length}:v=0:a=1[a]`);
  await 跑(低优先级([配置('ffmpeg'), '-v', 'error', '-y', ...源.flatMap((f) => ['-i', f]), '-filter_complex', 滤镜.join(';'), '-map', '[a]', '-c:a', 'flac', 出]));
};
