// 骨骼表（基岩模型各骨骼的动画量，engine/model/基岩模型.tsx 的 BonePose）的插值、合并、叠加的正本（10-30 整体优化方案 0.6）。
// 新代码一律从这里 import；旧代码里的 插骨、mixBones、合并 副本原样不动，登记在 docs/副本表.tsv。纯模块。
// 数值约定同基岩动画文件：rot 是度、加在骨骼自带转角上；pos 是像素；scale 是倍数（数或三元组）。没写的字段：rot、pos 当 0，scale 当 1。
import type { BonePose } from '../../engine/model/基岩模型.tsx';

export type 骨骼表 = Record<string, BonePose>;
export type 骨骼字段 = 'rot' | 'pos' | 'scale';

const 缺省: Record<骨骼字段, number> = { rot: 0, pos: 0, scale: 1 };
const 三元 = (x: number | readonly number[] | undefined, 缺: number): number[] =>
  x === undefined ? [缺, 缺, 缺] : typeof x === 'number' ? [x, x, x] : [x[0] ?? 缺, x[1] ?? 缺, x[2] ?? 缺];

/**
 * 两张骨骼表插值：两边骨骼取并集，字段逐个线性插（t 不夹），一边没有的骨骼或字段按缺省值（0°、0、1 倍）。
 * 两边都没写的字段不出现在结果里，结果再 合并 到别的层上时不会把那层的值盖成缺省值。
 * 字段：只插这几种，别的字段不带（默认三种都插）。
 * 副本差别：2-空床 三种都插、结果总带全三种字段（缺的写成缺省值，画出来一样）；2-收集快乐、2-门口/归隐她 只插 rot（归隐她 只取 b 有的骨骼）；
 * 2-末地 插 rot 和 pos、别的字段照抄 b；一镜到底 mixBones 只插 rot、其余字段照抄 from，两边都没 rot 的骨骼原样留 from 的。
 */
export const 插骨 = (a: 骨骼表, b: 骨骼表, t: number, 字段: readonly 骨骼字段[] = ['rot', 'pos', 'scale']): 骨骼表 => {
  const r: 骨骼表 = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const p = a[k] ?? {};
    const q = b[k] ?? {};
    const 骨: BonePose = {};
    for (const f of 字段) {
      if (p[f] === undefined && q[f] === undefined) continue;
      const u = 三元(p[f], 缺省[f]);
      const v = 三元(q[f], 缺省[f]);
      骨[f] = u.map((x, i) => x + (v[i]! - x) * t);
    }
    r[k] = 骨;
  }
  return r;
};

/** 几层骨骼表按字段合并：同一根骨骼，后面的层只盖它写了的字段（库/角色/魔法酒狐动作.ts、魔法酒狐新动作.ts 里的 合并 是同一个） */
export const 合并骨骼表 = (...层们: readonly 骨骼表[]): 骨骼表 => {
  const r: 骨骼表 = {};
  for (const 层 of 层们) for (const [k, v] of Object.entries(层)) r[k] = { ...r[k], ...v };
  return r;
};

/** 在底表上叠加一层：rot、pos 相加，scale 相乘；只在一边有的骨骼、字段照抄 */
export const 叠加骨骼表 = (底: 骨骼表, 加: 骨骼表): 骨骼表 => {
  const r: 骨骼表 = { ...底 };
  for (const [k, d] of Object.entries(加)) {
    const s = 底[k];
    if (!s) {
      r[k] = d;
      continue;
    }
    const 骨: BonePose = { ...s };
    if (d.rot) 骨.rot = s.rot ? 三元(s.rot, 0).map((x, i) => x + d.rot![i]!) : d.rot;
    if (d.pos) 骨.pos = s.pos ? 三元(s.pos, 0).map((x, i) => x + d.pos![i]!) : d.pos;
    if (d.scale !== undefined) 骨.scale = s.scale === undefined ? d.scale : 三元(s.scale, 1).map((x, i) => x * 三元(d.scale, 1)[i]!);
    r[k] = 骨;
  }
  return r;
};
