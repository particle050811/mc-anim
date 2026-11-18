// anim world transcode：把现有地形包转成现行格式。只写新版本目录（版本是内容指纹），旧目录一个字节不动；转完核对过才登记。
// - 格式 4 → 5（换容器）：区段的编码字节、模型.bin 原样搬，只换块头、把粗图从 包.json 挪进 粗图.bin.gz（rewrapDir），逐个区段比字节（compareRewrap）。
//   还没做可见变换的，换完容器再 transcode 一次做变换。
// - 格式 1、2、3，或还没做可见变换的现行格式：重编码、过可见变换（可见.ts），逐格比过（做了变换的另核格和网格，可见核对.ts）。
//   现行格式的包转出来和拿同一个存档重新 anim world bake 字节相同（区段先后、包.json 的写法都一样）；
//   格式 1～3 的旧包（32×32 区段）由 区段源.ts 拼成 64×64，k底 以下多一截填充方块，和直接烘不逐字节一样，但格子在旧区段存到的范围里逐格相同。
import fs from 'node:fs';
import { modelBytes, modelFileName } from '../../../engine/voxel/区段模型.ts';
import { trainPackModel } from './模型.ts';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { loadVoxelLib } from '../体素库.ts';
import { release, newStaging, versionDir, registerTerrain, registerTerrainEntry, readTerrainTable } from '../版本.ts';
import { packWorld } from '../声明.ts';
import { VisibleEnv, toRecord, recordCovers, type VisibleRecord, type VisibleSettings } from './可见.ts';
import { blockCoordsFromName, blockFiles, blockFormat, decodeTileFile } from './读区段.ts';
import { openSectionSource } from './区段源.ts';
import { legacyEntries, readLegacyIndex } from './旧块头.ts';
import { packMapsEqual, readPackDoc, writePackDoc, type PackDoc } from './包信息.ts';
import type { TranscodeJob, TranscodeResult } from './转码工人.ts';

const runWorkers = async (jobs: TranscodeJob[], threads: number, onProgress: (done: number, total: number) => void) => {
  const remaining = [...jobs], results: TranscodeResult[] = [], workers: Worker[] = [];
  try {
    await Promise.all(
      Array.from({ length: Math.min(threads, jobs.length) }, () =>
        new Promise<void>((resolve, reject) => {
          const w = new Worker(new URL('./转码工人.ts', import.meta.url));
          workers.push(w);
          w.on('error', reject);
          w.on('message', (m: { done?: true; 错?: string; result?: TranscodeResult }) => {
            if (m.错) return reject(new Error(m.错));
            if (m.result) {
              results.push(m.result);
              onProgress(results.length, jobs.length);
            }
            const task = remaining.shift();
            if (task) w.postMessage(task);
            else resolve();
          });
        }),
      ),
    );
  } finally {
    await Promise.all(workers.map((w) => w.terminate())); // 一个出错，别的也停：它们还在往暂存目录写
  }
  return results;
};

// 工人模块不能在主线程 import（它一载入就接 parentPort），所以不拿它的 空果，按第一个结果的键清零
const sumResults = (results: TranscodeResult[]) => {
  const sum = Object.fromEntries(Object.keys(results[0] ?? {}).map((k) => [k, 0])) as unknown as TranscodeResult;
  for (const b of results) for (const k of Object.keys(sum) as (keyof TranscodeResult)[]) if (k !== 'name') sum[k] += b[k];
  sum.name = '合计';
  return sum;
};

/** 包.json 的 可见：做过可见变换的包记着按什么做的（可见.ts 的 可见记录）；没有 = 原样。各格式都在 包.json 里 */
export const readVisibleRecord = (dir: string) => (JSON.parse(fs.readFileSync(path.join(dir, '包.json'), 'utf8')) as { visible?: VisibleRecord }).visible ?? null;

/** 拼旧区段时 k底 以下补的方块：跟可见变换的填充（世界声明），没有声明用石头 */
const legacyFill = (visible: VisibleSettings | null) => visible?.fillBlock ?? 'minecraft:stone';

/** 旧目录（格式 1～5）→ 新目录（现行格式）：块文件、包.json、粗图、缺失.tsv，区段重编码。给了 可见 就过可见变换，训练也拿变换后的格子学，包.json 记下 可见 */
export const transcodeDir = async (oldDir: string, newDir: string, threads: number, onProgress: (done: number, total: number) => void = () => {}, visible: VisibleSettings | null = null) => {
  const voxelLib = await loadVoxelLib();
  const t0 = performance.now();
  const source = openSectionSource(voxelLib, oldDir, legacyFill(visible));
  let trainingFull: ReturnType<typeof trainPackModel>, tileNames: string[];
  const doc = source.info, coarsestLevel = source.coarsestLevel;
  try {
    const env = visible ? new VisibleEnv(voxelLib, source, visible) : null;
    trainingFull = trainPackModel(source, env ? (d) => env.transform(d).d : undefined);
    tileNames = source.tiles();
  } finally {
    source.close();
  }
  const { model: sectionModel, ...training } = trainingFull;
  const modelTable = modelBytes(sectionModel);
  fs.writeFileSync(path.join(newDir, modelFileName), modelTable);
  const trainSec = (performance.now() - t0) / 1000, t1 = performance.now();
  const result = sumResults(await runWorkers(tileNames.map((fileName) => ({ action: '转' as const, oldDir, 新: newDir, name: fileName, visible, fill: legacyFill(visible) })), threads, onProgress));
  writePackDoc(voxelLib, newDir, { ...doc, coarsestLevel, extra: { ...doc.extra, ...(visible ? { visible: toRecord(visible) } : {}) } });
  fs.copyFileSync(path.join(oldDir, '缺失.tsv'), path.join(newDir, '缺失.tsv'));
  return { ...training, 训练秒: trainSec, transcodeSec: (performance.now() - t1) / 1000, modelBytesCount: modelTable.length, modelClassCount: sectionModel.classes, transformCounts: result };
};

/** 两边的包信息除格式（和 可见）外一样：元数据、最粗级、粗图逐格 */
const samePackDoc = (a: PackDoc, b: PackDoc, ignore: string[]) => {
  const meta = (d: PackDoc) => JSON.stringify({ ...d, format: 0, maps: null, extra: Object.fromEntries(Object.entries(d.extra).filter(([k]) => !ignore.includes(k))) });
  return meta(a) === meta(b) && packMapsEqual(a.maps, b.maps);
};

/** 从磁盘上两边各解一遍逐格比，不一样抛错；包信息除版本（和 可见）外也要一样。旧包可以是任何格式（旧格式拼成现行再比），新包是现行格式。
 *  给了 可见：新包要记着这份 可见，旧包的格子重做一遍变换再比，改了的区段另核格和网格 */
export const compareDirPerCell = async (oldDir: string, newDir: string, threads: number, onProgress: (done: number, total: number) => void = () => {}, visible: VisibleSettings | null = null) => {
  if (!fs.readFileSync(path.join(oldDir, '缺失.tsv')).equals(fs.readFileSync(path.join(newDir, '缺失.tsv')))) throw new Error('缺失.tsv 不一样');
  const voxelLib = await loadVoxelLib(), source = openSectionSource(voxelLib, oldDir, legacyFill(visible));
  const blockFileNames = source.tiles();
  source.close();
  if (JSON.stringify(blockFiles(newDir)) !== JSON.stringify(blockFileNames)) throw new Error('两边的块文件不一样');
  if (!samePackDoc(readPackDoc(voxelLib, oldDir), readPackDoc(voxelLib, newDir), ['visible'])) throw new Error('包信息除版本、可见外不一样');
  if (visible && JSON.stringify(readVisibleRecord(newDir)) !== JSON.stringify(toRecord(visible))) throw new Error('新包 包.json 的 可见 和这次的设置不一样');
  return sumResults(await runWorkers(blockFileNames.map((fileName) => ({ action: '比' as const, oldDir, 新: newDir, name: fileName, visible, fill: legacyFill(visible) })), threads, onProgress));
};

/** 格式 4 → 5 换容器：区段的编码字节原样搬进新块头，模型.bin、缺失.tsv 照拷，包.json 换写法、粗图挪进 粗图.bin.gz */
export const rewrapDir = async (oldDir: string, newDir: string) => {
  const voxelLib = await loadVoxelLib(), P = voxelLib.sectionPack, doc = readPackDoc(voxelLib, oldDir);
  if (doc.format !== 4) throw new Error(`${oldDir} 是格式 ${doc.format}，只有格式 4 换容器`);
  let sectionCount = 0, sectionBytes = 0;
  for (const fileName of blockFiles(oldDir)) {
    const buf = fs.readFileSync(path.join(oldDir, fileName));
    if (blockFormat(buf) !== 4) throw new Error(`${oldDir}/${fileName} 不是格式 4`);
    const [ti, tj] = blockCoordsFromName(fileName);
    const sections = [...legacyEntries(ti, tj, readLegacyIndex(buf))].map(({ id, off, len }) => ({ id, bytes: buf.subarray(off, off + len) }));
    const fd = fs.openSync(path.join(newDir, fileName), 'w');
    try {
      for (const b of P.encodeTile(ti, tj, doc.coarsestLevel, sections)) fs.writeSync(fd, b);
    } finally {
      fs.closeSync(fd);
    }
    sectionCount += sections.length;
    for (const s of sections) sectionBytes += s.bytes.length;
  }
  for (const f of [modelFileName, '缺失.tsv']) fs.copyFileSync(path.join(oldDir, f), path.join(newDir, f));
  writePackDoc(voxelLib, newDir, doc);
  return { sectionCount, sectionBytes };
};

/** 换容器的核对：块文件一一对应，每个区段的字节一样、不多不少；模型.bin、缺失.tsv 逐字节一样；包信息除格式外一样（粗图逐格） */
export const compareRewrap = async (oldDir: string, newDir: string) => {
  const voxelLib = await loadVoxelLib(), P = voxelLib.sectionPack;
  for (const f of [modelFileName, '缺失.tsv']) if (!fs.readFileSync(path.join(oldDir, f)).equals(fs.readFileSync(path.join(newDir, f)))) throw new Error(`${f} 不一样`);
  const oldDoc = readPackDoc(voxelLib, oldDir), newDoc = readPackDoc(voxelLib, newDir);
  if (newDoc.format !== P.formatVersion) throw new Error(`新包是格式 ${newDoc.format}`);
  if (!samePackDoc(oldDoc, newDoc, [])) throw new Error('包信息除格式外不一样');
  const names = blockFiles(oldDir);
  if (JSON.stringify(blockFiles(newDir)) !== JSON.stringify(names)) throw new Error('两边的块文件不一样');
  let sections = 0, bytes = 0;
  for (const fileName of names) {
    const a = fs.readFileSync(path.join(oldDir, fileName)), b = fs.readFileSync(path.join(newDir, fileName));
    const [ti, tj] = blockCoordsFromName(fileName);
    const index = decodeTileFile(voxelLib, path.join(newDir, fileName), b);
    if (index.coarsestLevel !== newDoc.coarsestLevel) throw new Error(`${fileName} 的块头最粗级 ${index.coarsestLevel}，包.json 是 ${newDoc.coarsestLevel}`);
    const { sectionKey } = voxelLib.sections, fresh = new Map([...P.tileSections(index)].map((s) => [sectionKey(s.id), s]));
    let dataEnd = index.headerLen;
    for (const s of fresh.values()) dataEnd = Math.max(dataEnd, s.off + s.len);
    if (dataEnd !== b.length) throw new Error(`${fileName}：新块文件 ${b.length} 字节，区段数据到 ${dataEnd}`);
    for (const { id, off, len } of legacyEntries(ti, tj, readLegacyIndex(a))) {
      const k = sectionKey(id), x = fresh.get(k);
      if (!x) throw new Error(`${fileName} 区段 ${k}：新包里没有`);
      fresh.delete(k);
      if (!a.subarray(off, off + len).equals(b.subarray(x.off, x.off + x.len))) throw new Error(`${fileName} 区段 ${k}：字节不一样`);
      sections++;
      bytes += len;
    }
    if (fresh.size) throw new Error(`${fileName}：新包多出 ${fresh.size} 个区段`);
  }
  return { sections, bytes };
};

/** outRoot：版本目录放 <outRoot>/<包>/<版本>，不放数据根 terrain/、不登记（试做的包用） */
export type TranscodeOptions = { 从?: string; noRegister?: boolean; outRoot?: string; threads: number; log: (s: string) => void };

export const transcodePack = async (pack: string, o: TranscodeOptions) => {
  const terrainTable = readTerrainTable().pack;
  const oldVersion = o.从 ?? terrainTable[pack]?.version;
  if (!oldVersion) throw new Error(`地形包 ${pack} 没登记，用 --from <版本> 指定转哪一版`);
  const oldDir = versionDir(pack, oldVersion);
  if (!fs.existsSync(oldDir)) throw new Error(`没有 ${oldDir}`);
  const voxelLib = await loadVoxelLib(), libFormat = voxelLib.sectionPack.formatVersion;
  if (!blockFiles(oldDir).length) throw new Error(`${oldDir} 里没有块文件，不是区段格式的包（主世界-116-远景 是整文件的高度、群系网格，不用转）`);
  const probe = openSectionSource(voxelLib, oldDir), formatVersion = probe.format, blockFileNames = probe.tiles();
  probe.close();
  if (formatVersion === 4 && libFormat === 5) return rewrapPack(pack, oldVersion, oldDir, blockFileNames.length, terrainTable[pack], o);
  // 可见变换的设置跟着烘这个包的世界声明走；没有声明的包（旧项目烘的试验包）只换格式
  const world = packWorld(pack);
  const visible: VisibleSettings | null = world ? { fillBlock: world.visible.fillBlock, faithful: world.visible.faithful.map((b) => b.boxes) } : null;
  const priorRecord = readVisibleRecord(oldDir);
  if (priorRecord && visible && !recordCovers(priorRecord, toRecord(visible))) throw new Error(`${pack}/${oldVersion} 做过可见变换，世界声明 ${world!.displayName} 现在的保真范围或填充它没有：保真范围里埋着的格已经换掉了，要 anim world bake 从存档重烘`);
  if (formatVersion === libFormat && (priorRecord || !visible)) throw new Error(`${pack}/${oldVersion} 已经是格式 ${formatVersion}${priorRecord ? '、做过可见变换' : `，也没有世界声明（${pack} 不在 sourcing/worlds/ 的哪个 [[烘焙.包]] 里），不做可见变换`}，不用转`);
  if (visible) o.log(`${pack}：可见变换按 ${world!.displayName} 的声明，填充 ${visible.fillBlock}，保真范围 ${visible.faithful.length} 个盒`);
  else o.log(`${pack}：没有世界声明，只换格式，不做可见变换`);

  const staging = newStaging(pack);
  const progressFor = (label: string) => (done: number, total: number) => {
    if (done === total || done % 10 === 0) o.log(`  ${label} ${done}/${total} 个块文件`);
  };
  let version: string, dir: string, existed: boolean;
  let training: Awaited<ReturnType<typeof transcodeDir>>;
  try {
    const t0 = performance.now();
    training = await transcodeDir(oldDir, staging.dir, o.threads, progressFor('转'), visible);
    o.log(`  训练 ${training.样本数}/${training.sections} 区段 ${training.训练秒.toFixed(3)} 秒，模型 ${training.modelBytesCount} 字节（${training.modelClassCount} 类）；转码 ${training.transcodeSec.toFixed(3)} 秒`);
    if (visible) { const v = training.transformCounts; o.log(`  可见变换：改了 ${v.changedSectionCount} 个区段（保真范围里原样 ${v.保真段} 个）；封腔填 ${v.filledCount}、埋格换 ${v.buriedCount}、邻圈换 ${v.邻圈}、核心边换 ${v.核心边} 格`); }
    o.log(`  转完 ${((performance.now() - t0) / 1000).toFixed(0)} 秒`);
    ({ version: version, 目录: dir, existed } = o.outRoot ? release(pack, staging.dir, o.outRoot) : release(pack, staging.dir));
  } finally {
    staging.放();
  }

  const compareStart = performance.now();
  const result = await compareDirPerCell(oldDir, dir, o.threads, progressFor('逐格比'), visible);
  const verifySec = (performance.now() - compareStart) / 1000;
  const ratioPct = ((100 * result.新字节) / result.旧字节).toFixed(1);
  o.log(`${pack}：${oldVersion} → ${version}${existed ? '（这一版已经有了）' : ''}`);
  o.log(`  ${blockFileNames.length} 个块文件（现行）、${result.sections} 个区段、${result.cell} 格（非空气 ${result.非空气格}）逐格${visible ? '和重做一遍变换的' : ''}相同，读盘验证 ${verifySec.toFixed(3)} 秒`);
  if (visible) o.log(`  改了的 ${result.changedSectionCount} 个区段核过格（只换埋住的、封死的、邻圈不挡面的）和网格（${result.meshCheckCount} 个区段原样、改后各建一遍：前八组不变或只少腔壁，裙边只换贴图）`);
  o.log(`  区段字节 ${result.旧字节} → ${result.新字节}（${ratioPct}%），平均解一个区段 ${(result.decodeMs / result.sections).toFixed(3)} 毫秒（工人并行时测的，机器忙时偏大）`);

  const existing = terrainTable[pack];
  const shouldRegister = !o.noRegister && !o.outRoot && existing !== undefined;
  if (shouldRegister && existing.version !== version) {
    const source = `${existing.source}；anim world transcode 从 ${oldVersion} ${formatVersion === libFormat ? '过可见变换（只保真看得见的格子' : `转成格式 ${libFormat}（64×64 区段、每包状态条件模型${visible ? '，过可见变换' : ''}`}；docs/决策/0011-地形压缩.md）`;
    const entry = await registerTerrainEntry(pack, version, { source: source, license: existing.license, visibility: existing.visibility, ...(existing.note ? { note: existing.note } : {}) });
    registerTerrain(pack, entry);
    o.log('  已登记进 assets/地形版本.json，要随代码提交');
  } else if (!shouldRegister) o.log(`  没登记（${o.outRoot ? `--to ${o.outRoot}` : o.noRegister ? '--no-register' : '这个包不在 assets/地形版本.json 里'}）`);
  return { pack: pack, oldVersion, version: version, 目录: dir, 块文件: blockFileNames.length, ...training, ...result, verifySec };
};

/** 格式 4 → 5 换容器、核对、登记（transcodePack 里格式 4 的包走这里） */
const rewrapPack = async (pack: string, oldVersion: string, oldDir: string, blockFileCount: number, existing: ReturnType<typeof readTerrainTable>['pack'][string] | undefined, o: TranscodeOptions) => {
  const staging = newStaging(pack);
  let version: string, dir: string, existed: boolean;
  const t0 = performance.now();
  try {
    await rewrapDir(oldDir, staging.dir);
    ({ version: version, 目录: dir, existed } = o.outRoot ? release(pack, staging.dir, o.outRoot) : release(pack, staging.dir));
  } finally {
    staging.放();
  }
  const rewrapSec = (performance.now() - t0) / 1000, t1 = performance.now();
  const result = await compareRewrap(oldDir, dir);
  const verifySec = (performance.now() - t1) / 1000;
  o.log(`${pack}：${oldVersion} → ${version}${existed ? '（这一版已经有了）' : ''}，格式 4 → 5 换容器 ${rewrapSec.toFixed(1)} 秒`);
  o.log(`  ${blockFileCount} 个块文件、${result.sections} 个区段（${result.bytes} 字节）逐个区段字节相同，模型.bin、缺失.tsv、粗图逐格相同，核对 ${verifySec.toFixed(1)} 秒`);
  if (packWorld(pack) && !readVisibleRecord(oldDir)) o.log(`  这个包还没做可见变换：再跑一次 anim world transcode ${pack} 做变换`);
  const shouldRegister = !o.noRegister && !o.outRoot && existing !== undefined;
  if (shouldRegister && existing.version !== version) {
    const source = `${existing.source}；anim world transcode 从 ${oldVersion} 换成格式 5 的容器（块头只记有的区段、粗图挪出 包.json，区段字节不变；docs/决策/0011-地形压缩.md）`;
    const entry = await registerTerrainEntry(pack, version, { source: source, license: existing.license, visibility: existing.visibility, ...(existing.note ? { note: existing.note } : {}) });
    registerTerrain(pack, entry);
    o.log('  已登记进 assets/地形版本.json，要随代码提交');
  } else if (!shouldRegister) o.log(`  没登记（${o.outRoot ? `--to ${o.outRoot}` : o.noRegister ? '--no-register' : '这个包不在 assets/地形版本.json 里'}）`);
  return { pack, oldVersion, version, 目录: dir, 块文件: blockFileCount, sections: result.sections, verifySec };
};
