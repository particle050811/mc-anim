// 按 jars.toml 的 id 取一个 jar 的本机路径：游戏环境里「到」那里有就用（核 sha256），没有又登记了「下载」就下到 <数据根>/cache/jars/<文件>，
// 核过 sha256 才用（对不上删掉报错）。只下公开地址；Mojang 客户端这类要从版本清单取的不在这里管。
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { 数据路径 } from '../环境/配置.ts';
import { 文件sha256 } from '../资产/资产锁.ts';
import { jar路径 } from './提取.ts';
import { 读清单, type 取材清单 } from './清单.ts';

export const 取jar = async (id: string, o: { 清单?: 取材清单; 下载?: boolean; 说?: (s: string) => void } = {}): Promise<string> => {
  const q = o.清单 ?? 读清单();
  const j = q.jars.get(id) as (ReturnType<typeof q.jars.get> & { 下载?: string; 文件?: string }) | undefined;
  if (!j) throw new Error(`sourcing/jars.toml 里没有 ${id}`);
  const 本 = jar路径(q, id);
  const 对 = (f: string) => !j.sha256 || 文件sha256(f) === j.sha256;
  if (fs.existsSync(本)) {
    if (!对(本)) throw new Error(`${本} 的 sha256 和 jars.toml 登记的 ${id} 对不上`);
    return 本;
  }
  const 缓存 = 数据路径('cache', 'jars', j.文件 ?? path.basename(j.到));
  if (fs.existsSync(缓存) && 对(缓存)) return 缓存;
  if (!j.下载 || o.下载 === false) throw new Error(`没有 ${本}${j.下载 ? '' : '，jars.toml 也没登记下载地址'}`);
  if (!j.sha256) throw new Error(`jars.toml 的 ${id} 没写 sha256，不自动下载`);
  o.说?.(`没有 ${本}，从 ${j.下载} 下载到 ${缓存}`);
  const r = await fetch(j.下载);
  if (!r.ok) throw new Error(`下载 ${j.下载} 失败：HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const sha = createHash('sha256').update(buf).digest('hex');
  if (sha !== j.sha256) throw new Error(`下载的 ${id} sha256 是 ${sha}，jars.toml 登记的是 ${j.sha256}，没用`);
  fs.mkdirSync(path.dirname(缓存), { recursive: true });
  fs.writeFileSync(`${缓存}.tmp`, buf);
  fs.renameSync(`${缓存}.tmp`, 缓存);
  return 缓存;
};
