// anim extract --下载：jars.toml 里「根 = 数据」、写了「下载」和「sha256」的（官方映射这类不许再分发、本机自取的），按地址下到数据根并核 sha。
// 只下这一类：游戏目录、mc资源里的 jar 是游戏和启动器装的，不归 anim 管。下载走 curl（跟系统代理环境变量），先写临时名、sha256（有 sha1 也核）对上才改名。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { runCapture } from '../环境/子进程.ts';
import type { JarRecord, SourcingManifest } from './清单.ts';

export type DownloadItem = { id: string; url: string; 到: string; sha256: string; sha1?: string };
export type DownloadResult = { id: string; 到: string; 状态: '已有' | '下好' | '失败'; 说明?: string };

const hash = (algorithm: 'sha256' | 'sha1', file: string) => crypto.createHash(algorithm).update(fs.readFileSync(file)).digest('hex');

/** 能自动下的：根是 数据，写了 下载 和 sha256 */
export const canDownload = (j: JarRecord) => j.根 === '数据' && !!j.下载 && !!j.sha256;

/** 要下的项：给了 id 就只看这些（不能自动下的报错），没给就是全部能自动下的 */
export const downloadList = (q: SourcingManifest, ids: readonly string[], destPath: (j: JarRecord) => string): DownloadItem[] => {
  const missing = ids.filter((id) => !q.jars.has(id));
  if (missing.length) throw new Error(`jars.toml 里没有 ${missing.join('、')}`);
  const chosen = ids.length ? ids.map((id) => q.jars.get(id)!) : [...q.jars.values()].filter(canDownload);
  const cannotDownload = chosen.filter((j) => !canDownload(j));
  if (cannotDownload.length) throw new Error(`${cannotDownload.map((j) => j.id).join('、')} 不能自动下（只下 根 = "数据"、写了 下载 和 sha256 的；游戏、模组的 jar 要装进游戏目录）`);
  return chosen.map((j) => ({ id: j.id, url: j.下载!, 到: destPath(j), sha256: j.sha256!, ...(j.sha1 ? { sha1: j.sha1 } : {}) }));
};

export const curlDownload = (url: string, destPath: string) => {
  runCapture(['curl', '-fsSL', '--retry', '3', '--connect-timeout', '20', '-o', destPath, url]);
};

/** 逐项下：已有且 sha 对的跳过；已有但 sha 不对的不覆盖、记失败（人看一眼是哪来的） */
export const download = (items: readonly DownloadItem[], download: (url: string, destPath: string) => void = curlDownload): DownloadResult[] =>
  items.map((x) => {
    if (fs.existsSync(x.到)) {
      const sha = hash('sha256', x.到);
      return sha === x.sha256 ? { id: x.id, 到: x.到, 状态: '已有' as const } : { id: x.id, 到: x.到, 状态: '失败' as const, 说明: `已有的文件 sha256 是 ${sha.slice(0, 12)}，jars.toml 写的 ${x.sha256.slice(0, 12)}；没覆盖，确认后删掉再下` };
    }
    fs.mkdirSync(path.dirname(x.到), { recursive: true });
    const tmp = `${x.到}.下载中-${process.pid}`;
    try {
      download(x.url, tmp);
      const sha = hash('sha256', tmp);
      if (sha !== x.sha256) return { id: x.id, 到: x.到, 状态: '失败' as const, 说明: `下到的 sha256 是 ${sha.slice(0, 12)}，jars.toml 写的 ${x.sha256.slice(0, 12)}` };
      if (x.sha1 && hash('sha1', tmp) !== x.sha1) return { id: x.id, 到: x.到, 状态: '失败' as const, 说明: 'sha256 对、sha1 对不上（jars.toml 两个 sha 写的不是同一个文件？）' };
      fs.renameSync(tmp, x.到);
      return { id: x.id, 到: x.到, 状态: '下好' as const };
    } catch (e) {
      return { id: x.id, 到: x.到, 状态: '失败' as const, 说明: (e as Error).message.split('\n')[0] };
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });
