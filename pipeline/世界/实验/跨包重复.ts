// 实验工具（不接 anim）：两个包里同一片地（按游戏坐标对齐）的区段有多少内容一样。状态、群系号是各包自己的，换成名字再比。
//   node pipeline/世界/实验/跨包重复.ts <包A> <包B> [--抽样 8]
// 原点差不是区段边长的倍数的级，对不齐，算不重复。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { 载入体素库 } from '../体素库.ts';
import type { 包信息, SectionData } from '../../../engine/voxel/区段包.ts';

const A = process.argv[2]!, B = process.argv[3]!;
const i抽样 = process.argv.indexOf('--抽样');
const 抽样 = i抽样 >= 0 ? Number(process.argv[i抽样 + 1]) : 8;
const 库 = await 载入体素库();
const P = 库.区段包;
const 读信息 = (d: string) => JSON.parse(fs.readFileSync(path.join(d, '包.json'), 'utf8')) as 包信息;
const ia = 读信息(A), ib = 读信息(B);
const 规范 = (d: SectionData, i: 包信息) => {
  const pal: string[] = [];
  for (let p = 0; p < d.palette.length / 2; p++) pal.push(`${i.状态[d.palette[2 * p]!]}|${i.群系[d.palette[2 * p + 1]!] ?? ''}`);
  return `${d.kBottom},${d.nz}|${pal.join(';')}|${Buffer.from(d.runCounts.buffer, d.runCounts.byteOffset, d.runCounts.byteLength).toString('latin1')}|${Buffer.from(d.paletteIndex.buffer, d.paletteIndex.byteOffset, d.paletteIndex.byteLength).toString('latin1')}|${Buffer.from(d.runLengths.buffer, d.runLengths.byteOffset, d.runLengths.byteLength).toString('latin1')}`;
};
const 头们 = new Map<string, Uint32Array | null>();
const 取B = (L: number, i: number, j: number) => {
  const { ti, tj, slot } = P.sectionInTile({ L, i, j });
  const f = path.join(B, P.tileFileName(ti, tj));
  if (!头们.has(f)) 头们.set(f, fs.existsSync(f) ? P.decodeTileHeader(new Uint8Array(fs.readFileSync(f).subarray(0, P.tileHeaderLen))) : null);
  const 头 = 头们.get(f);
  if (!头 || !头[2 * slot + 1]) return null;
  const fd = fs.openSync(f, 'r');
  const buf = Buffer.alloc(头[2 * slot + 1]!);
  fs.readSync(fd, buf, 0, buf.length, 头[2 * slot]!);
  fs.closeSync(fd);
  return { d: P.decodeSection(zlib.gunzipSync(buf)), len: buf.length };
};
const dx = ia.原点[0] - ib.原点[0], dy = ib.原点[2] - ia.原点[2];
console.log(`原点 A ${ia.原点} B ${ib.原点}，场景差 (${dx}, ${dy})，高度原点差 ${ia.原点[1] - ib.原点[1]}`);
const 累 = { 区段: 0, 字节: 0, 对得上: 0, 对得上字节: 0, 相同: 0, 相同字节: 0 };
let 序 = 0;
for (const 名 of fs.readdirSync(A).filter((f) => f.endsWith('.块'))) {
  const buf = fs.readFileSync(path.join(A, 名));
  const 头 = P.decodeTileHeader(new Uint8Array(buf.subarray(0, P.tileHeaderLen)));
  const [ti, tj] = 名.split('.').map(Number) as [number, number];
  for (let slot = 0; slot < P.tileEntryCount; slot++) {
    const len = 头[2 * slot + 1]!;
    if (!len || ++序 % 抽样) continue;
    const id = P.sectionAtIndex(ti, tj, slot);
    累.区段++;
    累.字节 += len;
    const 边 = 32 * 2 ** id.L;
    if (dx % 边 || dy % 边) continue;
    const b = 取B(id.L, id.i + dx / 边, id.j + dy / 边);
    if (!b) continue;
    累.对得上++;
    累.对得上字节 += len;
    const a = P.decodeSection(zlib.gunzipSync(buf.subarray(头[2 * slot]!, 头[2 * slot]! + len)));
    if (规范(a, ia) === 规范(b.d, ib)) {
      累.相同++;
      累.相同字节 += len;
    }
  }
}
console.log(累);
console.log(`抽样 1/${抽样}：A 的字节里 ${(累.对得上字节 / 累.字节 * 100).toFixed(1)}% 在 B 有同位置区段，${(累.相同字节 / 累.字节 * 100).toFixed(1)}% 内容完全相同`);
