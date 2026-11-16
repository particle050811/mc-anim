// 字幕卡：一屏字幕画成整帧大小的透明底 PNG，段字幕.ts 把它交给段画在切片里。
// 字幕的样式和断屏以这里为准（原样照搬旧项目的字幕组件）：
// 黑底 0.5 不透明的框 + 白色游戏像素字，1 个界面像素 = 画面高 / 90，下方居中、框底离画面底 6 个界面像素；思索界面开着时挪到思索按钮上沿以上。
// 用户 10-10 要的样式，参考资产 设定图/界面/字幕样式参考（量法的细节见 git 里已删的 库/界面/字幕.tsx 文件头）。一屏只放一行，最宽 0.86 × 画面宽，不缩字、不折行。
// 旧项目在 Chrome 的 canvas 上画（字幕卡 Composition），这里用只会 fillRect 的小画布在 Node 里画：字幕只用整像素的 fillRect，结果一样。
import fs from 'node:fs';
import zlib from 'node:zlib';
import { readAssetLock, resolveAsset } from '../资产/资产锁.ts';

export type SubtitlePosition = '下' | '思索上';

type Glyph = { w: number; h: number; scale: number; adv: number; shadow: number; top: number; rows: number[] };
let glyphLibrary: Record<string, Glyph> | undefined;
/** 字幕卡的点阵（共用资产表登记）；有台词的段随仓库发字节时也带上它（分发/随仓库.ts） */
export const pixelFontAsset = '字体/像素字';
/** 像素字点阵（资产 字体/像素字）；测试可以先 设字库 */
export const setGlyphLibrary = (x: Record<string, Glyph>) => (glyphLibrary = x);
const getGlyphLibrary = () => (glyphLibrary ??= JSON.parse(fs.readFileSync(resolveAsset(pixelFontAsset, readAssetLock()).文件, 'utf8')) as Record<string, Glyph>);
const getGlyph = (ch: string): Glyph => {
  const g = getGlyphLibrary()[ch];
  if (!g) throw new Error(`像素字（资产 字体/像素字）里没有「${ch}」：字幕用到的字要先取进点阵`);
  return g;
};
export const textWidth = (text: string) => [...text].reduce((a, ch) => a + getGlyph(ch).adv, 0);

// ---------- 样式 ----------
const uiPictureHeightPx = 90;
const margin = 1;
const charHeight = 8;
const boxHeight = charHeight + 2 * margin;
const bottomMarginUi = 6;
const maxWidthRatio = 0.86;
// 思索的按钮上沿在思索界面像素 高 − 54 处（思索界面高 240）
const thinkButtonTop = (240 - 20 - 31 - 3) / 240;
const baseColor: Rgba = [0, 0, 0, 0.5];
const textColor: Rgba = [255, 255, 255, 1];

export const subtitleScale = (pictureHeight: number) => pictureHeight / uiPictureHeightPx;
export const maxScreenWidth = (aspectRatio = 16 / 9) => Math.floor(maxWidthRatio * uiPictureHeightPx * aspectRatio) - 1;

export const subtitleBox = (text: string, subtitlePos: SubtitlePosition, pictureWidth: number, pictureHeight: number) => {
  const s = subtitleScale(pictureHeight);
  const w = Math.round((margin + textWidth(text)) * s);
  const h = Math.round(boxHeight * s);
  const x = Math.round((pictureWidth - w) / 2);
  const boxBottom = subtitlePos === '思索上' ? Math.floor(thinkButtonTop * pictureHeight - s) : Math.round(pictureHeight - bottomMarginUi * s);
  return { x, y: boxBottom - h, w, h, s };
};

// ---------- 小画布：只有 fillRect（source-over），够画字幕 ----------
type Rgba = [number, number, number, number];
class Canvas {
  readonly pixels: Float64Array; // 非预乘 RGBA，0～1
  readonly 宽: number;
  readonly 高: number;
  constructor(width: number, height: number) {
    this.宽 = width;
    this.高 = height;
    this.pixels = new Float64Array(width * height * 4);
  }
  fillBox(x: number, y: number, w: number, h: number, [r, g, b, a]: Rgba) {
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(this.宽, x + w), y1 = Math.min(this.高, y + h);
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * this.宽 + xx) * 4;
        const da = this.pixels[i + 3]!;
        const oa = a + da * (1 - a);
        const mix = (src: number, dst: number) => (oa === 0 ? 0 : (src * a + dst * da * (1 - a)) / oa);
        this.pixels[i] = mix(r / 255, this.pixels[i]!);
        this.pixels[i + 1] = mix(g / 255, this.pixels[i + 1]!);
        this.pixels[i + 2] = mix(b / 255, this.pixels[i + 2]!);
        this.pixels[i + 3] = oa;
      }
    }
  }
  rgba() {
    const out = Buffer.alloc(this.宽 * this.高 * 4);
    for (let i = 0; i < out.length; i++) out[i] = Math.round(this.pixels[i]! * 255);
    return out;
  }
}

// 像素字.ts 的 drawText / drawGlyph：坐标是界面像素，每个点按 floor 对齐到画面像素网格
const drawText = (c: Canvas, text: string, x: number, y: number, color: Rgba, s: number, origin: { x: number; y: number }) => {
  let cx = x;
  for (const ch of text) {
    const g = getGlyph(ch);
    for (let row = 0; row < g.rows.length; row++) {
      const bits = g.rows[row]!;
      if (!bits) continue;
      const y0 = Math.floor((y + g.top + row * g.scale) * s);
      const y1 = Math.floor((y + g.top + (row + 1) * g.scale) * s);
      for (let col = 0; col < g.w; col++) {
        if (!((bits >> (g.w - 1 - col)) & 1)) continue;
        const x0 = Math.floor((cx + col * g.scale) * s);
        const x1 = Math.floor((cx + (col + 1) * g.scale) * s);
        c.fillBox(x0 - origin.x, y0 - origin.y, x1 - x0, y1 - y0, color);
      }
    }
    cx += g.adv;
  }
};

/** 整帧大小的字幕卡（框外全透明）：段里铺满画面画（engine/段/设置值.ts 的 段字幕），一个 PNG 像素正好对一个成片像素 */
export const drawFullFrameCard = (text: string, subtitlePos: SubtitlePosition, pictureWidth: number, pictureHeight: number) => {
  const box = subtitleBox(text, subtitlePos, pictureWidth, pictureHeight);
  const c = new Canvas(box.w, box.h);
  c.fillBox(0, 0, box.w, box.h, baseColor);
  drawText(c, text, box.x / box.s + margin, box.y / box.s + margin, textColor, box.s, box);
  const caption = c.rgba();
  const fullFrame = Buffer.alloc(pictureWidth * pictureHeight * 4);
  for (let y = 0; y < box.h; y++) caption.copy(fullFrame, ((box.y + y) * pictureWidth + box.x) * 4, y * box.w * 4, (y + 1) * box.w * 4);
  return encodePng(pictureWidth, pictureHeight, fullFrame);
};

// ---------- PNG（8 位 RGBA，不滤波） ----------
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const pngChunk = (chunkType: string, payload: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(payload.length);
  const td = Buffer.concat([Buffer.from(chunkType, 'ascii'), payload]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
export const encodePng = (width: number, height: number, rgba: Buffer) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanline = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(scanline, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(scanline)), pngChunk('IEND', Buffer.alloc(0))]);
};

// ---------- 断屏 ----------
// 一句放不下一行时按语义切成几屏，每屏再按标点切成几截，带音节数、后面是不是标点（排时间用）。只在标点后、词和词之间断（Intl.Segmenter 中文分词），标点不放到一屏开头。
// 代价：每多一屏 10；断在句末标点后 0、句中标点后 1、空格 2；词和词之间 13 起（能在标点处多切一屏，就不在分句中间断），离分句正中越远越贵（最多再加 4）；
// 下一屏以「的、了、吗」这类虚词开头再加 20，词中间 40；一屏以单独的「的、地、得」收尾再加 6；一屏不到 3 个音节再加 6。同样代价时让后面的屏长一点。
const sentenceEndPunct = new Set(['。', '！', '？', '…', '!', '?']);
const midSentencePunct = new Set(['，', '、', '；', '：', '—', ',', ';', ':']);
const noScreenStart = new Set([...sentenceEndPunct, ...midSentencePunct, '”', '’', '）', '》', ')']);
const screenTailPunct = /[，。、；：,;:]+$/;
const functionWords = new Set(['的', '了', '着', '过', '地', '得', '吗', '呢', '吧', '啊', '呀', '哒', '么']);
const structParticles = new Set(['的', '地', '得']);
const alphanumRe = /[A-Za-z0-9]/;
const hanRe = /[㐀-鿿豈-﫿]/;

export const syllableCount = (text: string) => {
  let n = 0;
  for (const ch of text) if (hanRe.test(ch)) n++;
  for (const word of text.match(/[A-Za-z]+/g) ?? []) n += (word.match(/[aeiouy]+/gi) ?? []).length || word.length;
  return n;
};

export const isPunctBreak = (text: string) => {
  const t = [...text];
  const last = t[t.length - 1]!;
  return last === ' ' || sentenceEndPunct.has(last) || midSentencePunct.has(last);
};

export const splitClauses = (text: string) => {
  const cs = [...text];
  const out: string[] = [];
  let cur = '';
  cs.forEach((ch, i) => {
    cur += ch;
    const next = cs[i + 1];
    if ((ch === ' ' || sentenceEndPunct.has(ch) || midSentencePunct.has(ch)) && next !== undefined && !noScreenStart.has(next) && next !== ' ') {
      out.push(cur);
      cur = '';
    }
  });
  if (cur) out.push(cur);
  return out;
};

export type SubtitleCard = { 字: string; 原: string; 分句: { 音节: number; 标点断: boolean }[] };

export const breakScreens = (sentenceText: string, aspectRatio = 16 / 9): SubtitleCard[] => {
  const maxWidth = maxScreenWidth(aspectRatio);
  const cs = [...sentenceText];
  const n = cs.length;
  const wordBounds = new Set<number>();
  const startWords = new Map<number, string>();
  const endWords = new Map<number, string>();
  let pos = 0;
  for (const seg of new Intl.Segmenter('zh', { granularity: 'word' }).segment(sentenceText)) {
    startWords.set(pos, seg.segment);
    pos += [...seg.segment].length;
    wordBounds.add(pos);
    endWords.set(pos, seg.segment);
  }
  const isSeparator = (ch: string) => sentenceEndPunct.has(ch) || midSentencePunct.has(ch) || ch === ' ';
  const clauseBounds = (k: number) => {
    let a = k;
    while (a > 0 && !isSeparator(cs[a - 1]!)) a--;
    let b = k;
    while (b < n && !isSeparator(cs[b]!)) b++;
    return [a, b] as const;
  };
  const breakCost = (k: number) => {
    const prev = cs[k - 1]!;
    const next = cs[k]!;
    if (noScreenStart.has(next)) return Infinity;
    if (alphanumRe.test(prev) && alphanumRe.test(next)) return Infinity;
    if (sentenceEndPunct.has(prev)) return 0;
    if (midSentencePunct.has(prev)) return 1;
    if (prev === ' ') return 2;
    const [c0, c1] = clauseBounds(k);
    const offCenter = 8 * Math.abs((k - c0) / Math.max(1, c1 - c0) - 0.5);
    return (wordBounds.has(k) ? 13 : 40) + offCenter + (functionWords.has(startWords.get(k) ?? '') ? 20 : 0) + (structParticles.has(endWords.get(k) ?? '') ? 6 : 0);
  };
  const screenText = (i: number, j: number) => cs.slice(i, j).join('').trim().replace(screenTailPunct, '');
  const screenCost = (i: number, j: number) => {
    const t = screenText(i, j);
    if (!t || textWidth(t) > maxWidth) return Infinity;
    return 10 + (syllableCount(t) < 3 ? 6 : 0) + 1e-4 * textWidth(t) * (n - j);
  };
  const best = new Array<number>(n + 1).fill(Infinity);
  const from = new Array<number>(n + 1).fill(-1);
  best[0] = 0;
  for (let j = 1; j <= n; j++) {
    if (j < n && !Number.isFinite(breakCost(j))) continue;
    for (let i = 0; i < j; i++) {
      if (!Number.isFinite(best[i]!)) continue;
      const cost = best[i]! + screenCost(i, j) + (j < n ? breakCost(j) : 0);
      if (cost < best[j]!) {
        best[j] = cost;
        from[j] = i;
      }
    }
  }
  if (!Number.isFinite(best[n]!)) throw new Error(`断屏：「${sentenceText}」怎么切都有一屏放不下（最宽 ${maxWidth} 个界面像素）`);
  const screens: SubtitleCard[] = [];
  for (let j = n; j > 0; j = from[j]!) {
    const rawText = cs.slice(from[j]!, j).join('');
    screens.unshift({ 字: screenText(from[j]!, j), 原: rawText, 分句: splitClauses(rawText).map((c) => ({ 音节: syllableCount(c), 标点断: isPunctBreak(c) })) });
  }
  return screens;
};
