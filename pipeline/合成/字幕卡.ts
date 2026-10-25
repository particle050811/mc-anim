// 字幕卡：一屏字幕画成透明底 PNG（只有框那么大），anim film 按字幕表叠到成片上。
// 字幕的样式和断屏以这里为准（原样照搬旧项目的字幕组件；剪映剪辑包.py 的 subtitle_style 照这里抄，改样式两边一起改）：
// 黑底 0.5 不透明的框 + 白色游戏像素字，1 个界面像素 = 画面高 / 90，下方居中、框底离画面底 6 个界面像素；思索界面开着时挪到思索按钮上沿以上。
// 用户 10-10 要的样式，参考资产 设定图/界面/字幕样式参考（量法的细节见 git 里已删的 库/界面/字幕.tsx 文件头）。一屏只放一行，最宽 0.86 × 画面宽，不缩字、不折行。
// 旧项目在 Chrome 的 canvas 上画（字幕卡 Composition），这里用只会 fillRect 的小画布在 Node 里画：字幕只用整像素的 fillRect，结果一样。
import fs from 'node:fs';
import zlib from 'node:zlib';
import { 读资产锁, 解析资产 } from '../资产/资产锁.ts';

export type 字幕位置 = '下' | '思索上';

type 字形 = { w: number; h: number; scale: number; adv: number; shadow: number; top: number; rows: number[] };
let 字库: Record<string, 字形> | undefined;
/** 字幕卡的点阵（共用资产表登记）；有台词的段随仓库发字节时也带上它（资产/随仓库.ts） */
export const 像素字资产 = '字体/像素字';
/** 像素字点阵（资产 字体/像素字）；测试可以先 设字库 */
export const 设字库 = (x: Record<string, 字形>) => (字库 = x);
const 取字库 = () => (字库 ??= JSON.parse(fs.readFileSync(解析资产(像素字资产, 读资产锁()).文件, 'utf8')) as Record<string, 字形>);
const 取字 = (ch: string): 字形 => {
  const g = 取字库()[ch];
  if (!g) throw new Error(`像素字（资产 字体/像素字）里没有「${ch}」：字幕用到的字要先取进点阵`);
  return g;
};
export const 字宽 = (text: string) => [...text].reduce((a, ch) => a + 取字(ch).adv, 0);

// ---------- 样式 ----------
const 画面高界面像素 = 90;
const 边距 = 1;
const 字高 = 8;
const 框高 = 字高 + 2 * 边距;
const 底边距 = 6;
const 最宽比 = 0.86;
// 思索的按钮上沿在思索界面像素 高 − 54 处（思索界面高 240）
const 思索按钮上沿比 = (240 - 20 - 31 - 3) / 240;
const 底色: 颜色 = [0, 0, 0, 0.5];
const 字色: 颜色 = [255, 255, 255, 1];

export const 字幕缩放 = (画面高: number) => 画面高 / 画面高界面像素;
export const 一屏最宽 = (宽高比 = 16 / 9) => Math.floor(最宽比 * 画面高界面像素 * 宽高比) - 1;

export const 字幕框 = (字: string, 位置: 字幕位置, 画面宽: number, 画面高: number) => {
  const s = 字幕缩放(画面高);
  const w = Math.round((边距 + 字宽(字)) * s);
  const h = Math.round(框高 * s);
  const x = Math.round((画面宽 - w) / 2);
  const 框底 = 位置 === '思索上' ? Math.floor(思索按钮上沿比 * 画面高 - s) : Math.round(画面高 - 底边距 * s);
  return { x, y: 框底 - h, w, h, s };
};

// ---------- 小画布：只有 fillRect（source-over），够画字幕 ----------
type 颜色 = [number, number, number, number];
class 画布 {
  readonly 像素: Float64Array; // 非预乘 RGBA，0～1
  readonly 宽: number;
  readonly 高: number;
  constructor(宽: number, 高: number) {
    this.宽 = 宽;
    this.高 = 高;
    this.像素 = new Float64Array(宽 * 高 * 4);
  }
  填(x: number, y: number, w: number, h: number, [r, g, b, a]: 颜色) {
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(this.宽, x + w), y1 = Math.min(this.高, y + h);
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * this.宽 + xx) * 4;
        const da = this.像素[i + 3]!;
        const oa = a + da * (1 - a);
        const mix = (src: number, dst: number) => (oa === 0 ? 0 : (src * a + dst * da * (1 - a)) / oa);
        this.像素[i] = mix(r / 255, this.像素[i]!);
        this.像素[i + 1] = mix(g / 255, this.像素[i + 1]!);
        this.像素[i + 2] = mix(b / 255, this.像素[i + 2]!);
        this.像素[i + 3] = oa;
      }
    }
  }
  rgba() {
    const out = Buffer.alloc(this.宽 * this.高 * 4);
    for (let i = 0; i < out.length; i++) out[i] = Math.round(this.像素[i]! * 255);
    return out;
  }
}

// 像素字.ts 的 drawText / drawGlyph：坐标是界面像素，每个点按 floor 对齐到画面像素网格
const 画字 = (c: 画布, 字: string, x: number, y: number, 色: 颜色, s: number, 原点: { x: number; y: number }) => {
  let cx = x;
  for (const ch of 字) {
    const g = 取字(ch);
    for (let row = 0; row < g.rows.length; row++) {
      const bits = g.rows[row]!;
      if (!bits) continue;
      const y0 = Math.floor((y + g.top + row * g.scale) * s);
      const y1 = Math.floor((y + g.top + (row + 1) * g.scale) * s);
      for (let col = 0; col < g.w; col++) {
        if (!((bits >> (g.w - 1 - col)) & 1)) continue;
        const x0 = Math.floor((cx + col * g.scale) * s);
        const x1 = Math.floor((cx + (col + 1) * g.scale) * s);
        c.填(x0 - 原点.x, y0 - 原点.y, x1 - x0, y1 - y0, 色);
      }
    }
    cx += g.adv;
  }
};

/** 一屏字幕卡：裁到框的大小，返回 PNG 和它在画面上的左上角 */
export const 画字幕卡 = (字: string, 位置: 字幕位置, 画面宽: number, 画面高: number) => {
  const box = 字幕框(字, 位置, 画面宽, 画面高);
  const c = new 画布(box.w, box.h);
  c.填(0, 0, box.w, box.h, 底色);
  画字(c, 字, box.x / box.s + 边距, box.y / box.s + 边距, 字色, box.s, box);
  return { png: 编PNG(c.宽, c.高, c.rgba()), x: box.x, y: box.y, 宽: box.w, 高: box.h };
};

// ---------- PNG（8 位 RGBA，不滤波） ----------
const crc表 = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crc表[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const 块 = (类型: string, 数据: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(数据.length);
  const td = Buffer.concat([Buffer.from(类型, 'ascii'), 数据]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
export const 编PNG = (宽: number, 高: number, rgba: Buffer) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(宽, 0);
  ihdr.writeUInt32BE(高, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const 行 = Buffer.alloc((宽 * 4 + 1) * 高);
  for (let y = 0; y < 高; y++) rgba.copy(行, y * (宽 * 4 + 1) + 1, y * 宽 * 4, (y + 1) * 宽 * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 块('IHDR', ihdr), 块('IDAT', zlib.deflateSync(行)), 块('IEND', Buffer.alloc(0))]);
};

// ---------- 断屏 ----------
// 一句放不下一行时按语义切成几屏，每屏再按标点切成几截，带音节数、后面是不是标点（排时间用）。只在标点后、词和词之间断（Intl.Segmenter 中文分词），标点不放到一屏开头。
// 代价：每多一屏 10；断在句末标点后 0、句中标点后 1、空格 2；词和词之间 13 起（能在标点处多切一屏，就不在分句中间断），离分句正中越远越贵（最多再加 4）；
// 下一屏以「的、了、吗」这类虚词开头再加 20，词中间 40；一屏以单独的「的、地、得」收尾再加 6；一屏不到 3 个音节再加 6。同样代价时让后面的屏长一点。
const 句末 = new Set(['。', '！', '？', '…', '!', '?']);
const 句中 = new Set(['，', '、', '；', '：', '—', ',', ';', ':']);
const 不开屏 = new Set([...句末, ...句中, '”', '’', '）', '》', ')']);
const 屏尾标点 = /[，。、；：,;:]+$/;
const 虚词 = new Set(['的', '了', '着', '过', '地', '得', '吗', '呢', '吧', '啊', '呀', '哒', '么']);
const 结构助词 = new Set(['的', '地', '得']);
const 字母数字 = /[A-Za-z0-9]/;
const 汉字 = /[㐀-鿿豈-﫿]/;

export const 音节数 = (text: string) => {
  let n = 0;
  for (const ch of text) if (汉字.test(ch)) n++;
  for (const word of text.match(/[A-Za-z]+/g) ?? []) n += (word.match(/[aeiouy]+/gi) ?? []).length || word.length;
  return n;
};

export const 标点断 = (原: string) => {
  const t = [...原];
  const last = t[t.length - 1]!;
  return last === ' ' || 句末.has(last) || 句中.has(last);
};

export const 切分句 = (原: string) => {
  const cs = [...原];
  const out: string[] = [];
  let cur = '';
  cs.forEach((ch, i) => {
    cur += ch;
    const next = cs[i + 1];
    if ((ch === ' ' || 句末.has(ch) || 句中.has(ch)) && next !== undefined && !不开屏.has(next) && next !== ' ') {
      out.push(cur);
      cur = '';
    }
  });
  if (cur) out.push(cur);
  return out;
};

export type 屏 = { 字: string; 原: string; 分句: { 音节: number; 标点断: boolean }[] };

export const 断屏 = (句: string, 宽高比 = 16 / 9): 屏[] => {
  const maxWidth = 一屏最宽(宽高比);
  const cs = [...句];
  const n = cs.length;
  const 词界 = new Set<number>();
  const 起头词 = new Map<number, string>();
  const 收尾词 = new Map<number, string>();
  let pos = 0;
  for (const seg of new Intl.Segmenter('zh', { granularity: 'word' }).segment(句)) {
    起头词.set(pos, seg.segment);
    pos += [...seg.segment].length;
    词界.add(pos);
    收尾词.set(pos, seg.segment);
  }
  const 是分隔 = (ch: string) => 句末.has(ch) || 句中.has(ch) || ch === ' ';
  const 分句界 = (k: number) => {
    let a = k;
    while (a > 0 && !是分隔(cs[a - 1]!)) a--;
    let b = k;
    while (b < n && !是分隔(cs[b]!)) b++;
    return [a, b] as const;
  };
  const 断价 = (k: number) => {
    const prev = cs[k - 1]!;
    const next = cs[k]!;
    if (不开屏.has(next)) return Infinity;
    if (字母数字.test(prev) && 字母数字.test(next)) return Infinity;
    if (句末.has(prev)) return 0;
    if (句中.has(prev)) return 1;
    if (prev === ' ') return 2;
    const [c0, c1] = 分句界(k);
    const 偏心 = 8 * Math.abs((k - c0) / Math.max(1, c1 - c0) - 0.5);
    return (词界.has(k) ? 13 : 40) + 偏心 + (虚词.has(起头词.get(k) ?? '') ? 20 : 0) + (结构助词.has(收尾词.get(k) ?? '') ? 6 : 0);
  };
  const 屏字 = (i: number, j: number) => cs.slice(i, j).join('').trim().replace(屏尾标点, '');
  const 屏价 = (i: number, j: number) => {
    const t = 屏字(i, j);
    if (!t || 字宽(t) > maxWidth) return Infinity;
    return 10 + (音节数(t) < 3 ? 6 : 0) + 1e-4 * 字宽(t) * (n - j);
  };
  const best = new Array<number>(n + 1).fill(Infinity);
  const from = new Array<number>(n + 1).fill(-1);
  best[0] = 0;
  for (let j = 1; j <= n; j++) {
    if (j < n && !Number.isFinite(断价(j))) continue;
    for (let i = 0; i < j; i++) {
      if (!Number.isFinite(best[i]!)) continue;
      const cost = best[i]! + 屏价(i, j) + (j < n ? 断价(j) : 0);
      if (cost < best[j]!) {
        best[j] = cost;
        from[j] = i;
      }
    }
  }
  if (!Number.isFinite(best[n]!)) throw new Error(`断屏：「${句}」怎么切都有一屏放不下（最宽 ${maxWidth} 个界面像素）`);
  const 屏们: 屏[] = [];
  for (let j = n; j > 0; j = from[j]!) {
    const 原 = cs.slice(from[j]!, j).join('');
    屏们.unshift({ 字: 屏字(from[j]!, j), 原, 分句: 切分句(原).map((c) => ({ 音节: 音节数(c), 标点断: 标点断(c) })) });
  }
  return 屏们;
};
