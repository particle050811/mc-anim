// 世界声明 sourcing/worlds/<世界>.toml：一个存档里的一个维度，从头生成它要的东西（服务端、种子、模组、数据包、预生成范围），
// 和从它烘出哪些地形包（区域范围、场景原点）。同名的 <世界>.编辑.toml 是编辑层（编辑/）。字段说明见 docs/世界.md。
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { config } from '../环境/配置.ts';
import { codeRoot } from '../环境/路径.ts';
import { dimensionRegionDir } from './存档.ts';
import type { SaveFormatSpec } from './存档格式.ts';

export type RegionRange = { RX: [number, number]; RZ: [number, number] };
export type PackDecl = {
  name: string;
  /** 只烘这些区域（两端都含）；不写 = 存档里这个维度的全部区域文件 */
  region?: RegionRange;
  /** [ox, oy, oz]；不写用 烘焙.原点 */
  origin: [number, number, number];
  source?: string;
  /** false = 这个包不套编辑层（默认套） */
  applyEdits: boolean;
  /** false = 烘了也不登记进 assets/地形版本.json（演示、试验用的包） */
  entries: boolean;
  /** 第一次登记时写进 assets/地形版本.json 的许可、可见性（docs/决策/0002-资产标准.md）；不写 = 自己游戏里生成的世界那一套（LicenseRef-Minecraft-Derived、发布）。别人给的存档要写 */
  license?: string;
  visibility?: string;
};
/** 矩形写 两角，或 中心 加 半边；走廊写 折线、半宽，可选 去掉（已在别的矩形块里的区块不重复生成）；区块表写 文件（相对 sourcing/worlds/ 的 JSON，{"区块": [[cx, cz], …]}，
 *  程序算出来的散点区块，例：anim world far landmarks 排的远处地标小块）。怎么算区块见 预生成/范围.ts */
export type PregenBox = {
  name: string;
  shape: '矩形' | '走廊' | '区块表';
  file?: string;
  corners?: [number, number, number, number];
  center?: [number, number];
  halfSide?: [number, number];
  polyline?: [number, number][];
  halfWidth?: number;
  exclude?: string[];
  basis?: string;
};
export type WorldDecl = {
  displayName: string;
  file: string;
  server: string;
  save: string;
  /** 存档格式（存档格式.ts）：不写 = 原版 .mca；saveFormat = "mcr3d" 是 Better Cubic Chunks 的立方区块存档，要同时写 yRange = [底, 顶]（烘哪一段高度，游戏 y，两端都含、对齐 16） */
  saveFormat: SaveFormatSpec;
  dimension: string;
  /** 包.json 的 维度：主世界 / 暮色 / 下界 … */
  packDimension: string;
  /** 烘焙时整个高度都存（有顶的维度：从上往下第一层是基岩顶，按「最高整格方块 = 地表」只会存下一层顶）；见 烘焙/烘焙.ts 的 全高 */
  fullHeight: boolean;
  /** 烘焙时粗级合并发光优先（烘焙/合并.ts）：露在外面的熔岩、火、萤石……远处不被合成岩石。[bake] glowFirst，不写 false（照 Voxy 原样） */
  glowFirst: boolean;
  seed?: string;
  /** 建新世界时写进 server.properties 的 level-type；不写 minecraft:normal（地形模组改的是普通世界，large_biomes 和 Tectonic 互斥） */
  worldType: string;
  /** 建新世界时写 generate-structures；不写 true。主世界取材一律 false（结构全禁，用户 10-04 定），它在 level.dat 里管所有维度，所以主世界和暮色各建各的存档 */
  generateStructures: boolean;
  Forge?: string;
  mods: string[];
  extraModFiles: string[];
  datapacks: string[];
  pregen: { regionFileRange?: RegionRange; chunkCount?: number; tile: PregenBox[] };
  pack: PackDecl[];
  /** 远景包（pipeline/世界/远景/）：导入范围（预生成的矩形块）外扩多远、中层（16 米）和细带（8 米）在交界外多宽，米 */
  farView?: { pack: string; outset: number; midWidth: number; fineWidth: number };
  /** 烘焙、转码时的可见变换（烘焙/可见.ts）：埋住的格换成 填充；保真 盒碰到的区段原样保留（作品的挖框、整平要落在里面，anim check 核） */
  visible: { fillBlock: string; faithful: { name: string; boxes: [number, number, number, number]; provenance?: string }[] };
};

export const worldDir = () => path.join(codeRoot(), 'sourcing', 'worlds');
export const declFile = (worldName: string) => path.join(worldDir(), `${worldName}.toml`);
export const editFile = (worldName: string) => path.join(worldDir(), `${worldName}.编辑.toml`);

export const listWorlds = () =>
  fs.existsSync(worldDir())
    ? fs
        .readdirSync(worldDir())
        .filter((f) => f.endsWith('.toml') && !f.endsWith('.编辑.toml'))
        .map((f) => f.slice(0, -'.toml'.length))
        .sort()
    : [];

/** 维度 id → 包.json 的 维度 和默认 oy（场景 z = 0 对应的游戏 y） */
const knownDims: Record<string, { packDimension: string; oy: number; fullHeight?: boolean }> = {
  'minecraft:overworld': { packDimension: '主世界', oy: 64 },
  'twilightforest:twilight_forest': { packDimension: '暮色', oy: 0 },
  // 下界 y 0～127 是地形（min_y 0、logical_height 128），基岩顶在 y 127：场景 z = 游戏 y
  'minecraft:the_nether': { packDimension: '下界', oy: 0, fullHeight: true },
};

const toPair = (v: unknown, fieldName: string): [number, number] => {
  if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isInteger)) throw new Error(`${fieldName} 要写两个整数`);
  return [v[0], v[1]];
};
const parseRegion = (v: unknown, fieldName: string): RegionRange | undefined => {
  if (v === undefined) return undefined;
  const o = v as Record<string, unknown>;
  const r = { RX: toPair(o.RX, `${fieldName}.RX`), RZ: toPair(o.RZ, `${fieldName}.RZ`) };
  if (r.RX[0] > r.RX[1] || r.RZ[0] > r.RZ[1]) throw new Error(`${fieldName} 要小的在前`);
  return r;
};
const stringList = (v: unknown, fieldName: string): string[] => {
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw new Error(`${fieldName} 要是字符串数组`);
  return v;
};

export const parseDecl = (text: string, worldName: string, fileName = `${worldName}.toml`): WorldDecl => {
  const d = parse(text) as Record<string, unknown>;
  const fileError = (s: string) => new Error(`${fileName}：${s}`);
  try {
    if (d.displayName !== worldName) throw fileError(`名称 要和文件名一致（${worldName}）`);
    const dimension = d.dimension;
    if (typeof dimension !== 'string' || !dimension.includes(':')) throw fileError('维度 要写成 命名空间:名字');
    if (typeof d.server !== 'string') throw fileError('要写 服务端（游戏环境 ANIM_GAME 下的服务端目录名）');
    const knownDim = knownDims[dimension];
    let saveFormat: SaveFormatSpec = { kind: 'mca' };
    if (d.saveFormat === 'mcr3d') {
      const yRange = toPair(d.yRange, 'yRange');
      if (yRange[0] & 15 || (yRange[1] + 1) & 15 || yRange[0] > yRange[1] || yRange[0] < -32768 || yRange[1] > 32767) throw fileError(`yRange 要对齐 cube（底是 16 的倍数、顶是 16 的倍数减 1）、在 −32768～32767 里，给的是 ${yRange.join('～')}`);
      saveFormat = { kind: 'mcr3d', yRange };
    } else if (d.saveFormat !== undefined && d.saveFormat !== 'mca') throw fileError(`saveFormat 只认 mca、mcr3d，给的是 ${String(d.saveFormat)}`);
    else if (d.yRange !== undefined) throw fileError('yRange 只有 saveFormat = "mcr3d" 才用（.mca 的高度范围在存档里）');
    const bake = (d.bake ?? {}) as Record<string, unknown>;
    const packDimension = typeof bake.包维度 === 'string' ? bake.包维度 : knownDim?.packDimension;
    if (!packDimension) throw fileError(`维度 ${dimension} 不认识，要在 [烘焙] 写 包维度（包.json 的 维度）`);
    if (bake.全高 !== undefined && typeof bake.全高 !== 'boolean') throw fileError('烘焙.全高 要写 true 或 false');
    const fullHeight = typeof bake.全高 === 'boolean' ? bake.全高 : (knownDim?.fullHeight ?? false);
    if (bake.glowFirst !== undefined && typeof bake.glowFirst !== 'boolean') throw fileError('烘焙.glowFirst 要写 true 或 false');
    const parseOrigin = (v: unknown, fieldName: string): [number, number, number] | undefined => {
      if (v === undefined) return undefined;
      if (!Array.isArray(v) || v.length !== 3 || !v.every(Number.isInteger)) throw fileError(`${fieldName} 要写 [ox, oy, oz] 三个整数`);
      if (v[0] % 2048 || v[2] % 2048) throw fileError(`${fieldName} 的 ox、oz 要是 2048 的整数倍`);
      return [v[0], v[1], v[2]];
    };
    const defaultOrigin = parseOrigin(bake.origin, '烘焙.原点');
    if (bake.fill !== undefined && (typeof bake.fill !== 'string' || !bake.fill.includes(':'))) throw fileError('烘焙.填充 要写方块状态（命名空间:名字）');
    const preserve = ((bake.faithful ?? []) as Record<string, unknown>[]).map((k, i) => {
      const where = `烘焙.保真 第 ${i + 1} 个`;
      if (typeof k.name !== 'string' || !k.name) throw fileError(`${where} 要写 名`);
      const box = k.boxes as number[];
      if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isInteger) || box[0]! > box[2]! || box[1]! > box[3]!) throw fileError(`${where}（${k.name}）的 盒 要写游戏坐标 [x0, z0, x1, z1]，两端都含、小的在前`);
      return { name: k.name, boxes: box as [number, number, number, number], provenance: typeof k.provenance === 'string' ? k.provenance : undefined };
    });
    const packs = ((bake.pack ?? []) as Record<string, unknown>[]).map((b, i): PackDecl => {
      if (typeof b.name !== 'string' || !b.name) throw fileError(`烘焙.包 第 ${i + 1} 个要写 名`);
      const origin = parseOrigin(b.origin, `包 ${b.name} 的 原点`) ?? defaultOrigin;
      if (!origin) throw fileError(`包 ${b.name} 没有原点（写在 [烘焙] 原点 或包里）`);
      if (knownDim && origin[1] !== knownDim.oy) throw fileError(`包 ${b.name} 的 oy 是 ${origin[1]}，${dimension} 一律 ${knownDim.oy}（engine 按这个换竖直坐标）`);
      if (b.visibility !== undefined && !['公开', '发布', '提取', '私有'].includes(b.visibility as string)) throw fileError(`包 ${b.name} 的 visibility 只能是 公开、发布、提取、私有`);
      if (b.license !== undefined && typeof b.license !== 'string') throw fileError(`包 ${b.name} 的 license 要写 SPDX 表达式`);
      return { name: b.name, region: parseRegion(b.region, `包 ${b.name} 的 区域`), origin: origin, source: typeof b.source === 'string' ? b.source : undefined, applyEdits: b.套编辑 !== false, entries: b.entries !== false, license: b.license as string | undefined, visibility: b.visibility as string | undefined };
    });
    const dupNames = packs.map((b) => b.name).filter((n, i, a) => a.indexOf(n) !== i);
    if (dupNames.length) throw fileError(`包重名：${dupNames.join('、')}`);
    const pregen = (d.pregen ?? {}) as Record<string, unknown>;
    const chunks = ((pregen.tile ?? []) as Record<string, unknown>[]).map((k, i): PregenBox => {
      const fieldName = `预生成.块 第 ${i + 1} 个`;
      if (typeof k.name !== 'string') throw fileError(`${fieldName} 要写 名`);
      const basis = typeof k.basis === 'string' ? k.basis : undefined;
      const shape = k.shape ?? (k.polyline !== undefined ? '走廊' : '矩形');
      if (shape === '走廊') {
        const rawPolyline = k.polyline;
        if (!Array.isArray(rawPolyline) || rawPolyline.length < 2) throw fileError(`${fieldName}（${k.name}）是走廊，折线 要写至少两个 [x, z]`);
        const polyline = rawPolyline.map((p, j) => toPair(p, `${fieldName}.折线 第 ${j + 1} 点`));
        if (typeof k.halfWidth !== 'number' || !(k.halfWidth > 0)) throw fileError(`${fieldName}（${k.name}）是走廊，要写 半宽（米，正数）`);
        return { name: k.name, shape: shape, polyline: polyline, halfWidth: k.halfWidth, exclude: stringList(k.exclude, `${fieldName}.去掉`), basis: basis };
      }
      if (shape === '区块表') {
        if (typeof k.file !== 'string' || !k.file) throw fileError(`${fieldName}（${k.name}）是区块表，要写 文件`);
        return { name: k.name, shape: shape, file: k.file, basis: basis };
      }
      if (shape !== '矩形') throw fileError(`${fieldName} 的 形状 只认 矩形、走廊、区块表`);
      const corners = k.corners as number[] | undefined;
      if (corners !== undefined && (!Array.isArray(corners) || corners.length !== 4 || !corners.every(Number.isInteger))) throw fileError(`${fieldName} 的 两角 要写 [x1, z1, x2, z2]`);
      if (!corners && (k.center === undefined || k.halfSide === undefined)) throw fileError(`${fieldName} 要写 两角，或 中心 加 半边（走廊写 折线、半宽）`);
      return { name: k.name, shape: shape, corners: corners as PregenBox['corners'], center: k.center === undefined ? undefined : toPair(k.center, `${fieldName}.中心`), halfSide: k.halfSide === undefined ? undefined : toPair(k.halfSide, `${fieldName}.半边`), basis: basis };
    });
    const boxNames = chunks.map((k) => k.name);
    const dupBoxNames = boxNames.filter((n, i) => boxNames.indexOf(n) !== i);
    if (dupBoxNames.length) throw fileError(`预生成块重名：${dupBoxNames.join('、')}`);
    for (const k of chunks) for (const n of k.exclude ?? []) if (!chunks.some((b) => b.name === n && b.shape === '矩形')) throw fileError(`走廊 ${k.name} 的 去掉 写了 ${n}，没有这个矩形块`);
    const farView = d.farView as Record<string, unknown> | undefined;
    let farTerrain: WorldDecl['farView'];
    if (farView !== undefined) {
      if (typeof farView.pack !== 'string' || !farView.pack) throw fileError('远景 要写 包（远景包名）');
      const toMeters = (k: string) => {
        const v = farView[k];
        if (typeof v !== 'number' || !(v >= 0)) throw fileError(`远景.${k} 要写非负的米数`);
        return v;
      };
      farTerrain = { pack: farView.pack, outset: toMeters('outset'), midWidth: toMeters('midWidth'), fineWidth: toMeters('fineWidth') };
    }
    return {
      displayName: worldName,
      file: fileName,
      server: d.server,
      save: typeof d.save === 'string' ? d.save : worldName,
      saveFormat,
      dimension: dimension,
      packDimension,
      fullHeight,
      glowFirst: bake.glowFirst === true,
      seed: d.seed === undefined ? undefined : String(d.seed),
      worldType: typeof d.世界类型 === 'string' ? d.世界类型 : 'minecraft:normal',
      generateStructures: d.generateStructures !== false,
      Forge: typeof d.Forge === 'string' ? d.Forge : undefined,
      mods: stringList(d.mods, '模组'),
      extraModFiles: stringList(d.extraModFiles, '另需模组文件'),
      datapacks: stringList(d.datapacks, '数据包'),
      pregen: { regionFileRange: parseRegion(pregen.regionFileRange, '预生成.区域文件范围'), chunkCount: typeof pregen.chunkCount === 'number' ? pregen.chunkCount : undefined, tile: chunks },
      pack: packs,
      farView: farTerrain,
      visible: { fillBlock: typeof bake.fill === 'string' ? bake.fill : 'minecraft:stone', faithful: preserve },
    };
  } catch (e) {
    if ((e as Error).message.startsWith(fileName)) throw e;
    throw fileError((e as Error).message);
  }
};

export const readDecl = (worldName: string): WorldDecl => {
  const f = declFile(worldName);
  if (!fs.existsSync(f)) throw new Error(`没有世界声明 ${path.relative(codeRoot(), f)}；有的：${listWorlds().join('、') || '（无）'}`);
  return parseDecl(fs.readFileSync(f, 'utf8'), worldName, path.relative(codeRoot(), f));
};

/** 存档的世界目录：--save-dir 给了就用它，否则 <ANIM_GAME>/<服务端>/<存档> */
export const saveDir = (w: WorldDecl, overrideDir?: string) => (overrideDir ? path.resolve(overrideDir) : path.isAbsolute(w.save) ? w.save : path.join(config('游戏'), w.server, w.save));
export const regionDir = (w: WorldDecl, overrideDir?: string) => {
  if (w.saveFormat.kind === 'mca') return path.join(saveDir(w, overrideDir), dimensionRegionDir(w.dimension));
  // 立方存档只见过主世界的（<存档>/cubes/），别的维度放哪没核过
  if (w.dimension !== 'minecraft:overworld') throw new Error(`${w.file}：立方存档（mcr3d）只认主世界，${w.dimension} 的 cube 放在哪还没核过`);
  return path.join(saveDir(w, overrideDir), 'cubes');
};

/** 哪个世界声明烘这个包（转码按它取可见变换的设置）；没有返回 null */
export const packWorld = (packName: string): WorldDecl | null => {
  for (const worldName of listWorlds()) {
    const w = readDecl(worldName);
    if (w.pack.some((b) => b.name === packName)) return w;
  }
  return null;
};

/** 包在世界声明里吗；不给名字且只有一个包就是它 */
export const pickPack = (w: WorldDecl, packName?: string) => {
  if (packName) {
    const b = w.pack.find((x) => x.name === packName);
    if (!b) throw new Error(`世界 ${w.displayName} 没声明包 ${packName}；有：${w.pack.map((x) => x.name).join('、') || '（无）'}`);
    return [b];
  }
  return w.pack;
};
