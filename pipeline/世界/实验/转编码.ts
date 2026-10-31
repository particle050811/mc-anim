// 实验工具（不接 anim）：现成的地形包 → 试验编码（engine/voxel/区段编码.ts），写到给定目录，不发布、不登记。每个区段转完都用引擎的解码器解一遍，逐格比原来的，对不上就报错。
//   node pipeline/世界/实验/转编码.ts <包目录> <出目录> --法 列间|算术 [--进程 4] [--只块 a.b.块,…]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import zlib from 'node:zlib';
import { 载入体素库 } from '../体素库.ts';
import { 摊开 } from '../烘焙/瘦身.ts';
import { 列间魔数, 算术标记, 色板位数, 解列间区段, 解算术区段 } from '../../../engine/voxel/区段编码.ts';
import type { SectionData } from '../../../engine/voxel/区段包.ts';

const 取值 = (名: string, 缺省?: string) => {
  const i = process.argv.indexOf(名);
  return i >= 0 ? process.argv[i + 1]! : 缺省;
};
const 目录 = process.argv[2]!, 出 = process.argv[3]!;
const 法 = 取值('--法')!;
if (法 !== '列间' && 法 !== '算术') throw new Error('--法 列间|算术');
const 进程 = Number(取值('--进程', '4'));
const 只块 = 取值('--只块')?.split(',');
const 分片 = 取值('--分片');
const 文件们 = fs.readdirSync(目录).filter((f) => f.endsWith('.块')).sort().filter((f) => !只块 || 只块.includes(f));

const 边 = 34, 列数 = 边 * 边;
const 拼 = (...xs: Uint8Array[]) => {
  const o = new Uint8Array(xs.reduce((n, x) => n + x.length, 0));
  let w = 0;
  for (const x of xs) {
    o.set(x, w);
    w += x.length;
  }
  return o;
};
const 字节 = (a: Uint16Array) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
const 高低 = (a: ArrayLike<number>) => {
  const n = a.length, lo = new Uint8Array(n), hi = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    lo[i] = a[i]! & 255;
    hi[i] = a[i]! >> 8;
  }
  return 拼(lo, hi);
};

const 压列间 = (d: SectionData) => {
  const 模 = new Uint8Array(列数), 列始 = new Uint32Array(列数 + 1);
  for (let c = 0; c < 列数; c++) 列始[c + 1] = 列始[c]! + d.runCounts[c]!;
  const 同 = (a: number, b: number) => {
    const n = d.runCounts[a]!;
    if (n !== d.runCounts[b]) return false;
    for (let i = 0; i < n; i++) if (d.paletteIndex[列始[a]! + i] !== d.paletteIndex[列始[b]! + i] || d.runLengths[列始[a]! + i] !== d.runLengths[列始[b]! + i]) return false;
    return true;
  };
  const 数: number[] = [], 号: number[] = [], 长: number[] = [];
  for (let c = 0; c < 列数; c++) {
    if (c % 边 > 0 && 同(c, c - 1)) {
      模[c] = 1;
      continue;
    }
    if (c >= 边 && 同(c, c - 边)) {
      模[c] = 2;
      continue;
    }
    数.push(d.runCounts[c]!);
    for (let i = 列始[c]!; i < 列始[c + 1]!; i++) {
      号.push(d.paletteIndex[i]!);
      长.push(d.runLengths[i]!);
    }
  }
  const 头 = new Uint8Array(24), v = new DataView(头.buffer);
  v.setUint32(0, 列间魔数, true);
  v.setInt32(4, d.kBottom, true);
  v.setUint32(8, d.nz, true);
  v.setUint32(12, d.palette.length / 2, true);
  v.setUint32(16, 数.length, true);
  v.setUint32(20, 号.length, true);
  return zlib.gzipSync(拼(头, 字节(d.palette), 模, 高低(数), 高低(号), 高低(长)), { level: 6 });
};

// 区间编码器照 LZMA（量压缩.mts 的 编）；第一个输出字节恒为 0，不存
class 编 {
  low = 0;
  range = 0xffffffff;
  cache = 0;
  cacheSize = 1;
  out: number[] = [];
  shift() {
    if (this.low < 0xff000000 || this.low >= 0x100000000) {
      const carry = this.low >= 0x100000000 ? 1 : 0;
      let t = this.cache;
      do {
        this.out.push((t + carry) & 255);
        t = 255;
      } while (--this.cacheSize);
      this.cache = Math.floor(this.low / 0x1000000) & 255;
    }
    this.cacheSize++;
    this.low = (this.low % 0x1000000) * 256;
  }
  bit(ps: Uint16Array, i: number, b: number) {
    const p = ps[i]!, bound = (this.range >>> 11) * p;
    if (!b) {
      this.range = bound;
      ps[i] = p + ((2048 - p) >> 4);
    } else {
      this.low += bound;
      this.range -= bound;
      ps[i] = p - (p >> 4);
    }
    while (this.range < 0x1000000) {
      this.range *= 256;
      this.shift();
    }
    return b;
  }
  完() {
    for (let i = 0; i < 5; i++) this.shift();
    return Uint8Array.from(this.out).subarray(1);
  }
}
const 压算术 = (d: SectionData, vox: Uint16Array) => {
  const nz = d.nz, 色板项 = d.palette.length / 2;
  const 头 = new Uint8Array(7), v = new DataView(头.buffer);
  头[0] = 算术标记;
  v.setUint16(1, nz, true);
  v.setInt16(3, d.kBottom, true);
  v.setUint16(5, 色板项, true);
  const p1 = new Uint16Array(128).fill(1024), p2 = new Uint16Array(128).fill(1024), p3 = new Uint16Array(128).fill(1024);
  const 位 = 色板位数(色板项), 树 = new Uint16Array(1 << 位).fill(1024);
  const rc = new 编();
  let 上次错 = 0;
  for (let c = 0; c < 列数; c++) {
    const 有W = c % 边 > 0, 有N = c >= 边;
    for (let k = nz - 1; k >= 0; k--) {
      const a = k * 列数 + c, 顶 = k === nz - 1;
      const w = 有W ? vox[a - 1]! : 有N ? vox[a - 边]! : 0;
      const n = 有N ? vox[a - 边]! : w;
      const u = 顶 ? w : vox[a + 列数]!;
      const w变 = !顶 && 有W && w !== vox[a + 列数 - 1]! ? 1 : 0;
      const n变 = !顶 && 有N && n !== vox[a + 列数 - 边]! ? 2 : 0;
      const ctx = w变 | n变 | (w === u ? 4 : 0) | (n === u ? 8 : 0) | (w === n ? 16 : 0) | (上次错 << 5) | (u === 0 ? 64 : 0);
      const x = vox[a]!;
      if (!rc.bit(p1, ctx, x === u ? 0 : 1)) {
        上次错 = 0;
        continue;
      }
      上次错 = 1;
      if (w !== u && !rc.bit(p2, ctx, x === w ? 0 : 1)) continue;
      if (n !== u && n !== w && !rc.bit(p3, ctx, x === n ? 0 : 1)) continue;
      let m = 1;
      for (let i = 位 - 1; i >= 0; i--) m = (m << 1) | rc.bit(树, m, (x >> i) & 1);
    }
  }
  return 拼(头, 字节(d.palette), rc.完());
};

const 同数组 = (a: Uint16Array, b: Uint16Array) => a.length === b.length && Buffer.compare(字节(a), 字节(b)) === 0;

if (分片) {
  const [me, n] = 分片.split('/').map(Number) as [number, number];
  const 库 = await 载入体素库();
  const P = 库.区段包;
  let 区段 = 0, 旧总 = 0, 新总 = 0, 解毫秒 = 0;
  for (let fi = 0; fi < 文件们.length; fi++) {
    if (fi % n !== me) continue;
    const 名 = 文件们[fi]!;
    const buf = fs.readFileSync(path.join(目录, 名));
    const 头 = P.decodeTileHeader(new Uint8Array(buf.subarray(0, P.tileHeaderLen)));
    const [ti, tj] = 名.split('.').map(Number) as [number, number];
    const 新索引 = new Uint32Array(2 * P.tileEntryCount);
    let off = P.tileHeaderLen;
    const 块们: Uint8Array[] = [];
    for (let slot = 0; slot < P.tileEntryCount; slot++) {
      const len = 头[2 * slot + 1]!;
      if (!len) continue;
      const g = buf.subarray(头[2 * slot]!, 头[2 * slot]! + len);
      const d = P.decodeSection(zlib.gunzipSync(g));
      const id = P.sectionAtIndex(ti, tj, slot);
      const vox = 摊开(d);
      let 压: Uint8Array;
      if (法 === '列间') {
        压 = 压列间(d);
        const raw = new Uint8Array(zlib.gunzipSync(压));
        const t = performance.now();
        const 解 = 解列间区段(raw, id);
        解毫秒 += performance.now() - t;
        if (!同数组(摊开(解), vox) || !同数组(解.palette, d.palette) || 解.kBottom !== d.kBottom || 解.nz !== d.nz) throw new Error(`${名} 第 ${slot} 项列间解回来不一样`);
      } else {
        压 = 压算术(d, vox);
        const t = performance.now();
        const 解 = 解算术区段(压, id);
        解毫秒 += performance.now() - t;
        if (!同数组(解.vox, vox) || !同数组(摊开(解.data), vox) || !同数组(解.data.palette, d.palette) || 解.data.kBottom !== d.kBottom || 解.data.nz !== d.nz) throw new Error(`${名} 第 ${slot} 项算术解回来不一样`);
      }
      新索引[2 * slot] = off;
      新索引[2 * slot + 1] = 压.length;
      off += 压.length;
      块们.push(压);
      区段++;
      旧总 += len;
      新总 += 压.length;
    }
    const fd = fs.openSync(path.join(出, 名), 'w');
    fs.writeSync(fd, P.encodeTileHeader(ti, tj, 新索引));
    for (const x of 块们) fs.writeSync(fd, x);
    fs.closeSync(fd);
  }
  console.log(`分片 ${me}：${区段} 个区段，${(旧总 / 1e6).toFixed(1)} → ${(新总 / 1e6).toFixed(1)} MB，全部解回来核对过；解码 ${(解毫秒 / Math.max(1, 区段)).toFixed(3)} 毫秒/区段`);
} else {
  fs.mkdirSync(出, { recursive: true });
  for (const f of ['包.json', '缺失.tsv']) if (fs.existsSync(path.join(目录, f))) fs.copyFileSync(path.join(目录, f), path.join(出, f));
  const t0 = Date.now();
  const 参数 = ['--法', 法, ...(只块 ? ['--只块', 只块.join(',')] : [])];
  await Promise.all(
    Array.from({ length: 进程 }, (_, me) =>
      new Promise<void>((ok, no) => {
        const p = spawn('nice', ['-n', '15', process.execPath, fileURLToPath(import.meta.url), 目录, 出, ...参数, '--分片', `${me}/${进程}`], { stdio: 'inherit' });
        p.on('exit', (c) => (c ? no(new Error(`分片 ${me} 退出码 ${c}`)) : ok()));
      }),
    ),
  );
  const 大小 = (d: string) => fs.readdirSync(d).filter((f) => 文件们.includes(f)).reduce((s, f) => s + fs.statSync(path.join(d, f)).size, 0);
  const 全 = (d: string) => fs.readdirSync(d).reduce((s, f) => s + fs.statSync(path.join(d, f)).size, 0);
  console.log(`${文件们.length} 个块文件：旧 ${(大小(目录) / 1e6).toFixed(1)} MB → 新 ${(大小(出) / 1e6).toFixed(1)} MB（${((大小(出) / 大小(目录)) * 100).toFixed(1)}%）；连包.json 总 ${(全(出) / 1e6).toFixed(1)} MB；${((Date.now() - t0) / 1000).toFixed(1)} 秒，${进程} 个进程`);
}
