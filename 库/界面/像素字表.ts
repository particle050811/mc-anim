// 吃一张字形表画游戏像素字：字形表是 sourcing/extract/导出像素字.py 的输出（格式同 字体/像素字），哪部作品用哪张由作品自己 import 了传进来。
// 规则同 像素字.ts（原版 1.20.1 Font）：位图字 8 像素高、步进 = 字宽 + 1；unihex 16 行画成一半大（一个点 = 半个界面像素），步进 = 宽 // 2 + 1；
// 组合附加符号（́ ̀）不叠到前一个字上，是独立的字、有自己的步进（Font 逐个码位排）；阴影往右下偏 shadow（位图 1、unihex 0.5），颜色乘 0.25。
// 坐标是界面像素，乘 尺 得画布像素；点的边按 floor 对到画布像素（GPU 按像素中心采样，边在半像素上时就是 floor），原点要是整数画布像素。
// 和 像素字.ts 分开写：那份绑死了 字体/像素字（应力转动在用），这里换表不换规则。

export type 字形 = { w: number; h: number; scale: number; adv: number; shadow: number; top: number; rows: number[] };
export type 字形表 = Record<string, 字形>;
/** 一段字和它的颜色（CSS #RRGGBB；不写用整行的默认色） */
export type 字段 = { text: string; color?: string };
export type 画字选项 = {
  /** 原版文字阴影（drawString 默认带；女仆气泡不带） */
  阴影?: boolean;
  /** 粗体（§l）：同一个字往右再画一遍，偏移 = shadow，步进也加这么多 */
  粗?: boolean;
  /** 颜色里的不透明度，0～255 的整数（同原版 ARGB 的 A；聊天栏淡出用），不写 255 */
  不透明度?: number;
};

export const 行高 = 9;

/** 成片像素 / 页面像素：页面按 1280×720 写，视频级渲染 scale 2 出 2560×1440（pipeline/渲/设置.ts）。像素字、像素界面的缩放都按成片像素取整，
 *  画布按成片分辨率建，预览级（scale 1）由浏览器缩一半 */
export const 成片倍数 = 2;

// 原版颜色走 float：分量 / 255 × 系数，写进顶点时 (int)(f × 255)，Math.fround 照 Java 的 float 算
const 浮点分量 = (c: number, 系数 = 1) => Math.trunc(Math.fround(Math.fround(Math.fround(c / 255) * 系数) * 255));

const 解析色 = (色: string): [number, number, number] => {
  const m = /^#([0-9a-fA-F]{6})$/.exec(色);
  if (!m) throw new Error(`像素字的颜色要写成 #RRGGBB，给的是 ${色}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export type 像素字体 = {
  /** 字形表的资产 id，报缺字时用 */
  readonly 名: string;
  readonly 有字: (ch: string) => boolean;
  /** 一行字的宽（界面像素，各字步进之和，同 Font.width） */
  readonly 字宽: (text: string | readonly 字段[], 粗?: boolean) => number;
  /** 按宽度折行（界面像素）：照 StringSplitter，行里有空格就断在最后一个空格（空格不要），没有就断在超宽的那个字前 */
  readonly 折行: (text: string, 宽: number) => string[];
  /** 画一行：x、y 是行顶左上角（界面像素，相对 原点），原点是画布像素（整数），尺 = 一个界面像素几个画布像素；返回步进总宽 */
  readonly 画: (ctx: CanvasRenderingContext2D, text: string | readonly 字段[], 原点: { x: number; y: number }, x: number, y: number, 默认色: string, 尺: number, 选项?: 画字选项) => number;
};

export const 做像素字 = (表: unknown, 名: string): 像素字体 => {
  const glyphs = 表 as 字形表;
  const 取 = (ch: string): 字形 => {
    const g = glyphs[ch];
    if (!g) throw new Error(`字形表 ${名} 里没有「${ch}」（U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}）：把它加进作品的像素字文案，重跑 anim extract（见 sourcing/extract.toml 里出这张表的那一条）`);
    return g;
  };
  const 段们 = (text: string | readonly 字段[]): readonly 字段[] => (typeof text === 'string' ? [{ text }] : text);
  const 字宽 = (text: string | readonly 字段[], 粗 = false) => {
    let w = 0;
    for (const sp of 段们(text)) for (const ch of sp.text) w += 取(ch).adv + (粗 ? 取(ch).shadow : 0);
    return w;
  };
  const 折行 = (text: string, 宽: number) => {
    const out: string[] = [];
    let 余 = [...text];
    while (余.length) {
      let w = 0;
      let i = 0;
      for (; i < 余.length; i++) {
        w += 取(余[i]!).adv;
        if (w > 宽) break;
      }
      if (i >= 余.length) {
        out.push(余.join(''));
        break;
      }
      const 空格 = 余.lastIndexOf(' ', i);
      const 断 = 空格 > 0 ? 空格 : Math.max(i, 1);
      out.push(余.slice(0, 断).join(''));
      余 = 余.slice(空格 > 0 ? 断 + 1 : 断);
    }
    return out;
  };
  const 画点阵 = (ctx: CanvasRenderingContext2D, g: 字形, 原点: { x: number; y: number }, cx: number, y: number, 尺: number) => {
    for (let row = 0; row < g.rows.length; row++) {
      const bits = g.rows[row]!;
      if (!bits) continue;
      const y0 = 原点.y + Math.floor((y + g.top + row * g.scale) * 尺);
      const y1 = 原点.y + Math.floor((y + g.top + (row + 1) * g.scale) * 尺);
      for (let col = 0; col < g.w; col++) {
        if (!((bits >> (g.w - 1 - col)) & 1)) continue;
        const x0 = 原点.x + Math.floor((cx + col * g.scale) * 尺);
        const x1 = 原点.x + Math.floor((cx + (col + 1) * g.scale) * 尺);
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
  };
  const 画 = (ctx: CanvasRenderingContext2D, text: string | readonly 字段[], 原点: { x: number; y: number }, x: number, y: number, 默认色: string, 尺: number, 选项: 画字选项 = {}) => {
    const a = 浮点分量(选项.不透明度 ?? 255) / 255;
    // 先画整行的阴影，再画字（Font.drawInternal 先 renderText 阴影那一遍）
    const 遍 = (阴影: boolean) => {
      let cx = x;
      for (const sp of 段们(text)) {
        const rgb = 解析色(sp.color ?? 默认色).map((c) => 浮点分量(c, 阴影 ? 0.25 : 1));
        ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
        for (const ch of sp.text) {
          const g = 取(ch);
          const 偏 = 阴影 ? g.shadow : 0;
          for (const ox of 选项.粗 ? [0, g.shadow] : [0]) 画点阵(ctx, g, 原点, cx + 偏 + ox, y + 偏, 尺);
          cx += g.adv + (选项.粗 ? g.shadow : 0);
        }
      }
      return cx - x;
    };
    if (选项.阴影) 遍(true);
    return 遍(false);
  };
  return { 名, 有字: (ch) => ch in glyphs, 字宽, 折行, 画 };
};
