// 导入区段：区段包里解出来的一个区段（SectionData）→ 体素块，连同挖地标、整平、随位置变的群系色（规则见 导入地形.ts 文件头）。
// 纯函数，主线程和区段工人（区段工人.ts）跑的是同一份，结果逐字节一样；所以这里不碰 remotion、DOM。
import { voxelFromState, blockTint, blockProps } from './真实方块表.ts';
import { sectionToVoxels, noBiome, type 包信息, type 包表, type SectionData } from './区段包.ts';
import type { VoxelGrid } from './生成.ts';

// 要挖掉的地标网格：from、to 是 *.网格.json 的导出范围（游戏坐标，都含）；
// 留：网格导出时 skip 掉、但游戏里看得到的方块（mcai mesh 的 skip 写法：方块 id 冒号后面的部分，* 通配），范围里照样由导入的地形画。
// 终焉高原城堡 skip 了周围的树、草和荆棘，网格里那片是秃的，被树干挡掉顶面的洞要靠导入的方块补上
export type LandmarkCutout = { from: number[]; to: number[]; 留?: string[] };
export type CutBox = { 盒: number[]; 留: RegExp | null };
export const globRegex = (pats: string[]) => new RegExp(`^(${pats.map((p) => p.replace(/\*/g, '.*')).join('|')})$`); // 写法里只有小写字母、下划线和 *

// 平整：一片地按列整平，给建在真实地形上的东西（边城：城里导入的地形挖掉、地面以下补实心地基，城外不动，城墙脚自然接上）。
// 罩：游戏方块列 [x0, x0 + nx) × [z0, z0 + nz) 每列一个值，0 = 不动，k ≥ 1 = 整平：`地面y` 以上挖空，以下（区段存的范围里）全换成 `填`[k − 1]。
// 粗级格子按中心那一列查罩；竖直方向格子底低于地面顶面就算地面以下（同 Mipper）。
// 区段只存地表附近（区段包.ts 的 `k底`），整平后的地面可能比存的范围高或低（`k底` 在地面顶以上时，下面「当实心」的格子不画顶面，挖开就是看穿的洞），
// 所以罩碰到的区段先把竖直范围扩到地面顶上下各一格，往下扩出来的格子填石头。
// `有盖`：和 `填` 一一对应，true 表示填方上面另有东西盖着（边城城墙里面是城自己的石半砖地面）。粗级格子的地面顶面不在格子边界上，
// 按「有一块实心就是实心」往上取整会让填方顶高出地面（远看街道被泥土埋住、只露房顶）。有盖的往下取整，缝被上面的地面盖住；没盖的（城墙脚外露的圆石）仍往上取整，免得露缝。
export type FlattenArea = { x0: number; z0: number; nx: number; nz: number; 罩: Uint8Array; 地面y: number; fillBlocks: string[]; covered?: boolean[] };

// 一个来源换体素块要的全部东西：包信息和表、按包里群系号的「随位置变」、挖哪些框、整平哪些地。都能结构化克隆（RegExp 也能），工人那边照样建一份
export type 区段包信息 = Pick<包信息, '原点' | '状态' | '群系'>;
export type 区段上下文 = { info: 区段包信息; tables: 包表; variesByPos: boolean[]; cutBoxes: CutBox[]; flattenAreas: FlattenArea[] };

// 场景盒子 [x0, y0, z0, x1, y1, z1] 里格子中心落在里面的格子挖空（留 的方块不挖）
const carveOut = (voxels: VoxelGrid, data: SectionData, info: 区段包信息, cutBoxes: CutBox[]) => {
  const { nx, ny, nz, 格: cellM, 原点: origin, vox } = voxels;
  // 下标 a 的格子中心：原点 + (a − 1 + 0.5)·s（x、y 有一圈相邻格），z 是 原点 + (k + 0.5)·s
  const cellRange = (lo: number, hi: number, o: number, off: number, n: number): [number, number] => [
    Math.max(0, Math.ceil((lo - o) / cellM - 0.5 + off)),
    Math.min(n - 1, Math.ceil((hi - o) / cellM - 0.5 + off) - 1),
  ];
  for (const { 盒: [x0, y0, z0, x1, y1, z1], 留: keepRe } of cutBoxes) {
    const [a0, a1] = cellRange(x0, x1, origin[0], 1, nx);
    const [b0, b1] = cellRange(y0, y1, origin[1], 1, ny);
    const [k0, k1] = cellRange(z0, z1, origin[2], 0, nz);
    if (a0 > a1) continue; // 不跳过的话 fill 的终点算出负数，会从数组末尾倒着数、清掉一大片
    if (!keepRe) {
      for (let k = k0; k <= k1; k++) for (let j = b0; j <= b1; j++) vox.fill(0, (k * ny + j) * nx + a0, (k * ny + j) * nx + a1 + 1);
      continue;
    }
    // 色板号 → 留不留（状态串 "ns:名[属性]" 取冒号后、方括号前的名字比）
    const keepByPalette = Uint8Array.from({ length: data.palette.length / 2 }, (_, p) => (keepRe.test(info.状态[data.palette[2 * p]].replace(/^[^:]*:|\[.*$/g, '')) ? 1 : 0));
    for (let k = k0; k <= k1; k++)
      for (let j = b0; j <= b1; j++)
        for (let col = a0; col <= a1; col++) {
          const at = (k * ny + j) * nx + col;
          if (!keepByPalette[vox[at]]) vox[at] = 0;
        }
  }
};

// 每列有没有方块（1 = 有），下标 y * nx + x
const filledColumns = (voxels: VoxelGrid) => {
  const colCount = voxels.nx * voxels.ny;
  const filled = new Uint8Array(colCount);
  for (let column = 0; column < colCount; column++)
    for (let k = 0; k < voxels.nz; k++)
      if (voxels.vox[k * colCount + column]) {
        filled[column] = 1;
        break;
      }
  return filled;
};

const flatten = (voxels: VoxelGrid, info: 区段包信息, areas: FlattenArea[]): VoxelGrid => {
  const [ox, oy, oz] = info.原点;
  const cellM = voxels.格;
  const { nx, ny } = voxels;
  const colCount = nx * ny;
  for (const area of areas) {
    // 每列查罩（下标 a 的格子中心 x = 原点 + (a − 0.5)·s，见 挖）
    const maskByCol = new Uint8Array(colCount);
    let anyHit = false;
    for (let j = 0; j < ny; j++) {
      const gz = Math.floor(oz - (voxels.原点[1] + (j - 0.5) * cellM)) - area.z0;
      if (gz < 0 || gz >= area.nz) continue;
      for (let col = 0; col < nx; col++) {
        const gx = Math.floor(voxels.原点[0] + (col - 0.5) * cellM + ox) - area.x0;
        if (gx < 0 || gx >= area.nx) continue;
        const maskValue = area.罩[gz * area.nx + gx];
        if (maskValue) {
          maskByCol[j * nx + col] = maskValue;
          anyHit = true;
        }
      }
    }
    if (!anyHit) continue;
    const groundTop = area.地面y + 1 - oy; // 整平后地面的顶面（场景 z）
    const k0 = voxels.原点[2] / cellM;
    const k1 = k0 + voxels.nz;
    const n0 = Math.min(k0, Math.floor(groundTop / cellM) - 1);
    const n1 = Math.max(k1, Math.ceil(groundTop / cellM) + 1);
    if (n0 < k0 || n1 > k1) {
      const nz = n1 - n0;
      const vox = new Uint16Array(colCount * nz);
      vox.set(voxels.vox, (k0 - n0) * colCount);
      if (n0 < k0) {
        const stonePaletteIdx = voxels.色板.push({ v: voxelFromState('minecraft:stone'), c: [255, 255, 255] }) - 1;
        vox.fill(stonePaletteIdx, 0, (k0 - n0) * colCount);
      }
      voxels = { ...voxels, nz, 原点: [voxels.原点[0], voxels.原点[1], n0 * cellM], vox };
    }
    const fillPaletteIdx = area.fillBlocks.map((blockName) => voxels.色板.push({ v: voxelFromState(blockName), c: [255, 255, 255] }) - 1);
    // 格子底低于地面顶面的是 [0, kTop)；有盖的填方只填整格都在地面顶面以下的 [0, kTop有盖)
    const kTop = Math.ceil((groundTop - voxels.原点[2]) / cellM);
    const kTopCovered = Math.floor((groundTop - voxels.原点[2]) / cellM);
    for (let column = 0; column < colCount; column++) {
      const maskValue = maskByCol[column];
      if (!maskValue) continue;
      const topK = area.covered?.[maskValue - 1] ? kTopCovered : kTop;
      for (let k = 0; k < voxels.nz; k++) voxels.vox[k * colCount + column] = k < topK ? fillPaletteIdx[maskValue - 1] : 0;
    }
  }
  return voxels;
};

// 随位置变的群系里染色的格子，按格子最小角那一块（游戏坐标）重算颜色，色板跟着加项
const tintByPosition = (voxels: VoxelGrid, data: SectionData, info: 区段包信息, variesByPos: boolean[]) => {
  const { tint: TINT } = blockProps;
  const entryCount = data.palette.length / 2;
  const biomeToRetint: (string | null)[] = []; // 色板号 → 要重算时是群系 id
  let anyRetint = false;
  for (let idx = 0; idx < entryCount; idx++) {
    const biomeIdx = data.palette[2 * idx + 1];
    const biomeName = idx > 0 && biomeIdx !== noBiome && TINT[voxels.色板[idx].v] && variesByPos[biomeIdx] ? info.群系[biomeIdx] : null;
    biomeToRetint.push(biomeName);
    if (biomeName) anyRetint = true;
  }
  if (!anyRetint) return;
  const [ox, , oz] = info.原点;
  const { nx, ny, nz, 格: cellM, 原点: origin, vox, 色板: palette } = voxels;
  const paletteIdByKey = new Map<string, number>();
  for (let column = 0; column < nx * ny; column++) {
    const sceneX = origin[0] + ((column % nx) - 1) * cellM;
    const sceneY = origin[1] + (Math.floor(column / nx) - 1) * cellM;
    // 场景格 [Y, Y + s) 是游戏方块 z = oz − Y − s … oz − Y − 1（见 区段包.ts 的坐标），最小角那一块 z = oz − Y − s
    const gx = sceneX + ox, gz = oz - sceneY - cellM;
    for (let k = 0; k < nz; k++) {
      const at = k * nx * ny + column;
      const paletteIdx = vox[at];
      const biomeName = biomeToRetint[paletteIdx];
      if (!biomeName) continue;
      const voxel = palette[paletteIdx].v;
      const cc = blockTint(voxel, biomeName, gx, gz);
      const key = `${voxel},${cc}`;
      let i = paletteIdByKey.get(key);
      if (i === undefined) {
        i = palette.length;
        palette.push({ v: voxel, c: [(cc >> 16) & 255, (cc >> 8) & 255, cc & 255] });
        paletteIdByKey.set(key, i);
      }
      vox[at] = i;
    }
  }
};

// 一个区段 → 体素块：先整平、再挖（竖井那一块在城里，整平垫的地基也要一起挖开），最后按位置重算群系色
export const importedSectionVoxels = (data: SectionData, ctx: 区段上下文): VoxelGrid => {
  const { info, tables, cutBoxes, flattenAreas } = ctx;
  const voxels = flattenAreas.length ? flatten(sectionToVoxels(data, tables), info, flattenAreas) : sectionToVoxels(data, tables);
  // 记下整列挖空的列（`体素块` 的 `挖空`）：主世界地形把整列空气当成「区块没生成」拿远景补上，不记的话地标网格里会长出远景的草地和树
  const filledBefore = cutBoxes.length ? filledColumns(voxels) : null;
  carveOut(voxels, data, info, cutBoxes);
  if (filledBefore) {
    const filledAfter = filledColumns(voxels);
    const carvedCols = filledBefore.map((v, c) => (v && !filledAfter[c] ? 1 : 0));
    if (carvedCols.includes(1)) voxels.挖空 = carvedCols;
  }
  tintByPosition(voxels, data, info, ctx.variesByPos);
  return voxels;
};
