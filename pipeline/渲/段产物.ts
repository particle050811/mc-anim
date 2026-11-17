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
  segment: SegInfo;
  pictureFingerprint: SegFingerprint;
  soundFingerprint: SegFingerprint;
  画面: string;
  sound: string;
  /** 这段在成片里占的输出帧 */
  outputFrames: number;
  outputStartFrame: number;
  /** 声音起秒、止秒：wav 第 0 个样本、末尾在全片的第几秒（和画面一样） */
  soundStartSec: number;
  soundEndSec: number;
  /** 画面那遍交给 Remotion 的参数（带这段的字幕和声音） */
  params: RenderParamsTable & { audioCodec: 'pcm-16' };
};

/** 接成片的一截（出片/拼成片.ts）：切片（带指纹）或试看片（出片/试看.ts，没有指纹） */
export type FilmPiece = Pick<SegArtifact, 'segment' | '画面' | 'sound' | 'outputFrames' | 'outputStartFrame' | 'soundStartSec' | 'soundEndSec'> & Partial<Pick<SegArtifact, 'pictureFingerprint' | 'soundFingerprint'>>;

/** 这段在输出帧上的窗：全片第几个输出帧起、占几帧（按 全部 的清单顺序算全片位置；核对段各自从 0 起），和注册工厂给 Composition 的帧数是同一个算法 */
export const segOutputWindow = (allSegments: readonly SegInfo[], s: SegInfo): { start: number; frameCount: number } => {
  const fps = filmProfile().fps;
  const startFrame = filmStartFrameTable(allSegments, fps).get(s.key);
  if (startFrame === undefined) throw new Error(`${s.key} 不在这部作品的清单里`);
  return { start: startFrame, frameCount: segFrameCount(s.segment, fps) };
};

/** 各段画面那遍的参数（带这段的字幕）；still、bench、逐帧校验、认指纹出帧也用它，和切片一样 */
export const segPictureParams = (allSegments: readonly SegInfo[], segments: readonly SegInfo[], level: RenderLevel): SegArtifact['params'][] => {
  const filmTier = filmProfile();
  const [width, height] = masterSize(level);
  const subtitles = placeFilmSubtitles(allSegments, filmTier.fps);
  return segments.map((s) => ({ ...renderParams(level, segmentSubtitleCard(s, subtitles, filmTier.fps, width, height)), muted: false, audioCodec: 'pcm-16' as const }));
};

/** 算各段的画面、声音指纹和输出窗（全部 = 整部作品的段） */
export const segmentProducts = async (allSegments: readonly SegInfo[], segments: readonly SegInfo[], level: RenderLevel): Promise<SegArtifact[]> => {
  const pictureParams = segPictureParams(allSegments, segments, level);
  const fingerprints = await computeSegFingerprints(segments.map((s, i) => ({ segment: s, renderSettings: pictureParams[i]! })));
  const fps = filmProfile().fps;
  return segments.map((s, i) => {
    const outputWindow = segOutputWindow(allSegments, s);
    const fingerprint = fingerprints[i]!;
    return {
      segment: s,
      pictureFingerprint: fingerprint,
      soundFingerprint: fingerprint,
      画面: segPicturePath(s.key, fingerprint.fingerprint),
      sound: segSoundPath(s.key, fingerprint.fingerprint),
      outputFrames: outputWindow.frameCount,
      outputStartFrame: outputWindow.start,
      soundStartSec: outputWindow.start / fps,
      soundEndSec: (outputWindow.start + outputWindow.frameCount) / fps,
      params: pictureParams[i]!,
    };
  });
};

/** 指纹记录是不是画面那遍的（以前另出的声音那遍 codec 是 wav，历史里还留着） */
export const isPictureRecord = (h: { items?: Pick<FingerprintItem, 'renderSettings'> }) => h.items?.renderSettings?.codec !== 'wav';

/** 同一档：同一渲染级别、同一输出帧率的画面记录（stale 比差异、认指纹找旧版只在同档里找；字幕变了照样同档，差异里看得到） */
export const sameTier = (a: { items?: Pick<FingerprintItem, 'renderSettings'> }, b: { items?: Pick<FingerprintItem, 'renderSettings'> }) => {
  const tierKey = (h: typeof a) => {
    const p = h.items?.renderSettings?.inputProps as { level?: unknown; outputFps?: unknown } | undefined;
    return stableJson([p?.level ?? null, p?.outputFps ?? null, h.items?.renderSettings?.scale ?? null]);
  };
  return isPictureRecord(a) && isPictureRecord(b) && tierKey(a) === tierKey(b);
};

/**
 * 画面那遍的指纹记录 → 配的那份 wav 的指纹：声音和画面同一遍出，就是画面记录自己的指纹。认指纹按它找旧画面配的 wav。
 * 11-06 以前另出声音那遍的旧切片（画面记录没有 muted: false）配不上，认指纹不沿用它们（用户 11-06「反正旧的不用兼容」）
 */
export const pairedSoundFingerprint = (pictureFingerprint: Pick<SegFingerprint, 'fingerprint' | 'items'>): string | null => (pictureFingerprint.items.renderSettings.muted === false ? pictureFingerprint.fingerprint : null);
