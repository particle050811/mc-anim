// 游戏的像素字：原版 1.20.1 默认字体的点阵（工具/游戏取材/导出思索素材.py 从 jar 和 unifont.zip 里取，只取文案里用到的字）。
// 思索界面照游戏的样子画（用户 10-05 要参考机械动力的思索附属），所以字也用游戏点阵，不用 基础.tsx 那种系统字体的高清画法（那是给 6-2 叠在三维画面上的标注用的）。
// 规则照 1.20.1：位图字（ascii、nonlatin_european）8 像素高，步进 = 字宽 + 1，空格步进 4；汉字和全角标点走 unihex：16 像素高点阵画成一半大（一个点 = 半个界面像素），步进 = 宽 / 2 + 1（汉字固定 16 宽，步进 9）；
//   折行照 StringSplitter：按步进累加超过宽度就换行（汉字之间可断），行高 9；粗体（§l）照 Font.StringRenderOutput：同一个字往右再画一遍，偏移 = 字形的 shadow（位图字 1、unihex 0.5），步进也加这么多。思索和字幕不用粗体，6-3-8 称号、6-4-9 登场大字的英文用（见 像素大字.tsx）。
// 画在 2D 画布上：坐标是界面像素，乘缩放 s 得画面像素。每个点按 floor 对齐到画面像素网格，同游戏最近邻采样（界面缩放 3 时半个界面像素是 1.5 个画面像素，点会一格 1 像素、一格 2 像素交替，游戏里也这样）。
import raw from 'asset:字体/像素字';

type Glyph = { w: number; h: number; scale: number; adv: number; shadow: number; top: number; rows: number[] };
const glyphs = raw as unknown as Record<string, Glyph>;
export const lineHeight = 9;

const getGlyph = (ch: string): Glyph => {
  const glyph = glyphs[ch];
  if (!glyph) throw new Error(`像素字.json 里没有「${ch}」，先跑 npm run 取材 -- 6-3-2思索（字从各个思索镜头的 文案.json 取）`);
  return glyph;
};

// 文字阴影往右下偏多少（界面像素）：位图字 1、unihex 0.5；粗体的第二遍也偏这么多
export const shadowOffset = (ch: string) => getGlyph(ch).shadow;

export const textWidth = (text: string) => [...text].reduce((a, ch) => a + getGlyph(ch).adv, 0);

// 按宽度折行（界面像素）
export const wrapText = (text: string, maxWidth: number): string[] => {
  const out: string[] = [];
  let line = '';
  let lineWidth = 0;
  for (const ch of text) {
    const advance = getGlyph(ch).adv;
    if (line && lineWidth + advance > maxWidth) {
      out.push(line);
      line = '';
      lineWidth = 0;
    }
    line += ch;
    lineWidth += advance;
  }
  if (line) out.push(line);
  return out;
};

// 画一行字：x、y 是行顶左上角（界面像素），色是 CSS 颜色（带透明度的用 rgba）；粗：照游戏的粗体多画一遍
export const drawText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, scale: number, bold = false) => {
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of text) {
    const glyph = getGlyph(ch);
    for (const ox of bold ? [0, glyph.shadow] : [0]) drawGlyph(ctx, glyph, cx + ox, y, scale);
    cx += glyph.adv + (bold ? glyph.shadow : 0);
  }
};

const drawGlyph = (ctx: CanvasRenderingContext2D, glyph: Glyph, cx: number, y: number, scale: number) => {
  for (let row = 0; row < glyph.rows.length; row++) {
    const bits = glyph.rows[row];
    if (!bits) continue;
    const y0 = Math.floor((y + glyph.top + row * glyph.scale) * scale);
    const y1 = Math.floor((y + glyph.top + (row + 1) * glyph.scale) * scale);
    for (let col = 0; col < glyph.w; col++) {
      if (!((bits >> (glyph.w - 1 - col)) & 1)) continue;
      const x0 = Math.floor((cx + col * glyph.scale) * scale);
      const x1 = Math.floor((cx + (col + 1) * glyph.scale) * scale);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
};
