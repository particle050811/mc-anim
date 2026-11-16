// anim extract --backfill-mesh [--write]：资产锁里有、却没有哪条配方产出的场景网格（网格/<名>/头），按网格头里的 dim、from、to、origin、markers
// 反填一条 mcai 配方，标「不重导」：只记下是从哪个维度、哪块范围导的，下回要重导、或照着导一块相邻的，有据可查。
// 锁里那一版是旧项目当时导的，存档、mcai 都变过，按这条重导字节对不上（docs/迁移.md「旧网格不重导」），所以这类配方 anim extract 不跑。
// 头里有「取材」（新 mcai 导的，记了原样参数）就照抄参数，不再按 from/to 反推。
import fs from 'node:fs';
import { bytesPath, type AssetLock } from '../资产/资产锁.ts';
import type { AssetEntry } from '../资产/资产表.ts';
import { expandArtifacts, type SourcingManifest, type Step } from './清单.ts';

type Vec3 = [number, number, number];
export type MeshHeader = { dim: string; from: Vec3; to: Vec3; origin: Vec3; markers?: Record<string, unknown>; 取材?: { 参数?: Record<string, unknown> } };

export const noReExtractReason =
  '步骤按网格头（dim、from、to、origin、markers）反填，只记范围；锁里是旧项目导的那一版，当时的存档、mcai 都变了，重导字节对不上（docs/迁移.md 旧网格不重导）';

/** 一块网格：基 id（网格/<名>）、头、产物（id → 暂存目录里的文件）、属于哪一侧的锁 */
export type PendingMesh = { meshName: string; 头: MeshHeader; artifacts: Record<string, string>; work?: string };

const headIdPattern = /^(网格\/.+)\/头$/;

/** 配方里已经产出的 id（通配按锁展开） */
export const recipeOutputIds = (q: SourcingManifest, assetLock: AssetLock) => new Set([...q.entryMap.values()].flatMap((e) => expandArtifacts(e.artifacts, assetLock).对.map(([id]) => id)));

/** mcai mesh 的 out（不带扩展名）：照资产表 旧路径（参考模型库/<out>.json）；没有就 src/模型/场景/<名，/ 换 ->.网格 */
export const meshOutput = (meshName: string, oldPath?: string) => {
  const m = oldPath && /^参考模型库\/(.+)\.json$/.exec(oldPath);
  return m ? m[1]! : `src/模型/场景/${meshName.slice('网格/'.length).replaceAll('/', '-')}.网格`;
};

/**
 * 锁里有头、没有配方产出的网格。锁们：[锁, 作品名?]，共用锁不写作品名；读头要字节在库里（不在的跳过并报出来）。
 * 表：资产表条目（取 旧路径 定 out）。
 */
export const missingMeshRecipes = (
  q: SourcingManifest,
  locks: [AssetLock, string | undefined][],
  oldPathMap: Map<string, Pick<AssetEntry, 'oldPath'>>,
  readHead = (e: AssetLock[string]) => JSON.parse(fs.readFileSync(bytesPath(e), 'utf8')) as MeshHeader,
): { grid: PendingMesh[]; unreadable: string[] } => {
  const allLocks = Object.assign({}, ...locks.map(([l]) => l)) as AssetLock;
  const alreadyHave = recipeOutputIds(q, allLocks);
  const meshes: PendingMesh[] = [];
  const unreadable: string[] = [];
  for (const [assetLock, work] of locks) {
    for (const id of Object.keys(assetLock).sort()) {
      const m = headIdPattern.exec(id);
      if (!m || alreadyHave.has(id)) continue;
      const meshName = m[1]!;
      let meshHeader: MeshHeader;
      try {
        meshHeader = readHead(assetLock[id]!);
      } catch {
        unreadable.push(id);
        continue;
      }
      const out = meshOutput(meshName, oldPathMap.get(id)?.oldPath);
      const artifacts: Record<string, string> = {};
      for (const [part, suffix] of [['图集', '.png'], ['头', '.json'], ['顶点', '.bin']] as const) if (assetLock[`${meshName}/${part}`]) artifacts[`${meshName}/${part}`] = out + suffix;
      meshes.push({ meshName, 头: meshHeader, artifacts: artifacts, ...(work ? { work: work } : {}) });
    }
  }
  return { grid: meshes, unreadable };
};

const coordText = (v: readonly number[]) => v.join(',');

/** 一块网格的两步：镜头挪到范围正上方、切到那个维度，再 mesh */
export const meshSteps = (g: PendingMesh): Step[] => {
  const { dim, from, to, origin } = g.头;
  const out = g.artifacts[`${g.meshName}/头`]!.replace(/\.json$/, '');
  const center = [(Math.min(from[0], to[0]) + Math.max(from[0], to[0]) + 1) / 2, Math.min(Math.max(from[1], to[1]) + 30, 300), (Math.min(from[2], to[2]) + Math.max(from[2], to[2]) + 1) / 2];
  const rawParams = g.头.取材?.参数;
  const params = rawParams
    ? Object.entries(rawParams).map(([k, v]) => `${k}=${String(v)}`)
    : [`from=${coordText(from)}`, `to=${coordText(to)}`, `origin=${coordText(origin)}`, ...(Object.keys(g.头.markers ?? {}).length ? [`mark=${Object.keys(g.头.markers!).sort().join(',')}`] : [])];
  return [
    ['mcai', 'cam', `pos=${coordText(center)}`, 'pitch=90', 'yaw=180', `dim=${dim}`],
    ['mcai', 'mesh', ...params, `out=${out}`],
  ];
};

/** 按 网格/<第一段> 分组：古城4x/东1、古城4x/北2… 合成一条「古城4x网格」；名字撞了已有条目加「（反填）」；作品锁里的另起一条 */
export const groupMeshes = (meshes: readonly PendingMesh[], existingNames: ReadonlySet<string>): Map<string, PendingMesh[]> => {
  const groups = new Map<string, PendingMesh[]>();
  for (const g of meshes) {
    let groupName = `${g.meshName.split('/')[1]}网格`;
    if (existingNames.has(groupName)) groupName += '（反填）';
    if (g.work && groups.get(groupName)?.some((x) => x.work !== g.work)) groupName += `（${g.work}）`;
    groups.set(groupName, [...(groups.get(groupName) ?? []), g]);
  }
  return groups;
};

const quote = (s: string) => JSON.stringify(s);

/** 一条配方的 TOML 文本（和 extract.toml 里手写的同一种写法） */
export const meshRecipeText = (groupName: string, meshes: readonly PendingMesh[]) => {
  const work = meshes[0]?.work;
  const lines = [
    '[["取材"]]',
    `"名称" = ${quote(groupName)}`,
    '"需要" = []',
    '"要开游戏" = true',
    ...(work ? [`"作品" = ${quote(work)}`] : []),
    `"不重导" = ${quote(noReExtractReason)}`,
    '"公开版" = "不提取"  # 网格走 Release、图集走「网格图集」',
    '"步骤" = [',
    ...meshes.flatMap((g) => meshSteps(g).map((s) => `  [${s.map((a) => quote(a as string)).join(', ')}],`)),
    ']',
    '["取材"."产物"]',
    ...meshes.flatMap((g) => Object.entries(g.artifacts).map(([k, v]) => `${quote(k)} = ${quote(v)}`)),
  ];
  return lines.join('\n') + '\n';
};

/** 整段追加文本：一个小标题加各条配方 */
export const fillMeshRecipeText = (groups: Map<string, PendingMesh[]>) =>
  `\n# 地标网格（anim extract --backfill-mesh 按网格头反填，不重导：只记范围，不跑）\n` + [...groups].map(([groupName, gs]) => `\n${meshRecipeText(groupName, gs)}`).join('');
