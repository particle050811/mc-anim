// 吃一张字形表画游戏像素字：字形表是 sourcing/extract/导出像素字.py 的输出（格式同 字体/像素字），哪部作品用哪张由作品自己 import 了传进来。
// 规则同 像素字.ts（原版 1.20.1 Font）：位图字 8 像素高、步进 = 字宽 + 1；unihex 16 行画成一半大（一个点 = 半个界面像素），步进 = 宽 // 2 + 1；
// 组合附加符号（́ ̀）不叠到前一个字上，是独立的字、有自己的步进（Font 逐个码位排）；阴影往右下偏 shadow（位图 1、unihex 0.5），颜色乘 0.25。
// 坐标是界面像素，乘 尺 得画布像素；点的边按 floor 对到画布像素（GPU 按像素中心采样，边在半像素上时就是 floor），原点要是整数画布像素。
// 和 像素字.ts 分开写：那份绑死了 字体/像素字（应力转动在用），这里换表不换规则。

export type Glyph = { w: number; h: number; scale: number; adv: number; shadow: number; top: number; rows: number[] };
export type GlyphTable = Record<string, Glyph>;
/** 一段字和它的颜色（CSS #RRGGBB；不写用整行的默认色） */
export type TextRun = { text: string; color?: string };
export type DrawTextOptions = {
  /** 原版文字阴影（drawString 默认带；女仆气泡不带） */
  shadow?: boolean;
  /** 粗体（§l）：同一个字往右再画一遍，偏移 = shadow，步进也加这么多 */
  粗?: boolean;
  /** 颜色里的不透明度，0～255 的整数（同原版 ARGB 的 A；聊天栏淡出用），不写 255 */
  opacity?: number;
};

export const lineHeight = 9;

/** 成片像素 / 页面像素：页面按 1280×720 写，视频级渲染 scale 2 出 2560×1440（pipeline/渲/设置.ts）。像素字、像素界面的缩放都按成片像素取整，
 *  画布按成片分辨率建，预览级（scale 1）由浏览器缩一半 */
export const filmScale = 2;

// 原版颜色走 float：分量 / 255 × 系数，写进顶点时 (int)(f × 255)，Math.fround 照 Java 的 float 算
const floatComponent = (c: number, coef = 1) => Math.trunc(Math.fround(Math.fround(Math.fround(c / 255) * coef) * 255));

const parseColor = (color: string): [number, number, number] => {
  const m = /^#([0-9a-fA-F]{6})$/.exec(color);
  if (!m) throw new Error(`像素字的颜色要写成 #RRGGBB，给的是 ${color}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export type PixelFont = {
  /** 字形表的资产 id，报缺字时用 */
  readonly 名: string;
  readonly hasGlyph: (ch: string) => boolean;
  /** 一行字的宽（界面像素，各字步进之和，同 Font.width） */
  readonly textWidth: (text: string | readonly TextRun[], bold?: boolean) => number;
  /** 按宽度折行（界面像素）：照 StringSplitter，行里有空格就断在最后一个空格（空格不要），没有就断在超宽的那个字前 */
  readonly wrapText: (text: string, width: number) => string[];
  /** 画一行：x、y 是行顶左上角（界面像素，相对 原点），原点是画布像素（整数），尺 = 一个界面像素几个画布像素；返回步进总宽 */
  readonly draw: (ctx: CanvasRenderingContext2D, text: string | readonly TextRun[], origin: { x: number; y: number }, x: number, y: number, defaultColor: string, pixelScale: number, options?: DrawTextOptions) => number;
};

export const makePixelFont = (fontTable: unknown, fontName: string): PixelFont => {
  const glyphs = fontTable as GlyphTable;
  const glyphOf = (ch: string): Glyph => {
    const g = glyphs[ch];
    if (!g) throw new Error(`字形表 ${fontName} 里没有「${ch}」（U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}）：把它加进作品的像素字文案，重跑 anim extract（见 sourcing/extract.toml 里出这张表的那一条）`);
    return g;
  };
  const segments = (text: string | readonly TextRun[]): readonly TextRun[] => (typeof text === 'string' ? [{ text }] : text);
  const textWidth = (text: string | readonly TextRun[], bold = false) => {
    let w = 0;
    for (const sp of segments(text)) for (const ch of sp.text) w += glyphOf(ch).adv + (bold ? glyphOf(ch).shadow : 0);
    return w;
  };
  const wrapText = (text: string, width: number) => {
    const out: string[] = [];
    let remaining = [...text];
    while (remaining.length) {
      let w = 0;
      let i = 0;
      for (; i < remaining.length; i++) {
        w += glyphOf(remaining[i]!).adv;
        if (w > width) break;
      }
      if (i >= remaining.length) {
        out.push(remaining.join(''));
        break;
      }
      const lastSpace = remaining.lastIndexOf(' ', i);
      const breakAt = lastSpace > 0 ? lastSpace : Math.max(i, 1);
      out.push(remaining.slice(0, breakAt).join(''));
      remaining = remaining.slice(lastSpace > 0 ? breakAt + 1 : breakAt);
    }
    return out;
  };
  const drawDotMatrix = (ctx: CanvasRenderingContext2D, g: Glyph, origin: { x: number; y: number }, cx: number, y: number, pixelScale: number) => {
    for (let row = 0; row < g.rows.length; row++) {
      const bits = g.rows[row]!;
      if (!bits) continue;
      const y0 = origin.y + Math.floor((y + g.top + row * g.scale) * pixelScale);
      const y1 = origin.y + Math.floor((y + g.top + (row + 1) * g.scale) * pixelScale);
      for (let col = 0; col < g.w; col++) {
        if (!((bits >> (g.w - 1 - col)) & 1)) continue;
        const x0 = origin.x + Math.floor((cx + col * g.scale) * pixelScale);
        const x1 = origin.x + Math.floor((cx + (col + 1) * g.scale) * pixelScale);
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
  };
  const draw = (ctx: CanvasRenderingContext2D, text: string | readonly TextRun[], origin: { x: number; y: number }, x: number, y: number, defaultColor: string, pixelScale: number, options: DrawTextOptions = {}) => {
    const a = floatComponent(options.opacity ?? 255) / 255;
    // 先画整行的阴影，再画字（Font.drawInternal 先 renderText 阴影那一遍）
    const drawPass = (shadow: boolean) => {
      let cx = x;
      for (const sp of segments(text)) {
        const rgb = parseColor(sp.color ?? defaultColor).map((c) => floatComponent(c, shadow ? 0.25 : 1));
        ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
        for (const ch of sp.text) {
          const g = glyphOf(ch);
          const shadowOffset = shadow ? g.shadow : 0;
          for (const ox of options.粗 ? [0, g.shadow] : [0]) drawDotMatrix(ctx, g, origin, cx + shadowOffset + ox, y + shadowOffset, pixelScale);
          cx += g.adv + (options.粗 ? g.shadow : 0);
        }
      }
      return cx - x;
    };
    if (options.shadow) drawPass(true);
    return drawPass(false);
  };
  return { 名: fontName, hasGlyph: (ch) => ch in glyphs, textWidth, wrapText, draw };
};
