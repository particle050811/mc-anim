// anim assets measure：给早先入库、锁里还没有 时长/峰值/响度 的音频条目补上这几个可选字段。
// 只补缺的字段，已有的数、sha256、大小、库、后缀一个不动（指纹只认 sha，补了不让段过期）；字节不在本机的（多半是私有的）跳过并报件数。
// 量法和入库、anim cues 现量同一个函数（音频量.ts 的 量音频数）。
import fs from 'node:fs';
import { 字节路径, type 资产锁, type 锁条目 } from './资产锁.ts';
import { 量音频数, 音频后缀, type 音频元数据 } from './音频量.ts';

const 字段 = ['时长', '峰值', '响度'] as const;

export const 是音频条目 = (e: 锁条目) => 音频后缀.has(e.后缀.toLowerCase());
/** 缺这几个字段里任何一个的音频条目；静音的量不出峰值，下次还会被挑出来重量（量一次几十毫秒，不另记） */
export const 缺音频元数据 = (e: 锁条目) => 是音频条目(e) && 字段.some((k) => e[k] === undefined);

export type 补量结果 = {
  锁: 资产锁;
  音频: number;
  缺: string[];
  补了: string[];
  没字节: string[];
  量不出: { id: string; 原因: string }[];
  /** 量完还缺字段的（静音没有峰值、太短没有积分响度） */
  仍缺: { id: string; 字段: string[] }[];
};

export type 补量选项 = { 数据根: string; 只查?: boolean; 量?: (文件: string) => 音频元数据; 进度?: (已: number, 共: number) => void };

/** 只把量出来、条目里原来没有的字段并进去 */
export const 并缺的 = (e: 锁条目, 量: 音频元数据): 锁条目 => {
  const 加 = Object.fromEntries(字段.filter((k) => e[k] === undefined && 量[k] !== undefined).map((k) => [k, 量[k]]));
  return { ...e, ...加 };
};

/** 返回新的锁对象（不改传进来的）；只查 时不量、不改，只报缺多少、字节在不在 */
export const 补音频元数据 = (锁: 资产锁, o: 补量选项): 补量结果 => {
  const 量 = o.量 ?? 量音频数;
  const 新: 资产锁 = { ...锁 };
  const r: 补量结果 = { 锁: 新, 音频: 0, 缺: [], 补了: [], 没字节: [], 量不出: [], 仍缺: [] };
  const ids = Object.keys(锁).sort();
  for (const id of ids) if (是音频条目(锁[id]!)) r.音频++;
  r.缺 = ids.filter((id) => 缺音频元数据(锁[id]!));
  r.缺.forEach((id, i) => {
    const e = 锁[id]!;
    const 文件 = 字节路径(e, o.数据根);
    if (!fs.existsSync(文件)) return void r.没字节.push(id);
    if (o.只查) return;
    o.进度?.(i + 1, r.缺.length);
    let 数: 音频元数据;
    try {
      数 = 量(文件);
    } catch (err) {
      return void r.量不出.push({ id, 原因: (err as Error).message.split('\n')[0]! });
    }
    const 后 = 并缺的(e, 数);
    if (字段.some((k) => 后[k] !== e[k])) {
      新[id] = 后;
      r.补了.push(id);
    }
    const 还缺 = 字段.filter((k) => 后[k] === undefined);
    if (还缺.length) r.仍缺.push({ id, 字段: [...还缺] });
  });
  return r;
};
