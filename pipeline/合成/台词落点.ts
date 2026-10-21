// 台词落点：按清单顺序扫各段 段.ts 的声音 cue，台词 cue 换成全片帧、配音文件、要显示的字和断屏（给 字幕.ts 排时间）。
// cue 的帧是开口落在段内第几帧（同 engine/audio/台词轨.tsx），文件头 = 帧 − 开口秒 × fps；开口秒取资产 数据/配音/台词表 里旧 id 那条
// （新旧 id 对照 docs/旧名.tsv，不在表里的按 0：文件开头就开口）。字幕位置取 story/台词.toml 那条的 字幕位置，没写是 下。
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { 代码根 } from '../环境/路径.ts';
import { 读资产锁, 解析资产 } from '../资产/资产锁.ts';
import type { 段信息 } from '../清单/清单.ts';
import type { 台词落点 } from './字幕.ts';
import { 断屏, type 字幕位置 } from './字幕卡.ts';

export type 台词条目 = { id: string; 角色: string; 文本: string; 配音?: string; 字幕位置?: 字幕位置 };
export type 截位置 = { 段: 段信息; 全片起帧: number };

export const 读台词表 = (file = path.join(代码根(), 'story', '台词.toml')): 台词条目[] =>
  fs.existsSync(file) ? (((parse(fs.readFileSync(file, 'utf8')) as { 台词?: 台词条目[] }).台词 ?? []) as 台词条目[]) : [];

/** 新台词 id → 开口秒 */
export const 读开口表 = (): Map<string, number> => {
  const 锁 = 读资产锁();
  if (!锁['数据/配音/台词表']) return new Map();
  const 旧表 = JSON.parse(fs.readFileSync(解析资产('数据/配音/台词表', 锁).文件, 'utf8')) as Record<string, { 开口?: number }>;
  const out = new Map<string, number>();
  for (const line of fs.readFileSync(path.join(代码根(), 'docs', '旧名.tsv'), 'utf8').split('\n')) {
    const [类, 旧, 新] = line.split('\t');
    if (类 === '台词' && 旧 && 新 && 旧表[旧]?.开口 !== undefined) out.set(新, 旧表[旧]!.开口!);
  }
  return out;
};

export const 算台词落点 = (
  截们: 截位置[],
  台词表: 台词条目[],
  取配音: (资产id: string) => string,
  开口表: Map<string, number>,
): 台词落点[] => {
  const 表 = new Map(台词表.map((t) => [t.id, t]));
  const out: 台词落点[] = [];
  for (const { 段: s, 全片起帧 } of 截们) {
    for (const cue of s.段.声音 ?? []) {
      if (cue.台词 === undefined) continue;
      const t = 表.get(cue.台词);
      if (!t) throw new Error(`${s.键} 第 ${cue.帧} 帧的台词「${cue.台词}」不在 story/台词.toml 里`);
      if (!t.配音) throw new Error(`台词「${t.id}」还没配音（story/台词.toml 没写 配音），出不了字幕`);
      const 开口 = 开口表.get(t.id) ?? 0;
      out.push({
        id: t.id,
        段: s.键,
        段内帧: cue.帧,
        文件头帧: 全片起帧 + cue.帧 - 开口 * s.段.fps,
        文件: 取配音(t.配音),
        字: t.文本,
        角色: t.角色,
        位置: t.字幕位置 ?? '下',
        屏们: 断屏(t.文本, s.段.宽 / s.段.高),
      });
    }
  }
  return out;
};

/** 同步表：每条声音 cue 在全片第几帧，再到成片声音里找 ±1 帧内的起音（旧项目 合成第六章.py 的 build_sync_table） */
export const 同步表 = (截们: 截位置[], 混音: Float32Array, fps: number) => {
  const 每帧 = 48000 / fps;
  const n = Math.floor(混音.length / 每帧);
  const db = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let s = 0;
    for (let i = k * 每帧; i < (k + 1) * 每帧; i++) s += 混音[i]! * 混音[i]!;
    db[k] = 20 * Math.log10(Math.sqrt(s / 每帧) + 1e-9);
  }
  const 起音 = new Set<number>();
  for (let k = 1; k < n; k++) if (db[k]! - db[k - 1]! > 6 && db[k]! > -50) 起音.add(k);
  const 行 = ['段\t全局时间\t帧\t段内帧\t事件\t声音\t成片里起音（±1 帧内的能量跳变）'];
  let 对上 = 0;
  let 总 = 0;
  const rows = 截们.flatMap(({ 段: s, 全片起帧 }) => (s.段.声音 ?? []).map((c) => ({ s, c, 帧: 全片起帧 + c.帧 }))).sort((a, b) => a.帧 - b.帧);
  for (const { s, c, 帧 } of rows) {
    总++;
    const 中 = [...起音].filter((k) => Math.abs(k - 帧) <= 1.5);
    if (中.length) 对上++;
    const 秒 = 帧 / fps;
    const m = Math.floor(秒 / 60);
    const 最近 = 中.sort((a, b) => Math.abs(a - 帧) - Math.abs(b - 帧))[0];
    行.push(
      `${s.键}\t${String(m).padStart(2, '0')}:${(秒 - m * 60).toFixed(3).padStart(6, '0')}\t${帧}\t${c.帧}\t${c.台词 !== undefined ? '台词 ' + c.台词 : '声音 ' + c.资产}\t${c.台词 ?? c.资产}\t${最近 !== undefined ? `对上（第 ${最近} 帧）` : '没测到（被盖住或太轻）'}`,
    );
  }
  return { tsv: 行.join('\n') + '\n', 对上, 总 };
};
