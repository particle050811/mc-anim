// 拼成片：anim film 唯一的出片路（决策/0014）。缺的段先渲（渲段.ts：每段已是成片的一截，叠层、字幕在段里，按成片参数压好），这里只接不重压（用户 11-05 定「母版 = 成片切片」）。
//   选的段要是清单里挨着的一串（单独一段、一个核对段也行），不挨着的先照样渲完，再拒绝接；
//   画面：ffmpeg concat 直接拷流（各段同一套编码参数、都从关键帧起）；
//   声音：各段的 wav（和画面同一遍出，长度就是段长）按样本截、接，整片一个固定增益拉到 −16 LUFS + 限幅，压 AAC 量真峰值，超了压低限幅重做（照旧 成片.ts）；
//   出到 <数据根>/交付/<UTC 月日-时分>-<名>/：成片、拼接表、字幕表、SRT、全片-未拉响度.flac、manifest.json；
//   --share 另从成片压一份 B 站 1080P60 AV1 档的（参数、文件名照旧 成片.ts，用户 11-05 定），只在要时加。
// 试看（设了 REMOTION_ANIM_TRIAL，出片/试看.ts）：各段当场渲进草稿夹、不进切片缓存，接法同上，出到 <数据根>/run/草稿/<UTC 月日-时分>-工作-试看-<名>/，不进 交付/。
import fs from 'node:fs';
import path from 'node:path';
import { deliveryRoot } from '../环境/作品数据.ts';
import { config, draftRoot } from '../环境/配置.ts';
import { commitStatus, relativeToCodeRoot } from '../环境/路径.ts';
import { workName } from '../环境/作品.ts';
import { lowPriority, runCmd, runCapture } from '../环境/子进程.ts';
import { loadAllSegments, type SegInfo } from '../清单/清单.ts';
import { atomicWrite } from '../渲/母版.ts';
import { renderSegments } from './渲段.ts';
import type { FilmPiece } from '../渲/段产物.ts';
import { renderTrialSegments } from './试看.ts';
import { trialEnv } from '../渲/地形注入.ts';
import { filmProfile } from '../渲/设置.ts';
import { probeDurationSec, videoInfo } from '../渲/探测.ts';
import { utcTime, utcMonthDayTime, type RunRecord } from '../运行记录/记录.ts';
import { stageTiming } from '../运行记录/阶段.ts';
import type { RenderLevel } from '../../engine/段/设置值.ts';
import { unnormalizedFile, concatUnnormalized } from '../合成/交付.ts';
import { shareAudioKbps, compressShareAudio, encodeShareVersion, measureLoudness } from '../合成/成片.ts';
import { placeFilmSubtitles } from '../合成/段字幕.ts';
import { srt, subtitleTableTsv } from '../合成/字幕.ts';

const targetLoudness = -16;
const truePeakLimit = -1;
const sampleRate = 48000;

/** 试看片的草稿夹：Agent 自己看、也拿来给用户比的中间稿，不进 交付/（CLAUDE.md：工作- 开头写到 run/草稿/） */
export const trialFilmDir = (startMs: number, name: string) => path.join(draftRoot(), `${utcMonthDayTime(startMs)}-工作-试看-${name}`);

/** trial：试看出片（出片/试看.ts），frames 是段内输出帧号的闭区间、只配一段 */
export const assembleFilm = async (segments: SegInfo[], opts: { level: RenderLevel; name: string; bounds: string[]; rerender?: boolean; shareVersion?: boolean; trial?: { frames?: [number, number] }; runRecord: RunRecord }) => {
  const startMs = Date.now();
  const allSegments = await loadAllSegments();
  const trial = opts.trial;
  const timer = stageTiming(opts.runRecord.stage, `${trial ? 'film试看' : 'film'}:${workName()}/${opts.name}:${opts.level}`);
  let outputs: FilmPiece[];
  let dir: string;
  if (trial) {
    dir = trialFilmDir(startMs, opts.name);
    if (fs.existsSync(dir)) throw new Error(`${dir} 已经有了，不覆盖（过一分钟再出或换 --name）`);
    outputs = await renderTrialSegments(allSegments, segments, opts.level, { frames: trial.frames, workDir: path.join(dir, '_工作'), runRecord: opts.runRecord });
  } else {
    outputs = await renderSegments(allSegments, segments, opts.level, { rerender: opts.rerender, runRecord: opts.runRecord });
    dir = path.join(deliveryRoot(), `${utcMonthDayTime(startMs)}-${opts.name}`);
  }
  timer('渲段');
  const skipped = segments.filter((s) => !outputs.some((r) => r.segment === s));
  if (skipped.length) throw new Error(`${skipped.map((s) => s.key).join('、')} 没渲（本机没有区段包），接不成成片；别的段已渲好`);
  for (let k = 1; k < outputs.length; k++) {
    const a = outputs[k - 1]!;
    const b = outputs[k]!;
    if (a.outputStartFrame + a.outputFrames !== b.outputStartFrame) throw new Error(`${a.segment.key} 和 ${b.segment.key} 在清单里不挨着，接不成一条（各段已渲好；要成片的话范围要是清单里连续的一串段，或者一段一段出）`);
  }
  const filmTier = filmProfile();
  if (!trial && fs.existsSync(dir)) throw new Error(`${dir} 已经有了，不覆盖（过一分钟再出或换 --name）`);
  const workDir = path.join(dir, '_工作');
  fs.mkdirSync(workDir, { recursive: true });
  const ffmpeg = config('ffmpeg');

  // 声音
  const unnormalizedPath = path.join(dir, unnormalizedFile);
  // 每段管到下一段的声音起点为止（wav 是这段的输出窗，短了补静音）
  const sampleCounts = outputs.map((r, k) => Math.round(((outputs[k + 1]?.soundStartSec ?? r.soundEndSec) - r.soundStartSec) * sampleRate));
  await concatUnnormalized(outputs.map((r) => r.sound), sampleCounts, unnormalizedPath);
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
  const filmPath = path.join(dir, `${opts.name}.mp4`);
  const writingPath = path.join(workDir, '成片.写入中.mp4');
  await runCmd(lowPriority([ffmpeg, '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-i', finishedAudioPath, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-movflags', '+faststart', writingPath]));
  const totalFrames = outputs.reduce((a, r) => a + r.outputFrames, 0);
  const outputFrames = videoInfo(writingPath).frameCount;
  if (outputFrames !== totalFrames) throw new Error(`成片 ${outputFrames} 帧，各段加起来是 ${totalFrames} 帧`);
  fs.renameSync(writingPath, filmPath);
  timer('接画面');

  let shareInfo: { kbps: number; MB: number; truePeak: number; limitDbfs: number } | null = null;
  const shareFile = path.join(dir, `${opts.name}-分享版1080p60.mp4`);
  if (opts.shareVersion) {
    const shareAudio = compressShareAudio(progress, margin, workDir);
    shareInfo = { ...(await encodeShareVersion(filmPath, shareAudio.sound, shareFile)), truePeak: measureLoudness(shareFile).truePeak, limitDbfs: shareAudio.limitDbfs };
    if (shareInfo.truePeak > truePeakLimit) opts.runRecord.log('警告', `分享版真峰值 ${shareInfo.truePeak.toFixed(1)} dBTP，压低限幅 6 次还超过 ${truePeakLimit}`);
    opts.runRecord.artifacts.push(shareFile);
    timer('分享版');
  }

  // 表：拼接表、字幕表和 SRT（都是输出帧，换成本片从 0 起）
  atomicWrite(path.join(dir, '拼接表.tsv'), '编号\t段\t画面指纹\t声音指纹\t帧数\t全片起帧\n' + outputs.map((r) => `${r.segment.serial ?? ''}\t${r.segment.key}\t${r.pictureFingerprint?.fingerprint.slice(0, 16) ?? '试看'}\t${r.soundFingerprint?.fingerprint.slice(0, 16) ?? '试看'}\t${r.outputFrames}\t${r.outputStartFrame - outputs[0]!.outputStartFrame}\n`).join(''));
  const subtitles = placeFilmSubtitles(allSegments, filmTier.fps);
  // 试看只出一截时，片子从这段的第 frames[0] 帧起
  const filmStart = subtitles.起帧.get(segments[0]!.key)! + (trial?.frames?.[0] ?? 0);
  const filmEnd = filmStart + totalFrames;
  const screens = subtitles.屏们.filter((p) => p.止帧 > filmStart && p.起帧 < filmEnd).map((p) => ({ ...p, 起帧: Math.max(0, p.起帧 - filmStart), 止帧: Math.min(filmEnd, p.止帧) - filmStart }));
  const files: Record<string, string> = { film: path.basename(filmPath), concatTable: '拼接表.tsv', unnormalizedAudio: unnormalizedFile };
  if (shareInfo) files.shareVersion = path.basename(shareFile);
  if (screens.length) {
    atomicWrite(path.join(dir, '字幕表.tsv'), subtitleTableTsv(screens, filmTier.fps));
    atomicWrite(path.join(dir, `${opts.name}.srt`), srt(screens, filmTier.fps));
    Object.assign(files, { subtitleTable: '字幕表.tsv', SRT: `${opts.name}.srt` });
  }
  const manifest = {
    version: 4,
    work: workName(),
    name: opts.name,
    bounds: opts.bounds,
    ...(trial ? { trial: trialEnv(), frames: trial.frames ?? null } : {}),
    level: opts.level,
    startedAt: utcTime(startMs),
    completed: utcTime(),
    code: commitStatus(),
    host: config('主机'),
    filmProfile: filmTier.name,
    fps: filmTier.fps,
    totalFrameCount: totalFrames,
    durationSec: probeDurationSec(filmPath),
    loudness: { sourceLufs: loudness.lufs, gainDb: Number(gain.toFixed(2)), limitDbfs: Number((truePeakLimit - margin).toFixed(2)), filmLufs: finalSound.lufs, truePeakDbtp: finalSound.truePeak },
    segment: outputs.map((r) => ({ serial: r.segment.serial, key: r.segment.key, segmentFile: relativeToCodeRoot(r.segment.segmentFile), pictureFingerprint: r.pictureFingerprint?.fingerprint ?? null, soundFingerprint: r.soundFingerprint?.fingerprint ?? null, frameCount: r.outputFrames, filmStartFrame: r.outputStartFrame - outputs[0]!.outputStartFrame })),
    subtitles: { screenCount: screens.length },
    shareVersion: shareInfo && { videoKbps: shareInfo.kbps, audioKbps: shareAudioKbps, MB: Number(shareInfo.MB.toFixed(2)), limitDbfs: Number(shareInfo.limitDbfs.toFixed(2)), truePeakDbtp: shareInfo.truePeak },
    file: files,
  };
  atomicWrite(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.rmSync(workDir, { recursive: true, force: true });
  timer('写表');
  opts.runRecord.artifacts.push(filmPath);
  console.log(`成片 ${filmPath}：${manifest.durationSec.toFixed(2)} 秒，${totalFrames} 帧，${finalSound.lufs.toFixed(1)} LUFS`);
  if (trial) console.log(`试看片（草稿，没进切片缓存、交付）在 ${dir}`);
  return { dir, film: filmPath, manifest };
};
