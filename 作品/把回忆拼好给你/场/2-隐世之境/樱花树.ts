// 一棵樱花树的方块（窗外.tsx 的樱花林、远山.ts 坡上的树）。照原版 1.20.1 的形状简化搭：CherryTrunkPlacer 主干 7 格上下、一两根斜出的枝；
// CherryFoliagePlacer 半径 4、高 5 的树冠，底层边上有缺口、往下挂一两格叶子。用种子定死，每帧一样。纯函数。
// 坐标同 参数.ts（网格本地，Z 朝上）；一格 [x, y, z] 指 x～x+1、y～y+1、z～z+1 那个方块。

export type CellPos = [number, number, number];

/** 一棵樱花树的方块：根在 (x, y, 0)，主干高 高（不给按随机 6～7）。r 是这棵树自己的随机数 */
export const cherryTree = (x: number, y: number, r: () => number, fixedHeight?: number): { logs: CellPos[]; leaves: CellPos[] } => {
  const logs: CellPos[] = [];
  const leaves = new Map<string, CellPos>();
  const placeLeaves = (p: CellPos) => leaves.set(p.join(','), p);
  const treeHeight = fixedHeight ?? 6 + Math.floor(r() * 2);
  for (let z = 0; z < treeHeight; z++) logs.push([x, y, z]);
  // 树冠挂在主干顶上，再加一两根枝：从主干 高−3 处斜出 2～3 格、往上 2 格，枝头也挂一团
  const crownCenters: CellPos[] = [[x, y, treeHeight]];
  const branchCount = r() < 0.5 ? 1 : 2;
  const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const startDir = Math.floor(r() * 4);
  for (let b = 0; b < branchCount; b++) {
    const [dx, dy] = dirs[(startDir + b * 2) % 4]!;
    const branchLength = 2 + Math.floor(r() * 2);
    let [cx, cy, cz] = [x, y, treeHeight - 3];
    for (let i = 1; i <= branchLength; i++) {
      cx += dx;
      cy += dy;
      if (i > 1) cz += 1;
      logs.push([cx, cy, cz]);
    }
    logs.push([cx, cy, cz + 1]);
    crownCenters.push([cx, cy, cz + 2]);
  }
  // 树冠：以冠心为准往下 1 层、往上 3 层，半径 4、4、4、3、2；去掉四角，底层边上 1/4 的格子空着，边上 1/6 往下挂 1 格（再 1/3 挂 2 格）
  const radiusList = [4, 4, 4, 3, 2];
  for (const [ox, oy, oz] of crownCenters)
    radiusList.forEach((rad, i) => {
      const z = oz - 1 + i;
      for (let dx = -rad; dx <= rad; dx++)
        for (let dy = -rad; dy <= rad; dy++) {
          const isEdge = Math.abs(dx) === rad || Math.abs(dy) === rad;
          if (Math.abs(dx) === rad && Math.abs(dy) === rad) continue;
          if (Math.abs(dx) + Math.abs(dy) > rad + 2) continue;
          if (isEdge && i === 0 && r() < 0.25) continue;
          placeLeaves([ox + dx, oy + dy, z]);
          if (isEdge && i === 0 && r() < 1 / 6) {
            placeLeaves([ox + dx, oy + dy, z - 1]);
            if (r() < 1 / 3) placeLeaves([ox + dx, oy + dy, z - 2]);
          }
        }
    });
  for (const p of logs) leaves.delete(p.join(','));
  return { logs, leaves: [...leaves.values()] };
};
