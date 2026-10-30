// anim extract --下载：jars.toml 里「根 = 数据」、写了「下载」和「sha256」的（官方映射这类不许再分发、本机自取的），按地址下到数据根并核 sha。
// 只下这一类：游戏目录、mc资源里的 jar 是游戏和启动器装的，不归 anim 管。下载走 curl（跟系统代理环境变量），先写临时名、sha256（有 sha1 也核）对上才改名。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { 跑出 } from '../环境/子进程.ts';
import type { jar登记, 取材清单 } from './清单.ts';

export type 下载项 = { id: string; 地址: string; 到: string; sha256: string; sha1?: string };
export type 下载结果 = { id: string; 到: string; 状态: '已有' | '下好' | '失败'; 说明?: string };

const 哈希 = (算法: 'sha256' | 'sha1', file: string) => crypto.createHash(算法).update(fs.readFileSync(file)).digest('hex');

/** 能自动下的：根是 数据，写了 下载 和 sha256 */
export const 能下载 = (j: jar登记) => j.根 === '数据' && !!j.下载 && !!j.sha256;

/** 要下的项：给了 id 就只看这些（不能自动下的报错），没给就是全部能自动下的 */
export const 下载清单 = (q: 取材清单, ids: readonly string[], 路径: (j: jar登记) => string): 下载项[] => {
  const 没有 = ids.filter((id) => !q.jars.has(id));
  if (没有.length) throw new Error(`jars.toml 里没有 ${没有.join('、')}`);
  const 选 = ids.length ? ids.map((id) => q.jars.get(id)!) : [...q.jars.values()].filter(能下载);
  const 不能 = 选.filter((j) => !能下载(j));
  if (不能.length) throw new Error(`${不能.map((j) => j.id).join('、')} 不能自动下（只下 根 = "数据"、写了 下载 和 sha256 的；游戏、模组的 jar 要装进游戏目录）`);
  return 选.map((j) => ({ id: j.id, 地址: j.下载!, 到: 路径(j), sha256: j.sha256!, ...(j.sha1 ? { sha1: j.sha1 } : {}) }));
};

export const curl下载 = (地址: string, 到: string) => {
  跑出(['curl', '-fsSL', '--retry', '3', '--connect-timeout', '20', '-o', 到, 地址]);
};

/** 逐项下：已有且 sha 对的跳过；已有但 sha 不对的不覆盖、记失败（人看一眼是哪来的） */
export const 下载 = (项们: readonly 下载项[], 取: (地址: string, 到: string) => void = curl下载): 下载结果[] =>
  项们.map((x) => {
    if (fs.existsSync(x.到)) {
      const sha = 哈希('sha256', x.到);
      return sha === x.sha256 ? { id: x.id, 到: x.到, 状态: '已有' as const } : { id: x.id, 到: x.到, 状态: '失败' as const, 说明: `已有的文件 sha256 是 ${sha.slice(0, 12)}，jars.toml 写的 ${x.sha256.slice(0, 12)}；没覆盖，确认后删掉再下` };
    }
    fs.mkdirSync(path.dirname(x.到), { recursive: true });
    const tmp = `${x.到}.下载中-${process.pid}`;
    try {
      取(x.地址, tmp);
      const sha = 哈希('sha256', tmp);
      if (sha !== x.sha256) return { id: x.id, 到: x.到, 状态: '失败' as const, 说明: `下到的 sha256 是 ${sha.slice(0, 12)}，jars.toml 写的 ${x.sha256.slice(0, 12)}` };
      if (x.sha1 && 哈希('sha1', tmp) !== x.sha1) return { id: x.id, 到: x.到, 状态: '失败' as const, 说明: 'sha256 对、sha1 对不上（jars.toml 两个 sha 写的不是同一个文件？）' };
      fs.renameSync(tmp, x.到);
      return { id: x.id, 到: x.到, 状态: '下好' as const };
    } catch (e) {
      return { id: x.id, 到: x.到, 状态: '失败' as const, 说明: (e as Error).message.split('\n')[0] };
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });
