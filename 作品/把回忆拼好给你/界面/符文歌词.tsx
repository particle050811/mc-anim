// 正片歌词艺术字：每个字由几枚附魔台符文（银河字母，这个字拼音的字母）从右边飞过来，一枚送来一块笔画，落定那一帧闪一下，唱到这个字时正好拼齐
// （用户 10-24：「每个字由几枚附魔台符文从旁边飞过来，拼出这个字的笔画，落定时闪一下」；分块和飞法见 符文拼字.ts）。
// 五个关键词另有效果（歌词字效.ts）；每句的位置、断行、对齐查 歌词排版表.ts（正片歌词行 带在 行.版 里）。
// 接口：行们（用 符文歌词数据.ts 的 正片歌词行 取）、样式（全片默认加这一镜的描边色）、收；帧 只给核对段钉帧用。
// 按「点」画：一个点 = 字点 个成片像素，点格从画面左上角数；每句一层，按成片分辨率整数倍放大、不抗锯齿。
// 进出场不用半透明，用 4×4 Bayer 抖动一个点一个点地亮、灭；描边 = 字和符文外一圈 8 邻域的点，1 点宽（歌词自己的字边，颜色给场的调子的 描边）。放在 整片后期 里面。
// 飞着的符文不进点层，一枚一枚按成片像素贴（贴片图）：吸到 7 像素一点时 60 fps 下一帧挪 1 点、每 5 帧跳 2 点，一顿一顿（用户 11-03「改好」）；
// 挪着的块（刹那掉下去、放下飘下去）、烟花的火花也这样贴（用户 11-03「统统改成 60 帧」）。停着的笔画照旧在点层里；贴的时候按原来同一层里的遮挡分几张叠（见 符文歌词 组件）。
import type React from 'react';
import { useLayoutEffect, useRef } from 'react';
import { useVideoConfig } from 'remotion';
import sgaPng from 'asset:贴图/界面/银河字母';
import glintPng from 'asset:贴图/特效/附魔光泽';
import spark0Png from 'asset:贴图/粒子/火花/0';
import spark1Png from 'asset:贴图/粒子/火花/1';
import spark2Png from 'asset:贴图/粒子/火花/2';
import spark3Png from 'asset:贴图/粒子/火花/3';
import spark4Png from 'asset:贴图/粒子/火花/4';
import spark5Png from 'asset:贴图/粒子/火花/5';
import spark6Png from 'asset:贴图/粒子/火花/6';
import spark7Png from 'asset:贴图/粒子/火花/7';
import raw from 'asset:字体/把回忆拼好给你/歌词字';
import { png, type Png } from '@engine/model/贴图.ts';
import { filmScale } from '@engine/三渲二/像素.ts';
import type { GlyphTable } from '@库/界面/像素字表.ts';
import { fps, legacyFrameSec } from '../分镜/时间.ts';
import { brightEffect, brightTier, instantEffect, instantBlock, putDown, putDownBlock, timeLag, firework, fireworkSparks, inWord } from './歌词字效.ts';
import { splitBlocks, glyphSeed, gatherFactor, runeScale, flyBlocks, flyPos, type RuneBlock } from './符文拼字.ts';
import { makeGlyphSource, mergeStyle, charStates, layoutLine, decodeTimeSpans, type CharState, type PlacedChar, type RuneLyricStyle, type RuneLyricLine } from './符文排版.ts';
import { useSnappedFrame } from '../当前帧.ts';

export { runeLyricDefault } from './符文排版.ts';
export type { RuneLyricStyle, RuneLyricLine };

const glyphSource = makeGlyphSource(png(sgaPng), raw as unknown as GlyphTable, '字体/把回忆拼好给你/歌词字');
const sparkTextures = [spark0Png, spark1Png, spark2Png, spark3Png, spark4Png, spark5Png, spark6Png, spark7Png];

const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** 4×4 Bayer 阈值（0～1 之间，不到 1）：显现度大于它的点才画 */
const threshold = (X: number, Y: number) => (bayer[(Y & 3) * 4 + (X & 3)]! + 0.5) / 16;

const colorCache = new Map<string, readonly [number, number, number]>();
const parseColor = (s: string) => {
  let c = colorCache.get(s);
  if (!c) {
    const m = /^#([0-9a-fA-F]{6})$/.exec(s);
    if (!m) throw new Error(`符文歌词的颜色要写成 #RRGGBB，给的是 ${s}`);
    const n = parseInt(m[1]!, 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    colorCache.set(s, c);
  }
  return c;
};
const intToRgb = (n: number) => [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;

type DotLayer = {
  width: number;
  height: number;
  /** RGBA */
  px: Uint8ClampedArray<ArrayBuffer>;
  /** 1 = 字或符文（描边绕着它描） */
  实: Uint8Array;
  /** 这一点吃多少附魔光泽（符文的点 1，汉字 0） */
  光: Float32Array;
};

const newLayer = (width: number, height: number): DotLayer => ({ width: width, height: height, px: new Uint8ClampedArray(width * height * 4), 实: new Uint8Array(width * height), 光: new Float32Array(width * height) });

const drawDot = (pixelLayer: DotLayer, X: number, Y: number, c: readonly number[], light = 0) => {
  if (X < 0 || Y < 0 || X >= pixelLayer.width || Y >= pixelLayer.height) return;
  const k = Y * pixelLayer.width + X;
  pixelLayer.px[k * 4] = c[0]!;
  pixelLayer.px[k * 4 + 1] = c[1]!;
  pixelLayer.px[k * 4 + 2] = c[2]!;
  pixelLayer.px[k * 4 + 3] = 255;
  pixelLayer.实[k] = 1;
  pixelLayer.光[k] = light;
};

/** 只画在空着的地方（不盖字、符文和描边），a = 不透明度：光圈、火花用 */
const paintDot = (pixelLayer: DotLayer, X: number, Y: number, c: readonly number[], a = 1) => {
  if (X < 0 || Y < 0 || X >= pixelLayer.width || Y >= pixelLayer.height) return;
  const k = Y * pixelLayer.width + X;
  if (pixelLayer.px[k * 4 + 3]) return;
  pixelLayer.px[k * 4] = c[0]!;
  pixelLayer.px[k * 4 + 1] = c[1]!;
  pixelLayer.px[k * 4 + 2] = c[2]!;
  pixelLayer.px[k * 4 + 3] = Math.round(255 * a);
};

// 附魔光泽（叠在符文上）：原版 RenderStateShard.setupGlintTexturing(8)：i = 毫秒 × 光泽速度(默认 0.5) × 8，贴图矩阵 = 平移(−(i%110000)/110000, (i%30000)/30000) · 绕 z 转 10° · 放大 8；
// 贴图双线性、重复铺；叠法 (SRC_COLOR, ONE)：底色 += (贴图 × 光泽强度(默认 0.75))²。物品图集里一格 16 像素约对上光泽贴图 16 像素，这里一个光泽像素 = 光泽像素点 个点
const glossSpeed = 0.5;
const glossStrength = 0.75;
const glossPixelSize = 2;
const angleRad = (10 * Math.PI) / 180;
const glossAt = (X: number, Y: number, timeMs: number, out: number[]) => {
  const tex = png(glintPng);
  const i = timeMs * glossSpeed * 8;
  const a = X / glossPixelSize / 128;
  const b = Y / glossPixelSize / 128;
  const u = (Math.cos(angleRad) * a - Math.sin(angleRad) * b - (i % 110000) / 110000) * tex.w - 0.5;
  const v = (Math.sin(angleRad) * a + Math.cos(angleRad) * b + (i % 30000) / 30000) * tex.h - 0.5;
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = u - x0;
  const fy = v - y0;
  const sampleTexel = (x: number, y: number, ch: number) => tex.px[((((y % tex.h) + tex.h) % tex.h) * tex.w + (((x % tex.w) + tex.w) % tex.w)) * 4 + ch]!;
  for (let ch = 0; ch < 3; ch++) {
    const s = (sampleTexel(x0, y0, ch) * (1 - fx) + sampleTexel(x0 + 1, y0, ch) * fx) * (1 - fy) + (sampleTexel(x0, y0 + 1, ch) * (1 - fx) + sampleTexel(x0 + 1, y0 + 1, ch) * fx) * fy;
    out[ch] = ((glossStrength * s) / 255) ** 2 * 255;
  }
};

/** 一个字拼齐那一下，字形外框四个角外 2 点各闪一个亮点：头 1/24 秒十字（5 点），之后只剩中心一点（24 fps 时第 1 帧十字、第 2 帧一点）。解后 是帧数 */
const drawHighlight = (pixelLayer: DotLayer, glyphCell: PlacedChar, afterSolve: number, visible: (X: number, Y: number) => boolean, rgb: readonly number[]) => {
  const points = glyphSource.hanChar(glyphCell.char).points;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const left = Math.min(...xs) - 2;
  const right = Math.max(...xs) + 2;
  const top = Math.min(...ys) - 2;
  const bottom = Math.max(...ys) + 2;
  const offsets = afterSolve / fps < legacyFrameSec(1) ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] : [[0, 0]];
  for (const [cx, cy] of [[left, top], [right, top], [left, bottom], [right, bottom]] as const)
    for (const [dx, dy] of offsets) {
      const X = glyphCell.x + cx + dx!;
      const Y = glyphCell.y + cy + dy!;
      if (visible(X, Y)) drawDot(pixelLayer, X, Y, rgb);
    }
};

/** 一块落定后这一帧怎么画：挪几点、什么颜色（关键词效果改它）；冰 = 刹那：1 闪（整块冰亮色、外一圈冰色），2 冰（冰色、朝上的点亮一档） */
type BlockStyle = { dx: number; dy: number; 色: readonly number[]; ice?: 0 | 1 | 2 };

type CharEntry = { cell: PlacedChar; pinyin: string; state: CharState; timestamp: { start: number; end: number }; kind: number; chunks: readonly RuneBlock[] };

/** 贴片里的一点：相对左上角的整数位置、颜色、吃多少光泽、显现度（抖动阈值比它小才画） */
type StampDot = readonly [number, number, readonly number[], number, number];
/** 一张按成片像素贴的小图（飞着的符文、挪着的块、火花）：左上角在点格上的位置（带小数）、宽高（点）、点们、横向裁到哪（点）；空 = 火花（只画在空处） */
type Stamp = { x: number; y: number; width: number; height: number; patchPoints: StampDot[]; 界?: readonly [number, number]; 空?: true };

/** 画一个字的符文和已经落定的块：停着的块画进 层，飞着的符文放进 飞符们，挪着的块放进 动块们。块样 给关键词改落定以后的样子；调 = 时差的残影那一遍把所有颜色换成冷色 */
const drawText = (
  pixelLayer: DotLayer,
  flyGlyphs: Stamp[],
  movingBlocks: Stamp[],
  glyph: CharEntry,
  f: number,
  lyricStyle: RuneLyricStyle,
  blockStyle: (k: number) => BlockStyle,
  toneFn?: (c: readonly number[]) => readonly number[],
) => {
  const { cell: glyphCell, pinyin, state, timestamp: timeSpan, kind: seed, chunks } = glyph;
  const runeRgb = parseColor(lyricStyle.runeColor);
  const flights = flyBlocks(chunks, pinyin, { ...timeSpan, 入: state.入 }, lyricStyle.flySec, seed);
  const clipRange = glyphCell.界;
  const drawPoint = (X: number, Y: number, c: readonly number[], light = 0) => {
    if (clipRange && !(X >= clipRange[0] && X + 1 <= clipRange[1])) return;
    drawDot(pixelLayer, X, Y, toneFn ? toneFn(c) : c, light);
  };
  // 飞着的符文（落定的块盖在它上面：飞过还没拼好的邻字时不挡住字）。一个字母像素画成 倍 × 倍 个点，最后一截缩回 1 倍；起飞头 1/24 秒半透明
  flights.forEach((flight, k) => {
    const pos = flyPos(flight, f);
    if (!pos) return;
    const pixelSize = (f - flight.start) / (flight.landTime - flight.start) < gatherFactor ? runeScale : 1;
    const glyph = glyphSource.rune(flight.letter);
    const center = chunks[k]!.心;
    const c = runeRgb.map((v) => v * flight.brightness);
    const glyphColor = toneFn ? toneFn(c) : c;
    const shown = (1 - state.出) * ((f - flight.start) / fps < legacyFrameSec(1) ? 0.5 : 1);
    const patchPoints: StampDot[] = [];
    for (const [x, y] of glyph.points) for (let sy = 0; sy < pixelSize; sy++) for (let sx = 0; sx < pixelSize; sx++) patchPoints.push([x * pixelSize + sx, y * pixelSize + sy, glyphColor, 1, shown]);
    flyGlyphs.push({
      x: glyphCell.x + center[0] + pos[0] - (glyph.width * pixelSize) / 2,
      y: glyphCell.y + center[1] + pos[1] - 3.5 * pixelSize,
      width: glyph.width * pixelSize,
      height: glyph.height * pixelSize,
      patchPoints,
      ...(clipRange ? { 界: clipRange } : {}),
    });
  });
  // 刚落定的块：头 1/24 秒外面一圈闪圈色，闪秒 内笔画是闪色；刹那冻住、裂开那一下外面一圈冰色、笔画冰亮色
  const flashRing = parseColor(lyricStyle.flashRingColor);
  const flashColor = parseColor(lyricStyle.flashColor);
  const landed = flights.map((flight) => f >= flight.landTime);
  const styles = flights.map((_, k) => (landed[k] ? blockStyle(k) : null));
  // 挪着的块（离原位不是整点）不吸到点上，一块一张贴片（外面留一点给闪圈）；停着的画进 层
  const pieces = styles.map((s, k) => {
    if (!s || (Number.isInteger(s.dx) && Number.isInteger(s.dy))) return null;
    const points = chunks[k]!.points;
    const x0 = Math.min(...points.map(([x]) => x)) - 1;
    const y0 = Math.min(...points.map(([, y]) => y)) - 1;
    const patch: Stamp = {
      x: glyphCell.x + x0 + s.dx,
      y: glyphCell.y + y0 + s.dy,
      width: Math.max(...points.map(([x]) => x)) + 2 - x0,
      height: Math.max(...points.map(([, y]) => y)) + 2 - y0,
      patchPoints: [],
      ...(clipRange ? { 界: clipRange } : {}),
    };
    movingBlocks.push(patch);
    return { 片: patch, x0, y0 };
  });
  /** 第 k 块的一点（字里的位置 x、y） */
  const stamp = (k: number, s: BlockStyle, x: number, y: number, c: readonly number[]) => {
    const runePiece = pieces[k];
    if (runePiece) {
      runePiece.片.patchPoints.push([x - runePiece.x0, y - runePiece.y0, toneFn ? toneFn(c) : c, 0, state.shown]);
      return;
    }
    const X = Math.round(glyphCell.x + x + s.dx);
    const Y = Math.round(glyphCell.y + y + s.dy);
    if (state.shown > threshold(X, Y)) drawPoint(X, Y, c);
  };
  flights.forEach((flight, k) => {
    const s = styles[k];
    if (!s) return;
    const ringFx = s.ice === 1 ? parseColor(instantEffect.iceColor) : (f - flight.landTime) / fps < legacyFrameSec(1) ? flashRing : null;
    if (!ringFx) return;
    const occupied = new Set(chunks[k]!.points.map(([x, y]) => `${x},${y}`));
    for (const [x, y] of chunks[k]!.points)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (occupied.has(`${x + dx},${y + dy}`)) continue;
        stamp(k, s, x + dx, y + dy, ringFx);
      }
  });
  flights.forEach((flight, k) => {
    const s = styles[k];
    if (!s) return;
    const justLanded = (f - flight.landTime) / fps < lyricStyle.flashSec;
    // 冰：笔画朝上露着的点亮一档（上面一点不是这个字的笔画）
    const glyphDotSet = s.ice === 2 ? new Set(glyphSource.hanChar(glyphCell.char).points.map(([x, y]) => `${x},${y}`)) : null;
    for (const [x, y] of chunks[k]!.points) {
      const c = s.ice === 1 ? parseColor(instantEffect.iceLightColor) : justLanded ? flashColor : glyphDotSet ? (glyphDotSet.has(`${x},${y - 1}`) ? parseColor(instantEffect.iceColor) : parseColor(instantEffect.iceLightColor)) : s.色;
      stamp(k, s, x, y, c);
    }
  });
  if (state.afterSolve >= 0 && state.afterSolve / fps < lyricStyle.highlightSec) drawHighlight(pixelLayer, glyphCell, state.afterSolve, (X, Y) => state.shown > threshold(X, Y), toneFn ? toneFn(parseColor(lyricStyle.textColor)) : parseColor(lyricStyle.textColor));
};

const drawOutline = (pixelLayer: DotLayer, outlineColor: string | null) => {
  if (!outlineColor) return;
  const c = parseColor(outlineColor);
  const { width: width, height: height, 实: filled } = pixelLayer;
  for (let Y = 0; Y < height; Y++)
    for (let X = 0; X < width; X++) {
      if (filled[Y * width + X]) continue;
      let touching = false;
      for (let dy = -1; dy <= 1 && !touching; dy++)
        for (let dx = -1; dx <= 1 && !touching; dx++) {
          const x = X + dx;
          const y = Y + dy;
          touching = x >= 0 && y >= 0 && x < width && y < height && filled[y * width + x] === 1;
        }
      if (!touching) continue;
      const k = Y * width + X;
      pixelLayer.px[k * 4] = c[0];
      pixelLayer.px[k * 4 + 1] = c[1];
      pixelLayer.px[k * 4 + 2] = c[2];
      pixelLayer.px[k * 4 + 3] = 255;
    }
};

const applyGloss = (pixelLayer: DotLayer, f: number, origin: readonly [number, number] = [0, 0]) => {
  const timeMs = (f / fps) * 1000;
  const g = [0, 0, 0];
  for (let k = 0; k < pixelLayer.width * pixelLayer.height; k++) {
    const s = pixelLayer.光[k]!;
    if (!s || !pixelLayer.实[k]) continue;
    glossAt(origin[0] + (k % pixelLayer.width), origin[1] + Math.floor(k / pixelLayer.width), timeMs, g);
    for (let ch = 0; ch < 3; ch++) pixelLayer.px[k * 4 + ch] = pixelLayer.px[k * 4 + ch]! + s * g[ch]!;
  }
};

/** 点层里挑出实的点（字、符文、闪圈）或不实的点（描边、光圈、火花、残影）放进一块画布 */
const pickDots = (pixelLayer: DotLayer, filled: boolean) => {
  const px = new Uint8ClampedArray(pixelLayer.px.length);
  for (let k = 0; k < pixelLayer.width * pixelLayer.height; k++) if (!!pixelLayer.实[k] === filled) for (let ch = 0; ch < 4; ch++) px[k * 4 + ch] = pixelLayer.px[k * 4 + ch]!;
  const c = document.createElement('canvas');
  c.width = pixelLayer.width;
  c.height = pixelLayer.height;
  c.getContext('2d')!.putImageData(new ImageData(px, pixelLayer.width, pixelLayer.height), 0, 0);
  return c;
};

/** 一张贴片在自己的小点层里画（抖动阈值、光泽按它在点格上的整数位置取，同画在大点层里一样）、描边、上光泽，
 *  按位置的小数部分挪整数个成片像素；描边（火花也在这张）和填的分两张返回，好让几张叠着时描边都垫在填的底下。
 *  描边色 null、光泽 false：时差的残影、火花 */
const patchImage = (patch: Stamp, glyphScale: number, f: number, outlineColor: string | null, withGloss: boolean) => {
  const X0 = Math.floor(patch.x);
  const Y0 = Math.floor(patch.y);
  // 外面留一点给描边；小层原点在点格的 (X0 − 1, Y0 − 1)
  const smallLayer = newLayer(patch.width + 2, patch.height + 2);
  for (const [x, y, c, light, shown] of patch.patchPoints) {
    const X = X0 + x;
    const Y = Y0 + y;
    if (patch.界 && !(X >= patch.界[0] && X + 1 <= patch.界[1])) continue;
    if (!(shown > threshold(X, Y))) continue;
    if (patch.空) paintDot(smallLayer, x + 1, y + 1, c);
    else drawDot(smallLayer, x + 1, y + 1, c, light);
  }
  drawOutline(smallLayer, outlineColor);
  if (withGloss) applyGloss(smallLayer, f, [X0 - 1, Y0 - 1]);
  const pixelOffset = (v: number, v0: number) => (v0 - 1) * glyphScale + Math.round((v - v0) * glyphScale);
  return { x: pixelOffset(patch.x, X0), y: pixelOffset(patch.y, Y0), width: smallLayer.width * glyphScale, height: smallLayer.height * glyphScale, outline: pickDots(smallLayer, false), fillPoints: pickDots(smallLayer, true) };
};

/** 把 影 垫在 层 底下：层 空着的点取 影 的点（时差的残影） */
const drawUnderlay = (pixelLayer: DotLayer, shadowLayer: DotLayer) => {
  for (let k = 0; k < pixelLayer.width * pixelLayer.height; k++) {
    if (pixelLayer.px[k * 4 + 3] || !shadowLayer.px[k * 4 + 3]) continue;
    for (let ch = 0; ch < 4; ch++) pixelLayer.px[k * 4 + ch] = shadowLayer.px[k * 4 + ch]!;
  }
};

/** 光明的光：到这个词笔画的曼哈顿距离分档，每档 光明.档宽 点、一档一个实色（描边在时从描边外面起），只画在空处 */
const drawHalo = (pixelLayer: DotLayer, points: readonly (readonly [number, number])[], tierCount: number, hasOutline: boolean, shown: number) => {
  if (!tierCount || !points.length) return;
  const startRing = hasOutline ? 2 : 1;
  const R = startRing + tierCount * brightEffect.bandWidth - 1;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const x0 = Math.min(...xs) - R;
  const y0 = Math.min(...ys) - R;
  const w = Math.max(...xs) + R - x0 + 1;
  const h = Math.max(...ys) + R - y0 + 1;
  const distance = new Int16Array(w * h).fill(9999);
  const queue: number[] = [];
  for (const [x, y] of points) {
    const k = (y - y0) * w + (x - x0);
    if (distance[k] !== 0) {
      distance[k] = 0;
      queue.push(k);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q]!;
    const d = distance[k]!;
    if (d >= R) continue;
    const x = k % w;
    const y = Math.floor(k / w);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nk = ny * w + nx;
      if (distance[nk]! <= d + 1) continue;
      distance[nk] = d + 1;
      queue.push(nk);
    }
  }
  for (let k = 0; k < w * h; k++) {
    const d = distance[k]!;
    if (d < startRing || d > R) continue;
    const X = x0 + (k % w);
    const Y = y0 + Math.floor(k / w);
    if (shown > threshold(X, Y)) paintDot(pixelLayer, X, Y, parseColor(brightEffect.tierColors[Math.floor((d - startRing) / brightEffect.bandWidth)]!));
  }
};

/** 烟花的火花：原版 spark 贴图（8×8，一个贴图像素 = 一个点）乘火花色，只画在空处、按 透 抖动；一颗一张贴片，按成片像素贴。
 *  歌词是自己的点阵，点不随材质包变细：材质包的高清火花（16×16）隔 k 个取一个，还是 8×8 个点 */
const drawSparks = (pixelLayer: DotLayer, glyphScale: number, sparks: Stamp[], center: readonly [number, number], startRing: readonly [number, number], f: number, allDoneFrame: number, seed: number, remain: number) => {
  const isEmpty = (X: number, Y: number) => X < 0 || Y < 0 || X >= pixelLayer.width || Y >= pixelLayer.height || !pixelLayer.px[(Y * pixelLayer.width + X) * 4 + 3];
  for (const s of fireworkSparks(f, allDoneFrame, seed, startRing)) {
    const tex: Png = png(sparkTextures[s.档]!);
    const k = tex.w / 8;
    const c = intToRgb(s.色);
    const x0 = center[0] + s.x - 4;
    const y0 = center[1] + s.y - 4;
    // 挪了小数的一点盖住点格上相邻的两点：都空着才画，不然擦着字和描边会露出一条一条的碎边
    const spanX = Math.round((x0 - Math.floor(x0)) * glyphScale) ? 1 : 0;
    const spanY = Math.round((y0 - Math.floor(y0)) * glyphScale) ? 1 : 0;
    const patchPoints: StampDot[] = [];
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const i = (y * k * tex.w + x * k) * 4;
        const a = tex.px[i + 3]! / 255;
        if (!a) continue;
        const X = Math.floor(x0) + x;
        const Y = Math.floor(y0) + y;
        if (!(isEmpty(X, Y) && isEmpty(X + spanX, Y) && isEmpty(X, Y + spanY) && isEmpty(X + spanX, Y + spanY))) continue;
        patchPoints.push([x, y, [(tex.px[i]! * c[0]) / 255, (tex.px[i + 1]! * c[1]) / 255, (tex.px[i + 2]! * c[2]) / 255], 0, s.alpha * remain * a]);
      }
    sparks.push({ x: x0, y: y0, width: 8, height: 8, patchPoints, 空: true });
  }
};

/** 画一句到它自己的点层（字点按这句的样式），返回这一层、飞着的符文（残影的、本体的）、挪着的块、火花和描边色；这一帧整句都看不见给 null */
const drawLine = (
  lines: readonly RuneLyricLine[],
  i: number,
  f: number,
  baseStyle: RuneLyricStyle,
  width: number,
  height: number,
  fadeOutFrame?: number,
): { layers: DotLayer; glyphScale: number; flyGlyphs: Stamp[]; shadowFlyGlyphs: Stamp[]; movingBlocks: Stamp[]; sparks: Stamp[]; outlineColor: string | null } | null => {
  const lyricLine = lines[i]!;
  const mergedStyle = mergeStyle(baseStyle, lyricLine.版);
  if (!Number.isInteger(mergedStyle.glyphScale) || mergedStyle.glyphScale <= 0) throw new Error(`符文歌词的字点要是正整数：${mergedStyle.glyphScale}`);
  // 进场前（符文最早在进场那一帧起飞）、退场完（时差的残影晚半拍退）都不画
  if (f < lyricLine.入) return null;
  const wordEffect = lyricLine.wordEffect;
  const states = charStates(lines, i, f, mergedStyle, fadeOutFrame);
  const lag = wordEffect?.effect === '时差' ? f - wordEffect.halfBeat : null;
  const lateStates = lag === null ? null : charStates(lines, i, lag, mergedStyle, fadeOutFrame);
  if (states.every((s) => s.出 >= 1) && (!lateStates || lateStates.every((s) => s.出 >= 1))) return null;
  const timeSpans = decodeTimeSpans(lyricLine, mergedStyle);
  const glyphs = layoutLine(glyphSource, lyricLine.text, mergedStyle, width, height, lyricLine.版).glyphs;
  const chars: CharEntry[] = glyphs.map((glyphCell, j) => ({ cell: glyphCell, pinyin: lyricLine.pinyin[j]!, state: states[j]!, timestamp: timeSpans[j]!, kind: glyphSeed(lyricLine.序 ?? 0, j), chunks: splitBlocks(glyphCell.char, glyphSource.hanChar(glyphCell.char)) }));
  const pixelLayer = newLayer(Math.ceil(width / mergedStyle.glyphScale), Math.ceil(height / mergedStyle.glyphScale));
  const allDoneFrame = wordEffect ? Math.max(...timeSpans.slice(wordEffect.从, wordEffect.dest + 1).map((d) => d.end)) : Infinity;
  const textColor = parseColor(mergedStyle.textColor);
  const blockStyleFor = (j: number) => (k: number): BlockStyle => {
    if (!wordEffect || !inWord(wordEffect, j)) return { dx: 0, dy: 0, 色: textColor };
    const seed = chars[j]!.kind * 8 + k;
    switch (wordEffect.effect) {
      case '光明':
        return { dx: 0, dy: 0, 色: f >= allDoneFrame ? parseColor(brightEffect.textColor) : textColor };
      case '烟花':
        return { dx: 0, dy: 0, 色: f >= allDoneFrame && (f - allDoneFrame) / fps < firework.tintSec ? parseColor(firework.textColor) : textColor };
      case '刹那': {
        // 块的中心离整个词的中心多远（往哪边裂）
        const wordCells = chars.slice(wordEffect.从, wordEffect.dest + 1).map((z) => z.cell);
        const centerX = (wordCells[0]!.x + wordCells[wordCells.length - 1]!.x + 16) / 2;
        const centerY = wordCells[0]!.y + 8;
        const runeBlock = chars[j]!.chunks[k]!;
        const r = instantBlock(f, chars[j]!.timestamp.end, wordEffect.shatterFrame, [chars[j]!.cell.x + runeBlock.心[0] - centerX, chars[j]!.cell.y + runeBlock.心[1] - centerY], seed);
        return { dx: r.dx, dy: r.dy, 色: textColor, ice: r.ice };
      }
      case '放下': {
        const r = putDownBlock(f, allDoneFrame, seed);
        return { dx: r.dx, dy: r.dy, 色: r.色 ? parseColor(putDown.releaseColors[r.色 - 1]!) : textColor };
      }
      default:
        return { dx: 0, dy: 0, 色: textColor };
    }
  };
  const flyGlyphs: Stamp[] = [];
  const shadowFlyGlyphs: Stamp[] = [];
  const movingBlocks: Stamp[] = [];
  const sparks: Stamp[] = [];
  chars.forEach((z, j) => drawText(pixelLayer, flyGlyphs, movingBlocks, z, f, mergedStyle, blockStyleFor(j)));
  drawOutline(pixelLayer, mergedStyle.outlineColor);
  applyGloss(pixelLayer, f);
  if (wordEffect) {
    const words = chars.slice(wordEffect.从, wordEffect.dest + 1);
    const remain = 1 - states[wordEffect.从]!.出;
    if (wordEffect.effect === '光明') {
      const points = words.flatMap((z) => glyphSource.hanChar(z.cell.char).points.map(([x, y]) => [z.cell.x + x, z.cell.y + y] as const));
      drawHalo(pixelLayer, points, brightTier(f, allDoneFrame), !!mergedStyle.outlineColor, states[wordEffect.从]!.shown);
    }
    if (wordEffect.effect === '烟花') {
      const center: [number, number] = [(words[0]!.cell.x + words[words.length - 1]!.cell.x + 16) / 2, words[0]!.cell.y + 8];
      drawSparks(pixelLayer, mergedStyle.glyphScale, sparks, center, [(words[words.length - 1]!.cell.x + 16 - words[0]!.cell.x) / 2 + 1, 9], f, allDoneFrame, chars[wordEffect.从]!.kind, remain);
    }
    if (lag !== null && lateStates) {
      // 残影另画一层：晚半拍的拼字（进场、符文、落定、退场都晚半拍），错开、一档实色冷蓝、不描边，再垫到本体底下
      const shadowLayer = newLayer(pixelLayer.width, pixelLayer.height);
      const coldColor = parseColor(timeLag.色);
      words.forEach((z, n) => {
        const j = wordEffect.从 + n;
        const glyphCell = { ...z.cell, x: z.cell.x + timeLag.shadowOffset[0], y: z.cell.y + timeLag.shadowOffset[1] };
        drawText(shadowLayer, shadowFlyGlyphs, movingBlocks, { ...z, cell: glyphCell, state: lateStates[j]! }, lag, mergedStyle, () => ({ dx: 0, dy: 0, 色: textColor }), () => coldColor);
      });
      drawUnderlay(pixelLayer, shadowLayer);
    }
  }
  return { layers: pixelLayer, glyphScale: mergedStyle.glyphScale, flyGlyphs, shadowFlyGlyphs, movingBlocks, sparks, outlineColor: mergedStyle.outlineColor };
};

/** 铺满画面，放在 position 不是 static 的容器里（如 AbsoluteFill）。行们按 入 从早到晚排 */
export const RuneLyric: React.FC<{ lines: readonly RuneLyricLine[]; 样式: RuneLyricStyle; 收?: number; frame?: number }> = ({ lines, 样式: lyricStyle, 收: fadeOutFrame, frame: frame }) => {
  const current = useSnappedFrame();
  const f = frame ?? current;
  const { width, height } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  const renderWidth = width * filmScale;
  const renderHeight = height * filmScale;
  for (let i = 1; i < lines.length; i++) if (lines[i]!.入 < lines[i - 1]!.入) throw new Error(`歌词「${lines[i]!.text}」的入帧比上一句早`);
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    lines.forEach((_, i) => {
      const r = drawLine(lines, i, f, lyricStyle, renderWidth, renderHeight, fadeOutFrame);
      if (!r) return;
      const shadowRunes = r.shadowFlyGlyphs.map((patch) => patchImage(patch, r.glyphScale, f, null, false));
      const sparks = r.sparks.map((patch) => patchImage(patch, r.glyphScale, f, null, false));
      const runes = r.flyGlyphs.map((patch) => patchImage(patch, r.glyphScale, f, r.outlineColor, true));
      const movingSprites = r.movingBlocks.map((patch) => patchImage(patch, r.glyphScale, f, r.outlineColor, false));
      type PatchImg = ReturnType<typeof patchImage>;
      const drawPatch = (g: PatchImg, c: HTMLCanvasElement) => ctx.drawImage(c, g.x, g.y, g.width, g.height);
      const drawWholeLayer = (c: HTMLCanvasElement) => ctx.drawImage(c, 0, 0, r.layers.width * r.glyphScale, r.layers.height * r.glyphScale);
      // 叠法同都画在一层里：残影的符文 < 火花（只露在空处，先画的那颗在上）< 描边、光圈、残影的字 < 符文和挪着的块的描边 < 符文 < 字和闪圈 < 挪着的块
      for (const g of shadowRunes) drawPatch(g, g.fillPoints);
      for (const g of [...sparks].reverse()) drawPatch(g, g.outline);
      drawWholeLayer(pickDots(r.layers, false));
      for (const g of [...runes, ...movingSprites]) drawPatch(g, g.outline);
      for (const g of runes) drawPatch(g, g.fillPoints);
      drawWholeLayer(pickDots(r.layers, true));
      for (const g of movingSprites) drawPatch(g, g.fillPoints);
    });
  });
  // 预览级（不放大）时画布按一半显示：最近邻缩，字点是奇数时点一格宽一格窄，但边是硬的
  return <canvas ref={ref} width={renderWidth} height={renderHeight} style={{ position: 'absolute', left: 0, top: 0, width, height, pointerEvents: 'none', imageRendering: 'pixelated' }} />;
};
