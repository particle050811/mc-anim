// anim diff 的比法和出图（用户 11-17 同意做）：两份代码、两组参数出的同一帧差多少。数和 verify、reuse 同一套（比较.ts 的块平均差，verify/阈值.toml 的门槛），不另起门槛。
// 差多少一律给数，不靠眼判：有一次 Agent 判「看不出」，那 7 个色阶正是用户指的那条线。
// 挑窗口：三档窗口的块差各除以自己那档的门槛，最大的先挑；望远框会和已挑的重叠的不再挑，每块给一条 anim still --tele 原生复查（裁图放大不能当证据）。
// 并排图 旧｜新｜差：每格缩到不超过 格宽；差图带符号，红是亮了、蓝是暗了、绿是亮度差不多但颜色变了；缩小时每格取差最大的那个像素，零星的差不会被平均掉。
import { encode } from 'fast-png';
import { TileEdge, diffIntegral, judgeBlockDiff, windowSum, type Threshold } from './比较.ts';
import { rgbFrameDiff, type FrameDiff } from './帧差.ts';

export type BlockThreshold = Pick<Threshold, 'block8Threshold' | 'block16Threshold' | 'block64Threshold' | 'glanceThreshold'>;

export const edgeThreshold = (t: BlockThreshold, w: TileEdge) => (w === 8 ? t.block8Threshold : w === 16 ? t.block16Threshold : t.block64Threshold);

export type TeleRect = { x: number; y: number; width: number; height: number };
/** 一个差得多的窗口：edge×edge 的块左上角 (x, y)，块差 diff（级），ratio = diff ÷ 这档门槛；meanRgb 是窗口里 新 − 旧 各通道的平均（带符号）；tele 是以它为中心的望远框 */
export type Hotspot = { edge: TileEdge; x: number; y: number; diff: number; ratio: number; meanRgb: [number, number, number]; tele: TeleRect };
/** 按窗口边长铺满整帧（不重叠）的块里，块差超过这档门槛的有几块 */
export type TileCount = Record<TileEdge, { over: number; total: number }>;
export type PairAnalysis = { frame: FrameDiff; tiles: TileCount; hotspots: Hotspot[] };

/** 以 (cx, cy) 为中心、放大 zoom 倍的望远框，夹在画面里；宽取整，高照画面宽高比（和 parseTelescope 一样算） */
export const teleRect = (cx: number, cy: number, width: number, height: number, zoom: number): TeleRect => {
  const w = Math.max(1, Math.min(width, Math.round(width / zoom)));
  const h = (w * height) / width;
  const clamp = (v: number, hi: number) => Math.min(Math.max(0, v), Math.max(0, hi));
  return { x: clamp(Math.round(cx - w / 2), width - w), y: clamp(Math.round(cy - h / 2), Math.floor(height - h)), width: w, height: h };
};

/** 一对帧的全部数：帧差（差像素几档、最大差、块平均差、门槛下的判法），每档超门槛的块数，差得最多的几个窗口 */
export const analyzePair = (newRgb: Buffer, oldRgb: Buffer, width: number, height: number, threshold: BlockThreshold, o: { hotspots?: number; zoom?: number } = {}): PairAnalysis => {
  const integral = diffIntegral(newRgb, oldRgb, width, height);
  const frame = rgbFrameDiff(newRgb, oldRgb, width, height, threshold, integral);
  const { cellWidth, cellRows } = integral;
  const tiles = {} as TileCount;
  const maps: { edge: TileEdge; k: number; cols: number; rows: number; score: Float32Array }[] = [];
  for (const w of TileEdge) {
    const k = w / 4;
    const thr = edgeThreshold(threshold, w);
    const rows = cellRows - k + 1, cols = cellWidth - k + 1;
    tiles[w] = { over: 0, total: 0 };
    if (rows <= 0 || cols <= 0) continue;
    const score = new Float32Array(rows * cols);
    if (frame.over[0])
      for (let i = 0; i < rows; i++)
        for (let j = 0; j < cols; j++) {
          let m = 0;
          for (let c = 0; c < 3; c++) m = Math.max(m, Math.abs(windowSum(integral, i, j, k, c)));
          score[i * cols + j] = m / (w * w) / thr;
        }
    for (let i = 0; i < rows; i += k)
      for (let j = 0; j < cols; j += k) {
        tiles[w].total++;
        if (score[i * cols + j]! > 1) tiles[w].over++;
      }
    maps.push({ edge: w, k, cols, rows, score });
  }
  const hotspots: Hotspot[] = [];
  const zoom = o.zoom ?? 8;
  for (let n = 0; n < (o.hotspots ?? 5) && frame.over[0]; n++) {
    let best: (typeof maps)[number] | null = null;
    let bestIdx = 0, bestScore = 0;
    for (const m of maps) {
      const sc = m.score;
      for (let idx = 0; idx < sc.length; idx++) if (sc[idx]! > bestScore) [best, bestIdx, bestScore] = [m, idx, sc[idx]!];
    }
    if (!best) break;
    const [m, idx] = [best, bestIdx];
    const [i, j] = [Math.floor(idx / m.cols), idx % m.cols];
    const [x, y] = [j * 4, i * 4];
    const ratio = m.score[idx]!;
    const meanRgb = [0, 1, 2].map((c) => windowSum(integral, i, j, m.k, c) / (m.edge * m.edge)) as [number, number, number];
    const tele = teleRect(x + m.edge / 2, y + m.edge / 2, width, height, zoom);
    hotspots.push({ edge: m.edge, x, y, diff: ratio * edgeThreshold(threshold, m.edge), ratio, meanRgb, tele });
    // 以它为中心的望远框会和这个框重叠的窗口都不再挑（中心离得不到一个框宽、框高）：每条复查命令看的是不同的地方
    const [cx, cy] = [tele.x + tele.width / 2, tele.y + tele.height / 2];
    for (const s of maps) {
      const half = s.edge / 2;
      const j0 = Math.max(0, Math.ceil((cx - tele.width - half) / 4)), j1 = Math.min(s.cols - 1, Math.floor((cx + tele.width - half) / 4));
      const i0 = Math.max(0, Math.ceil((cy - tele.height - half) / 4)), i1 = Math.min(s.rows - 1, Math.floor((cy + tele.height - half) / 4));
      for (let a = i0; a <= i1; a++) s.score.fill(0, a * s.cols + j0, a * s.cols + j1 + 1);
    }
  }
  return { frame, tiles, hotspots };
};

/** 两边字节一样（不用解码）时的数：全是 0，块总数照尺寸算 */
export const identicalAnalysis = (width: number, height: number, threshold: BlockThreshold): PairAnalysis => {
  const [cellWidth, cellRows] = [Math.floor(width / 4), Math.floor(height / 4)];
  const tiles = {} as TileCount;
  const block = {} as FrameDiff['block'];
  for (const w of TileEdge) {
    const k = w / 4;
    const [rows, cols] = [cellRows - k + 1, cellWidth - k + 1];
    tiles[w] = { over: 0, total: rows > 0 && cols > 0 ? Math.ceil(rows / k) * Math.ceil(cols / k) : 0 };
    block[w] = { 差: 0, x: 0, y: 0 };
  }
  return { frame: { pixelCount: width * height, over: { 0: 0, 8: 0, 32: 0 }, maxDiff: 0, block, verdict: judgeBlockDiff(block, threshold) }, tiles, hotspots: [] };
};

/** 窗口的差是亮了还是暗了：三通道平均差的符号；平均差不到最大那个通道的三分之一（各通道一涨一跌、互相抵掉）算「颜色变了」 */
export const hotspotDirection = (h: Pick<Hotspot, 'meanRgb'>) => {
  const mean = (h.meanRgb[0] + h.meanRgb[1] + h.meanRgb[2]) / 3;
  const peak = Math.max(...h.meanRgb.map(Math.abs));
  return Math.abs(mean) * 3 >= peak ? (mean > 0 ? '亮了' : '暗了') : '颜色变了';
};

// ---------- 并排图 ----------

/** 框的颜色按名次轮换（避开差图用的红、蓝、绿） */
export const boxColors: { name: string; rgb: readonly [number, number, number] }[] = [
  { name: '黄', rgb: [255, 220, 0] },
  { name: '白', rgb: [255, 255, 255] },
  { name: '橙', rgb: [255, 140, 0] },
  { name: '青', rgb: [0, 230, 230] },
  { name: '粉', rgb: [255, 120, 200] },
];

// 3×5 点阵数字，标框的名次
const digitGlyphs = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];

const panelGap = 8;
const gapGrey = 64;

export type PanelOptions = { panelWidth?: number; gain?: number };

/** 缩小的倍数：每格宽不超过 格宽 */
export const panelScale = (width: number, panelWidth: number) => Math.max(1, Math.ceil(width / panelWidth));

/**
 * 旧｜新｜差 横排一张 rgb24：每格缩 panelScale 倍（旧、新取块平均，差取块里差最大的像素），格间留 8 像素灰缝。
 * 差图：底是旧图亮度的 15%，差的像素按 最大通道差 × 增益 上色，红 = 亮了、蓝 = 暗了、绿 = 颜色变了亮度差不多（判法同 hotspotDirection）。
 * 每个窗口的望远框在三格上都画框、左上角标名次
 */
export const diffPanel = (newRgb: Buffer, oldRgb: Buffer, width: number, height: number, hotspots: readonly Hotspot[], o: PanelOptions = {}) => {
  const f = panelScale(width, o.panelWidth ?? 1920);
  const gain = o.gain ?? 8;
  const pw = Math.floor(width / f), ph = Math.floor(height / f);
  const W = pw * 3 + panelGap * 2;
  const out = Buffer.alloc(W * ph * 3, gapGrey);
  const area = f * f;
  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      let or = 0, og = 0, ob = 0, nr = 0, ng = 0, nb = 0, peak = 0, pr = 0, pg = 0, pb = 0;
      for (let dy = 0; dy < f; dy++) {
        let i = ((py * f + dy) * width + px * f) * 3;
        for (let dx = 0; dx < f; dx++, i += 3) {
          const a0 = oldRgb[i]!, a1 = oldRgb[i + 1]!, a2 = oldRgb[i + 2]!, b0 = newRgb[i]!, b1 = newRgb[i + 1]!, b2 = newRgb[i + 2]!;
          or += a0; og += a1; ob += a2; nr += b0; ng += b1; nb += b2;
          const d0 = b0 - a0, d1 = b1 - a1, d2 = b2 - a2;
          const m = Math.max(Math.abs(d0), Math.abs(d1), Math.abs(d2));
          if (m > peak) { peak = m; pr = d0; pg = d1; pb = d2; }
        }
      }
      const o0 = (py * W + px) * 3, o1 = o0 + (pw + panelGap) * 3, o2 = o1 + (pw + panelGap) * 3;
      out[o0] = Math.round(or / area); out[o0 + 1] = Math.round(og / area); out[o0 + 2] = Math.round(ob / area);
      out[o1] = Math.round(nr / area); out[o1 + 1] = Math.round(ng / area); out[o1 + 2] = Math.round(nb / area);
      const base = Math.round(((or + og + ob) / 3 / area) * 0.15);
      let r = base, g = base, b = base;
      if (peak) {
        const v = Math.min(255, Math.max(base, Math.round(peak * gain)));
        const mean = (pr + pg + pb) / 3;
        if (Math.abs(mean) * 3 < peak) g = v; // 颜色变了、亮度差不多（判法同 hotspotDirection）
        else if (mean > 0) r = v;
        else { b = v; g = Math.max(base, Math.round(v * 0.45)); } // 纯蓝在暗底上看不清，掺点绿成天蓝
      }
      out[o2] = r; out[o2 + 1] = g; out[o2 + 2] = b;
    }
  }
  const setPixel = (x: number, y: number, rgb: readonly number[]) => {
    if (x < 0 || y < 0 || x >= W || y >= ph) return;
    const o3 = (y * W + x) * 3;
    out[o3] = rgb[0]!; out[o3 + 1] = rgb[1]!; out[o3 + 2] = rgb[2]!;
  };
  for (const [n, h] of hotspots.entries()) {
    const rgb = boxColors[n % boxColors.length]!.rgb;
    const x0 = Math.floor(h.tele.x / f), y0 = Math.floor(h.tele.y / f);
    const x1 = Math.min(pw - 1, Math.ceil((h.tele.x + h.tele.width) / f)), y1 = Math.min(ph - 1, Math.ceil((h.tele.y + h.tele.height) / f));
    for (let p = 0; p < 3; p++) {
      const ox = p * (pw + panelGap);
      for (let t = 0; t < 2; t++) {
        for (let x = x0; x <= x1; x++) for (const y of [y0 + t, y1 - t]) setPixel(ox + x, y, rgb);
        for (let y = y0; y <= y1; y++) for (const x of [x0 + t, x1 - t]) setPixel(ox + x, y, rgb);
      }
      // 名次标在框左上角里面：3×5 点阵放大 4 倍，带黑底
      const label = String(n + 1);
      const s = 4;
      for (let y = 0; y < 5 * s + 4; y++) for (let x = 0; x < label.length * 4 * s + 2; x++) if (x0 + 2 + x <= x1 && y0 + 2 + y <= y1) setPixel(ox + x0 + 2 + x, y0 + 2 + y, [0, 0, 0]);
      for (const [ci, ch] of [...label].entries()) {
        const g = digitGlyphs[Number(ch)]!;
        for (let gy = 0; gy < 5; gy++)
          for (let gx = 0; gx < 3; gx++)
            if (g[gy * 3 + gx] === '1') for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) setPixel(ox + x0 + 4 + ci * 4 * s + gx * s + xx, y0 + 4 + gy * s + yy, rgb);
      }
    }
  }
  return { rgb: out, width: W, height: ph, scale: f };
};

export const encodePng = (rgb: Buffer, width: number, height: number) => encode({ width, height, data: new Uint8Array(rgb.buffer, rgb.byteOffset, rgb.length), channels: 3, depth: 8 });
