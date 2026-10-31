// 实验工具（不接 anim）：现成的地形包 → 瘦身过的包，写到给定目录，不发布、不登记。包.json、缺失.tsv 原样拷。
//   node pipeline/世界/实验/瘦身包.ts <包目录> <出目录> [--档 0|1|2] [--保留盒 <json>] [--进程 3] [--只块 a.b.块,…]
// 第 0、1 档见 烘焙/瘦身.ts，第 2 档是封闭空洞填实（烘焙/封洞.ts）再第 0 档。
// 保留盒的 json：[[x0, y0, x1, y1], …]（场景坐标，米）；和盒子碰上的区段（连 apron 一圈）原样拷字节。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { 载入体素库 } from '../体素库.ts';
import { 建封洞 } from '../烘焙/封洞.ts';
import { 建瘦身表, 摊开, 换隐藏格, 收拢, 碰保留盒 } from '../烘焙/瘦身.ts';
import type { 包信息, SectionData } from '../../../engine/voxel/区段包.ts';

const 取值 = (名: string, 缺省?: string) => {
  const i = process.argv.indexOf(名);
  return i >= 0 ? process.argv[i + 1]! : 缺省;
};
const 目录 = process.argv[2]!, 出 = process.argv[3]!;
const 档 = Number(取值('--档', '0'));
const 盒文件 = 取值('--保留盒');
const 进程 = Number(取值('--进程', '3'));
const 只块 = 取值('--只块')?.split(',');
const 分片 = 取值('--分片');

const 文件们 = fs.readdirSync(目录).filter((f) => f.endsWith('.块')).sort().filter((f) => !只块 || 只块.includes(f));

if (分片) {
  const [me, n] = 分片.split('/').map(Number) as [number, number];
  const 库 = await 载入体素库();
  const P = 库.区段包;
  const 信息 = JSON.parse(fs.readFileSync(path.join(目录, '包.json'), 'utf8')) as 包信息;
  const 值 = Uint16Array.from(信息.状态, (s) => 库.方块表.voxelFromState(s));
  const 表 = 建瘦身表(库.方块表);
  const 盒们 = 盒文件 ? (JSON.parse(fs.readFileSync(盒文件, 'utf8')) as number[][]) : [];
  const 选项 = (L: number) => ({ L, 值, 裙边窗: 档 === 1 ? 8 : undefined });
  let 保留 = 0, 换 = 0, 区间 = 0, 封闭区间 = 0, 填格 = 0;
  for (let fi = 0; fi < 文件们.length; fi++) {
    if (fi % n !== me) continue;
    const 名 = 文件们[fi]!;
    const buf = fs.readFileSync(path.join(目录, 名));
    const 头 = P.decodeTileHeader(new Uint8Array(buf.subarray(0, P.tileHeaderLen)));
    const [ti, tj] = 名.split('.').map(Number) as [number, number];
    const 新块 = new Map<number, Uint8Array>();
    for (let L = 0; L <= 6; L++) {
      const 项们: { slot: number; si: number; sj: number; d: SectionData; 保留: boolean; g: Uint8Array }[] = [];
      const 每边 = 64 >> L;
      for (let slot = 0; slot < P.tileEntryCount; slot++) {
        const len = 头[2 * slot + 1]!;
        if (!len) continue;
        const id = P.sectionAtIndex(ti, tj, slot);
        if (id.L !== L) continue;
        const g = buf.subarray(头[2 * slot]!, 头[2 * slot]! + len);
        项们.push({ slot, si: id.i - ti * 每边, sj: id.j - tj * 每边, d: P.decodeSection(zlib.gunzipSync(g)), 保留: 碰保留盒(盒们, id), g });
      }
      const 封 = 档 === 2 ? 建封洞(项们, 每边, L, 表, 值) : null;
      if (封) {
        区间 += 封.区间;
        封闭区间 += 封.封闭区间;
      }
      项们.forEach((x, i) => {
        if (x.保留) {
          保留++;
          新块.set(x.slot, x.g);
          return;
        }
        const vox = 摊开(x.d);
        if (封) 填格 += 封.填(i, vox);
        换隐藏格(x.d, vox, 表, 选项(L));
        新块.set(x.slot, zlib.gzipSync(P.encodeSection(收拢(x.d, vox)), { level: 6 }));
        换++;
      });
    }
    const 新索引 = new Uint32Array(2 * P.tileEntryCount);
    let off = P.tileHeaderLen;
    const 槽们 = [...新块.keys()].sort((a, b) => a - b);
    for (const slot of 槽们) {
      新索引[2 * slot] = off;
      新索引[2 * slot + 1] = 新块.get(slot)!.length;
      off += 新块.get(slot)!.length;
    }
    const fd = fs.openSync(path.join(出, 名), 'w');
    fs.writeSync(fd, P.encodeTileHeader(ti, tj, 新索引));
    for (const slot of 槽们) fs.writeSync(fd, 新块.get(slot)!);
    fs.closeSync(fd);
  }
  console.log(`分片 ${me}：换 ${换} 个区段，保留 ${保留} 个${档 === 2 ? `；区间 ${区间}，封闭 ${封闭区间}，填 ${填格} 格（核心）` : ''}`);
} else {
  fs.mkdirSync(出, { recursive: true });
  for (const f of ['包.json', '缺失.tsv']) if (fs.existsSync(path.join(目录, f))) fs.copyFileSync(path.join(目录, f), path.join(出, f));
  const t0 = Date.now();
  const 参数 = ['--档', String(档), ...(盒文件 ? ['--保留盒', 盒文件] : []), ...(只块 ? ['--只块', 只块.join(',')] : [])];
  await Promise.all(
    Array.from({ length: 进程 }, (_, me) =>
      new Promise<void>((ok, no) => {
        const p = spawn('nice', ['-n', '15', process.execPath, fileURLToPath(import.meta.url), 目录, 出, ...参数, '--分片', `${me}/${进程}`], { stdio: 'inherit' });
        p.on('exit', (c) => (c ? no(new Error(`分片 ${me} 退出码 ${c}`)) : ok()));
      }),
    ),
  );
  const 大小 = (d: string, 只: string[] | null) => fs.readdirSync(d).filter((f) => !只 || 只.includes(f)).reduce((s, f) => s + fs.statSync(path.join(d, f)).size, 0);
  const 旧 = 大小(目录, 文件们), 新 = 大小(出, 文件们);
  console.log(`${文件们.length} 个块文件：旧 ${(旧 / 1e6).toFixed(1)} MB → 新 ${(新 / 1e6).toFixed(1)} MB（${((新 / 旧) * 100).toFixed(1)}%），${((Date.now() - t0) / 1000).toFixed(1)} 秒，${进程} 个进程`);
}
