// anim world 转码：把现有地形包（格式 1、2，或还没做可见变换的格式 3）转成现行格式、过可见变换（可见.ts）。只写新版本目录（版本是内容指纹），旧目录一个字节不动；
// 转完逐格比过（做了变换的另核格和网格，可见核对.ts）才登记。转的结果和拿同一个存档重新 anim world bake 字节相同（区段先后、包.json 的写法都一样），所以不用回去烘存档。
import fs from 'node:fs';
import { modelBytes, modelFileName } from '../../../engine/voxel/区段模型.ts';
import { trainPackModel } from './模型.ts';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { loadVoxelLib } from '../体素库.ts';
import { release, newStaging, versionDir, registerTerrain, registerTerrainEntry, readTerrainTable } from '../版本.ts';
import { packWorld } from '../声明.ts';
import { VisibleEnv, toRecord, recordCovers, type VisibleRecord, type VisibleSettings } from './可见.ts';
import { blockFiles, blockFormat } from './读区段.ts';
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
  for (const b of results) for (const k of Object.keys(sum) as (keyof TranscodeResult)[]) if (k !== '名') sum[k] += b[k];
  sum.名 = '合计';
  return sum;
};

/** 包.json 的 可见：做过可见变换的包记着按什么做的（可见.ts 的 可见记录）；没有 = 原样 */
export const readVisibleRecord = (dir: string) => (JSON.parse(fs.readFileSync(path.join(dir, '包.json'), 'utf8')) as { visible?: VisibleRecord }).visible ?? null;

/** 旧目录（格式 1、2、3）→ 新目录（现行格式）：块文件、包.json、缺失.tsv。给了 可见 就过可见变换，训练也拿变换后的格子学，包.json 记下 可见 */
export const transcodeDir = async (oldDir: string, newDir: string, threads: number, onProgress: (done: number, total: number) => void = () => {}, visible: VisibleSettings | null = null) => {
  const voxelLib = await loadVoxelLib();
  const t0 = performance.now();
  const env = visible ? new VisibleEnv(voxelLib, oldDir, visible) : null;
  let trainingFull: ReturnType<typeof trainPackModel>;
  try {
    trainingFull = trainPackModel(voxelLib, oldDir, env ? (d) => env.transform(d).d : undefined);
  } finally {
    env?.close();
  }
  const { 模型: sectionModel, ...training } = trainingFull;
  const modelTable = modelBytes(sectionModel);
  fs.writeFileSync(path.join(newDir, modelFileName), modelTable);
  const trainSec = (performance.now() - t0) / 1000, t1 = performance.now();
  const result = sumResults(await runWorkers(blockFiles(oldDir).map((fileName) => ({ action: '转' as const, oldDir, 新: newDir, 名: fileName, visible })), threads, onProgress));
  const info = JSON.parse(fs.readFileSync(path.join(oldDir, '包.json'), 'utf8')) as { 版本: number; visible?: VisibleRecord };
  fs.writeFileSync(path.join(newDir, '包.json'), JSON.stringify({ ...info, 版本: voxelLib.sectionPack.formatVersion, ...(visible ? { visible: toRecord(visible) } : {}) }));
  fs.copyFileSync(path.join(oldDir, '缺失.tsv'), path.join(newDir, '缺失.tsv'));
  return { ...training, 训练秒: trainSec, transcodeSec: (performance.now() - t1) / 1000, modelBytesCount: modelTable.length, modelClassCount: sectionModel.classes, transformCounts: result };
};

/** 从磁盘上两边各解一遍逐格比，不一样抛错；包.json 除版本（和 可见）外也要一样。旧、新可以是任何格式的包。
 *  给了 可见：新包要记着这份 可见，旧包的格子重做一遍变换再比，改了的区段另核格和网格 */
export const compareDirPerCell = async (oldDir: string, newDir: string, threads: number, onProgress: (done: number, total: number) => void = () => {}, visible: VisibleSettings | null = null) => {
  if (!fs.readFileSync(path.join(oldDir, '缺失.tsv')).equals(fs.readFileSync(path.join(newDir, '缺失.tsv')))) throw new Error('缺失.tsv 不一样');
  const blockFileNames = blockFiles(oldDir);
  if (JSON.stringify(blockFiles(newDir)) !== JSON.stringify(blockFileNames)) throw new Error('两边的块文件不一样');
  const readPack = (d: string) => ({ ...(JSON.parse(fs.readFileSync(path.join(d, '包.json'), 'utf8')) as object), 版本: 0, visible: null });
  if (JSON.stringify(readPack(oldDir)) !== JSON.stringify(readPack(newDir))) throw new Error('包.json 除版本、可见外不一样');
  if (visible && JSON.stringify(readVisibleRecord(newDir)) !== JSON.stringify(toRecord(visible))) throw new Error('新包 包.json 的 可见 和这次的设置不一样');
  return sumResults(await runWorkers(blockFileNames.map((fileName) => ({ action: '比' as const, oldDir, 新: newDir, 名: fileName, visible })), threads, onProgress));
};

export type TranscodeOptions = { 从?: string; noRegister?: boolean; threads: number; log: (s: string) => void };

export const transcodePack = async (pack: string, o: TranscodeOptions) => {
  const terrainTable = readTerrainTable().包;
  const oldVersion = o.从 ?? terrainTable[pack]?.版本;
  if (!oldVersion) throw new Error(`地形包 ${pack} 没登记，用 --从 <版本> 指定转哪一版`);
  const oldDir = versionDir(pack, oldVersion);
  if (!fs.existsSync(oldDir)) throw new Error(`没有 ${oldDir}`);
  const libFormat = (await loadVoxelLib()).sectionPack.formatVersion;
  const blockFileNames = blockFiles(oldDir);
  if (!blockFileNames.length) throw new Error(`${oldDir} 里没有块文件，不是区段格式的包（主世界-116-远景 是整文件的高度、群系网格，不用转）`);
  const fileHeader = new Uint8Array(16);
  const fd = fs.openSync(path.join(oldDir, blockFileNames[0]!), 'r');
  fs.readSync(fd, fileHeader, 0, 16, 0);
  fs.closeSync(fd);
  const formatVersion = blockFormat(fileHeader);
  // 可见变换的设置跟着烘这个包的世界声明走；没有声明的包（旧项目烘的试验包）只换格式
  const world = packWorld(pack);
  const visible: VisibleSettings | null = world ? { fillBlock: world.visible.fillBlock, 保真: world.visible.保真.map((b) => b.盒) } : null;
  const priorRecord = readVisibleRecord(oldDir);
  if (priorRecord && visible && !recordCovers(priorRecord, toRecord(visible))) throw new Error(`${pack}/${oldVersion} 做过可见变换，世界声明 ${world!.名称} 现在的保真范围或填充它没有：保真范围里埋着的格已经换掉了，要 anim world bake 从存档重烘`);
  if (formatVersion === libFormat && (priorRecord || !visible)) throw new Error(`${pack}/${oldVersion} 已经是格式 ${formatVersion}${priorRecord ? '、做过可见变换' : `，也没有世界声明（${pack} 不在 sourcing/worlds/ 的哪个 [[烘焙.包]] 里），不做可见变换`}，不用转`);
  if (formatVersion !== 1 && formatVersion !== 2 && formatVersion !== libFormat) throw new Error(`${pack}/${oldVersion} 是格式 ${formatVersion}，不认`);
  if (visible) o.log(`${pack}：可见变换按 ${world!.名称} 的声明，填充 ${visible.fillBlock}，保真范围 ${visible.保真.length} 个盒`);
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
    o.log(`  训练 ${training.样本数}/${training.区段} 区段 ${training.训练秒.toFixed(3)} 秒，模型 ${training.modelBytesCount} 字节（${training.modelClassCount} 类）；转码 ${training.transcodeSec.toFixed(3)} 秒`);
    if (visible) { const v = training.transformCounts; o.log(`  可见变换：改了 ${v.changedSectionCount} 个区段（保真范围里原样 ${v.保真段} 个）；封腔填 ${v.filledCount}、埋格换 ${v.buriedCount}、邻圈换 ${v.邻圈}、核心边换 ${v.核心边} 格`); }
    o.log(`  转完 ${((performance.now() - t0) / 1000).toFixed(0)} 秒`);
    ({ 版本: version, 目录: dir, existed } = release(pack, staging.dir));
  } finally {
    staging.放();
  }

  const compareStart = performance.now();
  const result = await compareDirPerCell(oldDir, dir, o.threads, progressFor('逐格比'), visible);
  const verifySec = (performance.now() - compareStart) / 1000;
  const ratioPct = ((100 * result.新字节) / result.旧字节).toFixed(1);
  o.log(`${pack}：${oldVersion} → ${version}${existed ? '（这一版已经有了）' : ''}`);
  o.log(`  ${blockFileNames.length} 个块文件、${result.区段} 个区段、${result.格} 格（非空气 ${result.非空气格}）逐格${visible ? '和重做一遍变换的' : ''}相同，读盘验证 ${verifySec.toFixed(3)} 秒`);
  if (visible) o.log(`  改了的 ${result.changedSectionCount} 个区段核过格（只换埋住的、封死的、邻圈不挡面的）和网格（${result.meshCheckCount} 个区段原样、改后各建一遍：前七组不变或只少腔壁，裙边只换贴图）`);
  o.log(`  区段字节 ${result.旧字节} → ${result.新字节}（${ratioPct}%），平均解一个区段 ${(result.decodeMs / result.区段).toFixed(3)} 毫秒（工人并行时测的，机器忙时偏大）`);

  const existing = terrainTable[pack];
  const shouldRegister = !o.noRegister && existing !== undefined;
  if (shouldRegister && existing.版本 !== version) {
    const source = `${existing.来源}；anim world 转码 从 ${oldVersion} ${formatVersion === libFormat ? '过可见变换（只保真看得见的格子' : `转成格式 3（每包状态条件模型${visible ? '，过可见变换' : ''}`}；docs/决策/0011-地形压缩.md）`;
    const entry = await registerTerrainEntry(pack, version, { 来源: source, 许可: existing.许可, 可见性: existing.可见性, ...(existing.说明 ? { 说明: existing.说明 } : {}) });
    registerTerrain(pack, entry);
    o.log('  已登记进 assets/地形版本.json，要随代码提交');
  } else if (!shouldRegister) o.log(`  没登记（${o.noRegister ? '--不登记' : '这个包不在 assets/地形版本.json 里'}）`);
  return { 包: pack, oldVersion, 版本: version, 目录: dir, 块文件: blockFileNames.length, ...training, ...result, verifySec };
};
