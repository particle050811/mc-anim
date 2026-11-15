// 拼成片：anim film 唯一的出片路（决策/0014）。缺的段先渲（渲/渲段.ts：每段已是成片的一截，叠层、字幕在段里，按成片参数压好），这里只接不重压（用户 11-05 定「母版 = 成片切片」）。
//   选的段要是清单里挨着的一串（单独一段、一个核对段也行），不挨着的先照样渲完，再拒绝接；
//   画面：ffmpeg concat 直接拷流（各段同一套编码参数、都从关键帧起）；
//   声音：各段的 wav（和画面同一遍出，长度就是段长）按样本截、接，整片一个固定增益拉到 −16 LUFS + 限幅，压 AAC 量真峰值，超了压低限幅重做（照旧 成片.ts）；
//   出到 <数据根>/交付/<UTC 月日-时分>-<名>/：成片、拼接表、字幕表、SRT、全片-未拉响度.flac、manifest.json；
//   --分享版 另从成片压一份 B 站 1080P60 AV1 档的（参数、文件名照旧 成片.ts，用户 11-05 定），只在要时加。
import fs from 'node:fs';
import path from 'node:path';
import { deliveryRoot, config } from '../环境/配置.ts';
import { commitStatus, relativeToCodeRoot } from '../环境/路径.ts';
import { workName } from '../环境/作品.ts';
import { lowPriority, runCmd, runCapture } from '../环境/子进程.ts';
import { loadAllSegments, type SegInfo } from '../清单/清单.ts';
import { atomicWrite } from '../渲/母版.ts';
import { renderSegments } from '../渲/渲段.ts';
import { filmProfile } from '../渲/设置.ts';
import { probeDurationSec, videoInfo } from '../渲/探测.ts';
import { utcTime, utcMonthDayTime, type RunRecord } from '../运行记录/记录.ts';
import { stageTiming } from '../运行记录/阶段.ts';
import type { RenderLevel } from '../../engine/段/设置值.ts';
import { unnormalizedFile, concatUnnormalized } from './交付.ts';
import { shareAudioKbps, compressShareAudio, encodeShareVersion, measureLoudness } from './成片.ts';
import { placeFilmSubtitles } from './段字幕.ts';
import { srt, subtitleTableTsv } from './字幕.ts';

const targetLoudness = -16;
const truePeakLimit = -1;
const sampleRate = 48000;

export const assembleFilm = async (segments: SegInfo[], opts: { 级别: RenderLevel; 名: string; 范围: string[]; rerender?: boolean; 分享版?: boolean; runRecord: RunRecord }) => {
  const startMs = Date.now();
  const allSegments = await loadAllSegments();
  const timer = stageTiming(opts.runRecord.阶段, `film:${workName()}/${opts.名}:${opts.级别}`);
  const outputs = await renderSegments(allSegments, segments, opts.级别, { rerender: opts.rerender, runRecord: opts.runRecord });
  timer('渲段');
  const skipped = segments.filter((s) => !outputs.some((r) => r.段 === s));
  if (skipped.length) throw new Error(`${skipped.map((s) => s.键).join('、')} 没渲（本机没有区段包），接不成成片；别的段已渲好`);
  for (let k = 1; k < outputs.length; k++) {
    const a = outputs[k - 1]!;
    const b = outputs[k]!;
    if (a.outputStartFrame + a.outputFrames !== b.outputStartFrame) throw new Error(`${a.段.键} 和 ${b.段.键} 在清单里不挨着，接不成一条（各段已渲好；要成片的话范围要是清单里连续的一串段，或者一段一段出）`);
  }
  const filmTier = filmProfile();
  const dir = path.join(deliveryRoot(), `${utcMonthDayTime(startMs)}-${opts.名}`);
  if (fs.existsSync(dir)) throw new Error(`${dir} 已经有了，不覆盖（过一分钟再出或换 --名）`);
  const workDir = path.join(dir, '_工作');
  fs.mkdirSync(workDir, { recursive: true });
  const ffmpeg = config('ffmpeg');

  // 声音
  const unnormalizedPath = path.join(dir, unnormalizedFile);
  // 每段管到下一段的声音起点为止（wav 是这段的输出窗，短了补静音）
  const sampleCounts = outputs.map((r, k) => Math.round(((outputs[k + 1]?.soundStartSec ?? r.soundEndSec) - r.soundStartSec) * sampleRate));
  await concatUnnormalized(outputs.map((r) => r.声音), sampleCounts, unnormalizedPath);
  const loudness = measureLoudness(unnormalizedPath);
  const silent = !Number.isFinite(loudness.lufs) || loudness.lufs < -70;
  if (silent) opts.runRecord.log('警告', `整片几乎没声音（${loudness.lufs} LUFS），不拉响度`);
  const gain = silent ? 0 : targetLoudness - loudness.lufs;
  const normalizedPath = path.join(workDir, '全片声音.wav');
  const finishedAudioPath = path.join(workDir, '全片声音.m4a');
  let margin = 0.5;
  let finalSound = loudness;
  const progress = (levelDb: number, outPath: string) => {
    const limit = 10 ** ((truePeakLimit - levelDb) / 20);
    runCapture([ffmpeg, '-v', 'error', '-y', '-i', unnormalizedPath, '-vn', '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=${limit.toFixed(4)}:attack=1:release=50:level=disabled:asc=0`, '-ar', String(sampleRate), '-c:a', 'pcm_s24le', outPath]);
  };
  for (let i = 0; i < 4; i++) {
    progress(margin, normalizedPath);
    runCapture([ffmpeg, '-v', 'error', '-y', '-i', normalizedPath, '-c:a', 'aac', '-b:a', '192k', finishedAudioPath]);
    finalSound = measureLoudness(finishedAudioPath);
    console.log(`响度：原 ${loudness.lufs.toFixed(1)} LUFS → 加 ${gain.toFixed(1)} dB、限幅 ${(truePeakLimit - margin).toFixed(1)} dBFS → ${finalSound.lufs.toFixed(1)} LUFS、真峰值 ${finalSound.truePeak.toFixed(1)} dBTP`);
    if (finalSound.truePeak <= truePeakLimit) break;
    margin += finalSound.truePeak - truePeakLimit + 0.2;
  }
  timer('声音');

  // 画面：直接拷流接起来，和声音封进一个 mp4
  const concatListPath = path.join(workDir, '接.txt');
  fs.writeFileSync(concatListPath, outputs.map((r) => `file '${r.画面.replace(/'/g, "'\\''")}'\n`).join(''));
  const filmPath = path.join(dir, `${opts.名}.mp4`);
  const writingPath = path.join(workDir, '成片.写入中.mp4');
  await runCmd(lowPriority([ffmpeg, '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-i', finishedAudioPath, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-movflags', '+faststart', writingPath]));
  const totalFrames = outputs.reduce((a, r) => a + r.outputFrames, 0);
  const outputFrames = videoInfo(writingPath).帧数;
  if (outputFrames !== totalFrames) throw new Error(`成片 ${outputFrames} 帧，各段加起来是 ${totalFrames} 帧`);
  fs.renameSync(writingPath, filmPath);
  timer('接画面');

  let shareInfo: { kbps: number; MB: number; truePeak: number; 限幅dBFS: number } | null = null;
  const shareFile = path.join(dir, `${opts.名}-分享版1080p60.mp4`);
  if (opts.分享版) {
    const shareAudio = compressShareAudio(progress, margin, workDir);
    shareInfo = { ...(await encodeShareVersion(filmPath, shareAudio.声音, shareFile)), truePeak: measureLoudness(shareFile).truePeak, 限幅dBFS: shareAudio.限幅dBFS };
    if (shareInfo.truePeak > truePeakLimit) opts.runRecord.log('警告', `分享版真峰值 ${shareInfo.truePeak.toFixed(1)} dBTP，压低限幅 6 次还超过 ${truePeakLimit}`);
    opts.runRecord.产物.push(shareFile);
    timer('分享版');
  }

  // 表：拼接表、字幕表和 SRT（都是输出帧，换成本片从 0 起）
  atomicWrite(path.join(dir, '拼接表.tsv'), '编号\t段\t画面指纹\t声音指纹\t帧数\t全片起帧\n' + outputs.map((r) => `${r.段.编号 ?? ''}\t${r.段.键}\t${r.画面指纹.指纹.slice(0, 16)}\t${r.声音指纹.指纹.slice(0, 16)}\t${r.outputFrames}\t${r.outputStartFrame - outputs[0]!.outputStartFrame}\n`).join(''));
  const subtitles = placeFilmSubtitles(allSegments, filmTier.fps);
  const filmStart = subtitles.起帧.get(segments[0]!.键)!;
  const filmEnd = filmStart + totalFrames;
  const screens = subtitles.屏们.filter((p) => p.止帧 > filmStart && p.起帧 < filmEnd).map((p) => ({ ...p, 起帧: Math.max(0, p.起帧 - filmStart), 止帧: Math.min(filmEnd, p.止帧) - filmStart }));
  const files: Record<string, string> = { 成片: path.basename(filmPath), 拼接表: '拼接表.tsv', 未拉响度: unnormalizedFile };
  if (shareInfo) files.分享版 = path.basename(shareFile);
  if (screens.length) {
    atomicWrite(path.join(dir, '字幕表.tsv'), subtitleTableTsv(screens, filmTier.fps));
    atomicWrite(path.join(dir, `${opts.名}.srt`), srt(screens, filmTier.fps));
    Object.assign(files, { 字幕表: '字幕表.tsv', SRT: `${opts.名}.srt` });
  }
  const manifest = {
    版本: 4,
    作品: workName(),
    名: opts.名,
    范围: opts.范围,
    级别: opts.级别,
    开始: utcTime(startMs),
    完成: utcTime(),
    代码: commitStatus(),
    主机: config('主机'),
    成片档: filmTier.名,
    帧率: filmTier.fps,
    总帧数: totalFrames,
    时长秒: probeDurationSec(filmPath),
    响度: { 原LUFS: loudness.lufs, 增益dB: Number(gain.toFixed(2)), 限幅dBFS: Number((truePeakLimit - margin).toFixed(2)), 成片LUFS: finalSound.lufs, 真峰值dBTP: finalSound.truePeak },
    段: outputs.map((r) => ({ 编号: r.段.编号, 键: r.段.键, 段文件: relativeToCodeRoot(r.段.段文件), 画面指纹: r.画面指纹.指纹, 声音指纹: r.声音指纹.指纹, 帧数: r.outputFrames, 全片起帧: r.outputStartFrame - outputs[0]!.outputStartFrame })),
    字幕: { 屏数: screens.length },
    分享版: shareInfo && { 视频kbps: shareInfo.kbps, 音频kbps: shareAudioKbps, MB: Number(shareInfo.MB.toFixed(2)), 限幅dBFS: Number(shareInfo.限幅dBFS.toFixed(2)), 真峰值dBTP: shareInfo.truePeak },
    文件: files,
  };
  atomicWrite(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.rmSync(workDir, { recursive: true, force: true });
  timer('写表');
  opts.runRecord.产物.push(filmPath);
  console.log(`成片 ${filmPath}：${manifest.时长秒.toFixed(2)} 秒，${totalFrames} 帧，${finalSound.lufs.toFixed(1)} LUFS`);
  return { dir, 成片: filmPath, manifest };
};
