// 第 6、7 章旧段的 台词轨.tsx、配音/口型.ts 还从两份整表（资产 数据/配音/台词表、数据/配音/口型，旧 id 为键）取数据，按 旧名.tsv 换成新台词 id：
// anim voice use 拿它挡住换这些句子的成品（旧段不跟着变），句口型.test、台词句轨.test 拿它核对句模块和整表一样。旧段都改走句模块后和整表一起删（docs/待办.md）。
// 11-06 从 pipeline/适配器/旧项目/配音表.ts 挪来；生成句模块的 lip --从旧表、核对的 check --对旧表 一次性用完，删了。
import fs from 'node:fs';
import path from 'node:path';
import { 字节路径, type 资产锁 } from '../资产/资产锁.ts';

export type 旧台词行 = { 角色: string; 字: string; 合成?: string; 文件: string | null; 副本?: string; 时长: number; 开口: number; 有声长: number; 内心?: boolean };
export type 旧口型行 = { 文: string; 时长: number; 字: [string, number, number][]; 嘴: [number, string][] };
export type 旧配音 = { 旧id: string; 台词: 旧台词行; 口型?: 旧口型行 };

export const 旧表资产 = { 台词表: '数据/配音/台词表', 口型: '数据/配音/口型' } as const;

/** 旧名.tsv 的 台词 行：旧 id → 新 id（旧表就是这些句子的） */
export const 旧台词改名 = (作品根: string): Map<string, string> => {
  const 新id = new Map<string, string>();
  const 旧名 = path.join(作品根, '旧名.tsv');
  if (!fs.existsSync(旧名)) return 新id;
  for (const l of fs.readFileSync(旧名, 'utf8').split('\n')) {
    const [类别, 旧, 新] = l.split('\t');
    if (类别 === '台词' && 旧 && 新) 新id.set(旧, 新);
  }
  return 新id;
};

export const 读旧配音表 = (作品根: string, 锁: 资产锁, 数据根?: string): Map<string, 旧配音> => {
  const 读 = (id: string) => {
    const e = 锁[id];
    if (!e) throw new Error(`资产锁里没有 ${id}（旧段用的配音整表）`);
    return JSON.parse(fs.readFileSync(字节路径(e, 数据根), 'utf8')) as Record<string, unknown>;
  };
  const 台词表 = 读(旧表资产.台词表) as Record<string, 旧台词行>;
  const 口型 = 读(旧表资产.口型) as Record<string, 旧口型行>;
  const 新id = 旧台词改名(作品根);
  const r = new Map<string, 旧配音>();
  for (const [旧id, 行] of Object.entries(台词表)) r.set(新id.get(旧id) ?? 旧id, { 旧id, 台词: 行, ...(口型[旧id] ? { 口型: 口型[旧id] } : {}) });
  return r;
};
