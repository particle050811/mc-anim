// 声音表要的音频数（时长秒、采样峰值 dBFS、积分响度 LUFS）：资产锁条目里有就用锁里的（assets add 入库时量的），
// 没有就现量：ffmpeg 的 ebur128（peak=sample）出峰值和响度，ffprobe 出时长；量过的按 sha 缓存在 <数据根>/cache/音频数/<sha>.json。
// 只给 anim cues 生成声音表用，数写进生成的文件（段指纹按那个文件算），这里本身不进指纹。
import fs from 'node:fs';
import path from 'node:path';
import type { 音频数 } from '../../engine/段/声音助手.ts';
import { 配置 } from '../环境/配置.ts';
import { 试跑 } from '../环境/子进程.ts';
import { 字节路径, type 锁条目 } from '../资产/资产锁.ts';

/** 锁条目里量好的可选字段（assets add 入库时写的；老条目没有） */
type 带数条目 = 锁条目 & Partial<音频数>;

const 两位 = (x: number) => Math.round(x * 100) / 100;

/** 解析 ffmpeg -af ebur128=peak=sample 的 stderr（只看最后的 Summary）和 ffprobe 的时长；静音的峰值是 -inf，不给 */
export const 解析量音 = (stderr: string, 时长文本: string): 音频数 => {
  const 汇总 = stderr.slice(stderr.lastIndexOf('Summary:'));
  const 数 = (re: RegExp) => {
    const m = re.exec(汇总)?.[1];
    return m === undefined || m === '-inf' ? undefined : Number(m);
  };
  const 时长 = Number(时长文本.trim());
  if (!时长文本.trim() || !Number.isFinite(时长) || 时长 <= 0) throw new Error(`ffprobe 给的时长不对：${JSON.stringify(时长文本)}`);
  const r: 音频数 = { 时长: Math.round(时长 * 1e6) / 1e6 };
  const 峰 = 数(/Peak:\s+(-?[\d.]+|-inf) dBFS/);
  const 响 = 数(/I:\s+(-?[\d.]+|-inf) LUFS/);
  if (峰 !== undefined && Number.isFinite(峰)) r.峰值 = 两位(峰);
  if (响 !== undefined && Number.isFinite(响)) r.响度 = 两位(响);
  return r;
};

export const 量音频文件 = (文件: string): 音频数 => {
  const r = 试跑([配置('ffmpeg'), '-hide_banner', '-nostats', '-nostdin', '-i', 文件, '-map', '0:a:0', '-af', 'ebur128=peak=sample', '-f', 'null', '-']);
  if (r.退出码 !== 0) throw new Error(`ffmpeg 量不了 ${文件}：${r.stderr.slice(-300)}`);
  const d = 试跑([配置('ffprobe'), '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', 文件]);
  if (d.退出码 !== 0) throw new Error(`ffprobe 量不了 ${文件}：${d.stderr.slice(-300)}`);
  return 解析量音(r.stderr, d.stdout);
};

/** 不量就知道的数：锁里有时长就用锁的，否则读量过的缓存；都没有给 undefined。根 不给就不读缓存 */
export const 已知音频数 = (条目: 锁条目 | undefined, 根?: string): 音频数 | undefined => {
  if (!条目) return undefined;
  const e = 条目 as 带数条目;
  if (typeof e.时长 === 'number') return { 时长: e.时长, ...(e.峰值 !== undefined ? { 峰值: e.峰值 } : {}), ...(e.响度 !== undefined ? { 响度: e.响度 } : {}) };
  if (!根) return undefined;
  const 缓存 = 缓存位置(条目, 根);
  return fs.existsSync(缓存) ? (JSON.parse(fs.readFileSync(缓存, 'utf8')) as 音频数) : undefined;
};

const 缓存位置 = (条目: 锁条目, 根: string) => path.join(根, 'cache', '音频数', `${条目.sha256}.json`);

/** 一件音频资产的数：锁里、缓存里有就用，否则现量（字节要在数据根里）并写缓存 */
export const 取音频数 = (id: string, 条目: 锁条目 | undefined, 根: string, 量 = 量音频文件): 音频数 => {
  if (!条目) throw new Error(`资产锁里没有「${id}」：先登记、anim assets add 入库`);
  const 有 = 已知音频数(条目, 根);
  if (有) return 有;
  const 文件 = 字节路径(条目, 根);
  if (!fs.existsSync(文件)) throw new Error(`「${id}」的字节不在数据根（${文件}），量不了时长、峰值：先 anim assets pull 或从别的机器同步`);
  const r = 量(文件);
  const 缓存 = 缓存位置(条目, 根);
  fs.mkdirSync(path.dirname(缓存), { recursive: true });
  const 临时 = `${缓存}.${process.pid}.tmp`;
  fs.writeFileSync(临时, JSON.stringify(r) + '\n', 'utf8');
  fs.renameSync(临时, 缓存);
  return r;
};
