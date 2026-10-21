// 边城摆进主世界真实地形（主世界-116）后，导入地形要做的改动：城址整平、竖井和古城的范围挖掉。6-2-5、6-2-6、第 3 场共用一份缓存。
// 用户 10-05 定：城中心 (8960, -5376)；地面高度按城址实际地形（见 主世界116.ts 的 `borderTownGroundY`）；城的朝向不变。
// 整平范围按城的占地（城墙里面含城门洞，加城墙、塔楼、勒脚、扶壁贴地那一层，即 边城/布局.ts 的 z = 0 层），不是大矩形，否则扶壁之间会挖沟或垫台；城外一格不动。
// 填的方块：城墙里面填泥土（上面盖石半砖地面），城墙一圈底下填圆石（与墙脚、勒脚同种）。
// 竖井（井心 ±11 格整块网格，镜头/6-3-下坠/竖井.tsx）整根挖掉，古城按五块网格合起来的范围挖。导入区段只存地表往下几格（区段包.ts 的 `kBottom`），古城挖不到东西，只是把范围写全；
// 镜头在地面以下时本来就不画导入地形（6-3-下坠/画面.tsx）。
import type { LandmarkCutout, FlattenArea } from '../../engine/voxel/导入地形.ts';
import { innerBounds, buildTown } from './边城/布局.ts';
import { overworldOrigin, routeGameXz, borderTownGroundY } from './主世界116.ts';

const fillBlocks = ['minecraft:dirt', 'minecraft:cobblestone'];
const townCenter = routeGameXz.borderTown;
// 城的局部格 (x, y) ↔ 游戏方块 (城心x + x, 城心z − 1 − y)（城的原点在方块角上，北 = +Y = 游戏 −z）
let flattenCache: FlattenArea[] | null = null;
export const borderTownFlatten = (): FlattenArea[] => {
  if (flattenCache) return flattenCache;
  const { v: grid } = buildTown();
  const margin = 16; // 罩比城的体素范围大一圈，免得漏掉挑出去的东西
  const xs = [grid.x0 - margin, grid.x0 + grid.nx + margin];
  const ys = [grid.y0 - margin, grid.y0 + grid.ny + margin];
  const nx = xs[1] - xs[0];
  const nz = ys[1] - ys[0];
  // 罩的第 (i, j) 列是游戏方块 (x0 + i, z0 + j)；z0 对应城的局部 y 最大（最北）那一行
  const x0 = townCenter[0] + xs[0];
  const z0 = townCenter[1] - ys[1];
  const mask = new Uint8Array(nx * nz);
  const gateway = { x: 12, y0: innerBounds.y, y1: innerBounds.y + 8 }; // 城门洞的地面（边城轮廓.tsx 的 `floorCuboids`：x ±12、y 197～205）
  for (let j = 0; j < nz; j++) {
    const y = townCenter[1] - 1 - (z0 + j); // 这一行在城里的局部 y
    for (let i = 0; i < nx; i++) {
      const x = x0 + i - townCenter[0];
      const inside = Math.abs(x + 0.5) < innerBounds.x && Math.abs(y + 0.5) < innerBounds.y;
      const inGate = Math.abs(x + 0.5) < gateway.x && y + 0.5 > gateway.y0 && y + 0.5 < gateway.y1;
      if (inside || inGate) mask[j * nx + i] = 1;
      else if (grid.get(x, y, 0)) mask[j * nx + i] = 2;
    }
  }
  // 城里的泥土上面盖着城的地面，粗级往下取整（见 导入地形.ts 的 `covered`）；城墙一圈的圆石在城外露着，照常往上取整
  flattenCache = [{ x0, z0, nx, nz, 罩: mask, 地面y: borderTownGroundY, fillBlocks, covered: [true, false] }];
  return flattenCache;
};

// 古城五块网格（模型/场景/古城*.网格.json）合起来的范围：x −832～−600、z 124～342、y −56～4（片场存档的游戏坐标），相对竖井那一列的中心 (−709.5, 240.5)、古城地面 y −50；竖井.tsx 把古城地面放在 `ancientCityFloorZ`
const ancientCity = { x: [-122.5, 110.5], z: [-116.5, 102.5], topOffset: 55 - 123 }; // 顶：古城最上面那层方块的顶面比城的地面低多少（米）
// 挖框：中心 = 井心（场景坐标，6-3-下坠/编排.ts 的 `shaftCellCenter()`）。竖井网格（6-3-下坠/竖井4x.网格.*）是井心 ±半宽格（11）的整块，从城的地面一直到古城，这一块导入的地形整列挖掉
export const shaftCutouts = (center: number[], halfWidth: number): LandmarkCutout[] => {
  const [ox, , oz] = overworldOrigin;
  const gx = Math.floor(center[0] + ox);
  const gz = Math.floor(oz - center[1]);
  const ancientCityTopY = borderTownGroundY + ancientCity.topOffset;
  return [
    { from: [gx - halfWidth, -64, gz - halfWidth], to: [gx + halfWidth, 319, gz + halfWidth] },
    { from: [Math.floor(gx + 0.5 + ancientCity.x[0]), -64, Math.floor(gz + 0.5 + ancientCity.z[0])], to: [Math.floor(gx + 0.5 + ancientCity.x[1]), ancientCityTopY, Math.floor(gz + 0.5 + ancientCity.z[1])] },
  ];
};
