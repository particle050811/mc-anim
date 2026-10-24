// 符文拼字（用户 10-24：「每个字由几枚附魔台符文从旁边飞过来，拼出这个字的笔画，落定时闪一下」，不是原地把符文换成汉字）。纯模块。
// 一个汉字的点按位置分成两三块（k 均值，块数看字的繁简），一块笔画由一枚符文送来：符文从字的右边飞过来，落到这一块的中心，落定那一帧换成这块笔画。
// 飞的路线照原版附魔台的飞字粒子 EnchantmentTableParticle.tick（1.20.1 client jar）：p = 年龄 ÷ 寿命，
//   位置 = 终点 + 起点偏移 ·(1 − p)，竖直再加 1.2 格 ·(1 − p⁴)：前面一路平着滑过来，最后一小段才往下落进去。
// 符文是这个字拼音的银河字母（块比字母多就从头再轮），沿用 10-22 的「读音落成字」。
import { 散, type 点阵 } from './符文排版.ts';

export type 点 = readonly [number, number];

/** 一块笔画：块里的点（字格里的坐标）和中心 */
export type 块 = { 点: readonly 点[]; 心: 点 };

/** 一个字分几块：点少于 60 的 2 块，其余 3 块（一块 20～37 个点，手机上看得出是一大块笔画落上来；核查 10-24：原来 2～5 块、一块只有十几个点，看着像碎屑）。Agent 定 */
export const 块数 = (点数: number) => (点数 < 60 ? 2 : 3);

/** 符文画多大：一个银河字母像素画成 符文倍 × 符文倍 个点（5×7 的字母画成 10×14 点，和一个字差不多大，手机 390 宽上约 10×15 像素）；
 *  落定前最后 收拢 那一截缩回 1 倍，像落进字里。Agent 定（核查 10-24：1 倍在手机上只是一串紫点） */
export const 符文倍 = 2;
export const 收拢 = 0.8;

const 分块缓存 = new Map<string, 块[]>();

/**
 * 把一个字的点分成 块数 块：最远点法定初值（从最左上的点起，确定、不用随机），k 均值迭代 12 次；
 * 块按书写顺序排（中心 先上后下、先左后右，y 占两份），落定也按这个顺序
 */
export const 分块 = (字: string, 阵: 点阵): 块[] => {
  const 有 = 分块缓存.get(字);
  if (有) return 有;
  const 点们 = 阵.点;
  const k = Math.min(块数(点们.length), 点们.length);
  const d2 = (a: 点, b: 点) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  let 心们: [number, number][] = [];
  const 首 = 点们.reduce((a, p) => (p[0] + p[1] < a[0] + a[1] ? p : a));
  心们.push([首[0], 首[1]]);
  while (心们.length < k) {
    let 远 = 点们[0]!;
    let 远距 = -1;
    for (const p of 点们) {
      const d = Math.min(...心们.map((c) => d2(p, c)));
      if (d > 远距) {
        远距 = d;
        远 = p;
      }
    }
    心们.push([远[0], 远[1]]);
  }
  let 归: number[] = [];
  for (let it = 0; it < 12; it++) {
    归 = 点们.map((p) => {
      let best = 0;
      心们.forEach((c, i) => {
        if (d2(p, c) < d2(p, 心们[best]!)) best = i;
      });
      return best;
    });
    心们 = 心们.map((c, i) => {
      const 们 = 点们.filter((_, j) => 归[j] === i);
      return 们.length ? [们.reduce((a, p) => a + p[0], 0) / 们.length, 们.reduce((a, p) => a + p[1], 0) / 们.length] : c;
    });
  }
  const out = 心们
    .map((c, i) => ({ 点: 点们.filter((_, j) => 归[j] === i), 心: [c[0], c[1]] as 点 }))
    .filter((b) => b.点.length > 0)
    .sort((a, b) => a.心[1] * 2 + a.心[0] - (b.心[1] * 2 + b.心[0]));
  分块缓存.set(字, out);
  return out;
};

/** 一枚符文怎么飞：起 = 起飞帧，落 = 落定帧（段内帧，带小数）；dx、dy = 起点离落点几点（往右、往下为正，不含竖直那一落）；抬 = 原版那 1.2 格的落差（点）；亮 = 明暗（0.8～1：原版粒子 0.4～1 有深有浅，太暗的在夜里看不见） */
export type 一飞 = { 字母: string; 起: number; 落: number; dx: number; dy: number; 抬: number; 亮: number };

/**
 * 飞的参数（Agent 定）：从字的右边 20～34 点（一到两个字宽）飞来，起点上下差 −3～3 点，最后落差 4～7 点；符文（按 符文倍 画）顶不高过字格顶 顶空 点
 * （顶上那行的边距 11 点，符文不出画面），底不低过字格底 下伸 点（不压下面的画面）。
 * 都从右边来：字从左往右拼出，右边是还空着的地方，符文从那里流过来不压已经拼好的字
 */
export const 飞法 = { 横: [20, 34], 竖: [-3, 3], 抬: [4, 7], 顶空: 10, 下伸: 6, 最短: 2 } as const;

/** 飞着的符文半高（点） */
const 半高 = 3.5 * 符文倍;

const 取 = (r: number, [a, b]: readonly [number, number]) => a + (b - a) * r;

/**
 * 一个字每块的符文：第 k 块在 起～完 之间按顺序落定（第一块 起、最后一块 完），起飞 = 落定 − 飞帧，但不早于这个字进场（入）；
 * 起晚了的飞得近（路程按飞的帧数缩，速度不变），不到 飞法.最短 帧的不飞（直接落定、照样闪）。种 = 这个字在全片里的定死编号
 */
export const 飞们 = (块们: readonly 块[], 音: string, 时: { 起: number; 完: number; 入: number }, 飞帧: number, 种: number): 一飞[] =>
  块们.map((块, k) => {
    const n = 块们.length;
    const 落 = n === 1 ? 时.完 : 时.起 + ((时.完 - 时.起) * k) / (n - 1);
    const 起 = Math.max(落 - 飞帧, 时.入);
    const 飞 = 落 - 起 >= 飞法.最短;
    const 比 = 飞 ? (落 - 起) / 飞帧 : 0;
    // 竖直偏移 = dy·(1−p) − 抬·(1−p⁴)，在 min(dy, 0) − 抬 和 max(dy, 0) 之间：两头夹在 顶空、下伸 里
    const dy = Math.min(Math.round(取(散(种, k, 12), 飞法.竖) * 比), Math.floor(16 + 飞法.下伸 - 半高 - 块.心[1]));
    const 抬 = Math.round(取(散(种, k, 13), 飞法.抬) * 比);
    return {
      字母: 音[k % 音.length]!,
      起: 飞 ? 起 : 落,
      落,
      dx: Math.round(取(散(种, k, 11), 飞法.横) * 比),
      dy,
      抬: Math.max(0, Math.min(抬, Math.floor(块.心[1] + Math.min(dy, 0) - 半高 + 飞法.顶空))),
      亮: 0.8 + 0.2 * 散(种, k, 14),
    };
  });

/** 第 f 帧这枚符文中心离落点的偏移（点，没取整）；还没起飞或已经落定给 null。原版那条线：横竖都按 p 线性收拢，竖直再加 抬·(1 − p⁴) */
export const 飞位 = (飞: 一飞, f: number): 点 | null => {
  if (f < 飞.起 || f >= 飞.落) return null;
  const p = (f - 飞.起) / (飞.落 - 飞.起);
  return [飞.dx * (1 - p), 飞.dy * (1 - p) - 飞.抬 * (1 - p ** 4)];
};

/** 一个字的定死编号：句号 × 64 + 第几个字（换段、换窗口都一样） */
export const 字种 = (序: number, j: number) => 序 * 64 + j;

