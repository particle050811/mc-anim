// 段产物：每段渲出来就是成片的一截（用户 11-05 定「母版 = 成片切片」，11-06 定只留这一条出片路，决策/0014），这里只算它们叫什么、指纹是多少，不碰 Remotion。
//   画面 cache/母版/<作品>/<段键>/<画面指纹前 16 位>.mp4：成片档的输出帧率、分辨率，叠层和这段的字幕画在里面，按成片参数压好（设置.ts 的 渲染参数）；
//   声音 同目录 <声音指纹前 16 位>.wav：和画面同一遍出（separateAudioTo），声音指纹 = 画面指纹（docs/决策/0015-原生60帧.md）。
// 渲（渲段.ts）、stale、verify、认指纹、cache gc 的钉都从这里取，指纹才是同一份。字幕要按整部作品排、段的输出窗要看全片位置，所以都要传 全部。
import path from 'node:path';
import { filmStartFrameTable } from '../../engine/段/出帧.ts';
import { segFrameCount } from '../../engine/段/段定义.ts';
import type { RenderLevel } from '../../engine/段/设置值.ts';
import { masterDir } from '../环境/作品数据.ts';
import { computeSegFingerprints, stableJson, type SegFingerprint, type FingerprintItem } from '../指纹/指纹.ts';
import type { SegInfo } from '../清单/清单.ts';
import { placeFilmSubtitles, segmentSubtitleCard } from '../合成/段字幕.ts';
import { filmProfile, masterSize, renderParams, type RenderParamsTable } from './设置.ts';

export const segPicturePath = (segKey: string, fingerprint: string, work?: string) => path.join(masterDir(segKey, work), `${fingerprint.slice(0, 16)}.mp4`);
export const segSoundPath = (segKey: string, fingerprint: string, work?: string) => path.join(masterDir(segKey, work), `${fingerprint.slice(0, 16)}.wav`);

export type SegArtifact = {
  段: SegInfo;
  画面指纹: SegFingerprint;
  声音指纹: SegFingerprint;
  画面: string;
  声音: string;
  /** 这段在成片里占的输出帧 */
  outputFrames: number;
  outputStartFrame: number;
  /** 声音起秒、止秒：wav 第 0 个样本、末尾在全片的第几秒（和画面一样） */
  soundStartSec: number;
  soundEndSec: number;
  /** 画面那遍交给 Remotion 的参数（带这段的字幕和声音） */
  参数: RenderParamsTable & { audioCodec: 'pcm-16' };
};

/** 这段在输出帧上的窗：全片第几个输出帧起、占几帧（按 全部 的清单顺序算全片位置；核对段各自从 0 起），和注册工厂给 Composition 的帧数是同一个算法 */
export const segOutputWindow = (allSegments: readonly SegInfo[], s: SegInfo): { 起: number; 帧数: number } => {
  const fps = filmProfile().fps;
  const startFrame = filmStartFrameTable(allSegments, fps).get(s.键);
  if (startFrame === undefined) throw new Error(`${s.键} 不在这部作品的清单里`);
  return { 起: startFrame, 帧数: segFrameCount(s.段, fps) };
};

/** 各段画面那遍的参数（带这段的字幕）；still、bench、逐帧校验、认指纹出帧也用它，和切片一样 */
export const segPictureParams = (allSegments: readonly SegInfo[], segments: readonly SegInfo[], level: RenderLevel): SegArtifact['参数'][] => {
  const filmTier = filmProfile();
  const [width, height] = masterSize(level);
  const subtitles = placeFilmSubtitles(allSegments, filmTier.fps);
  return segments.map((s) => ({ ...renderParams(level, segmentSubtitleCard(s, subtitles, filmTier.fps, width, height)), muted: false, audioCodec: 'pcm-16' as const }));
};

/** 算各段的画面、声音指纹和输出窗（全部 = 整部作品的段） */
export const segmentProducts = async (allSegments: readonly SegInfo[], segments: readonly SegInfo[], level: RenderLevel): Promise<SegArtifact[]> => {
  const pictureParams = segPictureParams(allSegments, segments, level);
  const fingerprints = await computeSegFingerprints(segments.map((s, i) => ({ 段: s, 渲染设置: pictureParams[i]! })));
  const fps = filmProfile().fps;
  return segments.map((s, i) => {
    const outputWindow = segOutputWindow(allSegments, s);
    const fingerprint = fingerprints[i]!;
    return {
      段: s,
      画面指纹: fingerprint,
      声音指纹: fingerprint,
      画面: segPicturePath(s.键, fingerprint.指纹),
      声音: segSoundPath(s.键, fingerprint.指纹),
      outputFrames: outputWindow.帧数,
      outputStartFrame: outputWindow.起,
      soundStartSec: outputWindow.起 / fps,
      soundEndSec: (outputWindow.起 + outputWindow.帧数) / fps,
      参数: pictureParams[i]!,
    };
  });
};

/** 指纹记录是不是画面那遍的（以前另出的声音那遍 codec 是 wav，历史里还留着） */
export const isPictureRecord = (h: { 项?: Pick<FingerprintItem, '渲染设置'> }) => h.项?.渲染设置?.codec !== 'wav';

/** 同一档：同一渲染级别、同一输出帧率的画面记录（stale 比差异、认指纹找旧版只在同档里找；字幕变了照样同档，差异里看得到） */
export const sameTier = (a: { 项?: Pick<FingerprintItem, '渲染设置'> }, b: { 项?: Pick<FingerprintItem, '渲染设置'> }) => {
  const tierKey = (h: typeof a) => {
    const p = h.项?.渲染设置?.inputProps as { 级别?: unknown; 输出fps?: unknown } | undefined;
    return stableJson([p?.级别 ?? null, p?.输出fps ?? null, h.项?.渲染设置?.scale ?? null]);
  };
  return isPictureRecord(a) && isPictureRecord(b) && tierKey(a) === tierKey(b);
};

/**
 * 画面那遍的指纹记录 → 配的那份 wav 的指纹：声音和画面同一遍出，就是画面记录自己的指纹。认指纹按它找旧画面配的 wav。
 * 11-06 以前另出声音那遍的旧切片（画面记录没有 muted: false）配不上，认指纹不沿用它们（用户 11-06「反正旧的不用兼容」）
 */
export const pairedSoundFingerprint = (pictureFingerprint: Pick<SegFingerprint, '指纹' | '项'>): string | null => (pictureFingerprint.项.渲染设置.muted === false ? pictureFingerprint.指纹 : null);
