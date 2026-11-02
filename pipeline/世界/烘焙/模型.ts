// 抽样契约固定：文件名按 UTF-8 字节排、文件内按物理偏移排，各 L 每 40 段取第 0 段。
// 烘焙、旧包转码都从最终格子学；不依赖源格式、线程完成先后、时钟或机器路径。
import { 默认模型, 模型字节, type 区段模型 } from '../../../engine/voxel/区段模型.ts';
import type { 体素库 } from '../体素库.ts';
import type { SectionData } from '../../../engine/voxel/区段包.ts';
import { 遍历区段 } from './读区段.ts';
import { 到列优先, 走模型, 压区段 } from './区段编码.ts';

export const 学模型 = (样本: () => Iterable<SectionData>): 区段模型 => {
  const classes = 32, freq = new Map<number, number>();
  let maxState = 0;
  for (const d of 样本()) {
    for (let i = 0; i < d.palette.length; i += 2) maxState = Math.max(maxState, d.palette[i]!);
    for (const p of d.paletteIndex) { const s = d.palette[2 * p]!; freq.set(s, (freq.get(s) ?? 0) + 1); }
  }
  const map = new Uint8Array(65536).fill(classes - 1);
  // 次数相等按状态号定胜负，不把 Map 的插入顺序变成隐藏的格式条件。
  [...freq].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, classes - 1).forEach(([s], c) => { map[s] = c; });
  const counts = new Float64Array(classes * 1371 * 2), total = new Float64Array(1371 * 2);
  const stride = maxState + 1, lits = new Float64Array(classes * stride), global = new Float64Array(stride), rows = new Float64Array(classes);
  for (const d of 样本()) {
    const ps = new Uint16Array(1371);
    走模型({
      literal(u, v) { const s = d.palette[2 * v]!, c = map[d.palette[2 * u]!]!; lits[c * stride + s]!++; global[s]!++; rows[c]!++; },
      bit(p, i, b, s = 0) { if (p === ps) { const c = i < 1344 ? map[s]! : 0; counts[2 * (c * 1371 + i) + b]!++; total[2 * i + b]!++; } return b; },
    }, 到列优先(d), d.nz, d.palette.length / 2, d.L, ps, d.palette);
  }
  const init = new Uint16Array(classes * 1371);
  for (let c = 0; c < classes; c++) for (let i = 0; i < 1371; i++) {
    const a = counts[2 * (c * 1371 + i)]!, b = counts[2 * (c * 1371 + i) + 1]!, base = (total[2 * i]! + 0.5) / (total[2 * i]! + total[2 * i + 1]! + 1);
    init[c * 1371 + i] = Math.max(15, Math.min(2033, Math.round(2048 * (a + 8 * base) / (a + b + 8))));
  }
  const weights = new Uint16Array(classes * stride), totalL = global.reduce((a, b) => a + b, 0);
  for (let c = 0; c < classes; c++) for (let s = 0; s < stride; s++) {
    const prior = (global[s]! + 0.1) / (totalL + stride * 0.1);
    weights[c * stride + s] = Math.max(1, Math.min(65535, Math.round(65535 * (lits[c * stride + s]! + 16 * prior) / (rows[c]! + 16))));
  }
  return { classes, stride, map, init, weights };
};

export const 训练包模型 = (库: 体素库, dir: string) => {
  let 区段 = 0, 样本数 = 0;
  const 样本 = function* () {
    const 次数 = new Map<number, number>();
    区段 = 0; 样本数 = 0;
    for (const s of 遍历区段(库, dir)) {
      区段++;
      const n = 次数.get(s.id.L) ?? 0;
      次数.set(s.id.L, n + 1);
      if (n % 40) continue;
      样本数++;
      yield s.取();
    }
  };
  let 模型 = 学模型(样本);
  let 候选字节: number | undefined, 中性字节: number | undefined;
  // 小包才做双编码择优：把表的固定成本也算进去，避免为几十个区段多带约 90 KB。大包不多走整包编码。
  if (区段 <= 1024) {
    const 中性 = 默认模型();
    候选字节 = 模型字节(模型).length; 中性字节 = 模型字节(中性).length;
    for (const s of 遍历区段(库, dir)) {
      const d = s.取();
      候选字节 += 压区段(d, 模型).length;
      中性字节 += 压区段(d, 中性).length;
    }
    if (中性字节 <= 候选字节) 模型 = 中性;
  }
  return { 模型, 区段, 样本数, 候选字节, 中性字节 };
};
