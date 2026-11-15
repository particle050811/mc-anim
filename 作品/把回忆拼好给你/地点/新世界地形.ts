// 第 1 句新世界那片地的生成法里两场共用的部分：平原、樱花林的数，起伏、山、花、樱花林里的树。纯计算（不 import react、three）。
// 场/2-新世界/地形.ts 铺第 1 句、第 2 句那一扇；场/2-祭坛/地形.ts 拿同一片地铺第 3 句祭坛四周（局部格，脚下压平）。两边是同一片地，改这里两边一起变。
// 远山、远林只在第 1 句那边（祭坛那边一直没加，见 场/2-祭坛/地形.ts）。
// 坐标是世界格：x 东、y 北、z 上，出生点那格地面顶在 z = 0。
import { fbm, hash2, simplex2 } from '@engine/core/噪声.ts';
import { smoothstep } from '@engine/core/数学.ts';

/** 平原（群系 plains）：起伏一两格；短草成片、高草夹在草丛里、花零星；橡树零星。
 *  花照原版 1.20.1 的 flower_plain（NoiseThresholdProvider）：一大片一大片地分区，噪声低于 郁金香阈 的地方出四种郁金香（橙、红、粉、白），
 *  别处三分之一出虞美人、蓝花美耳草、滨菊、矢车菊，其余是蒲公英。原版噪声尺度 0.005（一片两百来格），这里 郁金香尺度 取同一个量级、阈是 Agent 挑的，
 *  让出生点到樱花林这一路上有一片郁金香 */
export const plainsParams = {
  种子: 20230607,
  起伏: 2.4,
  undulationScale: 64,
  fineUndulation: 0.5,
  fineUndulationScale: 16,
  /** 出生点附近多大一块压平（你站的那块地是平的） */
  spawnFlatRadius: 4,
  grassRate: 0.3,
  tallGrassShare: 0.16,
  flowerRate: 0.02,
  tulipScale: 160,
  tulipThreshold: -0.22,
  /** 零星几棵橡树 [x, y, 树干高]：摆在镜头往樱花林那条视线两边，不挡粉色 */
  oaks: [
    [-22, 30, 5],
    [-37, 71, 6],
    [31, 46, 5],
    [64, 92, 5],
    [-58, 118, 4],
    [7, 96, 5],
  ] as const,
};

/** 樱花林（群系 cherry_grove，原版 1.20 樱花林长在山坡上）：一座缓坡小山，山顶一片樱花树、地上铺粉红花簇。
 *  离出生点约 165 格，是地平线上一点粉。渲染距离 12 区块（192 格）的雾从 172.8 格起：落定的镜头在你身后 23 格，林子朝镜头这一边在雾前面、
 *  后半片照原版淡进雾里；镜头往前推，整片林子从雾里清出来。
 *  山的轮廓按噪声扭：山脚、山顶的半径各处乘 1 ± 山扰（核查 10-24：原来是同心圆，一圈圈台阶一看就是人造的），坡上、顶上再加一点起伏。
 *  树长法照原版 CherryTrunkPlacer、CherryFoliagePlacer（地形.ts），这里只管种多密 */
export const cherryGrove = {
  心: [40, 160] as const,
  mountainHeight: 9,
  /** 山脚、山顶平台的半径（格）：山从 山半径 处开始起坡，到 顶半径 以内不再升 */
  mountainRadius: 42,
  topRadius: 15,
  mountainJitter: 0.32,
  mountainJitterScale: 34,
  /** 坡上、顶上的起伏（格） */
  slopeUndulation: 1.6,
  slopeUndulationScale: 11,
  forestRadius: 24,
  treeSpacing: 7,
  treeRate: 0.85,
  petalClusterRate: 0.35,
};

const noise = simplex2(plainsParams.种子);
/** 细起伏的噪声，铺草时也拿它定草丛疏密 */
export const fineNoise = simplex2(plainsParams.种子 + 7);
const mountainNoise = simplex2(plainsParams.种子 + 13);
const flowerNoise = simplex2(plainsParams.种子 + 29);

/** 樱花林那座山在 (i, j) 有多高（格，小数）：山脚、山顶的半径按噪声扭，坡上、顶上加一点起伏 */
export const mountainHeightAt = (i: number, j: number): number => {
  const L = cherryGrove;
  const distance = Math.hypot(i - L.心[0], j - L.心[1]);
  const jitter = 1 + L.mountainJitter * fbm(mountainNoise, i, j, L.mountainJitterScale, 3);
  const slope = smoothstep(L.mountainRadius * jitter, L.topRadius * jitter, distance);
  return L.mountainHeight * slope + L.slopeUndulation * fbm(mountainNoise, i + 500, j - 300, L.slopeUndulationScale, 2) * Math.min(1, slope * 3);
};

/** 平原的起伏（格，小数）：出生点附近压平一点，你站的那块地是平的 */
export const plainsUndulation = (i: number, j: number): number => {
  const undulation = plainsParams.起伏 * fbm(noise, i, j, plainsParams.undulationScale, 3) + plainsParams.fineUndulation * fbm(fineNoise, i, j, plainsParams.fineUndulationScale, 2);
  const distFromSpawn = Math.hypot(i, j);
  const roughness = smoothstep(plainsParams.spawnFlatRadius, plainsParams.spawnFlatRadius * 3, distFromSpawn);
  return undulation * roughness;
};

/** 离樱花林中心多远算樱花林（花簇、地上的树） */
export const inGrove = (i: number, j: number) => Math.hypot(i - cherryGrove.心[0], j - cherryGrove.心[1]) <= cherryGrove.forestRadius;
/** 这一列的群系是不是樱花林（草色、树叶色按它染）：林子和山坡下半截 */
export const isForest = (i: number, j: number) => inGrove(i, j) || Math.hypot(i - cherryGrove.心[0], j - cherryGrove.心[1]) <= cherryGrove.mountainRadius * 0.8;

/** 高：橡树的树干高（樱花树的高按原版自己抽，写 0） */
export type GroveTree = { i: number; j: number; 种: '橡' | '樱'; 高: number; 种子: number };

/** 樱花林里的树按格子撒（每 樱花林.树距 见方一棵，抖一抖），再加平原上零星几棵橡树（平原.橡树们，Agent 摆的） */
export const groveTrees = (): GroveTree[] => {
  const out: GroveTree[] = [];
  const d = cherryGrove.treeSpacing;
  const [cx, cy] = cherryGrove.心;
  for (let gx = Math.floor((cx - cherryGrove.forestRadius) / d); gx <= Math.ceil((cx + cherryGrove.forestRadius) / d); gx++)
    for (let gy = Math.floor((cy - cherryGrove.forestRadius) / d); gy <= Math.ceil((cy + cherryGrove.forestRadius) / d); gy++) {
      const i = Math.round(gx * d + (hash2(gx, gy, 1) - 0.5) * d * 0.7);
      const j = Math.round(gy * d + (hash2(gx, gy, 2) - 0.5) * d * 0.7);
      if (!inGrove(i, j) || hash2(gx, gy, 3) > cherryGrove.treeRate) continue;
      out.push({ i, j, 种: '樱', 高: 0, 种子: gx * 131 + gy });
    }
  for (const [i, j, treeHeight] of plainsParams.oaks) out.push({ i, j, 种: '橡', 高: treeHeight, 种子: i * 7 + j });
  return out;
};

const tulips = ['minecraft:orange_tulip', 'minecraft:red_tulip', 'minecraft:pink_tulip', 'minecraft:white_tulip'] as const;
const tallFlowers = ['minecraft:poppy', 'minecraft:azure_bluet', 'minecraft:oxeye_daisy', 'minecraft:cornflower'] as const;
/** 原版 flower_plain：噪声低于阈出郁金香（四种随机），不然三分之一出 高花们 里随机一种，其余蒲公英 */
export const plainsFlower = (i: number, j: number): string => {
  if (fbm(flowerNoise, i, j, plainsParams.tulipScale, 2) < plainsParams.tulipThreshold) return tulips[Math.floor(hash2(i, j, 14) * 4)]!;
  return hash2(i, j, 15) < 1 / 3 ? tallFlowers[Math.floor(hash2(i, j, 14) * 4)]! : 'minecraft:dandelion';
};
/** 粉红花簇朝向 */
export const petalFacing = ['north', 'east', 'south', 'west'] as const;
