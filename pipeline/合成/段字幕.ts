// 段里画的字幕（用户 11-05 定「母版 = 成片切片」：字幕不再后叠，跟着段一起渲）。
// 字幕的时间要看前后句、配音的停顿，所以先按整部作品的正片顺序排一遍（字幕.ts），再切给各段：
// 全片按输出帧排（engine/段/出帧.ts 的全片起帧），落在这一段输出窗里的那截就是这段的；跨段的一屏前后两段各画一截。
// 卡画成整帧大小的透明 PNG（字幕卡.ts），进渲染设置的 字幕，所以字幕变了只有涉及的段指纹变。
import { filmStartFrameTable } from '../../engine/段/出帧.ts';
import { segFrameCount } from '../../engine/段/段定义.ts';
import type { SegSubtitle } from '../../engine/段/设置值.ts';
import { workRoot } from '../环境/作品.ts';
import type { SegInfo } from '../清单/清单.ts';
import { readWorkAssetLock, resolveAsset } from '../资产/资产锁.ts';
import { readMono } from './音频.ts';
import { placeSubtitles, type SubtitleScreen } from './字幕.ts';
import { drawFullFrameCard } from './字幕卡.ts';
import { prevSegmentOf, computeLineLandings, readLineTable } from './台词落点.ts';

/** 全部正片段按清单顺序排字幕；返回各屏（全片输出帧，fps 是成片帧率）和各段的全片起帧 */
export const placeFilmSubtitles = (allSegments: readonly SegInfo[], fps: number) => {
  const mainCut = allSegments.filter((s) => s.章 !== '核对');
  const startFrame = filmStartFrameTable(allSegments, fps);
  if (!mainCut.some((s) => s.段.声音?.some((x) => x.台词 !== undefined))) return { 屏们: [] as SubtitleScreen[], 起帧: startFrame };
  const assetLock = readWorkAssetLock(workRoot());
  const placements = mainCut.map((s) => ({ 段: s, 全片起帧: startFrame.get(s.键)! }));
  const landings = computeLineLandings(placements, readLineTable(), (id) => resolveAsset(id, assetLock).文件, fps, prevSegmentOf([...allSegments]));
  const totalFrames = placements.reduce((a, c) => a + segFrameCount(c.段.段, fps), 0);
  const cutPoints = placements.slice(1).map((c) => c.全片起帧);
  const audioCache = new Map<string, Float32Array>();
  const readMonoCached = (f: string) => audioCache.get(f) ?? audioCache.set(f, readMono(f)).get(f)!;
  return { 屏们: placeSubtitles(landings, totalFrames, fps, readMonoCached, cutPoints).屏们, 起帧: startFrame };
};

/** 一段的字幕卡：本段输出帧 [起, 止)；全片要是按 输出fps 排的；画面宽高是成片像素 */
export const segmentSubtitleCard = (s: SegInfo, filmSubtitles: ReturnType<typeof placeFilmSubtitles>, outputFps: number, pictureWidth: number, pictureHeight: number): SegSubtitle[] => {
  if (s.章 === '核对') return [];
  const span = { 起: filmSubtitles.起帧.get(s.键)!, 帧数: segFrameCount(s.段, outputFps) };
  const imageCache = new Map<string, string>();
  const out: SegSubtitle[] = [];
  for (const p of filmSubtitles.屏们) {
    const startFrame = Math.max(0, p.起帧 - span.起);
    const endFrame = Math.min(span.帧数, p.止帧 - span.起);
    if (endFrame <= startFrame) continue;
    const key = `${p.位置}\u0000${p.字}`;
    let imagePath = imageCache.get(key);
    if (!imagePath) {
      imagePath = `data:image/png;base64,${drawFullFrameCard(p.字, p.位置, pictureWidth, pictureHeight).toString('base64')}`;
      imageCache.set(key, imagePath);
    }
    out.push({ 图: imagePath, 起: startFrame, 止: endFrame });
  }
  return out;
};
