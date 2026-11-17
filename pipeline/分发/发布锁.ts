// 挂 GitHub Release 发的字节的锁 <作品根>/发布锁.json（anim assets pack 生成，人不手改；见 docs/决策/0006-挂Release发字节.md）：
// 仓库、标签和这一版的附件，每个附件记名字、sha256、大小，和里面是什么（store/ 的一批字节，或一个地形包的一个版本）。
// 这里只读锁、查数据根还缺什么（film 这些命令开头提示要不要 anim assets pull）；打包、下载在 发布.ts。
import fs from 'node:fs';
import path from 'node:path';

export const releaseLockName = '发布锁.json';

export type Attachment = {
  name: string;
  sha256: string;
  size: number;
  /** 一批 store/ 字节：sha256 */
  bytes?: string[];
  /** 同一个 tar 里 私有/ 库的字节（可见性已公开、库没搬的，docs/决策/0017-全部公开.md）：sha256 */
  privateLibBytes?: string[];
  /** 一个地形包：解开是 terrain/<包>/<版本>/ 下的文件。backup：裁过了的包的完整包，只当备份，anim assets pull 默认不下（--full 才下，docs/世界.md「裁级」） */
  terrain?: { pack: string; version: string; backup?: true };
};
export type ReleaseLock = { repo: string; label: string; attachments: Attachment[] };

export const releaseLockPath = (workRoot: string) => path.join(workRoot, releaseLockName);

export const readReleaseLock = (workRoot: string): ReleaseLock | undefined => {
  const f = releaseLockPath(workRoot);
  if (!fs.existsSync(f)) return undefined;
  return JSON.parse(fs.readFileSync(f, 'utf8')) as ReleaseLock;
};

export const writeReleaseLock = (releaseLock: ReleaseLock, workRoot: string) => fs.writeFileSync(releaseLockPath(workRoot), JSON.stringify(releaseLock, null, 2) + '\n', 'utf8');

export const terrainDir = (dataRoot: string, pack: string, version: string) => path.join(dataRoot, 'terrain', pack, version);

/** 这个附件的东西数据根里还缺：字节缺几件，地形包整个目录不在；完整包的备份不给 full 不算缺 */
export const missingAttachmentCount = (a: Attachment, dataRoot: string, o: { full?: boolean } = {}): number => {
  if (a.terrain) return (a.terrain.backup && !o.full) || fs.existsSync(terrainDir(dataRoot, a.terrain.pack, a.terrain.version)) ? 0 : 1;
  const missingIn = (storage: string, shas: string[] = []) => shas.filter((sha) => !fs.existsSync(path.join(dataRoot, storage, sha.slice(0, 2), sha))).length;
  return missingIn('store', a.bytes) + missingIn('私有', a.privateLibBytes);
};

/** 有发布锁、数据根又缺它的东西时打一行（film、still、studio 开头）；不自动下：地形包上 GB */
export const hintMissingRelease = (workRoot: string, dataRoot: string) => {
  const releaseLock = readReleaseLock(workRoot);
  if (!releaseLock) return;
  const missing = releaseLock.attachments.filter((a) => missingAttachmentCount(a, dataRoot) > 0);
  if (!missing.length) return;
  const totalBytes = missing.reduce((s, a) => s + a.size, 0);
  console.error(`!! 数据根还缺这部作品挂 Release 发的 ${missing.length} 个附件（${(totalBytes / 1e9).toFixed(2)} GB）：先 anim assets pull，不然用到的段渲不了`);
};
