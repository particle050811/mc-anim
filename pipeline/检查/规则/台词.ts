// 台词：作品的 台词.toml 的格式（开口秒、字幕位置）；cue 里的台词 id 都登记了；每句恰好开口一次（接上段的后半截不算）或标了 未用，
// 接上段的 cue 前面（本段或清单里上一段）得有它开口；
// 文本哈希对得上现在念的字（念，没写就是文本；只改字幕的写 念 = 原来的字）、成品 sha 对得上资产锁，口型和口型手修绑定的成品 sha 也对得上（配音一换就报过期，不靠人记得重跑）；
// 作品有 台词/ 目录（anim voice 的句模块）的，有配音的每句都要有句模块、跟得上表和成品、是工具写的原样（嘴能不能按字重算出来归 anim voice check，要跑 Python）。
// 没有台词表、段里也没有台词 cue 的作品不查。
import fs from 'node:fs';
import { readContent } from '../内容.ts';
import { findOldNameClashes, readOldNames } from '../旧名.ts';
import type { CheckReport, CheckContext } from '../上下文.ts';
import type { AssetLock } from '../../资产/资产锁.ts';
import { writeSentenceText, parseSentenceModule } from '../../配音/句模块.ts';
import { sentenceModuleIssues } from '../../配音/配音.ts';
import { textHash, voiceTextHash, type LineEntry } from '../../配音/台词表.ts';

export const lineTablePath = (c: CheckContext) => c.workPath('台词.toml');
export { textHash };

export const subtitlePositions = ['下', '思索上'];

export const readLineTable = (c: CheckContext, report?: CheckReport): LineEntry[] | null => {
  const path = lineTablePath(c);
  if (!c.exists(path)) return null;
  try {
    return ((c.readToml(path)!['台词'] ?? []) as LineEntry[]);
  } catch (e) {
    report?.错(`TOML 解析失败：${(e as Error).message.split('\n')[0]}`, path);
    return null;
  }
};

export const checkLines = async (c: CheckContext, report: CheckReport) => {
  const path = lineTablePath(c);
  const parsedContent = await readContent(c);
  if (!c.exists(path)) {
    const segmentsWithLines = '错误' in parsedContent ? [] : parsedContent.segments.filter((s) => s.definition?.声音?.some((cue) => cue.台词 !== undefined));
    if (segmentsWithLines.length) report.错(`没有 ${path}，${segmentsWithLines.map((s) => s.键).join('、')} 却有台词 cue`);
    else report.跳过.push(`没有 ${path}，段里也没有台词 cue`);
    return;
  }
  const lineTable = readLineTable(c, report);
  if (!lineTable) return;
  const oldName = readOldNames(c);
  const lockPair = c.assetLocks();
  const assetLock: AssetLock = { ...lockPair.作品, ...lockPair.共用 };
  const entryMap = new Map<string, LineEntry>();
  for (const t of lineTable) {
    const displayName = `台词「${String(t.id)}」`;
    if (typeof t.id !== 'string' || typeof t.角色 !== 'string' || typeof t.文本 !== 'string' || !t.id || !t.角色 || !t.文本) {
      report.错(`${displayName}：id、角色、文本都要写`, path);
      continue;
    }
    if (entryMap.has(t.id)) report.错(`${displayName} 重复`, path);
    entryMap.set(t.id, t);
    const m = /^(\d+)-([^-\s]+)-(\S+)$/.exec(t.id);
    if (!m) report.错(`${displayName}：id 要是 <章>-<角色>-<短名>`, path);
    else if (m[2] !== t.角色) report.错(`${displayName}：id 里的角色「${m[2]}」和 角色 字段「${t.角色}」不一致`, path);
    for (const x of findOldNameClashes(oldName, t.id)) report.错(`${displayName} 撞了旧名表第 ${x.行} 行的旧名（${x.类别}）：旧名永不复用`, path);
    if (t.未用 !== undefined && typeof t.未用 !== 'boolean') report.错(`${displayName}：未用 只能写 true 或 false`, path);
    if (t.字幕位置 !== undefined && !subtitlePositions.includes(t.字幕位置)) report.错(`${displayName}：字幕位置 只能是 ${subtitlePositions.join('、')}（不写是 下）`, path);
    if (t.念 !== undefined && (typeof t.念 !== 'string' || !t.念)) {
      report.错(`${displayName}：念 要写非空的字（交给 TTS、对口型的字）`, path);
      continue;
    }
    if (t.开口 !== undefined && !(typeof t.开口 === 'number' && Number.isFinite(t.开口) && t.开口 >= 0)) report.错(`${displayName}：开口 是配音文件里第几秒开口，要写不小于 0 的数`, path);
    if (t.配音 === undefined) {
      if (t.文本哈希 || t.成品sha || t.口型 || t.口型手修 || t.开口 !== undefined) report.错(`${displayName}：没写 配音，却写了 文本哈希/成品sha/口型/开口`, path);
      continue;
    }
    if (t.开口 === undefined) report.错(`${displayName}：有配音就要写 开口（配音文件里第几秒开口，cue 的帧对的是它）`, path);
    const lockEntry = assetLock[t.配音];
    if (!lockEntry) {
      report.错(`${displayName}：配音「${t.配音}」不在资产锁里（先登记、入库）`, path);
      continue;
    }
    if (t.文本哈希 !== voiceTextHash(t)) {
      report.错(`${displayName}：文本哈希 ${t.文本哈希 ?? '（没写）'} 和现在念的字（念，没写就是文本：${voiceTextHash(t)}）对不上：念的字改过，配音过期，要重配（anim voice gen 出候选、anim voice use 定稿）或把文本改回去；只改字幕、念法不变的写 念 = 原来的字`, path);
    }
    const fullSha = lockEntry.sha256;
    const shaPrefixMatches = (s: string | undefined) => typeof s === 'string' && s.length >= 12 && fullSha.startsWith(s);
    if (!shaPrefixMatches(t.成品sha)) report.错(`${displayName}：成品sha ${t.成品sha ?? '（没写）'} 和资产锁里 ${t.配音} 的 ${fullSha.slice(0, 12)} 对不上：配音换过，表没跟上`, path);
    for (const k of ['口型', '口型手修'] as const) {
      const v = t[k];
      if (v && !shaPrefixMatches(v.成品sha)) report.错(`${displayName}：${k} 是对着成品 ${v.成品sha ?? '（没写）'} 做的，现在的成品是 ${fullSha.slice(0, 12)}：配音换了，${k} 过期（anim voice lip）`, path);
    }
  }

  // 句模块（<作品根>/台词/<id>.ts）
  const lineDir = c.workPath('台词');
  if (c.exists(lineDir)) {
    const lineFileIds = new Set(fs.readdirSync(c.absPath(lineDir)).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => f.slice(0, -3)));
    for (const id of lineFileIds) if (!entryMap.has(id)) report.错(`${lineDir}/${id}.ts：${path} 里没有这一句（删掉，或把这句写回 ${path}）`, `${lineDir}/${id}.ts`);
    for (const t of entryMap.values()) {
      const f = `${lineDir}/${t.id}.ts`;
      const lockEntry = t.配音 === undefined ? undefined : assetLock[t.配音];
      if (!lockEntry) {
        if (lineFileIds.has(t.id)) report.错(`台词「${t.id}」没有可用的配音，却有句模块`, f);
        continue;
      }
      let sentence = null;
      if (lineFileIds.has(t.id)) {
        const text = c.读(f);
        try {
          sentence = parseSentenceModule(text, f);
        } catch (e) {
          report.错((e as Error).message, f);
          continue;
        }
        if (writeSentenceText(sentence) !== text) report.错(`句模块被手改过（改 ${path} 后 anim voice lip ${t.id}）`, f);
      }
      for (const x of sentenceModuleIssues(t, lockEntry.sha256.slice(0, 12), sentence)) report.错(`台词「${t.id}」：${x}`, lineFileIds.has(t.id) ? f : path);
    }
  }

  if ('错误' in parsedContent) return;
  const usedBy = new Map<string, string[]>();
  let prevSegOpenLines = new Set<string>();
  for (const s of parsedContent.segments) {
    if (s.章 === '核对') continue;
    const openedInSegment = new Set<string>();
    for (const cue of s.definition?.声音 ?? []) {
      if (cue.台词 === undefined) continue;
      if (!entryMap.has(cue.台词)) report.错(`${s.键} 第 ${cue.秒} 秒的台词「${cue.台词}」不在 ${path} 里`, s.段文件);
      if (cue.接上段) {
        // 只认本段或上一段真开口的（台词落点.ts 的 台词头们 不往前追两段）
        if (!openedInSegment.has(cue.台词) && !prevSegOpenLines.has(cue.台词)) report.错(`${s.键} 第 ${cue.秒} 秒的台词「${cue.台词}」标了 接上段，本段前面和清单里上一段都没有它开口`, s.段文件);
        continue;
      }
      openedInSegment.add(cue.台词);
      (usedBy.get(cue.台词) ?? usedBy.set(cue.台词, []).get(cue.台词)!).push(s.键);
    }
    prevSegOpenLines = openedInSegment;
  }
  for (const [id, t] of entryMap) {
    const segNames = usedBy.get(id) ?? [];
    if (t.未用 && segNames.length) report.错(`台词「${id}」标了 未用，却被 ${segNames.join('、')} 用到`, path);
    else if (!t.未用 && segNames.length === 0) report.错(`台词「${id}」没有段用到（不用了就标 未用 = true，或删掉并记进旧名表的 已删台词）`, path);
    else if (segNames.length > 1) report.错(`台词「${id}」在 ${segNames.join('、')} 开口了 ${segNames.length} 次（每句恰好开口一次，接着放的后半截标 接上段）`, path);
  }
};
