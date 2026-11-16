// anim world transcode 的工作线程（转码.ts 起）：一次一个块文件。
//   转：源包（区段源.ts：现行格式原样，格式 1、2、3 拼成 64×64）→ 现行格式，给了 可见 就先过可见变换（可见.ts）；现行格式的源区段在文件里的先后不变，和直接烘焙写出的字节一样。
//   比：从磁盘上两边各解一遍逐格比（状态、群系）。给了 可见 就拿旧包的格子重做一遍变换再比，改了的区段另核格和网格（可见核对.ts）。
import fs from 'node:fs';
import path from 'node:path';
import { parentPort } from 'node:worker_threads';
import type { SectionData, PackageInfo } from '../../../engine/voxel/区段包.ts';
import { loadVoxelLib } from '../体素库.ts';
import { VisibleEnv, type VisibleSettings } from './可见.ts';
import { checkGrid, checkMesh, loadMesh } from './可见核对.ts';
import { toColumnMajor, encodeVerified } from './区段编码.ts';
import { blockCoordsFromName, sectionsInBlock, readPackModel } from './读区段.ts';
import { openSectionSource, type SectionSource } from './区段源.ts';

/** 名：现行块文件名；填充：拼旧区段时 k底 以下补的方块 */
export type TranscodeJob = { action: '转' | '比'; oldDir: string; 新: string; 名: string; visible?: VisibleSettings | null; fill: string };
export type TranscodeResult = {
  名: string; 区段: number; 旧字节: number; 新字节: number; 格: number; 非空气格: number; decodeMs: number;
  /** 可见变换：改了的区段、保真里原样的区段、各项换掉的格、核过网格的区段 */
  changedSectionCount: number; 保真段: number; filledCount: number; buriedCount: number; 邻圈: number; 核心边: number; meshCheckCount: number;
};
export const emptyResult = (fileName: string): TranscodeResult => ({ 名: fileName, 区段: 0, 旧字节: 0, 新字节: 0, 格: 0, 非空气格: 0, decodeMs: 0, changedSectionCount: 0, 保真段: 0, filledCount: 0, buriedCount: 0, 邻圈: 0, 核心边: 0, meshCheckCount: 0 });

const voxelLib = await loadVoxelLib();

// 一个工人从头到尾只转一个包，源（整包索引、开着的文件）和环境（第 1 级区段缓存）留着复用
let sourceCache: { 键: string; source: SectionSource; env: VisibleEnv | null } | null = null;
const getSource = (oldDir: string, fill: string, visible: VisibleSettings | null | undefined) => {
  const key = `${oldDir}\n${fill}\n${JSON.stringify(visible ?? null)}`;
  if (sourceCache?.键 !== key) {
    sourceCache?.source.close();
    const source = openSectionSource(voxelLib, oldDir, fill);
    sourceCache = { 键: key, source, env: visible ? new VisibleEnv(voxelLib, source, visible) : null };
  }
  return sourceCache;
};
let meshCache: { oldDir: string; build: (d: SectionData) => ReturnType<Awaited<ReturnType<typeof loadMesh>>> } | null = null;
const getMesh = async (oldDir: string) => {
  if (meshCache?.oldDir !== oldDir) meshCache = { oldDir, build: await loadMesh(voxelLib, JSON.parse(fs.readFileSync(path.join(oldDir, '包.json'), 'utf8')) as PackageInfo) };
  return meshCache.build;
};
const recordTransform = (result: TranscodeResult, changeRecord: ReturnType<VisibleEnv['transform']>['changeRecord']) => {
  if (!changeRecord) { result.保真段++; return; }
  result.filledCount += changeRecord.filled.length; result.buriedCount += changeRecord.buriedCount; result.邻圈 += changeRecord.邻圈; result.核心边 += changeRecord.核心边.length;
};

const transcode = ({ oldDir, 新: newDir, 名: fileName, visible, fill }: TranscodeJob): TranscodeResult => {
  const { tileHeaderLen, tileEntryCount, encodeTileHeader } = voxelLib.sectionPack;
  const entryTable = new Uint32Array(2 * tileEntryCount);
  const segments: Uint8Array[] = [];
  let off = tileHeaderLen;
  const result = emptyResult(fileName), { source, env: visibleEnv } = getSource(oldDir, fill, visible);
  for (const s of source.inTile(fileName)) {
    let d = s.取();
    if (d.L !== s.id.L || d.i !== s.id.i || d.j !== s.id.j) throw new Error(`${fileName} 第 ${s.slot} 项写的是区段 ${d.L}/${d.i}/${d.j}，位置算出来是 ${s.id.L}/${s.id.i}/${s.id.j}`);
    if (visibleEnv) {
      const r = visibleEnv.transform(d);
      recordTransform(result, r.changeRecord);
      if (r.d !== d) result.changedSectionCount++;
      d = r.d;
    }
    const packed = encodeVerified(voxelLib, d, readPackModel(newDir));
    entryTable[2 * s.slot] = off;
    entryTable[2 * s.slot + 1] = packed.length;
    off += packed.length;
    segments.push(packed);
    result.区段++;
    result.旧字节 += s.byteCount;
    result.新字节 += packed.length;
  }
  const [ti, tj] = blockCoordsFromName(fileName);
  const fd = fs.openSync(path.join(newDir, fileName), 'w');
  try {
    fs.writeSync(fd, encodeTileHeader(ti, tj, entryTable));
    for (const b of segments) fs.writeSync(fd, b);
  } finally {
    fs.closeSync(fd);
  }
  return result;
};

const compareCells = async ({ oldDir, 新: newDir, 名: fileName, visible, fill }: TranscodeJob): Promise<TranscodeResult> => {
  const result = emptyResult(fileName), { source, env: visibleEnv } = getSource(oldDir, fill, visible), meshBuilder = visibleEnv ? await getMesh(oldDir) : null;
  const newSections = new Map([...sectionsInBlock(voxelLib, path.join(newDir, fileName))].map((s) => [s.slot, s]));
  for (const s of source.inTile(fileName)) {
    const b = newSections.get(s.slot);
    if (!b) throw new Error(`${fileName} 第 ${s.slot} 项：新包里没有这个区段`);
    newSections.delete(s.slot);
    const original = s.取();
    const t0 = performance.now();
    const x = b.取();
    result.decodeMs += performance.now() - t0;
    const sectionName = `${fileName} 区段 ${s.id.L}/${s.id.i}/${s.id.j}`;
    let a = original;
    if (visibleEnv) {
      const r = visibleEnv.transform(original);
      recordTransform(result, r.changeRecord);
      a = r.d;
      if (r.d !== original) {
        result.changedSectionCount++;
        const check = checkGrid(r.g0!, x, visibleEnv.occlusion, r.changeRecord!);
        if (check.坏) throw new Error(`${sectionName}：可见变换改的格有 ${check.坏} 处不合规矩，${check.说}`);
        const meshError = checkMesh(meshBuilder!(original), meshBuilder!(x), original.nz, r.changeRecord!);
        if (meshError) throw new Error(`${sectionName}：可见变换后网格不对，${meshError}`);
        result.meshCheckCount++;
      }
    }
    if (a.L !== x.L || a.i !== x.i || a.j !== x.j || a.kBottom !== x.kBottom || a.nz !== x.nz) throw new Error(`${sectionName}：区段头不一样`);
    const ca = toColumnMajor(a), cx = toColumnMajor(x);
    for (let k = 0; k < ca.length; k++) {
      const pa = ca[k]!, px = cx[k]!;
      if (a.palette[2 * pa] !== x.palette[2 * px] || a.palette[2 * pa + 1] !== x.palette[2 * px + 1]) throw new Error(`${sectionName} 第 ${k} 格不一样（状态、群系 ${a.palette[2 * pa]}、${a.palette[2 * pa + 1]} 对 ${x.palette[2 * px]}、${x.palette[2 * px + 1]}）`);
      if (pa) result.非空气格++;
    }
    result.区段++;
    result.格 += ca.length;
    result.旧字节 += s.byteCount;
    result.新字节 += b.字节.length;
  }
  if (newSections.size) throw new Error(`${fileName}：新包多出 ${newSections.size} 个区段`);
  return result;
};

parentPort!.on('message', async (task: TranscodeJob) => {
  try {
    parentPort!.postMessage({ result: task.action === '转' ? transcode(task) : await compareCells(task) });
  } catch (e) {
    parentPort!.postMessage({ 错: `${task.名}：${(e as Error).message}` });
  }
});
parentPort!.postMessage({ done: true });
