// 门口那棵樱花树一截一截长（第 13 句每翻一页长一截，演绎：游戏里树苗是一下长成整棵的，用户 10-24 按推荐定为情感牺牲合理）。纯数据。
// 阶段 0 是树苗，1～4 一截比一截高（树顶 3、4、5、6 格），5 是开满花的整棵（树顶 7 格，比屋檐高），都用原版樱花原木、樱花树叶。
// 形状是 Agent 暂定的：比原版樱花树（树干 7～8 格、树冠半径 4）小，侧剖面一屏才放得下；树冠只在侧视平面上画成团，前后各多一排叶子遮住树干。
import type { 方块 } from '@engine/model/方块拼搭.tsx';

export const 樱花树阶段数 = 5;

/** 进度 0～1 → 阶段 0～5：0 树苗，每过 1/5 长一截，1 是整棵 */
export const 樱花树阶段 = (进度: number) => Math.max(0, Math.min(樱花树阶段数, Math.floor(进度 * 樱花树阶段数 + 1e-9)));

// 每阶段的侧视形状：从上往下一行一层（最后一行是贴地那层），每行 7 格是树干左 3 格到右 3 格。
// L 树叶、T 树干（中间那排是原木，前后排是叶子、按左右都有叶子算）、H 垂下来的叶子（只在前排）、. 空
const 形状: Record<1 | 2 | 3 | 4 | 5, readonly string[]> = {
  1: ['...L...', '..LLL..', '...T...'],
  2: ['..LLL..', '.LLLLL.', '...T...', '...T...'],
  3: ['..LLL..', '.LLLLL.', '.LLTLL.', '...T...', '...T...'],
  4: ['..LLL..', '.LLLLL.', 'LLLTLL.', '.H.T...', '...T...', '...T...'],
  5: ['..LLL..', '.LLLLL.', 'LLLLLLL', 'LLLTLL.', 'H..T.H.', '...T...', '...T...'],
};

/** 树苗所在的格 [i, j, k]（树干那排）→ 这一阶段的方块（前排 j − 1、后排 j + 1） */
export const 樱花树方块 = (阶段: number, 根: readonly [number, number, number]): 方块[] => {
  const [i0, j0, k0] = 根;
  if (阶段 <= 0) return [{ 状态: 'minecraft:cherry_sapling', 位: [i0, j0, k0] }];
  const 行们 = 形状[Math.min(樱花树阶段数, 阶段) as 1 | 2 | 3 | 4 | 5];
  const out: 方块[] = [];
  const 高 = 行们.length;
  行们.forEach((行, r) => {
    const k = k0 + 高 - 1 - r;
    const 有叶 = (c: number) => 行[c] === 'L' || 行[c] === 'T';
    for (let c = 0; c < 行.length; c++) {
      const ch = 行[c];
      const i = i0 + c - 3;
      if (ch === 'L') out.push({ 状态: 'minecraft:cherry_leaves', 位: [i, j0, k] });
      if (ch === 'T') out.push({ 状态: 'minecraft:cherry_log[axis=y]', 位: [i, j0, k] });
      if (ch === 'H') out.push({ 状态: 'minecraft:cherry_leaves', 位: [i, j0 - 1, k] });
      // 前后排：左右都有叶子（或树干）的格才补，树冠两头收窄一点
      if ((ch === 'L' || ch === 'T') && 有叶(c - 1) && 有叶(c + 1)) {
        out.push({ 状态: 'minecraft:cherry_leaves', 位: [i, j0 - 1, k] });
        out.push({ 状态: 'minecraft:cherry_leaves', 位: [i, j0 + 1, k] });
      }
    }
  });
  return out;
};
