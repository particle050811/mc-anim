// 交付目录（anim film 出的 交付/<作品>/<UTC>-<名>/）里 拼成片.ts 和 gc 共用的约定。manifest（版本 3）由 拼成片.ts 写，各段记切片的画面、声音指纹；
// 出片时就写 全片-未拉响度.flac（拉响度之前的整片声音，无损），交付不再读母版（gc 的 交付自足 看它）。
// 10-30 以前的 v1、v2 交付和给它们补 FLAC 的 anim film 补声音 11-06 删了（用户 11-06「反正旧的不用兼容 直接改」），旧交付夹原样留着。
import { 低优先级, 跑 } from '../环境/子进程.ts';
import { 配置 } from '../环境/配置.ts';

export const 未拉响度文件 = '全片-未拉响度.flac';

const 采样率 = 48000;

/** 拼 全片-未拉响度.flac：各段按样本截到 样本数、接，FLAC 无损；不够长就补静音（原生段和兼容段挨着的地方，docs/决策/0015-原生60帧.md） */
export const 拼未拉响度 = async (源: string[], 样本数们: number[], 出: string) => {
  const 滤镜 = 样本数们.map(
    (n, k) => `[${k}:a]atrim=start_sample=0:end_sample=${n},asetpts=PTS-STARTPTS,aresample=${采样率},aformat=channel_layouts=stereo,apad=whole_len=${n}[a${k}]`,
  );
  滤镜.push(`${样本数们.map((_, k) => `[a${k}]`).join('')}concat=n=${样本数们.length}:v=0:a=1[a]`);
  await 跑(低优先级([配置('ffmpeg'), '-v', 'error', '-y', ...源.flatMap((f) => ['-i', f]), '-filter_complex', 滤镜.join(';'), '-map', '[a]', '-c:a', 'flac', 出]));
};
