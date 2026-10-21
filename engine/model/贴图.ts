// 贴图：import 'asset:贴图/…' 得到的 PNG（取材配方从 jar 里取出来）。
// PNG 在打包时内联进代码，这里同步解码成像素，再同步建成 three.js 的贴图——
// Remotion 是一帧一帧渲染的，贴图要是异步加载，可能还没加载完这一帧就被截走了。
import { decode } from 'fast-png';

export type Png = { w: number; h: number; px: Uint8Array }; // px：RGBA，从第一行开始

const cache = new Map<string, Png>();

// uri：import 某个 .png 得到的 data URI
export const png = (uri: string): Png => {
  let image = cache.get(uri);
  if (!image) {
    const bin = atob(uri.slice(uri.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const decoded = decode(bytes);
    // 导出脚本统一存成 8 位 RGBA；别的格式（调色板、灰度、16 位）这里不处理
    if (decoded.channels !== 4 || decoded.depth !== 8) throw new Error(`贴图不是 8 位 RGBA（channels=${decoded.channels}, depth=${decoded.depth}），用导出脚本重新导出`);
    image = { w: decoded.width, h: decoded.height, px: new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength) };
    cache.set(uri, image);
  }
  return image;
};

// 一个目录里的全部 PNG：ctx 是 import.meta.webpackContext('./某目录', { regExp: /\.png$/ })，返回 {文件名（不带扩展名）: 贴图}
export const pngDir = (ctx: { keys(): string[]; (key: string): string | { default: string } }): Record<string, Png> => {
  const out: Record<string, Png> = {};
  for (const k of ctx.keys()) {
    const mod = ctx(k);
    out[k.replace(/^\.\//, '').replace(/\.png$/, '')] = png(typeof mod === 'string' ? mod : mod.default);
  }
  return out;
};

// 从图集里切出一块（x, y 起、边长 size 的方块），像素另存一份
export const crop = (atlas: Png, x: number, y: number, size: number): Uint8Array => {
  const out = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row++) {
    const from = ((y + row) * atlas.w + x) * 4;
    out.set(atlas.px.subarray(from, from + size * 4), row * size * 4);
  }
  return out;
};
