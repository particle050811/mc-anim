// 6-4-3 碎块：箭挑飞后击穿洞顶的那几格（藏网格、补洞壁、破坏粒子、落石）。
import type { V3 } from '@engine/model/parts.tsx';
import { closeupBreakClockScale } from '@库/特效/方块破坏粒子.tsx';
import type { DebrisBurst, DebrisFace, 矛管 } from '@库/特效/方块飞溅.tsx';
import * as geom from '../几何.ts';
import { gameToScene, add, sub, lerpV, storySecAt } from './公用.ts';
// 碎块.json：npm run 取材 -- 6-4-3碎块，从 古城4x-西3 网格取 `击穿方块` 那 7 格（一格一个盒子，不推实心里层），
// 第 8 个盒子是旁边一格，不当碎块（画面.tsx 只取前 7 个）。古城4x 网格重导后要跟着重导这份，不然 UV 对不上新图集。只藏、只画这几格本身，不用工具给的外扩一圈（外圈六面都补画，缝里会多出整块）。
// 箭尖扫到哪格，那格当场崩成原版破坏粒子，粒子时钟按近景特效倍速；
// 洞顶底面朝下露着的那块（`掉落方块`）被撞松，连同碎渣按原速、原版下落方块重力 0.04 格/刻² 落到李樱右前方低一层的地上（游戏 y −51）。
const groundZ = gameToScene(0, geom.落石地面y, 0)[2];
export const DEBRIS_HIDE: number[][] = geom.击穿方块.map(([x, y, z]) => {
  const lo = gameToScene(x, y, z + 1);
  const hi = gameToScene(x + 1, y + 1, z);
  return [lo[0] - 0.005, lo[1] - 0.005, lo[2] - 0.005, hi[0] + 0.005, hi[1] + 0.005, hi[2] + 0.005];
});
// 洞壁：方块崩掉后要补画四周实心方块朝洞里的面（网格按游戏渲染器导，被挡的面本来没有），否则从洞口看是一块没贴图的灰板。
// 只补朝着那 7 格的面，不补整块。方块数据来自 工具/挡箭/搜挑飞.py 打印的「洞壁」，
// 贴图用 古城4x-西3 图集里这几种方块的原版贴图（深板岩上下面是 deepslate_top），亮度按面朝向（上 1.0、南北 0.8、东西 0.6、下 0.5）
const holeWallBlocks: [number, number, number, geom.洞顶方块][] = [
  [-1084, -31, 193, '幽匿块'], [-1085, -31, 192, '深板岩'], [-1084, -30, 193, '幽匿块'], [-1086, -30, 193, '幽匿块'],
  [-1085, -30, 192, '深板岩'], [-1084, -29, 193, '深板岩'], [-1086, -29, 193, '凝灰岩'], [-1085, -29, 192, '深板岩'],
  [-1084, -28, 193, '深板岩'], [-1086, -28, 193, '凝灰岩'], [-1085, -28, 192, '深板岩'], [-1084, -27, 193, '幽匿块'],
  [-1086, -27, 193, '深板岩'], [-1085, -27, 192, '深板岩'], [-1084, -26, 193, '幽匿块'], [-1085, -26, 192, '深板岩'],
  [-1083, -15, 193, '深板岩'], [-1085, -15, 193, '深板岩'], [-1084, -15, 194, '深板岩'],
  [-1084, -15, 192, '深板岩'],
];
// 图集里的贴图范围 [u0, v0, u1, v1]（往里收一丝，免得取到隔壁贴图）。是当前 古城4x-西3.网格.png 里的位置，网格一重导就变：拿客户端 jar 的原版贴图在新图集里逐格比对重查
const textureUv = { sculk: [0, 0.375, 0.0625, 0.4375], tuff: [0.75, 0.25, 0.8125, 0.3125], deepslate: [0.5625, 0.5, 0.625, 0.5625], deepslateTop: [0.5, 0.25, 0.5625, 0.3125] };
const inset = ([u0, v0, u1, v1]: number[]) => [u0 + 0.00003, v0 + 0.00003, u1 - 0.00003, v1 - 0.00003];
const faceBrightness: Record<string, number> = { '+z': 1, '-z': 0.5, '+y': 0.8, '-y': 0.8, '+x': 0.6, '-x': 0.6 };
// 场景坐标的方向（Z 朝上、北 = +Y）→ 方块飞溅.tsx 的面方向
const faceDirName = (d: V3) => (d[0] ? (d[0] > 0 ? '+x' : '-x') : d[1] ? (d[1] > 0 ? '+y' : '-y') : d[2] > 0 ? '+z' : '-z');
export const holeWalls: { p: number[]; d: string; f: DebrisFace }[] = (() => {
  const out: { p: number[]; d: string; f: DebrisFace }[] = [];
  for (const [x, y, z, blockKind] of holeWallBlocks) {
    const solidCenter = geom.方块中心([x, y, z]);
    for (const brokenBlock of geom.击穿方块) {
      if (Math.abs(brokenBlock[0] - x) + Math.abs(brokenBlock[1] - y) + Math.abs(brokenBlock[2] - z) !== 1) continue;
      const brokenCenter = geom.方块中心(brokenBlock);
      const dir = sub(brokenCenter, solidCenter) as V3; // 从这块实心方块指向崩掉的那一格：露出来的就是这一面
      const faceDir = faceDirName(dir);
      const uv = blockKind === '幽匿块' ? textureUv.sculk : blockKind === '凝灰岩' ? textureUv.tuff : faceDir === '+z' || faceDir === '-z' ? textureUv.deepslateTop : textureUv.deepslate;
      const k = 255 * faceBrightness[faceDir];
      out.push({ p: lerpV(solidCenter, brokenCenter, 0.5), d: faceDir, f: [...inset(uv), k, k, k] });
    }
  }
  return out;
})();
const tubePoints = Array.from({ length: 2 }, (_, i) => {
  const dist = i * (geom.洞顶程 + 1);
  const point = add(geom.弹开点, geom.挑飞方向, dist);
  return [point[0], point[1], point[2], (dist - 0.225) / geom.箭速上限];
});
// 每个盒子一根管（方块飞溅.tsx 按管对象缓存，同一根管不能给两个盒子共用）
const tubes: 矛管[] = geom.击穿方块.map(() => ({ 点: tubePoints, 半径: 0.1, particleClockScale: closeupBreakClockScale.墙 }));
const fallingSet = new Set(geom.掉落方块.map((b) => b.join()));
// 掉下来的那块落地的剧情时刻（箭碰到起按 16 米/秒² 下落，方块中心落到 `groundZ` + 0.5）：声音.tsx 的落地声在这一刻
export const rockLandSec = (() => {
  const fallBlock = geom.掉落方块[0];
  const i = geom.击穿方块.findIndex((x) => x.join() === fallBlock.join());
  return geom.弹开 + geom.击穿时刻[i] + Math.sqrt((2 * (geom.方块中心(fallBlock)[2] - groundZ - 0.5)) / 16);
})();
export const debrisBursts = (globalFrame: number): DebrisBurst[] => {
  const t = storySecAt(globalFrame);
  return geom.击穿方块.map((block, i) => {
    const hitSec = geom.弹开 + geom.击穿时刻[i];
    const base = { dir: [0, 0, -1] as V3, origin: geom.方块中心(block), seed: 30 + i, hidden: true };
    if (fallingSet.has(block.join())) return { ...base, sec: t - hitSec, speed: 1, spread: 1.5, gravity: 16, spin: 4, chips: 5, 地面: groundZ };
    return { ...base, sec: t - geom.弹开, speed: 0, spread: 0, 管: tubes[i] };
  });
};
