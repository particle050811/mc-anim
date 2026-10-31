// 实验工具（不接 anim，不进正式流程）：量地形包的构成和各种瘦身办法的反事实大小。
//   node pipeline/世界/实验/量构成.ts <包目录> --出 <json> [--进程 4] [--抽样 8] [--压缩抽样 32]
// 每个区段都解开重编码：反事实 = 按某种办法改完后再 gzip 6（和烘焙同样的设置）。抽样只影响贵的两块：--抽样 n 每 n 个算一次反事实，--压缩抽样 n 每 n 个试一次别的压缩。
// 字节数都是实测值的和；抽样项另有同一批区段的基线，算比例时比同一批。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { 载入体素库 } from '../体素库.ts';
import { 建瘦身表, 摊开, 换隐藏格, 收拢 } from '../烘焙/瘦身.ts';
import type { 包信息, SectionData } from '../../../engine/voxel/区段包.ts';

const 取值 = (名: string, 缺省?: string) => {
  const i = process.argv.indexOf(名);
  return i >= 0 ? process.argv[i + 1]! : 缺省;
};
const 目录 = process.argv[2]!;
const 出 = 取值('--出')!;
const 进程 = Number(取值('--进程', '4'));
const 抽样 = Number(取值('--抽样', '8'));
const 压缩抽样 = Number(取值('--压缩抽样', '32'));
const L0抽样 = Number(取值('--L0抽样', '1')); // 第 0 级每 n 个才细算，其余只记大小、nz；细算的项按 测·gz 比
const 分片 = 取值('--分片');

const 列边 = 34, 列数 = 34 * 34;
const gz = (b: Uint8Array) => zlib.gzipSync(b, { level: 6 }).length;

type 级累计 = Record<string, number> & { 区段: number };
const 新级 = (): 级累计 => ({ 区段: 0 }) as 级累计;
const 加 = (a: Record<string, number>, k: string, v: number) => {
  a[k] = (a[k] ?? 0) + v;
};

// ---------- 反事实的改法 ----------
const 列地表 = (d: SectionData, vox: Uint16Array, 号掩: Uint8Array) => {
  const s = new Int32Array(列数).fill(-1);
  for (let c = 0; c < 列数; c++)
    for (let k = d.nz - 1; k >= 0; k--) {
      if (号掩[vox[k * 列数 + c]!]! & 1) {
        s[c] = k;
        break;
      }
    }
  return s;
};
// 每列 底(c) 以下全归成地表那一格的号（估「地表以下值多少」）
const 去地表下 = (d: SectionData, vox0: Uint16Array, s: Int32Array, 底: (c: number) => number) => {
  const vox = vox0.slice();
  for (let c = 0; c < 列数; c++) {
    const f = 底(c);
    if (f <= 0 || s[c]! < 0) continue;
    const 填 = vox[s[c]! * 列数 + c]!;
    for (let k = 0; k < Math.min(f, d.nz); k++) vox[k * 列数 + c] = 填;
  }
  return vox;
};
const 去地表上 = (d: SectionData, vox0: Uint16Array, s: Int32Array) => {
  const vox = vox0.slice();
  for (let c = 0; c < 列数; c++) if (s[c]! >= 0) for (let k = s[c]! + 1; k < d.nz; k++) vox[k * 列数 + c] = 0;
  return vox;
};

// 低字节、高字节分开放：u16 的高字节几乎全 0，放一起 gzip 窗口里全是 00
const 分流 = (raw: Uint8Array) => {
  const out = new Uint8Array(raw.length);
  out.set(raw.subarray(0, 36));
  const n = (raw.length - 36) >> 1;
  for (let i = 0; i < n; i++) {
    out[36 + i] = raw[36 + 2 * i]!;
    out[36 + n + i] = raw[36 + 2 * i + 1]!;
  }
  return out;
};
const zstd = (b: Uint8Array, level: number) => zlib.zstdCompressSync(b, { params: { [zlib.constants.ZSTD_c_compressionLevel]: level } });
const brotli = (b: Uint8Array, q: number) => zlib.brotliCompressSync(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: q, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: b.length } });

const 分片跑 = async (me: number, n: number) => {
  const 库 = await 载入体素库();
  const P = 库.区段包;
  const 信息 = JSON.parse(fs.readFileSync(path.join(目录, '包.json'), 'utf8')) as 包信息;
  const 值 = Uint16Array.from(信息.状态, (s) => 库.方块表.voxelFromState(s));
  const 表 = 建瘦身表(库.方块表);
  const 文件们 = fs.readdirSync(目录).filter((f) => f.endsWith('.块')).sort();
  const 级们: Record<number, 级累计> = {};
  const nz直方: Record<string, number> = {};
  const 拖累: Record<string, Record<string, number>> = {};
  const 压缩: Record<string, number> = {};
  const 用时: Record<string, number> = {};
  let 序 = 0;
  for (let fi = 0; fi < 文件们.length; fi++) {
    if (fi % n !== me) continue;
    const buf = fs.readFileSync(path.join(目录, 文件们[fi]!));
    const 头 = P.decodeTileHeader(new Uint8Array(buf.subarray(0, P.tileHeaderLen)));
    for (let slot = 0; slot < P.tileEntryCount; slot++) {
      const off = 头[2 * slot]!, len = 头[2 * slot + 1]!;
      if (!len) continue;
      const g = buf.subarray(off, off + len);
      const raw = zlib.gunzipSync(g);
      const d = P.decodeSection(raw);
      序++;
      const L = d.L;
      const a = (级们[L] ??= 新级());
      a.区段++;
      加(a, 'gz', len);
      加(a, 'raw', raw.length);
      const R = d.paletteIndex.length, Pn = d.palette.length / 2;
      加(a, '段', R);
      加(a, '色板项', Pn);
      加(a, '格', 列数 * d.nz);
      加(a, 'raw色板', 4 * Pn);
      加(a, 'raw段数', 2 * 列数);
      加(a, 'raw号', 2 * R);
      加(a, 'raw长', 2 * R);
      const nzM = d.nz * 2 ** L;
      if (L === 0) {
        const b = nzM <= 16 ? '≤16' : nzM <= 32 ? '≤32' : nzM <= 48 ? '≤48' : nzM <= 64 ? '≤64' : nzM <= 96 ? '≤96' : nzM <= 128 ? '≤128' : nzM <= 192 ? '≤192' : '>192';
        加(nz直方, b, 1);
        加(nz直方, b + '·gz', len);
      }
      加(a, 'nz米和', nzM);
      if (L === 0 && 序 % L0抽样) continue;
      加(a, '测·区段', 1);
      加(a, '测·gz', len);
      加(a, '测·段', R);
      // 稠密的格子统计
      const vox = 摊开(d);
      const 号掩 = new Uint8Array(Pn);
      for (let p = 1; p < Pn; p++) 号掩[p] = 表.掩[值[d.palette[2 * p]!]!]!;
      const s = 列地表(d, vox, 号掩);
      // 各列分区：段数
      let r = 0;
      const 区数 = [0, 0, 0], 位数 = [0, 0, 0, 0, 0];
      for (let y = 0; y < 列边; y++)
        for (let x = 0; x < 列边; x++) {
          const c = y * 列边 + x;
          const 区 = x === 0 || y === 0 || x === 33 || y === 33 ? 0 : x === 1 || y === 1 || x === 32 || y === 32 ? 1 : 2;
          let z = d.nz;
          for (const end = r + d.runCounts[c]!; r < end; r++) {
            const top = z - 1; // 段顶格
            z -= d.runLengths[r]!;
            位数[s[c]! < 0 ? 0 : top > s[c]! ? (d.paletteIndex[r] === 0 ? 1 : 2) : top === s[c]! ? 3 : 4]!++;
            区数[区]!++;
          }
        }
      加(a, '段·环', 区数[0]!);
      加(a, '段·贴边', 区数[1]!);
      加(a, '段·内', 区数[2]!);
      加(a, '段·无地表', 位数[0]!);
      加(a, '段·上空气', 位数[1]!);
      加(a, '段·上方块', 位数[2]!);
      加(a, '段·地表段', 位数[3]!);
      加(a, '段·下', 位数[4]!);
      // 被遮挡（核心格六面都是整格不透明）和地下空气
      let 上空气 = 0, 地下空气 = 0, 被遮挡 = 0, 露面 = 0, 地下其他 = 0, 上其他 = 0;
      for (let k = 0; k < d.nz; k++)
        for (let y = 1; y < 33; y++)
          for (let x = 1; x < 33; x++) {
            const c = y * 列边 + x;
            const at = k * 列数 + c;
            const p = vox[at]!;
            const 地 = s[c]!;
            if (!p) {
              if (地 >= 0 && k < 地) 地下空气++;
              else 上空气++;
              continue;
            }
            const m = 号掩[p]!;
            if (m & 1) {
              const 下 = k === 0 ? 1 : 号掩[vox[at - 列数]!]! & 1;
              const 上 = k + 1 >= d.nz ? 0 : 号掩[vox[at + 列数]!]! & 1;
              if (上 && 下 && 号掩[vox[at - 1]!]! & 1 && 号掩[vox[at + 1]!]! & 1 && 号掩[vox[at - 列边]!]! & 1 && 号掩[vox[at + 列边]!]! & 1) 被遮挡++;
              else 露面++;
            } else if (地 >= 0 && k <= 地) 地下其他++;
            else 上其他++;
          }
      加(a, '格·上空气', 上空气);
      加(a, '格·地下空气', 地下空气);
      加(a, '格·被遮挡整格', 被遮挡);
      加(a, '格·露面整格', 露面);
      加(a, '格·地下其他', 地下其他);
      加(a, '格·上其他（水、树叶、花草）', 上其他);
      // 被拖累：核心列地表的中位数离 k底 多远（米）
      if (L === 0) {
        const 核: number[] = [];
        for (let y = 1; y < 33; y++) for (let x = 1; x < 33; x++) if (s[y * 列边 + x]! >= 0) 核.push(s[y * 列边 + x]!);
        核.sort((u, v) => u - v);
        const 中 = 核.length ? 核[核.length >> 1]! : 0;
        const b = 中 <= 8 ? '≤8' : 中 <= 16 ? '≤16' : 中 <= 32 ? '≤32' : 中 <= 64 ? '≤64' : 中 <= 128 ? '≤128' : '>128';
        const t = (拖累[b] ??= {});
        加(t, '区段', 1);
        加(t, 'gz', len);
        加(t, '格', 列数 * d.nz);
      }
      // ---------- 瘦身（每个区段都算）----------
      const 瘦vox = vox.slice();
      const 动 = 换隐藏格(d, 瘦vox, 表, { L, 值 });
      const 瘦 = 收拢(d, 瘦vox);
      const 瘦raw = P.encodeSection(瘦);
      const 瘦gz = gz(瘦raw);
      加(a, '瘦gz', 瘦gz);
      加(a, '瘦raw', 瘦raw.length);
      加(a, '瘦段', 瘦.paletteIndex.length);
      加(a, '瘦色板项', 瘦.palette.length / 2);
      加(a, '瘦·动核心格', 动.核心动);
      加(a, '瘦·动环格', 动.环动);
      // 第 1 档：埋着的裙边也换
      const 瘦1vox = vox.slice();
      const 动1 = 换隐藏格(d, 瘦1vox, 表, { L, 值, 裙边窗: 8 });
      const 瘦1 = 收拢(d, 瘦1vox);
      const 瘦1raw = P.encodeSection(瘦1);
      加(a, '瘦1gz', gz(瘦1raw));
      加(a, '瘦1段', 瘦1.paletteIndex.length);
      加(a, '瘦1·动贴边格', 动1.贴边动);
      if (L === 0) {
        const 核: number[] = [];
        for (let y = 1; y < 33; y++) for (let x = 1; x < 33; x++) if (s[y * 列边 + x]! >= 0) 核.push(s[y * 列边 + x]!);
        核.sort((u, v) => u - v);
        const 中 = 核.length ? 核[核.length >> 1]! : 0;
        const b = 中 <= 8 ? '≤8' : 中 <= 16 ? '≤16' : 中 <= 32 ? '≤32' : 中 <= 64 ? '≤64' : 中 <= 128 ? '≤128' : '>128';
        加(拖累[b]!, '瘦gz', 瘦gz);
      }
      // ---------- 反事实（抽样）----------
      if (序 % 抽样 === 0) {
        加(a, '样·区段', 1);
        加(a, '样·gz', len);
        加(a, '样·重gz', gz(raw));
        加(a, '样·瘦gz', 瘦gz);
        const 量 = (名: string, v: Uint16Array) => 加(a, `样·${名}`, gz(P.encodeSection(收拢(d, v))));
        const 邻 = (c: number) => {
          const y = Math.floor(c / 列边), x = c % 列边;
          let m = s[c]! < 0 ? 0 : s[c]!;
          if (x > 0) m = Math.min(m, Math.max(0, s[c - 1]!));
          if (x < 33) m = Math.min(m, Math.max(0, s[c + 1]!));
          if (y > 0) m = Math.min(m, Math.max(0, s[c - 列边]!));
          if (y < 33) m = Math.min(m, Math.max(0, s[c + 列边]!));
          return m;
        };
        量('去地表下', 去地表下(d, vox, s, (c) => s[c]!)); // 每列地表格以下全归一，含看得见的洞壁
        量('去地表上', 去地表上(d, vox, s)); // 树、草、水都不要
        量('按列定底4', 去地表下(d, vox, s, (c) => 邻(c) - Math.ceil(4 / 2 ** L))); // 底 = 四邻和自己最低的地表 − 4 米
        量('按列定底16', 去地表下(d, vox, s, (c) => 邻(c) - Math.ceil(16 / 2 ** L)));
        量('瘦加定底4', 去地表下(d, 瘦vox, s, (c) => 邻(c) - Math.ceil(4 / 2 ** L)));
        量('瘦1加定底4', 去地表下(d, 瘦1vox, s, (c) => 邻(c) - Math.ceil(4 / 2 ** L)));
        加(a, '样·只色板', gz(new Uint8Array(d.palette.buffer, d.palette.byteOffset, d.palette.byteLength)));
        加(a, '样·只段数', gz(new Uint8Array(d.runCounts.buffer, d.runCounts.byteOffset, d.runCounts.byteLength)));
        加(a, '样·只号', gz(new Uint8Array(d.paletteIndex.buffer, d.paletteIndex.byteOffset, d.paletteIndex.byteLength)));
        加(a, '样·只长', gz(new Uint8Array(d.runLengths.buffer, d.runLengths.byteOffset, d.runLengths.byteLength)));
      }
      // ---------- 换压缩（抽样）----------
      if (序 % 压缩抽样 === 0) {
        const 试 = (名: string, 压: () => Uint8Array, 解: (x: Uint8Array) => Uint8Array) => {
          const t0 = performance.now();
          const c = 压();
          const t1 = performance.now();
          解(c);
          const t2 = performance.now();
          加(压缩, 名, c.length);
          加(用时, `${名}·压`, t1 - t0);
          加(用时, `${名}·解`, t2 - t1);
        };
        加(压缩, '样本数', 1);
        加(压缩, '样本原gz', len);
        for (const [前, 原, 稠] of [['原', raw, vox], ['瘦', 瘦raw, 瘦vox], ['瘦1', 瘦1raw, 瘦1vox]] as const) {
          const 流 = 分流(原);
          加(压缩, `${前}·raw`, 原.length);
          试(`${前}·gzip6`, () => zlib.gzipSync(原, { level: 6 }), (x) => zlib.gunzipSync(x));
          试(`${前}·gzip9`, () => zlib.gzipSync(原, { level: 9 }), (x) => zlib.gunzipSync(x));
          试(`${前}·分流gzip6`, () => zlib.gzipSync(流, { level: 6 }), (x) => zlib.gunzipSync(x));
          试(`${前}·分流gzip9`, () => zlib.gzipSync(流, { level: 9 }), (x) => zlib.gunzipSync(x));
          试(`${前}·zstd3`, () => zstd(原, 3), (x) => zlib.zstdDecompressSync(x));
          试(`${前}·zstd19`, () => zstd(原, 19), (x) => zlib.zstdDecompressSync(x));
          试(`${前}·分流zstd19`, () => zstd(流, 19), (x) => zlib.zstdDecompressSync(x));
          试(`${前}·brotli9`, () => brotli(原, 9), (x) => zlib.brotliDecompressSync(x));
          试(`${前}·brotli11`, () => brotli(原, 11), (x) => zlib.brotliDecompressSync(x));
          试(`${前}·分流brotli11`, () => brotli(流, 11), (x) => zlib.brotliDecompressSync(x));
          // 不做行程：稠密的色板号按字节放（色板超过 256 项的区段也按低字节算，只估大小）
          const 层序 = Uint8Array.from(稠);
          const 列序 = new Uint8Array(稠.length);
          for (let c = 0, w = 0; c < 列数; c++) for (let k = 0; k < d.nz; k++) 列序[w++] = 稠[k * 列数 + c]!;
          试(`${前}·稠密层序gzip6`, () => zlib.gzipSync(层序, { level: 6 }), (x) => zlib.gunzipSync(x));
          试(`${前}·稠密列序gzip6`, () => zlib.gzipSync(列序, { level: 6 }), (x) => zlib.gunzipSync(x));
          试(`${前}·稠密层序zstd19`, () => zstd(层序, 19), (x) => zlib.zstdDecompressSync(x));
        }
      }
    }
  }
  return { 级们, nz直方, 拖累, 压缩, 用时 };
};

const 合并 = (a: any, b: any) => {
  for (const k of Object.keys(b)) {
    if (typeof b[k] === 'number') a[k] = (a[k] ?? 0) + b[k];
    else 合并((a[k] ??= {}), b[k]);
  }
  return a;
};

if (分片) {
  const [me, n] = 分片.split('/').map(Number) as [number, number];
  const r = await 分片跑(me, n);
  fs.writeFileSync(`${出}.${me}`, JSON.stringify(r));
} else {
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: 进程 }, (_, me) =>
      new Promise<void>((ok, no) => {
        const p = spawn('nice', ['-n', '15', process.execPath, fileURLToPath(import.meta.url), 目录, '--出', 出, '--抽样', String(抽样), '--压缩抽样', String(压缩抽样), '--L0抽样', String(L0抽样), '--分片', `${me}/${进程}`], { stdio: 'inherit' });
        p.on('exit', (c) => (c ? no(new Error(`分片 ${me} 退出码 ${c}`)) : ok()));
      }),
    ),
  );
  const 总: any = {};
  for (let me = 0; me < 进程; me++) {
    合并(总, JSON.parse(fs.readFileSync(`${出}.${me}`, 'utf8')));
    fs.rmSync(`${出}.${me}`);
  }
  总.块文件 = fs.readdirSync(目录).filter((f) => f.endsWith('.块')).length;
  总.文件字节 = fs.readdirSync(目录).reduce((s, f) => s + fs.statSync(path.join(目录, f)).size, 0);
  总.包json字节 = fs.statSync(path.join(目录, '包.json')).size;
  总.用秒 = (Date.now() - t0) / 1000;
  fs.writeFileSync(出, JSON.stringify(总, null, 1));
  console.log(`写好 ${出}，${总.用秒} 秒`);
}
