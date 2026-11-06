// 台词落点：按清单顺序扫各段 段.ts 的声音 cue，台词 cue 换成全片输出帧、配音文件、要显示的字和断屏（给 字幕.ts 排时间）。
// cue 的秒是开口落在段内第几秒（同 engine/段/放法.ts），文件头 = 秒 − 开口秒；开口秒、字幕位置取 <作品根>/台词.toml 那条（字幕位置没写是 下）。
// 接上段的 cue（上一段说过来的后半截）照旧项目 台词落点.ts：跨段的另记一条 接上段，只拿来核对；同一段里接着放的不另记。
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import { 段长秒, type 段定义, type 台词cue } from '../../engine/段/段定义.ts';
import { 作品根 } from '../环境/作品.ts';
import type { 段信息 } from '../清单/清单.ts';
import type { 台词落点 } from './字幕.ts';
import { 断屏, type 字幕位置 } from './字幕卡.ts';

export type 台词条目 = { id: string; 角色: string; 文本: string; 配音?: string; 开口?: number; 字幕位置?: 字幕位置; 未用?: boolean };
export type 截位置 = { 段: 段信息; 全片起帧: number };
type 段声音 = Pick<段定义, '声音' | '秒'>;

export const 读台词表 = (file = path.join(作品根(), '台词.toml')): 台词条目[] =>
  fs.existsSync(file) ? (((parse(fs.readFileSync(file, 'utf8')) as { 台词?: 台词条目[] }).台词 ?? []) as 台词条目[]) : [];

/** 台词 id → 开口秒（<作品根>/台词.toml 的 开口，没写按 0：文件开头就开口） */
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

export type 台词头 = { cue: 台词cue; 开口秒: number; 头秒: number; 起秒: number };

/** 一段里每条台词 cue：开口落在段内第几秒（接上段的照前一截推）、文件头在段内第几秒、从段内第几秒起放（和 engine/段/放法.ts 的 段放法 一样）。
 *  开口先换到本段再减开口秒（不先算头再挪段） */
export const 台词头们 = (段: 段声音, 开口: (id: string) => number, 上一段?: 段声音, 严格 = true): 台词头[] => {
  const 上 = new Map<string, number>();
  if (上一段) for (const x of 台词头们(上一段, 开口, undefined, false)) 上.set(x.cue.台词, x.开口秒 - 段长秒(上一段));
  const 开口秒 = new Map<string, number>();
  const out: 台词头[] = [];
  for (const c of 段.声音 ?? []) {
    if (c.台词 === undefined) continue;
    const f = c.接上段 ? (开口秒.get(c.台词) ?? 上.get(c.台词)) : c.秒;
    if (f === undefined) {
      if (严格) throw new Error(`第 ${c.秒} 秒的台词「${c.台词}」标了 接上段，本段前面和清单里上一段都没有它开口`);
      continue;
    }
    开口秒.set(c.台词, f);
    const 头 = f - 开口(c.台词);
    out.push({ cue: c, 开口秒: f, 头秒: 头, 起秒: c.接上段 ? c.秒 : Math.max(0, 头) });
  }
  return out;
};

/** 截们的全片起帧、落点的帧都是 fps 帧的输出帧（带小数） */
export const 算台词落点 = (
  截们: 截位置[],
  台词表: 台词条目[],
  取配音: (资产id: string) => string,
  fps: number,
  上一段: (键: string) => 段声音 | undefined = () => undefined,
): 台词落点[] => {
  const 表 = new Map(台词表.map((t) => [t.id, t]));
  const 开口 = 开口表(台词表);
  const out: 台词落点[] = [];
  for (const { 段: s, 全片起帧 } of 截们) {
    const 查 = (id: string) => {
      const t = 表.get(id);
      if (!t) throw new Error(`${s.键} 的台词「${id}」不在 <作品根>/台词.toml 里`);
      if (!t.配音) throw new Error(`台词「${t.id}」还没配音（<作品根>/台词.toml 没写 配音），出不了字幕`);
      return t as 台词条目 & { 配音: string };
    };
    for (const c of s.段.声音 ?? []) if (c.台词 !== undefined) 查(c.台词);
    const 本段开口 = new Set<string>();
    for (const { cue, 头秒 } of 台词头们(s.段, 开口, 上一段(s.键))) {
      // 同一段里接着放的后半截和前半截是同一句，不另记
      if (cue.接上段 && 本段开口.has(cue.台词)) continue;
      本段开口.add(cue.台词);
      const t = 查(cue.台词);
      out.push({
        id: t.id,
        段: s.键,
        段内帧: cue.秒 * fps,
        文件头帧: 全片起帧 + 头秒 * fps,
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
