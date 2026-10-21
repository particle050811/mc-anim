// 远景包（离线算的主世界高度和群系网格）的读取和查询：游戏坐标 → 最高实心方块 y、地表群系。
// 数据：远景包（包目录下 远景.json、远景.高.bin.gz、远景.群.bin.gz，格式见 远景包.mjs）：游戏坐标上每 32 米一个点，
//   点上是那一列的最高实心方块 y（deepslate 按种子和史诗地形 + 修整包算）和地表群系。
//   加密的两层（工具/选种/远景加密.mjs）：中层（远景.中.*）导入范围 15 km 内的陆地按 16 米一格，细带（远景.细.*）导入范围外 1 km 内按 8 米一格，交界两边的起伏接得上；
//   每层存和下面各层的差，这里按层加上去。交界高差核对用 工具/导入/交界.ts。
// 群系按最近的网格点取，取之前把坐标扭一下，边不是 32 米的直角台阶（`distantBiome`）。网格外面当深海（海底 y 30）：远景包已经比镜头看得到的范围大一圈。
import { fetchGunzip, fetchJson, fetchJsonIfAny, loadOnce } from '../core/数据源.ts';
import { hash2, simplex2 } from '../core/噪声.ts';

export type DistantGrid = {
  packName: string;
  x0: number; // 第 0 格的游戏坐标（方块 x）
  z0: number;
  step: number;
  nx: number;
  nz: number;
  海平面: number; // 63
  高: Int16Array; // nz 行 × nx 列：最高实心方块 y
  群: Uint8Array; // 地表群系，下标进 群系名
  群系名: string[];
  温度: number[];
  // 加密层（工具/选种/远景加密.mjs）：中层、细带，各存和下面各层的差（分米），没有的层不在里面
  层: DetailLayer[];
};
export type DetailLayer = { 名: string; step: number; 块边: number; n: number; 块: Map<number, number>; 差: Int16Array };

const buildHint = '先跑 npm run 远景:主世界-116（工具/选种/远景包.mjs）';
// dir：远景包的版本目录（lib/体素/区段包位置.ts 的 packDir），各文件都从这一版取
export const loadDistantGrid = (dir: string, packName: string): Promise<DistantGrid> =>
  loadOnce(`${dir}/远景`, async () => {
    const meta = await fetchJson<{ x0: number; z0: number; step: number; nx: number; nz: number; 海平面: number; 群系名: string[]; 群系温度: number[] }>(`${dir}/远景.json`, buildHint);
    const [heightBuf, biomeBuf] = await Promise.all([fetchGunzip(`${dir}/远景.高.bin.gz`, buildHint), fetchGunzip(`${dir}/远景.群.bin.gz`, buildHint)]);
    const layers: DetailLayer[] = [];
    for (const layerName of ['中', '细']) {
      const layerMeta = await fetchJsonIfAny<Parameters<typeof buildDetailLayer>[1]>(`${dir}/远景.${layerName}.json`);
      if (!layerMeta) {
        console.warn(`远景：${packName} 没有${layerName === '中' ? '中层' : '细带'}（远景.${layerName}.json），跑 npm run 远景:${layerName === '中' ? '中层' : '细带'}`);
        continue;
      }
      const deltas = new Int16Array(await fetchGunzip(`${dir}/远景.${layerName}.bin.gz`, buildHint));
      layers.push(buildDetailLayer(layerName, layerMeta, deltas));
    }
    return { packName, x0: meta.x0, z0: meta.z0, step: meta.step, nx: meta.nx, nz: meta.nz, 海平面: meta.海平面, 高: new Int16Array(heightBuf), 群: new Uint8Array(biomeBuf), 群系名: meta.群系名, 温度: meta.群系温度, 层: layers };
  });

// ---------- 查网格（游戏坐标，连续：方块 x 占 [x, x + 1)） ----------
const outsideHeight = 30; // 网格外当深海：海底 y 30（主世界深海底大致在这）
// 网格点 (i, j) 的最高实心方块 y；网格外是深海底
const pointHeight = (W: DistantGrid, i: number, j: number) => (i < 0 || j < 0 || i >= W.nx || j >= W.nz ? outsideHeight : W.高[j * W.nx + i]);
const tileKey = (tx: number, tz: number) => (tx + 32768) * 65536 + (tz + 32768);
// 远景.<层>.json 的内容 + 解开的差 → 加密层（Node 里的脚本也用）
export const buildDetailLayer = (layerName: string, meta: { step: number; 块边: number; n: number; 块: [number, number][] }, deltas: Int16Array): DetailLayer => {
  const tileOffsets = new Map<number, number>();
  meta.块.forEach(([x0, z0], b) => tileOffsets.set(tileKey(x0 / meta.块边, z0 / meta.块边), b * meta.n * meta.n));
  return { 名: layerName, step: meta.step, 块边: meta.块边, n: meta.n, 块: tileOffsets, 差: deltas };
};
// 一层的差（米）：块按 块边 对齐，块里 n×n 个点，点 (i, j) 是方块 (x0 + i·step, z0 + j·step)；块外是 0
const layerDelta = (layer: DetailLayer, gx: number, gz: number) => {
  const x = gx - 0.5, z = gz - 0.5;
  const tx = Math.floor(x / layer.块边), tz = Math.floor(z / layer.块边);
  const tileOffset = layer.块.get(tileKey(tx, tz));
  if (tileOffset === undefined) return 0;
  const gridU = (x - tx * layer.块边) / layer.step, gridV = (z - tz * layer.块边) / layer.step;
  const i = Math.min(layer.n - 2, Math.floor(gridU)), j = Math.min(layer.n - 2, Math.floor(gridV));
  const fu = gridU - i, fv = gridV - j;
  const k = tileOffset + j * layer.n + i;
  const d00 = layer.差[k], d10 = layer.差[k + 1], d01 = layer.差[k + layer.n], d11 = layer.差[k + layer.n + 1];
  return (d00 + (d10 - d00) * fu + (d01 - d00) * fv + (d00 - d10 - d01 + d11) * fu * fv) / 10;
};
// 双线性：点 (i, j) 代表方块 (x0 + i·step, z0 + j·step) 的中心；再加上各加密层的差
export const distantTop = (grid: DistantGrid, gx: number, gz: number) => {
  const gridU = (gx - 0.5 - grid.x0) / grid.step;
  const gridV = (gz - 0.5 - grid.z0) / grid.step;
  const i = Math.floor(gridU), j = Math.floor(gridV);
  const fu = gridU - i, fv = gridV - j;
  const h00 = pointHeight(grid, i, j), h10 = pointHeight(grid, i + 1, j), h01 = pointHeight(grid, i, j + 1), h11 = pointHeight(grid, i + 1, j + 1);
  let height = h00 + (h10 - h00) * fu + (h01 - h00) * fv + (h00 - h10 - h01 + h11) * fu * fv;
  for (const layer of grid.层) height += layerDelta(layer, gx, gz);
  return height;
};
// 群系：取最近的网格点（网格外当深海）。取之前把坐标扭一下：网格 32 米一个点，直接取最近的点，群系的边是一级级 32 米的直角台阶，游戏里群系 4 米一格、边不规则。
// 扭法：64 米一片的噪声推 ±12 米，再按 4 米一格的哈希抖 ±6 米；只挪取样点，各群系的面积不变。
const warpX = simplex2(91), warpZ = simplex2(92);
export const distantBiome = (grid: DistantGrid, gx: number, gz: number) => {
  const ix = Math.floor(gx / 4), iz = Math.floor(gz / 4);
  const wx = gx + 12 * warpX(gx / 64, gz / 64) + (hash2(ix, iz, 93) - 0.5) * 12;
  const wz = gz + 12 * warpZ(gx / 64, gz / 64) + (hash2(ix, iz, 94) - 0.5) * 12;
  const i = Math.round((wx - 0.5 - grid.x0) / grid.step);
  const j = Math.round((wz - 0.5 - grid.z0) / grid.step);
  if (i < 0 || j < 0 || i >= grid.nx || j >= grid.nz) return 'minecraft:deep_ocean';
  return grid.群系名[grid.群[j * grid.nx + i]];
};
// [gx0, gx1) × [gz0, gz1) 这一片方块里最高的地面（最高实心方块 y）：四个角那几块的中心双线性，加上落在里面的网格点
export const distantAreaTop = (grid: DistantGrid, gx0: number, gz0: number, gx1: number, gz1: number) => {
  if (gx1 - gx0 <= 1) return distantTop(grid, gx0 + 0.5, gz0 + 0.5);
  let height = Math.max(distantTop(grid, gx0 + 0.5, gz0 + 0.5), distantTop(grid, gx1 - 0.5, gz0 + 0.5), distantTop(grid, gx0 + 0.5, gz1 - 0.5), distantTop(grid, gx1 - 0.5, gz1 - 0.5));
  const i0 = Math.ceil((gx0 + 0.5 - grid.x0) / grid.step), i1 = Math.floor((gx1 - 0.5 - grid.x0) / grid.step);
  const j0 = Math.ceil((gz0 + 0.5 - grid.z0) / grid.step), j1 = Math.floor((gz1 - 0.5 - grid.z0) / grid.step);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) height = Math.max(height, pointHeight(grid, i, j));
  return height;
};
