// 用法：node 像素比.mjs <a.mkv> <b.mkv> [差异图前缀]：逐帧比 yuv→rgb24，报不同像素数、最大差、PSNR；第一帧差异图（放大差 ×16）写 png
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const require_write = (rows) => writeFileSync(process.env.ZHF, rows.map((r) => JSON.stringify(r)).join('\n'));
const [a, b, png] = process.argv.slice(2);
const W = 2560, H = 1440, F = W * H * 3;
const open = (f) => spawn('ffmpeg', ['-v', 'error', '-i', f, '-map', '0:v', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { stdio: ['ignore', 'pipe', 'inherit'] }).stdout;
const reader = (s) => {
  const it = s[Symbol.asyncIterator]();
  let buf = Buffer.alloc(0), ended = false;
  return async () => {
    while (buf.length < F && !ended) {
      const r = await it.next();
      if (r.done) ended = true;
      else buf = buf.length ? Buffer.concat([buf, r.value]) : r.value;
    }
    if (buf.length < F) return null;
    const out = buf.subarray(0, F);
    buf = buf.subarray(F);
    return out;
  };
};
const ra = reader(open(a)), rb = reader(open(b));
let i = 0, tot = 0, wrote = false;
const rows = [];
for (;;) {
  const [x, y] = await Promise.all([ra(), rb()]);
  if (!x || !y) break;
  let n = 0, mx = 0, se = 0, big = 0;
  const hist = new Uint32Array(256);
  for (let p = 0; p < F; p += 3) {
    const d0 = Math.abs(x[p] - y[p]), d1 = Math.abs(x[p + 1] - y[p + 1]), d2 = Math.abs(x[p + 2] - y[p + 2]);
    const d = Math.max(d0, d1, d2);
    if (d) {
      n++;
      if (d > mx) mx = d;
      if (d > 16) big++;
      se += d0 * d0 + d1 * d1 + d2 * d2;
    }
  }
  const psnr = se ? 10 * Math.log10((255 * 255 * F) / se) : Infinity;
  rows.push({ 帧: i, 不同像素: n, 差大于16: big, 最大差: mx, psnr: +psnr.toFixed(2) });
  tot += n;
  if (png && n && !wrote) {
    wrote = true;
    const d = Buffer.alloc(F);
    for (let p = 0; p < F; p++) d[p] = Math.min(255, Math.abs(x[p] - y[p]) * 16);
    const c = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-i', '-', '-frames:v', '1', `${png}-差.png`], { stdio: ['pipe', 'inherit', 'inherit'] });
    c.stdin.end(d);
  }
  i++;
}
const med = (k) => rows.map((r) => r[k]).sort((p, q) => p - q)[rows.length >> 1];
console.log(JSON.stringify({ 帧数: i, 有差帧: rows.filter((r) => r.不同像素).length, 中位不同像素: med('不同像素'), 中位差大于16: med('差大于16'), 最大差: Math.max(...rows.map((r) => r.最大差)), 最低psnr: Math.min(...rows.map((r) => r.psnr)), 中位psnr: med('psnr') }));
if (process.env.ZHF) require_write(rows);
if (rows.length <= 12) for (const r of rows) console.log(JSON.stringify(r));
