// 歌词艺术字（界面/符文歌词.tsx）的纯计算：读点阵、排一句、算每个字的拼字时段和这一帧的显现。不 import 资产（测试也能用），点阵从 做字源 传进来。
// 一个点 = 字形的一个像素；坐标从左上角数，x 往右、y 往下。
// 银河字母照原版 BitmapProvider 读 ascii_sga.png（字体 minecraft:alt，a～z 在码位 0x61～0x7A，大写同形）：一格 8×8，字宽 = 最右一列有像素的列 + 1。
// 汉字是 Unifont 16×16（原版默认字体画汉字用的那套，画成一半大：一个点 = 半个界面像素），步进 = 字形表的 adv 个界面像素 = 2 × adv 个点。
// 符文怎么飞、字怎么分块见 符文拼字.ts；逐句的位置、断行、对齐见 歌词排版表.ts。
import type { Png } from '@engine/model/贴图.ts';
import type { 字形表 } from '@库/界面/像素字表.ts';

/** 定死的散列（不用 Math.random：同一帧每次渲都一样），返回 [0, 1) */
export const 散 = (a: number, b: number, c = 0) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

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

/** 字格宽高（Unifont 汉字 16×16 点） */
export const 字格 = 16;

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
/** 界 = 这个字的符文、笔画只画在这一截点里 [左, 右)（分屏句：不越过分屏线），不写 = 整个画面 */
export type 摆字 = { 字: string; x: number; y: number; 界?: readonly [number, number] };

/** 一句里每行怎么对齐：中 = 每行各自居中；左、右 = 每行的左边、右边对齐；错落 = 第一行往左、最后一行往右各让 错距 的一半（两行时上左下右） */
export type 对齐 = '中' | '左' | '右' | '错落';

/** 断开的一段摆在哪（分屏句用）：行 = 放在第几行（从 0 数，几段可以同一行）；这一段的 靠 那一边（左沿、右沿或中线）对到画面宽的 横 成处，再往右挪 偏 点；
 *  界 = 这一段只画在画面宽的 [界0, 界1) 成里（分屏那一半：飞来的符文、落下的块不越过分屏线） */
export type 段位 = { 行: number; 横: number; 靠: '左' | '右' | '中'; 偏?: number; 界?: readonly [number, number] };

/** 一句自己的排法（歌词排版表.ts 按句号查）：断行、对齐、整块的水平位置；位置、边距、字点、行距写了就盖掉段传进来的样式 */
export type 句版 = Partial<排版样式> & {
  /** 在第几个字后断开（从句首数，递增）：[7] = 前 7 个字一段、其余一段；不写 = 一段。不写 各段 时一段一行 */
  断行?: readonly number[];
  对齐?: 对齐;
  /** 整块的中线在画面宽的几成（0～1），默认 0.5 居中 */
  横?: number;
  /** 每段各自摆（写了就不看 对齐、横），个数 = 断开的段数 */
  各段?: readonly 段位[];
};

/** 错落时上下两行错开多少点（一个字的步进 18 点），Agent 暂定：一个字宽，手机上看得出是有意错开的 */
export const 错距 = 18;

/**
 * 一句在点格上的排法：每个字的字格左上角。宽、高是画面的成片像素。版 = 这句自己的排法（断行、对齐、横、各段）；
 * 上 从第一行往下排，下 从最后一行往上排。行宽 = 各段的宽（点）
 */
export const 排一句 = (源: 字源, 词: string, 样式: 排版样式, 宽: number, 高: number, 版: 句版 = {}) => {
  const 字们 = [...词];
  const 断们 = 版.断行 ?? [];
  断们.forEach((k, i) => {
    if (!(Number.isInteger(k) && k > (断们[i - 1] ?? 0) && k < 字们.length)) throw new Error(`「${词}」的断行 ${断们.join('、')} 要递增、在 1～${字们.length - 1} 之间`);
  });
  const 段们 = [0, ...断们].map((a, i) => 字们.slice(a, 断们[i] ?? 字们.length));
  const 各 = 版.各段;
  if (各 && 各.length !== 段们.length) throw new Error(`「${词}」断成 ${段们.length} 段，各段 给了 ${各.length} 个`);
  const 行号 = (k: number) => (各 ? 各[k]!.行 : k);
  const 行数 = Math.max(...段们.map((_, k) => 行号(k))) + 1;
  const 对 = 版.对齐 ?? '中';
  const 横 = 版.横 ?? 0.5;
  const 边 = Math.round(样式.边距 / 样式.字点);
  const 首y = 样式.位置 === '上' ? 边 : Math.floor(高 / 样式.字点) - 边 - 字格 - (行数 - 1) * 样式.行距;
  // 原版 Font.width 是步进之和；最后一个字后面那 1 界面像素（2 点）的空不算进对齐
  const 步进们 = 段们.map((段) => 段.map(源.步进));
  const 行宽 = 步进们.map((步) => 步.reduce((a, b) => a + b, 0) - 2);
  const 块宽 = Math.max(...行宽);
  const 画宽 = 宽 / 样式.字点;
  const 左起 = (k: number) => {
    const w = 行宽[k]!;
    if (各) {
      const p = 各[k]!;
      const 锚 = 画宽 * p.横 + (p.偏 ?? 0);
      return p.靠 === '左' ? 锚 : p.靠 === '右' ? 锚 - w : 锚 - w / 2;
    }
    const 中 = 画宽 * 横;
    if (对 === '左') return 中 - 块宽 / 2;
    if (对 === '右') return 中 + 块宽 / 2 - w;
    const 错 = 对 === '错落' && 段们.length > 1 ? (k / (段们.length - 1) - 0.5) * 错距 : 0;
    return 中 - w / 2 + 错;
  };
  const 格们: 摆字[] = 段们.flatMap((段, k) => {
    let x = Math.round(左起(k));
    const 界 = 各?.[k]!.界;
    return 段.map((字, i) => {
      const r: 摆字 = { 字, x, y: 首y + 行号(k) * 样式.行距, ...(界 ? { 界: [界[0] * 画宽, 界[1] * 画宽] as const } : {}) };
      x += 步进们[k]![i]!;
      return r;
    });
  });
  return { 格们, 行宽 };
};

/** 段传进来的样式盖上这句自己的排法（版里写了的位置、边距、字点、行距） */
export const 合样式 = <T extends 排版样式>(样式: T, 版: 句版 | undefined): T => {
  if (!版) return 样式;
  const { 位置, 边距, 字点, 行距 } = 版;
  return { ...样式, ...(位置 ? { 位置 } : {}), ...(边距 !== undefined ? { 边距 } : {}), ...(字点 !== undefined ? { 字点 } : {}), ...(行距 !== undefined ? { 行距 } : {}) };
};

export type 时间样式 = {
  /** 每个字抖动进场、退场各几帧；进场字和字错开 错开帧（从左往右），退场整句一起（错开的话长句末尾几个字会和下一句叠在一起）。
   *  进场管的是落定的笔画块；符文自己从起飞那一帧亮起，不早于这个字进场 */
  入帧: number;
  出帧: number;
  错开帧: number;
  /** 一个字的几块笔画从第一块落定到最后一块落定几帧（和前后的字可以叠着拼） */
  拼字帧: number;
  /** 第一块最早在这个字进场后几帧落定（句首的字进场晚，拼字缩短，符文至少飞这么久） */
  首飞帧: number;
  /** 汉字比起唱早几帧拼完（唱到这个字时它已经拼齐） */
  落定提前: number;
  /** 一枚符文从起飞到落定几帧（起飞不早于这个字进场：晚飞的飞得近） */
  飞帧: number;
};

/** 一句：词、每个字的拼音、进场帧、每个字唱到的帧（段内帧，可以带小数：拼字按小数帧排，画的时候才落到点上）。
 *  序 = 第几句；版 = 这句自己的排法（歌词排版表.ts）；字效 = 关键词效果（歌词字效.ts）；
 *  收 = 这句自己从哪一帧起退场（写了就不按下一句推，用来给画面里别的字让路） */
export type 符文歌词行 = {
  词: string;
  拼音: readonly string[];
  入: number;
  解: readonly number[];
  收?: number;
  序?: number;
  版?: 句版;
  字效?: 字效;
};

/** 关键词效果（三稿「字」一栏，用户 10-24 定的五处）：从、到 = 这个词在句里的第几个字（含两头，从 0 数）；裂 = 刹那裂开那一帧（段内帧）；半拍 = 时差残影晚几帧 */
export type 字效 =
  | { 效: '光明' | '烟花' | '放下'; 从: number; 到: number }
  | { 效: '刹那'; 从: number; 到: number; 裂: number }
  | { 效: '时差'; 从: number; 到: number; 半拍: number };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** 从 起 那一帧开始的 n 帧渐变（同 歌词.tsx：起那一帧已经走了 1/n） */
const 渐 = (f: number, 起: number, n: number) => clamp01((f - 起 + 1) / Math.max(1, n));

/** 每个字拼字的起止帧：完 = 起唱 − 落定提前（最后一块落定），起 = 完 − 拼字帧（第一块落定），但不早于这个字进场后 首飞帧 */
export const 解码时段 = (行: Pick<符文歌词行, '解' | '入'>, 样式: Pick<时间样式, '拼字帧' | '首飞帧' | '落定提前' | '错开帧'>): { 起: number; 完: number }[] =>
  行.解.map((t, j) => {
    const 完 = t - 样式.落定提前;
    const 入 = 行.入 + j * 样式.错开帧;
    return { 起: Math.min(完, Math.max(完 - 样式.拼字帧, 入 + 样式.首飞帧)), 完 };
  });

/** 一个字在某一帧的样子：显 = 抖动显现度（0～1），解后 = 拼齐以后过了几帧（没拼齐是负的），出 = 退场进度（0～1，符文只看它），入 = 这个字进场那一帧 */
export type 一字状态 = { 显: number; 解后: number; 出: number; 入: number };

/**
 * 第 f 帧第 i 句每个字的状态。行们按 入 排。退场从下一句入帧前 出帧 帧起（两句在同一个位置，先让开），
 * 但不早于这句最后一个字拼完（最晚到下一句入帧）；没有下一句时从 收 起退，没有 收 就一直留着；这句自己写了 收 就从那一帧起。
 */
export const 字状态 = (行们: readonly 符文歌词行[], i: number, f: number, 样式: 时间样式, 收?: number): 一字状态[] => {
  const 行 = 行们[i]!;
  const 下 = 行们[i + 1];
  const 段们 = 解码时段(行, 样式);
  const 末解完 = Math.max(...段们.map((d) => d.完));
  const 退起 = 行.收 ?? (下 ? Math.max(下.入 - 样式.出帧, Math.min(末解完, 下.入), 行.入 + 样式.入帧) : (收 ?? Infinity));
  return 段们.map(({ 完 }, j) => {
    const 入 = 行.入 + j * 样式.错开帧;
    const 进 = 渐(f, 入, 样式.入帧);
    const 出 = 退起 === Infinity ? 0 : 渐(f, 退起, 样式.出帧);
    return { 显: 进 * (1 - 出), 解后: f - 完, 出, 入 };
  });
};

export type 符文歌词样式 = 排版样式 &
  时间样式 & {
    字色: string;
    /** 符文的底色，上面再叠附魔光泽 */
    符文色: string;
    /** 一块笔画落定时闪几帧：头一帧笔画是闪色、外面一圈闪圈色，之后只剩闪色 */
    闪色: string;
    闪圈色: string;
    闪帧: number;
    /** null = 不描边 */
    描边色: string | null;
    /** 汉字拼齐后字角亮点闪几帧 */
    亮点帧: number;
  };

/**
 * 默认样式（Agent 定）。字点 7：手机 390 宽上一个字约 17 像素高；边距 77 = 11 点（五家评审 10-24 后定的，位置照旧）。
 * 符文色：原版附魔紫，叠光泽后平均约 #995fef。闪色、闪圈色：落定时笔画亮成近白的淡紫、头一帧外面一圈附魔紫，闪 2 帧再回字色（Agent 定：一帧在手机上看不出）。
 * 拼字帧 7、飞帧 9、首飞帧 4（用户 10-24 要「手机上看得出是拼成的」，规矩表 看得懂的速度；Agent 定）：一个字从第一枚符文起飞到拼齐约 0.7 秒，
 * 拼了一半的字停 0.15～0.3 秒看得见；前后的字叠着拼，同时在飞的符文多数时候两到五枚、最多七枚（测试拦）。
 * 描边色是 色板.ts 夏日白天 的，场里换成本场调子的 描边
 */
export const 符文歌词默认: Readonly<符文歌词样式> = {
  位置: '上',
  边距: 77,
  字点: 7,
  行距: 20,
  字色: '#ffffff',
  符文色: '#7458c8',
  闪色: '#f4ecff',
  闪圈色: '#a07cf0',
  闪帧: 2,
  描边色: '#24170f',
  入帧: 3,
  出帧: 3,
  错开帧: 0.5,
  拼字帧: 7,
  首飞帧: 4,
  落定提前: 1,
  飞帧: 9,
  亮点帧: 2,
};
