// 预生成块覆盖哪些区块，照 Chunky 1.3 的算法（旧项目 游戏取材/主世界范围.py 搬来，走廊的区块列表和它逐行一样，见 范围.test.ts）：
//   矩形：中心对齐到区块（cx0 = ⌊x⌋ >> 4），半边取整到区块（r = ⌈半边 / 16⌉），生成 cx0 − r … cx0 + r；
//   走廊：区块中心 (16·cx + 8, 16·cz + 8) 到折线的距离 ≤ 半宽，再去掉落在「去掉」那几块里的。Chunky 用 csv 图案逐个生成（按沿折线的先后排），
//         选区取包住全部区块的方形（Chunky 仍拿选区形状筛一遍，所以要包住）。
import type { 预生成块 } from '../声明.ts';

export type 区块框 = { cx0: number; cx1: number; cz0: number; cz1: number };

/** 矩形块的中心和两个半边（米）；两角写法换成中心加半边 */
export const 矩形中心半边 = (k: 预生成块): { 中心: [number, number]; 半边: [number, number] } => {
  if (k.两角) {
    const [x1, z1, x2, z2] = k.两角;
    return { 中心: [(x1 + x2) / 2, (z1 + z2) / 2], 半边: [Math.abs(x2 - x1) / 2, Math.abs(z2 - z1) / 2] };
  }
  if (!k.中心 || !k.半边) throw new Error(`预生成块 ${k.名} 不是矩形`);
  return { 中心: k.中心, 半边: k.半边 };
};

/** 矩形块的区块范围（含两端），照 Chunky 的 Selection：中心对齐区块、半边向上取整到区块 */
export const 矩形区块 = (k: 预生成块): 区块框 => {
  const { 中心, 半边 } = 矩形中心半边(k);
  const cx = Math.floor(中心[0]) >> 4, cz = Math.floor(中心[1]) >> 4;
  const rx = Math.ceil(半边[0] / 16), rz = Math.ceil(半边[1] / 16);
  return { cx0: cx - rx, cx1: cx + rx, cz0: cz - rz, cz1: cz + rz };
};

const 在框里 = (b: 区块框, cx: number, cz: number) => b.cx0 <= cx && cx <= b.cx1 && b.cz0 <= cz && cz <= b.cz1;

/** 点到折线的距离 */
export const 到折线 = (px: number, pz: number, 线: readonly (readonly [number, number])[]) => {
  let best = Infinity;
  for (let i = 0; i + 1 < 线.length; i++) {
    const [ax, az] = 线[i]!, [bx, bz] = 线[i + 1]!;
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(px - ax - t * dx, pz - az - t * dz));
  }
  return best;
};

/** 离点最近的折线位置，从起点量的沿线距离（排生成顺序用） */
const 沿线 = (px: number, pz: number, 线: readonly (readonly [number, number])[]) => {
  let best = Infinity, s = 0, acc = 0;
  for (let i = 0; i + 1 < 线.length; i++) {
    const [ax, az] = 线[i]!, [bx, bz] = 线[i + 1]!;
    const dx = bx - ax, dz = bz - az;
    const L = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (L * L)));
    const d = Math.hypot(px - ax - t * dx, pz - az - t * dz);
    if (d < best) [best, s] = [d, acc + t * L];
    acc += L;
  }
  return s;
};

/** 走廊块的区块，按生成顺序：16×16 区块一片，片按沿折线的先后、片里按行（相邻区块挨着生成，要读的邻居大多还在内存里） */
export const 走廊区块 = (k: 预生成块, 全部: readonly 预生成块[]): [number, number][] => {
  const 线 = k.折线!, 半宽 = k.半宽!;
  const 去掉 = (k.去掉 ?? []).map((n) => {
    const b = 全部.find((x) => x.名 === n);
    if (!b) throw new Error(`走廊 ${k.名} 的 去掉 写了 ${n}，可没有这一块`);
    if (b.形状 !== '矩形') throw new Error(`走廊 ${k.名} 只能去掉矩形块（${n} 是走廊）`);
    return 矩形区块(b);
  });
  const xs = 线.map((p) => p[0]), zs = 线.map((p) => p[1]);
  const out: [number, number][] = [];
  // 范围照 主世界范围.py：Python 的 // 是向下取整
  for (let cx = Math.floor((Math.min(...xs) - 半宽) / 16) - 1; cx < Math.floor((Math.max(...xs) + 半宽) / 16) + 2; cx++)
    for (let cz = Math.floor((Math.min(...zs) - 半宽) / 16) - 1; cz < Math.floor((Math.max(...zs) + 半宽) / 16) + 2; cz++)
      if (到折线(cx * 16 + 8, cz * 16 + 8, 线) <= 半宽 && !去掉.some((b) => 在框里(b, cx, cz))) out.push([cx, cz]);
  const 片键 = new Map<string, number>();
  const 键 = (cx: number, cz: number) => {
    const t = `${cx >> 4},${cz >> 4}`;
    let v = 片键.get(t);
    if (v === undefined) 片键.set(t, (v = 沿线((cx >> 4) * 256 + 128, (cz >> 4) * 256 + 128, 线)));
    return v;
  };
  return out.sort((a, b) => 键(...a) - 键(...b) || (a[1] >> 4) - (b[1] >> 4) || (a[0] >> 4) - (b[0] >> 4) || a[1] - b[1] || a[0] - b[0]);
};

/** 包住全部区块的 Chunky 方形：中心 (x, z)（区块中心，米）、半边（米，16 的倍数） */
export const 外包方形 = (区块: readonly [number, number][]): { 中心: [number, number]; 半边: number } => {
  const { cx0: x0, cx1: x1, cz0: z0, cz1: z1 } = 列表框(区块);
  const cx = Math.floor((x0 + x1) / 2), cz = Math.floor((z0 + z1) / 2);
  const r = Math.max(cx - x0, x1 - cx, cz - z0, z1 - cz);
  return { 中心: [cx * 16 + 8, cz * 16 + 8], 半边: r * 16 };
};

/** 块碰到的区域文件号范围（r.<rx>.<rz>.mca） */
export const 区域范围 = (框们: readonly 区块框[]) => ({
  RX: [Math.min(...框们.map((b) => b.cx0)) >> 5, Math.max(...框们.map((b) => b.cx1)) >> 5] as [number, number],
  RZ: [Math.min(...框们.map((b) => b.cz0)) >> 5, Math.max(...框们.map((b) => b.cz1)) >> 5] as [number, number],
});

/** 区块列表的外包框（几十万个区块，不用展开参数的 Math.min） */
export const 列表框 = (区块: readonly [number, number][]): 区块框 => {
  const b = { cx0: Infinity, cx1: -Infinity, cz0: Infinity, cz1: -Infinity };
  for (const [cx, cz] of 区块) [b.cx0, b.cx1, b.cz0, b.cz1] = [Math.min(b.cx0, cx), Math.max(b.cx1, cx), Math.min(b.cz0, cz), Math.max(b.cz1, cz)];
  return b;
};
