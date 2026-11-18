// 裁级：从完整地形包派生只含全片用到的级的包（用户 11-17 定，docs/世界.md「裁级」）。
// 留法「只留用到的」：每处留全片实际用到的最细级和比它粗的级（覆盖量出来的区段连同各级祖先），不多留余量；L3～L6 整包全留（只多零点几 MB）。
// 块文件里每个 (区段, 级) 是独立的一段字节（自带头和色板，按包共用的模型解码），所以裁剪 = 照留表只拷留下的段、重写块头；包.json 加 trim、重量 tileHeaderMax，粗图、模型.bin 原样拷。
// 每个块文件都写（留下的区段一个没有的也写个只有块头的），页面按 Range 取块头不会 404，块头里没有的区段报「缺级」（engine/voxel/导入地形.ts）。
// 不把留表写成包.json 的 splittable（各处最细级不一样的包用它让挑区段停在有的那一级）：裁过的包挑区段要和完整包一模一样，画面才不变；
// 用到了没留的区段要报「缺级」，不能悄悄停在粗一级。完整包本来带的 splittable 原样留着。
// 完整包一直留着当源头，不动；裁过的包按内容指纹当版本，放在同一个包名下（<数据根>/terrain/<包>/<裁过的版本>/），登记在 assets/地形版本.json 那个包的 trimmed。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PackageInfo, TrimInfo } from '../../../engine/voxel/区段包.ts';
import { loadVoxelLib } from '../体素库.ts';
import { decodeTileFile, readTileIndex } from '../烘焙/读区段.ts';
import { tileHeaderMaxOf } from '../烘焙/包信息.ts';
import type { SectionId } from '../../../engine/voxel/区段.ts';
import { packManifest, release, newStaging, versionDir, readTerrainTable, terrainTablePath, type TerrainRecord, type TrimmedRecord } from '../版本.ts';

/** 写进包.json 的裁法 */
export const trimMethod = '只留用到的：每处留全片用到的最细级和比它粗的级，L3～L6 全留（用户 11-17 定）';
/** 这一级及更粗的整包全留 */
export const keepAllFromLevel = 3;
export const keepFileName = '留表.tsv';
/** 裁过的包里带一份完整包的登记（包名和登记项）：笔记本生成的世界只传裁过的包回来，本机没有完整包也能登记（trim --import） */
export const fullRecordFileName = '完整包登记.json';
type FullRecordFile = { pack: string; record: Omit<TerrainRecord, 'trimmed'> };


const tileFiles = (dir: string) => fs.readdirSync(dir).filter((f) => f.endsWith('.块')).sort();
const tileOf = (f: string) => f.slice(0, -2).split('.').map(Number) as [number, number];
// 块头格式、区段键只有 engine/voxel/区段包.ts、区段.ts 那一份（它们 import 了 asset:，经 体素库.ts 动态取）
/** 完整包里有的区段，键是 sectionKey */
export const packSections = async (dir: string): Promise<Set<string>> => {
  const voxelLib = await loadVoxelLib(), { sectionKey } = voxelLib.sections;
  const out = new Set<string>();
  for (const f of tileFiles(dir)) for (const s of voxelLib.sectionPack.tileSections(readTileIndex(voxelLib, path.join(dir, f)))) out.add(sectionKey(s.id));
  return out;
};

const parseKey = (k: string): SectionId => {
  const [L, i, j] = k.split('|').map(Number) as [number, number, number];
  return { L, i, j };
};

/** 留表：用到的区段连同各级祖先（到包的最粗级），加上整包第 keepAllFromLevel 级以上的，只留包里有的。按 (L, i, j) 排好 */
export const keepTable = async (used: Iterable<string>, present: ReadonlySet<string>, coarsestLevel: number): Promise<SectionId[]> => {
  const { sectionKey } = (await loadVoxelLib()).sections;
  const keep = new Set<string>();
  for (const k of used) {
    let q = parseKey(k);
    for (;;) {
      keep.add(sectionKey(q));
      if (q.L >= coarsestLevel) break;
      q = { L: q.L + 1, i: q.i >> 1, j: q.j >> 1 }; // >> 是向下取整，负的区段号也对
    }
  }
  for (const k of present) if (parseKey(k).L >= keepAllFromLevel) keep.add(k);
  return [...keep].filter((k) => present.has(k)).map(parseKey).sort((a, b) => a.L - b.L || a.i - b.i || a.j - b.j);
};
export const keepTableText = (table: readonly SectionId[]) => table.map((q) => `${q.L}\t${q.i}\t${q.j}\n`).join('');
export const sha256 = (s: string | Buffer) => crypto.createHash('sha256').update(s).digest('hex');

/** 照留表把完整包写到 to（空目录）：块文件只拷留下的段、重写块头；包.json 加 trim、重量 tileHeaderMax；粗图、模型和别的文件原样拷；另写留表。返回留表的 sha256 */
export const writeTrimmed = async (fullDir: string, full: FullRecordFile, table: readonly SectionId[], to: string): Promise<string> => {
  const voxelLib = await loadVoxelLib(), P = voxelLib.sectionPack, { sectionKey } = voxelLib.sections;
  const fullVersion = full.record.version;
  const text = keepTableText(table);
  const keepSha256 = sha256(text);
  const want = new Set(table.map(sectionKey));
  for (const f of fs.readdirSync(fullDir)) {
    const src = path.join(fullDir, f);
    if (!fs.statSync(src).isFile() || f.startsWith('.') || f === '包.json') continue;
    if (!f.endsWith('.块')) {
      fs.copyFileSync(src, path.join(to, f));
      continue;
    }
    const [ti, tj] = tileOf(f);
    const buf = fs.readFileSync(src), index = decodeTileFile(voxelLib, src, buf);
    // encodeTile 按级、级内项号排，和完整包里的先后一样，挨着的区段还挨着（页面并成一次 Range）
    const kept = [...P.tileSections(index)].filter((s) => want.has(sectionKey(s.id))).map((s) => ({ id: s.id, bytes: buf.subarray(s.off, s.off + s.len) }));
    fs.writeFileSync(path.join(to, f), Buffer.concat(P.encodeTile(ti, tj, index.coarsestLevel, kept)));
  }
  const info = JSON.parse(fs.readFileSync(path.join(fullDir, '包.json'), 'utf8')) as PackageInfo;
  if (info.trim) throw new Error(`${fullDir} 已经是裁过的包（从 ${info.trim.from} 裁），要从完整包裁`);
  const trim: TrimInfo = { from: fullVersion, keepSha256, method: trimMethod };
  fs.writeFileSync(path.join(to, '包.json'), JSON.stringify({ ...info, tileHeaderMax: tileHeaderMaxOf(voxelLib, to), trim }));
  fs.writeFileSync(path.join(to, keepFileName), text);
  fs.writeFileSync(path.join(to, fullRecordFileName), `${JSON.stringify(full, null, 2)}\n`);
  return keepSha256;
};

/** 逐段核对裁过的包：留下的每一段和完整包同一段字节一样，没留的块头里没有，留表里的都在；包.json 除了 trim、tileHeaderMax 一样（tileHeaderMax 要是裁过的块头里最长的），别的文件逐字节一样。返回不一致的说明（空 = 一致） */
export const compareTrimmed = async (fullDir: string, trimDir: string): Promise<{ checked: number; problems: string[] }> => {
  const voxelLib = await loadVoxelLib(), P = voxelLib.sectionPack, { sectionKey } = voxelLib.sections;
  const problems: string[] = [];
  const keepPath = path.join(trimDir, keepFileName);
  if (!fs.existsSync(keepPath)) return { checked: 0, problems: [`${trimDir} 没有 ${keepFileName}`] };
  const keepText = fs.readFileSync(keepPath, 'utf8');
  const want = new Set(keepText.split('\n').filter(Boolean).map((l) => l.split('\t').join('|')));
  const info = JSON.parse(fs.readFileSync(path.join(trimDir, '包.json'), 'utf8')) as PackageInfo;
  if (info.trim?.keepSha256 !== sha256(keepText)) problems.push(`包.json 记的留表 sha256 和 ${keepFileName} 对不上`);
  if (info.tileHeaderMax !== tileHeaderMaxOf(voxelLib, trimDir)) problems.push(`包.json 的 tileHeaderMax ${info.tileHeaderMax} 不是裁过的块头里最长的`);
  const { trim: _trim, tileHeaderMax: _a, ...rest } = info;
  const { tileHeaderMax: _b, ...fullRest } = JSON.parse(fs.readFileSync(path.join(fullDir, '包.json'), 'utf8')) as PackageInfo;
  if (JSON.stringify(rest) !== JSON.stringify(fullRest)) problems.push('包.json 除了 trim、tileHeaderMax 和完整包的不一样');
  for (const f of fs.readdirSync(fullDir)) {
    if (f === '包.json' || f.endsWith('.块') || f.startsWith('.')) continue;
    if (!fs.existsSync(path.join(trimDir, f)) || !fs.readFileSync(path.join(trimDir, f)).equals(fs.readFileSync(path.join(fullDir, f)))) problems.push(`${f} 和完整包的不一样`);
  }
  let checked = 0;
  const seen = new Set<string>();
  for (const f of tileFiles(fullDir)) {
    if (!fs.existsSync(path.join(trimDir, f))) {
      problems.push(`少块文件 ${f}`);
      continue;
    }
    const a = fs.readFileSync(path.join(fullDir, f)), b = fs.readFileSync(path.join(trimDir, f));
    const ia = decodeTileFile(voxelLib, path.join(fullDir, f), a), ib = decodeTileFile(voxelLib, path.join(trimDir, f), b);
    for (const s of P.tileSections(ia)) {
      const key = sectionKey(s.id), x = P.findInTile(ib, s.id);
      if (!x) {
        if (want.has(key)) problems.push(`留表里有 ${key}，裁过的包没有`);
        continue;
      }
      seen.add(key);
      if (!want.has(key)) problems.push(`${key} 不在留表里，裁过的包却有`);
      checked++;
      if (!a.subarray(s.off, s.off + s.len).equals(b.subarray(x.off, x.off + x.len))) problems.push(`${key} 的字节和完整包不一样`);
    }
    for (const s of P.tileSections(ib)) if (!P.findInTile(ia, s.id)) problems.push(`${f}：裁过的包有完整包没有的区段 ${sectionKey(s.id)}`);
  }
  for (const k of want) if (!seen.has(k)) problems.push(`留表里的 ${k} 裁过的包没有`);
  return { checked, problems: problems.slice(0, 50) };
};

/** 从完整包（登记的版本）按用到的区段裁出一版、发布进 <数据根>/terrain/<包>/，返回登记项（不写登记表） */
export const trimPack = async (pack: string, used: Iterable<string>, log: (s: string) => void = console.log): Promise<{ record: TrimmedRecord; table: SectionId[]; existed: boolean; dir: string }> => {
  const entry = readTerrainTable().pack[pack];
  if (!entry) throw new Error(`assets/地形版本.json 没登记包 ${pack}`);
  const fullDir = versionDir(pack, entry.version);
  if (!fs.existsSync(path.join(fullDir, '包.json'))) throw new Error(`完整包 ${pack}/${entry.version} 不在本机（${fullDir}）：裁剪要在有完整包的机器上做（生成世界的笔记本，或 anim assets pull --full）`);
  const t0 = Date.now();
  const present = await packSections(fullDir);
  const table = await keepTable(used, present, (JSON.parse(fs.readFileSync(path.join(fullDir, '包.json'), 'utf8')) as PackageInfo).coarsestLevel);
  const staging = newStaging(pack);
  try {
    const { trimmed: _old, ...record } = entry;
    const keepSha256 = await writeTrimmed(fullDir, { pack, record }, table, staging.dir);
    const v = release(pack, staging.dir);
    const check = await compareTrimmed(fullDir, v.目录);
    if (check.problems.length) throw new Error(`裁过的包 ${v.目录} 和完整包逐段比对不一致：\n  ${check.problems.join('\n  ')}`);
    const m = await packManifest(v.目录);
    const levels = new Map<number, number>();
    for (const q of table) levels.set(q.L, (levels.get(q.L) ?? 0) + 1);
    log(`${pack}：从 ${entry.version}（${(entry.size / 1e6).toFixed(1)} MB）裁出 ${v.version}（${(m.size / 1e6).toFixed(1)} MB${v.existed ? '，同内容已有' : ''}），留 ${table.length} 个区段（${[...levels].sort((a, b) => a[0] - b[0]).map(([L, n]) => `L${L} ${n}`).join('、')}），逐段核对 ${check.checked} 段一致，${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
    return { record: { version: v.version, from: entry.version, keepSha256, method: trimMethod, fileCount: m.fileCount, size: m.size, manifestSha256: m.manifestSha256 }, table, existed: v.existed, dir: v.目录 };
  } finally {
    staging.放();
  }
};

/**
 * 登记别的机器裁好拷过来的包（生成世界的笔记本只传裁过的包回来，用户 11-17 定）：本机可以没有完整包。
 * 拷进 <数据根>/terrain/<包>/<内容指纹>/、核留表的 sha256；本机有完整包就再逐段核对。登记表里这个包的完整包不是它裁的那版（或还没登记）时，照包里带的完整包登记项改过来（用到它的段都过期）
 */
export const importTrimmed = async (srcDir: string, log: (s: string) => void = console.log) => {
  const fullFile = path.join(srcDir, fullRecordFileName);
  if (!fs.existsSync(fullFile)) throw new Error(`${srcDir} 没有 ${fullRecordFileName}，不是 anim world trim 裁出来的包`);
  const full = JSON.parse(fs.readFileSync(fullFile, 'utf8')) as FullRecordFile;
  const info = JSON.parse(fs.readFileSync(path.join(srcDir, '包.json'), 'utf8')) as PackageInfo;
  if (!info.trim || info.trim.from !== full.record.version) throw new Error(`${srcDir} 的包.json 没有 trim，或和 ${fullRecordFileName} 记的完整包版本对不上`);
  if (sha256(fs.readFileSync(path.join(srcDir, keepFileName))) !== info.trim.keepSha256) throw new Error(`${srcDir} 的 ${keepFileName} 和包.json 记的 sha256 对不上`);
  const staging = newStaging(full.pack);
  try {
    for (const f of fs.readdirSync(srcDir)) if (!f.startsWith('.') && fs.statSync(path.join(srcDir, f)).isFile()) fs.copyFileSync(path.join(srcDir, f), path.join(staging.dir, f), fs.constants.COPYFILE_FICLONE);
    const v = release(full.pack, staging.dir);
    const fullDir = versionDir(full.pack, full.record.version);
    if (fs.existsSync(path.join(fullDir, '包.json'))) {
      const check = await compareTrimmed(fullDir, v.目录);
      if (check.problems.length) throw new Error(`拷来的裁过的包和本机完整包逐段比对不一致：\n  ${check.problems.join('\n  ')}`);
      log(`本机有完整包 ${full.record.version}，逐段核对 ${check.checked} 段一致`);
    }
    const m = await packManifest(v.目录);
    const record: TrimmedRecord = { version: v.version, from: full.record.version, keepSha256: info.trim.keepSha256, method: info.trim.method, fileCount: m.fileCount, size: m.size, manifestSha256: m.manifestSha256 };
    const table = readTerrainTable();
    const entry = table.pack[full.pack];
    if (entry?.version !== full.record.version) {
      log(`${full.pack}：登记表的完整包${entry ? `是 ${entry.version}` : '还没登记'}，照拷来的包改成 ${full.record.version}（用到它的段都过期）`);
      table.pack[full.pack] = { ...full.record, trimmed: record };
    } else entry.trimmed = record;
    fs.writeFileSync(terrainTablePath(), JSON.stringify(table, null, 2) + '\n');
    log(`${full.pack}：登记裁过的包 ${v.version}（${(m.size / 1e6).toFixed(1)} MB，从 ${full.record.version} 裁）${v.existed ? '，同内容本来就有' : ''}`);
    return { pack: full.pack, record };
  } finally {
    staging.放();
  }
};

/** 写进登记表那个包的 trimmed（完整包的登记不动）；返回原来登记的裁过的版本 */
export const registerTrimmed = (pack: string, record: TrimmedRecord) => {
  const table = readTerrainTable();
  const entry = table.pack[pack];
  if (!entry) throw new Error(`assets/地形版本.json 没登记包 ${pack}`);
  if (entry.version !== record.from) throw new Error(`${pack} 登记的完整包是 ${entry.version}，裁过的包是从 ${record.from} 裁的`);
  const old = entry.trimmed?.version;
  entry.trimmed = record;
  fs.writeFileSync(terrainTablePath(), JSON.stringify(table, null, 2) + '\n');
  return old;
};
