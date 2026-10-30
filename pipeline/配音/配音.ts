// anim voice 的核心：一句台词从 台词.toml 的一行，经 配音成品（资产锁）、测量、字的起止、嘴，到句模块。命令行在 命令.ts，这里的函数不碰命令行参数。
import fs from 'node:fs';
import path from 'node:path';
import type { 台词句 } from '../../engine/audio/台词句.ts';
import type { 资产锁 } from '../资产/资产锁.ts';
import { 念的字, 文本哈希, type 台词行 } from './台词表.ts';

export type 测量 = { 开口: number; 有声长: number; 时长: number };
export type 字们 = [string, number, number][];

/** wav 头里的秒数（帧数 ÷ 采样率，3 位），同 Python wave 的 getnframes() / getframerate() */
export const wav秒数 = (buf: Buffer): number => {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('不是 wav');
  let 采样率 = 0;
  let 块对齐 = 0;
  for (let p = 12; p + 8 <= buf.length; ) {
    const 名 = buf.toString('ascii', p, p + 4);
    const 长 = buf.readUInt32LE(p + 4);
    if (名 === 'fmt ') {
      采样率 = buf.readUInt32LE(p + 12);
      块对齐 = buf.readUInt16LE(p + 20);
    } else if (名 === 'data') {
      if (!采样率) throw new Error('wav 的 data 在 fmt 前面');
      const 数据长 = Math.min(长, buf.length - p - 8);
      return Math.round((Math.floor(数据长 / 块对齐) / 采样率) * 1000) / 1000;
    }
    p += 8 + 长 + (长 % 2);
  }
  throw new Error('wav 里没有 data 块');
};

/** 成品sha：资产锁里 配音 那一项的 sha 前 12 位 */
export const 成品sha = (行: 台词行, 锁: 资产锁) => (行.配音 ? 锁[行.配音]?.sha256.slice(0, 12) : undefined);

/** 手修能不能用：写了 字、绑的成品就是现在这版 */
export const 手修可用 = (行: 台词行, 现成品: string | undefined) => {
  const h = 行.口型手修;
  if (!h?.字?.length) return false;
  return Boolean(现成品 && h.成品sha && 现成品.startsWith(h.成品sha.slice(0, 12)));
};

/** 一句的问题（空 = 配音、句模块都跟得上 台词.toml 和资产锁）；只看数据，不跑 Python。anim voice list 用；anim check 的台词规则自己查表的那几项，只借 句模块问题 */
export const 句问题 = (行: 台词行, 锁: 资产锁, 句: 台词句 | null): string[] => {
  if (!行.配音) return 句 ? ['没写 配音，却有句模块（删掉 台词/<id>.ts，或先 anim voice use）'] : [];
  const sha = 成品sha(行, 锁);
  if (!sha) return [`配音「${行.配音}」不在资产锁里`];
  const 问题: string[] = [];
  if (行.文本哈希 !== 文本哈希(行.文本)) 问题.push('文本改过、配音没重出（anim voice gen 再 use；只改字幕不改念法的，写 念 = 原来的字）');
  if (!行.成品sha || !sha.startsWith(行.成品sha)) 问题.push(`台词.toml 的 成品sha ${行.成品sha ?? '（没写）'} 和资产锁 ${sha} 对不上`);
  if (行.口型手修?.字 && !手修可用(行, sha)) 问题.push(`口型手修 是对着成品 ${行.口型手修.成品sha ?? '（没写）'} 标的，现在是 ${sha}：重标或删掉`);
  return [...问题, ...句模块问题(行, sha, 句)];
};

/** 句模块跟不跟得上 台词.toml 这一句和现在的成品（sha = 资产锁里成品的 sha 前 12 位） */
export const 句模块问题 = (行: 台词行, sha: string, 句: 台词句 | null): string[] => {
  if (!句) return ['没有句模块（anim voice lip）'];
  const 问题: string[] = [];
  if (句.id !== 行.id) 问题.push(`句模块里的 id 是 ${句.id}`);
  if (句.成品sha !== sha) 问题.push(`句模块是对着成品 ${句.成品sha} 做的，现在是 ${sha}（anim voice lip）`);
  if (句.配音 !== 行.配音) 问题.push(`句模块的 配音 ${句.配音} 和 台词.toml 的 ${行.配音} 不同`);
  if (句.角色 !== 行.角色) 问题.push(`句模块的 角色 ${句.角色} 和 台词.toml 的 ${行.角色} 不同`);
  if (句.念 !== 念的字(行)) 问题.push('念的字改了，句模块没跟上（anim voice lip）');
  if (句.开口 !== 行.开口) 问题.push(`句模块的 开口 ${句.开口} 和 台词.toml 的 ${行.开口} 不同`);
  if (Boolean(句.手修) !== 手修可用(行, sha)) 问题.push(句.手修 ? '句模块用的手修已经不能用了（anim voice lip）' : '有可用的 口型手修，句模块没用它（anim voice lip）');
  const 口型sha = 行.口型?.成品sha;
  if (!口型sha || !sha.startsWith(口型sha)) 问题.push(`台词.toml 的 口型 成品sha ${口型sha ?? '（没写）'} 不是 ${sha}（anim voice lip 会写）`);
  return 问题;
};

export const 拼句 = (行: 台词行, o: { 成品sha: string; 测量: 测量; 文件秒数: number; 字: 字们; 手修: boolean; 嘴: [number, string][] }): 台词句 => ({
  id: 行.id,
  角色: 行.角色,
  念: 念的字(行),
  配音: 行.配音!,
  成品sha: o.成品sha,
  开口: o.测量.开口,
  有声长: o.测量.有声长,
  时长: o.测量.时长,
  文件秒数: o.文件秒数,
  ...(o.手修 ? { 手修: true as const } : {}),
  字: o.字,
  嘴: o.嘴,
});

/** 候选和中间稿：<数据根>/run/草稿/配音/<作品>/<台词 id>/（Agent、人试听用，不进 Git、不进预览/） */
export const 候选目录 = (数据根: string, 作品: string, id: string) => path.join(数据根, 'run', '草稿', '配音', 作品, id);

/** 候选旁边的说明（gen 写、use 读）：后端、种子、参考，用来写资产表的 来源 */
export type 候选说明 = { 后端: string; 种子: number; 参考: string; 参数: Record<string, unknown>; 念: string; 时间: string };
export const 读候选说明 = (wav: string): 候选说明 | null => {
  const f = wav.replace(/\.wav$/i, '.json');
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as 候选说明) : null;
};
