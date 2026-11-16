// 按 jars.toml 的 id 取一个 jar 的本机路径：游戏环境里「到」那里有就用（核 sha256），没有又登记了「下载」就下到 <数据根>/cache/jars/<文件>，
// 核过 sha256 才用（对不上删掉报错）。只下公开地址；Mojang 客户端这类要从版本清单取的不在这里管。
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dataPath } from '../环境/配置.ts';
import { fileSha256 } from '../资产/资产锁.ts';
import { jarPath } from './提取.ts';
import { readManifest, type SourcingManifest } from './清单.ts';

export const fetchJar = async (id: string, o: { sourcingManifest?: SourcingManifest; download?: boolean; 说?: (s: string) => void } = {}): Promise<string> => {
  const q = o.sourcingManifest ?? readManifest();
  const j = q.jars.get(id) as (ReturnType<typeof q.jars.get> & { download?: string; file?: string }) | undefined;
  if (!j) throw new Error(`sourcing/jars.toml 里没有 ${id}`);
  const localJar = jarPath(q, id);
  const shaMatches = (f: string) => !j.sha256 || fileSha256(f) === j.sha256;
  if (fs.existsSync(localJar)) {
    if (!shaMatches(localJar)) throw new Error(`${localJar} 的 sha256 和 jars.toml 登记的 ${id} 对不上`);
    return localJar;
  }
  const cachedPath = dataPath('cache', 'jars', j.file ?? path.basename(j.dest));
  if (fs.existsSync(cachedPath) && shaMatches(cachedPath)) return cachedPath;
  if (!j.download || o.download === false) throw new Error(`没有 ${localJar}${j.download ? '' : '，jars.toml 也没登记下载地址'}`);
  if (!j.sha256) throw new Error(`jars.toml 的 ${id} 没写 sha256，不自动下载`);
  o.说?.(`没有 ${localJar}，从 ${j.download} 下载到 ${cachedPath}`);
  const r = await fetch(j.download);
  if (!r.ok) throw new Error(`下载 ${j.download} 失败：HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const sha = createHash('sha256').update(buf).digest('hex');
  if (sha !== j.sha256) throw new Error(`下载的 ${id} sha256 是 ${sha}，jars.toml 登记的是 ${j.sha256}，没用`);
  fs.mkdirSync(path.dirname(cachedPath), { recursive: true });
  fs.writeFileSync(`${cachedPath}.tmp`, buf);
  fs.renameSync(`${cachedPath}.tmp`, cachedPath);
  return cachedPath;
};
