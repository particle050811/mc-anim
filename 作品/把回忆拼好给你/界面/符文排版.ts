// 歌词艺术字（界面/符文歌词.tsx）的纯计算：读点阵、排符文、排一句、算每个字这一帧的显现和解码进度。不 import 资产（测试也能用），点阵从 做字源 传进来。
// 一个点 = 字形的一个像素；坐标从左上角数，x 往右、y 往下。
// 银河字母照原版 BitmapProvider 读 ascii_sga.png（字体 minecraft:alt，a～z 在码位 0x61～0x7A，大写同形）：一格 8×8，字宽 = 最右一列有像素的列 + 1。
// 汉字是 Unifont 16×16（原版默认字体画汉字用的那套，画成一半大：一个点 = 半个界面像素），步进 = 字形表的 adv 个界面像素 = 2 × adv 个点。
import type { Png } from '@engine/model/贴图.ts';
import type { 字形表 } from '@库/界面/像素字表.ts';

export type 点阵 = { 宽: number; 高: number; 点: readonly (readonly [number, number])[] };

export type 字源 = {
  /** 一个拉丁字母的银河字母：7 行高（ascii_sga 每格第 8 行是空的） */
  符文: (字母: string) => 点阵;
  /** 一个汉字的 Unifont 点阵 */
  汉字: (字: string) => 点阵;
  /** 这个字的步进（点） */
  步进: (字: string) => number;
};

export const 做字源 = (sga: Png, 表: 字形表, 表名: string): 字源 => {
  const 符文们 = new Map<string, 点阵>();
  const 汉字们 = new Map<string, 点阵>();
  const 取 = (字: string) => {
    const g = 表[字];
    if (!g) throw new Error(`字形表 ${表名} 里没有「${字}」：加进作品的 界面/歌词文案.txt，重跑 anim --作品 把回忆拼好给你 extract 把回忆拼好给你歌词字`);
    return g;
  };
  return {
    符文: (字母) => {
      const c = 字母.toLowerCase();
      const code = c.charCodeAt(0);
      if (c.length !== 1 || code < 0x61 || code > 0x7a) throw new Error(`银河字母只有 a～z，给的是「${字母}」`);
      let r = 符文们.get(c);
      if (!r) {
        const x0 = (code % 16) * 8;
        const y0 = Math.floor(code / 16) * 8;
        const 点: [number, number][] = [];
        let 宽 = 0;
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++)
            if (sga.px[((y0 + y) * sga.w + x0 + x) * 4 + 3]) {
              点.push([x, y]);
              宽 = Math.max(宽, x + 1);
            }
        r = { 宽, 高: 7, 点 };
        符文们.set(c, r);
      }
      return r;
    },
    汉字: (字) => {
      let r = 汉字们.get(字);
      if (!r) {
        const g = 取(字);
        const 点: [number, number][] = [];
        g.rows.forEach((bits, y) => {
          for (let x = 0; x < g.w; x++) if ((bits >> (g.w - 1 - x)) & 1) 点.push([x, y]);
        });
        r = { 宽: g.w, 高: g.rows.length, 点 };
        汉字们.set(字, r);
      }
      return r;
    },
    步进: (字) => 取(字).adv * 2,
  };
};

const 声母们 = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];

/** 拼音拆成 [声母, 韵母]（y、w 当声母）；零声母的整个一段 */
export const 拆拼音 = (音: string): string[] => {
  const 声 = 声母们.find((s) => 音.startsWith(s) && 音.length > s.length);
  return 声 ? [声, 音.slice(声.length)] : [音];
};

/** 字格宽高（Unifont 汉字）。符文一行宽过字格时字母间不留空；还宽就伸进字间的空（字和字之间 2 点），再宽是错（测试拦） */
export const 字格 = 16;

/** 一个摆好的符文：x、y 是它左上角在字格里的点坐标 */
export type 摆符文 = { 字母: string; x: number; y: number; 点阵: 点阵 };

/** A、C 的排法：声母一行（y 0～6）、韵母一行（y 8～14），零声母的一行放中间（y 4～10）；每行在字格里居中，字母间空 1 点 */
export const 排拼音 = (源: 字源, 音: string): 摆符文[] => {
  const 段们 = 拆拼音(音);
  const ys = 段们.length === 2 ? [0, 8] : [4];
  return 段们.flatMap((段, k) => {
    const 阵们 = [...段].map((c) => 源.符文(c));
    const 净 = 阵们.reduce((a, p) => a + p.宽, 0);
    const 隔 = 净 + 阵们.length - 1 <= 字格 ? 1 : 0;
    let x = Math.floor((字格 - (净 + 隔 * (阵们.length - 1))) / 2);
    return 阵们.map((p, i) => {
      const r = { 字母: 段[i]!, x, y: ys[k]!, 点阵: p };
      x += p.宽 + 隔;
      return r;
    });
  });
};

/** B 的排法：拼音首字母一个符文，1 像素 = 2 点（原版 alt 字体和汉字同一行时的比例：符文 7 界面像素高，汉字 8），在字格里居中 */
export const 首字母符文 = (源: 字源, 音: string): 摆符文 => {
  const p = 源.符文(音[0]!);
  return { 字母: 音[0]!, x: Math.floor((字格 - 2 * p.宽) / 2), y: 1, 点阵: p };
};

export type 排版样式 = {
  /** 上 = 顶部居中；下 = 底部居中 */
  位置: '上' | '下';
  /** 字格上沿离画面顶（上）或字格下沿离画面底（下）几个成片像素，按点格取整 */
  边距: number;
  /** 一个点几个成片像素：正偶数（预览级出 1280×720 时也是整像素） */
  字点: number;
};

/** 一句在点格上的排法：每个字的字格左上角（点，从画面左上角数）。宽、高是画面的成片像素 */
export const 排一句 = (源: 字源, 词: string, 样式: 排版样式, 宽: number, 高: number) => {
  const 字们 = [...词];
  const 步进 = 字们.map(源.步进);
  // 原版 Font.width 是步进之和；最后一个字后面那 1 界面像素（2 点）的空不算进居中
  const 总宽 = 步进.reduce((a, b) => a + b, 0) - 2;
  const x0 = Math.round((宽 / 样式.字点 - 总宽) / 2);
  const 边 = Math.round(样式.边距 / 样式.字点);
  const y0 = 样式.位置 === '上' ? 边 : Math.floor(高 / 样式.字点) - 边 - 字格;
  let x = x0;
  const 格们 = 字们.map((字, i) => {
    const r = { 字, x, y: y0 };
    x += 步进[i]!;
    return r;
  });
  return { 格们, 总宽, x0, y0 };
};

export type 时间样式 = {
  /** 每个字抖动进场、退场各几帧；字和字错开 错开帧 */
  入帧: number;
  出帧: number;
  错开帧: number;
  /** 解码动画几帧、比这个字的起唱早几帧开始 */
  解码帧: number;
  提前: number;
};

/** 一句：词、每个字的拼音、进场帧、每个字唱到的帧（段内帧，可以带小数：解码按小数帧排，画的时候才落到点上） */
export type 符文歌词行 = { 词: string; 拼音: readonly string[]; 入: number; 解: readonly number[] };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** 从 起 那一帧开始的 n 帧渐变（同 歌词.tsx：起那一帧已经走了 1/n） */
const 渐 = (f: number, 起: number, n: number) => clamp01((f - 起 + 1) / Math.max(1, n));

/** 一个字在某一帧的样子：显 = 抖动显现度（0～1），解 = 解码进度（0 = 符文，1 = 汉字），解后 = 解完以后过了几帧（没解完是负的） */
export type 一字状态 = { 显: number; 解: number; 解后: number };

/**
 * 第 f 帧第 i 句每个字的状态。行们按 入 排。退场从下一句入帧前 出帧 帧起（两句在同一个位置，先让开），
 * 但不早于这句最后一个字解完（最晚到下一句入帧）；没有下一句时从 收 起退，没有 收 就一直留着。
 */
export const 字状态 = (行们: readonly 符文歌词行[], i: number, f: number, 样式: 时间样式, 收?: number): 一字状态[] => {
  const 行 = 行们[i]!;
  const 下 = 行们[i + 1];
  const 末解完 = Math.max(...行.解) - 样式.提前 + 样式.解码帧;
  const 退起 = 下 ? Math.max(下.入 - 样式.出帧, Math.min(末解完, 下.入), 行.入 + 样式.入帧) : (收 ?? Infinity);
  return [...行.词].map((_, j) => {
    const 进 = 渐(f, 行.入 + j * 样式.错开帧, 样式.入帧);
    const 出 = 退起 === Infinity ? 0 : 渐(f, 退起 + j * 样式.错开帧, 样式.出帧);
    const 解起 = 行.解[j]! - 样式.提前;
    return { 显: 进 * (1 - 出), 解: clamp01((f - 解起) / 样式.解码帧), 解后: f - 解起 - 样式.解码帧 };
  });
};
