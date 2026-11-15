// 交付目录（anim film 出的 交付/<作品>/<UTC>-<名>/）里 拼成片.ts 和 gc 共用的约定。manifest（版本 4，11-06 去掉编排帧率、编排帧数）由 拼成片.ts 写，各段记切片的画面、声音指纹；
// 出片时就写 全片-未拉响度.flac（拉响度之前的整片声音，无损），交付不再读母版（gc 的 交付自足 看它）。
// 10-30 以前的 v1、v2 交付和给它们补 FLAC 的 anim film 补声音 11-06 删了（用户 11-06「反正旧的不用兼容 直接改」），旧交付夹原样留着。
import { lowPriority, runCmd } from '../环境/子进程.ts';
import { config } from '../环境/配置.ts';

export const unnormalizedFile = '全片-未拉响度.flac';

const sampleRate = 48000;

/** 拼 全片-未拉响度.flac：各段按样本截到 样本数、接，FLAC 无损；不够长就补静音 */
export const concatUnnormalized = async (sourcePaths: string[], sampleCounts: number[], outPath: string) => {
  const filters = sampleCounts.map(
    (n, k) => `[${k}:a]atrim=start_sample=0:end_sample=${n},asetpts=PTS-STARTPTS,aresample=${sampleRate},aformat=channel_layouts=stereo,apad=whole_len=${n}[a${k}]`,
  );
  filters.push(`${sampleCounts.map((_, k) => `[a${k}]`).join('')}concat=n=${sampleCounts.length}:v=0:a=1[a]`);
  await runCmd(lowPriority([config('ffmpeg'), '-v', 'error', '-y', ...sourcePaths.flatMap((f) => ['-i', f]), '-filter_complex', filters.join(';'), '-map', '[a]', '-c:a', 'flac', outPath]));
};
