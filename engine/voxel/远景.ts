// 远景：导入范围外的主世界地形，用离线算的高度图（工具/选种/远景包.mjs）一列列生成方块，接在导入的地形外面（lib/体素/主世界地形.ts 拼）。
// Voxy 在这台 Mac 上用不了，照它的思路自己做（用户 10-04 定）：路线走廊在游戏里生成后导入，遥远地平线只给最远一圈兜底。
// 游戏里只预生成了航线两侧 1.5 km、岛 2.5 km、边城 3 km，各镜头往外看得更远，外面就是这里。
// 远景包的格式和查询见 远景网格.ts；群系的地表方块、树种、结冰见 远景群系.ts。
// 远景包不含：地表规则换的方块（按群系定，见 远景群系.ts 的 `biomeSetups`）、树（见 `树`）、雕刻器挖的峡谷、地表小湖。
// 一列怎么生成（第 L 级一格 s = 2^L 米，一列管 s × s 米）：
//   地面：这一列范围里最高的地面（四个角的双线性 + 范围里的网格点取最大）：照 Voxy 的 Mipper 粗格子里有一块就算有，和导入的粗级一样高。地面最上一格是群系的地表方块，下面 3 格底土，再往下石头。
//   水：地面最高实心方块 y ≤ 61 的列，地面上面到 y 62 是水，海平面 63。粗格子里水面和海底挤在同一格时这里画水，不照 Mipper 让海底（不透明度 15）盖过水（1），
//     否则远处的海全成了沙子和砾石，基地窗外要的是一望无际的海（用户 10-05 定）。导入的粗级区段也照这条补（lib/体素/主世界地形.ts 的 `fillWaterSurface`）。
//     海底最上面那块和第 0 级的水草照导入量出来的分布挑（lib/体素/远景海底.ts），粗级在海底上面那一格放一株；水面结不结冰照原版的温度规则（远景群系.ts 的 `waterFreezes`）。
//   草、花：露天的地面上照导入量出来的比例长（lib/体素/远景地面草.ts），第 0 级按量到的高度，粗级在地面上面那一格放一株。
//   树：照 Voxy 把远处的树合进粗格子（Mipper 挑到树冠就是树叶）。一格不到 8 米时一棵棵撒（4 米一格的抖动网格，按群系的郁闭度和冠幅定有没有树），
//     列里的取样点落在树冠里就是树叶，树冠顶按冠形（圆冠、锥冠）算；8 米以上按郁闭度算这一格露出树叶的概率（见 粗级），按哈希定，同一列在各个区段里（含 apron）一样。
//     树叶和树干的方块、染色和导入的一样走 方块染色。郁闭度、冠形先按原版 1.20.1 各群系的树估，再拿导入的地形逐群系核对（工具/导入/远景校准.ts，见 远景群系.ts 的 `biomeSetups` 注释）。
import { hash2 } from '../core/噪声.ts';
import { voxelFromState, blockProps, blockTint } from './真实方块表.ts';
import { patchRoll, pickSolid, pickPlant, kelpDensity, seabedFor, coarseSeaPlant } from './远景海底.ts';
import { fineGroundPlant, coarseGroundPlant } from './远景地面草.ts';
import { sectionCells, type SectionId } from './区段.ts';
import type { VoxelGrid, PaletteEntry } from './生成.ts';
import { distantAreaTop, distantBiome, distantTop, type DistantGrid } from './远景网格.ts';
import { biomeSetups, biomeTemperature, defaultBiome, grassBlock, gravel, oceanBiomes, sand, snowyGrass, steepSlope, stone, waterFreezes, 积雪, type BiomeSetup, type TreeKind } from './远景群系.ts';

export { buildDetailLayer, distantAreaTop, distantBiome, distantTop, loadDistantGrid, type DetailLayer, type DistantGrid } from './远景网格.ts';
export { biomeTemperature, waterFreezes } from './远景群系.ts';

// ---------- 树 ----------
// 细级（一格不到 8 米）一棵棵撒：4 米一格的抖动网格，每格最多一棵，有没有按群系郁闭度定：
// 一格有树的概率 p = −ln(1 − 郁闭)·格² / 冠面积（泊松撒点盖住地面的比例是 郁闭），超过 1 就格格有树（郁闭度到不了，但已经很密）
const treeCellM = 4;
const seeds = { hasTree: 11, posX: 12, posY: 13, treeKind: 14, coarse: 15, blend: 16, seabed: 17, seagrass: 18 };
type Tree = { x: number; y: number; kind: TreeKind; ground: number }; // 场景坐标（米），地：树根那列的地面（最高实心方块 y）
const pickTreeKind = (setup: BiomeSetup, roll: number): TreeKind | null => {
  let acc = 0;
  for (const [kind, weight] of setup.树) if (roll < (acc += weight)) return kind;
  return setup.树.length ? setup.树[setup.树.length - 1][0] : null;
};
const crownArea = (setup: BiomeSetup) => {
  let area = 0;
  for (const [kind, weight] of setup.树) area += weight * Math.PI * kind.半径 * kind.半径;
  return area || 1;
};
// 点 (px, py) 离树 t 多远时树冠顶、冠底（离地米数）；不在冠里返回 null
const crownHeights = (t: Tree, px: number, py: number): [number, number] | null => {
  const dist = Math.hypot(px - t.x, py - t.y);
  const { 半径: radius, crownTop, crownBottom, conical } = t.kind;
  if (dist > radius) return null;
  const k = dist / radius;
  // 锥冠：外圈矮；圆冠：顶上略圆
  const top = conical ? crownTop - k * (crownTop - crownBottom) * 0.85 : crownTop - k * k * 1.5;
  return [Math.max(crownBottom, Math.round(top)), crownBottom]; // 树冠占 y ∈ [根 + 冠底, 根 + 冠顶]
};

// ---------- 生成一个区段 ----------
// 场景 ↔ 游戏：游戏 x = X + ox，游戏 z = oz − Y，游戏 y = Z + oy（和导入的包同一个原点，见 lib/体素/区段包.ts）
export type DistantOrigin = [number, number, number];
// 一列：从下往上几段方块。z 都是场景坐标（米），地面顶 = 地面最上一块的上表面；草：海底上的水草、地面上的草和花，[地顶, 草顶) 是 草、最上一格是 草尖（粗级只有地面上面那一格）
type Column = { groundTop: number; surface: number; subsoil: number; waterTop: number; water: number; waterSurface: number; crownBottom: number; crownTop: number; leaf: number; trunkTop: number; trunk: number; plantTop: number; plant: number; plantTip: number };
const emptyColumn = (): Column => ({ groundTop: 0, surface: 0, subsoil: 0, waterTop: -Infinity, water: 0, waterSurface: 0, crownBottom: 0, crownTop: -Infinity, leaf: 0, trunkTop: -Infinity, trunk: 0, plantTop: 0, plant: 0, plantTip: 0 });
// 水草的方块：一格的海草；高海草两格（下半、上半）；海带下面是 kelp_plant、顶上一格是 kelp
const seaweedBlocks = (plantName: string, height: number): [string, string] =>
  plantName === 'minecraft:tall_seagrass'
    ? height >= 2
      ? ['minecraft:tall_seagrass[half=lower]', 'minecraft:tall_seagrass[half=upper]']
      : ['minecraft:seagrass', 'minecraft:seagrass']
    : plantName === 'minecraft:kelp'
      ? ['minecraft:kelp_plant', 'minecraft:kelp']
      : [plantName, plantName];

// 地面修正：游戏坐标处要给离线的地面加多少米（交界的过渡，见 工具/导入/交界.ts、lib/体素/主世界地形.ts），要平滑（只在格子中心取一次）
export type GroundCorrection = (gx: number, gz: number) => number;
// 只生成 要[c] 为真的列（c = y·34 + x，含 apron；不给就全生成），结果是一块新的 体素块（不要的列整列空气）
export const distantSection = (grid: DistantGrid, origin: DistantOrigin, section: SectionId, wantCol?: (colIdx: number) => boolean, correction?: GroundCorrection): VoxelGrid => {
  const [ox, oy, oz] = origin;
  const cellM = 2 ** section.L;
  const cells = sectionCells;
  const paddedCols = cells + 2;
  const XA = section.i * cells * cellM - cellM;
  const YA = section.j * cells * cellM - cellM;
  const seaLevel = grid.海平面; // 63：y ≤ 62 是水
  const waterZ = seaLevel - oy; // 场景 z：最上一格水（y 62）的上表面（主世界 −1）
  // ---- 色板 ----
  const palette: PaletteEntry[] = [{ v: 0, c: [255, 255, 255] }];
  const paletteIdByKey = new Map<number, number>();
  const voxelCache = new Map<string, number>();
  const voxelOf = (blockName: string) => {
    let voxel = voxelCache.get(blockName);
    if (voxel === undefined) voxelCache.set(blockName, (voxel = voxelFromState(blockName)));
    return voxel;
  };
  const paletteId = (blockName: string, biome: string, gx: number, gz: number) => {
    const voxel = voxelOf(blockName);
    if (!voxel) return 0;
    const tint = blockProps.tint[voxel] ? blockTint(voxel, biome, gx, gz) : 0xffffff;
    const k = voxel * 16777216 + tint;
    let i = paletteIdByKey.get(k);
    if (i === undefined) {
      i = palette.length;
      palette.push({ v: voxel, c: [(tint >> 16) & 255, (tint >> 8) & 255, tint & 255] });
      paletteIdByKey.set(k, i);
    }
    return i;
  };
  const stonePaletteId = paletteId(stone, 'minecraft:plains', 0, 0);
  // ---- 细级的树：区段（含 apron）外面多一圈最大冠幅 ----
  const isFine = cellM < 8;
  let treeCells: Tree[][] | null = null;
  let tx0 = 0, ty0 = 0, tn = 0;
  if (isFine) {
    const pad = 12; // 最大冠幅 + 抖动
    tx0 = Math.floor((XA - pad) / treeCellM);
    ty0 = Math.floor((YA - pad) / treeCellM);
    tn = Math.ceil((paddedCols * cellM + 2 * pad) / treeCellM) + 1;
    treeCells = new Array(tn * tn);
    for (let gridRow = 0; gridRow < tn; gridRow++)
      for (let gridCol = 0; gridCol < tn; gridCol++) {
        const ci = tx0 + gridCol, cj = ty0 + gridRow;
        // 按游戏坐标的格号取哈希（场景原点跟着导入包变，同一处的树不能跟着变）：场景格 ci ↔ 游戏 x 格 gi，场景格 cj ↔ 游戏 z 格 gj
        const gi = ci + ox / treeCellM, gj = oz / treeCellM - cj - 1;
        const x = (ci + hash2(gi, gj, seeds.posX)) * treeCellM;
        const y = (cj + 1 - hash2(gi, gj, seeds.posY)) * treeCellM;
        const gx = Math.floor(x) + ox, gz = oz - 1 - Math.floor(y);
        const biome = distantBiome(grid, gx, gz);
        const setup = biomeSetups[biome] ?? defaultBiome;
        if (!setup.郁闭) continue;
        const treeProb = (-Math.log(1 - setup.郁闭) * treeCellM * treeCellM) / crownArea(setup);
        if (hash2(gi, gj, seeds.hasTree) >= treeProb) continue;
        const ground = Math.round(distantTop(grid, gx + 0.5, gz + 0.5) + (correction ? correction(gx + 0.5, gz + 0.5) : 0));
        if (ground < seaLevel - 1) continue; // 水下不长（红树林的浅水另说，远处看不出）
        const kind = pickTreeKind(setup, hash2(gi, gj, seeds.treeKind));
        if (kind) (treeCells[gridRow * tn + gridCol] ??= []).push({ x, y, kind: kind, ground: ground });
      }
  }
  // ---- 每列 ----
  const cols: Column[] = new Array(paddedCols * paddedCols);
  let zmin = Infinity, zmax = -Infinity;
  const sampleOffsets = cellM <= 2 ? [0.5] : [0.25, 0.75];
  for (let row = 0; row < paddedCols; row++)
    for (let column = 0; column < paddedCols; column++) {
      const colIdx = row * paddedCols + column;
      if (wantCol && !wantCol(colIdx)) continue;
      const X0 = XA + column * cellM, Y0 = YA + row * cellM;
      // 这一列是游戏方块 x ∈ [X0 + ox, X0 + ox + s)、z ∈ [oz − Y0 − s, oz − Y0)
      const gx0 = X0 + ox, gz0 = oz - Y0 - cellM;
      const groundY = Math.round(distantAreaTop(grid, gx0, gz0, gx0 + cellM, gz0 + cellM) + (correction ? correction(gx0 + cellM / 2, gz0 + cellM / 2) : 0));
      const biome = distantBiome(grid, gx0 + cellM / 2, gz0 + cellM / 2);
      const setup = biomeSetups[biome] ?? defaultBiome;
      const temperature = biomeTemperature(grid, biome);
      const col = emptyColumn();
      col.groundTop = groundY + 1 - oy;
      const underwater = groundY <= seaLevel - 2;
      // 陡坡：列中心往四边各 max(s, step / 2) 米的坡度
      const slopeStep = Math.max(cellM, grid.step / 2);
      const cx = gx0 + cellM / 2, cz = gz0 + cellM / 2;
      const slope = Math.max(Math.abs(distantTop(grid, cx + slopeStep, cz) - distantTop(grid, cx - slopeStep, cz)), Math.abs(distantTop(grid, cx, cz + slopeStep) - distantTop(grid, cx, cz - slopeStep))) / (2 * slopeStep);
      let surfaceName = setup.地表;
      // 岸边：海、河群系里露出水面的列和水深不到 5 米的水底是沙（远景网格 32 米一格，海岸上的列常落在海群系里；照群系给砾石的话
      // 海岸是一道灰边，导入的同一段是沙滩、浅水沙底，交界俯看对出来的）
      if (surfaceName === gravel && oceanBiomes.has(biome) && groundY >= seaLevel - 5) surfaceName = sand;
      if (!underwater && setup.混 && hash2(gx0 >> section.L, gz0 >> section.L, seeds.blend + section.L) < setup.混[1]) surfaceName = setup.混[0];
      if (!underwater && setup.陡 && slope > steepSlope) surfaceName = setup.陡;
      else if (!underwater && surfaceName === grassBlock && 积雪(temperature, groundY)) surfaceName = snowyGrass;
      col.surface = paletteId(surfaceName, biome, gx0, gz0);
      col.subsoil = paletteId(surfaceName === setup.地表 || surfaceName === snowyGrass ? setup.subsoil : surfaceName, biome, gx0, gz0);
      if (underwater) {
        col.waterTop = waterZ;
        col.water = paletteId('minecraft:water', biome, gx0, gz0);
        col.waterSurface = waterFreezes(grid, biome, gx0 + cellM - 1, gz0 + cellM - 1) ? paletteId('minecraft:ice', biome, gx0, gz0) : col.water;
        // 海底和水草照导入量出来的分布挑（远景海底.ts）；量表里没有的照上面按群系定的
        const bed = seabedFor(biome, section.L, seaLevel - 1 - groundY);
        if (bed) {
          const roll = cellM <= 4 ? patchRoll(gx0 + cellM / 2, gz0 + cellM / 2, seeds.seabed) : hash2(gx0 >> section.L, gz0 >> section.L, seeds.seabed + section.L);
          col.surface = paletteId(pickSolid(bed.solid, roll), biome, gx0, gz0);
          const plant = bed.plants.length ? pickPlant(bed.plants, hash2(gx0, gz0, seeds.seagrass), kelpDensity(gx0, gz0)) : null;
          const plantHeight = plant ? Math.min(plant[1], waterZ - col.groundTop) : 0;
          if (plant && plantHeight > 0) {
            const [lowerBlock, upperBlock] = seaweedBlocks(plant[0], plantHeight);
            col.plantTop = col.groundTop + plantHeight;
            col.plant = paletteId(lowerBlock, biome, gx0, gz0);
            col.plantTip = paletteId(upperBlock, biome, gx0, gz0);
          }
        }
        // 粗级：照第 0 级的水草比例在海底上面那一格放一株（远景海底.ts 的 粗级水草），水面那一格不放
        if (section.L >= 1) {
          const plantName = coarseSeaPlant(biome, seaLevel - 1 - groundY, gx0, gz0, section.L);
          const kg = Math.floor((col.groundTop - 1) / cellM);
          if (plantName && kg + 1 < Math.floor((waterZ - 1) / cellM)) {
            col.plantTop = (kg + 2) * cellM;
            col.plant = col.plantTip = paletteId(plantName, biome, gx0, gz0);
          }
        }
      } else if (treeCells) {
        // 细级：取样点落在哪棵树的冠里，冠顶取最高的
        let crownTopY = -Infinity, crownBottomY = 0, kind: TreeKind | null = null, hasTrunk = false;
        for (const fy of sampleOffsets)
          for (const fx of sampleOffsets) {
            const px = X0 + fx * cellM, py = Y0 + fy * cellM;
            const ai = Math.floor(px / treeCellM) - tx0, bj = Math.floor(py / treeCellM) - ty0;
            for (let bb = Math.max(0, bj - 2); bb <= Math.min(tn - 1, bj + 2); bb++)
              for (let aa = Math.max(0, ai - 2); aa <= Math.min(tn - 1, ai + 2); aa++) {
                const ts = treeCells[bb * tn + aa];
                if (!ts) continue;
                for (const t of ts) {
                  const crown = crownHeights(t, px, py);
                  if (!crown || t.ground + crown[0] <= crownTopY) continue;
                  crownTopY = t.ground + crown[0];
                  crownBottomY = t.ground + crown[1];
                  kind = t.kind;
                  hasTrunk = t.x >= X0 && t.x < X0 + cellM && t.y >= Y0 && t.y < Y0 + cellM;
                }
              }
          }
        if (kind && crownTopY > groundY) {
          col.crownTop = crownTopY + 1 - oy;
          col.crownBottom = Math.max(groundY + 1, crownBottomY) - oy;
          col.leaf = paletteId(kind.叶, biome, gx0, gz0);
          if (hasTrunk) {
            col.trunkTop = col.crownBottom;
            col.trunk = paletteId(kind.干, biome, gx0, gz0);
          }
        }
      } else if (setup.郁闭) {
        // 粗级：这一格露出来的是不是树叶。Mipper 按位序挑（东 > 上 > 南，一级级往下比），地面铺满整格，所以挑到的差不多是格子东南角那一列最上面的方块，
        // 只有在某一级上地面够不着上半格、树冠够得着时树叶才赢。按「东南角那列有树冠」再放大一点算：P = 1 − (1 − 郁闭)^k，第 3、4 级 k = 4，第 5、6 级 k = 8。
        // k 对着导入的粗级树叶比例校准（工具/导入/远景校准.ts）：第 5、6 级合并的层数多，树叶赢的机会多，k = 4 时远处的平原偏浅；
        // 按「格子里有树就算」估的 1 − e^(−λ/2) 会让远处的平原全成树林。
        if (hash2(gx0 >> section.L, gz0 >> section.L, seeds.coarse + section.L) < 1 - (1 - setup.郁闭) ** (section.L >= 5 ? 8 : 4)) {
          const kind = pickTreeKind(setup, hash2(gx0 >> section.L, gz0 >> section.L, seeds.treeKind + section.L))!;
          col.crownTop = groundY + 1 + kind.crownTop - oy;
          col.crownBottom = groundY + Math.max(1, kind.crownBottom) - oy;
          col.leaf = paletteId(kind.叶, biome, gx0, gz0);
        }
      }
      // 地面上的草、花（远景地面草.ts）：露天的地面上长，第 0 级按量到的高度，粗级在地面上面那一格放一株；积雪的不长、有树干的列不长
      if (!underwater && !col.trunk && surfaceName !== snowyGrass) {
        if (section.L === 0) {
          const growth = fineGroundPlant(biome, surfaceName, gx0, gz0);
          if (growth) {
            col.plantTop = col.groundTop + growth[2];
            col.plant = paletteId(growth[0], biome, gx0, gz0);
            col.plantTip = paletteId(growth[1], biome, gx0, gz0);
          }
        } else {
          const plantName = coarseGroundPlant(biome, surfaceName, gx0, gz0, section.L, false);
          if (plantName) {
            col.plantTop = (Math.floor((col.groundTop - 1) / cellM) + 2) * cellM;
            col.plant = col.plantTip = paletteId(plantName, biome, gx0, gz0);
          }
        }
      }
      cols[colIdx] = col;
      zmin = Math.min(zmin, col.groundTop - 4);
      zmax = Math.max(zmax, col.groundTop, col.waterTop, col.crownTop, col.plantTop);
    }
  if (zmin === Infinity) return { nx: paddedCols, ny: paddedCols, nz: 1, 格: cellM, 原点: [XA + cellM, YA + cellM, 0], vox: new Uint16Array(paddedCols * paddedCols), 色板: palette, 水面: waterZ };
  // ---- 开格子：第 k 格是场景 z ∈ [k·s, (k + 1)·s) ----
  const kmin = Math.floor(zmin / cellM);
  const kmax = Math.floor((zmax - 1) / cellM);
  const nz = kmax - kmin + 1;
  const vox = new Uint16Array(paddedCols * paddedCols * nz);
  for (let colIdx = 0; colIdx < paddedCols * paddedCols; colIdx++) {
    const col = cols[colIdx];
    if (!col) continue;
    const kTop = Math.floor((Math.max(col.groundTop, col.waterTop, col.crownTop, col.plantTop) - 1) / cellM);
    for (let k = kmin; k <= kTop; k++) {
      const z0 = k * cellM, z1 = z0 + cellM;
      let paletteIdx = 0;
      // 一格里最上面那块不透明的（树叶 > 树干 > 地面），水草，水面那一格画水（见文件头），再没有就是水
      if (col.leaf && col.crownBottom < z1 && col.crownTop > z0) paletteIdx = col.leaf;
      else if (col.trunk && col.groundTop < z1 && col.trunkTop > z0) paletteIdx = col.trunk;
      else if (col.plant && col.groundTop <= z0 && z0 < col.plantTop) paletteIdx = z0 === col.plantTop - 1 ? col.plantTip : col.plant; // 第 0 级一格一米，粗级只有一格
      else if (col.water && z0 <= waterZ - 1 && waterZ - 1 < z1) paletteIdx = col.waterSurface;
      else if (col.groundTop > z0) {
        const z = Math.min(col.groundTop, z1) - 1; // 这一格里最上面那块地面
        paletteIdx = z === col.groundTop - 1 ? col.surface : z >= col.groundTop - 4 ? col.subsoil : stonePaletteId;
      } else if (col.water && waterZ > z0) paletteIdx = col.water;
      vox[(k - kmin) * paddedCols * paddedCols + colIdx] = paletteIdx;
    }
  }
  return { nx: paddedCols, ny: paddedCols, nz, 格: cellM, 原点: [XA + cellM, YA + cellM, kmin * cellM], vox, 色板: palette, 水面: waterZ };
};
