// 台词：作品的 台词.toml 的格式（开口秒、字幕位置）；cue 里的台词 id 都登记了；每句恰好开口一次（接上段的后半截不算）或标了 未用，
// 接上段的 cue 前面（本段或清单里上一段）得有它开口；
// 文本哈希对得上现在念的字（念，没写就是文本；只改字幕的写 念 = 原来的字）、成品 sha 对得上资产锁，口型和口型手修绑定的成品 sha 也对得上（配音一换就报过期，不靠人记得重跑）；
// 作品有 台词/ 目录（anim voice 的句模块）的，有配音的每句都要有句模块、跟得上表和成品、是工具写的原样（嘴能不能按字重算出来归 anim voice check，要跑 Python）。
// 没有台词表、段里也没有台词 cue 的作品不查。
import fs from 'node:fs';
import { 读内容 } from '../内容.ts';
import { 撞旧名, 读旧名 } from '../旧名.ts';
import type { 报告, 检查上下文 } from '../上下文.ts';
import type { 资产锁 } from '../../资产/资产锁.ts';
import { 写句模块文本, 解析句模块 } from '../../配音/句模块.ts';
import { 句模块问题 } from '../../配音/配音.ts';
import { 文本哈希, 配音文本哈希 } from '../../配音/台词表.ts';

export const 台词表路径 = (c: 检查上下文) => c.作品路径('台词.toml');
export { 文本哈希 };

export const 字幕位置们 = ['下', '思索上'];
export type 台词条目 = { id: string; 角色: string; 文本: string; 念?: string; 配音?: string; 开口?: number; 字幕位置?: string; 文本哈希?: string; 成品sha?: string; 口型?: { 成品sha?: string }; 口型手修?: { 成品sha?: string }; 未用?: boolean };

export const 读台词表 = (c: 检查上下文, 报?: 报告): 台词条目[] | null => {
  const 位 = 台词表路径(c);
  if (!c.存在(位)) return null;
  try {
    return ((c.读toml(位)!['台词'] ?? []) as 台词条目[]);
  } catch (e) {
    报?.错(`TOML 解析失败：${(e as Error).message.split('\n')[0]}`, 位);
    return null;
  }
};

export const 台词 = async (c: 检查上下文, 报: 报告) => {
  const 位 = 台词表路径(c);
  const 内容 = await 读内容(c);
  if (!c.存在(位)) {
    const 用台词 = '错误' in 内容 ? [] : 内容.段们.filter((s) => s.定义?.声音?.some((cue) => cue.台词 !== undefined));
    if (用台词.length) 报.错(`没有 ${位}，${用台词.map((s) => s.键).join('、')} 却有台词 cue`);
    else 报.跳过.push(`没有 ${位}，段里也没有台词 cue`);
    return;
  }
  const 表 = 读台词表(c, 报);
  if (!表) return;
  const 旧名 = 读旧名(c);
  const 两锁 = c.资产锁();
  const 锁: 资产锁 = { ...两锁.作品, ...两锁.共用 };
  const 条目 = new Map<string, 台词条目>();
  for (const t of 表) {
    const 名 = `台词「${String(t.id)}」`;
    if (typeof t.id !== 'string' || typeof t.角色 !== 'string' || typeof t.文本 !== 'string' || !t.id || !t.角色 || !t.文本) {
      报.错(`${名}：id、角色、文本都要写`, 位);
      continue;
    }
    if (条目.has(t.id)) 报.错(`${名} 重复`, 位);
    条目.set(t.id, t);
    const m = /^(\d+)-([^-\s]+)-(\S+)$/.exec(t.id);
    if (!m) 报.错(`${名}：id 要是 <章>-<角色>-<短名>`, 位);
    else if (m[2] !== t.角色) 报.错(`${名}：id 里的角色「${m[2]}」和 角色 字段「${t.角色}」不一致`, 位);
    for (const x of 撞旧名(旧名, t.id)) 报.错(`${名} 撞了旧名表第 ${x.行} 行的旧名（${x.类别}）：旧名永不复用`, 位);
    if (t.未用 !== undefined && typeof t.未用 !== 'boolean') 报.错(`${名}：未用 只能写 true 或 false`, 位);
    if (t.字幕位置 !== undefined && !字幕位置们.includes(t.字幕位置)) 报.错(`${名}：字幕位置 只能是 ${字幕位置们.join('、')}（不写是 下）`, 位);
    if (t.念 !== undefined && (typeof t.念 !== 'string' || !t.念)) {
      报.错(`${名}：念 要写非空的字（交给 TTS、对口型的字）`, 位);
      continue;
    }
    if (t.开口 !== undefined && !(typeof t.开口 === 'number' && Number.isFinite(t.开口) && t.开口 >= 0)) 报.错(`${名}：开口 是配音文件里第几秒开口，要写不小于 0 的数`, 位);
    if (t.配音 === undefined) {
      if (t.文本哈希 || t.成品sha || t.口型 || t.口型手修 || t.开口 !== undefined) 报.错(`${名}：没写 配音，却写了 文本哈希/成品sha/口型/开口`, 位);
      continue;
    }
    if (t.开口 === undefined) 报.错(`${名}：有配音就要写 开口（配音文件里第几秒开口，cue 的帧对的是它）`, 位);
    const 锁条目 = 锁[t.配音];
    if (!锁条目) {
      报.错(`${名}：配音「${t.配音}」不在资产锁里（先登记、入库）`, 位);
      continue;
    }
    if (t.文本哈希 !== 配音文本哈希(t)) {
      报.错(`${名}：文本哈希 ${t.文本哈希 ?? '（没写）'} 和现在念的字（念，没写就是文本：${配音文本哈希(t)}）对不上：念的字改过，配音过期，要重配（anim voice gen 出候选、anim voice use 定稿）或把文本改回去；只改字幕、念法不变的写 念 = 原来的字`, 位);
    }
    const 成品 = 锁条目.sha256;
    const 对 = (s: string | undefined) => typeof s === 'string' && s.length >= 12 && 成品.startsWith(s);
    if (!对(t.成品sha)) 报.错(`${名}：成品sha ${t.成品sha ?? '（没写）'} 和资产锁里 ${t.配音} 的 ${成品.slice(0, 12)} 对不上：配音换过，表没跟上`, 位);
    for (const k of ['口型', '口型手修'] as const) {
      const v = t[k];
      if (v && !对(v.成品sha)) 报.错(`${名}：${k} 是对着成品 ${v.成品sha ?? '（没写）'} 做的，现在的成品是 ${成品.slice(0, 12)}：配音换了，${k} 过期（anim voice lip）`, 位);
    }
  }

  // 句模块（<作品根>/台词/<id>.ts）
  const 句目录 = c.作品路径('台词');
  if (c.存在(句目录)) {
    const 有 = new Set(fs.readdirSync(c.绝对(句目录)).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => f.slice(0, -3)));
    for (const id of 有) if (!条目.has(id)) 报.错(`${句目录}/${id}.ts：${位} 里没有这一句（删掉，或把这句写回 ${位}）`, `${句目录}/${id}.ts`);
    for (const t of 条目.values()) {
      const f = `${句目录}/${t.id}.ts`;
      const 锁条目 = t.配音 === undefined ? undefined : 锁[t.配音];
      if (!锁条目) {
        if (有.has(t.id)) 报.错(`台词「${t.id}」没有可用的配音，却有句模块`, f);
        continue;
      }
      let 句 = null;
      if (有.has(t.id)) {
        const 文本 = c.读(f);
        try {
          句 = 解析句模块(文本, f);
        } catch (e) {
          报.错((e as Error).message, f);
          continue;
        }
        if (写句模块文本(句) !== 文本) 报.错(`句模块被手改过（改 ${位} 后 anim voice lip ${t.id}）`, f);
      }
      for (const x of 句模块问题(t, 锁条目.sha256.slice(0, 12), 句)) 报.错(`台词「${t.id}」：${x}`, 有.has(t.id) ? f : 位);
    }
  }

  if ('错误' in 内容) return;
  const 用到 = new Map<string, string[]>();
  let 上一段开口 = new Set<string>();
  for (const s of 内容.段们) {
    if (s.章 === '核对') continue;
    const 本段开口 = new Set<string>();
    for (const cue of s.定义?.声音 ?? []) {
      if (cue.台词 === undefined) continue;
      if (!条目.has(cue.台词)) 报.错(`${s.键} 第 ${cue.帧} 帧的台词「${cue.台词}」不在 ${位} 里`, s.段文件);
      if (cue.接上段) {
        // 只认本段或上一段真开口的（台词落点.ts 的 台词头们 不往前追两段）
        if (!本段开口.has(cue.台词) && !上一段开口.has(cue.台词)) 报.错(`${s.键} 第 ${cue.帧} 帧的台词「${cue.台词}」标了 接上段，本段前面和清单里上一段都没有它开口`, s.段文件);
        continue;
      }
      本段开口.add(cue.台词);
      (用到.get(cue.台词) ?? 用到.set(cue.台词, []).get(cue.台词)!).push(s.键);
    }
    上一段开口 = 本段开口;
  }
  for (const [id, t] of 条目) {
    const 段 = 用到.get(id) ?? [];
    if (t.未用 && 段.length) 报.错(`台词「${id}」标了 未用，却被 ${段.join('、')} 用到`, 位);
    else if (!t.未用 && 段.length === 0) 报.错(`台词「${id}」没有段用到（不用了就标 未用 = true，或删掉并记进旧名表的 已删台词）`, 位);
    else if (段.length > 1) 报.错(`台词「${id}」在 ${段.join('、')} 开口了 ${段.length} 次（每句恰好开口一次，接着放的后半截标 接上段）`, 位);
  }
};
