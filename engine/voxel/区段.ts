// 区段和分级（纯函数）：世界按级切成区段，第 L 级一格边长 2^L 米，一个区段 64 × 64 格（Voxy 的 section 是 32³；
// 这里竖直方向不切，一个区段是整根柱子），边长 64·2^L 米。格式 4 起从 32 改成 64（用户 11-16 定试做 64×64：包小一成多、解码略快），
// 远近分级的交界跟着从 32 米一档挪到 64 米一档，不强留 32 米（用户 11-16 定），见 docs/决策/0011-地形压缩.md「64×64」。
// 每帧挑要画的区段：从最粗一级往下走四叉树，照 Voxy 的 hierarchical/screenspace.glsl（区段投到画面上够大就往下细分）：
// 细一级的一格在画面上还有 像素 个像素以上，就换成细一级的四块。四叉树保证同一处只画一级，不重叠也不漏。

export const sectionCells = 64;
export const paddedSectionCols = sectionCells + 2; // 带相邻那一圈，一边 66 列（区段包、解码共用；pipeline 经体素库取，可见.ts 另写死一份并对过）
export const coarsestLevel = 6; // 一格 64 米，一块 4 公里
export type SectionId = { L: number; i: number; j: number };
export const sectionKey = (q: SectionId) => `${q.L}|${q.i}|${q.j}`;
// 区段的范围（世界坐标，米）
export const sectionBounds = (section: SectionId): [number, number, number] => {
  const sizeM = sectionCells * 2 ** section.L;
  return [section.i * sizeM, section.j * sizeM, sizeM];
};

export type PickSectionsParams = {
  camPos: number[]; // 镜头位置（场景坐标，Z 朝上）
  pixelAngle: number; // 画面上一个像素对应的视角（弧度）
  splitPixels: number; // 细一级的一格在画面上还有这么多像素就细分
  farM: number; // 最远画到多远（雾的尽头，米）
  inView: (x0: number, y0: number, x1: number, y1: number) => boolean; // 区段（水平范围）在不在视野里
  featureTop: (x: number, y: number) => number; // 这一带地物（地面、树冠）顶大概多高，算镜头到区段的距离用
  // 航线定级（试看，engine/voxel/航线定级.ts）：改判这一块细不细分。wantsSplit = 按门槛的结论，finerPixels = 细一级的一格在画面上几个像素；不给就照门槛
  decide?: (level: number, i: number, j: number, wantsSplit: boolean, finerPixels: number) => boolean;
  // 这一块能不能再细分（包里有没有更细的区段，engine/voxel/区段包.ts 的 splittable）；不给 = 都能
  canSplit?: (level: number, i: number, j: number) => boolean;
};

export const pickSections = (params: PickSectionsParams): SectionId[] => {
  const out: SectionId[] = [];
  const [cx, cy, cz] = params.camPos;
  const visit = (level: number, i: number, j: number) => {
    const sizeM = sectionCells * 2 ** level;
    const x0 = i * sizeM;
    const y0 = j * sizeM;
    if (!params.inView(x0, y0, x0 + sizeM, y0 + sizeM)) return;
    const dxy = Math.hypot(Math.max(x0 - cx, 0, cx - x0 - sizeM), Math.max(y0 - cy, 0, cy - y0 - sizeM));
    if (dxy > params.farM) return;
    const top = params.featureTop(x0 + sizeM / 2, y0 + sizeM / 2);
    const dist = Math.max(1, Math.hypot(dxy, Math.max(0, cz - top)));
    if (level > 0 && (!params.canSplit || params.canSplit(level, i, j))) {
      const finerPixels = 2 ** (level - 1) / (dist * params.pixelAngle);
      const wantsSplit = finerPixels >= params.splitPixels;
      if (params.decide ? params.decide(level, i, j, wantsSplit, finerPixels) : wantsSplit) {
        for (let subJ = 0; subJ < 2; subJ++) for (let subI = 0; subI < 2; subI++) visit(level - 1, i * 2 + subI, j * 2 + subJ);
        return;
      }
    }
    out.push({ L: level, i, j });
  };
  const S0 = sectionCells * 2 ** coarsestLevel;
  for (let j = Math.floor((cy - params.farM) / S0); j <= Math.floor((cy + params.farM) / S0); j++)
    for (let i = Math.floor((cx - params.farM) / S0); i <= Math.floor((cx + params.farM) / S0); i++) visit(coarsestLevel, i, j);
  return out;
};
