// 段的 cue 表 → 母版里每一声怎么放（从段内第几帧起、放几帧、文件里从第几秒起、变速、循环、逐帧增益）。<段声音>（段画面.tsx）照它挂 <Audio>。
// 不依赖 React，单独测。资产 cue 的放法同 作品/把回忆拼好给你/声音/音效轨.tsx、配乐/配乐音轨.tsx；
// 台词 cue 同 engine/audio/台词轨.tsx 和 pipeline/合成/台词落点.ts 的 台词头们：文件头 = 开口帧 − 开口秒 × fps，从文件头放到文件完多 1 帧、段尾或同一句的下一截为止。
import { cue增益, type 段定义, type 资产cue } from './段定义.ts';
import type { 声音表 } from './声音助手.ts';

export type 清单类 = '音效清单' | '配乐清单' | '台词清单';

export type 一声 = {
  类: 清单类;
  /** 要放的文件的资产 id（声音地址表的键） */
  资产: string;
  名: string;
  档?: string;
  /** 段内整帧 */
  起帧: number;
  帧数: number;
  入点秒: number;
  速率: number;
  循环: boolean;
  /** 第 f 帧（从 起帧 数）的增益 */
  增益: (f: number) => number;
  /** 同一个文件和前面某一声叠着放时，给 src 加的区分标记（engine/audio/同源区分.ts） */
  区分?: string;
};

export const 是配乐 = (资产: string) => 资产.startsWith('配乐/');

const 资产一声 = (c: 资产cue): 一声 => {
  if (c.循环 && (c.入点秒 ?? 0) > 0) throw new Error(`${c.名}（第 ${c.帧} 帧）：循环的 cue 不能带入点秒（段框架还不支持从文件中间起循环，拆成两条 cue）`);
  return {
    类: 是配乐(c.资产) ? '配乐清单' : '音效清单',
    资产: c.资产,
    名: c.名,
    ...(c.档 !== undefined ? { 档: c.档 } : {}),
    起帧: c.帧,
    帧数: c.帧数,
    入点秒: c.入点秒 ?? 0,
    速率: c.速率 ?? 1,
    循环: Boolean(c.循环),
    增益: (f) => cue增益(c, f),
  };
};

/** 一段的全部声音。台词增益：台词总线的音量（engine/audio/混音.ts 的 lineVolume，去台词时是 0） */
export const 段放法 = (段: Pick<段定义, '声音' | '帧数' | 'fps'>, 表: 声音表, o: { 台词增益: number }): 一声[] => {
  const cues = 段.声音 ?? [];
  const 开口帧 = new Map<string, number>();
  const out: 一声[] = [];
  cues.forEach((c, i) => {
    if (c.台词 === undefined) {
      out.push(资产一声(c));
      return;
    }
    const t = 表.台词[c.台词];
    if (!t) throw new Error(`声音表里没有台词「${c.台词}」：跑 anim cues`);
    const f = c.接上段 ? (开口帧.get(c.台词) ?? t.上段开口帧) : c.帧;
    if (f === undefined) throw new Error(`第 ${c.帧} 帧的台词「${c.台词}」标了 接上段，本段前面和清单里上一段都没有它开口`);
    开口帧.set(c.台词, f);
    const 头 = f - t.开口 * 段.fps;
    const 起帧 = c.接上段 ? c.帧 : Math.max(0, Math.ceil(头 - 1e-6));
    const 跳 = 起帧 - 头;
    // 截到段尾、同一句的下一截
    const 下一截 = cues.slice(i + 1).find((x) => x.台词 === c.台词);
    const 上限 = Math.min(段.帧数, 下一截 ? 下一截.帧 : Infinity) - 起帧;
    const 帧数 = Math.min(c.帧数 ?? Math.ceil(t.时长 * 段.fps - 跳) + 1, 上限);
    if (帧数 <= 0) return;
    out.push({ 类: '台词清单', 资产: t.配音, 名: c.台词, 起帧, 帧数, 入点秒: 跳 / 段.fps, 速率: 1, 循环: false, 增益: () => o.台词增益 });
  });
  // 同一个文件叠着放：后面那声加区分标记，不然母版里只剩一声（同源区分.ts）
  for (let i = 0; i < out.length; i++) {
    const a = out[i]!;
    if (out.slice(0, i).some((b) => b.资产 === a.资产 && b.起帧 < a.起帧 + a.帧数 && a.起帧 < b.起帧 + b.帧数)) a.区分 = `段声音${i}`;
  }
  return out;
};
