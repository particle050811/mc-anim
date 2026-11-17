// anim world bake-dh 的流程：世界声明的 [dh] → 读存档里的 DH 库 → 烘焙（烘焙.ts）→ 发布版本 → 登记。命令.ts 外面套资源闸。
import path from 'node:path';
import { saveDir, type WorldDecl } from '../声明.ts';
import { loadVoxelLib } from '../体素库.ts';
import { release, newStaging, registerTerrain, registerTerrainEntry, readTerrainTable } from '../版本.ts';
import { bakeDh } from './烘焙.ts';
import { openDhDb } from './读库.ts';

export const bakeDhWorld = async (w: WorldDecl, o: { save?: string; noRegister?: boolean; log: (s: string) => void }) => {
  if (!w.dh) throw new Error(`${w.file} 没写 [dh]（从哪个 DH 库烘、包名、范围）`);
  const dbFile = path.join(saveDir(w, o.save), w.dh.db);
  const voxelLib = await loadVoxelLib();
  const t0 = performance.now();
  const db = openDhDb(dbFile);
  o.log(`DH 库 ${dbFile}：行表读完，${((performance.now() - t0) / 1000).toFixed(1)} 秒`);
  const staging = newStaging(w.dh.pack);
  let version: string, dir: string;
  try {
    const visible = { fillBlock: w.visible.fillBlock, faithful: w.visible.faithful.map((x) => x.boxes) };
    const r = await bakeDh({ db, dimension: w.packDimension, origin: w.dh.origin, extent: w.dh.extent, yRange: w.dh.yRange, output: staging.dir, lib: voxelLib, log: o.log, visible });
    o.log(`烘焙完，${((performance.now() - t0) / 1000).toFixed(1)} 秒；${r.blockFileCount} 个块文件，${r.pack.state.length} 种状态、${r.pack.biome.length} 种群系、${r.entryCount} 种条目；缺状态 ${r.missingStates.size} 种、群系 ${r.missingBiomes.size} 种（见 缺失.tsv）`);
    o.log(`各级（0 起）区段数、字节：${r.级.map((s) => `${s.count} 个 ${(s.bytes / 1e6).toFixed(1)} MB`).join('；')}`);
    ({ version, 目录: dir } = release(w.dh.pack, staging.dir));
  } finally {
    staging.放();
    db.close();
  }
  const existing = readTerrainTable().pack[w.dh.pack];
  const entry = await registerTerrainEntry(w.dh.pack, version, { source: w.dh.source ?? `${w.server} ${w.save} 存档的 ${w.dh.db}，anim world bake-dh ${w.displayName} 烘焙`, license: w.dh.license ?? 'LicenseRef-Minecraft-Derived', visibility: w.dh.visibility ?? '发布' });
  const same = existing?.version === version;
  if (!same && !o.noRegister) registerTerrain(w.dh.pack, entry);
  o.log(`地形包 ${w.dh.pack}：版本 ${version}（${dir}）${same ? '，和登记的一样' : o.noRegister ? '，没登记（--no-register）' : `，已登记进 assets/地形版本.json（原来是 ${existing?.version ?? '没有'}），要随代码提交`}`);
  return { pack: w.dh.pack, version, 目录: dir, registered: same || !o.noRegister };
};
