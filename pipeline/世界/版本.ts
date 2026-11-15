// 地形包的版本：<数据根>/terrain/<包>/<版本>/，版本是内容指纹（目录指纹，照旧项目 工具/导入/区段包版本.mjs），发布后不再改，旧版本不删。
// 烘焙先写进暂存目录（<数据根>/run/暂存/terrain/<包>，同一个包同时只许一个进程写，拿 <暂存>.写入.lock），写完 发布：算指纹、改名成版本目录。
// 登记进 assets/地形版本.json 另是一步（登记）：声明了这个包的段会过期，别的段不受影响（地形项只记段声明的包，见 指纹/指纹.ts）。
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { terrainRoot, dataPath, config } from '../环境/配置.ts';
import { codeRoot } from '../环境/路径.ts';
import { packManifest } from '../检查/规则/资产.ts';
import { holderPid, releaseLock, tryAcquire } from '../闸/锁.ts';

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

/** 暂存目录写完：算指纹、改名成 <包>/<版本>/（同样内容的版本已经有了就丢掉暂存）。返回版本和是不是新写的 */
export const release = (pack: string, dir: string) => {
  const fingerprint = dirFingerprint(dir);
  const dest = versionDir(pack, fingerprint);
  const existed = fs.existsSync(dest);
  if (existed) fs.rmSync(dir, { recursive: true, force: true });
  else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(dir, dest);
  }
  return { 版本: fingerprint, 目录: dest, existed };
};

export type TerrainRecord = { 版本: string; 旧路径?: string; 来源: string; 许可: string; 可见性: string; 说明?: string; 文件数: number; 大小: number; 清单sha256: string };
export const terrainTablePath = () => path.join(codeRoot(), 'assets', '地形版本.json');
export const readTerrainTable = () => JSON.parse(fs.readFileSync(terrainTablePath(), 'utf8')) as { 说明: string; 包: Record<string, TerrainRecord> };

/** 这一版应登记成什么（不写文件）；同一版已登记就原样返回旧条目 */
export const registerTerrainEntry = async (pack: string, version: string, defaults: Pick<TerrainRecord, '来源' | '许可' | '可见性'> & { 说明?: string }): Promise<TerrainRecord> => {
  const prevEntry = readTerrainTable().包[pack];
  if (prevEntry?.版本 === version) return prevEntry;
  const actual = await packManifest(versionDir(pack, version));
  return { 版本: version, 来源: defaults.来源, 许可: prevEntry?.许可 ?? defaults.许可, 可见性: prevEntry?.可见性 ?? defaults.可见性, ...(defaults.说明 ?? prevEntry?.说明 ? { 说明: defaults.说明 ?? prevEntry?.说明 } : {}), 文件数: actual.文件数, 大小: actual.大小, 清单sha256: actual.清单sha256 };
};

/** 写进 assets/地形版本.json（键顺序保持，新包加在末尾）；返回原来登记的版本 */
export const registerTerrain = (pack: string, entry: TerrainRecord) => {
  const terrainTable = readTerrainTable();
  const existingVersion = terrainTable.包[pack]?.版本;
  terrainTable.包[pack] = entry;
  fs.writeFileSync(terrainTablePath(), JSON.stringify(terrainTable, null, 2) + '\n');
  return existingVersion;
};
