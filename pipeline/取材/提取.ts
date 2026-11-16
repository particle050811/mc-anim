// anim extract 的跑和查。每个条目在 <数据根>/run/extract/<名称>/ 里从空目录跑（前置条目先在同一个目录里跑），
// 跑完按产物表逐个比资产锁：sha 一样就放进库（已有不动），不一样只报告、不入库、不改资产锁（锁里是用过的那一版，换版本要人定）。
// 资产锁是共用锁并上所选作品（--work）的锁，同 id 两边都有就报错；作品资产表登记的产物要带上那部作品跑。
import fs from 'node:fs';
import path from 'node:path';
import { config, dataRoot, dataPath, isWindows } from '../环境/配置.ts';
import { runCmd, runCapture } from '../环境/子进程.ts';
import { localShell, commandLineText, quoteArg, type ShellKind } from '../环境/命令文本.ts';
import { importToStore, bytesPath, fileSha256, readWorkAssetLock, type AssetLock } from '../资产/资产锁.ts';
import { workName, workRoot } from '../环境/作品.ts';
import { mcaiCommand, mcaiEnv } from './mcai.ts';
import { splitPosition, belongsToWork, expandSteps, expandArtifacts, expandArtifactsById, expandArtifactsByFile, scriptDir, type JarRoot, type JarRecord, type SourcingEntry, type SourcingManifest, type ExpandEnv, type Step } from './清单.ts';
import { pixelsMatch } from './像素.ts';

const rootDir = (root: JarRoot | undefined) => (root === '数据' ? dataRoot() : config(root === 'mc资源' ? 'mc资源' : '游戏'));

/** 这件 jar 登记的位置（「到」）在本机的路径，不管在不在 */
export const jarRecordPath = (j: JarRecord) => path.join(rootDir(j.root), j.dest);

/** 本机用的路径：「到」在就用它，不在依次找「也认」的位置，都没有返回「到」（报缺、下载都按它） */
export const jarPath = (q: SourcingManifest, id: string) => {
  const j = q.jars.get(id);
  if (!j) throw new Error(`jars.toml 里没有 ${id}`);
  const registeredPath = jarRecordPath(j);
  if (fs.existsSync(registeredPath)) return registeredPath;
  for (const x of j.alsoAccept ?? []) {
    const [root, relPath] = splitPosition(x);
    const p = path.join(rootDir(root), relPath);
    if (fs.existsSync(p)) return p;
  }
  return registeredPath;
};

/** 产物清单、产物来源文件放在暂存目录外面，不混进「没登记成产物的文件」 */
export const artifactManifestPath = (name: string) => dataPath('run', 'extract', '.产物清单', `${name}.json`);
export const artifactSourcePath = (name: string) => dataPath('run', 'extract', '.产物来源', `${name}.json`);

export const localExpand = (q: SourcingManifest, name?: string): ExpandEnv => ({
  ...(name ? { 产物清单: artifactManifestPath(name), 产物来源: artifactSourcePath(name) } : {}),
  jarPath: (id) => jarPath(q, id),
  prismData: config('prism数据'),
  scriptDir: scriptDir(),
  workRoot: workRoot(),
  python: config('python'),
  mcai: mcaiCommand(),
});

const stepEnv = (): NodeJS.ProcessEnv => ({
  ...mcaiEnv(),
  ANIM_GAME: config('游戏'),
  ANIM_MC_ASSETS: config('mc资源'),
  ...(config('java_home') ? { ANIM_JAVA_HOME: config('java_home') } : {}),
});

/** 步骤的命令行文本（给人照抄）：按本机的壳加引号；先跑一条命令取输出的参数，POSIX 写成 $(…)，cmd 没有这种写法，写成 [… 的输出] */
export const displayCommand = (argv: Step, shell: ShellKind = localShell()) =>
  argv.map((a) => (typeof a === 'string' ? quoteArg(a, shell) : shell === 'windows' ? `[${commandLineText(a.output, shell)} 的输出]` : `$(${commandLineText(a.output, shell)})`)).join(' ');

export const stagingDir = (name: string) => dataPath('run', 'extract', name);

// 没套 换用.toml 的锁：配方的输入、产物说的是 id 自己那件（附加方块表的输入是全局表，不是换上去的附加表）
const sourcingLock = () => readWorkAssetLock(workRoot(), undefined, false);

const placeInputs = (e: SourcingEntry, assetLock: AssetLock, dir: string) => {
  for (const [id, f] of Object.entries(e.input)) {
    const entry = assetLock[id];
    if (!entry) throw new Error(`「${e.displayName}」的输入 ${id} 不在资产锁里`);
    const sourcePath = bytesPath(entry);
    if (!fs.existsSync(sourcePath)) throw new Error(`「${e.displayName}」的输入 ${id} 的字节不在 ${sourcePath}`);
    const destPath = path.join(dir, f);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(sourcePath, destPath, fs.constants.COPYFILE_FICLONE);
    fs.chmodSync(destPath, 0o644);
  }
};

/** 在 dir 里跑一个条目的步骤（前置先跑）；只打印 时只列命令。加产物：--new 要的 [id, 文件]，只加进这一条（不给前置）的产物清单 */
export const runSteps = async (q: SourcingManifest, e: SourcingEntry, dir: string, printOnly: boolean, ran = new Set<string>(), addArtifacts: readonly [string, string][] = []) => {
  if (ran.has(e.displayName)) return;
  ran.add(e.displayName);
  for (const pre of e.prerequisites) {
    const p = q.entryMap.get(pre);
    if (!p) throw new Error(`「${e.displayName}」的前置「${pre}」不是条目`);
    await runSteps(q, p, dir, printOnly, ran);
  }
  console.log(`== ${e.displayName}`);
  if (e.pendingMigration) throw new Error(`「${e.displayName}」待迁移：${e.pendingMigration}`);
  if (e.noReExtract && !printOnly) throw new Error(`「${e.displayName}」不重导：${e.noReExtract}（--print-only 看步骤；真要重导，先删掉这条的「不重导」）`);
  if (!belongsToWork(e, workName())) throw new Error(`「${e.displayName}」的产物登记在作品「${e.work}」，带 --work ${e.work} 跑`);
  if (!e.steps.length) {
    console.log(`（没有自己的步骤：${e.note ?? ''}）`);
    return;
  }
  const v = localExpand(q, e.displayName);
  if (!printOnly) {
    const missing = e.requires.filter((i) => !fs.existsSync(jarPath(q, i)));
    if (missing.length) throw new Error(`「${e.displayName}」缺 jar：${missing.map((i) => `${i}（${jarPath(q, i)}）`).join('、')}`);
    const assetLock = sourcingLock();
    placeInputs(e, assetLock, dir);
    // 脚本照旧项目写的，输出目录默认已经在（旧项目里产物就放在那）：先把产物所在的目录建好
    const existing = expandArtifacts(e.artifacts, assetLock).对;
    const pairs = [...existing, ...addArtifacts.filter(([id]) => !existing.some(([x]) => x === id))];
    for (const [, f] of pairs) fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.mkdirSync(path.dirname(v.产物清单!), { recursive: true });
    // 键「文件」是 sourcing/extract/导出音效.py 读的，产物清单不在盘键表里，不改英文
    fs.writeFileSync(v.产物清单!, JSON.stringify(pairs.map(([id, file]) => ({ id, 文件: file })), null, 1) + '\n');
    // 上回跑剩的产物来源不能留：这回的脚本不写，--register 就该退回按「需要」记
    fs.rmSync(v.产物来源!, { force: true });
  }
  const env = stepEnv();
  for (const [i, step] of e.steps.entries()) {
    const argv = expandSteps(q, step, v);
    if (printOnly) {
      console.log(displayCommand(argv));
      continue;
    }
    if (argv[0] === '复制') {
      const [, sourcePath, destRel] = argv as string[];
      fs.mkdirSync(path.dirname(path.join(dir, destRel!)), { recursive: true });
      fs.copyFileSync(sourcePath!, path.join(dir, destRel!));
      continue;
    }
    const actualArgs: string[] = [];
    for (const a of argv) {
      if (typeof a === 'string') actualArgs.push(a);
      else actualArgs.push(...runCapture(a.output, { cwd: dir, env }).split(/\s+/).filter(Boolean));
    }
    try {
      await runCmd(actualArgs, { cwd: dir, env });
    } catch (err) {
      throw new Error(`「${e.displayName}」第 ${i + 1} 步失败：${displayCommand(argv)}\n${(err as Error).message}`);
    }
  }
};

/** 像素一致：文件 sha 和锁不一样、但都是 PNG 且像素一样（编码器版本不同），算一致，锁里留原来那份字节 */
export type CheckResult = {
  consistent: string[];
  imported: string[];
  pixelMatched: string[];
  mismatched: { id: string; file: string; lockHash: string; 新: string }[];
  missingFiles: { id: string; file: string }[];
  unregistered: string[];
  emptyPatterns: string[];
  /** 按暂存目录里的文件展开、锁里还没有的产物（--register 时交给 登记产物） */
  newArtifacts: { id: string; file: string }[];
};

const listFiles = (dir: string): string[] => {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else out.push(path.relative(dir, p).split(path.sep).join('/'));
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
};

/** 按条目（含前置）的产物表核对 dir 里的文件，sha 一样的入库 */
export const checkArtifacts = (q: SourcingManifest, es: SourcingEntry[], dir: string, assetLock: AssetLock = sourcingLock(), requireBytes: boolean = true): CheckResult => {
  const r: CheckResult = { consistent: [], imported: [], pixelMatched: [], mismatched: [], missingFiles: [], unregistered: [], emptyPatterns: [], newArtifacts: [] };
  const dirFiles = listFiles(dir);
  const usedFiles = new Set<string>();
  const collect = (e: SourcingEntry, seen: Set<string>) => {
    if (seen.has(e.displayName)) return;
    seen.add(e.displayName);
    for (const p of e.prerequisites) collect(q.entryMap.get(p)!, seen);
    for (const f of Object.values(e.input)) usedFiles.add(f);
    const { 对: pairs, 空: unmatched } = expandArtifacts(e.artifacts, assetLock);
    // 锁里还没有的按暂存目录里的文件展开，记成新产物（--register 时登记、入库；通配只展开出新产物的不算空）
    const unlocked = expandArtifactsByFile(e.artifacts, dirFiles).filter(([id]) => !assetLock[id]);
    const newPatterns = new Set(unlocked.map(([id]) => Object.keys(e.artifacts).find((k) => (k.endsWith('/*') ? id.startsWith(k.slice(0, -1)) : k === id))));
    r.emptyPatterns.push(...unmatched.filter((k) => !newPatterns.has(k)).map((k) => `${e.displayName}：${k}`));
    for (const [id, f] of unlocked) {
      if (usedFiles.has(f)) continue;
      usedFiles.add(f);
      r.newArtifacts.push({ id, file: f });
    }
    for (const [id, f] of pairs) {
      if (usedFiles.has(f)) continue;
      usedFiles.add(f);
      const file = path.join(dir, f);
      if (!fs.existsSync(file)) {
        r.missingFiles.push({ id, file: f });
        continue;
      }
      const sha = fileSha256(file);
      const entry = assetLock[id];
      if (!entry || entry.sha256 !== sha) {
        const inStore = entry && bytesPath(entry);
        if (inStore && fs.existsSync(inStore) && pixelsMatch(fs.readFileSync(file), fs.readFileSync(inStore))) r.pixelMatched.push(id);
        else r.mismatched.push({ id, file: f, lockHash: entry?.sha256 ?? '（锁里没有）', 新: sha });
        continue;
      }
      r.consistent.push(id);
      if (requireBytes && !fs.existsSync(bytesPath(entry))) {
        importToStore(file, entry.lib);
        r.imported.push(id);
      }
    }
  };
  const seen = new Set<string>();
  for (const e of es) collect(e, seen);
  r.unregistered = listFiles(dir).filter((f) => !usedFiles.has(f));
  return r;
};

/** 脚本写的产物来源（这条和它的前置），{暂存目录里的文件: [jar 路径…]}；没写的配方不在里面 */
export const readArtifactSources = (q: SourcingManifest, e: SourcingEntry, seen = new Set<string>()): Record<string, string[]> => {
  if (seen.has(e.displayName)) return {};
  seen.add(e.displayName);
  const f = artifactSourcePath(e.displayName);
  const ownSources = fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, string[]>) : {};
  return Object.assign({}, ...e.prerequisites.map((p) => readArtifactSources(q, q.entryMap.get(p)!, seen)), ownSources);
};

/** --new 的 id 是不是这条配方的产物（按产物表的项对得上） */
export const attributeNewIds = (e: SourcingEntry, ids: readonly string[]) => expandArtifactsById(e.artifacts, ids);

/**
 * 跑一个条目：清空暂存目录、跑步骤、核对入库。新ids：锁里还没有、要这回一起导的 id（--new），进产物清单（按锁反推的脚本照它导），
 * 导不出来的记成缺文件
 */
export const extractEntry = async (q: SourcingManifest, e: SourcingEntry, newIds: readonly string[] = []) => {
  if (e.noReExtract) throw new Error(`「${e.displayName}」不重导：${e.noReExtract}（--print-only 看步骤；真要重导，先删掉这条的「不重导」）`);
  const { 对: addArtifacts, unrecognized } = expandArtifactsById(e.artifacts, newIds);
  if (unrecognized.length) throw new Error(`「${e.displayName}」的产物表对不上：${unrecognized.join('、')}`);
  const dir = stagingDir(e.displayName);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  await runSteps(q, e, dir, false, new Set(), addArtifacts);
  const result = checkArtifacts(q, [e], dir);
  for (const [id, file] of addArtifacts) if (!fs.existsSync(path.join(dir, file)) && !result.missingFiles.some((x) => x.id === id)) result.missingFiles.push({ id, file: file });
  return { dir, result: result, artifactSources: readArtifactSources(q, e) };
};

const hasProgram = (exeName: string): boolean => {
  if (path.isAbsolute(exeName)) return fs.existsSync(exeName);
  const suffixes = isWindows ? ['', ...(process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';')] : [''];
  return (process.env.PATH ?? '').split(path.delimiter).some((d) => d && suffixes.some((s) => fs.existsSync(path.join(d, exeName + s))));
};

/** --check：jar、程序、脚本、产物和输入的字节；返回问题列表、待迁移的条目、不重导的条目和属于别的作品、跳过的条目 */
export const check = (q: SourcingManifest, es: SourcingEntry[], verifyHash: boolean, assetLock: AssetLock = sourcingLock(), work = workName()) => {
  const issues: string[] = [];
  const pendingMigration: string[] = [];
  const noReExtract: string[] = [];
  const otherWork: string[] = [];
  for (const [g, ms] of Object.entries(q.group)) issues.push(...ms.filter((m) => !q.entryMap.has(m)).map((m) => `组「${g}」里的「${m}」不是条目`));
  const jarOk = new Map<string, boolean>();
  for (const e of es) {
    const n = e.displayName;
    const v = localExpand(q, n);
    if (!belongsToWork(e, work)) {
      otherWork.push(`${n}：属于作品「${e.work}」，带 --work ${e.work} 查`);
      continue;
    }
    if (e.publicVersion !== '提取' && e.publicVersion !== '不提取') issues.push(`${n}：公开版 要写 "提取" 或 "不提取"`);
    issues.push(...e.prerequisites.filter((p) => !q.entryMap.has(p)).map((p) => `${n}：前置「${p}」不是条目`));
    // 产物、输入：id 在锁里、字节在库里
    const { 对: pairs, 空: unmatched } = expandArtifacts(e.artifacts, assetLock);
    issues.push(...unmatched.map((k) => `${n}：产物 ${k} 在资产锁里一个也没有`));
    for (const [id] of [...pairs, ...Object.entries(e.input)]) {
      const entry = assetLock[id];
      if (!entry) issues.push(`${n}：${id} 不在资产锁里`);
      else if (!fs.existsSync(bytesPath(entry))) issues.push(`${n}：${id} 的字节不在库里（${bytesPath(entry)}）`);
    }
    if (e.pendingMigration) {
      pendingMigration.push(`${n}：${e.pendingMigration}`);
      continue;
    }
    // 不重导的只查产物在锁里、字节在库里；步骤只是记录，不查程序
    if (e.noReExtract) {
      noReExtract.push(n);
      continue;
    }
    for (const i of e.requires) {
      if (!q.jars.has(i)) {
        issues.push(`${n}：需要的 ${i} 不在 jars.toml 里`);
        continue;
      }
      if (!jarOk.has(i)) {
        const p = jarPath(q, i);
        const want = q.jars.get(i)!.sha256;
        const exists = fs.existsSync(p);
        jarOk.set(i, exists && !(verifyHash && want && fileSha256(p) !== want));
        if (!exists) issues.push(`缺 jar：${i}（${p}）`);
        else if (!jarOk.get(i)) issues.push(`jar 的 sha256 和 jars.toml 对不上：${i}（${p}）`);
      }
    }
    for (const step of e.steps) {
      const usedJars = JSON.stringify(step).match(/\{jar:([^}]+)\}/g) ?? [];
      for (const m of usedJars) for (const j of m.slice(5, -1).split(',')) if (!e.requires.includes(j)) issues.push(`${n}：步骤用了 ${j}，需要 里没写`);
      let argv: Step;
      try {
        argv = expandSteps(q, step, v);
      } catch (err) {
        issues.push(`${n}：${(err as Error).message}`);
        continue;
      }
      for (const cmd of [argv, ...argv.filter((a) => typeof a !== 'string').map((a) => a.output)]) {
        const head = cmd[0] as string;
        if (head !== '复制' && !hasProgram(head)) issues.push(`${n}：找不到程序 ${head}`);
        for (const a of cmd.slice(1)) {
          if (typeof a === 'string' && /^[^\s=]+\.(py|ts|mjs|sh)$/.test(a) && path.isAbsolute(a) && !fs.existsSync(a)) issues.push(`${n}：脚本不存在 ${a}`);
        }
      }
    }
  }
  return { issues, pendingMigration: pendingMigration, noReExtract: noReExtract, otherWork };
};
