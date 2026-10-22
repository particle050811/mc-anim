// 台词落点：按清单顺序扫各段 段.ts 的声音 cue，台词 cue 换成全片帧、配音文件、要显示的字和断屏（给 字幕.ts 排时间）。
// cue 的帧是开口落在段内第几帧（同 engine/audio/台词轨.tsx），文件头 = 帧 − 开口秒 × fps；开口秒、字幕位置取 story/台词.toml 那条（字幕位置没写是 下）。
// 接上段的 cue（上一段说过来的后半截）照旧项目 台词落点.ts：跨段的另记一条 接上段，只拿来核对；同一段里接着放的不另记。
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import type { 段定义, 台词cue } from '../../content/段定义.ts';
import { 代码根 } from '../环境/路径.ts';
import { 读作品资产锁, 解析资产 } from '../资产/资产锁.ts';
import { 作品根 } from '../环境/作品.ts';
import type { 段信息 } from '../清单/清单.ts';
import type { 台词落点 } from './字幕.ts';
import { 断屏, type 字幕位置 } from './字幕卡.ts';

export type 台词条目 = { id: string; 角色: string; 文本: string; 配音?: string; 开口?: number; 字幕位置?: 字幕位置; 未用?: boolean };
export type 截位置 = { 段: 段信息; 全片起帧: number };
type 段声音 = Pick<段定义, '声音' | 'fps' | '帧数'>;

export const 读台词表 = (file = path.join(代码根(), 'story', '台词.toml')): 台词条目[] =>
  fs.existsSync(file) ? (((parse(fs.readFileSync(file, 'utf8')) as { 台词?: 台词条目[] }).台词 ?? []) as 台词条目[]) : [];

/** 台词 id → 开口秒（story/台词.toml 的 开口，没写按 0：文件开头就开口） */
export const 开口表 = (表: 台词条目[]) => {
  const m = new Map(表.map((t) => [t.id, t.开口 ?? 0]));
  return (id: string) => m.get(id) ?? 0;
};

/** 清单里的上一段（接上段的台词按它的开口算文件头，核对段不算）；全 = pipeline/清单 的 全部段() */
export const 上一段于 = (全: 段信息[]) => {
  const 片 = 全.filter((s) => s.章 !== '核对');
  return (键: string) => {
    const i = 片.findIndex((s) => s.键 === 键);
    return i > 0 ? 片[i - 1]!.段 : undefined;
  };
};

export type 台词头 = { cue: 台词cue; 开口帧: number; 头: number; 起帧: number };

/** 一段里每条台词 cue：开口落在段内第几帧（接上段的照前一截推）、文件头在段内第几帧（带小数）、从段内哪一帧起放（整帧）。
 *  开口帧先换到本段再减开口秒（不先算头再挪段），和旧 台词轨.tsx 的浮点数一样 */
export const 台词头们 = (段: 段声音, 开口: (id: string) => number, 上一段?: 段声音, 严格 = true): 台词头[] => {
  const 上 = new Map<string, number>();
  if (上一段) for (const x of 台词头们(上一段, 开口, undefined, false)) 上.set(x.cue.台词, x.开口帧 - 上一段.帧数);
  const 开口帧 = new Map<string, number>();
  const out: 台词头[] = [];
  for (const c of 段.声音 ?? []) {
    if (c.台词 === undefined) continue;
    const f = c.接上段 ? (开口帧.get(c.台词) ?? 上.get(c.台词)) : c.帧;
    if (f === undefined) {
      if (严格) throw new Error(`第 ${c.帧} 帧的台词「${c.台词}」标了 接上段，本段前面和清单里上一段都没有它开口`);
      continue;
    }
    开口帧.set(c.台词, f);
    const 头 = f - 开口(c.台词) * 段.fps;
    out.push({ cue: c, 开口帧: f, 头, 起帧: c.接上段 ? c.帧 : Math.max(0, Math.ceil(头 - 1e-6)) });
  }
  return out;
};

export const 算台词落点 = (
  截们: 截位置[],
  台词表: 台词条目[],
  取配音: (资产id: string) => string,
  上一段: (键: string) => 段声音 | undefined = () => undefined,
): 台词落点[] => {
  const 表 = new Map(台词表.map((t) => [t.id, t]));
  const 开口 = 开口表(台词表);
  const out: 台词落点[] = [];
  for (const { 段: s, 全片起帧 } of 截们) {
    const 查 = (id: string) => {
      const t = 表.get(id);
      if (!t) throw new Error(`${s.键} 的台词「${id}」不在 story/台词.toml 里`);
      if (!t.配音) throw new Error(`台词「${t.id}」还没配音（story/台词.toml 没写 配音），出不了字幕`);
      return t as 台词条目 & { 配音: string };
    };
    for (const c of s.段.声音 ?? []) if (c.台词 !== undefined) 查(c.台词);
    const 本段开口 = new Set<string>();
    for (const { cue, 头 } of 台词头们(s.段, 开口, 上一段(s.键))) {
      // 同一段里接着放的后半截和前半截是同一句，不另记
      if (cue.接上段 && 本段开口.has(cue.台词)) continue;
      本段开口.add(cue.台词);
      const t = 查(cue.台词);
      out.push({
        id: t.id,
        段: s.键,
        段内帧: cue.帧,
        文件头帧: 全片起帧 + 头,
        文件: 取配音(t.配音),
        配音: t.配音,
        字: t.文本,
        角色: t.角色,
        位置: t.字幕位置 ?? '下',
        屏们: 断屏(t.文本, s.段.宽 / s.段.高),
        ...(cue.接上段 ? { 接上段: true } : {}),
      });
    }
  }
  return out;
};

/** 资产 数据/音效/音效起音：文件名（音效 id 去掉 音效/ 加 .ogg）→ 文件开头静音几秒 */
export const 读音效起音 = (): ((资产id: string) => number) => {
  const 锁 = 读作品资产锁(作品根());
  if (!锁['数据/音效/音效起音']) return () => 0;
  const 表 = JSON.parse(fs.readFileSync(解析资产('数据/音效/音效起音', 锁).文件, 'utf8')) as Record<string, number>;
  return (id) => (id.startsWith('音效/') ? (表[`${id.slice('音效/'.length)}.ogg`] ?? 0) : 0);
};

/** 一条 cue 在段内哪一帧听得见：台词是开口；音效从文件头放的加上文件开头的静音（按速率换成画面时间），接着放的（入点秒 > 0）就是起放那一帧 */
export const 听见帧 = (c: NonNullable<段定义['声音']>[number], fps: number, 起音: (资产id: string) => number) =>
  c.台词 !== undefined ? c.帧 : c.帧 + (c.入点秒 ? 0 : (起音(c.资产) / (c.速率 ?? 1)) * fps);

/** 同步表：每条声音 cue 在全片第几帧听得见（接上段的台词不另列），再到成片声音里找 ±1 帧内的起音（旧项目 合成第六章.py 的 build_sync_table） */
export const 同步表 = (截们: 截位置[], 混音: Float32Array, fps: number, 起音: (资产id: string) => number = () => 0) => {
  const 每帧 = 48000 / fps;
  const n = Math.floor(混音.length / 每帧);
  const db = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let s = 0;
    for (let i = k * 每帧; i < (k + 1) * 每帧; i++) s += 混音[i]! * 混音[i]!;
    db[k] = 20 * Math.log10(Math.sqrt(s / 每帧) + 1e-9);
  }
  const 起音帧 = new Set<number>();
  for (let k = 1; k < n; k++) if (db[k]! - db[k - 1]! > 6 && db[k]! > -50) 起音帧.add(k);
  let 对上 = 0;
  const 行们 = 同步表行(截们, fps, 起音).map((r) => {
    const 中 = [...起音帧].filter((k) => Math.abs(k - r.帧) <= 1.5);
    if (中.length) 对上++;
    const 最近 = 中.sort((a, b) => Math.abs(a - r.帧) - Math.abs(b - r.帧))[0];
    return `${r.行}\t${最近 !== undefined ? `对上（第 ${最近} 帧）` : '没测到（被盖住或太轻）'}`;
  });
  return { tsv: ['段\t全局时间\t帧\t段内帧\t事件\t声音\t成片里起音（±1 帧内的能量跳变）', ...行们].join('\n') + '\n', 对上, 总: 行们.length };
};

/** 同步表除了起音那一列：按听见的全片帧排 */
export const 同步表行 = (截们: 截位置[], fps: number, 起音: (资产id: string) => number) =>
  截们
    .flatMap(({ 段: s, 全片起帧 }) =>
      (s.段.声音 ?? []).flatMap((c) => (c.台词 !== undefined && c.接上段 ? [] : [{ s, c, 段内帧: 听见帧(c, fps, 起音), 起: 全片起帧 }])),
    )
    .map((r) => ({ ...r, 帧: r.起 + r.段内帧 }))
    .sort((a, b) => a.帧 - b.帧)
    .map(({ s, c, 帧, 段内帧 }) => {
      const 秒 = 帧 / fps;
      const m = Math.floor(秒 / 60);
      const 事件 = c.台词 !== undefined ? `台词 ${c.台词}` : `${c.名}（${c.资产}）`;
      return { 帧, 行: `${s.键}\t${String(m).padStart(2, '0')}:${(秒 - m * 60).toFixed(3).padStart(6, '0')}\t${帧.toFixed(1)}\t${段内帧.toFixed(1)}\t${事件}\t${c.台词 ?? c.资产}` };
    });
