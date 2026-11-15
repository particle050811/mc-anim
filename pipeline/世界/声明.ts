// 世界声明 sourcing/worlds/<世界>.toml：一个存档里的一个维度，从头生成它要的东西（服务端、种子、模组、数据包、预生成范围），
// 和从它烘出哪些地形包（区域范围、场景原点）。同名的 <世界>.编辑.toml 是编辑层（编辑/）。字段说明见 docs/世界.md。
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { config } from '../环境/配置.ts';
import { codeRoot } from '../环境/路径.ts';
import { dimensionRegionDir } from './存档.ts';

export type RegionRange = { RX: [number, number]; RZ: [number, number] };
export type PackDecl = {
  名: string;
  /** 只烘这些区域（两端都含）；不写 = 存档里这个维度的全部区域文件 */
  区域?: RegionRange;
  /** [ox, oy, oz]；不写用 烘焙.原点 */
  原点: [number, number, number];
  来源?: string;
  /** false = 这个包不套编辑层（默认套） */
  applyEdits: boolean;
  /** false = 烘了也不登记进 assets/地形版本.json（演示、试验用的包） */
  登记: boolean;
};
/** 矩形写 两角，或 中心 加 半边；走廊写 折线、半宽，可选 去掉（已在别的矩形块里的区块不重复生成）；区块表写 文件（相对 sourcing/worlds/ 的 JSON，{"区块": [[cx, cz], …]}，
 *  程序算出来的散点区块，例：anim world 远景 地标 排的远处地标小块）。怎么算区块见 预生成/范围.ts */
export type PregenBox = {
  名: string;
  形状: '矩形' | '走廊' | '区块表';
  文件?: string;
  两角?: [number, number, number, number];
  中心?: [number, number];
  半边?: [number, number];
  折线?: [number, number][];
  半宽?: number;
  去掉?: string[];
  依据?: string;
};
export type WorldDecl = {
  名称: string;
  文件: string;
  服务端: string;
  存档: string;
  维度: string;
  /** 包.json 的 维度：主世界 / 暮色 / 下界 … */
  packDimension: string;
  /** 烘焙时整个高度都存（有顶的维度：从上往下第一层是基岩顶，按「最高整格方块 = 地表」只会存下一层顶）；见 烘焙/烘焙.ts 的 全高 */
  fullHeight: boolean;
  种子?: string;
  /** 建新世界时写进 server.properties 的 level-type；不写 minecraft:normal（地形模组改的是普通世界，large_biomes 和 Tectonic 互斥） */
  worldType: string;
  /** 建新世界时写 generate-structures；不写 true。主世界取材一律 false（结构全禁，用户 10-04 定），它在 level.dat 里管所有维度，所以主世界和暮色各建各的存档 */
  生成结构: boolean;
  Forge?: string;
  模组: string[];
  另需模组文件: string[];
  数据包: string[];
  预生成: { 区域文件范围?: RegionRange; 区块数?: number; 块: PregenBox[] };
  包: PackDecl[];
  /** 远景包（pipeline/世界/远景/）：导入范围（预生成的矩形块）外扩多远、中层（16 米）和细带（8 米）在交界外多宽，米 */
  远景?: { 包: string; 外扩: number; 中宽: number; 细宽: number };
  /** 烘焙、转码时的可见变换（烘焙/可见.ts）：埋住的格换成 填充；保真 盒碰到的区段原样保留（作品的挖框、整平要落在里面，anim check 核） */
  visible: { fillBlock: string; 保真: { 名: string; 盒: [number, number, number, number]; 出处?: string }[] };
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
    if (d.名称 !== worldName) throw fileError(`名称 要和文件名一致（${worldName}）`);
    const dimension = d.维度;
    if (typeof dimension !== 'string' || !dimension.includes(':')) throw fileError('维度 要写成 命名空间:名字');
    if (typeof d.服务端 !== 'string') throw fileError('要写 服务端（游戏环境 ANIM_GAME 下的服务端目录名）');
    const knownDim = knownDims[dimension];
    const bake = (d.烘焙 ?? {}) as Record<string, unknown>;
    const packDimension = typeof bake.包维度 === 'string' ? bake.包维度 : knownDim?.packDimension;
    if (!packDimension) throw fileError(`维度 ${dimension} 不认识，要在 [烘焙] 写 包维度（包.json 的 维度）`);
    if (bake.全高 !== undefined && typeof bake.全高 !== 'boolean') throw fileError('烘焙.全高 要写 true 或 false');
    const fullHeight = typeof bake.全高 === 'boolean' ? bake.全高 : (knownDim?.fullHeight ?? false);
    const parseOrigin = (v: unknown, fieldName: string): [number, number, number] | undefined => {
      if (v === undefined) return undefined;
      if (!Array.isArray(v) || v.length !== 3 || !v.every(Number.isInteger)) throw fileError(`${fieldName} 要写 [ox, oy, oz] 三个整数`);
      if (v[0] % 2048 || v[2] % 2048) throw fileError(`${fieldName} 的 ox、oz 要是 2048 的整数倍`);
      return [v[0], v[1], v[2]];
    };
    const defaultOrigin = parseOrigin(bake.原点, '烘焙.原点');
    if (bake.填充 !== undefined && (typeof bake.填充 !== 'string' || !bake.填充.includes(':'))) throw fileError('烘焙.填充 要写方块状态（命名空间:名字）');
    const preserve = ((bake.保真 ?? []) as Record<string, unknown>[]).map((k, i) => {
      const where = `烘焙.保真 第 ${i + 1} 个`;
      if (typeof k.名 !== 'string' || !k.名) throw fileError(`${where} 要写 名`);
      const box = k.盒 as number[];
      if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isInteger) || box[0]! > box[2]! || box[1]! > box[3]!) throw fileError(`${where}（${k.名}）的 盒 要写游戏坐标 [x0, z0, x1, z1]，两端都含、小的在前`);
      return { 名: k.名, 盒: box as [number, number, number, number], 出处: typeof k.出处 === 'string' ? k.出处 : undefined };
    });
    const packs = ((bake.包 ?? []) as Record<string, unknown>[]).map((b, i): PackDecl => {
      if (typeof b.名 !== 'string' || !b.名) throw fileError(`烘焙.包 第 ${i + 1} 个要写 名`);
      const origin = parseOrigin(b.原点, `包 ${b.名} 的 原点`) ?? defaultOrigin;
      if (!origin) throw fileError(`包 ${b.名} 没有原点（写在 [烘焙] 原点 或包里）`);
      if (knownDim && origin[1] !== knownDim.oy) throw fileError(`包 ${b.名} 的 oy 是 ${origin[1]}，${dimension} 一律 ${knownDim.oy}（engine 按这个换竖直坐标）`);
      return { 名: b.名, 区域: parseRegion(b.区域, `包 ${b.名} 的 区域`), 原点: origin, 来源: typeof b.来源 === 'string' ? b.来源 : undefined, applyEdits: b.套编辑 !== false, 登记: b.登记 !== false };
    });
    const dupNames = packs.map((b) => b.名).filter((n, i, a) => a.indexOf(n) !== i);
    if (dupNames.length) throw fileError(`包重名：${dupNames.join('、')}`);
    const pregen = (d.预生成 ?? {}) as Record<string, unknown>;
    const chunks = ((pregen.块 ?? []) as Record<string, unknown>[]).map((k, i): PregenBox => {
      const fieldName = `预生成.块 第 ${i + 1} 个`;
      if (typeof k.名 !== 'string') throw fileError(`${fieldName} 要写 名`);
      const basis = typeof k.依据 === 'string' ? k.依据 : undefined;
      const shape = k.形状 ?? (k.折线 !== undefined ? '走廊' : '矩形');
      if (shape === '走廊') {
        const rawPolyline = k.折线;
        if (!Array.isArray(rawPolyline) || rawPolyline.length < 2) throw fileError(`${fieldName}（${k.名}）是走廊，折线 要写至少两个 [x, z]`);
        const polyline = rawPolyline.map((p, j) => toPair(p, `${fieldName}.折线 第 ${j + 1} 点`));
        if (typeof k.半宽 !== 'number' || !(k.半宽 > 0)) throw fileError(`${fieldName}（${k.名}）是走廊，要写 半宽（米，正数）`);
        return { 名: k.名, 形状: shape, 折线: polyline, 半宽: k.半宽, 去掉: stringList(k.去掉, `${fieldName}.去掉`), 依据: basis };
      }
      if (shape === '区块表') {
        if (typeof k.文件 !== 'string' || !k.文件) throw fileError(`${fieldName}（${k.名}）是区块表，要写 文件`);
        return { 名: k.名, 形状: shape, 文件: k.文件, 依据: basis };
      }
      if (shape !== '矩形') throw fileError(`${fieldName} 的 形状 只认 矩形、走廊、区块表`);
      const corners = k.两角 as number[] | undefined;
      if (corners !== undefined && (!Array.isArray(corners) || corners.length !== 4 || !corners.every(Number.isInteger))) throw fileError(`${fieldName} 的 两角 要写 [x1, z1, x2, z2]`);
      if (!corners && (k.中心 === undefined || k.半边 === undefined)) throw fileError(`${fieldName} 要写 两角，或 中心 加 半边（走廊写 折线、半宽）`);
      return { 名: k.名, 形状: shape, 两角: corners as PregenBox['两角'], 中心: k.中心 === undefined ? undefined : toPair(k.中心, `${fieldName}.中心`), 半边: k.半边 === undefined ? undefined : toPair(k.半边, `${fieldName}.半边`), 依据: basis };
    });
    const boxNames = chunks.map((k) => k.名);
    const dupBoxNames = boxNames.filter((n, i) => boxNames.indexOf(n) !== i);
    if (dupBoxNames.length) throw fileError(`预生成块重名：${dupBoxNames.join('、')}`);
    for (const k of chunks) for (const n of k.去掉 ?? []) if (!chunks.some((b) => b.名 === n && b.形状 === '矩形')) throw fileError(`走廊 ${k.名} 的 去掉 写了 ${n}，没有这个矩形块`);
    const farView = d.远景 as Record<string, unknown> | undefined;
    let farTerrain: WorldDecl['远景'];
    if (farView !== undefined) {
      if (typeof farView.包 !== 'string' || !farView.包) throw fileError('远景 要写 包（远景包名）');
      const toMeters = (k: string) => {
        const v = farView[k];
        if (typeof v !== 'number' || !(v >= 0)) throw fileError(`远景.${k} 要写非负的米数`);
        return v;
      };
      farTerrain = { 包: farView.包, 外扩: toMeters('外扩'), 中宽: toMeters('中宽'), 细宽: toMeters('细宽') };
    }
    return {
      名称: worldName,
      文件: fileName,
      服务端: d.服务端,
      存档: typeof d.存档 === 'string' ? d.存档 : worldName,
      维度: dimension,
      packDimension,
      fullHeight,
      种子: d.种子 === undefined ? undefined : String(d.种子),
      worldType: typeof d.世界类型 === 'string' ? d.世界类型 : 'minecraft:normal',
      生成结构: d.生成结构 !== false,
      Forge: typeof d.Forge === 'string' ? d.Forge : undefined,
      模组: stringList(d.模组, '模组'),
      另需模组文件: stringList(d.另需模组文件, '另需模组文件'),
      数据包: stringList(d.数据包, '数据包'),
      预生成: { 区域文件范围: parseRegion(pregen.区域文件范围, '预生成.区域文件范围'), 区块数: typeof pregen.区块数 === 'number' ? pregen.区块数 : undefined, 块: chunks },
      包: packs,
      远景: farTerrain,
      visible: { fillBlock: typeof bake.填充 === 'string' ? bake.填充 : 'minecraft:stone', 保真: preserve },
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

/** 存档的世界目录：--存档 给了就用它，否则 <ANIM_GAME>/<服务端>/<存档> */
export const saveDir = (w: WorldDecl, overrideDir?: string) => (overrideDir ? path.resolve(overrideDir) : path.isAbsolute(w.存档) ? w.存档 : path.join(config('游戏'), w.服务端, w.存档));
export const regionDir = (w: WorldDecl, overrideDir?: string) => path.join(saveDir(w, overrideDir), dimensionRegionDir(w.维度));

/** 哪个世界声明烘这个包（转码按它取可见变换的设置）；没有返回 null */
export const packWorld = (packName: string): WorldDecl | null => {
  for (const worldName of listWorlds()) {
    const w = readDecl(worldName);
    if (w.包.some((b) => b.名 === packName)) return w;
  }
  return null;
};

/** 包在世界声明里吗；不给名字且只有一个包就是它 */
export const pickPack = (w: WorldDecl, packName?: string) => {
  if (packName) {
    const b = w.包.find((x) => x.名 === packName);
    if (!b) throw new Error(`世界 ${w.名称} 没声明包 ${packName}；有：${w.包.map((x) => x.名).join('、') || '（无）'}`);
    return [b];
  }
  return w.包;
};
