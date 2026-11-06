// 段的 cue 表 → 母版里每一声怎么放（从段内第几秒起、放几秒、文件里从第几秒起、变速、循环、随时间的增益）。<段声音>（段画面.tsx）照它挂 <Audio>。
// 不依赖 React，单独测。cue 都是秒（段定义.ts），不对齐到任何帧网格（docs/决策/0015-原生60帧.md）。资产 cue 从 cue 的秒起、放 长秒、文件从 入点秒 起、按 cue 增益；
// 台词 cue 同 pipeline/合成/台词落点.ts 的 台词头们：文件头 = 开口 − 开口秒，从文件头放到文件完多 台词尾余秒、段尾或同一句的下一截为止（段头之前的跳过）。
import { cue增益, 台词尾余秒, 段长秒, type 段定义, type 资产cue } from './段定义.ts';
import type { 声音表 } from './声音助手.ts';

export type 一声 = {
  /** 要放的文件的资产 id（声音地址表的键） */
  资产: string;
  名: string;
  档?: string;
  /** 段内第几秒起放（带小数） */
  起秒: number;
  /** 放几秒 */
  秒数: number;
  入点秒: number;
  速率: number;
  循环: boolean;
  /** 起放后第 t 秒的增益 */
  增益: (t: number) => number;
  /** 同一个文件和前面某一声叠着放时，给 src 加的区分标记（engine/audio/同源区分.ts） */
  区分?: string;
};

export const 是配乐 = (资产: string) => 资产.startsWith('配乐/');

const 资产一声 = (c: 资产cue): 一声 => {
  if (c.循环 && (c.入点秒 ?? 0) > 0) throw new Error(`${c.名}（第 ${c.秒} 秒）：循环的 cue 不能带入点秒（段框架还不支持从文件中间起循环，拆成两条 cue）`);
  return {
    资产: c.资产,
    名: c.名,
    ...(c.档 !== undefined ? { 档: c.档 } : {}),
    起秒: c.秒,
    秒数: c.长秒,
    入点秒: c.入点秒 ?? 0,
    速率: c.速率 ?? 1,
    循环: Boolean(c.循环),
    增益: (t) => cue增益(c, t),
  };
};

/** 一段的全部声音。台词增益：台词总线的音量（engine/audio/混音.ts 的 lineVolume，去台词时是 0） */
export const 段放法 = (段: Pick<段定义, '声音' | '秒'>, 表: 声音表, o: { 台词增益: number }): 一声[] => {
  const cues = 段.声音 ?? [];
  const 段长 = 段长秒(段);
  const 开口秒 = new Map<string, number>();
  const out: 一声[] = [];
  cues.forEach((c, i) => {
    if (c.台词 === undefined) {
      out.push(资产一声(c));
      return;
    }
    const t = 表.台词[c.台词];
    if (!t) throw new Error(`声音表里没有台词「${c.台词}」：跑 anim cues`);
    const f = c.接上段 ? (开口秒.get(c.台词) ?? t.上段开口秒) : c.秒;
    if (f === undefined) throw new Error(`第 ${c.秒} 秒的台词「${c.台词}」标了 接上段，本段前面和清单里上一段都没有它开口`);
    开口秒.set(c.台词, f);
    const 头 = f - t.开口;
    const 起 = c.接上段 ? c.秒 : Math.max(0, 头);
    const 跳 = 起 - 头;
    // 截到段尾、同一句的下一截
    const 下一截 = cues.slice(i + 1).find((x) => x.台词 === c.台词);
    const 上限 = Math.min(段长, 下一截 ? 下一截.秒 : Infinity) - 起;
    const 长 = Math.min(c.长秒 ?? t.时长 - 跳 + 台词尾余秒, 上限);
    if (长 <= 1e-9) return;
    out.push({ 资产: t.配音, 名: c.台词, 起秒: 起, 秒数: 长, 入点秒: 跳, 速率: 1, 循环: false, 增益: () => o.台词增益 });
  });
  // 同一个文件叠着放：后面那声加区分标记，不然母版里只剩一声（同源区分.ts）
  for (let i = 0; i < out.length; i++) {
    const a = out[i]!;
    if (out.slice(0, i).some((b) => b.资产 === a.资产 && b.起秒 < a.起秒 + a.秒数 && a.起秒 < b.起秒 + b.秒数)) a.区分 = `段声音${i}`;
  }
  return out;
};
