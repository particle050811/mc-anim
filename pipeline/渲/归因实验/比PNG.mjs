// 用法：node 比PNG.mjs <静帧输出目录>：每例每帧，以 现状-1 为基准，比各轮 PNG：字节是否全同；不同的解码后算不同像素数、最大差、PSNR、16×9 块均值最大差。归因实验用，不合并。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const 根 = process.argv[2];
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 12);
const 解 = (f) => {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'json', f]));
  const { width: w, height: h } = j.streams[0];
  const b = execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 28 });
  return { w, h, b };
};
const 比 = (a, b) => {
  const A = 解(a), B = 解(b);
  let n = 0, mx = 0, se = 0;
  const bw = 16, bh = 9;
  const sa = new Float64Array(bw * bh), sb = new Float64Array(bw * bh), c = new Float64Array(bw * bh);
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
    const i = (y * A.w + x) * 3, k = Math.floor(y * bh / A.h) * bw + Math.floor(x * bw / A.w);
    let d = false;
    for (let ch = 0; ch < 3; ch++) { const e = Math.abs(A.b[i + ch] - B.b[i + ch]); if (e) { d = true; se += e * e; if (e > mx) mx = e; } sa[k] += A.b[i + ch]; sb[k] += B.b[i + ch]; c[k]++; }
    if (d) n++;
  }
  let bm = 0;
  for (let k = 0; k < bw * bh; k++) bm = Math.max(bm, Math.abs(sa[k] - sb[k]) / c[k]);
  const psnr = se ? 10 * Math.log10(255 * 255 * A.w * A.h * 3 / se) : Infinity;
  return `像素差 ${n}（${(n / (A.w * A.h) * 100).toFixed(3)}%），最大 ${mx}，PSNR ${psnr.toFixed(1)} dB，块均值最大差 ${bm.toFixed(3)}`;
};
for (const 例 of fs.readdirSync(根).filter((x) => fs.statSync(path.join(根, x)).isDirectory()).sort()) {
  const d = path.join(根, 例);
  const 轮们 = fs.readdirSync(d).filter((x) => /^(现状|批量)-\d+$/.test(x)).sort();
  const 基 = 轮们.find((x) => x.startsWith('现状'));
  if (!基) continue;
  console.log(`\n== ${例}（基准 ${基}）`);
  for (const png of fs.readdirSync(path.join(d, 基)).filter((x) => x.endsWith('.png')).sort()) {
    const s0 = sha(path.join(d, 基, png));
    for (const 轮 of 轮们) {
      if (轮 === 基) continue;
      const f = path.join(d, 轮, png);
      if (!fs.existsSync(f)) { console.log(png, 轮, '缺'); continue; }
      const s = sha(f);
      console.log(png.padEnd(36), 轮.padEnd(8), s === s0 ? '字节全同' : `字节不同：${比(path.join(d, 基, png), f)}`);
    }
  }
}
