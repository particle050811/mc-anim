// 边城布局：照原文第 3、4、6 章（归档/正篇/06-古城寻卷/3-边城/1-又回到边城/v.md 的 [边城]）一格一格搭。城是小说里的，设定库没有，尺寸自定。
// 有城墙塔楼（北面城门，门楼挂黑色翻牌显示器，不写字）、石半砖地面、殖民地蓝图房子（蓝图.ts）、中央传送石碑（Waystones 没装，用石砖柱代替）。
// 这些尺寸和坐标别的镜头在用，不能改：
//   城墙中线 480×400 米（x = ±240、y = ±200），墙厚 6、高 28（墙顶走道站人面 z = 28.5），塔楼 14 米见方；
//   北墙墙垛在外沿那排（y 202～203），x 每 4 格两格墙垛两格缺口（缺口中心 x 24、28…），6-3-4 卫兵站在 x 24～56 的缺口里（见 镜头/6-3-下坠/编排.ts 的 `guardPositions`）；
//   城门在 x ±12，两侧门楼到 x ±20；北墙里贴墙的登城石阶在西段 x −140～−113；东门楼旁 x 20～58 贴墙是落水池（6-3-8 卫兵从走道内沿跳下来，见 布局/共用.ts 的 `fallPool`）；
//   城里地面（石半砖）顶面 z = 0.5；6-3-6 李樱砸穿的竖井口在 (-0.5, 100.5)（见 镜头/6-3-下坠/编排.ts 的 `landingSpot`），位于南北大街（x ±12）和 y 97～103 横街的路口，坑和裂纹在井心 10 格以内，这圈不能有房子和街上小物件。
// 坐标：原点在城中心地面，Z 朝上，北 = +Y，东 = +X，1 格 = 1 米，格 (x, y, z) 占 [x, x+1]×[y, y+1]×[z, z+1]。
import { VoxelGrid } from './体素.ts';
import { HouseGrid } from './蓝图.ts';
import { W2, D2, buildBounds, mainStreetX, mainStreetY, streetsX, streetsY, plazaHalf, mulberry } from './布局/共用.ts';
import { buildWalls, buildTower, buildGate } from './布局/城墙.ts';
import { dwellings, workshops, publicBuildings, defenses, crossingBlockMaxHeight, cityBlock, buildPark, buildPlaza, streetProps } from './布局/街区.ts';

export { BORDER_TOWN, innerBounds } from './布局/共用.ts';

// ---------- 整座城 ----------
const freeIntervals = (lo: number, hi: number, cuts: [number, number][]) => {
  const sorted = [...cuts].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let cursor = lo;
  for (const [c0, c1] of sorted) {
    if (c0 > cursor) out.push([cursor, Math.min(c0, hi)]);
    cursor = Math.max(cursor, c1);
  }
  if (cursor < hi) out.push([cursor, hi]);
  return out.filter(([start, end]) => end - start >= 6);
};

export const buildTown = () => {
  const grid = new VoxelGrid(-W2 - 12, W2 + 12, -D2 - 12, D2 + 12, 64);
  const houseGrid = new HouseGrid(-W2, W2, -D2, D2, 40);
  const rand = mulberry(20261005);
  // 街区
  const xs = freeIntervals(-buildBounds.x, buildBounds.x, [...streetsX, mainStreetX]);
  const ys = freeIntervals(-buildBounds.y, buildBounds.y, [...streetsY, mainStreetY]);
  const blocks: [number, number, number, number][] = [];
  for (const [x0, x1] of xs) for (const [y0, y1] of ys) if (!(x0 >= -plazaHalf && x1 <= plazaHalf && y0 >= -plazaHalf && y1 <= plazaHalf)) blocks.push([x0, y0, x1, y1]);
  // 特别的街区：两个公园；靠城墙一圈是城防（兵营、箭塔、仓库）掺民居；广场四周的是公共建筑和商铺；竖井口路口四角限高
  const park = new Set([`${-146},${-136}`, `${148},${46}`]);
  for (const [x0, y0, x1, y1] of blocks) {
    const key = `${x0},${y0}`;
    const isOuter = x0 === -buildBounds.x || x1 === buildBounds.x || y0 === -buildBounds.y || y1 === buildBounds.y;
    const isCentral = Math.max(Math.abs(x0), Math.abs(x1)) <= 100 && Math.max(Math.abs(y0), Math.abs(y1)) <= 100;
    const isCrossing = Math.min(Math.abs(x0), Math.abs(x1)) <= 12 && (y0 === 103 || y1 === 97);
    const maxHeight = isCrossing ? crossingBlockMaxHeight : undefined;
    if (park.has(key)) buildPark(grid, x0, y0, x1, y1, rand);
    else if (isOuter) cityBlock(grid, houseGrid, x0, y0, x1, y1, rand, { main: defenses, secondary: [...dwellings, ...workshops], mainRatio: 0.45, maxHeight });
    else if (isCentral) cityBlock(grid, houseGrid, x0, y0, x1, y1, rand, { main: publicBuildings, secondary: [...dwellings, ...workshops], mainRatio: 0.6, maxHeight });
    else cityBlock(grid, houseGrid, x0, y0, x1, y1, rand, { main: dwellings, secondary: workshops, mainRatio: 0.7, maxHeight });
  }
  streetProps(grid, houseGrid);
  buildPlaza(grid, rand);
  buildWalls(grid);
  for (const [x, y] of [[-W2, -D2], [W2, -D2], [-W2, D2], [W2, D2]]) buildTower(grid, x, y, true);
  for (const [x, y] of [[-W2 / 3, -D2], [W2 / 3, -D2], [-W2 / 3, D2], [W2 / 3, D2], [-W2, 0], [W2, 0]]) buildTower(grid, x, y, false);
  buildGate(grid);
  return { v: grid, g: houseGrid };
};
