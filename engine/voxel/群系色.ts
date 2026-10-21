// 群系颜色：按群系 id 查草、树叶、水的颜色（sRGB 0xRRGGBB），给存档导入管线定每块方块的染色；体素世界的染色表（lib/真实方块表.ts 的 `buildTintTable`）也从这里取。
// 数据：模型/场景/关键帧/群系色.json，工具/游戏取材/关键帧方块.py 从各 jar 的群系 JSON 算出（原版 64 个群系、暮色 21 个、夸克 1 个）。
// 规则照游戏（`Biome.getGrassColor` / `getFoliageColor` / `getWaterColor`）：JSON 写了 grass_color / foliage_color 的用它，没写的按温度、湿度查原版色图；
//   草色再按 grass_color_modifier 改；暮色树叶色由 coremod 在 `BiomeColors` 里插了 `FoliageColorHandler`，按群系改。
//   和位置无关的改法已在出表时算进去；随位置变的（原版 swamp 的草，暮色 enchanted_forest、dark_forest_center、spooky_forest 的草和叶）
//   在这里照反汇编复刻（client-1.20.1-srg.jar，暮色 `BiomeGrassColors`、`FoliageColorHandler` 字节码），所以 `grassColor`、`foliageColor` 要给方块坐标。
// 不做群系之间的过渡（用户 10-04 定）：游戏默认混周围几格的群系色，取材 mod 导出网格时关掉了（MeshAction.java 的 NoShade.getBlockTint），
//   这里同样不混，导入地形和导出地标网格颜色才对得上。
// 方块在哪个群系也照游戏：`BiomeManager.getBiome` 按世界种子给相邻 8 个群系格各抖一下、挑最近的，群系交界是锯齿不是 4 格台阶，见 `biomeCell`。
//
// 接口（颜色都是 sRGB 0xRRGGBB）：
//   `biomeIds`：表里全部群系 id；`grassColor`(群系, x, z)、`foliageColor`(群系, x, z)：游戏方块坐标处的色；`waterColor`(群系)：不随位置变
//   `biomeColors`(群系) → { 草, 叶, 水 }：不知位置时的固定色（建染色表）；随位置变的群系取坐标 (0, 0) 处的色
//   `biomeZoomSeed`(世界种子)：异步，`BiomeManager.obfuscateSeed` = sha256(种子按 8 字节小端) 的前 8 字节（小端），一个世界算一次
//   `biomeCell`(缩放种子, x, y, z) → [qx, qy, qz]：方块取哪个群系格（区块 sections[].biomes 那套 4×4×4 坐标）；qy 超出世界上下界时按边界那格取
// 群系表里没有的 id 直接报错：表不全就重跑 关键帧方块.py，不拿别的群系顶。
//
// 导入管线用法（工具/导入/烘焙.ts「方块在哪个群系」挑群系，lib/体素/导入地形.ts 取色）：
//   const 种 = await 群系缩放种子(level.dat 里 WorldGenSettings 的 seed)
//   const [qx, qy, qz] = 群系格(种, x, y, z)
//   const 色 = 方块染色(体素值(状态), 区块里读出的群系(qx, qy, qz), x, z)   // lib/真实方块表.ts：按染色路（草、树叶、林冠叶、红树叶、水、定值）取色
import biomeData from 'asset:数据/场景/关键帧/群系色';

type BiomeEntry = { 草: string; 叶: string; 水: string; 草修饰?: string; 叶修饰?: string };
const biomeTable = (biomeData as unknown as { 群系: Record<string, BiomeEntry> }).群系;
const hex = (s: string) => parseInt(s.slice(1), 16);
const colorTable = new Map(Object.entries(biomeTable).map(([k, entry]) => [k, { grass: hex(entry.草), foliage: hex(entry.叶), water: hex(entry.水), grassModifier: entry.草修饰, leafModifier: entry.叶修饰 }]));

export const biomeIds: readonly string[] = Object.keys(biomeTable);

const lookupBiome = (biome: string) => {
  const colors = colorTable.get(biome);
  if (!colors) throw new Error(`群系色：表里没有 ${biome}，重跑 工具/游戏取材/关键帧方块.py（新模组的群系要把 jar 加进 JARS）`);
  return colors;
};

// ---------- 原版的两张噪声 ----------
// `Biome.TEMPERATURE_NOISE`（种子 1234）、`BIOME_INFO_NOISE`（种子 2345）：new PerlinSimplexNoise(new WorldgenRandom(new LegacyRandomSource(种子)), [0])，
// 只有一层 SimplexNoise，getValue(x, z, false) 就是这一层的 2D 值（不加偏移）。已和游戏自己的类逐位对过。
const SQRT_3 = Math.sqrt(3);
const F2 = 0.5 * (SQRT_3 - 1);
const G2 = (3 - SQRT_3) / 6;
const gradients = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0, 1], [0, -1]]; // SimplexNoise.GRADIENT 前 12 个（z 分量在 2D 里乘 0）

// LegacyRandomSource：48 位线性同余（同 java.util.Random），WorldgenRandom 包一层不改数列。几层噪声共用一个数列时接着往下取
type JavaRandom = { next: (bits: number) => number; nextInt: (bound: number) => number };
const newRandom = (seed: number): JavaRandom => {
  let state = (BigInt(seed) ^ 0x5deece66dn) & 0xffffffffffffn;
  const next = (bits: number) => {
    state = (state * 0x5deece66dn + 0xbn) & 0xffffffffffffn;
    return Number(state >> BigInt(48 - bits));
  };
  const nextInt = (bound: number) => {
    if ((bound & -bound) === bound) return Math.floor((bound * next(31)) / 2147483648);
    let randBits, remainder;
    do {
      randBits = next(31);
      remainder = randBits % bound;
    } while (((randBits - remainder + (bound - 1)) | 0) < 0); // Java 的 int 溢出
    return remainder;
  };
  return { next, nextInt };
};

class SimplexLayer {
  private p = new Int32Array(256);
  constructor(seedOrRandom: number | JavaRandom) {
    const { next, nextInt } = typeof seedOrRandom === 'number' ? newRandom(seedOrRandom) : seedOrRandom;
    for (let i = 0; i < 6; i++) next(i % 2 ? 27 : 26); // xo、yo、zo 三个 nextDouble（各 26 + 27 位），getValue 不用偏移
    for (let i = 0; i < 256; i++) this.p[i] = i;
    for (let i = 0; i < 256; i++) {
      const j = nextInt(256 - i);
      const t = this.p[i];
      this.p[i] = this.p[i + j];
      this.p[i + j] = t;
    }
  }
  private permAt(i: number) {
    return this.p[i & 255];
  }
  // SimplexNoise.getValue(x, y)，运算顺序照字节码
  valueAt(x: number, y: number) {
    const d0 = (x + y) * F2;
    const i = Math.floor(x + d0);
    const j = Math.floor(y + d0);
    const d1 = (i + j) * G2;
    const d4 = x - (i - d1);
    const d5 = y - (j - d1);
    const k = d4 > d5 ? 1 : 0;
    const stepJ = 1 - k;
    const i1 = i & 255;
    const j1 = j & 255;
    const corner = (gradIdx: number, dx: number, dy: number) => {
      let t = 0.5 - dx * dx - dy * dy;
      if (t < 0) return 0;
      t *= t;
      return t * t * (gradients[gradIdx][0] * dx + gradients[gradIdx][1] * dy);
    };
    return 70 * (corner(this.permAt(i1 + this.permAt(j1)) % 12, d4, d5) + corner(this.permAt(i1 + k + this.permAt(j1 + stepJ)) % 12, d4 - k + G2, d5 - stepJ + G2) + corner(this.permAt(i1 + 1 + this.permAt(j1 + 1)) % 12, d4 - 1 + 2 * G2, d5 - 1 + 2 * G2));
  }
}
let tempNoise: SimplexLayer | null = null;
let biomeInfoNoise: SimplexLayer | null = null;
const temperatureAt = (x: number, z: number) => (tempNoise ??= new SimplexLayer(1234)).valueAt(x * 0.0225, z * 0.0225);
const biomeInfoAt = (x: number, z: number) => (biomeInfoNoise ??= new SimplexLayer(2345)).valueAt(x * 0.0225, z * 0.0225);

// 带 frozen 温度修正的群系（冻洋、深冻洋）在 (x, z) 是不是「冷区」（Biome.TemperatureModifier.FROZEN，海平面上不算高度降温）：
//   冷区照群系自己的温度，暖区温度算 0.2。冻不冻还要看群系温度低不低于 0.15（lib/体素/远景.ts 的 `水面结冰`）。
//   FROZEN_TEMPERATURE_NOISE = new PerlinSimplexNoise(new WorldgenRandom(new LegacyRandomSource(3456)), [-2, -1, 0])：
//     同一数列先建第 0 层、再建第 -1、-2 层，getValue(x, z, false) = Σ 第 k 层(x / 2^k, z / 2^k) · 2^k / 7（k = 0、1、2）；
//   d2 = FROZEN(x·0.05, z·0.05)·7 + BIOME_INFO(x·0.2, z·0.2)；d2 < 0.3 且 BIOME_INFO(x·0.09, z·0.09) < 0.8 时温度算 0.2（暖区，返回 false），否则冷区（返回 true）。
let frozenTempNoise: SimplexLayer[] | null = null;
export const isFrozenZone = (x: number, z: number) => {
  if (!frozenTempNoise) {
    const rng = newRandom(3456);
    frozenTempNoise = [new SimplexLayer(rng), new SimplexLayer(rng), new SimplexLayer(rng)];
  }
  const [n0, n1, n2] = frozenTempNoise;
  const fx = x * 0.05, fz = z * 0.05;
  const frozenValue = (n0.valueAt(fx, fz) + 2 * n1.valueAt(fx / 2, fz / 2) + 4 * n2.valueAt(fx / 4, fz / 4)) / 7;
  const infoNoise = (biomeInfoNoise ??= new SimplexLayer(2345));
  if (frozenValue * 7 + infoNoise.valueAt(x * 0.2, z * 0.2) < 0.3 && infoNoise.valueAt(x * 0.09, z * 0.09) < 0.8) return false;
  return true;
};

// 下面两个已和暮色自己的类逐个对过
// 暮色 BiomeGrassColors.blendColors：两色按比例混，int 运算照 Java（溢出、算术右移）
const blendColors = (colorA: number, colorB: number, ratio: number) => {
  const f1 = Math.trunc(256 * ratio);
  const f2 = 256 - f1;
  return (((Math.imul(colorA & 0xff00ff, f2) + Math.imul(colorB & 0xff00ff, f1)) >> 8) & 0xff00ff) | (((Math.imul(colorA & 0xff00ff00, f2) + Math.imul(colorB & 0xff00ff00, f1)) >> 8) & 0xff00ff00);
};
// 暮色 BiomeGrassColors.getEnchantedColor：以 256 格一个的网格点为圆心，按到圆心的距离一圈圈变蓝（Math.round((float)(x - 8) / 256f)，float 照 Java）
const enchantedBlue = (x: number, z: number) => {
  const cx = 256 * Math.floor(Math.fround(x - 8) / 256 + 0.5) + 8;
  const cz = 256 * Math.floor(Math.fround(z - 8) / 256 + 0.5) - 8;
  let ring = (Math.trunc(Math.fround(Math.sqrt((cx - x) * (cx - x) + (cz - z) * (cz - z)))) * 64) % 512;
  if (ring > 255) ring = 511 - ring;
  return 255 - ring;
};

export const grassColor = (biome: string, x: number, z: number): number => {
  const colors = lookupBiome(biome);
  switch (colors.grassModifier) {
    case undefined:
      return colors.grass;
    case 'minecraft:swamp': // 沼泽、红树林沼泽：两种色按噪声分块
      return biomeInfoAt(x, z) < -0.1 ? 0x4c763c : 0x6a7039;
    case 'twilightforest:enchanted_forest':
      return (colors.grass & 0xffff00) + enchantedBlue(x, z);
    case 'twilightforest:dark_forest_center':
      return temperatureAt(x, z) < -0.2 ? 0x667540 : 0x554114;
    case 'twilightforest:spooky_forest': {
      const noise01 = (temperatureAt(x, z) + 1) / 2;
      return blendColors(0xc43323, 0x5bc423, noise01 > 0.6 ? noise01 * 0.1 : noise01);
    }
    default:
      throw new Error(`群系色：草修饰 ${colors.grassModifier} 没有复刻`);
  }
};

export const foliageColor = (biome: string, x: number, z: number): number => {
  const colors = lookupBiome(biome);
  switch (colors.leafModifier) {
    case undefined:
      return colors.foliage;
    case 'twilightforest:enchanted_forest':
      return (colors.foliage & 0xffff00) + enchantedBlue(x, z);
    case 'twilightforest:dark_forest_center': {
      // 暮色的写法：噪声折到 0～1 以后再比 -0.1，前一种色永远取不到，黑暗森林中心的树叶总是 0xE94E14（导出网格里也是）
      const noise01 = (temperatureAt(x, z) + 1) / 2;
      return noise01 < -0.1 ? 0xf9821e : 0xe94e14;
    }
    case 'twilightforest:spooky_forest': {
      const noise01 = (temperatureAt(x, z) + 1) / 2;
      return blendColors(0xff0101, 0x4a0001, noise01 > 0.6 ? noise01 * 0.2 : noise01);
    }
    default:
      throw new Error(`群系色：叶修饰 ${colors.leafModifier} 没有复刻`);
  }
};

export const waterColor = (biome: string): number => lookupBiome(biome).water;

export const biomeColors = (biome: string): { grass: number; foliage: number; water: number } => ({ grass: grassColor(biome, 0, 0), foliage: foliageColor(biome, 0, 0), water: waterColor(biome) });
// 草色或树叶色随位置变（有修饰）的群系：区段包按群系取的固定色对它们不对，导入地形（lib/体素/导入地形.ts）按格子坐标重算
export const variesByPos = (biome: string) => lookupBiome(biome).grassModifier !== undefined || lookupBiome(biome).leafModifier !== undefined;

// ---------- 方块在哪个群系格（BiomeManager.getBiome）----------
// 64 位整数用高低两个 32 位无符号数算（每个方块要算几十次，BigInt 太慢）。已和游戏逐个对过。
type U64 = [number, number]; // [高 32 位, 低 32 位]
const mul64 = (lhs: U64, rhs: U64): U64 => {
  const a0 = lhs[1] & 0xffff, a1 = lhs[1] >>> 16, b0 = rhs[1] & 0xffff, b1 = rhs[1] >>> 16;
  const mid = a0 * b1 + a1 * b0;
  const low = a0 * b0 + (mid % 65536) * 65536;
  const high = a1 * b1 + Math.floor(mid / 65536) + Math.floor(low / 4294967296) + Math.imul(lhs[0], rhs[1]) + Math.imul(lhs[1], rhs[0]);
  return [high >>> 0, low >>> 0];
};
const add64 = (lhs: U64, rhs: U64): U64 => {
  const low = lhs[1] + rhs[1];
  return [(lhs[0] + rhs[0] + (low > 0xffffffff ? 1 : 0)) >>> 0, low >>> 0];
};
const toLong = (v: number): U64 => [v < 0 ? 0xffffffff : 0, v >>> 0]; // int → long（符号扩展）
const lcgMul: U64 = [0x5851f42d, 0x4c957f2d]; // LinearCongruentialGenerator：6364136223846793005
const lcgAdd: U64 = [0x14057b7e, 0xf767814f]; // 1442695040888963407
const lcgNext = (a: U64, b: U64) => add64(mul64(a, add64(mul64(a, lcgMul), lcgAdd)), b); // LinearCongruentialGenerator.next(a, b) = a * (a * M + C) + b
const fiddle = (s: U64) => ((((s[1] >>> 24) | ((s[0] & 3) << 8)) / 1024) - 0.5) * 0.9; // getFiddle：floorMod(s >> 24, 1024) / 1024
// 群系格 (x, y, z) 的三个抖动量 [d0, d1, d2]：只和格子坐标、种子有关。导入时同一个格子要算几百次，所以按格子记下来（键 = x、z 各取低 22 位、y 取低 9 位拼成，方块坐标在 ±800 万内不会撞；记满 100 万个清空）
const fiddleCache = new Map<number, [number, number, number]>();
const fiddles = (seed: U64, x: number, y: number, z: number) => {
  const cacheKey = ((x & 0x3fffff) * 0x400000 + (z & 0x3fffff)) * 512 + (y & 511);
  let result = fiddleCache.get(cacheKey);
  if (result) return result;
  let state = lcgNext(seed, toLong(x));
  state = lcgNext(state, toLong(y));
  state = lcgNext(state, toLong(z));
  state = lcgNext(state, toLong(x));
  state = lcgNext(state, toLong(y));
  state = lcgNext(state, toLong(z));
  const d0 = fiddle(state);
  state = lcgNext(state, seed);
  const d1 = fiddle(state);
  state = lcgNext(state, seed);
  result = [d0, d1, fiddle(state)];
  if (fiddleCache.size >= 1 << 20) fiddleCache.clear();
  fiddleCache.set(cacheKey, result);
  return result;
};

export const biomeZoomSeed = async (worldSeed: bigint | number | string): Promise<bigint> => {
  const buf = new DataView(new ArrayBuffer(8));
  buf.setBigInt64(0, BigInt.asIntN(64, BigInt(worldSeed)), true);
  return new DataView(await crypto.subtle.digest('SHA-256', buf.buffer)).getBigInt64(0, true);
};

// 缩放种子换成高低两半，一个世界只换一次（每个方块都换的话 BigInt 运算比算抖动本身还慢）
let lastZoomSeed: bigint | null = null;
let zoomSeed64: U64 = [0, 0];
export const biomeCell = (zoomSeed: bigint, x: number, y: number, z: number): [number, number, number] => {
  if (zoomSeed !== lastZoomSeed) {
    lastZoomSeed = zoomSeed;
    zoomSeed64 = [Number(BigInt.asUintN(64, zoomSeed) >> 32n), Number(BigInt.asUintN(32, zoomSeed))];
    fiddleCache.clear();
  }
  const i = x - 2, j = y - 2, k = z - 2;
  const cellX = i >> 2, cellY = j >> 2, cellZ = k >> 2;
  const fx = (i & 3) / 4, fy = (j & 3) / 4, fz = (k & 3) / 4;
  let picked = 0;
  let nearest = Infinity;
  for (let corner = 0; corner < 8; corner++) {
    const ax = (corner & 4) === 0, ay = (corner & 2) === 0, az = (corner & 1) === 0;
    const [d0, d1, d2] = fiddles(zoomSeed64, ax ? cellX : cellX + 1, ay ? cellY : cellY + 1, az ? cellZ : cellZ + 1);
    const xf = ax ? fx : fx - 1, yf = ay ? fy : fy - 1, zf = az ? fz : fz - 1;
    const distSq = (zf + d2) * (zf + d2) + (yf + d1) * (yf + d1) + (xf + d0) * (xf + d0);
    if (nearest > distSq) {
      picked = corner;
      nearest = distSq;
    }
  }
  return [(picked & 4) === 0 ? cellX : cellX + 1, (picked & 2) === 0 ? cellY : cellY + 1, (picked & 1) === 0 ? cellZ : cellZ + 1];
};
