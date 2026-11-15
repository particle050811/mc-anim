// 配音候选的复核（py/anim_py/配音/复核.py 量，这里排请求、收结果、写报告）：结果并进候选旁的 .json（复核 字段），一句的全部候选汇成 <候选目录>/复核.md。
// 现成品（台词.toml 的 配音）也量一遍放在报告里当对照：分数高低只有和现在用着的那版比才有意义。
import fs from 'node:fs';
import path from 'node:path';

/** 一项复核的结果，形状由 Python 那边的项决定；报告只认下面这几个键 */
export type ReviewResult = Record<string, unknown>;
export type ReviewItem = { 名: string; wav: string; 复核: Record<string, ReviewResult> };
export type ReviewRequest = { wav: string; id: string; 念: string; 语言: string; 语气: string; 参考音频: string };
/** Python 复核 动作的返回：每项要么有 结果（和请求一一对应），要么 缺 */
export type ReviewReply = Record<string, { 结果?: ReviewResult[]; 缺?: string[]; 描述?: unknown }>;

/** 一句的候选：候选目录下的 wav，不含 use 出的 成品-*.wav，按文件名排 */
export const listCandidates = (dir: string): string[] =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.wav$/i.test(f) && !f.startsWith('成品-')).sort().map((f) => path.join(dir, f)) : [];

/** 回包按请求拆回每个 wav：{wav: {项名: 结果}}；缺东西的项记 { 缺 } */
export const unpackReply = (requests: readonly ReviewRequest[], reply: ReviewReply): Map<string, Record<string, ReviewResult>> => {
  const m = new Map<string, Record<string, ReviewResult>>(requests.map((q) => [q.wav, {}]));
  for (const [checkItem, r] of Object.entries(reply)) {
    if (r.结果 && r.结果.length !== requests.length) throw new Error(`复核项 ${checkItem} 返回 ${r.结果.length} 条，请求 ${requests.length} 条`);
    requests.forEach((q, i) => (m.get(q.wav)![checkItem] = r.结果 ? r.结果[i]! : { 缺: r.缺 ?? [] }));
  }
  return m;
};

/** 把复核结果并进候选旁的 .json（gen 写的候选说明）；没有说明的（手放进来的 wav）只写 复核 */
export const writeCandidateNote = (wav: string, review: Record<string, ReviewResult>) => {
  const f = wav.replace(/\.wav$/i, '.json');
  const existing = fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, unknown>) : {};
  fs.writeFileSync(f, JSON.stringify({ ...existing, 复核: { ...(existing.复核 as object | undefined), ...review } }, null, 1) + '\n');
};

const numText = (x: unknown) => (typeof x === 'number' ? String(x) : '—');
const cellText = (r: ReviewResult | undefined, propKey: string) => (!r ? '—' : Array.isArray(r.缺) ? '缺' : numText(r[propKey]));

/** 一句的复核报告（Markdown）：一行一个候选，现成品放最后当对照 */
export const reviewReportText = (o: { id: string; 念: string; 语气: string; items: readonly ReviewItem[]; compareRow?: ReviewItem; 时间: string }): string => {
  const entries = [...o.items, ...(o.compareRow ? [o.compareRow] : [])];
  const hints = entries.flatMap((t) =>
    Object.entries(t.复核).flatMap(([checkItem, r]) => [
      ...(typeof r.提示 === 'string' ? [`- ${t.名}（${checkItem}）：${r.提示}`] : []),
      ...(Array.isArray(r.缺) ? [`- ${t.名}（${checkItem}）没跑：${(r.缺 as string[]).join('；')}`] : []),
    ]),
  );
  return [
    `# ${o.id} 候选复核`,
    '',
    `念：${o.念}`,
    ...(o.语气 ? [`语气：${o.语气}`] : []),
    `时间：${o.时间}（anim voice review 重出）`,
    '',
    '音色是和角色参考音频的 Resemblyzer 相似度（旧项目 FireRed 原参考克隆的在 0.85～0.94）；音高跨度、响度跨度越小越像棒读。只是辅助，挑哪个以试听为准。',
    '',
    '| 候选 | 音色相似度 | 基频中位 Hz | 音高跨度 st | 音高标准差 st | 响度跨度 dB |',
    '|---|---|---|---|---|---|',
    ...entries.map((t) => `| ${t.名} | ${cellText(t.复核.音色, '相似度')} | ${cellText(t.复核.起伏, '基频中位Hz')} | ${cellText(t.复核.起伏, '音高跨度st')} | ${cellText(t.复核.起伏, '音高标准差st')} | ${cellText(t.复核.起伏, '响度跨度dB')} |`),
    ...(hints.length ? ['', ...hints] : []),
    '',
  ].join('\n');
};
