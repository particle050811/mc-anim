// 游戏导出的群系色表、方块表（mcai biomes / blocks）和手写表（数据/场景/关键帧/群系色、方块表，sourcing/extract/关键帧方块.py 出的）逐项比。
// 只读、只出报告：迁移期不拿导出表替换手写表（会改画面），报告给新章节选表、给手写规则找错用。
// 群系：定值逐项比；随位置变的，拿现行规则（engine/voxel/群系色.ts 的 grassColor、foliageColor、waterColor，喂手写表）在导出表的采样点上算，和游戏给的比。
// 方块：手写表的键（属性只写一部分）按「属性都对上、其余取默认状态的值」对到导出表的完整状态，再比标志各位、染色路、面（面按贴图名比，顶点从最小的角起头，不管手写表的起头）。

export type BiomeEntry = { 草: string; 叶: string; 水: string; 草修饰?: string; 叶修饰?: string; 采样?: { 草?: string[]; 叶?: string[]; 水?: string[] } };
export type BiomeTable = { 群系: Record<string, BiomeEntry>; 采样点?: [number, number][] };
/** 现行规则：颜色是 0xRRGGBB 整数 */
export type ColorRule = { grass: (biome: string, x: number, z: number) => number; foliage: (biome: string, x: number, z: number) => number; 水: (biome: string) => number };

const hex = (c: number) => `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;

export type BiomeReport = {
  手写数: number;
  导出数: number;
  只在导出: string[];
  只在手写: string[];
  定值不同: { 群系: string; 项: string; 手写: string; 导出: string }[];
  修饰不同: { 群系: string; 项: string; 手写?: string; 导出?: string }[];
  规则核对: { 群系: string; 项: string; 点数: number; 不同: number; 例: { x: number; z: number; 规则: string; 游戏: string }[]; 出错?: string }[];
};

export const checkBiomes = (exported: BiomeTable, handWritten: BiomeTable, colorRule?: ColorRule): BiomeReport => {
  const exportedBiomes = exported.群系, handwrittenBiomes = handWritten.群系;
  const sharedKeys = Object.keys(handwrittenBiomes).filter((k) => k in exportedBiomes).sort();
  const r: BiomeReport = {
    手写数: Object.keys(handwrittenBiomes).length,
    导出数: Object.keys(exportedBiomes).length,
    只在导出: Object.keys(exportedBiomes).filter((k) => !(k in handwrittenBiomes)).sort(),
    只在手写: Object.keys(handwrittenBiomes).filter((k) => !(k in exportedBiomes)).sort(),
    定值不同: [],
    修饰不同: [],
    规则核对: [],
  };
  for (const id of sharedKeys) {
    const a = handwrittenBiomes[id]!, b = exportedBiomes[id]!;
    for (const tintItem of ['草', '叶', '水'] as const) if (a[tintItem] !== b[tintItem]) r.定值不同.push({ 群系: id, 项: tintItem, 手写: a[tintItem], 导出: b[tintItem] });
    for (const tintModItem of ['草修饰', '叶修饰'] as const) if (a[tintModItem] !== b[tintModItem]) r.修饰不同.push({ 群系: id, 项: tintModItem, 手写: a[tintModItem], 导出: b[tintModItem] });
  }
  const samples = exported.采样点 ?? [];
  if (colorRule && samples.length) {
    for (const id of sharedKeys) {
      const b = exportedBiomes[id]!;
      for (const tintItem of ['草', '叶', '水'] as const) {
        const gameColors = b.采样?.[tintItem] ?? samples.map(() => b[tintItem]);
        const entry: BiomeReport['规则核对'][number] = { 群系: id, 项: tintItem, 点数: samples.length, 不同: 0, 例: [] };
        try {
          samples.forEach(([x, z], i) => {
            const c = hex(tintItem === '草' ? colorRule.grass(id, x, z) : tintItem === '叶' ? colorRule.foliage(id, x, z) : colorRule.水(id));
            if (c !== gameColors[i]) {
              entry.不同++;
              if (entry.例.length < 3) entry.例.push({ x, z, 规则: c, 游戏: gameColors[i]! });
            }
          });
        } catch (e) {
          entry.出错 = (e as Error).message;
        }
        if (entry.不同 || entry.出错) r.规则核对.push(entry);
      }
    }
  }
  return r;
};

// ---------- 方块表 ----------
export type BlockEntry = [number, string | null, ...number[]];
export type BlockTable = { 贴图: string[]; 面组: unknown[][][]; 方块: Record<string, BlockEntry>; 附加?: { 不画?: string[] } };

export const splitState = (s: string) => {
  const i = s.indexOf('[');
  if (i < 0) return { 方块: s, properties: {} as Record<string, string> };
  const properties: Record<string, string> = {};
  for (const kv of s.slice(i + 1, -1).split(',')) {
    if (!kv) continue;
    const [k, v] = kv.split('=');
    properties[k!] = v!;
  }
  return { 方块: s.slice(0, i), properties };
};

/** 导出表按方块分的状态（表里的顺序，第一个是默认状态） */
export const groupByBlock = (blockTable: BlockTable) => {
  const m = new Map<string, { 键: string; properties: Record<string, string> }[]>();
  for (const stateKey of Object.keys(blockTable.方块)) {
    const { 方块: blockId, properties } = splitState(stateKey);
    let l = m.get(blockId);
    if (!l) m.set(blockId, (l = []));
    l.push({ 键: stateKey, properties });
  }
  return m;
};

/** 手写表的键 → 导出表的状态：手写键写了的属性都要一样；其余属性优先取和默认状态（导出表里该方块第一个状态）一样的 */
export const correspondingState = (handWrittenKey: string, statesByBlock: ReturnType<typeof groupByBlock>): string | undefined => {
  const { 方块: blockId, properties } = splitState(handWrittenKey);
  const l = statesByBlock.get(blockId);
  if (!l) return undefined;
  const matched = l.filter((s) => Object.entries(properties).every(([k, v]) => s.properties[k] === v));
  if (!matched.length) return undefined;
  const defaultProps = l[0]!.properties;
  return (matched.find((s) => Object.entries(s.properties).every(([k, v]) => k in properties || defaultProps[k] === v)) ?? matched[0]!).键;
};

type Face = (string | number)[];

/** 一个面换成比较用的文本：贴图号换贴图名，四个角（xyz + uv）从最小的那个角起头、绕向不变 */
export const standardFace = (f: Face, textures: string[], withFacing = true) => {
  const corners: number[][] = [];
  for (let i = 0; i < 4; i++) corners.push([...(f.slice(6 + i * 3, 9 + i * 3) as number[]), ...(f.slice(18 + i * 2, 20 + i * 2) as number[])]);
  let startIndex = 0;
  for (let i = 1; i < 4; i++) if (compareAngle(corners[i]!, corners[startIndex]!) < 0) startIndex = i;
  const rotatedCorners = [...corners.slice(startIndex), ...corners.slice(0, startIndex)];
  const overlayTexName = (f[3] as number) >= 0 ? textures[f[3] as number] : '';
  return JSON.stringify([withFacing ? f[0] : '', f[1], textures[f[2] as number], overlayTexName, f[4], f[5], rotatedCorners]);
};
const compareAngle = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
};
/** 只看几何：四个角的位置排好序；粗 = 位置取到 0.1 像素（防 z 冲突的 0.001、0.01 这类偏移算一样） */
const buildFaceGeometry = (f: Face, coarse = false) => {
  const corners: string[] = [];
  for (let i = 0; i < 4; i++) corners.push((f.slice(6 + i * 3, 9 + i * 3) as number[]).map((v) => (coarse ? Math.round(v * 10) / 10 : v)).join(','));
  return corners.sort().join(';');
};
/** 去掉 uv 的面（朝向不算） */
const withoutUv = (f: Face, textures: string[]) => JSON.stringify([f[1], textures[f[2] as number], (f[3] as number) >= 0 ? textures[f[3] as number] : '', f[4], f[5], buildFaceGeometry(f)]);

const blockFaces = (blockTable: BlockTable, entry: BlockEntry) => (entry.slice(2) as number[]).flatMap((g) => blockTable.面组[g] as Face[]);
const sameMultiset = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

export const flagBits = { 类: 3, 满: 4, 遮: 8, 光: 16, 转: 32, 偏: 64 } as const;
const getFlag = (flags: number, flagName: keyof typeof flagBits) => (flagName === '类' ? ['solid', 'cutout', 'translucent', 'liquid'][flags & 3]! : (flags & flagBits[flagName]) !== 0 ? '是' : '否');

export type BlockReport = {
  状态数: { 手写: number; 导出: number };
  方块数: { 手写: number; 导出: number };
  贴图数: { 手写: number; 导出: number; 只在手写: string[]; 只在导出数: number };
  只在导出的方块: { 数: number; 按命名空间: Record<string, number>; 例: string[] };
  只在手写的方块: string[];
  手写状态对不上: string[];
  导出不画: string[];
  对上: number;
  面: { 一致: number; 只差朝向: number; 贴图不同: number; 只差uv: number; 其余不同: number; 几何微差: number; 几何不同: number; 例: Record<string, { 手写键: string; 导出键: string; 说明: string }[]> };
  标志不同: Record<string, { 数: number; 组合: Record<string, number>; 例: string[] }>;
  染色不同: { 数: number; 组合: Record<string, number>; 例: string[] };
  多出的状态: { 数: number; 按命名空间: Record<string, number>; 最多的方块: [string, number][] };
};

export const checkBlocks = (exported: BlockTable, handWritten: BlockTable): BlockReport => {
  const statesByBlock = groupByBlock(exported);
  const handWrittenBlocks = new Set(Object.keys(handWritten.方块).map((k) => splitState(k).方块));
  const notDrawn = new Set(exported.附加?.不画 ?? []);
  const exportedTextures = new Set(exported.贴图);
  const handWrittenTextures = new Set(handWritten.贴图);
  const exportedOnlyBlockIds = [...statesByBlock.keys()].filter((b) => !handWrittenBlocks.has(b)).sort();
  const r: BlockReport = {
    状态数: { 手写: Object.keys(handWritten.方块).length, 导出: Object.keys(exported.方块).length },
    方块数: { 手写: handWrittenBlocks.size, 导出: statesByBlock.size },
    贴图数: { 手写: handWritten.贴图.length, 导出: exported.贴图.length, 只在手写: handWritten.贴图.filter((t) => !exportedTextures.has(t)), 只在导出数: exported.贴图.filter((t) => !handWrittenTextures.has(t)).length },
    只在导出的方块: { 数: exportedOnlyBlockIds.length, 按命名空间: countByNamespace(exportedOnlyBlockIds), 例: exportedOnlyBlockIds.slice(0, 40) },
    只在手写的方块: [...handWrittenBlocks].filter((b) => !statesByBlock.has(b) && !notDrawn.has(b)).sort(),
    手写状态对不上: [],
    导出不画: [...handWrittenBlocks].filter((b) => !statesByBlock.has(b) && notDrawn.has(b)).sort(),
    对上: 0,
    面: { 一致: 0, 只差朝向: 0, 贴图不同: 0, 只差uv: 0, 其余不同: 0, 几何微差: 0, 几何不同: 0, 例: {} },
    标志不同: {},
    染色不同: { 数: 0, 组合: {}, 例: [] },
    多出的状态: { 数: 0, 按命名空间: {}, 最多的方块: [] },
  };
  const usedBlocks = new Set<string>();
  const recordExample = (ruleKind: string, handWrittenKey: string, exportedKey: string, note: string) => {
    const l = (r.面.例[ruleKind] ??= []);
    if (l.length < 12) l.push({ 手写键: handWrittenKey, 导出键: exportedKey, 说明: note });
  };
  for (const [stateKey, handWrittenEntry] of Object.entries(handWritten.方块)) {
    if (!statesByBlock.has(splitState(stateKey).方块)) continue;
    const newKey = correspondingState(stateKey, statesByBlock);
    if (!newKey) {
      r.手写状态对不上.push(stateKey);
      continue;
    }
    usedBlocks.add(newKey);
    r.对上++;
    const exportedEntry = exported.方块[newKey]!;
    for (const flagName of Object.keys(flagBits) as (keyof typeof flagBits)[]) {
      const a = getFlag(handWrittenEntry[0], flagName), b = getFlag(exportedEntry[0], flagName);
      if (a === b) continue;
      const s = (r.标志不同[flagName] ??= { 数: 0, 组合: {}, 例: [] });
      s.数++;
      s.组合[`${a}→${b}`] = (s.组合[`${a}→${b}`] ?? 0) + 1;
      if (s.例.length < 12) s.例.push(stateKey);
    }
    if ((handWrittenEntry[1] ?? null) !== (exportedEntry[1] ?? null)) {
      r.染色不同.数++;
      const k = `${handWrittenEntry[1] ?? '不染'}→${exportedEntry[1] ?? '不染'}`;
      r.染色不同.组合[k] = (r.染色不同.组合[k] ?? 0) + 1;
      if (r.染色不同.例.length < 20) r.染色不同.例.push(`${stateKey}：${k}`);
    }
    const handWrittenFaces = blockFaces(handWritten, handWrittenEntry), exportedFaces = blockFaces(exported, exportedEntry);
    if (sameMultiset(handWrittenFaces.map((f) => standardFace(f, handWritten.贴图)), exportedFaces.map((f) => standardFace(f, exported.贴图)))) r.面.一致++;
    else if (sameMultiset(handWrittenFaces.map((f) => standardFace(f, handWritten.贴图, false)), exportedFaces.map((f) => standardFace(f, exported.贴图, false)))) {
      r.面.只差朝向++;
      recordExample('只差朝向', stateKey, newKey, '');
    } else if (!sameMultiset(handWrittenFaces.map((f) => buildFaceGeometry(f)), exportedFaces.map((f) => buildFaceGeometry(f)))) {
      const geometryMicro = sameMultiset(handWrittenFaces.map((f) => buildFaceGeometry(f, true)), exportedFaces.map((f) => buildFaceGeometry(f, true)));
      if (geometryMicro) r.面.几何微差++;
      else r.面.几何不同++;
      recordExample(geometryMicro ? '几何微差' : '几何不同', stateKey, newKey, `手写 ${handWrittenFaces.length} 面、导出 ${exportedFaces.length} 面`);
    } else {
      const faceKeys = (t: BlockTable, fs: Face[]) => fs.map((f) => `${buildFaceGeometry(f)}|${t.贴图[f[2] as number]}`);
      if (!sameMultiset(faceKeys(handWritten, handWrittenFaces), faceKeys(exported, exportedFaces))) {
        r.面.贴图不同++;
        const a = new Set(handWrittenFaces.map((f) => handWritten.贴图[f[2] as number])), b = new Set(exportedFaces.map((f) => exported.贴图[f[2] as number]));
        recordExample('贴图不同', stateKey, newKey, `手写 ${[...a].join('、')}；导出 ${[...b].join('、')}`);
      } else if (sameMultiset(handWrittenFaces.map((f) => withoutUv(f, handWritten.贴图)), exportedFaces.map((f) => withoutUv(f, exported.贴图)))) {
        r.面.只差uv++;
        recordExample('只差uv', stateKey, newKey, firstDiff(handWrittenFaces.map((f) => standardFace(f, handWritten.贴图, false)), exportedFaces.map((f) => standardFace(f, exported.贴图, false))));
      } else {
        r.面.其余不同++;
        recordExample('其余不同', stateKey, newKey, firstDiff(handWrittenFaces.map((f) => standardFace(f, handWritten.贴图, false)), exportedFaces.map((f) => standardFace(f, exported.贴图, false))));
      }
    }
  }
  const extraStates = Object.keys(exported.方块).filter((k) => !usedBlocks.has(k));
  r.多出的状态.数 = extraStates.length;
  r.多出的状态.按命名空间 = countByNamespace(extraStates);
  const extraByBlock = new Map<string, number>();
  for (const k of extraStates) extraByBlock.set(splitState(k).方块, (extraByBlock.get(splitState(k).方块) ?? 0) + 1);
  r.多出的状态.最多的方块 = [...extraByBlock].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 15);
  return r;
};

const firstDiff = (a: string[], b: string[]) => {
  const sa = new Set(a), sb = new Set(b);
  const x = a.find((f) => !sb.has(f)), y = b.find((f) => !sa.has(f));
  return `手写 ${x ?? '（无）'}；导出 ${y ?? '（无）'}`;
};

const countByNamespace = (ids: string[]) => {
  const m: Record<string, number> = {};
  for (const id of ids) {
    const ns = id.slice(0, id.indexOf(':'));
    m[ns] = (m[ns] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
};

// ---------- 报告文本 ----------
export const reportText = (biomeReport?: BiomeReport, blockReport?: BlockReport) => {
  const l: string[] = ['# 游戏导表核对', ''];
  if (biomeReport) {
    l.push('## 群系色', '');
    l.push(`手写 ${biomeReport.手写数} 个群系，导出 ${biomeReport.导出数} 个；只在导出 ${biomeReport.只在导出.length} 个，只在手写 ${biomeReport.只在手写.length} 个。`, '');
    if (biomeReport.只在手写.length) l.push(`只在手写：${biomeReport.只在手写.join('、')}`, '');
    if (biomeReport.只在导出.length) l.push(`只在导出：${biomeReport.只在导出.join('、')}`, '');
    l.push(`定值不同 ${biomeReport.定值不同.length} 处${biomeReport.定值不同.length ? '：' : '。'}`, '');
    for (const d of biomeReport.定值不同) l.push(`- ${d.群系} ${d.项}：手写 ${d.手写}，游戏 ${d.导出}`);
    if (biomeReport.定值不同.length) l.push('');
    l.push(`修饰不同 ${biomeReport.修饰不同.length} 处${biomeReport.修饰不同.length ? '：' : '。'}`, '');
    for (const d of biomeReport.修饰不同) l.push(`- ${d.群系} ${d.项}：手写 ${d.手写 ?? '无'}，导出 ${d.导出 ?? '无'}`);
    if (biomeReport.修饰不同.length) l.push('');
    l.push(`现行规则（engine/voxel/群系色.ts + 手写表）在采样点上和游戏不一样的 ${biomeReport.规则核对.length} 项${biomeReport.规则核对.length ? '：' : '。'}`, '');
    for (const d of biomeReport.规则核对) {
      l.push(`- ${d.群系} ${d.项}：${d.出错 ? `出错 ${d.出错}` : `${d.点数} 个点里 ${d.不同} 个不同，如 ${d.例.map((e) => `(${e.x}, ${e.z}) 规则 ${e.规则} 游戏 ${e.游戏}`).join('；')}`}`);
    }
    if (biomeReport.规则核对.length) l.push('');
  }
  if (blockReport) {
    l.push('## 方块表', '');
    l.push(`状态：手写 ${blockReport.状态数.手写}，导出 ${blockReport.状态数.导出}（导出是全部状态里画得出来的）。方块：手写 ${blockReport.方块数.手写}，导出 ${blockReport.方块数.导出}。贴图：手写 ${blockReport.贴图数.手写}，导出 ${blockReport.贴图数.导出}。`, '');
    l.push(`手写表的键对上导出状态 ${blockReport.对上} 个；对不上的 ${blockReport.手写状态对不上.length} 个；导出里这个方块一个状态都不画的 ${blockReport.导出不画.length} 种；导出里没有的方块 ${blockReport.只在手写的方块.length} 种。`, '');
    if (blockReport.只在手写的方块.length) l.push(`导出里没有的方块：${blockReport.只在手写的方块.join('、')}`, '');
    if (blockReport.导出不画.length) l.push(`导出不画（游戏的方块渲染器不出面）：${blockReport.导出不画.join('、')}`, '');
    if (blockReport.手写状态对不上.length) l.push(`对不上的手写键（前 30）：${blockReport.手写状态对不上.slice(0, 30).join('、')}`, '');
    const m = blockReport.面;
    l.push(`面：一致 ${m.一致}，只差朝向 ${m.只差朝向}，几何不同 ${m.几何不同}，几何微差（0.1 像素以内）${m.几何微差}，几何一样贴图不同 ${m.贴图不同}，只差 uv ${m.只差uv}，其余不同（叠加层、染色、明暗、剔除）${m.其余不同}。`, '');
    for (const [ruleKind, es] of Object.entries(m.例)) {
      l.push(`${ruleKind}的例子：`, '');
      for (const e of es) l.push(`- ${e.手写键} → ${e.导出键}${e.说明 ? `：${e.说明}` : ''}`);
      l.push('');
    }
    l.push('标志位不同（手写→游戏）：', '');
    for (const [flagName, s] of Object.entries(blockReport.标志不同)) l.push(`- ${flagName} ${s.数} 个：${Object.entries(s.组合).map(([k, v]) => `${k} ${v}`).join('，')}；如 ${s.例.slice(0, 5).join('、')}`);
    l.push('');
    l.push(`染色路不同 ${blockReport.染色不同.数} 个：${Object.entries(blockReport.染色不同.组合).map(([k, v]) => `${k} ${v}`).join('，')}`, '');
    for (const e of blockReport.染色不同.例) l.push(`- ${e}`);
    l.push('');
    const d = blockReport.多出的状态;
    l.push(`导出多出的状态（手写表没有对应键的）${d.数} 个，按命名空间：${Object.entries(d.按命名空间).map(([k, v]) => `${k} ${v}`).join('，')}。最多的方块：${d.最多的方块.map(([k, v]) => `${k} ${v}`).join('，')}。`, '');
    l.push(`只在导出的方块 ${blockReport.只在导出的方块.数} 种，按命名空间：${Object.entries(blockReport.只在导出的方块.按命名空间).map(([k, v]) => `${k} ${v}`).join('，')}；如 ${blockReport.只在导出的方块.例.slice(0, 20).join('、')}`, '');
    l.push(`只在手写表的贴图 ${blockReport.贴图数.只在手写.length} 张${blockReport.贴图数.只在手写.length ? `：${blockReport.贴图数.只在手写.slice(0, 40).join('、')}` : ''}；只在导出的贴图 ${blockReport.贴图数.只在导出数} 张。`, '');
  }
  return l.join('\n') + '\n';
};
