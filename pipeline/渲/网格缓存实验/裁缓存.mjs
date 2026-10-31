// 用法：node 裁缓存.mjs <全量缓存目录> <mask 所在目录> <输出目录>
// 全量缓存里每条记录按位图只留占到过像素的面（水全留），段[12] 重算；面的先后不变。没进位图的类一面不留。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const [src, maskDir, dst] = process.argv.slice(2);
fs.mkdirSync(dst, { recursive: true });
const idx = JSON.parse(fs.readFileSync(path.join(src, 'idx.json'), 'utf8'));
const masks = JSON.parse(fs.readFileSync(path.join(maskDir, 'mask.json'), 'utf8'));
const bin = fs.openSync(path.join(src, 'bin'), 'r');
const out = fs.openSync(path.join(dst, 'bin'), 'w');
const 类名 = ['实心', '镂空', '实心树叶', '水', '花草'];
const 头 = 308;
const newIdx = {};
let size = 0, 全面 = 0, 留面 = 0, 记录 = 0, 空区段 = 0, 全空 = 0, sampleRaw = 0, sampleGz = 0, cutRaw = 0, cutGz = 0;
const 每类 = Object.fromEntries(类名.map((c) => [c, [0, 0]]));
let n = 0;
for (const [k, [off, len]] of Object.entries(idx)) {
  n++;
  if (!len) { newIdx[k] = [size, 0]; 空区段++; continue; }
  const b = Buffer.allocUnsafe(len);
  fs.readSync(bin, b, 0, len, off);
  const faces = b.readUInt32LE(4);
  const parts = [];
  const h = Buffer.from(b.subarray(0, 头));
  let at = 头;
  let kept = 0;
  类名.forEach((c, i) => {
    const m = 48 + i * 13 * 4;
    const nFaces = b.readUInt32LE(m);
    const 段 = Array.from({ length: 12 }, (_, s) => b.readUInt32LE(m + 4 + s * 4));
    const arrs = [[at, 24], [at + nFaces * 24, 16], [at + nFaces * 40, 32], [at + nFaces * 72, 16]];
    const bits = masks[`${k}|${c}`] ? Buffer.from(masks[`${k}|${c}`], 'base64') : null;
    const on = (f) => c === '水' || (bits && (bits[f >> 3] >> (f & 7)) & 1);
    const list = [];
    const 新段 = [0];
    for (let g = 0; g < 11; g++) {
      for (let f = 段[g]; f < 段[g + 1]; f++) if (on(f)) list.push(f);
      新段.push(list.length);
    }
    h.writeUInt32LE(list.length, m);
    for (let s = 0; s < 12; s++) h.writeUInt32LE(新段[s], m + 4 + s * 4);
    for (const [a, w] of arrs) {
      const o = Buffer.allocUnsafe(list.length * w);
      list.forEach((f, q) => b.copy(o, q * w, a + f * w, a + (f + 1) * w));
      parts.push(o);
    }
    at += nFaces * 88;
    kept += list.length;
    每类[c][0] += nFaces;
    每类[c][1] += list.length;
  });
  h.writeUInt32LE(kept, 4);
  全面 += faces;
  留面 += kept;
  if (!kept) 全空++;
  const rec = Buffer.concat([h, ...parts]);
  fs.writeSync(out, rec, 0, rec.length, size);
  newIdx[k] = [size, rec.length];
  size += rec.length;
  记录++;
  if (n % 40 === 0) {
    sampleRaw += b.length; sampleGz += zlib.gzipSync(b, { level: 6 }).length;
    cutRaw += rec.length; cutGz += zlib.gzipSync(rec, { level: 6 }).length;
  }
}
fs.writeFileSync(path.join(dst, 'idx.json'), JSON.stringify(newIdx));
console.log({ 记录, 空区段, 裁后全空: 全空, 全面, 留面, 比例: 留面 / 全面, 全量MB: fs.fstatSync(bin).size / 1e6, 裁后MB: size / 1e6, 全量gzip比: sampleGz / sampleRaw, 裁后gzip比: cutGz / cutRaw, 每类 });
