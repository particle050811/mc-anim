// 一棵樱花树的方块（窗外.tsx 的樱花林、远山.ts 坡上的树）。照原版 1.20.1 的形状简化搭：CherryTrunkPlacer 主干 7 格上下、一两根斜出的枝；
// CherryFoliagePlacer 半径 4、高 5 的树冠，底层边上有缺口、往下挂一两格叶子。用种子定死，每帧一样。纯函数。
// 坐标同 参数.ts（网格本地，Z 朝上）；一格 [x, y, z] 指 x～x+1、y～y+1、z～z+1 那个方块。

export type 格 = [number, number, number];

/** 一棵樱花树的方块：根在 (x, y, 0)，主干高 高（不给按随机 6～7）。r 是这棵树自己的随机数 */
export const 樱花树 = (x: number, y: number, r: () => number, 定高?: number): { 木: 格[]; 叶: 格[] } => {
  const 木: 格[] = [];
  const 叶 = new Map<string, 格>();
  const 放叶 = (p: 格) => 叶.set(p.join(','), p);
  const 高 = 定高 ?? 6 + Math.floor(r() * 2);
  for (let z = 0; z < 高; z++) 木.push([x, y, z]);
  // 树冠挂在主干顶上，再加一两根枝：从主干 高−3 处斜出 2～3 格、往上 2 格，枝头也挂一团
  const 冠心: 格[] = [[x, y, 高]];
  const 枝数 = r() < 0.5 ? 1 : 2;
  const 方向们: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const 起向 = Math.floor(r() * 4);
  for (let b = 0; b < 枝数; b++) {
    const [dx, dy] = 方向们[(起向 + b * 2) % 4]!;
    const 长 = 2 + Math.floor(r() * 2);
    let [cx, cy, cz] = [x, y, 高 - 3];
    for (let i = 1; i <= 长; i++) {
      cx += dx;
      cy += dy;
      if (i > 1) cz += 1;
      木.push([cx, cy, cz]);
    }
    木.push([cx, cy, cz + 1]);
    冠心.push([cx, cy, cz + 2]);
  }
  // 树冠：以冠心为准往下 1 层、往上 3 层，半径 4、4、4、3、2；去掉四角，底层边上 1/4 的格子空着，边上 1/6 往下挂 1 格（再 1/3 挂 2 格）
  const 半径 = [4, 4, 4, 3, 2];
  for (const [ox, oy, oz] of 冠心)
    半径.forEach((rad, i) => {
      const z = oz - 1 + i;
      for (let dx = -rad; dx <= rad; dx++)
        for (let dy = -rad; dy <= rad; dy++) {
          const 边 = Math.abs(dx) === rad || Math.abs(dy) === rad;
          if (Math.abs(dx) === rad && Math.abs(dy) === rad) continue;
          if (Math.abs(dx) + Math.abs(dy) > rad + 2) continue;
          if (边 && i === 0 && r() < 0.25) continue;
          放叶([ox + dx, oy + dy, z]);
          if (边 && i === 0 && r() < 1 / 6) {
            放叶([ox + dx, oy + dy, z - 1]);
            if (r() < 1 / 3) 放叶([ox + dx, oy + dy, z - 2]);
          }
        }
    });
  for (const p of 木) 叶.delete(p.join(','));
  return { 木, 叶: [...叶.values()] };
};
