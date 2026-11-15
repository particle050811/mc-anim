// 出片共用的声音、分享版小工具（拼成片.ts 用）。旧的整片重压流程（合成成片）在 4K60「母版 = 成片切片」以后没人调了，
// 连同剪辑包一起删了（用户 11-06 定不要剪辑包，以后统一在 image-flow 插件里看），要看从 Git 历史找。
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../环境/配置.ts';
import { lowPriority, runCmd, runCapture, tryRun } from '../环境/子进程.ts';

const truePeakLimit = -1;

export const measureLoudness = (file: string) => {
  const r = tryRun([config('ffmpeg'), '-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const tail = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const lufs = Number(/I:\s+(-?[\d.]+|-inf) LUFS/.exec(tail)?.[1]?.replace('-inf', '-Infinity'));
  const peak = Number(/Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(tail)?.[1]?.replace('-inf', '-Infinity'));
  if (r.退出码 !== 0 || Number.isNaN(lufs) || Number.isNaN(peak)) throw new Error(`量不出 ${file} 的响度：${r.stderr.slice(-300)}`);
  return { lufs, truePeak: peak };
};

// 分享版从成片压：段已按 BT.709 压好（渲/设置.ts，用户 11-05 定「成品颜色标签改成规范的」），这里只补标签
const bt709Args = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];

// 分享版：照 B 站给观众的 1080P60 AV1 档压（用户 11-05「和 B 站的 AV1 1080p 高码率 60fps 对齐」）。
// 2750 kbps 是 11-05 实测 B 站普通 1080P60 AV1 档的平均码率（任意 1 秒最高 4.5 Mbps，archive/预览/1105-1358-B站实际码率-把回忆）；
// 「1080P 高码率」那档（大会员）没量过，用户 11-05 定先用这个数、量到再换。不卡大小（用户同日定去掉 50 MB 上限）。
// SVT-AV1 单遍 VBR：第 2 章 56 秒实测平均 2.73 Mbps、19.1 MB，任意 1 秒最高 5.7 Mbps，不用两遍。
const shareVideoKbps = 2750;
// 96k 真峰超规矩，用户 10-31 定 128k
export const shareAudioKbps = 128;
// AAC 的过冲不随码率、限幅单调变，声音差几十个样本也会差 0.5 dB（第 6-7 章量过），只能压完量：超 −1 dBTP 就压低限幅重压。只动分享版的声音，成片不变
export const compressShareAudio = (progress: (margin: number, outPath: string) => void, startMargin: number, workDir: string) => {
  const ffmpeg = config('ffmpeg');
  const midPath = path.join(workDir, '分享声音.wav');
  const outPath = path.join(workDir, '分享声音.m4a');
  let margin = startMargin;
  let truePeak = Infinity;
  for (let i = 0; i < 6; i++) {
    progress(margin, midPath);
    runCapture([ffmpeg, '-v', 'error', '-y', '-i', midPath, '-c:a', 'aac', '-b:a', `${shareAudioKbps}k`, outPath]);
    truePeak = measureLoudness(outPath).truePeak;
    console.log(`分享版声音：限幅 ${(truePeakLimit - margin).toFixed(1)} dBFS → 真峰值 ${truePeak.toFixed(1)} dBTP`);
    if (truePeak <= truePeakLimit) break;
    margin += truePeak - truePeakLimit + 0.1;
  }
  return { 声音: outPath, 限幅dBFS: truePeakLimit - margin };
};
export const encodeShareVersion = async (filmPath: string, soundFile: string, outPath: string) => {
  const ffmpeg = config('ffmpeg');
  await runCmd(
    lowPriority([
      ffmpeg, '-v', 'error', '-y', '-i', filmPath, '-i', soundFile, '-map', '0:v', '-map', '1:a',
      '-vf', 'scale=1920:1080:flags=lanczos,setsar=1', '-c:v', 'libsvtav1', '-preset', '6', '-b:v', `${shareVideoKbps}k`,
      '-pix_fmt', 'yuv420p', ...bt709Args, '-c:a', 'copy', '-movflags', '+faststart', outPath,
    ]),
  );
  const mb = fs.statSync(outPath).size / 1e6;
  console.log(`分享版 ${mb.toFixed(1)} MB（视频目标 ${shareVideoKbps} kbps）`);
  return { kbps: shareVideoKbps, MB: mb };
};
