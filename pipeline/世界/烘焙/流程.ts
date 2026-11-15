// anim world bake 的流程：世界声明 → 读存档（列段缓存）→ 套编辑 → 烘焙 → 发布版本 → 登记。命令.ts 外面套资源闸。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dataPath } from '../../环境/配置.ts';
import { codeRoot } from '../../环境/路径.ts';
import { readEdits, type EditSet } from '../编辑/编辑文件.ts';
import { EditApplier } from '../编辑/套用.ts';
import { RegionSource } from '../区域源.ts';
import { worldSeed } from '../存档.ts';
import { regionDir, saveDir, pickPack, editFile, type PackDecl, type WorldDecl } from '../声明.ts';
import { loadVoxelLib } from '../体素库.ts';
import { release, newStaging, registerTerrain, registerTerrainEntry, readTerrainTable, type TerrainRecord } from '../版本.ts';
import { bake } from './烘焙.ts';

export const columnSegmentCacheDir = () => dataPath('cache', '列段');
export const defaultThreads = () => Math.max(1, os.availableParallelism() - 2);

export type BakeOptions = { 包?: string; 存档?: string; skipEdits?: boolean; noRegister?: boolean; threads?: number; log: (s: string) => void };
export type PackResult = { 包: string; 版本: string; 目录: string; priorVersion?: string; entry: TerrainRecord; registered: boolean; editStepCount: number; editWarnings: string[]; missingStateCount: number; missingBiomeCount: number };

/** 包在存档里要读的区域文件 */
export const packRegions = (regionSource: RegionSource, b: PackDecl): [number, number][] => regionSource.regionFiles().filter(([rx, rz]) => !b.区域 || (rx >= b.区域.RX[0] && rx <= b.区域.RX[1] && rz >= b.区域.RZ[0] && rz <= b.区域.RZ[1]));

/** 世界的编辑层（没有编辑文件返回 null）；方块状态按方块表校验 */
export const loadEdits = async (w: WorldDecl): Promise<EditSet | null> => {
  const f = editFile(w.名称);
  if (!fs.existsSync(f)) return null;
  const voxelLib = await loadVoxelLib();
  return readEdits(f, voxelLib.knowledge);
};

export const bakeWorld = async (w: WorldDecl, o: BakeOptions): Promise<PackResult[]> => {
  const worldSaveDir = saveDir(w, o.存档);
  const seed = worldSeed(worldSaveDir);
  if (w.种子 !== undefined && w.种子 !== seed) o.log(`注意：存档 level.dat 的种子是 ${seed}，声明写的是 ${w.种子}`);
  const voxelLib = await loadVoxelLib();
  const edits = o.skipEdits ? null : await loadEdits(w);
  const results: PackResult[] = [];
  for (const b of pickPack(w, o.包)) {
    const editSet = edits && b.applyEdits ? edits : null;
    // 编辑里 clone、摆结构要读别处的方块：读原样的区域（不套编辑），套用时按步骤先后自己算
    const editApplier = editSet ? new EditApplier(editSet, new RegionSource(regionDir(w, o.存档), seed, columnSegmentCacheDir())) : null;
    const regionSource = new RegionSource(regionDir(w, o.存档), seed, columnSegmentCacheDir(), editApplier ? (r) => editApplier.applyEdits(r) : null);
    const regionFiles = packRegions(regionSource, b);
    if (!regionFiles.length) throw new Error(`包 ${b.名}：${regionSource.regionDir} 里没有范围内的区域文件`);
    const regions = await regionSource.preRead(regionFiles, o.threads ?? defaultThreads(), o.log);
    if (!regions.length) throw new Error(`包 ${b.名}：范围内 ${regionFiles.length} 个区域文件里没有生成完的区块`);
    if (editSet) o.log(`套编辑 ${path.relative(codeRoot(), editSet.文件)}：${editSet.步.length} 条命令`);
    const staging = newStaging(b.名);
    let version: string, dir: string;
    let r: Awaited<ReturnType<typeof bake>>;
    try {
      const t0 = performance.now();
      // 可见变换总是做（用户 11-15 定「这个要用」）：保真范围外埋住的格换填充方块，见 烘焙/可见.ts
      const visible = { fillBlock: w.visible.fillBlock, 保真: w.visible.保真.map((x) => x.盒) };
      r = await bake({ regions, getRegion: (rx, rz) => regionSource.区域(rx, rz), 维度: w.packDimension, 原点: b.原点, fullHeight: w.fullHeight, 输出: staging.dir, 库: voxelLib, log: o.log, visible });
      o.log(`烘焙完，${((performance.now() - t0) / 1000).toFixed(1)} 秒；${r.blockFileCount} 个块文件，${r.包.状态.length} 种状态、${r.包.群系.length} 种群系、${r.entryCount} 种条目；缺状态 ${r.missingStates.size} 种、群系 ${r.missingBiomes.size} 种（见 缺失.tsv）`);
      ({ 版本: version, 目录: dir } = release(b.名, staging.dir));
    } finally {
      staging.放();
    }
    const existing = readTerrainTable().包[b.名];
    const source = `${b.来源 ?? `${w.服务端} ${w.存档} 存档，anim world bake ${w.名称} 烘焙`}${editSet ? `，套编辑 ${path.relative(codeRoot(), editSet.文件).split(path.sep).join('/')}（${editSet.步.length} 条命令，sha256 ${editSet.sha256.slice(0, 12)}）` : ''}`;
    const entry = await registerTerrainEntry(b.名, version, { 来源: source, 许可: 'LicenseRef-Minecraft-Derived', 可见性: '发布' });
    const same = existing?.版本 === version;
    const shouldRegister = !same && !o.noRegister && b.登记;
    if (shouldRegister) registerTerrain(b.名, entry);
    o.log(
      `地形包 ${b.名}：版本 ${version}（${dir}）` +
        (same ? '，和 assets/地形版本.json 登记的一样' : shouldRegister ? `，已登记进 assets/地形版本.json（原来是 ${existing?.版本 ?? '没有'}），要随代码提交；用这个包的段都会过期` : `，没登记（${b.登记 ? '--不登记' : '声明里 登记 = false'}；登记的是 ${existing?.版本 ?? '没有'}）`),
    );
    for (const x of editApplier?.警告 ?? []) o.log(`  编辑：${x}`);
    warnFrozenCoarseHeight(b.名, r.包, voxelLib, o.log);
    results.push({ 包: b.名, 版本: version, 目录: dir, priorVersion: existing?.版本, entry, registered: same || shouldRegister, editStepCount: editSet?.步.length ?? 0, editWarnings: [...(editApplier?.警告 ?? [])], missingStateCount: r.missingStates.size, missingBiomeCount: r.missingBiomes.size });
  }
  return results;
};

// 编排用的是冻结的粗高度（engine/voxel/冻结粗高度.ts、assets/冻结粗高度/）：这个包冻结过、粗高度又变了，提醒一下
const warnFrozenCoarseHeight = (pack: string, info: Parameters<Awaited<ReturnType<typeof loadVoxelLib>>['sectionPack']['decodeCoarseHeight']>[0], voxelLib: Awaited<ReturnType<typeof loadVoxelLib>>, log: (s: string) => void) => {
  const f = path.join(codeRoot(), 'assets', '冻结粗高度', `${pack}.json`);
  if (!fs.existsSync(f)) return;
  const frozenFingerprint = JSON.parse(fs.readFileSync(f, 'utf8')).指纹 as string;
  const currentFingerprint = voxelLib.sectionPack.coarseHeightFingerprint(voxelLib.sectionPack.decodeCoarseHeight(info));
  if (frozenFingerprint !== currentFingerprint) log(`  粗高度变了（冻结的 ${frozenFingerprint} → ${currentFingerprint}），编排还按冻结的那份排；要跟上新地形得重新冻结（anim world freeze --写）并核对航线`);
};
