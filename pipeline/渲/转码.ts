// 母版的存法（用户 10-30 定转码存，11-01 定「CRF 16 medium 好的 那就用这个吧」，决策 0008）：Remotion 照旧按 设置.ts 渲 CRF1（crf:1 进指纹，表示「怎么渲的」；存法不进指纹），
// 渲完派生段签（verify 的无损抽样帧从 CRF1 抽），再转成 x264 压缩母版存进缓存。转码不是重渲：同一份 CRF1 转出来逐位相同。
// 线程数固定 4：x264 默认确定性编码，同线程数同版本逐位可复现，线程数一变码流就变。容器写 +bitexact（Matroska 的 UID 不随机、不写 Lavf 版本号）。
// 声音原样拷（PCM 不重编码）：压缩母版自己能放能用，段签丢了 film、render --到预览 照样有声音；PCM 每分钟约 11 MB。
// 存法（标签、参数、ffmpeg 和 x264 版本）记进段签 签.json 的 母版.存法，文件里另写 ANIM_STORAGE 标签，看文件就分得清 CRF1 和压缩母版。
// 换档位只改这里的标签和参数：后缀 .x264.mkv 不绑档位；已有的文件不重转（压两代），段签、manifest 记的旧标签照留，没有地方拿它和现行标签比。
import fs from 'node:fs';
import { 配置 } from '../环境/配置.ts';
import { 低优先级, 跑, 跑出 } from '../环境/子进程.ts';
import { 压缩后缀 } from './母版.ts';
import { 视频信息 } from './探测.ts';

export const 存法标签 = 'x264-crf16-medium-t4';
export const 转码视频参数 = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-threads', '4', '-pix_fmt', 'yuv420p'] as const;
/** 各档位的标签都这样开头（旧文件是 x264-crf12-veryfast-t4） */
const 压缩标签前缀 = 'x264-';

export type 存法 = { 标签: string; 参数: string[]; ffmpeg: string; x264: string | null };

let ffmpeg版本缓存: string | null = null;
export const ffmpeg版本 = () => (ffmpeg版本缓存 ??= 跑出([配置('ffmpeg'), '-hide_banner', '-version']).split('\n')[0]!.trim());

/** 码流开头 x264 写的 SEI 里的版本（x264 - core 165 r3222 b35605a） */
export const 读x264版本 = (file: string): string | null => {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(1 << 20);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    return /x264 - core \d+(?: r\d+)?(?: [0-9a-f]+)?/.exec(buf.subarray(0, n).toString('latin1'))?.[0] ?? null;
  } finally {
    fs.closeSync(fd);
  }
};

/** 文件里的 ANIM_STORAGE 标签（CRF1 母版没有） */
export const 读存法标签 = (file: string): string | null => {
  const out = 跑出([配置('ffprobe'), '-v', 'error', '-show_entries', 'format_tags=ANIM_STORAGE', '-of', 'default=nw=1:nk=1', file]).trim();
  return out || null;
};

/** 是不是转码存的：看名字（.x264.mkv）或文件里的标签（改过名的、旧档位的也认得出，不当 CRF1 再转） */
export const 是压缩母版 = (file: string) => file.endsWith(压缩后缀) || (fs.existsSync(file) && !!读存法标签(file)?.startsWith(压缩标签前缀));

/** CRF1 → 压缩母版：写到 出（调用方给临时名），核对尺寸、帧数和原来一样；不过闸（调用方过） */
export const 转码 = async (原: string, 出: string): Promise<存法> => {
  if (是压缩母版(原)) throw new Error(`${原} 已经是压缩母版了，不再转（压两代）`);
  // 转之前取：ffmpeg 开着文件，转的途中 CRF1 被别人删了也转得完，转完再探就抛了
  const a = 视频信息(原);
  const 参数 = [
    '-map', '0:v:0', '-map', '0:a?', ...转码视频参数, '-c:a', 'copy',
    '-map_metadata', '-1', '-map_chapters', '-1', '-fflags', '+bitexact', '-metadata', `ANIM_STORAGE=${存法标签}`,
  ];
  await 跑(低优先级([配置('ffmpeg'), '-v', 'error', '-nostdin', '-y', '-i', 原, ...参数, 出]), { 安静: true });
  const b = 视频信息(出);
  if (a.宽 !== b.宽 || a.高 !== b.高 || a.帧数 !== b.帧数) throw new Error(`${原} 转码后是 ${b.宽}×${b.高} ${b.帧数} 帧，原来 ${a.宽}×${a.高} ${a.帧数} 帧`);
  return { 标签: 存法标签, 参数, ffmpeg: ffmpeg版本(), x264: 读x264版本(出) };
};
