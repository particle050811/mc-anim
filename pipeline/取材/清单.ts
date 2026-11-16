// 读 sourcing/extract.toml（取材条目）和 sourcing/jars.toml（jar 登记），格式见两个文件开头。
// sourcing/extract.<名>.toml：另放的一批条目（录制这类自成一批的），只认 [[取材]] 和 [组]，并进同一张表，名称不能重。
// 这里只做解析、选条目、展开步骤和产物，跑和查在 提取.ts。
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { codeRoot } from '../环境/路径.ts';
import type { AssetLock } from '../资产/资产锁.ts';
import type { Visibility } from '../资产/资产表.ts';
import { readJarLicense, licensePartValues, type JarLicense, type LicensePart } from './许可.ts';

export type OutputParam = { output: string[] };
export type Step = (string | OutputParam)[];
export type SourcingEntry = {
  displayName: string;
  requires: string[];
  prerequisites: string[];
  needsGame: boolean;
  pendingMigration?: string;
  /** 步骤只是记录（网格头反填的范围，网格配方.ts）：锁里那一版重导对不上，anim extract 不跑，--print-only 照样列 */
  noReExtract?: string;
  publicVersion?: string;
  /** 产物登记在这部作品的资产表：只在选了它时跑、查 */
  work?: string;
  steps: Step[];
  input: Record<string, string>;
  artifacts: Record<string, string>;
  note?: string;
  /** --register 写进资产表的可见性；不写时 公开版="提取" 的取「提取」，别的要写 */
  visibility?: Visibility;
  /** 产物的许可取 jar 的哪几部分：数组 = 全部产物，表 = 按 id 第一段（类别）分别写；没写的按类别默认（许可.ts 默认部分） */
  licenseParts?: LicensePart[] | Record<string, LicensePart[]>;
};
/**
 * 根：「到」相对哪个目录，游戏 = anim 配置 ANIM_GAME，mc资源 = ANIM_MC_ASSETS（资源索引在那），
 * 数据 = 数据根（ANIM_DATA；官方映射这类不许再分发、本机按「下载」自取的放 cache/映射/，anim extract --download 取）。
 * 也认：「到」没有时依次再找的位置，写成「<根>:<相对路径>」（早先放在游戏目录里的照样认）
 */
export const jarRootValues = ['游戏', 'mc资源', '数据'] as const;
export type JarRoot = (typeof jarRootValues)[number];
export type JarRecord = { id: string; dest: string; sha256?: string; sha1?: string; download?: string; root?: JarRoot; alsoAccept?: string[]; license?: JarLicense; oldSha256Prefixes?: string[] };

/** 「<根>:<相对路径>」→ [根, 相对路径]；没写根的按游戏 */
export const splitPosition = (x: string): [JarRoot, string] => {
  const m = /^([^:/\\]+):(.+)$/.exec(x);
  if (!m) return ['游戏', x];
  if (!(jarRootValues as readonly string[]).includes(m[1]!)) throw new Error(`jars.toml 的位置「${x}」：根只认 ${jarRootValues.join('、')}`);
  return [m[1] as JarRoot, m[2]!];
};
export type SourcingManifest = { program: Record<string, string[]>; group: Record<string, string[]>; entryMap: Map<string, SourcingEntry>; jars: Map<string, JarRecord> };

export const sourcingDir = () => path.join(codeRoot(), 'sourcing');
export const scriptDir = () => path.join(sourcingDir(), 'extract');

export const parseManifest = (manifestText: string, jarText: string, extraFiles: Record<string, string> = {}): SourcingManifest => {
  const d = parse(manifestText) as Record<string, unknown>;
  const entryMap = new Map<string, SourcingEntry>();
  const groups = { ...((d['group'] as Record<string, string[]>) ?? {}) };
  const allEntries = [...((d['sourcing'] ?? []) as Record<string, unknown>[])];
  for (const [fileName, text] of Object.entries(extraFiles)) {
    const x = parse(text) as Record<string, unknown>;
    const extraKeys = Object.keys(x).filter((k) => k !== 'sourcing' && k !== 'group');
    if (extraKeys.length) throw new Error(`${fileName} 只认 [[取材]] 和 [组]，多了 ${extraKeys.join('、')}`);
    allEntries.push(...((x['sourcing'] ?? []) as Record<string, unknown>[]));
    for (const [k, v] of Object.entries((x['group'] as Record<string, string[]>) ?? {})) {
      if (groups[k]) throw new Error(`${fileName} 的组「${k}」别处已经有了`);
      groups[k] = v;
    }
  }
  for (const raw of allEntries) {
    const e: SourcingEntry = {
      displayName: String(raw['displayName']),
      requires: (raw['requires'] as string[] | undefined) ?? [],
      prerequisites: (raw['prerequisites'] as string[] | undefined) ?? [],
      needsGame: raw['needsGame'] === true,
      pendingMigration: raw['pendingMigration'] as string | undefined,
      noReExtract: raw['noReExtract'] as string | undefined,
      publicVersion: raw['publicVersion'] as string | undefined,
      work: raw['work'] as string | undefined,
      steps: (raw['steps'] as Step[] | undefined) ?? [],
      input: (raw['input'] as Record<string, string> | undefined) ?? {},
      artifacts: (raw['artifacts'] as Record<string, string> | undefined) ?? {},
      note: raw['note'] as string | undefined,
      visibility: raw['visibility'] as Visibility | undefined,
      licenseParts: raw['licenseParts'] as SourcingEntry['licenseParts'],
    };
    const parts = Array.isArray(e.licenseParts) ? e.licenseParts : Object.values(e.licenseParts ?? {}).flat();
    const badParts = parts.filter((p) => !(licensePartValues as readonly string[]).includes(p));
    if (badParts.length) throw new Error(`取材清单「${e.displayName}」的 许可部分 只认 ${licensePartValues.join('、')}：${badParts.join('、')}`);
    if (entryMap.has(e.displayName)) throw new Error(`取材清单里「${e.displayName}」写了两条`);
    entryMap.set(e.displayName, e);
  }
  type RawJar = Omit<JarRecord, 'license'> & { license?: unknown };
  // 映射：官方 client.txt 这类非 jar 文件，登记、查 sha 和 jar 一样
  const j = parse(jarText) as { Mojang?: { assetIndex?: RawJar[] | RawJar; client?: RawJar[]; mappings?: RawJar[]; selfGenerated?: RawJar[] }; mods?: RawJar[] };
  const jars = new Map<string, JarRecord>();
  // 资源索引旧写法是单张表、没有 id，只给人看，不进 jar 表
  const assetIndexes = Array.isArray(j.Mojang?.assetIndex) ? j.Mojang.assetIndex : [];
  for (const x of [...assetIndexes, ...(j.Mojang?.client ?? []), ...(j.Mojang?.mappings ?? []), ...(j.Mojang?.selfGenerated ?? []), ...(j.mods ?? [])]) {
    if (jars.has(x.id)) throw new Error(`jars.toml 里 id「${x.id}」写了两条`);
    if (x.root !== undefined && !(jarRootValues as readonly string[]).includes(x.root)) throw new Error(`jars.toml 的 ${x.id}：根只认 ${jarRootValues.join('、')}，写的是「${x.root}」`);
    for (const y of x.alsoAccept ?? []) splitPosition(y);
    jars.set(x.id, { ...x, license: x.license === undefined ? undefined : readJarLicense(x.license) });
  }
  return { program: (d['program'] as Record<string, string[]>) ?? {}, group: groups, entryMap, jars };
};

export const readManifest = () => {
  const dir = sourcingDir();
  const extraFiles = Object.fromEntries(
    fs
      .readdirSync(dir)
      .filter((f) => /^extract\..+\.toml$/.test(f))
      .sort()
      .map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]),
  );
  return parseManifest(fs.readFileSync(path.join(dir, 'extract.toml'), 'utf8'), fs.readFileSync(path.join(dir, 'jars.toml'), 'utf8'), extraFiles);
};

/** 能直接跑的：有步骤、不用开游戏、不待迁移、不是不重导（--all 就是这些） */
export const canRunDirectly = (e: SourcingEntry) => e.steps.length > 0 && !e.needsGame && !e.pendingMigration && !e.noReExtract;

/** 条目属于所选作品（没写「作品」的各作品都算） */
export const belongsToWork = (e: SourcingEntry, work: string) => e.work === undefined || e.work === work;

/** 名称或组名 → 条目（去重、保持先后）；--all 见 可直接跑，给了 作品 时不选写了别的作品的 */
export const selectEntries = (q: SourcingManifest, names: readonly string[], all: boolean, work?: string): SourcingEntry[] => {
  const out: string[] = [];
  if (all) out.push(...[...q.entryMap.values()].filter((e) => canRunDirectly(e) && (work === undefined || belongsToWork(e, work))).map((e) => e.displayName));
  for (const n of names) {
    const got = q.entryMap.has(n) ? [n] : q.group[n];
    if (!got) throw new Error(`取材清单里没有「${n}」（条目或组）；anim extract --list 看有哪些`);
    for (const k of got) if (!out.includes(k)) out.push(k);
  }
  return out.map((k) => {
    const e = q.entryMap.get(k);
    if (!e) throw new Error(`组里的「${k}」不是条目`);
    return e;
  });
};

/**
 * 产物清单：这条配方按资产锁展开的产物（[{id, 文件}] 的 JSON 文件；--new 要的 id 也在里面），给按锁反推要导什么的脚本用（导出音效.py --按产物）。
 * 产物来源：脚本写的 JSON {文件: [用到的 jar 路径…]}（文件相对暂存目录），--register 照它给每件产物记真正用到的 jar；不写就记配方「需要」的全部 jar
 */
export type ExpandEnv = { jarPath: (id: string) => string; prismData: string; scriptDir: string; workRoot: string; python: string; mcai: string[]; 产物清单?: string; 产物来源?: string };

const runOnlyValue = (fieldName: '产物清单' | '产物来源', v: ExpandEnv) => {
  const f = v[fieldName];
  if (!f) throw new Error(`步骤用了 {${fieldName}}，这里没有（只在 anim extract 跑条目时有）`);
  return f.split(path.sep).join('/');
};

/** 参数里的 {jar:a,b}、{prism数据}、{脚本}、{作品根}、{产物清单}、{产物来源} 换成本机路径 */
export const fillTemplate = (a: string, v: ExpandEnv) =>
  a
    .replace(/\{产物清单\}/g, () => runOnlyValue('产物清单', v))
    .replace(/\{产物来源\}/g, () => runOnlyValue('产物来源', v))
    .replace(/\{jar:([^}]+)\}/g, (_, ids: string) => ids.split(',').map((i) => v.jarPath(i).split(path.sep).join('/')).join(','))
    .replaceAll('{prism数据}', v.prismData.split(path.sep).join('/'))
    .replaceAll('{脚本}', v.scriptDir.split(path.sep).join('/'))
    .replaceAll('{作品根}', v.workRoot.split(path.sep).join('/'));

/** 一步 → 参数（简称、python、mcai 换成真的命令；ts 是旧项目的工具，还没搬） */
export const expandSteps = (q: SourcingManifest, step: Step, v: ExpandEnv): Step => {
  const [program, ...restArgs] = step;
  if (typeof program !== 'string') throw new Error('步骤的第一个参数要是程序名');
  let argv: Step;
  if (q.program[program]) argv = [...q.program[program]!, ...restArgs];
  else if (program === 'python') argv = [v.python, ...restArgs];
  else if (program === 'mcai') argv = [...v.mcai, ...restArgs];
  else if (program === 'ts') throw new Error('步骤用了 ts（旧项目 工具/一镜到底/ 的工具），还没搬过来');
  else argv = step;
  return argv.map((a) => (typeof a === 'string' ? fillTemplate(a, v) : { output: expandSteps(q, a.output, v) as string[] }));
};

/** 产物表 → [id, 相对暂存目录的文件]；<id 目录>/* 按资产锁里这个目录下一层的 id 展开 */
export const expandArtifacts = (outputTable: Record<string, string>, assetLock: AssetLock): { 对: [string, string][]; 空: string[] } => {
  const pairs: [string, string][] = [];
  const unmatched: string[] = [];
  for (const [k, f] of Object.entries(outputTable)) {
    if (!k.endsWith('/*')) {
      pairs.push([k, f]);
      continue;
    }
    const dirPrefix = k.slice(0, -1);
    const ids = Object.keys(assetLock)
      .filter((id) => id.startsWith(dirPrefix) && !id.slice(dirPrefix.length).includes('/'))
      .sort();
    if (!ids.length) unmatched.push(k);
    for (const id of ids) pairs.push([id, f.replace('*', id.slice(dirPrefix.length))]);
  }
  return { 对: pairs, 空: unmatched };
};

/** --register 用：<id 目录>/* 再按暂存目录里实有的文件展开（新产物还不在锁里）；文件那边的 * 只匹配一层 */
export const expandArtifactsByFile = (outputTable: Record<string, string>, fileNames: readonly string[]): [string, string][] => {
  const pairs: [string, string][] = [];
  for (const [k, f] of Object.entries(outputTable)) {
    if (!k.endsWith('/*')) {
      if (fileNames.includes(f)) pairs.push([k, f]);
      continue;
    }
    const [prefix, suffix] = f.split('*') as [string, string];
    for (const x of fileNames) {
      if (!x.startsWith(prefix) || !x.endsWith(suffix) || x.length < prefix.length + suffix.length + 1) continue;
      const wildcardName = x.slice(prefix.length, x.length - suffix.length);
      if (!wildcardName.includes('/')) pairs.push([k.slice(0, -1) + wildcardName, x]);
    }
  }
  return pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
};

/** --new：锁里还没有的 id 按产物表找文件（先找写死的那一项，再找 <id 目录>/*：文件把 * 换成 id 最后一段）；对不上任何一项的放进 不认 */
export const expandArtifactsById = (outputTable: Record<string, string>, ids: readonly string[]): { 对: [string, string][]; unrecognized: string[] } => {
  const pairs: [string, string][] = [];
  const unrecognized: string[] = [];
  for (const id of ids) {
    const entries = Object.entries(outputTable);
    const matched = entries.find(([k]) => k === id) ?? entries.find(([k]) => k.endsWith('/*') && id.startsWith(k.slice(0, -1)) && id.length > k.length - 1 && !id.slice(k.length - 1).includes('/'));
    if (!matched) unrecognized.push(id);
    else pairs.push([id, matched[0].endsWith('/*') ? matched[1].replace('*', id.slice(matched[0].length - 1)) : matched[1]]);
  }
  return { 对: pairs, unrecognized };
};
