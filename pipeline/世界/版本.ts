// 地形包的版本：<数据根>/terrain/<包>/<版本>/，版本是内容指纹（目录指纹，照旧项目 工具/导入/区段包版本.mjs），发布后不再改，旧版本不删。
// 烘焙先写进暂存目录（<数据根>/run/暂存/terrain/<包>，同一个包同时只许一个进程写，拿 <暂存>.写入.lock），写完 发布：算指纹、改名成版本目录。
// 登记进 assets/地形版本.json 另是一步（登记）：声明了这个包的段会过期，别的段不受影响（地形项只记段声明的包，见 指纹/指纹.ts）。
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { terrainRoot, dataPath, config } from '../环境/配置.ts';
import { codeRoot } from '../环境/路径.ts';
import { fileSha } from '../环境/去重.ts';
import { holderPid, releaseLock, tryAcquire } from '../闸/锁.ts';

/** 地形包整包清单指纹（同 assets/tools/导入旧项目.py 的 包清单：路径按段逐级比较排序，「相对路径\tsha256\n」逐行拼起来再取 sha256） */
export const packManifest = async (dir: string) => {
  const files: string[][] = [];
  const walk = (rel: string[]) => {
    for (const e of fs.readdirSync(path.join(dir, ...rel), { withFileTypes: true })) {
      if (e.isDirectory()) walk([...rel, e.name]);
      else if (e.isFile()) files.push([...rel, e.name]);
    }
  };
  walk([]);
  const compareStrings = (a: string, b: string) => {
    const x = [...a];
    const y = [...b];
    for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i]!.codePointAt(0)! - y[i]!.codePointAt(0)!;
    return x.length - y.length;
  };
  files.sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return compareStrings(a[i]!, b[i]!);
    return a.length - b.length;
  });
  const h = createHash('sha256');
  let byteSize = 0;
  for (const f of files) {
    const abs = path.join(dir, ...f);
    h.update(`${f.join('/')}\t${await fileSha(abs)}\n`, 'utf8');
    byteSize += fs.statSync(abs).size;
  }
  return { manifestSha256: h.digest('hex'), fileCount: files.length, size: byteSize };
};

/** 目录的内容指纹：目录里每个文件（不进子目录，跳过 . 开头的）按文件名 UTF-8 字节排序，逐个把「名 \0 sha256 \n」喂进 sha256，取前 12 位 */
export const dirFingerprint = (dir: string) => {
  const names = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  const outer = createHash('sha256');
  const buf = Buffer.alloc(1 << 22);
  for (const name of names) {
    const inner = createHash('sha256');
    const fd = fs.openSync(path.join(dir, name), 'r');
    try {
      for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0; ) inner.update(buf.subarray(0, n));
    } finally {
      fs.closeSync(fd);
    }
    outer.update(`${name}\0${inner.digest('hex')}\n`);
  }
  return outer.digest('hex').slice(0, 12);
};

export const stagingDir = (pack: string) => dataPath('run', '暂存', 'terrain', pack);
export const versionDir = (pack: string, version: string) => path.join(terrainRoot(), pack, version);

/** 拿写入锁、新开暂存目录（上次中断留下的先删）；返回目录和放锁的函数 */
export const newStaging = (pack: string) => {
  const dir = stagingDir(pack);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const lockPath = `${dir}.写入.lock`;
  if (!tryAcquire(lockPath, config('主机'))) throw new Error(`地形包 ${pack} 正在被另一个进程（pid ${holderPid(lockPath) ?? '?'}）写，等它写完再跑`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir);
  return { dir, 放: () => releaseLock(lockPath) };
};

/** 暂存目录写完：算指纹、改名成 <根>/<包>/<版本>/（同样内容的版本已经有了就丢掉暂存）。根默认是数据根 terrain/，试做的包可以放别处（transcode --to）。返回版本和是不是新写的 */
export const release = (pack: string, dir: string, root = terrainRoot()) => {
  const fingerprint = dirFingerprint(dir);
  const dest = path.join(root, pack, fingerprint);
  const existed = fs.existsSync(dest);
  if (existed) fs.rmSync(dir, { recursive: true, force: true });
  else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(dir, dest);
  }
  return { version: fingerprint, 目录: dest, existed };
};

/** 裁过的包（世界/裁级/裁剪.ts，docs/世界.md「裁级」）：从完整包 from 按留表裁的，正式出片读它 */
export type TrimmedRecord = { version: string; from: string; keepSha256: string; method: string; fileCount: number; size: number; manifestSha256: string };
export type TerrainRecord = { version: string; oldPath?: string; source: string; license: string; visibility: string; note?: string; activePolicy?: string; policyFrom?: string; policies?: Record<string, TerrainRecord>; fileCount: number; size: number; manifestSha256: string; trimmed?: TrimmedRecord };
export const terrainTablePath = () => path.join(codeRoot(), 'assets', '地形版本.json');
export const readTerrainTable = () => JSON.parse(fs.readFileSync(terrainTablePath(), 'utf8')) as { note: string; pack: Record<string, TerrainRecord> };

/** 这一版应登记成什么（不写文件）；同一版已登记就原样返回旧条目 */
export const registerTerrainEntry = async (pack: string, version: string, defaults: Pick<TerrainRecord, 'source' | 'license' | 'visibility'> & { note?: string }): Promise<TerrainRecord> => {
  const prevEntry = readTerrainTable().pack[pack];
  if (prevEntry?.version === version) return prevEntry;
  const actual = await packManifest(versionDir(pack, version));
  return { version: version, source: defaults.source, license: prevEntry?.license ?? defaults.license, visibility: prevEntry?.visibility ?? defaults.visibility, ...(defaults.note ?? prevEntry?.note ? { note: defaults.note ?? prevEntry?.note } : {}), fileCount: actual.fileCount, size: actual.size, manifestSha256: actual.manifestSha256 };
};

/** 写进 assets/地形版本.json（键顺序保持，新包加在末尾）；返回原来登记的版本 */
export const registerTerrain = (pack: string, entry: TerrainRecord) => {
  const terrainTable = readTerrainTable();
  const existingVersion = terrainTable.pack[pack]?.version;
  terrainTable.pack[pack] = entry;
  fs.writeFileSync(terrainTablePath(), JSON.stringify(terrainTable, null, 2) + '\n');
  return existingVersion;
};

/** 正式口径只由登记项的 activePolicy 决定；试看用同名包的另一份完整/裁级版本，不改段声明。 */
type PolicyEntry<T> = { version: string; activePolicy?: string; policyFrom?: string; policies?: Record<string, T> };
export const selectTerrainPolicy = <T extends PolicyEntry<T>>(entry: T, policy: string): T => {
  if (policy === 'outside' || (!entry.policies && !entry.policyFrom && !entry.activePolicy)) return entry;
  const chosen = entry.policies?.[policy];
  if (!chosen) throw new Error(`缺模拟起级 ${policy} 的配套版本，请重烘底包和作品覆盖层`);
  return chosen;
};
/** 覆盖层跟随底包唯一的正式开关；试看也同时切换，不能把一种起级的覆盖块贴到另一种底包。 */
export const terrainPolicies = <T extends PolicyEntry<T>>(entries: Record<string, T>, trial?: number): Record<string, T> =>
  Object.fromEntries(Object.entries(entries).map(([name, entry]) => {
    const owner = entry.policyFrom ? entries[entry.policyFrom] : entry;
    if (!owner) throw Error(`${name} 缺少配套底包：${entry.policyFrom} 没在 assets/地形版本.json 登记版本`);
    return [name, selectTerrainPolicy(entry, String(trial ?? owner.activePolicy ?? 'outside'))];
  }));
