// 门口那棵樱花树一截一截长（第 13 句每翻一页长一截，演绎：游戏里树苗是一下长成整棵的，用户 10-24 按推荐定为情感牺牲合理）。纯数据。
// 阶段 0 是树苗；1～4 是小树，一截比一截高（树顶 3、4、5、7 格），叶子稀、只在树梢上一小团；5 是开满花的整棵：树顶 9 格（比屋脊 6.5 高），
//   树冠 9 格宽（x −9.5～−1.5）、底下垂着几串叶子，地上铺一圈粉红花簇（正侧面只看得到花茎，三渲二带俯角时才看得到花）。原版樱花树叶一直是粉的，所以前四截靠「小、稀」和第 5 截拉开，不靠颜色。
// 形状是 Agent 暂定的：比原版樱花树（树干 7～8 格、树冠半径 4）矮一些，侧剖面一屏放得下；树冠只在侧视平面上画成团，前后各多一排叶子遮住树干。
// 输出是格编号：画的时候和屋子一样传 原点 = 格原点（门口小木屋.tsx），格 i 的中心才落在 x = i。
import type { 方块 } from '@engine/model/方块拼搭.tsx';

export const 樱花树阶段数 = 5;

/** 进度 0～1 → 阶段 0～5：0 树苗，每过 1/5 长一截，1 是整棵 */
export const 樱花树阶段 = (进度: number) => Math.max(0, Math.min(樱花树阶段数, Math.floor(进度 * 樱花树阶段数 + 1e-9)));

// 每阶段的侧视形状：从上往下一行一层（最后一行是贴地那层），每行 9 格是树干左 4 格到右 4 格。
// L 树叶（前后排按左右都有叶子才补）、T 树干（樱花原木，前后排同 L）、H 垂下来的叶子（只这一排）、. 空
// 第 5 截树冠右边收到 x −2，和屋檐（x −1、z 3～4）之间空一格，不粘成一片；树干只长到树冠底下（核查 10-24：树干伸进树冠那一格，
//   从前排樱花叶的镂空里透出深色原木，侧面看是一团黑色的乱点）
const 形状: Record<1 | 2 | 3 | 4 | 5, readonly string[]> = {
  1: ['....L....', '...LTL...', '....T....'],
  2: ['....L....', '...LLL...', '....T....', '....T....'],
  3: ['....L....', '...LLL...', '..LLTLL..', '....T....', '....T....'],
  4: ['...LLL...', '..LLLLL..', '..LLTLL..', '....T....', '....T....', '....T....', '....T....'],
  5: [
    '..LLLLL..',
    '.LLLLLLL.',
    'LLLLLLLL.',
    'LLLLLLLL.',
    'H.H.T.H..',
    '....T....',
    '....T....',
    '....T....',
    '....T....',
  ],
};
/** 第 5 截地上的粉红花簇：相对树干的 [dx, dj]（dj 0 是树干那排，−1 前排、+1 后排）；告示牌那格（dx +2）空出来 */
const 花簇: readonly (readonly [number, number])[] = [
  [-2, -1], [-1, -1], [1, -1], [2, -1], [3, -1],
  [-2, 0], [-1, 0], [1, 0],
  [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1],
];
const 花簇朝向 = ['east', 'south', 'west', 'north'] as const;

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
      const i = i0 + c - 4;
      if (ch === 'L' || ch === 'H') out.push({ 状态: 'minecraft:cherry_leaves', 位: [i, j0, k] });
      if (ch === 'T') out.push({ 状态: 'minecraft:cherry_log[axis=y]', 位: [i, j0, k] });
      if ((ch === 'L' || ch === 'T') && 有叶(c - 1) && 有叶(c + 1)) {
        out.push({ 状态: 'minecraft:cherry_leaves', 位: [i, j0 - 1, k] });
        out.push({ 状态: 'minecraft:cherry_leaves', 位: [i, j0 + 1, k] });
      }
    }
  });
  if (阶段 >= 樱花树阶段数)
    花簇.forEach(([dx, dj], n) => out.push({ 状态: `minecraft:pink_petals[facing=${花簇朝向[n % 4]},flower_amount=${(n % 3) + 2}]`, 位: [i0 + dx, j0 + dj, k0] }));
  return out;
};
