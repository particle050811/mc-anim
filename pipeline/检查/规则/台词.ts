// 台词：作品/应力转动/台词.toml 的格式（开口秒、字幕位置）；cue 里的台词 id 都登记了；每句恰好开口一次（接上段的后半截不算）或标了 未用，
// 接上段的 cue 前面（本段或清单里上一段）得有它开口；
// 文本哈希对得上现在的文本、成品 sha 对得上资产锁，口型和口型手修绑定的成品 sha 也对得上（配音一换就报过期，不靠人记得重跑）。
import crypto from 'node:crypto';
import { 读内容 } from '../内容.ts';
import { 撞旧名, 读旧名 } from '../旧名.ts';
import type { 报告, 检查上下文 } from '../上下文.ts';
import type { 资产锁 } from '../../资产/资产锁.ts';

export const 台词表路径 = '作品/应力转动/台词.toml';
export const 文本哈希 = (文本: string) => crypto.createHash('sha256').update(文本, 'utf8').digest('hex').slice(0, 12);

export const 字幕位置们 = ['下', '思索上'];
export type 台词条目 = { id: string; 角色: string; 文本: string; 配音?: string; 开口?: number; 字幕位置?: string; 文本哈希?: string; 成品sha?: string; 口型?: { 成品sha?: string }; 口型手修?: { 成品sha?: string }; 未用?: boolean };

export const 读台词表 = (c: 检查上下文, 报?: 报告): 台词条目[] | null => {
  if (!c.存在(台词表路径)) {
    报?.错(`没有 ${台词表路径}`);
    return null;
  }
  try {
    return ((c.读toml(台词表路径)!['台词'] ?? []) as 台词条目[]);
  } catch (e) {
    报?.错(`TOML 解析失败：${(e as Error).message.split('\n')[0]}`, 台词表路径);
    return null;
  }
};

export const 台词 = async (c: 检查上下文, 报: 报告) => {
  const 表 = 读台词表(c, 报);
  if (!表) return;
  const 旧名 = 读旧名(c);
  const 锁 = (c.读json('assets/资产锁.json') ?? {}) as 资产锁;
  const 条目 = new Map<string, 台词条目>();
  const 位 = 台词表路径;
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
    if (t.文本哈希 !== 文本哈希(t.文本)) {
      报.错(`${名}：文本哈希 ${t.文本哈希 ?? '（没写）'} 和现在的文本（${文本哈希(t.文本)}）对不上：文本改过，配音过期，要重配（anim voice redo）或把文本改回去`, 位);
    }
    const 成品 = 锁条目.sha256;
    const 对 = (s: string | undefined) => typeof s === 'string' && s.length >= 12 && 成品.startsWith(s);
    if (!对(t.成品sha)) 报.错(`${名}：成品sha ${t.成品sha ?? '（没写）'} 和资产锁里 ${t.配音} 的 ${成品.slice(0, 12)} 对不上：配音换过，表没跟上`, 位);
    for (const k of ['口型', '口型手修'] as const) {
      const v = t[k];
      if (v && !对(v.成品sha)) 报.错(`${名}：${k} 是对着成品 ${v.成品sha ?? '（没写）'} 做的，现在的成品是 ${成品.slice(0, 12)}：配音换了，${k} 过期（anim voice lipsync）`, 位);
    }
  }

  const 内容 = await 读内容(c);
  if ('错误' in 内容) return;
  const 用到 = new Map<string, string[]>();
  let 上一段开口 = new Set<string>();
  for (const s of 内容.段们) {
    if (s.章 === '核对') continue;
    const 本段开口 = new Set<string>();
    for (const cue of s.定义?.声音 ?? []) {
      if (cue.台词 === undefined) continue;
      if (!条目.has(cue.台词)) 报.错(`${s.键} 第 ${cue.帧} 帧的台词「${cue.台词}」不在 ${台词表路径} 里`, s.段文件);
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
