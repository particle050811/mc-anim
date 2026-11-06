// 交付目录（anim film 出的 交付/<作品>/<UTC>-<名>/）的约定：manifest 的版本、「自足」的判断。
// 自足 = 不用再读母版：有 全片-未拉响度.flac（拉响度之前的整片声音，无损）。剪映剪辑包用户 11-06 定不要了（以后统一在 image-flow 插件里看），
//   以前自足还要 剪辑包/画面.mp4，现在不要。
// manifest v1（10-30 以前）每段记 母版（相对数据根，更早的是绝对路径）；v2 不记母版，记 指纹、字节sha、存法、段签（相对数据根），母版路径按作品、段键、指纹现算。
// 读回来的 母版 都是 CRF1 那个名字（同一目录的 .x264.mkv 是那时转存后的那份，渲/母版.ts），比「是不是出片时那份」按字节 sha。
// v3（11-05 起，拼成片.ts 写）各段记切片的画面指纹，出片时就有 全片-未拉响度.flac，本来自足，这里不读（读交付manifest 只认到 v2，补声音碰上会拒）。
import fs from 'node:fs';
import path from 'node:path';
import { 交付根, 数据根下, 母版目录, 配置 } from '../环境/配置.ts';
import { 低优先级, 跑 } from '../环境/子进程.ts';

export const 未拉响度文件 = '全片-未拉响度.flac';
export const manifest版本 = 2;

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

/** 母版在数据根里的位置（v2 不记，按 cache/母版/<作品>/<段键>/<指纹前 16 位>.mkv 现算；转存后这个名字可能已经没了，同目录是 .x264.mkv） */
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

/** 给的是交付目录的名字（不是路径）就到 交付根 下找 */
export const 找交付目录 = (arg: string) => {
  const dir = fs.existsSync(arg) ? path.resolve(arg) : path.join(交付根(), arg);
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) throw new Error(`${dir} 里没有 manifest.json（要给 anim film 出的交付目录）`);
  return dir;
};

/** 交付自足吗：缺哪几样（空就是自足；和 缓存/回收.ts 的 交付自足 同一个判断） */
export const 交付缺 = (dir: string): string[] => [未拉响度文件].filter((f) => !fs.existsSync(path.join(dir, f)));

const 采样率 = 48000;

/** 拼 全片-未拉响度.flac：各段按样本截（end_sample = 样本数，没给是 帧数 × 每帧样本）、接，FLAC 无损；film、补声音共用。
 *  给了 样本数 的不够长就补静音（原生段和兼容段挨着的地方，docs/决策/0015-原生60帧.md） */
export const 拼未拉响度 = async (源: string[], m: { 段: { 帧数: number; 样本数?: number }[]; 帧率: number }, 出: string) => {
  const 每帧样本 = 采样率 / m.帧率;
  const 滤镜 = m.段.map(
    (s, k) =>
      `[${k}:a]atrim=start_sample=0:end_sample=${s.样本数 ?? s.帧数 * 每帧样本},asetpts=PTS-STARTPTS,aresample=${采样率},aformat=channel_layouts=stereo${s.样本数 !== undefined ? `,apad=whole_len=${s.样本数}` : ''}[a${k}]`,
  );
  滤镜.push(`${m.段.map((_, k) => `[a${k}]`).join('')}concat=n=${m.段.length}:v=0:a=1[a]`);
  await 跑(低优先级([配置('ffmpeg'), '-v', 'error', '-y', ...源.flatMap((f) => ['-i', f]), '-filter_complex', 滤镜.join(';'), '-map', '[a]', '-c:a', 'flac', 出]));
};
