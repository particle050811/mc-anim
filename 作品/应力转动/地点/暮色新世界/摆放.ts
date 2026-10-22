// 地标在新世界里怎么摆：每座的世界变换（`twilightLandmark`）、导入地形要挖的框和整平、按核心藏网格的方块。
import type { V3 } from '@engine/model/parts.tsx';
import type { LandmarkCutout, FlattenArea } from '@engine/voxel/导入地形.ts';
import castleMesh资产 from 'asset:网格/终焉高原城堡/头';
import { POX, POY, POZ, gameToWorld, plateauTopY, landmarkDefs, twilightLandmarkNames, type Rect, type CutoutEntry, type TwilightLandmarkName } from './地标表.ts';
const castleMesh = castleMesh资产 as unknown as { origin: number[] };

// ---------- 摆放 ----------
const rot = (deg: number, point: number[]): V3 => {
  const cosR = Math.round(Math.cos((deg * Math.PI) / 180));
  const sinR = Math.round(Math.sin((deg * Math.PI) / 180));
  return [point[0] * cosR - point[1] * sinR, point[0] * sinR + point[1] * cosR, point[2]];
};
export type LandmarkFrame = {
  原点: V3; // 网格原点的世界坐标（网格组件放在这里、再转 转 度）
  转: number; // 逆时针度数
  到世界: (localPos: number[]) => V3; // 网格本地坐标（场景坐标、原点 = 网格原点）→ 世界
  toLocal: (worldPos: number[]) => V3;
  朝向: (localHeading: number) => number; // 本地的朝向（度，0 = 北、正 = 往左）→ 世界
  地面: number; // 这一带的地面（世界 z）
};
export const frameByName = Object.fromEntries(
  twilightLandmarkNames.map((name) => {
    const def = landmarkDefs[name];
    const worldOrigin = gameToWorld(def.newOrigin);
    const toWorld = (localPos: number[]): V3 => {
      const rotated = rot(def.转, localPos);
      return [worldOrigin[0] + rotated[0], worldOrigin[1] + rotated[1], worldOrigin[2] + rotated[2]];
    };
    // 方块对齐：网格的方块角转过去以后要落在整数上（和导入地形的方块对齐），不然 `newOrigin` 给错了
    const { from, to, origin } = def.说明;
    const corner = toWorld([from[0] - origin[0], origin[2] - (to[2] + 1), from[1] - origin[1]]);
    if (corner.some((v) => Math.abs(v - Math.round(v)) > 1e-6)) throw new Error(`暮色新世界：${name} 的新原点没对齐方块（角落在 ${corner}）`);
    const frame: LandmarkFrame = {
      原点: worldOrigin,
      转: def.转,
      到世界: toWorld,
      toLocal: (p) => rot(-def.转, [p[0] - worldOrigin[0], p[1] - worldOrigin[1], p[2] - worldOrigin[2]]),
      朝向: (y) => y + def.转,
      地面: def.地面 - POY,
    };
    return [name, frame];
  }),
) as Record<TwilightLandmarkName, LandmarkFrame>;
export const twilightLandmark = (name: TwilightLandmarkName) => frameByName[name];

// 挖框（游戏坐标，from、to 都含）：网格范围转好、往上挖到世界顶
// 网格本地的矩形 [x0, y0, x1, y1] → 新世界的方块列 [x0, z0, x1, z1]（游戏坐标，都含）
const columnRange = (name: TwilightLandmarkName, rect: number[]) => {
  const frame = frameByName[name];
  const cornerA = frame.到世界([rect[0], rect[1], 0]);
  const cornerB = frame.到世界([rect[2], rect[3], 0]);
  const [x0, x1] = [Math.min(cornerA[0], cornerB[0]), Math.max(cornerA[0], cornerB[0])];
  const [y0, y1] = [Math.min(cornerA[1], cornerB[1]), Math.max(cornerA[1], cornerB[1])];
  // 世界格 [x0, x1) × [y0, y1) → 游戏方块 x0 + ox … x1 − 1 + ox，z = oz − y1 … oz − 1 − y0
  return [x0 + POX, POZ - y1, x1 - 1 + POX, POZ - 1 - y0];
};
// 网格的整个导出范围（网格本地）、网格最低那层在新世界的游戏 y
const meshRect = (name: TwilightLandmarkName): Rect => {
  const { from, to, origin } = landmarkDefs[name].说明;
  return [from[0] - origin[0], origin[2] - (to[2] + 1), to[0] + 1 - origin[0], origin[2] - from[2]];
};
const meshBottomY = (name: TwilightLandmarkName) => {
  const def = landmarkDefs[name];
  return def.说明.from[1] + Math.round(def.newOrigin[1] - def.说明.origin[1]);
};
function meshCutout(name: TwilightLandmarkName, core?: number[]): LandmarkCutout {
  const [x0, z0, x1, z1] = columnRange(name, core ?? meshRect(name));
  return { from: [x0, landmarkDefs[name].cutFloorY ?? meshBottomY(name), z0], to: [x1, 400, z1] };
}
// 按格并盒：二维的格子 (a, b)（a 是行里的列、b 是行）各有一组区间（第三个方向，[起, 止)，null = 没有），
// 一行里区间一样的相邻格连成一段，上下行一样的段并成一个盒子；返回 [a0, b0, a1, b1, 区间们]（a、b 都是 [起, 止)）
const mergeBoxes = (A0: number, A1: number, B0: number, B1: number, intervalsAt: (col: number, row: number) => number[][] | null) => {
  const boxes: [number, number, number, number, number[][]][] = [];
  const openBoxes = new Map<string, (typeof boxes)[number]>(); // 段键 → 上一行接着的盒
  for (let row = B0; row < B1; row++) {
    const rowBoxes = new Map<string, (typeof boxes)[number]>();
    let col = A0;
    while (col < A1) {
      const intervals = intervalsAt(col, row);
      if (!intervals || !intervals.length) { col++; continue; }
      const intervalsKey = JSON.stringify(intervals);
      let end = col + 1;
      while (end < A1) {
        const nextIntervals = intervalsAt(end, row);
        if (!nextIntervals || JSON.stringify(nextIntervals) !== intervalsKey) break;
        end++;
      }
      const runKey = `${col},${end},${intervalsKey}`;
      const above = openBoxes.get(runKey);
      if (above) { above[3] = row + 1; rowBoxes.set(runKey, above); }
      else { const newBox: (typeof boxes)[number] = [col, row, end, row + 1, intervals]; boxes.push(newBox); rowBoxes.set(runKey, newBox); }
      col = end;
    }
    openBoxes.clear();
    for (const [k, box] of rowBoxes) openBoxes.set(k, box);
  }
  return boxes;
};
// 整数点们从区间 [起, 止) 里扣掉（每个点占 [p, p + 1)）
const subtractPoints = (start: number, end: number, points: number[] | undefined): number[][] => {
  if (!points?.length) return [[start, end]];
  const out: number[][] = [];
  let cursor = start;
  for (const point of [...new Set(points)].sort((x, y) => x - y)) {
    if (point + 1 <= cursor || point >= end) continue;
    if (point > cursor) out.push([cursor, point]);
    cursor = point + 1;
  }
  if (cursor < end) out.push([cursor, end]);
  return out;
};
const pointsToRuns = (points: number[]) => {
  const sorted = [...new Set(points)].sort((x, y) => x - y);
  const out: number[][] = [];
  for (const value of sorted) {
    const last = out[out.length - 1];
    if (last && last[1] === value) last[1] = value + 1;
    else out.push([value, value + 1]);
  }
  return out;
};
const groupByColumn = (cells: number[][], i: number, j: number, k: number) => {
  const byColumn = new Map<string, number[]>();
  for (const cell of cells) {
    const key = `${cell[i]},${cell[k]}`;
    (byColumn.get(key) ?? byColumn.set(key, []).get(key)!).push(cell[j]);
  }
  return byColumn;
};
// 核心的主挖框：没有归边的一块核心一个盒子；有归边的按列并盒，每列 [挖底, 400] 里扣掉 挖免 的格
function coreCutouts(name: TwilightLandmarkName): LandmarkCutout[] {
  const def = landmarkDefs[name];
  if (!def.归边) return def.核心!.map((c) => meshCutout(name, c));
  const bottomY = def.cutFloorY ?? meshBottomY(name);
  const coreRanges = def.核心!.map((c) => columnRange(name, c));
  const inCore = (x: number, z: number) => coreRanges.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
  const exempt = groupByColumn(def.归边.挖免, 0, 1, 2);
  const [X0, Z0, X1, Z1] = [Math.min(...coreRanges.map((r) => r[0])), Math.min(...coreRanges.map((r) => r[1])), Math.max(...coreRanges.map((r) => r[2])), Math.max(...coreRanges.map((r) => r[3]))];
  return mergeBoxes(X0, X1 + 1, Z0, Z1 + 1, (x, z) => (inCore(x, z) ? subtractPoints(bottomY, 401, exempt.get(`${x},${z}`)) : null)).flatMap(([x0, z0, x1, z1, intervals]) =>
    intervals.map(([lo, hi]) => ({ from: [x0, lo, z0], to: [x1 - 1, hi - 1, z1 - 1] })),
  );
}
// 归边要另挖的格（游戏坐标）：按列连段，再按同一行相邻、段一样的并盒
function edgeFixExtraCutouts(name: TwilightLandmarkName): LandmarkCutout[] {
  const edgeFix = landmarkDefs[name].归边;
  if (!edgeFix?.挖加.length) return [];
  const byColumn = groupByColumn(edgeFix.挖加, 0, 1, 2);
  const xs = edgeFix.挖加.map((c) => c[0]), zs = edgeFix.挖加.map((c) => c[2]);
  return mergeBoxes(Math.min(...xs), Math.max(...xs) + 1, Math.min(...zs), Math.max(...zs) + 1, (x, z) => {
    const column = byColumn.get(`${x},${z}`);
    return column ? pointsToRuns(column) : null;
  }).flatMap(([x0, z0, x1, z1, intervals]) => intervals.map(([lo, hi]) => ({ from: [x0, lo, z0], to: [x1 - 1, hi - 1, z1 - 1] })));
}
// 主挖框（网格范围、核心、另给的 挖）和补挖分开记：地标范围 不给的时候按主挖框，巡检工具也要分
const mainCutoutsByName = Object.fromEntries(
  twilightLandmarkNames.map((name) => {
    const def = landmarkDefs[name];
    if (def.网格 === false && !def.cutouts) return [name, []];
    return [name, [...(def.cutouts ?? (def.核心 ? coreCutouts(name) : [meshCutout(name)])), ...edgeFixExtraCutouts(name)]];
  }),
) as Record<TwilightLandmarkName, CutoutEntry[]>;
const cutoutsByName = Object.fromEntries(twilightLandmarkNames.map((name) => [name, [...mainCutoutsByName[name], ...(landmarkDefs[name].补挖 ?? [])]])) as Record<TwilightLandmarkName, CutoutEntry[]>;
// 一座地标的挖框（游戏坐标）：工具/一镜到底/离树3D.py 拼「新世界 + 摆好的网格」时照它挖（经 诊断.ts --几何输出 导出）
export const twilightCutouts = (name: TwilightLandmarkName) => cutoutsByName[name];
// 删掉的巨魔云（游戏坐标，云和云上巨人的房子、树整团挖掉）：新世界生成的巨魔云带着巨人房子，一镜到底里远远看得见的这四团和 6-1-8b 的云中小屋像同一样东西重复出现（用户 10-06 定的接缝修法）。
// 四团按一镜到底每帧镜头量过进画面的：巫妖怪塔西北、终焉高原西北、北边、东边各一团；其余三团（娜迦庭院、巫妖怪塔以西）看不到，不动。
// 只挖 y 150 以上（云团在 y 160～195）；不算地标范围：粗高度图还当云在，航线、镜头不变（离航线都在 900 米以外）
export const twilightRemovedClouds: LandmarkCutout[] = [
  { from: [-10286, 150, 1882], to: [-10183, 400, 1981] },
  { from: [-4074, 150, 1882], to: [-3979, 400, 1981] },
  { from: [-3042, 150, 1110], to: [-2947, 400, 1209] },
  { from: [-2030, 150, 1806], to: [-1931, 400, 1917] },
];
// 给 use导入地形 的挖框、平整：各帧同一个数组
export const allCutouts: LandmarkCutout[] = [...twilightLandmarkNames.flatMap((name) => cutoutsByName[name]), ...twilightRemovedClouds];
export const allFlattens: FlattenArea[] = twilightLandmarkNames.flatMap((name) => landmarkDefs[name].flattens ?? []);
// 新世界里地标附近（世界坐标 [x0, y0, x1, y1]）：查高度时这里不用粗高度图（那是新世界自己的结构），用地标的地面；
// 剩顶（世界 z）：只挖了一截的补挖（巨树），框底下的林冠还在，查高度按 min(粗高度, 剩顶)（粗高度图是挖之前烘的，还当那棵树在）
const rangeBoxesByName = Object.fromEntries(
  twilightLandmarkNames.map((name) => {
    const def = landmarkDefs[name];
    const mainBoxes: CutoutEntry[] = (def.范围 ?? (def.网格 === false ? [meshRect(name)] : null))?.map((rect) => {
      const [x0, z0, x1, z1] = columnRange(name, rect);
      return { from: [x0, 0, z0], to: [x1, 0, z1] };
    }) ?? mainCutoutsByName[name];
    return [name, [...mainBoxes, ...(def.补挖 ?? [])]];
  }),
) as Record<TwilightLandmarkName, CutoutEntry[]>;
export const landmarkRanges = twilightLandmarkNames.flatMap((name) =>
  rangeBoxesByName[name].map((m) => ({ name: name, box: [m.from[0] - POX, POZ - 1 - m.to[2], m.to[0] + 1 - POX, POZ - m.from[2]], remainTop: m.剩顶 === undefined ? null : m.剩顶 - POY })),
);
// 画不画迁移的网格（九头蛇巢穴用新世界自己的那座：6-1-6/戏.tsx、地标巡检、离树都照它）
export const twilightDrawsMesh = (name: TwilightLandmarkName) => landmarkDefs[name].网格 !== false;
// 核心、转（工具/地标巡检/归边.ts 用）
export const twilightCore = (name: TwilightLandmarkName) => landmarkDefs[name].核心 ?? [];
export const twilightRotation = (name: TwilightLandmarkName) => landmarkDefs[name].转;
// 巡检工具（工具/地标巡检/共用.ts）分开看的几样：主挖框（网格范围、核心、另给的挖，连归边另挖的格）、补挖、地标范围（只看水平，游戏方块列都含）、平整
export const twilightPlacement = (name: TwilightLandmarkName) => ({ mainCutouts: mainCutoutsByName[name], extraCutouts: landmarkDefs[name].补挖 ?? [], rangeBoxes: rangeBoxesByName[name], flattens: landmarkDefs[name].flattens ?? [] });
// 有 核心 的地标：核心外面的网格不画（BlockMesh 的 hideBlocks：按方块藏，网格本地坐标，按 1 米一格扫出核心外面的格子、一行行并成盒子）；
// 没有核心的是空数组。各帧同一个数组。有归边的：核心外留下树干在核心里的旧树（藏免），核心里另藏树干在外面的新树伸进来的树冠（藏加）
export const landmarkHideOutsideCore = Object.fromEntries(
  twilightLandmarkNames.map((name) => {
    const def = landmarkDefs[name];
    if (!def.核心) return [name, []];
    const [X0, Y0, X1, Y1] = meshRect(name);
    const inCore = (x: number, y: number) => def.核心!.some(([cx0, cy0, cx1, cy1]) => x > cx0 && x < cx1 && y > cy0 && y < cy1);
    const exempt = def.归边 && groupByColumn(def.归边.藏免, 0, 2, 1);
    const extraHide = def.归边 && groupByColumn(def.归边.藏加, 0, 2, 1);
    const boxes = mergeBoxes(X0, X1, Y0, Y1, (x, y) => {
      if (!inCore(x + 0.5, y + 0.5)) return subtractPoints(-1e4, 1e4, exempt?.get(`${x},${y}`));
      const column = extraHide?.get(`${x},${y}`);
      return column ? pointsToRuns(column) : null;
    });
    return [name, boxes.flatMap(([x0, y0, x1, y1, intervals]) => intervals.map(([lo, hi]) => [x0, y0, lo, x1, y1, hi]))];
  }),
) as Record<TwilightLandmarkName, number[][]>;
// 终焉城堡的旧网格：台地面以下的面不画（新地形台地面留着），西边旧世界的巨魔云（网格本地 x 75～175、y −34～58）也不画。
// 云最西边占本地 x 75～78，藏的范围从 74 起（从 78 起的话面心在 75～77 的 5 个面藏不掉，6-1-9 开头森林上空会浮白点）；本地 x 40～200、游戏 y 96 以上核过只有这 5 个面，不会多藏城堡
const castleOriginY = castleMesh.origin[1];
export const castleMeshHide: number[][] = [
  [-2000, -2000, -100, 2000, 2000, plateauTopY - castleOriginY + 0.01],
  [74, -35, plateauTopY - castleOriginY, 176, 59, 300],
];
