// 台词落点：按清单顺序扫各段 段.ts 的声音 cue，台词 cue 换成全片输出帧、配音文件、要显示的字和断屏（给 字幕.ts 排时间）。
// cue 的秒是开口落在段内第几秒（同 engine/段/放法.ts），文件头 = 秒 − 开口秒；开口秒、字幕位置取 <作品根>/台词.toml 那条（字幕位置没写是 下）。
// 接上段的 cue（上一段说过来的后半截）照旧项目 台词落点.ts：跨段的另记一条 接上段，只拿来核对；同一段里接着放的不另记。
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { segDurSec, type SegmentDef, type LineCue } from '../../engine/段/段定义.ts';
import { workRoot } from '../环境/作品.ts';
import type { SegInfo } from '../清单/清单.ts';
import type { LineLanding } from './字幕.ts';
import { breakScreens, type SubtitlePosition } from './字幕卡.ts';

export type LineEntry = { id: string; 角色: string; 文本: string; 配音?: string; 开口?: number; 字幕位置?: SubtitlePosition; unused?: boolean };
export type ClausePosition = { 段: SegInfo; 全片起帧: number };
type SegSoundInput = Pick<SegmentDef, '声音' | '秒'>;

export const readLineTable = (file = path.join(workRoot(), '台词.toml')): LineEntry[] =>
  fs.existsSync(file) ? (((parse(fs.readFileSync(file, 'utf8')) as { 台词?: LineEntry[] }).台词 ?? []) as LineEntry[]) : [];

/** 台词 id → 开口秒（<作品根>/台词.toml 的 开口，没写按 0：文件开头就开口） */
export const openTable = (lineTable: LineEntry[]) => {
  const m = new Map(lineTable.map((t) => [t.id, t.开口 ?? 0]));
  return (id: string) => m.get(id) ?? 0;
};

/** 清单里的上一段（接上段的台词按它的开口算文件头，核对段不算）；全 = pipeline/清单 的 全部段() */
export const prevSegmentOf = (segments: SegInfo[]) => {
  const filmSegments = segments.filter((s) => s.章 !== '核对');
  return (segKey: string) => {
    const i = filmSegments.findIndex((s) => s.键 === segKey);
    return i > 0 ? filmSegments[i - 1]!.段 : undefined;
  };
};

export type LineHead = { cue: LineCue; openSec: number; 头秒: number; startSec: number };

/** 一段里每条台词 cue：开口落在段内第几秒（接上段的照前一截推）、文件头在段内第几秒、从段内第几秒起放（和 engine/段/放法.ts 的 段放法 一样）。
 *  开口先换到本段再减开口秒（不先算头再挪段） */
export const lineHeads = (seg: SegSoundInput, mouthOpenOf: (id: string) => number, prevSeg?: SegSoundInput, strict = true): LineHead[] => {
  const prevCueFrames = new Map<string, number>();
  if (prevSeg) for (const x of lineHeads(prevSeg, mouthOpenOf, undefined, false)) prevCueFrames.set(x.cue.台词, x.openSec - segDurSec(prevSeg));
  const openSec = new Map<string, number>();
  const out: LineHead[] = [];
  for (const c of seg.声音 ?? []) {
    if (c.台词 === undefined) continue;
    const f = c.接上段 ? (openSec.get(c.台词) ?? prevCueFrames.get(c.台词)) : c.秒;
    if (f === undefined) {
      if (strict) throw new Error(`第 ${c.秒} 秒的台词「${c.台词}」标了 接上段，本段前面和清单里上一段都没有它开口`);
      continue;
    }
    openSec.set(c.台词, f);
    const leadSec = f - mouthOpenOf(c.台词);
    out.push({ cue: c, openSec: f, 头秒: leadSec, startSec: c.接上段 ? c.秒 : Math.max(0, leadSec) });
  }
  return out;
};

/** 截们的全片起帧、落点的帧都是 fps 帧的输出帧（带小数） */
export const computeLineLandings = (
  placements: ClausePosition[],
  lineTable: LineEntry[],
  getVoice: (assetId: string) => string,
  fps: number,
  prevSeg: (segKey: string) => SegSoundInput | undefined = () => undefined,
): LineLanding[] => {
  const lineMap = new Map(lineTable.map((t) => [t.id, t]));
  const mouthOpenTable = openTable(lineTable);
  const out: LineLanding[] = [];
  for (const { 段: s, 全片起帧: filmStartFrame } of placements) {
    const visitLine = (id: string) => {
      const t = lineMap.get(id);
      if (!t) throw new Error(`${s.键} 的台词「${id}」不在 <作品根>/台词.toml 里`);
      if (!t.配音) throw new Error(`台词「${t.id}」还没配音（<作品根>/台词.toml 没写 配音），出不了字幕`);
      return t as LineEntry & { 配音: string };
    };
    for (const c of s.段.声音 ?? []) if (c.台词 !== undefined) visitLine(c.台词);
    const openedInSegment = new Set<string>();
    for (const { cue, 头秒: headSec } of lineHeads(s.段, mouthOpenTable, prevSeg(s.键))) {
      // 同一段里接着放的后半截和前半截是同一句，不另记
      if (cue.接上段 && openedInSegment.has(cue.台词)) continue;
      openedInSegment.add(cue.台词);
      const t = visitLine(cue.台词);
      out.push({
        id: t.id,
        段: s.键,
        段内帧: cue.秒 * fps,
        文件头帧: filmStartFrame + headSec * fps,
        文件: getVoice(t.配音),
        配音: t.配音,
        字: t.文本,
        角色: t.角色,
        位置: t.字幕位置 ?? '下',
        屏们: breakScreens(t.文本, s.段.宽 / s.段.高),
        ...(cue.接上段 ? { 接上段: true } : {}),
      });
    }
  }
  return out;
};
