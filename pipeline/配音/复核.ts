// 配音候选的复核（py/anim_py/配音/复核.py 量，这里排请求、收结果、写报告）：结果并进候选旁的 .json（复核 字段），一句的全部候选汇成 <候选目录>/复核.md。
// 现成品（台词.toml 的 配音）也量一遍放在报告里当对照：分数高低只有和现在用着的那版比才有意义。
import fs from 'node:fs';
import path from 'node:path';

/** 一项复核的结果，形状由 Python 那边的项决定；报告只认下面这几个键 */
export type 复核结果 = Record<string, unknown>;
export type 一条 = { 名: string; wav: string; 复核: Record<string, 复核结果> };
export type 复核请求 = { wav: string; id: string; 念: string; 语言: string; 语气: string; 参考音频: string };
/** Python 复核 动作的返回：每项要么有 结果（和请求一一对应），要么 缺 */
export type 复核回包 = Record<string, { 结果?: 复核结果[]; 缺?: string[]; 描述?: unknown }>;

/** 一句的候选：候选目录下的 wav，不含 use 出的 成品-*.wav，按文件名排 */
export const 列候选 = (目录: string): string[] =>
  fs.existsSync(目录) ? fs.readdirSync(目录).filter((f) => /\.wav$/i.test(f) && !f.startsWith('成品-')).sort().map((f) => path.join(目录, f)) : [];

/** 回包按请求拆回每个 wav：{wav: {项名: 结果}}；缺东西的项记 { 缺 } */
export const 拆回包 = (请求们: readonly 复核请求[], 回: 复核回包): Map<string, Record<string, 复核结果>> => {
  const m = new Map<string, Record<string, 复核结果>>(请求们.map((q) => [q.wav, {}]));
  for (const [项, r] of Object.entries(回)) {
    if (r.结果 && r.结果.length !== 请求们.length) throw new Error(`复核项 ${项} 返回 ${r.结果.length} 条，请求 ${请求们.length} 条`);
    请求们.forEach((q, i) => (m.get(q.wav)![项] = r.结果 ? r.结果[i]! : { 缺: r.缺 ?? [] }));
  }
  return m;
};

/** 把复核结果并进候选旁的 .json（gen 写的候选说明）；没有说明的（手放进来的 wav）只写 复核 */
export const 写进候选说明 = (wav: string, 复核: Record<string, 复核结果>) => {
  const f = wav.replace(/\.wav$/i, '.json');
  const 旧 = fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, unknown>) : {};
  fs.writeFileSync(f, JSON.stringify({ ...旧, 复核: { ...(旧.复核 as object | undefined), ...复核 } }, null, 1) + '\n');
};

const 数 = (x: unknown) => (typeof x === 'number' ? String(x) : '—');
const 格 = (r: 复核结果 | undefined, 键: string) => (!r ? '—' : Array.isArray(r.缺) ? '缺' : 数(r[键]));

/** 一句的复核报告（Markdown）：一行一个候选，现成品放最后当对照 */
export const 复核报告文本 = (o: { id: string; 念: string; 语气: string; 条们: readonly 一条[]; 对照?: 一条; 时间: string }): string => {
  const 行们 = [...o.条们, ...(o.对照 ? [o.对照] : [])];
  const 提示们 = 行们.flatMap((t) =>
    Object.entries(t.复核).flatMap(([项, r]) => [
      ...(typeof r.提示 === 'string' ? [`- ${t.名}（${项}）：${r.提示}`] : []),
      ...(Array.isArray(r.缺) ? [`- ${t.名}（${项}）没跑：${(r.缺 as string[]).join('；')}`] : []),
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
    ...行们.map((t) => `| ${t.名} | ${格(t.复核.音色, '相似度')} | ${格(t.复核.起伏, '基频中位Hz')} | ${格(t.复核.起伏, '音高跨度st')} | ${格(t.复核.起伏, '音高标准差st')} | ${格(t.复核.起伏, '响度跨度dB')} |`),
    ...(提示们.length ? ['', ...提示们] : []),
    '',
  ].join('\n');
};
