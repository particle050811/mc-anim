// 段的 cue 表 → 母版里每一声怎么放（从段内第几秒起、放几秒、文件里从第几秒起、变速、循环、随时间的增益）。<SegSound>（段画面.tsx）照它挂 <Audio>。
// 不依赖 React，单独测。cue 都是秒（段定义.ts），不对齐到任何帧网格（docs/决策/0015-原生60帧.md）。资产 cue 从 cue 的秒起、放 长秒、文件从 入点秒 起、按 cue 增益；
// 台词 cue 同 pipeline/合成/台词落点.ts 的 台词头们：文件头 = 开口 − 开口秒，从文件头放到文件完多 台词尾余秒、段尾或同一句的下一截为止（段头之前的跳过）。
import { cueGain, lineTailSec, segDurSec, type SegmentDef, type AssetCue } from './段定义.ts';
import type { SoundTable } from './声音助手.ts';

export type SoundItem = {
  /** 要放的文件的资产 id（声音地址表的键） */
  asset: string;
  name: string;
  档?: string;
  /** 段内第几秒起放（带小数） */
  startSec: number;
  /** 放几秒 */
  durSec: number;
  入点秒: number;
  速率: number;
  循环: boolean;
  /** 起放后第 t 秒的增益 */
  增益: (t: number) => number;
  /** 同一个文件和前面某一声叠着放时，给 src 加的区分标记（engine/audio/同源区分.ts） */
  distinctKey?: string;
};
const assetSound = (c: AssetCue): SoundItem => {
  if (c.循环 && (c.入点秒 ?? 0) > 0) throw new Error(`${c.name}（第 ${c.sec} 秒）：循环的 cue 不能带入点秒（段框架还不支持从文件中间起循环，拆成两条 cue）`);
  return {
    asset: c.asset,
    name: c.name,
    ...(c.档 !== undefined ? { 档: c.档 } : {}),
    startSec: c.sec,
    durSec: c.长秒,
    入点秒: c.入点秒 ?? 0,
    速率: c.速率 ?? 1,
    循环: Boolean(c.循环),
    增益: (t) => cueGain(c, t),
  };
};

/** 一段的全部声音。台词增益：台词总线的音量（engine/audio/混音.ts 的 lineVolume，去台词时是 0） */
export const segPlayPlan = (seg: Pick<SegmentDef, 'sound' | 'sec'>, soundTable: SoundTable, o: { lineGain: number }): SoundItem[] => {
  const cues = seg.sound ?? [];
  const segLengthSec = segDurSec(seg);
  const openSec = new Map<string, number>();
  const out: SoundItem[] = [];
  cues.forEach((c, i) => {
    if (c.lines === undefined) {
      out.push(assetSound(c));
      return;
    }
    const t = soundTable.lines[c.lines];
    if (!t) throw new Error(`声音表里没有台词「${c.lines}」：跑 anim cues`);
    const f = c.接上段 ? (openSec.get(c.lines) ?? t.上段开口秒) : c.sec;
    if (f === undefined) throw new Error(`第 ${c.sec} 秒的台词「${c.lines}」标了 接上段，本段前面和清单里上一段都没有它开口`);
    openSec.set(c.lines, f);
    const leadSec = f - t.mouthOpen;
    const startSec = c.接上段 ? c.sec : Math.max(0, leadSec);
    const shiftSec = startSec - leadSec;
    // 截到段尾、同一句的下一截
    const nextSlice = cues.slice(i + 1).find((x) => x.lines === c.lines);
    const limit = Math.min(segLengthSec, nextSlice ? nextSlice.sec : Infinity) - startSec;
    const lengthSec = Math.min(c.长秒 ?? t.duration - shiftSec + lineTailSec, limit);
    if (lengthSec <= 1e-9) return;
    out.push({ asset: t.voice, name: c.lines, startSec: startSec, durSec: lengthSec, 入点秒: shiftSec, 速率: 1, 循环: false, 增益: () => o.lineGain });
  });
  // 同一个文件叠着放：后面那声加区分标记，不然母版里只剩一声（同源区分.ts）
  for (let i = 0; i < out.length; i++) {
    const a = out[i]!;
    if (out.slice(0, i).some((b) => b.asset === a.asset && b.startSec < a.startSec + a.durSec && a.startSec < b.startSec + b.durSec)) a.distinctKey = `段声音${i}`;
  }
  return out;
};
