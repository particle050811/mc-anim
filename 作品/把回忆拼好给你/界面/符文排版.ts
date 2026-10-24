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

/** 符文的排法：声母一行（y 0～6）、韵母一行（y 8～14），零声母的一行放中间（y 4～10）；每行在字格里居中，字母间空 1 点 */
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

export type 排版样式 = {
  /** 上 = 顶部居中；下 = 底部居中 */
  位置: '上' | '下';
  /** 第一行字格上沿离画面顶（上）或最后一行字格下沿离画面底（下）几个成片像素，按点格取整 */
  边距: number;
  /** 一个点几个成片像素，正整数。奇数时预览级（1280×720，不放大）里点一格宽一格窄，成片（2560×1440）是整的 */
  字点: number;
  /** 一句拆成两行时，上下两行字格的间距（点） */
  行距: number;
};

/** 一个字的字格：字格左上角的点坐标（从画面左上角数） */
export type 摆字 = { 字: string; x: number; y: number };

/**
 * 一句在点格上的排法：每个字的字格左上角。宽、高是画面的成片像素。分行 = 第一行几个字（拆两行时），每行各自居中；
 * 上 从第一行往下排，下 从最后一行往上排。行宽 = 各行的宽（点）
 */
export const 排一句 = (源: 字源, 词: string, 样式: 排版样式, 宽: number, 高: number, 分行?: number) => {
  const 字们 = [...词];
  if (分行 !== undefined && !(Number.isInteger(分行) && 分行 > 0 && 分行 < 字们.length)) throw new Error(`「${词}」的分行 ${分行} 要在 1～${字们.length - 1} 之间`);
  const 行们 = 分行 === undefined ? [字们] : [字们.slice(0, 分行), 字们.slice(分行)];
  const 边 = Math.round(样式.边距 / 样式.字点);
  const 首y = 样式.位置 === '上' ? 边 : Math.floor(高 / 样式.字点) - 边 - 字格 - (行们.length - 1) * 样式.行距;
  const 行宽: number[] = [];
  const 格们: 摆字[] = 行们.flatMap((行, k) => {
    const 步进 = 行.map(源.步进);
    // 原版 Font.width 是步进之和；最后一个字后面那 1 界面像素（2 点）的空不算进居中
    const w = 步进.reduce((a, b) => a + b, 0) - 2;
    行宽.push(w);
    let x = Math.round((宽 / 样式.字点 - w) / 2);
    return 行.map((字, i) => {
      const r = { 字, x, y: 首y + k * 样式.行距 };
      x += 步进[i]!;
      return r;
    });
  });
  return { 格们, 行宽 };
};

export type 时间样式 = {
  /** 每个字抖动进场、退场各几帧；进场字和字错开 错开帧（从左往右亮起），退场整句一起（错开的话长句末尾几个字会和下一句叠在一起） */
  入帧: number;
  出帧: number;
  错开帧: number;
  /** 一个字解码最多几帧；下一个字跟得紧时缩到两字起唱间隔的 0.8，但不少于 最短解码帧（快句里不让三四个字同时碎着） */
  解码帧: number;
  最短解码帧: number;
  /** 汉字比起唱早几帧拼完（唱到这个字时它已经是中文） */
  落定提前: number;
};

/** 一句：词、每个字的拼音、进场帧、每个字唱到的帧（段内帧，可以带小数：解码按小数帧排，画的时候才落到点上）、拆两行时第一行几个字 */
export type 符文歌词行 = { 词: string; 拼音: readonly string[]; 入: number; 解: readonly number[]; 分行?: number };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** 从 起 那一帧开始的 n 帧渐变（同 歌词.tsx：起那一帧已经走了 1/n） */
const 渐 = (f: number, 起: number, n: number) => clamp01((f - 起 + 1) / Math.max(1, n));

/** 每个字解码的起止帧：完 = 起唱 − 落定提前，起 = 完 − 这个字的解码帧数 */
export const 解码时段 = (行: Pick<符文歌词行, '解'>, 样式: 时间样式): { 起: number; 完: number }[] =>
  行.解.map((t, j) => {
    const 下 = 行.解[j + 1];
    const 长 = 下 === undefined ? 样式.解码帧 : Math.min(样式.解码帧, Math.max(样式.最短解码帧, 0.8 * (下 - t)));
    const 完 = t - 样式.落定提前;
    return { 起: 完 - 长, 完 };
  });

/** 一个字在某一帧的样子：显 = 抖动显现度（0～1），解 = 解码进度（0 = 符文，1 = 汉字），解后 = 解完以后过了几帧（没解完是负的） */
export type 一字状态 = { 显: number; 解: number; 解后: number };

/**
 * 第 f 帧第 i 句每个字的状态。行们按 入 排。退场从下一句入帧前 出帧 帧起（两句在同一个位置，先让开），
 * 但不早于这句最后一个字解完（最晚到下一句入帧）；没有下一句时从 收 起退，没有 收 就一直留着。
 */
export const 字状态 = (行们: readonly 符文歌词行[], i: number, f: number, 样式: 时间样式, 收?: number): 一字状态[] => {
  const 行 = 行们[i]!;
  const 下 = 行们[i + 1];
  const 段们 = 解码时段(行, 样式);
  const 末解完 = Math.max(...段们.map((d) => d.完));
  const 退起 = 下 ? Math.max(下.入 - 样式.出帧, Math.min(末解完, 下.入), 行.入 + 样式.入帧) : (收 ?? Infinity);
  return 段们.map(({ 起, 完 }, j) => {
    const 进 = 渐(f, 行.入 + j * 样式.错开帧, 样式.入帧);
    const 出 = 退起 === Infinity ? 0 : 渐(f, 退起, 样式.出帧);
    return { 显: 进 * (1 - 出), 解: clamp01((f - 起) / (完 - 起)), 解后: f - 完 };
  });
};

export type 符文歌词样式 = 排版样式 &
  时间样式 & {
    字色: string;
    /** 符文的底色，上面再叠附魔光泽 */
    符文色: string;
    /** null = 不描边 */
    描边色: string | null;
    /** 汉字拼完后字角亮点闪几帧 */
    亮点帧: number;
  };

/**
 * 默认样式（Agent 定，依据五家评审 10-24 的多数意见，见 预览 工作-歌词艺术字-定稿 的 00-说明）。
 * 字点 7：手机 390 宽上一个字约 17 像素高；15 个字的句拆两行（符文歌词数据.ts 的 分行）。边距 77 = 11 点。
 * 符文色：原版附魔紫（10-24 做法 B 的符文底色），叠光泽后平均约 #995fef；解码前后的颜色不留驻，拼完就是字色。
 * 描边色是 色板.ts 夏日白天 的，场里换成本场调子的 描边
 */
export const 符文歌词默认: Readonly<符文歌词样式> = {
  位置: '上',
  边距: 77,
  字点: 7,
  行距: 20,
  字色: '#ffffff',
  符文色: '#7458c8',
  描边色: '#24170f',
  入帧: 3,
  出帧: 3,
  错开帧: 0.5,
  解码帧: 5,
  最短解码帧: 3,
  落定提前: 1,
  亮点帧: 2,
};
