// 歌词艺术字（界面/符文歌词.tsx）的纯计算：读点阵、排一句、算每个字的拼字时段和这一帧的显现。不 import 资产（测试也能用），点阵从 做字源 传进来。
// 一个点 = 字形的一个像素；坐标从左上角数，x 往右、y 往下。
// 银河字母照原版 BitmapProvider 读 ascii_sga.png（字体 minecraft:alt，a～z 在码位 0x61～0x7A，大写同形）：一格 8×8，字宽 = 最右一列有像素的列 + 1。
// 汉字是 Unifont 16×16（原版默认字体画汉字用的那套，画成一半大：一个点 = 半个界面像素），步进 = 字形表的 adv 个界面像素 = 2 × adv 个点。
// 符文怎么飞、字怎么分块见 符文拼字.ts；逐句的位置、断行、对齐见 歌词排版表.ts。
import type { Png } from '@engine/model/贴图.ts';
import type { GlyphTable } from '@库/界面/像素字表.ts';
import { fps, oneFrameSec, legacyFrameSec } from '../分镜/时间.ts';
import { clamp01 } from '@engine/core/数学.ts';

/** 定死的散列（不用 Math.random：同一帧每次渲都一样），返回 [0, 1) */
export const scatter = (a: number, b: number, c = 0) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

export type DotMatrix = { 宽: number; 高: number; 点: readonly (readonly [number, number])[] };

export type GlyphSource = {
  /** 一个拉丁字母的银河字母：7 行高（ascii_sga 每格第 8 行是空的） */
  rune: (letter: string) => DotMatrix;
  /** 一个汉字的 Unifont 点阵 */
  hanChar: (char: string) => DotMatrix;
  /** 这个字的步进（点） */
  advance: (char: string) => number;
};

export const makeGlyphSource = (sga: Png, glyphTable: GlyphTable, tableName: string): GlyphSource => {
  const glyphMap = new Map<string, DotMatrix>();
  const hanziBitmaps = new Map<string, DotMatrix>();
  const glyphOf = (char: string) => {
    const g = glyphTable[char];
    if (!g) throw new Error(`字形表 ${tableName} 里没有「${char}」：加进作品的 界面/歌词文案.txt，重跑 anim --work 把回忆拼好给你 extract 把回忆拼好给你歌词字`);
    return g;
  };
  return {
    rune: (letter) => {
      const c = letter.toLowerCase();
      const code = c.charCodeAt(0);
      if (c.length !== 1 || code < 0x61 || code > 0x7a) throw new Error(`银河字母只有 a～z，给的是「${letter}」`);
      let r = glyphMap.get(c);
      if (!r) {
        const x0 = (code % 16) * 8;
        const y0 = Math.floor(code / 16) * 8;
        const pixels: [number, number][] = [];
        let width = 0;
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++)
            if (sga.px[((y0 + y) * sga.w + x0 + x) * 4 + 3]) {
              pixels.push([x, y]);
              width = Math.max(width, x + 1);
            }
        r = { 宽: width, 高: 7, 点: pixels };
        glyphMap.set(c, r);
      }
      return r;
    },
    hanChar: (char) => {
      let r = hanziBitmaps.get(char);
      if (!r) {
        const g = glyphOf(char);
        const pixels: [number, number][] = [];
        g.rows.forEach((bits, y) => {
          for (let x = 0; x < g.w; x++) if ((bits >> (g.w - 1 - x)) & 1) pixels.push([x, y]);
        });
        r = { 宽: g.w, 高: g.rows.length, 点: pixels };
        hanziBitmaps.set(char, r);
      }
      return r;
    },
    advance: (char) => glyphOf(char).adv * 2,
  };
};

/** 字格宽高（Unifont 汉字 16×16 点） */
export const glyphCell = 16;

export type TypesetStyle = {
  /** 上 = 顶部居中；下 = 底部居中 */
  位置: '上' | '下';
  /** 第一行字格上沿离画面顶（上）或最后一行字格下沿离画面底（下）几个成片像素，按点格取整 */
  margin: number;
  /** 一个点几个成片像素，正整数。奇数时预览级（1280×720，不放大）里点一格宽一格窄，成片（2560×1440）是整的 */
  glyphScale: number;
  /** 一句拆成两行时，上下两行字格的间距（点） */
  lineGap: number;
};

/** 一个字的字格：字格左上角的点坐标（从画面左上角数） */
/** 界 = 这个字的符文、笔画只画在这一截点里 [左, 右)（分屏句：不越过分屏线），不写 = 整个画面 */
export type PlacedChar = { 字: string; x: number; y: number; 界?: readonly [number, number] };

/** 一句里每行怎么对齐：中 = 每行各自居中；左、右 = 每行的左边、右边对齐；错落 = 第一行往左、最后一行往右各让 错距 的一半（两行时上左下右） */
export type TextAlign = '中' | '左' | '右' | '错落';

/** 断开的一段摆在哪（分屏句用）：行 = 放在第几行（从 0 数，几段可以同一行）；这一段的 靠 那一边（左沿、右沿或中线）对到画面宽的 横 成处，再往右挪 偏 点；
 *  界 = 这一段只画在画面宽的 [界0, 界1) 成里（分屏那一半：飞来的符文、落下的块不越过分屏线） */
export type SegPosition = { 行: number; horizontal: number; anchor: '左' | '右' | '中'; offset?: number; 界?: readonly [number, number] };

/** 一句自己的排法（歌词排版表.ts 按句号查）：断行、对齐、整块的水平位置；位置、边距、字点、行距写了就盖掉段传进来的样式 */
export type LineLayout = Partial<TypesetStyle> & {
  /** 在第几个字后断开（从句首数，递增）：[7] = 前 7 个字一段、其余一段；不写 = 一段。不写 各段 时一段一行 */
  lineBreaks?: readonly number[];
  textAlign?: TextAlign;
  /** 整块的中线在画面宽的几成（0～1），默认 0.5 居中 */
  horizontal?: number;
  /** 每段各自摆（写了就不看 对齐、横），个数 = 断开的段数 */
  segments?: readonly SegPosition[];
};

/** 错落时上下两行错开多少点（一个字的步进 18 点），Agent 暂定：一个字宽，手机上看得出是有意错开的 */
export const staggerDist = 18;

/**
 * 一句在点格上的排法：每个字的字格左上角。宽、高是画面的成片像素。版 = 这句自己的排法（断行、对齐、横、各段）；
 * 上 从第一行往下排，下 从最后一行往上排。行宽 = 各段的宽（点）
 */
export const layoutLine = (glyphSource: GlyphSource, text: string, typesetStyle: TypesetStyle, width: number, height: number, lineLayout: LineLayout = {}) => {
  const chars = [...text];
  const lineBreaks = lineLayout.lineBreaks ?? [];
  lineBreaks.forEach((k, i) => {
    if (!(Number.isInteger(k) && k > (lineBreaks[i - 1] ?? 0) && k < chars.length)) throw new Error(`「${text}」的断行 ${lineBreaks.join('、')} 要递增、在 1～${chars.length - 1} 之间`);
  });
  const segments = [0, ...lineBreaks].map((a, i) => chars.slice(a, lineBreaks[i] ?? chars.length));
  const perSeg = lineLayout.segments;
  if (perSeg && perSeg.length !== segments.length) throw new Error(`「${text}」断成 ${segments.length} 段，各段 给了 ${perSeg.length} 个`);
  const lineNo = (k: number) => (perSeg ? perSeg[k]!.行 : k);
  const rowCount = Math.max(...segments.map((_, k) => lineNo(k))) + 1;
  const align = lineLayout.textAlign ?? '中';
  const horizontal = lineLayout.horizontal ?? 0.5;
  const margin = Math.round(typesetStyle.margin / typesetStyle.glyphScale);
  const firstY = typesetStyle.位置 === '上' ? margin : Math.floor(height / typesetStyle.glyphScale) - margin - glyphCell - (rowCount - 1) * typesetStyle.lineGap;
  // 原版 Font.width 是步进之和；最后一个字后面那 1 界面像素（2 点）的空不算进对齐
  const advances = segments.map((textSeg) => textSeg.map(glyphSource.advance));
  const lineWidth = advances.map((advances) => advances.reduce((a, b) => a + b, 0) - 2);
  const blockWidth = Math.max(...lineWidth);
  const drawWidth = width / typesetStyle.glyphScale;
  const leftStart = (k: number) => {
    const w = lineWidth[k]!;
    if (perSeg) {
      const p = perSeg[k]!;
      const anchorX = drawWidth * p.horizontal + (p.offset ?? 0);
      return p.anchor === '左' ? anchorX : p.anchor === '右' ? anchorX - w : anchorX - w / 2;
    }
    const centerX = drawWidth * horizontal;
    if (align === '左') return centerX - blockWidth / 2;
    if (align === '右') return centerX + blockWidth / 2 - w;
    const stagger = align === '错落' && segments.length > 1 ? (k / (segments.length - 1) - 0.5) * staggerDist : 0;
    return centerX - w / 2 + stagger;
  };
  const glyphs: PlacedChar[] = segments.flatMap((textSeg, k) => {
    let x = Math.round(leftStart(k));
    const clipRange = perSeg?.[k]!.界;
    return textSeg.map((char, i) => {
      const r: PlacedChar = { 字: char, x, y: firstY + lineNo(k) * typesetStyle.lineGap, ...(clipRange ? { 界: [clipRange[0] * drawWidth, clipRange[1] * drawWidth] as const } : {}) };
      x += advances[k]![i]!;
      return r;
    });
  });
  return { glyphs, lineWidth };
};

/** 段传进来的样式盖上这句自己的排法（版里写了的位置、边距、字点、行距） */
export const mergeStyle = <T extends TypesetStyle>(typesetStyle: T, lineLayout: LineLayout | undefined): T => {
  if (!lineLayout) return typesetStyle;
  const { 位置: lyricPos, margin, glyphScale, lineGap } = lineLayout;
  return { ...typesetStyle, ...(lyricPos ? { 位置: lyricPos } : {}), ...(margin !== undefined ? { margin } : {}), ...(glyphScale !== undefined ? { glyphScale } : {}), ...(lineGap !== undefined ? { lineGap } : {}) };
};

export type TimeStyle = {
  /** 每个字抖动进场、退场各几秒；进场字和字错开 错开秒（从左往右），退场整句一起（错开的话长句末尾几个字会和下一句叠在一起）。
   *  进场管的是落定的笔画块；符文自己从起飞那一帧亮起，不早于这个字进场 */
  enterSec: number;
  exitSec: number;
  staggerSec: number;
  /** 一个字的几块笔画从第一块落定到最后一块落定几秒（和前后的字可以叠着拼） */
  assembleSec: number;
  /** 第一块最早在这个字进场后几秒落定（句首的字进场晚，拼字缩短，符文至少飞这么久） */
  firstFlySec: number;
  /** 汉字比起唱早几秒拼完（唱到这个字时它已经拼齐） */
  settleLeadSec: number;
  /** 一枚符文从起飞到落定几秒（起飞不早于这个字进场：晚飞的飞得近） */
  flySec: number;
};

/** 一句：词、每个字的拼音、进场帧、每个字唱到的帧（段内帧，可以带小数：拼字按小数帧排，画的时候才落到点上）。
 *  序 = 第几句；版 = 这句自己的排法（歌词排版表.ts）；字效 = 关键词效果（歌词字效.ts）；
 *  收 = 这句自己从哪一帧起退场（写了就不按下一句推，用来给画面里别的字让路） */
export type RuneLyricLine = {
  text: string;
  pinyin: readonly string[];
  入: number;
  charTimes: readonly number[];
  收?: number;
  序?: number;
  版?: LineLayout;
  wordEffect?: WordEffect;
};

/** 关键词效果（三稿「字」一栏，用户 10-24 定的五处）：从、到 = 这个词在句里的第几个字（含两头，从 0 数）；裂 = 刹那裂开那一帧（段内帧）；半拍 = 时差残影晚几帧 */
export type WordEffect =
  | { effect: '光明' | '烟花' | '放下'; 从: number; 到: number }
  | { effect: '刹那'; 从: number; 到: number; shatterFrame: number }
  | { effect: '时差'; 从: number; 到: number; halfBeat: number };
/** 从 起 那一帧开始、n秒 走完的渐变（同 歌词.tsx：起那一帧已经走了一帧） */
const fadeRamp = (f: number, startFrame: number, rampSec: number) => clamp01(((f - startFrame) / fps + oneFrameSec) / Math.max(oneFrameSec, rampSec));

/** 每个字拼字的起止帧：完 = 起唱 − 落定提前秒（最后一块落定），起 = 完 − 拼字秒（第一块落定），但不早于这个字进场后 首飞秒 */
export const decodeTimeSpans = (lyricLine: Pick<RuneLyricLine, 'charTimes' | '入'>, timeStyle: Pick<TimeStyle, 'assembleSec' | 'firstFlySec' | 'settleLeadSec' | 'staggerSec'>): { 起: number; end: number }[] =>
  lyricLine.charTimes.map((t, j) => {
    const end = t - timeStyle.settleLeadSec * fps;
    const enterFrame = lyricLine.入 + j * timeStyle.staggerSec * fps;
    return { 起: Math.min(end, Math.max(end - timeStyle.assembleSec * fps, enterFrame + timeStyle.firstFlySec * fps)), end };
  });

/** 一个字在某一帧的样子：显 = 抖动显现度（0～1），解后 = 拼齐以后过了几帧（没拼齐是负的），出 = 退场进度（0～1，符文只看它），入 = 这个字进场那一帧 */
export type CharState = { shown: number; afterSolve: number; 出: number; 入: number };

/**
 * 第 f 帧第 i 句每个字的状态。行们按 入 排。退场从下一句入帧前 出秒 起（两句在同一个位置，先让开），
 * 但不早于这句最后一个字拼完（最晚到下一句入帧）；没有下一句时从 收 起退，没有 收 就一直留着；这句自己写了 收 就从那一帧起。
 */
export const charStates = (lines: readonly RuneLyricLine[], i: number, f: number, timeStyle: TimeStyle, fadeOutFrame?: number): CharState[] => {
  const lyricLine = lines[i]!;
  const nextLine = lines[i + 1];
  const segments = decodeTimeSpans(lyricLine, timeStyle);
  const lastSolveDone = Math.max(...segments.map((d) => d.end));
  const fadeOutStart = lyricLine.收 ?? (nextLine ? Math.max(nextLine.入 - timeStyle.exitSec * fps, Math.min(lastSolveDone, nextLine.入), lyricLine.入 + timeStyle.enterSec * fps) : (fadeOutFrame ?? Infinity));
  return segments.map(({ end }, j) => {
    const enterFrame = lyricLine.入 + j * timeStyle.staggerSec * fps;
    // 整句入帧前一律看不见（符文歌词.tsx 也不画）：按秒连起来的渐变在入帧前 1/24 秒就起头了，24 fps 时那些帧本来是 0
    const fadeIn = f < lyricLine.入 ? 0 : fadeRamp(f, enterFrame, timeStyle.enterSec);
    const fadeOut = fadeOutStart === Infinity ? 0 : fadeRamp(f, fadeOutStart, timeStyle.exitSec);
    return { shown: fadeIn * (1 - fadeOut), afterSolve: f - end, 出: fadeOut, 入: enterFrame };
  });
};

export type RuneLyricStyle = TypesetStyle &
  TimeStyle & {
    textColor: string;
    /** 符文的底色，上面再叠附魔光泽 */
    runeColor: string;
    /** 一块笔画落定时闪几秒：头 1/24 秒笔画是闪色、外面一圈闪圈色，之后只剩闪色 */
    flashColor: string;
    flashRingColor: string;
    flashSec: number;
    /** null = 不描边 */
    outlineColor: string | null;
    /** 汉字拼齐后字角亮点闪几秒 */
    highlightSec: number;
  };

/**
 * 默认样式（Agent 定）。字点 7：手机 390 宽上一个字约 17 像素高；边距 77 = 11 点（五家评审 10-24 后定的，位置照旧）。
 * 符文色：原版附魔紫，叠光泽后平均约 #995fef。闪色、闪圈色：落定时笔画亮成近白的淡紫、头 1/24 秒外面一圈附魔紫，闪 1/12 秒（24 fps 时 2 帧）再回字色（Agent 定：24 fps 一帧在手机上看不出）。
 * 拼字 7/24 秒、飞 9/24 秒、首飞 4/24 秒（24 fps 时 7、9、4 帧；用户 10-24 要「手机上看得出是拼成的」，规矩表 看得懂的速度；Agent 定）：一个字从第一枚符文起飞到拼齐约 0.7 秒，
 * 拼了一半的字停 0.15～0.3 秒看得见；前后的字叠着拼，同时在飞的符文多数时候两到五枚、最多七枚（测试拦）。
 * 描边色是 色板.ts 夏日白天 的，场里换成本场调子的 描边
 */
export const runeLyricDefault: Readonly<RuneLyricStyle> = {
  位置: '上',
  margin: 77,
  glyphScale: 7,
  lineGap: 20,
  textColor: '#ffffff',
  runeColor: '#7458c8',
  flashColor: '#f4ecff',
  flashRingColor: '#a07cf0',
  flashSec: legacyFrameSec(2),
  outlineColor: '#24170f',
  enterSec: legacyFrameSec(3),
  exitSec: legacyFrameSec(3),
  staggerSec: legacyFrameSec(0.5),
  assembleSec: legacyFrameSec(7),
  firstFlySec: legacyFrameSec(4),
  settleLeadSec: legacyFrameSec(1),
  flySec: legacyFrameSec(9),
  highlightSec: legacyFrameSec(2),
};
