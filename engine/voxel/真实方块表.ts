// 真实方块的注册表（方块状态 → 各面贴图、染色、渲染层、遮挡），体素世界（lib/体素/）视频级、关键帧级共用，全照 jar 里的模型：
// 模型/场景/关键帧/方块表.json 由 工具/游戏取材/关键帧方块.py 从各 jar 导出，贴图是同目录的 方块表.png。jar 里的方块都导了（变体多的导第一个和存档里出现过的），
// 所以新加的方块不用改这里（用户 10-03）；只有箱子、告示牌这类方块实体画的查不到。
//
// 接口：
//   体素值(状态)：方块 id 或方块状态字符串（"minecraft:poppy"、"minecraft:grass_block[snowy=false]"、"twilightforest:canopy_log[axis=y]"）
//     → 体素值（方块号 + 1，0 = 空气、也是"表里没有"）。没写全属性的按写了的属性挑，表里没有这个组合的取该方块导出的第一个状态；1.20.3 以后改名的 id（short_grass）按 1.20.1 的名字查
//   方块属性：按体素值查的几张表（Uint8Array）
//     不透明 远处合并（lib/体素/生成.ts 照 Voxy Mipper）比的不透明度：整格不透明的和树叶 15、水和冰这类挡光的 1、花草等不挡光的 0（游戏的 getLightDampening）
//     满 整格不透明（挡住贴着它的面）、遮 整格碰撞箱（环境光遮蔽里算挡光，树叶也算）、叶 树叶（整格、镂空）、
//     光 模型要不要环境光遮蔽（花草是 false）、层 渲染层 0 实心 / 1 镂空 / 2 半透明（冰） / 3 液体、染 染色路（见 染色路名）、
//     转 顶面随机转（草方块、泥土：方块状态里 4 个只差 y 旋转的变体）、偏 花草按位置水平偏移（OffsetType.XZ）、草 不挡光的小东西（花草）、
//     十字 有不沿轴的面（花草的十字模型）
//   面表[体素值]：这种方块的全部面，每面 面长 个数：
//     [朝向 0～5（+x -x +y -y +z -z，场景坐标）或 6 = 不沿轴, 剔除方向 0～5 或 6 = 不剔, 贴图号, 叠加贴图号（草方块侧面的草边，-1 = 没有）,
//      染（底层乘不乘染色）, 明暗（按朝向分不分亮度）, 四个角 xyz（方块里 0～1，从外面看顺时针：左上 右上 右下 左下）, 四个角 uv（一张贴图为 1）,
//      法线 xyz, 整格面（沿轴、面内盖满一格，能参加合并）]
//   贴图名[贴图号]：jar 里的贴图 id（minecraft:block/grass_block_top）；图集见 lib/真实方块图集.ts
//   方块染色(体素值, 群系, x, z)：这块方块在游戏坐标 (x, z) 处乘的颜色（sRGB 0xRRGGBB，不染的是白色），群系色照 lib/体素/群系色.ts，存档导入用
//   群系名 / 群系号(名)、建染色表(水色?)：群系号 × 染色路 → sRGB 字节的表（不知道位置时用，群系色取 群系颜色()）；
//     染色路 0 不染 1 草 2 树叶 3 林冠树叶 4 红树叶 5 水 6～ 定值（云杉叶 #619961、白桦叶 #80a755、睡莲 #208030……，规则见 关键帧方块.py）
import raw from 'asset:数据/场景/关键帧/方块表';
import { biomeIds, biomeColors, grassColor, foliageColor, waterColor } from './群系色.ts';

type FaceData = (string | number)[];
// 一条方块：[标志, 染色路, 面组号...]，标志 = 类（0 实心 1 镂空 2 半透明 3 液体）+ 4 满 + 8 遮 + 16 光 + 32 转 + 64 偏（见 关键帧方块.py）
type BlockData = [number, string | null, ...number[]];
const DATA = raw as unknown as { 贴图: string[]; 面组: FaceData[][]; 方块: Record<string, BlockData> };

export const tintPathNames = ['', 'grass', 'foliage', 'canopy', 'mangrove', 'water'];

// ---------- 方块表 ----------
export const blockNames = Object.keys(DATA.方块);
const indexByState = new Map(blockNames.map((n, i) => [n, i]));
// 同一个方块 id 导出的各个状态（按导出顺序，第一个是 jar 里 blockstates 写的第一个变体）
const statesById = new Map<string, number[]>();
blockNames.forEach((stateName, i) => {
  const id = stateName.split('[')[0];
  const stateList = statesById.get(id);
  if (stateList) stateList.push(i);
  else statesById.set(id, [i]);
});
// 1.20.3 以后改名的方块（jar 是 1.20.1）
const legacyIds: Record<string, string> = { 'minecraft:short_grass': 'minecraft:grass' };
const parseProps = (s: string): [string, string][] => (s.includes('[') ? s.slice(s.indexOf('[') + 1, -1).split(',').filter(Boolean).map((kv) => kv.split('=') as [string, string]) : []);
const lookupCache = new Map<string, number>();
export const voxelFromState = (state: string) => {
  const k = indexByState.get(state);
  if (k !== undefined) return k + 1;
  let voxel = lookupCache.get(state);
  if (voxel !== undefined) return voxel;
  let id = state.split('[')[0];
  id = legacyIds[id] ?? id;
  const cand = statesById.get(id);
  voxel = 0;
  if (cand) {
    const want = parseProps(state);
    const hit = cand.find((i) => {
      const have = new Map(parseProps(blockNames[i]));
      return want.every(([propKey, propValue]) => !have.has(propKey) || have.get(propKey) === propValue);
    });
    voxel = (hit ?? cand[0]) + 1;
  }
  lookupCache.set(state, voxel);
  return voxel;
};

const tableSize = blockNames.length + 1;
const fixedColors: string[] = [];
const tintPathIdx = (tintSpec: string | null): number => {
  if (!tintSpec) return 0;
  const k = tintPathNames.indexOf(tintSpec);
  if (k > 0) return k;
  let i = fixedColors.indexOf(tintSpec);
  if (i < 0) i = fixedColors.push(tintSpec) - 1;
  return 6 + i;
};
const FULL = new Uint8Array(tableSize);
const OCC = new Uint8Array(tableSize);
const LEAF = new Uint8Array(tableSize);
const AO = new Uint8Array(tableSize);
const CLS = new Uint8Array(tableSize);
const TINT = new Uint8Array(tableSize);
const SPIN = new Uint8Array(tableSize);
const OFFS = new Uint8Array(tableSize);
const PLANT = new Uint8Array(tableSize);
const CROSS = new Uint8Array(tableSize);
const OPAQ = new Uint8Array(tableSize);
export const faceStride = 30;
const FACES: Float32Array[] = [new Float32Array(0)];
const dirIndex = (s: string) => Math.max(-1, ['+x', '-x', '+y', '-y', '+z', '-z'].indexOf(s));
blockNames.forEach((stateName, i) => {
  const [flags, tintSpec, ...groupIds] = DATA.方块[stateName];
  const voxel = i + 1;
  FULL[voxel] = flags & 4 ? 1 : 0;
  OCC[voxel] = flags & 8 ? 1 : 0;
  CLS[voxel] = flags & 3;
  LEAF[voxel] = OCC[voxel] && !FULL[voxel] && CLS[voxel] === 1 && stateName.split('[')[0].endsWith('leaves') ? 1 : 0; // 玻璃这类整格镂空的不算树叶
  AO[voxel] = flags & 16 ? 1 : 0;
  TINT[voxel] = tintPathIdx(tintSpec);
  SPIN[voxel] = flags & 32 ? 1 : 0;
  OFFS[voxel] = flags & 64 ? 1 : 0;
  PLANT[voxel] = !OCC[voxel] && CLS[voxel] !== 3 ? 1 : 0;
  const faces = groupIds.flatMap((g) => DATA.面组[g]); // 多部件的方块一个部件一组，拼起来
  CROSS[voxel] = faces.some((q) => !q[0]) ? 1 : 0;
  OPAQ[voxel] = FULL[voxel] || LEAF[voxel] ? 15 : CLS[voxel] >= 2 ? 1 : 0;
  const faceBuf = new Float32Array(faces.length * faceStride);
  faces.forEach((face, k) => {
    const base = k * faceStride;
    const facingIdx = dirIndex(face[0] as string);
    const cullIdx = dirIndex(face[1] as string);
    faceBuf[base] = facingIdx < 0 ? 6 : facingIdx;
    faceBuf[base + 1] = cullIdx < 0 ? 6 : cullIdx;
    for (let t = 2; t < 6; t++) faceBuf[base + t] = face[t] as number;
    for (let t = 6; t < 26; t++) faceBuf[base + t] = (face[t] as number) / 16; // 表里坐标、uv 以 1/16 格为单位
    const ax = faceBuf[base + 9] - faceBuf[base + 6], ay = faceBuf[base + 10] - faceBuf[base + 7], az = faceBuf[base + 11] - faceBuf[base + 8];
    const bx = faceBuf[base + 15] - faceBuf[base + 6], by = faceBuf[base + 16] - faceBuf[base + 7], bz = faceBuf[base + 17] - faceBuf[base + 8];
    let nx = by * az - bz * ay, ny = bz * ax - bx * az, nz = bx * ay - by * ax;
    const normalLen = Math.hypot(nx, ny, nz) || 1;
    nx /= normalLen;
    ny /= normalLen;
    nz /= normalLen;
    faceBuf[base + 26] = nx;
    faceBuf[base + 27] = ny;
    faceBuf[base + 28] = nz;
    // 整格面：沿轴、在面内盖满整个格（能参加合并；贴在方块边界上的整格面，和水面这种在格子中间的都算）
    let full = facingIdx >= 0 ? 1 : 0;
    if (full) {
      const ax2 = facingIdx >> 1; // 0 x 1 y 2 z
      for (let q2 = 0; q2 < 4; q2++)
        for (let coordAxis = 0; coordAxis < 3; coordAxis++) {
          const coord = faceBuf[base + 6 + q2 * 3 + coordAxis];
          if (coordAxis === ax2) { if (coord !== faceBuf[base + 6 + coordAxis]) full = 0; }
          else if (coord !== 0 && coord !== 1) full = 0;
        }
    }
    faceBuf[base + 29] = full;
  });
  FACES[voxel] = faceBuf;
});
export const blockProps = { full: FULL, 遮: OCC, leaf: LEAF, 光: AO, layer: CLS, tint: TINT, spin: SPIN, offset: OFFS, plant: PLANT, cross: CROSS, opaque: OPAQ };
export const voxelCount = tableSize;
export const faceTable: readonly Float32Array[] = FACES;
export const textureNames: readonly string[] = DATA.贴图;
export const isLeaves = (v: number) => LEAF[v] === 1;
export const isFullCube = (v: number) => FULL[v] === 1;

// ---------- 群系染色 ----------
export const biomeNames = biomeIds;
export const biomeIndex = (name: string) => Math.max(0, biomeNames.indexOf(name));
const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
// 暮色森林 ColorHandler：(树叶色 & 0xFEFEFE + k) >> 1
const avgColor = (c: number, k: number) => ((c & 0xfefefe) + k) >> 1;
const fixedColorValues = fixedColors.map((s) => parseInt(s.slice(1), 16));
export type TintTable = { t: Uint8Array; C: number };
// 群系号 × 染色路 → sRGB 字节。水色可以按群系另给，不给就用群系表里的水色
export const buildTintTable = (waterOverrides?: Record<string, string>): TintTable => {
  const pathCount = 6 + fixedColors.length;
  const t = new Uint8Array(biomeNames.length * pathCount * 3).fill(255);
  biomeNames.forEach((biomeName, biomeIdx) => {
    const palette = biomeColors(biomeName);
    const water = waterOverrides?.[biomeName] ? parseInt(waterOverrides[biomeName].slice(1), 16) : palette.water;
    const rows = [0xffffff, palette.grass, palette.foliage, avgColor(palette.foliage, 0x469a66), avgColor(palette.foliage, 0xc0e694), water, ...fixedColorValues];
    rows.forEach((c, k) => t.set(rgb(c), (biomeIdx * pathCount + k) * 3));
  });
  return { t, C: pathCount };
};
export const blockTint = (voxel: number, biome: string, x: number, z: number): number => {
  const k = TINT[voxel];
  if (k === 0) return 0xffffff;
  if (k >= 6) return fixedColorValues[k - 6];
  if (k === 1) return grassColor(biome, x, z);
  if (k === 5) return waterColor(biome);
  const leafColor = foliageColor(biome, x, z);
  return k === 2 ? leafColor : avgColor(leafColor, k === 3 ? 0x469a66 : 0xc0e694);
};


