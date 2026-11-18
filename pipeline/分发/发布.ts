// 挂 GitHub Release 发字节（用户 10-25「地形太大了 放 release」「应力转动所有素材都公开」，见 docs/决策/0006-挂Release发字节.md）：
// <作品根>/随发布.toml 写 仓库、标签、段；anim assets pack 照它现算要发的字节（随仓库.ts 的 算随仓库，和随仓库发同一个集合）和这些段声明的地形包，
// 在 <数据根>/cache/发布/ 打成 tar、写 <作品根>/发布锁.json；--upload 用 gh 建 Release、传还没传的附件。anim assets pull 按发布锁下载、核 sha、解进数据根。
// 字节在 私有/ 库、可见性不是私有的（用户 11-13 定全部公开，库不搬，docs/决策/0017-全部公开.md）也发：tar 里放在 私有/<sha 前两位>/<sha256>，锁记在 私有字节，pull 放回 私有/。
// 附件名只用 ASCII（GitHub 会改掉非 ASCII 的附件名）、按内容取：字节 bytes-<sha 列表的 sha 前 12 位>.tar，地形 terrain-<版本>.tar。内容变了名字跟着变，
// 旧附件留在 Release 上，和 store/ 一样只增不改；tar 每次打出来字节都不同（时间戳），所以发布锁里已有的同名附件不重打。
// 下载用系统的 curl、解包用系统的 tar（Windows 10 起自带 curl.exe 和 bsdtar），代理认 HTTPS_PROXY 这类环境变量。
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'smol-toml';
import type { CheckContext } from '../源码/上下文.ts';
import { packManifest, selectTerrainPolicy } from '../世界/版本.ts';
import { config } from '../环境/配置.ts';
import { codeRoot } from '../环境/路径.ts';
import { runCmd, tryRun } from '../环境/子进程.ts';
import { computeRepoBundle } from './随仓库.ts';
import { terrainDir, readReleaseLock, missingAttachmentCount, type ReleaseLock, type Attachment } from './发布锁.ts';

export const releaseTableName = '随发布.toml';
export type ReleaseManifest = { repo: string; label: string; segment: string[] };

/** GitHub 一个 Release 附件要小于 2 GiB */
export const attachmentLimitBytes = 2 * 1024 ** 3;

/** 随发布.toml：仓库 = "<owner>/<repo>"，标签 = "<tag>"，段 = [段键或章, …]（章写成字符串） */
export const readReleaseManifest = (text: string): ReleaseManifest => {
  const d = parse(text) as Record<string, unknown>;
  const expectedShape = `${releaseTableName} 要写 "repo" = "<owner>/<repo>"、"label" = "<tag>"、"segment" = ["<段键或章>", …]`;
  if (typeof d.repo !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(d.repo)) throw new Error(expectedShape);
  if (typeof d.label !== 'string' || !/^[\x21-\x7e]+$/.test(d.label)) throw new Error(`${expectedShape}（标签只用 ASCII）`);
  if (!Array.isArray(d.segment) || !d.segment.length || d.segment.some((x) => typeof x !== 'string' || !x)) throw new Error(expectedShape);
  return { repo: d.repo, label: d.label, segment: d.segment as string[] };
};

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
/** 没有 私有/ 库字节时和以前同名（旧发布锁照用） */
export const bytesAttachmentName = (shas: readonly string[], privateLibs: readonly string[] = []) =>
  `bytes-${sha(shas.join('\n') + (privateLibs.length ? `\n私有\n${privateLibs.join('\n')}` : '')).slice(0, 12)}.tar`;
export const terrainAttachmentName = (version: string) => `terrain-${version}.tar`;

const streamSha256 = (f: string) =>
  new Promise<string>((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(f)
      .on('data', (d) => h.update(d))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject);
  });

type PackRecord = { version: string; manifestSha256?: string; fileCount?: number; size?: number };
type TerrainRecord = PackRecord & { visibility?: string; trimmed?: PackRecord };
const readTerrainTable = (): Record<string, TerrainRecord> => {
  const entries = (JSON.parse(fs.readFileSync(path.join(codeRoot(), 'assets', '地形版本.json'), 'utf8')) as { pack?: Record<string, TerrainRecord> }).pack ?? {};
  return Object.fromEntries(Object.entries(entries).map(([pack,v])=>[pack,selectTerrainPolicy(v)]));
};
/** 登记表里这个版本的那一项：完整包或它裁过的包 */
const recordOf = (table: Record<string, TerrainRecord>, pack: string, version: string): PackRecord | undefined => {
  const v = table[pack];
  return v?.version === version ? v : v?.trimmed?.version === version ? v.trimmed : undefined;
};

export type ExpectedRelease = { bytes: string[]; privateLibBytes: string[]; terrain: { pack: string; version: string; backup?: true }[]; 段数: number; privateFiles: string[]; issues: string[] };

/** 段声明的地形包里要发的：可见性私有的不发（同字节；别人给的存档烘的包，用它的段带 本机地形.txt，别的机器没有包就跳过那段），没登记的记进 issues。
 *  裁过了的包发裁过的（别人 pull 只下它），完整包也挂上当备份（用户 11-17 定，pull --full 才下） */
export const terrainToRelease = (packs: string[], terrainTable: Record<string, TerrainRecord>) => {
  const issues: string[] = [];
  const terrain = packs.flatMap((pack) => {
    const v = terrainTable[pack];
    if (!v) {
      issues.push(`地形包 ${pack} 没在 assets/地形版本.json 登记`);
      return [];
    }
    if (v.visibility === '私有') return [];
    return v.trimmed ? [{ pack, version: v.trimmed.version }, { pack, version: v.version, backup: true as const }] : [{ pack: pack, version: v.version }];
  });
  return { terrain, issues };
};

/** 按当前代码算这一版该发什么：随仓库同一个集合的 store 字节、私有/ 库里可见性不是私有的字节（可见性私有的不发），加段声明的地形包（terrainToRelease） */
export const computeExpectedRelease = async (c: CheckContext, releaseTable: ReleaseManifest): Promise<ExpectedRelease> => {
  const bundleSet = await computeRepoBundle(c, releaseTable.segment);
  const picked = terrainToRelease(bundleSet.terrain, readTerrainTable());
  const issues = [...bundleSet.issues, ...picked.issues];
  const terrainPacks = picked.terrain;
  return { bytes: [...bundleSet.files.keys()].sort(), privateLibBytes: [...bundleSet.privateLibItems.keys()].sort(), terrain: terrainPacks, 段数: bundleSet.segKeys.length, privateFiles: bundleSet.privateFiles, issues };
};

/** 发布锁和现算的对不上的地方（anim check 用）；空就是一致 */
export const compareReleaseLock = (releaseLock: ReleaseLock | undefined, expected: ExpectedRelease, releaseTable: ReleaseManifest): string[] => {
  if (!releaseLock) return ['没有 发布锁.json'];
  const r: string[] = [];
  if (releaseLock.repo !== releaseTable.repo || releaseLock.label !== releaseTable.label) r.push(`发布锁是 ${releaseLock.repo}@${releaseLock.label}，${releaseTableName} 写的是 ${releaseTable.repo}@${releaseTable.label}`);
  for (const [kindLabel, lockedIds, expectedShas] of [
    ['', releaseLock.attachments.flatMap((a) => a.bytes ?? []), expected.bytes],
    ['私有/ 库的', releaseLock.attachments.flatMap((a) => a.privateLibBytes ?? []), expected.privateLibBytes],
  ] as const) {
    const locked = new Set(lockedIds);
    const missing = expectedShas.filter((s) => !locked.has(s));
    const unneeded = [...locked].filter((s) => !expectedShas.includes(s));
    if (missing.length) r.push(`发布锁少 ${missing.length} 件${kindLabel}字节`);
    if (unneeded.length) r.push(`发布锁多 ${unneeded.length} 件${kindLabel}字节（段现在用不到）`);
  }
  const expectedNames = [bytesAttachmentName(expected.bytes, expected.privateLibBytes), ...expected.terrain.map((x) => terrainAttachmentName(x.version))].sort();
  const lockNames = releaseLock.attachments.map((a) => a.name).sort();
  if (expectedNames.join() !== lockNames.join()) r.push(`附件该是 ${expectedNames.join('、')}，发布锁里是 ${lockNames.join('、')}`);
  return r;
};

/** tar 一批相对 基 的路径（列表文件给 -T）；Mac 上不带 ._ 扩展属性文件 */
const packTar = async (tarPath: string, baseDir: string, fileList: string[]) => {
  const listPath = `${tarPath}.列表`;
  fs.writeFileSync(listPath, fileList.join('\n') + '\n', 'utf8');
  const tmp = `${tarPath}.写入中-${process.pid}`;
  try {
    const mac = process.platform === 'darwin' ? ['--no-mac-metadata'] : [];
    await runCmd(['tar', ...mac, '--format', 'pax', '-cf', tmp, '-C', baseDir, '-T', listPath], { env: { ...process.env, COPYFILE_DISABLE: '1' }, quiet: true });
    fs.renameSync(tmp, tarPath);
  } finally {
    fs.rmSync(listPath, { force: true });
    fs.rmSync(tmp, { force: true });
  }
  const byteSize = fs.statSync(tarPath).size;
  if (byteSize >= attachmentLimitBytes) throw new Error(`${tarPath} 有 ${(byteSize / 1e9).toFixed(2)} GB，超过 GitHub 附件上限 2 GiB（要分卷，还没做）`);
  return { sha256: await streamSha256(tarPath), size: byteSize };
};

export const releaseDir = (dataRoot: string) => path.join(dataRoot, 'cache', '发布');

/** anim assets pack：现算该发的，锁里没有的打成 tar，写发布锁；返回新锁和这次新打的附件（本机文件路径） */
export const packRelease = async (c: CheckContext, releaseTable: ReleaseManifest, workRoot: string, dataRoot: string) => {
  const expected = await computeExpectedRelease(c, releaseTable);
  if (expected.issues.length) throw new Error(`算不出该发的：\n  ${expected.issues.join('\n  ')}`);
  const prevLock = readReleaseLock(workRoot);
  const oldAttachments = new Map(prevLock && prevLock.repo === releaseTable.repo && prevLock.label === releaseTable.label ? prevLock.attachments.map((a) => [a.name, a]) : []);
  const dir = releaseDir(dataRoot);
  fs.mkdirSync(dir, { recursive: true });
  const attachments: Attachment[] = [];
  const newPacks: string[] = [];

  const bytesAttachment = bytesAttachmentName(expected.bytes, expected.privateLibBytes);
  const oldAttachment = oldAttachments.get(bytesAttachment);
  if (oldAttachment) attachments.push(oldAttachment);
  else {
    const fileList = [...expected.bytes.map((s) => `store/${s.slice(0, 2)}/${s}`), ...expected.privateLibBytes.map((s) => `私有/${s.slice(0, 2)}/${s}`)];
    const missing = fileList.filter((p) => !fs.existsSync(path.join(dataRoot, p)));
    if (missing.length) throw new Error(`数据根缺 ${missing.length} 件要发的字节（${missing.slice(0, 3).join('、')}…），这台机器打不了`);
    const tarPath = path.join(dir, bytesAttachment);
    console.log(`打 ${bytesAttachment}：${expected.bytes.length + expected.privateLibBytes.length} 件字节`);
    attachments.push({ name: bytesAttachment, ...(await packTar(tarPath, dataRoot, fileList)), bytes: expected.bytes, ...(expected.privateLibBytes.length ? { privateLibBytes: expected.privateLibBytes } : {}) });
    newPacks.push(tarPath);
  }

  const terrainTable = readTerrainTable();
  for (const { pack: pack, version: version, backup } of expected.terrain) {
    const terrainAttachName = terrainAttachmentName(version);
    const oldTerrain = oldAttachments.get(terrainAttachName);
    if (oldTerrain) {
      // 同一个 tar；原来是正式发的、现在裁过了成了备份（或反过来），只改锁里的标记
      const { backup: _b, ...rest } = oldTerrain.terrain ?? { pack, version };
      attachments.push({ ...oldTerrain, terrain: { ...rest, ...(backup ? { backup } : {}) } });
      continue;
    }
    const sourceDir = terrainDir(dataRoot, pack, version);
    if (!fs.existsSync(sourceDir)) throw new Error(`数据根没有地形包 ${pack}/${version}，这台机器打不了`);
    const actual = await packManifest(sourceDir);
    const v = recordOf(terrainTable, pack, version)!;
    if (actual.manifestSha256 !== v.manifestSha256) throw new Error(`地形包 ${pack}/${version} 和 assets/地形版本.json 记的清单指纹不一致，先 anim check --deep`);
    const tarPath = path.join(dir, terrainAttachName);
    console.log(`打 ${terrainAttachName}：地形包 ${pack}，${actual.fileCount} 个文件 ${(actual.size / 1e9).toFixed(2)} GB`);
    const fileNames = fs.readdirSync(sourceDir).sort();
    attachments.push({ name: terrainAttachName, ...(await packTar(tarPath, sourceDir, fileNames)), terrain: { pack: pack, version: version, ...(backup ? { backup } : {}) } });
    newPacks.push(tarPath);
  }
  return { releaseLock: { repo: releaseTable.repo, label: releaseTable.label, attachments: attachments } satisfies ReleaseLock, newPacks, expected };
};

/** Release 上已有的附件名；还没建这个 Release 是 null。gh 没装、没登录、连不上抛错 */
export const listRemoteAttachments = (releaseLock: Pick<ReleaseLock, 'repo' | 'label'>): Set<string> | null => {
  const viewResult = tryRun(['gh', 'release', 'view', releaseLock.label, '--repo', releaseLock.repo, '--json', 'assets', '--jq', '.assets[].name']);
  if (viewResult.exitCode === 0) return new Set(viewResult.stdout.split('\n').filter(Boolean));
  if (/release not found/i.test(viewResult.stderr)) return null;
  throw new Error(`gh release view 失败（装了 gh、gh auth login 了吗）：${viewResult.stderr.trim()}`);
};

/** 发布锁里 Release 上还没有的附件名（发布前、推送前查：pack 了没传，别的机器 pull 会 404） */
export const missingRemoteAttachments = (releaseLock: ReleaseLock, list = listRemoteAttachments): string[] => {
  const remoteNames = list(releaseLock) ?? new Set<string>();
  return releaseLock.attachments.map((a) => a.name).filter((n) => !remoteNames.has(n));
};

/** --upload：没有这个 Release 就建，再传 Release 上还没有的附件（本机 cache/发布/ 里要有）；传完再查一遍，还缺就报错 */
export const uploadRelease = async (releaseLock: ReleaseLock, dataRoot: string) => {
  const listed = listRemoteAttachments(releaseLock);
  if (!listed) await runCmd(['gh', 'release', 'create', releaseLock.label, '--repo', releaseLock.repo, '--title', releaseLock.label, '--notes', '渲片用的字节和地形包，anim assets pull 按 <作品根>/发布锁.json 下载、核 sha、解进数据根。']);
  const remoteNames = listed ?? new Set<string>();
  for (const a of releaseLock.attachments) {
    if (remoteNames.has(a.name)) continue;
    const f = path.join(releaseDir(dataRoot), a.name);
    if (!fs.existsSync(f) || fs.statSync(f).size !== a.size) throw new Error(`${a.name} 不在 ${releaseDir(dataRoot)}（或大小不对），这台机器传不了`);
    console.log(`传 ${a.name}（${(a.size / 1e6).toFixed(0)} MB）`);
    await runCmd(['gh', 'release', 'upload', releaseLock.label, f, '--repo', releaseLock.repo]);
  }
  const stillMissing = missingRemoteAttachments(releaseLock);
  if (stillMissing.length) throw new Error(`传完 Release ${releaseLock.label} 上还没有 ${stillMissing.join('、')}（${releaseLock.repo}），别 push，重跑 anim assets pack --upload`);
  console.log(`Release ${releaseLock.label} 上发布锁的 ${releaseLock.attachments.length} 个附件都在`);
};

/** 字节搬进 store/（或 私有/）：核 sha、只读、先临时名再改名；已有的不动 */
const placeInLib = (sourcePath: string, dataRoot: string, s: string, storage: 'store' | '私有') => {
  const targetPath = path.join(dataRoot, storage, s.slice(0, 2), s);
  if (fs.existsSync(targetPath)) return false;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.chmodSync(sourcePath, 0o444);
  try {
    fs.renameSync(sourcePath, targetPath);
  } catch (e) {
    if (!fs.existsSync(targetPath)) throw e;
  }
  return true;
};

/** 先问一下附件在不在：Release 比发布锁旧（pack 了还没 --upload）时是 404，curl 的重试要耗好几分钟才报，也看不出原因。连不上这类返回 null，交给下载那边重试 */
const attachmentNotUploaded = (url: string) =>
  new Promise<boolean>((resolve) => {
    execFile('curl', ['-sIL', '-o', os.devNull, '-w', '%{http_code}', '--connect-timeout', '20', '--max-time', '60', url], (err, stdout) => resolve(String(stdout).trim().endsWith('404')));
  });

/** anim assets pull：按发布锁把数据根还缺的附件下载、核 sha、解进去；下完的 tar 删掉。下载根 默认取 ANIM_GITHUB_MIRROR（github.com 或加速站前缀），测试换成本地服务。
 *  完整包的备份默认不下（出片只读裁过的），full 才下（往细里看要它） */
export const pullRelease = async (releaseLock: ReleaseLock, dataRoot: string, downloadRoot = config('github下载根').replace(/\/+$/, ''), o: { full?: boolean } = {}) => {
  const missing = releaseLock.attachments.filter((a) => missingAttachmentCount(a, dataRoot, o) > 0);
  const skipped = o.full ? [] : releaseLock.attachments.filter((a) => a.terrain?.backup && !fs.existsSync(terrainDir(dataRoot, a.terrain.pack, a.terrain.version)));
  if (skipped.length) console.log(`完整地形包的备份没下（${skipped.map((a) => `${a.terrain!.pack} ${(a.size / 1e6).toFixed(0)} MB`).join('、')}）：出片只读裁过的；要往细里看（still --tele 的细一级、真值，定级类试看，Studio）加 --full`);
  if (!missing.length) {
    console.log(`${releaseLock.attachments.length} 个附件的东西数据根里都有`);
    return;
  }
  console.log(`要下 ${missing.length} 个附件，共 ${(missing.reduce((s, a) => s + a.size, 0) / 1e9).toFixed(2)} GB（${releaseLock.repo} 的 Release ${releaseLock.label}）`);
  const dir = releaseDir(dataRoot);
  fs.mkdirSync(dir, { recursive: true });
  const terrainTable = readTerrainTable();
  for (const a of missing) {
    const f = path.join(dir, a.name);
    if (!(fs.existsSync(f) && fs.statSync(f).size === a.size && (await streamSha256(f)) === a.sha256)) {
      const url = `${downloadRoot}/${releaseLock.repo}/releases/download/${encodeURIComponent(releaseLock.label)}/${encodeURIComponent(a.name)}`;
      if (await attachmentNotUploaded(url)) throw new Error(`Release ${releaseLock.label} 上没有 ${a.name}（${releaseLock.repo}，HTTP 404）：发布锁比 Release 新，这份代码 pack 过但附件还没传。要在打包的那台机器上 anim assets pack --upload，传完才能用`);
      console.log(`下 ${a.name}（${(a.size / 1e6).toFixed(0)} MB）`);
      const tmp = `${f}.下载中`;
      // -C - 断点续传：上回没下完的接着下。走代理时连接会半路断（Windows 上见过 schannel「server closed abruptly」），
      // curl 的 --retry 默认不重试这种，加 --retry-all-errors；整个 curl 失败了再从断点接着跑几次
      for (let attempt = 1; ; attempt++) {
        try {
          await runCmd(['curl', '-fL', '-#', '--retry', '5', '--retry-all-errors', '-C', '-', '-o', tmp, url]);
          break;
        } catch (e) {
          if (attempt >= 5) throw new Error(`${(e as Error).message}\n${url} 下了 5 次都没下完。GitHub 在国外，最好开代理（设 HTTPS_PROXY）再跑 anim assets pull，或把 ANIM_GITHUB_MIRROR 设成加速站前缀；已下的部分留着，重跑接着下`);
          console.error(`!! 第 ${attempt} 次没下完（已有 ${((fs.existsSync(tmp) ? fs.statSync(tmp).size : 0) / 1e6).toFixed(0)} MB），接着下`);
        }
      }
      const actualSha = await streamSha256(tmp);
      if (actualSha !== a.sha256) {
        fs.rmSync(tmp, { force: true });
        throw new Error(`${a.name} 下下来的 sha256 是 ${actualSha.slice(0, 12)}，发布锁记的是 ${a.sha256.slice(0, 12)}（Release 上的附件被换过？重跑一次）`);
      }
      fs.renameSync(tmp, f);
    }
    const unpackDir = path.join(dir, `解开-${a.name}-${process.pid}`);
    fs.rmSync(unpackDir, { recursive: true, force: true });
    fs.mkdirSync(unpackDir, { recursive: true });
    try {
      await runCmd(['tar', '-xf', f, '-C', unpackDir], { quiet: true });
      if (a.terrain) {
        const { pack: pack, version: version } = a.terrain;
        const v = recordOf(terrainTable, pack, version);
        const actual = await packManifest(unpackDir);
        if (!v || actual.manifestSha256 !== v.manifestSha256 || actual.fileCount !== v.fileCount || actual.size !== v.size) throw new Error(`${a.name} 解开的地形包 ${pack}/${version} 和 assets/地形版本.json 记的不一致`);
        const targetTerrainDir = terrainDir(dataRoot, pack, version);
        fs.mkdirSync(path.dirname(targetTerrainDir), { recursive: true });
        if (!fs.existsSync(targetTerrainDir)) fs.renameSync(unpackDir, targetTerrainDir);
        console.log(`  地形包 ${pack}/${version}：${actual.fileCount} 个文件`);
      } else {
        let copied = 0;
        const parts = [...(a.bytes ?? []).map((s) => ['store', s] as const), ...(a.privateLibBytes ?? []).map((s) => ['私有', s] as const)];
        for (const [storage, s] of parts) {
          const sourcePath = path.join(unpackDir, storage, s.slice(0, 2), s);
          if (!fs.existsSync(sourcePath)) throw new Error(`${a.name} 里没有 ${storage}/${s}`);
          if ((await streamSha256(sourcePath)) !== s) throw new Error(`${a.name} 里 ${s.slice(0, 12)} 的内容 sha256 和文件名对不上`);
          if (placeInLib(sourcePath, dataRoot, s, storage)) copied++;
        }
        console.log(`  ${parts.length} 件字节，新放进数据根 ${copied} 件`);
      }
    } finally {
      fs.rmSync(unpackDir, { recursive: true, force: true });
    }
    fs.rmSync(f, { force: true });
  }
};
