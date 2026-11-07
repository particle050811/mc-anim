// 远景包（engine/voxel/远景网格.ts 读）从 mcai 远景取样拼出来：读几份任务（任务.ts 排的，每份的 <出>.json、<出>.<层>.bin 是 /mcai far 写的），
// 粗层直接是网格点（高、群、地表、冠顶、冠底），中层、细带存和下面各层的差（分米），差照 engine 的 distantTop 现算，和渲染时查到的一样。
// 高 = 最高的实心地形方块（不算黑森林树冠、巨魔云），水按 海平面 = 0 的规则铺（暮色 sea_level 0、不开含水层，取样里的水顶只拿来核对）。
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { 代码根 } from '../../环境/路径.ts';
import type * as 远景网格模块 from '../../../engine/voxel/远景网格.ts';
import type { DistantGrid } from '../../../engine/voxel/远景网格.ts';
import type { 远景任务 } from './任务.ts';

const 无 = -32768;
const 记录字节 = 14;
type 取样头 = { 方块名: string[]; 群系名: string[]; 群系温度?: number[]; 层: { 名: string; step: number; 块边: number; n: number; 块数: number }[]; 种子: string; 海平面: number };

export type 打包结果 = { 文件: Record<string, Buffer>; 点数: Record<string, number>; 群系: string[]; 地表: string[]; 范围: [number, number, number, number] };

// 差照 engine 的 distantTop 算，格式只有那一份；pipeline 不静态 import 渲染代码，按路径动态取（同 体素库.ts）
const 远景网格 = (): Promise<typeof 远景网格模块> => import(pathToFileURL(path.join(代码根(), 'engine', 'voxel', '远景网格.ts')).href);

export const 打包远景 = async (任务们: 远景任务[]): Promise<打包结果> => {
  const { buildDetailLayer, distantTop } = await 远景网格();
  const 份们 = 任务们.map((t) => {
    const 头 = JSON.parse(fs.readFileSync(`${t.出}.json`, 'utf8')) as 取样头;
    return { t, 头 };
  });
  // 合并的方块表、群系表（群系按名排序，地表按出现顺序）
  const 群系名 = [...new Set(份们.flatMap((p) => p.头.群系名))].sort();
  const 温度 = new Map<string, number>();
  for (const p of 份们) p.头.群系温度?.forEach((v, i) => 温度.set(p.头.群系名[i], v));
  const 缺温度 = 群系名.filter((n) => !温度.has(n));
  if (缺温度.length) throw new Error(`这些群系没有温度（取样用的 mcai 太旧，重跑一份带 群系温度 的）：${缺温度.join('、')}`);
  if (群系名.length > 255) throw new Error('群系超过 255 个');
  const 地表名: string[] = [];
  const 地表号 = new Map<string, number>();
  const 号 = (n: string) => {
    let k = 地表号.get(n);
    if (k === undefined) 地表号.set(n, (k = 地表名.push(n) - 1));
    if (k > 255) throw new Error('地表方块超过 256 种');
    return k;
  };

  // 粗层：范围是各份粗层块的外包
  const 粗块 = 份们.flatMap((p) => p.t.层.find((l) => l.名 === '粗')!.块.map((b) => ({ b, 块边: p.t.层.find((l) => l.名 === '粗')!.块边 })));
  const step = 份们[0].t.层.find((l) => l.名 === '粗')!.step;
  const X0 = Math.min(...粗块.map((c) => c.b[0])), Z0 = Math.min(...粗块.map((c) => c.b[1]));
  const X1 = Math.max(...粗块.map((c) => c.b[0] + c.块边)), Z1 = Math.max(...粗块.map((c) => c.b[1] + c.块边));
  const nx = (X1 - X0) / step + 1, nz = (Z1 - Z0) / step + 1;
  const 高 = new Int16Array(nx * nz).fill(无), 群 = new Uint8Array(nx * nz), 地表 = new Uint8Array(nx * nz), 冠顶 = new Int16Array(nx * nz).fill(无), 冠底 = new Int16Array(nx * nz).fill(无);

  // 逐份逐层读点：回调拿 (方块 x, z, 记录 DataView, 偏移, 这一份的表)
  const 读层 = (名: string, 每点: (x: number, z: number, v: DataView, o: number, 头: 取样头) => void) => {
    for (const { t, 头 } of 份们) {
      const l = t.层.find((q) => q.名 === 名);
      if (!l || !l.块.length) continue;
      const hl = 头.层.find((q) => q.名 === 名)!;
      if (hl.块数 !== l.块.length || hl.step !== l.step || hl.块边 !== l.块边) throw new Error(`${t.出} 的 ${名} 层和任务对不上`);
      const buf = fs.readFileSync(`${t.出}.${名}.bin`);
      const n = hl.n;
      if (buf.length !== l.块.length * n * n * 记录字节) throw new Error(`${t.出}.${名}.bin 长度不对`);
      const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      l.块.forEach(([bx, bz], b) => {
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) 每点(bx + i * l.step, bz + j * l.step, v, ((b * n + j) * n + i) * 记录字节, 头);
      });
    }
  };
  const 地面 = (v: DataView, o: number, x: number, z: number) => {
    const h = v.getInt16(o, true);
    if (h === 无) throw new Error(`(${x}, ${z}) 没有地面`);
    return h;
  };
  读层('粗', (x, z, v, o, 头) => {
    const k = ((z - Z0) / step) * nx + (x - X0) / step;
    高[k] = 地面(v, o, x, z);
    地表[k] = 号(头.方块名[v.getUint16(o + 2, true)]);
    群[k] = 群系名.indexOf(头.群系名[v.getUint16(o + 4, true)]);
    冠顶[k] = v.getInt16(o + 8, true);
    冠底[k] = v.getInt16(o + 10, true);
  });
  const 空 = 高.findIndex((h) => h === 无);
  if (空 >= 0) throw new Error(`粗层有点没取样：(${X0 + (空 % nx) * step}, ${Z0 + Math.floor(空 / nx) * step})`);

  const 种子 = 份们[0].头.种子;
  const 海平面 = 份们[0].头.海平面;
  const grid: DistantGrid = { packName: '', x0: X0, z0: Z0, step, nx, nz, 海平面, 高, 群, 群系名, 温度: 群系名.map((n) => 温度.get(n)!), 层: [] };
  const 文件: Record<string, Buffer> = {};
  const 点数: Record<string, number> = { 粗: nx * nz };
  // 加密层：差 = 取样 − 下面各层（含已加上的加密层）在这一点的 distantTop；同一块在几份里出现只算一次
  for (const [名, 层名] of [['中', '中层'], ['细', '细带']] as const) {
    const 块们: [number, number][] = [];
    const 块号 = new Map<string, number>();
    let 层step = 0, 块边 = 0;
    for (const { t } of 份们) {
      const l = t.层.find((q) => q.名 === 名);
      if (!l) continue;
      层step = l.step;
      块边 = l.块边;
      for (const b of l.块) if (!块号.has(`${b[0]},${b[1]}`)) 块号.set(`${b[0]},${b[1]}`, 块们.push(b) - 1);
    }
    if (!块们.length) continue;
    const n = 块边 / 层step + 1;
    const 差 = new Int16Array(块们.length * n * n);
    // 按块顺序读（块的远边那一排点也存在本块里）
    for (const { t } of 份们) {
      const l = t.层.find((q) => q.名 === 名);
      if (!l || !l.块.length) continue;
      const buf = fs.readFileSync(`${t.出}.${名}.bin`);
      const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      l.块.forEach(([bx, bz], b) => {
        const 目标 = 块号.get(`${bx},${bz}`)! * n * n;
        for (let j = 0; j < n; j++)
          for (let i = 0; i < n; i++) {
            const x = bx + i * l.step, z = bz + j * l.step;
            const h = 地面(v, ((b * n + j) * n + i) * 记录字节, x, z);
            const d = Math.round((h - distantTop(grid, x + 0.5, z + 0.5)) * 10);
            if (d < -32767 || d > 32767) throw new Error(`${名} 层 (${x}, ${z}) 的差超出 int16`);
            差[目标 + j * n + i] = d;
          }
      });
    }
    const meta = { 版本: 1, 层: 层名, 种子, step: 层step, 块边, n, 块: 块们 };
    grid.层.push(buildDetailLayer(名, meta, 差));
    文件[`远景.${名}.json`] = Buffer.from(JSON.stringify(meta));
    文件[`远景.${名}.bin.gz`] = gzipSync(Buffer.from(差.buffer), { level: 9 });
    点数[名] = 差.length;
  }
  文件['远景.json'] = Buffer.from(JSON.stringify({ 版本: 1, 种子, x0: X0, z0: Z0, step, nx, nz, 海平面, 群系名, 群系温度: grid.温度, 地表名 }));
  文件['远景.高.bin.gz'] = gzipSync(Buffer.from(高.buffer), { level: 9 });
  文件['远景.群.bin.gz'] = gzipSync(Buffer.from(群.buffer), { level: 9 });
  文件['远景.地表.bin.gz'] = gzipSync(Buffer.from(地表.buffer), { level: 9 });
  文件['远景.冠顶.bin.gz'] = gzipSync(Buffer.from(冠顶.buffer), { level: 9 });
  文件['远景.冠底.bin.gz'] = gzipSync(Buffer.from(冠底.buffer), { level: 9 });
  return { 文件, 点数, 群系: 群系名, 地表: 地表名, 范围: [X0, Z0, X1, Z1] };
};

export const 写进目录 = (r: 打包结果, dir: string) => {
  for (const [名, b] of Object.entries(r.文件)) fs.writeFileSync(path.join(dir, 名), b);
};
