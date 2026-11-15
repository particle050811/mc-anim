// anim cues 的核心：给段框架做的段（窗口段.ts 的 框架 标记）生成本段目录下两份文件，都进 Git、不手改：
//   声音表.生成.ts   纯数据：本段 cue 用到的音频的时长、峰值、响度，台词的配音、开口、时长。段.ts 交给 窗口段，放() 按它算默认长秒和增益
//   声音地址.生成.ts 资产 id → 打包后的地址（asset: import；私有配乐走 engine/audio/私有配乐.ts 现取）再带上声音表。画面.tsx 交给 定义画面
// 按段分开生成：一段只依赖自己用到的那几个声音，加一声不让别的段过期（全作品一张大表的话，加一声全部过期）。
// 生成要先执行 段.ts 才知道用到哪些声音，可 放() 又要表里的数：所以先在「收集」模式下执行一遍（要过的 id 都记下，表里没有的给占位），量完写表，再正常执行一遍取最终 cue。
// 每次执行都用 esbuild 连依赖打成一个新的临时文件再 import，不吃 Node 的模块缓存（同 检查/上下文.ts 的 加载）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { startCollect, endCollect, type SoundTable, type TableAudioInfo, type AudioInfo, type LineTiming } from '../../engine/段/声音助手.ts';
import { segDurSec, type SegmentDef } from '../../engine/段/段定义.ts';
import { isFrameworkSeg } from '../../engine/段/窗口段.ts';
import { esbuildAliasPlugin, nonCodeLoaders } from '../资产/esbuild插件.ts';
import { isPrivateMusic } from '../资产/私有配乐.ts';
import type { AssetLock, LockEntry } from '../资产/资产锁.ts';
import { knownAudioMeasure } from './音频数.ts';
import { lineHeads, openTable } from '../合成/台词落点.ts';

export const soundTableFile = '声音表.生成.ts';
export const soundUrlFile = '声音地址.生成.ts';

/** 台词.toml 的一条里生成要用的字段 */
export type LineRow = { id: string; 配音?: string; 开口?: number };

/** 在 Node 里执行一个纯模块，拿默认导出；每次都是新打的一份 */
export const freshExec = async (file: string, root: string): Promise<Record<string, unknown>> => {
  let out;
  try {
    out = await build({
      entryPoints: [file],
      absWorkingDir: root,
      bundle: true,
      write: false,
      platform: 'node',
      format: 'esm',
      jsx: 'automatic',
      loader: { ...nonCodeLoaders, '.json': 'json' },
      plugins: [esbuildAliasPlugin(root)],
      logLevel: 'silent',
    });
  } catch (e) {
    const errs = (e as { errors?: { text: string; location?: { file: string; line: number } | null }[] }).errors;
    throw new Error(errs?.length ? errs.map((x) => (x.location ? `${x.location.file}:${x.location.line}：${x.text}` : x.text)).join('；') : String(e));
  }
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-cues-'));
  try {
    const f = path.join(workDir, 'm.mjs');
    fs.writeFileSync(f, out.outputFiles[0]!.text, 'utf8');
    return (await import(pathToFileURL(f).href)) as Record<string, unknown>;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
};

const execSeg = async (segFile: string, root: string): Promise<SegmentDef> => {
  const m = await freshExec(segFile, root);
  if (!m.default) throw new Error(`${segFile} 没有 export default`);
  return m.default as SegmentDef;
};

/** 收集模式执行：要过数的 id 都记下来（表里没有的不报错） */
export const collectExec = async (segFile: string, root: string): Promise<{ 段: SegmentDef; collected: Set<string> }> => {
  const collected = startCollect();
  try {
    return { 段: await execSeg(segFile, root), collected };
  } finally {
    endCollect();
  }
};

/** cue 里引到的资产 id 和台词 id（按出现顺序去重） */
export const cueRefs = (seg: Pick<SegmentDef, '声音'>) => {
  const assets = new Set<string>();
  const lineIds = new Set<string>();
  for (const c of seg.声音 ?? []) {
    if (c.台词 !== undefined) lineIds.add(c.台词);
    else assets.add(c.资产);
  }
  return { 资产: assets, 台词: lineIds };
};

export type GenerateEnv = {
  assetLock: AssetLock;
  lineTable: readonly LineRow[];
  /** 一件音频的数（锁里的、缓存的或现量的） */
  getMeasure: (id: string) => AudioInfo;
  /** 清单里本段的上一段（核对段不算），只在本段有跨段的 接上段 台词时才要 */
  prevSeg?: () => Promise<SegmentDef | undefined>;
};

/** 声音表里记的字节标识：锁里 sha256 的前 12 位 */
export const shortSha = (entry: LockEntry) => entry.sha256.slice(0, 12);

/** 盘上声音表里这件的数，字节没换（sha 和锁对得上）才算 */
const onDiskMeasure = (onDisk: SoundTable | undefined, id: string, entry: LockEntry): AudioInfo | undefined => {
  const x = onDisk?.资产[id];
  if (!x || x.sha !== shortSha(entry)) return undefined;
  const { sha: _, ...withoutSha } = x;
  return withoutSha;
};

/**
 * 按段的 cue（和收集时要过数的 id）算声音表。一件的数先用锁里的，再用盘上声音表里 sha 对得上的（换机器重跑不重量，
 * 免得 ffmpeg 版本不同量出差 0.01 的数、改了生成的文件），最后才 环境.取数（缓存或现量）。
 */
export const computeSoundTable = async (seg: SegmentDef, extraAssets: Iterable<string>, env: GenerateEnv, onDisk?: SoundTable): Promise<SoundTable> => {
  const { 资产: assets, 台词: lineIds } = cueRefs(seg);
  const lineById = new Map(env.lineTable.map((t) => [t.id, t]));
  const lineMeta: Record<string, LineTiming> = {};
  const toMeasure = new Set([...assets, ...extraAssets]);
  // 跨段的接上段：本段在它开口之前就有 接上段 的那几句
  const continuedIds = new Set<string>();
  const seenLines = new Set<string>();
  for (const c of seg.声音 ?? []) {
    if (c.台词 === undefined) continue;
    if (c.接上段 && !seenLines.has(c.台词)) continuedIds.add(c.台词);
    if (!c.接上段) seenLines.add(c.台词);
  }
  let prevSegOpenSecById: Map<string, number> | undefined;
  if (continuedIds.size) {
    const prevSeg = await env.prevSeg?.();
    if (!prevSeg) throw new Error(`${[...continuedIds].join('、')} 标了 接上段，清单里没有上一段`);
    const mouthOpenTable = openTable(env.lineTable.map((t) => ({ 角色: '', 文本: '', ...t })));
    prevSegOpenSecById = new Map(lineHeads(prevSeg, mouthOpenTable, undefined, false).map((x) => [x.cue.台词, x.openSec - segDurSec(prevSeg)]));
  }
  for (const id of [...lineIds].sort()) {
    const t = lineById.get(id);
    if (!t) throw new Error(`台词「${id}」不在作品的 台词.toml 里`);
    if (!t.配音) throw new Error(`台词「${id}」还没配音（台词.toml 没写 配音），放不了`);
    toMeasure.add(t.配音);
    const prevSegOpenSec = continuedIds.has(id) ? prevSegOpenSecById?.get(id) : undefined;
    if (continuedIds.has(id) && prevSegOpenSec === undefined) throw new Error(`台词「${id}」标了 接上段，清单里上一段没有它开口`);
    lineMeta[id] = { 配音: t.配音, 开口: t.开口 ?? 0, 时长: 0, ...(prevSegOpenSec !== undefined ? { 上段开口秒: Math.round(prevSegOpenSec * 1e6) / 1e6 } : {}) };
  }
  const assetCounts: Record<string, TableAudioInfo> = {};
  for (const id of [...toMeasure].sort()) {
    const entry = env.assetLock[id];
    if (!entry) throw new Error(`资产锁里没有「${id}」：先在资产表登记、anim assets add 入库`);
    assetCounts[id] = { ...(knownAudioMeasure(entry) ?? onDiskMeasure(onDisk, id, entry) ?? env.getMeasure(id)), sha: shortSha(entry) };
  }
  for (const t of Object.values(lineMeta)) t.时长 = assetCounts[t.配音]!.时长;
  return { 资产: assetCounts, 台词: lineMeta };
};

const fileHeader = '// anim cues 生成，不要手改（段.ts 的声音改了就重跑 anim cues）。';

export const soundTableText = (soundTable: SoundTable) =>
  `${fileHeader}\n// 本段 cue 用到的声音的数：资产 = 时长秒、采样峰值 dBFS、积分响度 LUFS、量的是哪份字节（sha256 前 12 位）；台词 = 配音资产、开口秒、时长秒。段.ts 交给 窗口段 的 声音表。\n` +
  `import type { SoundTable } from '@engine/段/声音助手.ts';\n\nconst soundTable: SoundTable = ${JSON.stringify(soundTable, null, 2)};\nexport default soundTable;\n`;

/** 本段要放的文件：资产 cue 的资产、台词的配音 */
export const requiredFiles = (seg: SegmentDef, soundTable: SoundTable): string[] => {
  const { 资产: assets, 台词: lineIds } = cueRefs(seg);
  const s = new Set(assets);
  for (const id of lineIds) {
    const t = soundTable.台词[id];
    if (!t) throw new Error(`声音表里没有台词「${id}」`);
    s.add(t.配音);
  }
  return [...s].sort();
};

export const soundUrlText = (assetIds: readonly string[], assetLock: AssetLock) => {
  const privateIds = assetIds.filter((id) => isPrivateMusic(id, assetLock));
  const publicFiles = assetIds.filter((id) => !isPrivateMusic(id, assetLock));
  const lines: string[] = [
    fileHeader,
    '// 本段 cue 要放的声音文件（资产 id → 打包后的地址；私有配乐不打进包，按 id 现取）和声音表。画面.tsx 交给 定义画面。',
    "import type { SoundUrl } from '@engine/段/段画面.tsx';",
    ...(privateIds.length ? ["import { privateMusic } from '@engine/audio/私有配乐.ts';"] : []),
    "import soundTable from './声音表.生成.ts';",
    ...publicFiles.map((id, i) => `import sound${i} from ${JSON.stringify(`asset:${id}`)};`),
    '',
    'const soundUrl: SoundUrl = {',
    '  urls: {',
    ...assetIds.map((id) => `    ${JSON.stringify(id)}: ${privateIds.includes(id) ? `privateMusic(${JSON.stringify(id)})` : `sound${publicFiles.indexOf(id)}`},`),
    '  },',
    '  表: soundTable,',
    '};',
    'export default soundUrl;',
    '',
  ];
  return lines.join('\n');
};

export type SingleSegResult = { 段: SegmentDef; 表: SoundTable; changed: string[] };

const writeIfChanged = (file: string, contentText: string): boolean => {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === contentText) return false;
  fs.writeFileSync(file, contentText, 'utf8');
  return true;
};

/** 生成一段的两份文件（变了才写），返回最终的段和改了哪几份 */
export const generateSeg = async (segFile: string, root: string, env: GenerateEnv): Promise<SingleSegResult> => {
  const segDir = path.dirname(segFile);
  const soundTablePath = path.join(segDir, soundTableFile);
  const changed: string[] = [];
  // 第一次生成时 段.ts import 的表还不存在：先放一张空的
  const isNew = !fs.existsSync(soundTablePath);
  if (isNew && writeIfChanged(soundTablePath, soundTableText({ 资产: {}, 台词: {} }))) changed.push(soundTableFile);
  const onDisk = isNew ? undefined : ((await freshExec(soundTablePath, root)).default as SoundTable);
  const collected = await collectExec(segFile, root);
  // 目录里已有声音表的（第 6、7 章迁成原生段时都写了，有的段一声也没有）照样生成；新建的才要 窗口段 或手写了 cue
  if (isNew && !isFrameworkSeg(collected.段)) {
    fs.rmSync(soundTablePath);
    throw new Error(`${segFile} 不是段框架的段（默认导出不是 窗口段 做的），anim cues 不管它`);
  }
  const soundTable = await computeSoundTable(collected.段, collected.collected, env, onDisk);
  if (writeIfChanged(soundTablePath, soundTableText(soundTable)) && !changed.includes(soundTableFile)) changed.push(soundTableFile);
  const seg = await execSeg(segFile, root);
  // 正常执行的 cue 要放的文件都得在表里；段.ts 要是按声音的数分了支、用到收集时没碰到的声音，这里会缺
  const missing = requiredFiles(seg, soundTable).filter((id) => !(id in soundTable.资产));
  if (missing.length) throw new Error(`${segFile}：正常执行用到了收集时没碰到的声音 ${missing.join('、')}（段.ts 按声音的数分了支？），再跑一次 anim cues`);
  if (writeIfChanged(path.join(segDir, soundUrlFile), soundUrlText(requiredFiles(seg, soundTable), env.assetLock))) changed.push(soundUrlFile);
  return { 段: seg, 表: soundTable, changed };
};

/**
 * 核对（anim check、anim cues --检查 用，不写文件、不量音频）：照段现在的 cue 算出两份文件该是什么样，和盘上的比。
 * 数先取锁里的，再取盘上声音表里 sha 对得上的，最后 取数（缓存）；都没有（新加的声音、字节换了）就报。返回问题列表，空 = 对得上。
 */
export const checkSeg = async (seg: SegmentDef, segDir: string, root: string, env: Omit<GenerateEnv, 'getMeasure'> & { getMeasure: (id: string) => AudioInfo | undefined }): Promise<string[]> => {
  const soundTablePath = path.join(segDir, soundTableFile);
  const soundUrlPath = path.join(segDir, soundUrlFile);
  if (!fs.existsSync(soundTablePath) || !fs.existsSync(soundUrlPath)) return [`缺 ${soundTableFile} 或 ${soundUrlFile}：跑 anim cues`];
  const onDisk = (await freshExec(soundTablePath, root)).default as SoundTable;
  let expected: SoundTable;
  try {
    expected = await computeSoundTable(
      seg,
      [],
      {
        ...env,
        getMeasure: (id) => {
          const x = env.getMeasure(id);
          if (x) return x;
          const prevEntry = onDisk.资产[id];
          throw new Error(prevEntry ? `「${id}」的字节换了（锁里 sha ${shortSha(env.assetLock[id]!)}，声音表里 ${prevEntry.sha ?? '没记'}）` : `声音表里没有「${id}」`);
        },
      },
      onDisk,
    );
  } catch (e) {
    return [`${(e as Error).message}：跑 anim cues`];
  }
  const issues: string[] = [];
  // 收集模式下 放() 要过的、最后没进 cue 的 id 允许留在表里：只比 cue 用到的那些
  const onDiskSubset = { 资产: Object.fromEntries(Object.keys(expected.资产).map((k) => [k, onDisk.资产[k]])), 台词: onDisk.台词 };
  if (JSON.stringify(onDiskSubset) !== JSON.stringify(expected)) issues.push(`${soundTableFile} 和 段.ts 的 cue 对不上（加减了声音、改了台词表或锁里的数）：跑 anim cues`);
  if (fs.readFileSync(soundUrlPath, 'utf8') !== soundUrlText(requiredFiles(seg, expected), env.assetLock)) issues.push(`${soundUrlFile} 和 段.ts 的 cue 对不上：跑 anim cues`);
  return issues;
};
