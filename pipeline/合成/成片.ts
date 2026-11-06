// 出片共用的声音、分享版小工具（拼成片.ts 用）。旧的整片重压流程（合成成片）在 4K60「母版 = 成片切片」以后没人调了，
// 连同剪辑包一起删了（用户 11-06 定不要剪辑包，以后统一在 image-flow 插件里看），要看从 Git 历史找。
import fs from 'node:fs';
import path from 'node:path';
import { 配置 } from '../环境/配置.ts';
import { 低优先级, 跑, 跑出, 试跑 } from '../环境/子进程.ts';

const 真峰值上限 = -1;

export const 量响度 = (file: string) => {
  const r = 试跑([配置('ffmpeg'), '-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const tail = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const lufs = Number(/I:\s+(-?[\d.]+|-inf) LUFS/.exec(tail)?.[1]?.replace('-inf', '-Infinity'));
  const peak = Number(/Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(tail)?.[1]?.replace('-inf', '-Infinity'));
  if (r.退出码 !== 0 || Number.isNaN(lufs) || Number.isNaN(peak)) throw new Error(`量不出 ${file} 的响度：${r.stderr.slice(-300)}`);
  return { lufs, 真峰值: peak };
};

// 分享版从成片压：段已按 BT.709 压好（渲/设置.ts，用户 11-05 定「成品颜色标签改成规范的」），这里只补标签
const 标709 = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];

// 分享版：照 B 站给观众的 1080P60 AV1 档压（用户 11-05「和 B 站的 AV1 1080p 高码率 60fps 对齐」）。
// 2750 kbps 是 11-05 实测 B 站普通 1080P60 AV1 档的平均码率（任意 1 秒最高 4.5 Mbps，archive/预览/1105-1358-B站实际码率-把回忆）；
// 「1080P 高码率」那档（大会员）没量过，用户 11-05 定先用这个数、量到再换。不卡大小（用户同日定去掉 50 MB 上限）。
// SVT-AV1 单遍 VBR：第 2 章 56 秒实测平均 2.73 Mbps、19.1 MB，任意 1 秒最高 5.7 Mbps，不用两遍。
const 分享视频kbps = 2750;
// 96k 真峰超规矩，用户 10-31 定 128k
export const 分享音频kbps = 128;
// AAC 的过冲不随码率、限幅单调变，声音差几十个样本也会差 0.5 dB（第 6-7 章量过），只能压完量：超 −1 dBTP 就压低限幅重压。只动分享版的声音，成片不变
export const 压分享声音 = (拉: (余量: number, 出: string) => void, 起余量: number, 工作: string) => {
  const ffmpeg = 配置('ffmpeg');
  const 中间 = path.join(工作, '分享声音.wav');
  const 出 = path.join(工作, '分享声音.m4a');
  let 余量 = 起余量;
  let 真峰值 = Infinity;
  for (let i = 0; i < 6; i++) {
    拉(余量, 中间);
    跑出([ffmpeg, '-v', 'error', '-y', '-i', 中间, '-c:a', 'aac', '-b:a', `${分享音频kbps}k`, 出]);
    真峰值 = 量响度(出).真峰值;
    console.log(`分享版声音：限幅 ${(真峰值上限 - 余量).toFixed(1)} dBFS → 真峰值 ${真峰值.toFixed(1)} dBTP`);
    if (真峰值 <= 真峰值上限) break;
    余量 += 真峰值 - 真峰值上限 + 0.1;
  }
  return { 声音: 出, 限幅dBFS: 真峰值上限 - 余量 };
};
export const 压分享版 = async (成片: string, 声音: string, 出: string) => {
  const ffmpeg = 配置('ffmpeg');
  await 跑(
    低优先级([
      ffmpeg, '-v', 'error', '-y', '-i', 成片, '-i', 声音, '-map', '0:v', '-map', '1:a',
      '-vf', 'scale=1920:1080:flags=lanczos,setsar=1', '-c:v', 'libsvtav1', '-preset', '6', '-b:v', `${分享视频kbps}k`,
      '-pix_fmt', 'yuv420p', ...标709, '-c:a', 'copy', '-movflags', '+faststart', 出,
    ]),
  );
  const mb = fs.statSync(出).size / 1e6;
  console.log(`分享版 ${mb.toFixed(1)} MB（视频目标 ${分享视频kbps} kbps）`);
  return { kbps: 分享视频kbps, MB: mb };
};
