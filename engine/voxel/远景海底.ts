// 远景的海底：水下的列海底铺什么、长不长水草，照导入的地形量出来的分布挑（远景海底.json，工具/导入/海底校准.ts 写，npm run 远景:海底）。
// 为什么：导入的浅海底是沙、土、砾石、黏土一片片的，长着海草、海带，远景若一律铺沙或砾石，交界上海水颜色会直直地跳一下。水半透明、只有一层水面，
// 看到的就是水面下第一块不是水的东西，所以按级、按群系、按水深档量这个分布，远景照着挑，两边统计一样交界就没有直线。
// 具体比例见 远景海底.json。第 1 级起看不到水草（海草、海带和水不透明度一样，Mipper 按位序挑到的都是水），海底到第 3 级还是沙、砾石；第 5 级起浅处、第 6 级到处挑到的是海底下面的石头、深板岩。
// 挑法：第 0～2 级（一格 1～4 米）海底按 6 米一块的随机多边形（Voronoi）成片地挑，像游戏里的沙、黏土、砾石圆盘；第 3 级起一格一挑。
//   水草只在第 0 级：海草一格、高海草两格、海带按量到的高度（2～11 格）连着长，海带按 80 米一片的噪声成片（原版 NoiseBasedCountPlacement，一半地方没有），平均下来还是量到的比例。
// 表里没有的群系照类比：冷水海 → 海洋、冷水深海 → 深海、冻洋 → 海洋不长水草、深冻洋 → 深海不长水草、暖水海 → 温水海不长海带（珊瑚不做）、冻河 → 河、积雪沙滩 → 沙滩；
//   陆地群系里低于海面的列（湖、海边）按 河（浅）或 海洋。一档没量到就借同一群系相邻的档、相邻的级；都没有返回 null，远景照旧规则（浅水沙、深水按群系地表）。
// 粗级的水草（用户 10-09 看 6-2-5 海上交界有色差）：第 0 级海底发青，第 1 级起水草没了露出光秃秃的砾石、沙，交界上海色一跳。粗级照第 0 级的比例在海底上面那一格放水草方块，
//   跟着格子放大（一格 4 米就是 4 米高的一株），按哈希挑（`coarseSeaPlant`）。导入的粗级（lib/体素/主世界地形.ts 的 `fillSeagrass`）和远景的粗级共用这个函数，同一处结果一样。
//   备选是不放方块、挑 3 倍的海底格子把顶面贴图换成水草，色差略小但 3 倍是对着一帧调的、还要改网格；用户定了放方块（10-10）。
import { hash2, simplex2 } from '../core/噪声.ts';
import raw from 'asset:数据/体素/远景海底';

type SeabedStats = {
  深档: number[];
  群系: Record<string, { 级: { 档: ({ n: number; 实: [string, number][]; 草: [string, number][] } | null)[] }[]; 草高: ([string, number, number][] | null)[] }>;
};
const stats = raw as unknown as SeabedStats;
const depthBandCount = stats.深档.length + 1;
// 水深（米：水面 y 62 到海底最高实心方块 y 的格数）→ 档号
export const seabedBand = (depthM: number) => {
  let k = 0;
  while (k < stats.深档.length && depthM >= stats.深档[k]) k++;
  return k;
};

const biomeAnalogs: Record<string, { 用: string; dropPlants?: RegExp }> = {
  'minecraft:cold_ocean': { 用: 'minecraft:ocean' },
  'minecraft:deep_cold_ocean': { 用: 'minecraft:deep_ocean' },
  'minecraft:frozen_ocean': { 用: 'minecraft:ocean', dropPlants: /./ },
  'minecraft:deep_frozen_ocean': { 用: 'minecraft:deep_ocean', dropPlants: /./ },
  'minecraft:warm_ocean': { 用: 'minecraft:lukewarm_ocean', dropPlants: /kelp/ },
  'minecraft:frozen_river': { 用: 'minecraft:river' },
  'minecraft:snowy_beach': { 用: 'minecraft:beach' },
};

// 挑好的一档：实（海底最上面那块）累计比例；草（第 0 级）[方块, 格数, 比例]，比例加起来不到 1，剩下的是不长
export type SeabedSetup = { solid: [string, number][]; plants: [string, number, number][] };
const setupCache = new Map<string, SeabedSetup | null>();
// 一个群系在第 L 级、第 k 档的量表项：没有就借相邻的档（差一档）、相邻的级（差一级）
const findEntry = (biome: string, level: number, k: number) => {
  const biomeStats = stats.群系[biome];
  if (!biomeStats) return null;
  for (const [dL, dk] of [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const LL = level + dL, kk = k + dk;
    if (LL < 0 || LL >= biomeStats.级.length || kk < 0 || kk >= depthBandCount) continue;
    const entry = biomeStats.级[LL].档[kk];
    if (entry) return { e: entry, plantHeights: biomeStats.草高[kk] ?? biomeStats.草高.find(Boolean) ?? [] };
  }
  return null;
};
export const seabedFor = (biome: string, level: number, depthM: number): SeabedSetup | null => {
  const k = seabedBand(depthM);
  const key = `${biome}|${level}|${k}`;
  let setup = setupCache.get(key);
  if (setup !== undefined) return setup;
  const analog = biomeAnalogs[biome];
  const biomeChain = [biome, analog?.用, k <= 1 ? 'minecraft:river' : 'minecraft:ocean'].filter(Boolean) as string[];
  setup = null;
  for (const biomeName of biomeChain) {
    const found = findEntry(biomeName, level, k);
    if (!found) continue;
    const total = found.e.实.reduce((a, [, share]) => a + share, 0);
    let acc = 0;
    const solids = found.e.实.map(([block, share]) => [block, (acc += share / total)] as [string, number]);
    const plants = level === 0 ? found.plantHeights.filter(([block]) => !(analog?.dropPlants && biomeName !== biome && analog.dropPlants.test(block))) : [];
    setup = { solid: solids, plants: plants };
    break;
  }
  setupCache.set(key, setup);
  return setup;
};

// 累计比例表里按 u（0～1）挑
export const pickSolid = (solids: [string, number][], roll: number) => {
  for (const [block, cumShare] of solids) if (roll < cumShare) return block;
  return solids[solids.length - 1][0];
};

// 成片：游戏坐标 (x, z) 落在哪一块 6 米左右的随机多边形里，返回这一块的随机数（0～1）
const patchSizeM = 6;
export const patchRoll = (x: number, z: number, k: number) => {
  const ci = Math.floor(x / patchSizeM), cj = Math.floor(z / patchSizeM);
  let best = Infinity, bi = 0, bj = 0;
  for (let offsetJ = -1; offsetJ <= 1; offsetJ++)
    for (let offsetI = -1; offsetI <= 1; offsetI++) {
      const i = ci + offsetI, j = cj + offsetJ;
      const dx = (i + hash2(i, j, 71)) * patchSizeM - x, dz = (j + hash2(i, j, 72)) * patchSizeM - z;
      const distSq = dx * dx + dz * dz;
      if (distSq < best) (best = distSq), (bi = i), (bj = j);
    }
  return hash2(bi, bj, k);
};

// 海带成片：80 米一片的噪声取正的一半，除以它的平均值（平均下来是 1，量到的比例不变）
const kelpNoise = simplex2(80);
const kelpMean = (() => {
  let sum = 0;
  const sampleCount = 4096;
  for (let k = 0; k < sampleCount; k++) sum += Math.max(0, kelpNoise(hash2(k, 1, 81) * 1000, hash2(k, 2, 82) * 1000));
  return sum / sampleCount;
})();
export const kelpDensity = (x: number, z: number) => Math.max(0, kelpNoise(x / 80, z / 80)) / kelpMean;

// 第 0 级挑水草：u 是这一列的随机数；返回 [方块, 格数] 或 null
export const pickPlant = (plants: [string, number, number][], roll: number, kelpFactor: number): [string, number] | null => {
  let acc = 0;
  for (const [block, heightCells, share] of plants) {
    acc += block === 'minecraft:kelp' ? share * kelpFactor : share;
    if (roll < acc) return [block, heightCells];
  }
  return null;
};

// ---------- 粗级的水草（见文件头）----------
const coarsePlantSeed = 19;
// 第 L 级（≥ 1）一格海底（游戏坐标 [gx0, gx0 + 2^L) × [gz0, gz0 + 2^L)，水深 深 米）上面那一格放的水草方块（状态名），不放是 undefined。
// 高海草放下半、海带放茎，只放一格
export const coarseSeaPlant = (biome: string, depthM: number, gx0: number, gz0: number, level: number): string | undefined => {
  const setup = seabedFor(biome, 0, depthM);
  if (!setup || !setup.plants.length) return undefined;
  const cellM = 2 ** level;
  const plant = pickPlant(setup.plants, hash2(gx0 >> level, gz0 >> level, coarsePlantSeed + level), kelpDensity(gx0 + cellM / 2, gz0 + cellM / 2));
  if (!plant) return undefined;
  return plant[0] === 'minecraft:tall_seagrass' ? 'minecraft:tall_seagrass[half=lower]' : plant[0] === 'minecraft:kelp' ? 'minecraft:kelp_plant' : plant[0];
};
