// 实验工具（不接 anim）：两个包打同样的射线比外面看得见的东西。给第 2 档（封闭空洞填实）用，它的网格变了，逐字节比不了；第 0 档也能跑，算另一条独立的核对。
//   node pipeline/世界/实验/核对视线.ts <旧包> <新包> [--只块 …] [--每块 200000] [--级 0] [--挖框 <json>] [--种子 1]
// 起点：随机一列最高的方块上面 1～40 格（一定在露天），方向：水平任意、仰角 −90°～+60°（俯看、平看、仰看浮空岛底）。
// 一条射线沿途每个非空气格记（状态号, 群系号），到第一个整格不透明的方块为止（含它）；出了这一块就停。区段 k底 以下当实心，同引擎。两包的序列要一样。
// 带 --挖框 时查询前先按挖框把 AABB 里的格当空气（只支持不带 留 的框，带 留 的框忽略），模拟挖开后往洞里看。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { 载入体素库 } from '../体素库.ts';
import { 摊开 } from '../烘焙/瘦身.ts';
import type { 包信息, SectionData } from '../../../engine/voxel/区段包.ts';

const 取值 = (名: string, 缺省?: string) => {
  const i = process.argv.indexOf(名);
  return i >= 0 ? process.argv[i + 1]! : 缺省;
};
const 旧目录 = process.argv[2]!, 新目录 = process.argv[3]!;
const 只块 = 取值('--只块')?.split(',');
const 每块 = Number(取值('--每块', '200000'));
const L = Number(取值('--级', '0'));
const 挖框文件 = 取值('--挖框');
let 种 = Number(取值('--种子', '1')) >>> 0;
const 随机 = () => {
  种 = (种 + 0x6d2b79f5) >>> 0;
  let t = Math.imul(种 ^ (种 >>> 15), 种 | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const 库 = await 载入体素库();
const P = 库.区段包;
const 信息 = JSON.parse(fs.readFileSync(path.join(旧目录, '包.json'), 'utf8')) as 包信息;
const [ox, , oz] = 信息.原点;
const 值 = Uint16Array.from(信息.状态, (s) => 库.方块表.voxelFromState(s));
const { full } = 库.方块表.blockProps;
const 文件们 = fs.readdirSync(新目录).filter((f) => f.endsWith('.块')).sort().filter((f) => !只块 || 只块.includes(f));
const 挖盒: number[][] = 挖框文件
  ? (JSON.parse(fs.readFileSync(挖框文件, 'utf8')).cutouts as { from: number[]; to: number[]; 留?: string[] }[])
      .filter((c) => !c.留)
      .map((c) => [c.from[0]! - ox, oz - 1 - c.to[2]!, c.from[1]! - 信息.原点[1], c.to[0]! + 1 - ox, oz - c.from[2]!, c.to[1]! + 1 - 信息.原点[1]])
  : [];

const 格 = 2 ** L, 边 = 32;
type 区 = { d: SectionData; vox: Uint16Array };
class 包读 {
  头 = new Map<string, Uint32Array | null>();
  区们 = new Map<string, 区 | null>();
  块们 = new Map<string, Buffer>();
  dir: string;
  constructor(dir: string) {
    this.dir = dir;
  }
  区(i: number, j: number): 区 | null {
    const k = `${i},${j}`;
    let v = this.区们.get(k);
    if (v !== undefined) return v;
    const { ti, tj, slot } = P.sectionInTile({ L, i, j });
    const 名 = P.tileFileName(ti, tj);
    let buf = this.块们.get(名);
    if (!buf && !this.块们.has(名)) {
      const f = path.join(this.dir, 名);
      if (fs.existsSync(f)) buf = fs.readFileSync(f);
      if (this.块们.size > 3) this.块们.clear();
      this.块们.set(名, buf!);
    }
    v = null;
    if (buf) {
      const 头 = (this.头.get(名) ?? (this.头.set(名, P.decodeTileHeader(new Uint8Array(buf.subarray(0, P.tileHeaderLen)))), this.头.get(名)))!;
      const len = 头[2 * slot + 1]!;
      if (len) {
        const d = P.decodeSection(zlib.gunzipSync(buf.subarray(头[2 * slot]!, 头[2 * slot]! + len)));
        v = { d, vox: 摊开(d) };
      }
    }
    if (this.区们.size > 400) this.区们.clear();
    this.区们.set(k, v);
    return v;
  }
  // 绝对格 (x, y, k)。返回：-1 没区段；-2 k底以下（当实心）；否则 状态号 * 65536 + 群系号（空气是 0 号状态）
  取(x: number, y: number, k: number): number {
    const i = Math.floor(x / 边), j = Math.floor(y / 边);
    const s = this.区(i, j);
    if (!s) return -1;
    if (k < s.d.kBottom) return -2;
    if (k >= s.d.kBottom + s.d.nz) return 0;
    const c = (y - j * 边 + 1) * 34 + (x - i * 边 + 1);
    const p = s.vox[(k - s.d.kBottom) * 1156 + c]!;
    return s.d.palette[2 * p]! * 65536 + s.d.palette[2 * p + 1]!;
  }
  顶(x: number, y: number): number | null {
    const i = Math.floor(x / 边), j = Math.floor(y / 边);
    const s = this.区(i, j);
    if (!s) return null;
    const c = (y - j * 边 + 1) * 34 + (x - i * 边 + 1);
    for (let k = s.d.nz - 1; k >= 0; k--) if (s.vox[k * 1156 + c]) return s.d.kBottom + k;
    return null;
  }
}
const 被挖 = (x: number, y: number, k: number) => {
  if (!挖盒.length) return false;
  const X = (x + 0.5) * 格, Y = (y + 0.5) * 格, Z = (k + 0.5) * 格;
  return 挖盒.some((b) => b[0]! <= X && X < b[3]! && b[1]! <= Y && Y < b[4]! && b[2]! <= Z && Z < b[5]!);
};

// Amanatides & Woo：返回沿途序列（块外或太远就停）
const 走 = (包: 包读, sx: number, sy: number, sz: number, dx: number, dy: number, dz: number, 块格: number, x0: number, y0: number) => {
  const 序: number[] = [];
  let x = Math.floor(sx), y = Math.floor(sy), k = Math.floor(sz);
  const stepX = Math.sign(dx), stepY = Math.sign(dy), stepZ = Math.sign(dz);
  let tx = dx ? ((stepX > 0 ? x + 1 - sx : sx - x) / Math.abs(dx)) : Infinity;
  let ty = dy ? ((stepY > 0 ? y + 1 - sy : sy - y) / Math.abs(dy)) : Infinity;
  let tz = dz ? ((stepZ > 0 ? k + 1 - sz : sz - k) / Math.abs(dz)) : Infinity;
  const ax = dx ? 1 / Math.abs(dx) : Infinity, ay = dy ? 1 / Math.abs(dy) : Infinity, az = dz ? 1 / Math.abs(dz) : Infinity;
  for (let n = 0; n < 1500; n++) {
    if (x < x0 || y < y0 || x >= x0 + 块格 || y >= y0 + 块格) return 序;
    const v = 被挖(x, y, k) ? 0 : 包.取(x, y, k);
    if (v === -1) return 序;
    if (v === -2) {
      序.push(-2);
      return 序;
    }
    if (Math.floor(v / 65536) !== 0) { // 空气的群系号是 65535，不能只比 0
      序.push(v);
      if (full[值[Math.floor(v / 65536)]!]) return 序;
    }
    if (tx < ty && tx < tz) {
      x += stepX;
      tx += ax;
    } else if (ty < tz) {
      y += stepY;
      ty += ay;
    } else {
      k += stepZ;
      tz += az;
    }
  }
  return 序;
};

const t0 = Date.now();
let 总 = 0, 差 = 0, 差状态 = 0, 差首格 = 0, 中实心 = 0;
const 样: string[] = [];
for (const 名 of 文件们) {
  const 旧 = new 包读(旧目录), 新 = new 包读(新目录);
  const [ti, tj] = 名.split('.').map(Number) as [number, number];
  const 块格 = 2048 >> L, x0 = ti * 块格, y0 = tj * 块格;
  for (let n = 0; n < 每块; n++) {
    const x = x0 + Math.floor(随机() * 块格), y = y0 + Math.floor(随机() * 块格);
    const 顶 = 旧.顶(x, y);
    if (顶 === null) continue;
    const sz = 顶 + 1 + 随机() * 40, 方位 = 随机() * Math.PI * 2, 仰 = (-90 + 随机() * 150) * (Math.PI / 180);
    const dx = Math.cos(仰) * Math.cos(方位), dy = Math.cos(仰) * Math.sin(方位), dz = Math.sin(仰);
    const sx = x + 随机(), sy = y + 随机();
    const a = 走(旧, sx, sy, sz, dx, dy, dz, 块格, x0, y0), b = 走(新, sx, sy, sz, dx, dy, dz, 块格, x0, y0);
    总++;
    if (a.length) 中实心++;
    if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
      差++;
      // 埋在水里的水格没有面（水和水之间剔面），它的群系变了看不出来：只差这个的单独数，不算画面差
      const 状态差 = a.length !== b.length || a.some((v, i) => Math.floor(v / 65536) !== Math.floor(b[i]! / 65536));
      const 首差 = a[0] !== b[0];
      if (状态差) 差状态++;
      if (首差) 差首格++;
      if ((状态差 || 首差) && 样.length < 10) 样.push(`${名} 起点 (${sx.toFixed(1)},${sy.toFixed(1)},${sz.toFixed(1)}) 方向 (${dx.toFixed(2)},${dy.toFixed(2)},${dz.toFixed(2)}) 旧 ${a.slice(0, 2).join(' ')} … ${a.slice(-2).join(' ')}（${a.length}）新 ${b.slice(0, 2).join(' ')} … ${b.slice(-2).join(' ')}（${b.length}）`);
    }
  }
}
console.log(`L${L}：${文件们.length} 块，${总} 条射线（${中实心} 条碰到东西），序列不一样 ${差} 条，其中沿途状态不同 ${差状态} 条、第一个碰到的格不同 ${差首格} 条；${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
for (const s of 样) console.log('  ' + s);
