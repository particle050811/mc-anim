// 远景包（engine/voxel/远景网格.ts 读）从 mcai 远景取样拼出来：读几份任务（任务.ts 排的，每份的 <出>.json、<出>.<层>.bin 是 /mcai far 写的），
// 粗层直接是网格点（高、群、地表、冠顶、冠底），中层、细带存和下面各层的差（分米），差照 engine 的 distantTop 现算，和渲染时查到的一样。
// 高 = 最高的实心地形方块（不算黑森林树冠、巨魔云），水按 海平面 = 0 的规则铺（暮色 sea_level 0、不开含水层，取样里的水顶只拿来核对）。
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { codeRoot } from '../../环境/路径.ts';
import type * as distantMeshModule from '../../../engine/voxel/远景网格.ts';
import type { DistantGrid } from '../../../engine/voxel/远景网格.ts';
import type { DistantTask } from './任务.ts';

const noHeight = -32768;
const recordBytes = 14;
type SampleHeader = { blockNames: string[]; 群系名: string[]; 群系温度?: number[]; 层: { 名: string; step: number; 块边: number; n: number; tileCount: number }[]; 种子: string; 海平面: number };

export type DistantPackResult = { 文件: Record<string, Buffer>; pointCounts: Record<string, number>; 群系: string[]; surfaceBlocks: string[]; 范围: [number, number, number, number] };

// 差照 engine 的 distantTop 算，格式只有那一份；pipeline 不静态 import 渲染代码，按路径动态取（同 体素库.ts）
const loadDistantMeshModule = (): Promise<typeof distantMeshModule> => import(pathToFileURL(path.join(codeRoot(), 'engine', 'voxel', '远景网格.ts')).href);

export const packDistant = async (tasks: DistantTask[]): Promise<DistantPackResult> => {
  const { buildDetailLayer, distantTop } = await loadDistantMeshModule();
  const parts = tasks.map((t) => {
    const sampleHeader = JSON.parse(fs.readFileSync(`${t.出}.json`, 'utf8')) as SampleHeader;
    return { t, 头: sampleHeader };
  });
  // 合并的方块表、群系表（群系按名排序，地表按出现顺序）
  const biomeNames = [...new Set(parts.flatMap((p) => p.头.群系名))].sort();
  const biomeTemperature = new Map<string, number>();
  for (const p of parts) p.头.群系温度?.forEach((v, i) => biomeTemperature.set(p.头.群系名[i], v));
  const missingTemps = biomeNames.filter((n) => !biomeTemperature.has(n));
  if (missingTemps.length) throw new Error(`这些群系没有温度（取样用的 mcai 太旧，重跑一份带 群系温度 的）：${missingTemps.join('、')}`);
  if (biomeNames.length > 255) throw new Error('群系超过 255 个');
  const surfaceNames: string[] = [];
  const surfaceIds = new Map<string, number>();
  const blockIndex = (n: string) => {
    let k = surfaceIds.get(n);
    if (k === undefined) surfaceIds.set(n, (k = surfaceNames.push(n) - 1));
    if (k > 255) throw new Error('地表方块超过 256 种');
    return k;
  };

  // 粗层：范围是各份粗层块的外包
  const coarseTiles = parts.flatMap((p) => p.t.层.find((l) => l.名 === '粗')!.块.map((b) => ({ b, 块边: p.t.层.find((l) => l.名 === '粗')!.块边 })));
  const step = parts[0].t.层.find((l) => l.名 === '粗')!.step;
  const X0 = Math.min(...coarseTiles.map((c) => c.b[0])), Z0 = Math.min(...coarseTiles.map((c) => c.b[1]));
  const X1 = Math.max(...coarseTiles.map((c) => c.b[0] + c.块边)), Z1 = Math.max(...coarseTiles.map((c) => c.b[1] + c.块边));
  const nx = (X1 - X0) / step + 1, nz = (Z1 - Z0) / step + 1;
  const heights = new Int16Array(nx * nz).fill(noHeight), biomeIndex = new Uint8Array(nx * nz), surface = new Uint8Array(nx * nz), crownTop = new Int16Array(nx * nz).fill(noHeight), crownBottom = new Int16Array(nx * nz).fill(noHeight);

  // 逐份逐层读点：回调拿 (方块 x, z, 记录 DataView, 偏移, 这一份的表)
  const readLayer = (layerName: string, perPoint: (x: number, z: number, v: DataView, o: number, sampleHeader: SampleHeader) => void) => {
    for (const { t, 头: sampleHeader } of parts) {
      const l = t.层.find((q) => q.名 === layerName);
      if (!l || !l.块.length) continue;
      const hl = sampleHeader.层.find((q) => q.名 === layerName)!;
      if (hl.tileCount !== l.块.length || hl.step !== l.step || hl.块边 !== l.块边) throw new Error(`${t.出} 的 ${layerName} 层和任务对不上`);
      const buf = fs.readFileSync(`${t.出}.${layerName}.bin`);
      const n = hl.n;
      if (buf.length !== l.块.length * n * n * recordBytes) throw new Error(`${t.出}.${layerName}.bin 长度不对`);
      const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      l.块.forEach(([bx, bz], b) => {
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) perPoint(bx + i * l.step, bz + j * l.step, v, ((b * n + j) * n + i) * recordBytes, sampleHeader);
      });
    }
  };
  const ground = (v: DataView, o: number, x: number, z: number) => {
    const h = v.getInt16(o, true);
    if (h === noHeight) throw new Error(`(${x}, ${z}) 没有地面`);
    return h;
  };
  readLayer('粗', (x, z, v, o, sampleHeader) => {
    const k = ((z - Z0) / step) * nx + (x - X0) / step;
    heights[k] = ground(v, o, x, z);
    surface[k] = blockIndex(sampleHeader.blockNames[v.getUint16(o + 2, true)]);
    biomeIndex[k] = biomeNames.indexOf(sampleHeader.群系名[v.getUint16(o + 4, true)]);
    crownTop[k] = v.getInt16(o + 8, true);
    crownBottom[k] = v.getInt16(o + 10, true);
  });
  const missingIdx = heights.findIndex((h) => h === noHeight);
  if (missingIdx >= 0) throw new Error(`粗层有点没取样：(${X0 + (missingIdx % nx) * step}, ${Z0 + Math.floor(missingIdx / nx) * step})`);

  const seed = parts[0].头.种子;
  const seaLevel = parts[0].头.海平面;
  const grid: DistantGrid = { packName: '', x0: X0, z0: Z0, step, nx, nz, 海平面: seaLevel, 高: heights, biomeIndex, 群系名: biomeNames, biomeTemperature: biomeNames.map((n) => biomeTemperature.get(n)!), 层: [] };
  const files: Record<string, Buffer> = {};
  const pointCounts: Record<string, number> = { 粗: nx * nz };
  // 加密层：差 = 取样 − 下面各层（含已加上的加密层）在这一点的 distantTop；同一块在几份里出现只算一次
  for (const [layerKey, layerName] of [['中', '中层'], ['细', '细带']] as const) {
    const chunks: [number, number][] = [];
    const blockOrdinals = new Map<string, number>();
    let layerStep = 0, tileEdge = 0;
    for (const { t } of parts) {
      const l = t.层.find((q) => q.名 === layerKey);
      if (!l) continue;
      layerStep = l.step;
      tileEdge = l.块边;
      for (const b of l.块) if (!blockOrdinals.has(`${b[0]},${b[1]}`)) blockOrdinals.set(`${b[0]},${b[1]}`, chunks.push(b) - 1);
    }
    if (!chunks.length) continue;
    const n = tileEdge / layerStep + 1;
    const diffDeltas = new Int16Array(chunks.length * n * n);
    // 按块顺序读（块的远边那一排点也存在本块里）
    for (const { t } of parts) {
      const l = t.层.find((q) => q.名 === layerKey);
      if (!l || !l.块.length) continue;
      const buf = fs.readFileSync(`${t.出}.${layerKey}.bin`);
      const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      l.块.forEach(([bx, bz], b) => {
        const targetOffset = blockOrdinals.get(`${bx},${bz}`)! * n * n;
        for (let j = 0; j < n; j++)
          for (let i = 0; i < n; i++) {
            const x = bx + i * l.step, z = bz + j * l.step;
            const h = ground(v, ((b * n + j) * n + i) * recordBytes, x, z);
            const d = Math.round((h - distantTop(grid, x + 0.5, z + 0.5)) * 10);
            if (d < -32767 || d > 32767) throw new Error(`${layerKey} 层 (${x}, ${z}) 的差超出 int16`);
            diffDeltas[targetOffset + j * n + i] = d;
          }
      });
    }
    const meta = { 版本: 1, 层: layerName, 种子: seed, step: layerStep, 块边: tileEdge, n, 块: chunks };
    grid.层.push(buildDetailLayer(layerKey, meta, diffDeltas));
    files[`远景.${layerKey}.json`] = Buffer.from(JSON.stringify(meta));
    files[`远景.${layerKey}.bin.gz`] = gzipSync(Buffer.from(diffDeltas.buffer), { level: 9 });
    pointCounts[layerKey] = diffDeltas.length;
  }
  files['远景.json'] = Buffer.from(JSON.stringify({ 版本: 1, 种子: seed, x0: X0, z0: Z0, step, nx, nz, 海平面: seaLevel, 群系名: biomeNames, 群系温度: grid.biomeTemperature, 地表名: surfaceNames }));
  files['远景.高.bin.gz'] = gzipSync(Buffer.from(heights.buffer), { level: 9 });
  files['远景.群.bin.gz'] = gzipSync(Buffer.from(biomeIndex.buffer), { level: 9 });
  files['远景.地表.bin.gz'] = gzipSync(Buffer.from(surface.buffer), { level: 9 });
  files['远景.冠顶.bin.gz'] = gzipSync(Buffer.from(crownTop.buffer), { level: 9 });
  files['远景.冠底.bin.gz'] = gzipSync(Buffer.from(crownBottom.buffer), { level: 9 });
  return { 文件: files, pointCounts, 群系: biomeNames, surfaceBlocks: surfaceNames, 范围: [X0, Z0, X1, Z1] };
};

export const writeToDir = (r: DistantPackResult, dir: string) => {
  for (const [fileName, b] of Object.entries(r.文件)) fs.writeFileSync(path.join(dir, fileName), b);
};
