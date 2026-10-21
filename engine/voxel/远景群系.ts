// 远景各群系的地表方块、底土、郁闭度、树种（照原版 1.20.1，再拿导入的地形核对），以及水面结冰、积雪、陡坡的判法。
import { isFrozenZone } from './群系色.ts';
import type { DistantGrid } from './远景网格.ts';

// 树种：叶、干的方块；冠顶、冠底是离地多高（米）；半径是冠幅的一半；锥：云杉那样上尖下宽
export type TreeKind = { 叶: string; 干: string; crownTop: number; crownBottom: number; 半径: number; conical?: boolean };
const oak: TreeKind = { 叶: 'minecraft:oak_leaves', 干: 'minecraft:oak_log[axis=y]', crownTop: 7, crownBottom: 3, 半径: 2.5 };
const bigOak: TreeKind = { 叶: 'minecraft:oak_leaves', 干: 'minecraft:oak_log[axis=y]', crownTop: 10, crownBottom: 4, 半径: 4 };
const birch: TreeKind = { 叶: 'minecraft:birch_leaves', 干: 'minecraft:birch_log[axis=y]', crownTop: 8, crownBottom: 4, 半径: 2 };
const tallBirch: TreeKind = { 叶: 'minecraft:birch_leaves', 干: 'minecraft:birch_log[axis=y]', crownTop: 13, crownBottom: 8, 半径: 2 };
const spruce: TreeKind = { 叶: 'minecraft:spruce_leaves', 干: 'minecraft:spruce_log[axis=y]', crownTop: 10, crownBottom: 2, 半径: 2.5, conical: true };
const megaSpruce: TreeKind = { 叶: 'minecraft:spruce_leaves', 干: 'minecraft:spruce_log[axis=y]', crownTop: 24, crownBottom: 8, 半径: 4, conical: true };
const darkOak: TreeKind = { 叶: 'minecraft:dark_oak_leaves', 干: 'minecraft:dark_oak_log[axis=y]', crownTop: 9, crownBottom: 5, 半径: 3.5 };
const jungleTree: TreeKind = { 叶: 'minecraft:jungle_leaves', 干: 'minecraft:jungle_log[axis=y]', crownTop: 12, crownBottom: 6, 半径: 3 };
const megaJungle: TreeKind = { 叶: 'minecraft:jungle_leaves', 干: 'minecraft:jungle_log[axis=y]', crownTop: 26, crownBottom: 18, 半径: 5 };
const bush: TreeKind = { 叶: 'minecraft:oak_leaves', 干: 'minecraft:jungle_log[axis=y]', crownTop: 3, crownBottom: 0, 半径: 2 };
const acacia: TreeKind = { 叶: 'minecraft:acacia_leaves', 干: 'minecraft:acacia_log[axis=y]', crownTop: 8, crownBottom: 6, 半径: 3.5 };
const mangrove: TreeKind = { 叶: 'minecraft:mangrove_leaves', 干: 'minecraft:mangrove_log[axis=y]', crownTop: 11, crownBottom: 5, 半径: 3 };
const cherry: TreeKind = { 叶: 'minecraft:cherry_leaves', 干: 'minecraft:cherry_log[axis=y]', crownTop: 9, crownBottom: 5, 半径: 3.5 };
const swampOak: TreeKind = { 叶: 'minecraft:oak_leaves', 干: 'minecraft:oak_log[axis=y]', crownTop: 8, crownBottom: 4, 半径: 3 };

// 一个群系：地表方块（陡坡上换 陡）、底土、郁闭度（地面被树冠盖住的比例）、树种和比重
// 混：[另一种地表, 比例]，按哈希一列列混（风袭砂砾丘陵是草和砾石各一片、冰刺之地是浮冰和雪）
export type BiomeSetup = { 地表: string; subsoil: string; 陡?: string; 混?: [string, number]; 积雪?: boolean; 郁闭: number; 树: [TreeKind, number][] };
export const grassBlock = 'minecraft:grass_block[snowy=false]';
export const snowyGrass = 'minecraft:grass_block[snowy=true]';
const dirt = 'minecraft:dirt';
export const sand = 'minecraft:sand';
export const gravel = 'minecraft:gravel';
export const stone = 'minecraft:stone';
const snowBlock = 'minecraft:snow_block';
const defineBiome = (surfaceBlock: string, subsoil: string, canopyClosure = 0, trees: [TreeKind, number][] = [], extra: Partial<BiomeSetup> = {}): BiomeSetup => ({ 地表: surfaceBlock, subsoil, 郁闭: canopyClosure, 树: trees, ...extra });
// 原版 1.20.1 的地表规则（SurfaceRuleData.overworld）大意：
//   沙滩、沙漠、暖水海底是沙；冷海、深海底大多是砾石；山峰（尖峭、冰封）顶上是雪块、陡处石头；裸岩山峰石头；雪坡雪块；
//   积雪的地方（群系温度按高度降到 0.15 以下）草方块上盖一层雪片：雪片不是整格（不透明度 0），粗级照 Mipper 露出的是下面的 `雪草方块`，
//   导入的粗级也一样，这里地表就写 `雪草方块`（第 0 级不再盖雪片：离线的地形只在导入范围外，近处看不到）。
// 郁闭度先按原版各群系的树估，再拿导入的地形逐群系核对（工具/导入/远景校准.ts，第 0 级最上面是树叶的陆地列占比），下表是核对后的取值。
//   沙滩偏高是因为远景网格 32 米一格、沙滩边上的林子算进了沙滩；雪地树冠上盖着雪片，第 0 级量出来偏低，雪林、雪原按粗级树叶比例反推。
//   地表也按第 4 级最上面那块核过（风袭砂砾丘陵草 52%、砾石 37%，冰刺之地浮冰 75%，积雪山坡陡处露石头 5%，陡坡门槛 50°）。
//   别的群系（黑森林、繁茂山峰……）等航线那一批导入以后再核。冠形照各树种的原版生成器取大概的数（导入里冠顶离地中位 5～6 米，樱花 9 米）。
export const biomeSetups: Record<string, BiomeSetup> = {
  'minecraft:plains': defineBiome(grassBlock, dirt, 0.02, [[oak, 0.85], [birch, 0.15]]),
  'minecraft:sunflower_plains': defineBiome(grassBlock, dirt, 0.02, [[oak, 1]]),
  'minecraft:meadow': defineBiome(grassBlock, dirt, 0.008, [[oak, 0.8], [birch, 0.2]]),
  'minecraft:forest': defineBiome(grassBlock, dirt, 0.5, [[oak, 0.75], [birch, 0.2], [bigOak, 0.05]]),
  'minecraft:flower_forest': defineBiome(grassBlock, dirt, 0.4, [[oak, 0.8], [birch, 0.2]]),
  'minecraft:birch_forest': defineBiome(grassBlock, dirt, 0.56, [[birch, 0.8], [oak, 0.2]]),
  'minecraft:old_growth_birch_forest': defineBiome(grassBlock, dirt, 0.55, [[tallBirch, 0.9], [oak, 0.1]]),
  'minecraft:dark_forest': defineBiome(grassBlock, dirt, 0.95, [[darkOak, 0.85], [bigOak, 0.1], [birch, 0.05]]),
  'minecraft:taiga': defineBiome(grassBlock, dirt, 0.56, [[spruce, 0.9], [oak, 0.1]]),
  'minecraft:snowy_taiga': defineBiome(snowyGrass, dirt, 0.5, [[spruce, 1]]),
  'minecraft:old_growth_pine_taiga': defineBiome('minecraft:podzol[snowy=false]', dirt, 0.7, [[megaSpruce, 0.5], [spruce, 0.5]]),
  'minecraft:old_growth_spruce_taiga': defineBiome('minecraft:podzol[snowy=false]', dirt, 0.75, [[megaSpruce, 0.6], [spruce, 0.4]]),
  'minecraft:grove': defineBiome(snowBlock, dirt, 0.27, [[spruce, 1]]),
  'minecraft:windswept_forest': defineBiome(grassBlock, dirt, 0.45, [[spruce, 0.6], [oak, 0.4]], { 陡: stone }),
  'minecraft:windswept_hills': defineBiome(grassBlock, dirt, 0.04, [[spruce, 0.5], [oak, 0.5]], { 陡: stone }),
  'minecraft:windswept_gravelly_hills': defineBiome(grassBlock, dirt, 0.005, [[oak, 1]], { 陡: stone, 混: [gravel, 0.4] }),
  'minecraft:windswept_savanna': defineBiome(grassBlock, dirt, 0.25, [[acacia, 0.45], [oak, 0.45], [birch, 0.1]], { 陡: stone }),
  'minecraft:savanna': defineBiome(grassBlock, dirt, 0.12, [[acacia, 0.8], [oak, 0.2]]),
  'minecraft:savanna_plateau': defineBiome(grassBlock, dirt, 0.15, [[acacia, 0.8], [oak, 0.2]]),
  'minecraft:jungle': defineBiome(grassBlock, dirt, 0.9, [[jungleTree, 0.5], [megaJungle, 0.2], [bush, 0.3]]),
  'minecraft:sparse_jungle': defineBiome(grassBlock, dirt, 0.4, [[jungleTree, 0.6], [bush, 0.4]]),
  'minecraft:bamboo_jungle': defineBiome(grassBlock, dirt, 0.55, [[jungleTree, 0.4], [bush, 0.6]]),
  'minecraft:swamp': defineBiome(grassBlock, dirt, 0.25, [[swampOak, 1]]),
  'minecraft:mangrove_swamp': defineBiome('minecraft:mud', 'minecraft:mud', 0.7, [[mangrove, 1]]),
  'minecraft:cherry_grove': defineBiome(grassBlock, dirt, 0.08, [[cherry, 1]]),
  'minecraft:mushroom_fields': defineBiome('minecraft:mycelium[snowy=false]', dirt),
  'minecraft:desert': defineBiome(sand, 'minecraft:sandstone'),
  'minecraft:badlands': defineBiome('minecraft:red_sand', 'minecraft:terracotta', 0, [], { 陡: 'minecraft:terracotta' }),
  'minecraft:eroded_badlands': defineBiome('minecraft:red_sand', 'minecraft:terracotta', 0, [], { 陡: 'minecraft:terracotta' }),
  'minecraft:wooded_badlands': defineBiome('minecraft:coarse_dirt', 'minecraft:terracotta', 0.12, [[oak, 1]], { 陡: 'minecraft:terracotta' }),
  'minecraft:snowy_plains': defineBiome(snowyGrass, dirt, 0.025, [[spruce, 0.6], [oak, 0.4]]),
  'minecraft:ice_spikes': defineBiome('minecraft:packed_ice', snowBlock, 0, [], { 混: [snowBlock, 0.25] }),
  'minecraft:snowy_slopes': defineBiome(snowBlock, snowBlock),
  'minecraft:jagged_peaks': defineBiome(snowBlock, snowBlock, 0, [], { 陡: stone }),
  'minecraft:frozen_peaks': defineBiome(snowBlock, 'minecraft:packed_ice', 0, [], { 陡: 'minecraft:packed_ice' }),
  'minecraft:stony_peaks': defineBiome(stone, stone, 0, [], { 陡: 'minecraft:calcite' }),
  'minecraft:stony_shore': defineBiome(stone, stone),
  'minecraft:beach': defineBiome(sand, sand, 0.02, [[oak, 0.75], [birch, 0.25]]),
  'minecraft:snowy_beach': defineBiome(sand, sand),
  'minecraft:river': defineBiome(sand, sand),
  'minecraft:frozen_river': defineBiome(sand, sand),
  'minecraft:warm_ocean': defineBiome(sand, sand),
  'minecraft:lukewarm_ocean': defineBiome(sand, sand),
  'minecraft:deep_lukewarm_ocean': defineBiome(sand, sand),
  'minecraft:ocean': defineBiome(gravel, gravel),
  'minecraft:deep_ocean': defineBiome(gravel, gravel),
  'minecraft:cold_ocean': defineBiome(gravel, gravel),
  'minecraft:deep_cold_ocean': defineBiome(gravel, gravel),
  'minecraft:frozen_ocean': defineBiome(gravel, gravel),
  'minecraft:deep_frozen_ocean': defineBiome(gravel, gravel),
};
export const oceanBiomes = new Set(['minecraft:ocean', 'minecraft:deep_ocean', 'minecraft:cold_ocean', 'minecraft:deep_cold_ocean', 'minecraft:frozen_ocean', 'minecraft:deep_frozen_ocean', 'minecraft:river', 'minecraft:frozen_river']);
export const defaultBiome = defineBiome(grassBlock, dirt, 0.03, [[oak, 1]]); // 洞穴群系露到地表（繁茂洞穴、溶洞、深暗之域）和表里没有的
// 水面结冰：照原版 1.20.1 的 `Biome.shouldFreeze`，水面那一格（y 62）的温度低于 0.15 才结冰。温度是群系温度（远景.json 的 群系温度，史诗地形覆盖过的），
// 带 frozen 修正的群系（冻洋、深冻洋）在冻结噪声的「暖区」换成 0.2（`Biome$TemperatureModifier` FROZEN；暖区判法见 lib/体素/群系色.ts 的 `冻结`），别处照原温度。所以：
// 冻洋（0.0）暖区以外都结冰；深冻洋（0.5）永远不结冰（游戏里只有冰山，这里不做）；冻河（0.0、没有修正）整片结冰；别的群系照温度（雪原、冰刺之地里的水也冻）。
// 粗格子里冰和水不透明度一样（1）、又在同一层，Mipper 按位序挑东南角那一块，所以看格子东南角那一块方块冻没冻。导入的粗级补水面时也照这条（lib/体素/主世界地形.ts）
const frozenModBiomes = new Set(['minecraft:frozen_ocean', 'minecraft:deep_frozen_ocean']);
export const biomeTemperature = (W: DistantGrid, biome: string) => W.温度[W.群系名.indexOf(biome)] ?? 0.8;
export const waterFreezes = (W: DistantGrid, biome: string, x: number, z: number) => biomeTemperature(W, biome) < 0.15 && (!frozenModBiomes.has(biome) || isFrozenZone(x, z));
// 积雪：照 地形.mjs 的 积雪（Biome.getHeightAdjustedTemperature 不算噪声那一项）：y > 80 每高一格降 0.00125，低于 0.15 积雪
export const 积雪 = (temperature: number, y: number) => temperature - Math.max(0, y - 80) * 0.00125 < 0.15;
// 陡：一列和四邻的高差（米 / 米）超过 1.2（50°）算陡坡，山上露出石头（原版山地群系 steep 的那几条规则；门槛按导入校准定）
export const steepSlope = 1.2;
