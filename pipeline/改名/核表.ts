// 核表：查拼名模型交回的「行号 → 新名」表（批次/出/批NN-页N.tsv），在 apply 之前把格式、撞名、叫法不一挑出来。
// 只读表和扫描结果，不碰代码；指向对不对、有没有新诊断还是 apply 不写盘那一遍说了算。
// 用法见 main.ts check。查的项目和级别：
//   错：缺行/多余/格式、非法标识符或保留字、模块顶层或同一类型属性里两组撞名、黑名单形状、整名就是核心词却没用对照表的译法
//   警告：大小写风格、遮住全局名、局部可能撞名、复合词里核心词没按对照表、同一中文名一词多译、可疑序号后缀
import fs from 'node:fs';
import path from 'node:path';
import { badNewName } from './工程.ts';
import { loadGlobals, loadPythonNames, type GlobalNames, type PythonNames } from './核表词.ts';

export type Group = {
  id: string;
  name: string;
  kind: string;
  kinds?: string[];
  exported?: boolean;
  flags?: Record<string, unknown>;
  aliases?: string[];
  decl?: { file: string; line: number; col: number };
};

export type Row = { key: string; groupId: string; name: string; newName: string; note: string; where: string };
export type Level = '错' | '警告';
export type Issue = { level: Level; type: string; key: string; name: string; newName: string; detail: string };
export type GlossaryEntry = { zh: string; en: string[]; cls: '领域' | '通用' | '上下文' | '专名' };

export type Inputs = {
  groups: Map<string, Group>;
  /** 批次行号 → 组 id */
  keys: Map<string, string>;
  /** 每个输出表：路径、内容、该交哪些行号（认不出页号就是 undefined，不查缺行） */
  outputs: { file: string; text: string; expected?: string[] }[];
  /** 规则.tsv：组 id → 新名，不该再出现在输出里，但参与撞名 */
  rules: Map<string, string>;
  glossary: GlossaryEntry[];
};

export const isPython = (g: Group) => !!g.decl?.file.endsWith('.py');

const tsvLines = (text: string) =>
  text
    .split('\n')
    .map((l, i) => ({ l: l.replace(/\r$/, ''), n: i + 1 }))
    .filter(({ l }) => l.trim() && !l.startsWith('#'));

export const readGroups = (files: string[]): Map<string, Group> => {
  const m = new Map<string, Group>();
  for (const f of files)
    for (const l of fs.readFileSync(f, 'utf8').split('\n'))
      if (l.trim()) {
        const g = JSON.parse(l) as Group;
        m.set(g.id, g);
      }
  return m;
};

export const parseGlossary = (text: string): GlossaryEntry[] =>
  tsvLines(text).map(({ l }) => {
    const [zh, en, cls] = l.split('\t');
    return { zh: zh!.trim(), en: (en ?? '').split('|').map((s) => s.trim()).filter((s) => s && s !== '-'), cls: (cls?.trim() ?? '上下文') as GlossaryEntry['cls'] };
  });

/** 批次目录里的 批NN.ids.tsv 全读进来（行号 → 组 id），再按输出文件名「批NN-页N.tsv」算出该交的行号 */
export const loadInputs = (opts: { outputs: string[]; groups: string[]; batchDir: string; glossary?: string; rules?: string; pageSize?: number }): Inputs => {
  const keys = new Map<string, string>();
  const byBatch = new Map<string, string[]>();
  for (const f of fs.readdirSync(opts.batchDir)) {
    const m = /^批(\d+)\.ids\.tsv$/.exec(f);
    if (!m) continue;
    const list: string[] = [];
    for (const { l } of tsvLines(fs.readFileSync(path.join(opts.batchDir, f), 'utf8'))) {
      const [k, id] = l.split('\t');
      keys.set(k!, id!);
      list.push(k!);
    }
    byBatch.set(m[1]!, list);
  }
  const size = opts.pageSize ?? 250;
  const outputs = opts.outputs.map((file) => {
    const m = /批(\d+)-页(\d+)\.tsv$/.exec(path.basename(file));
    const list = m ? byBatch.get(m[1]!) : undefined;
    const p = m ? Number(m[2]) : 0;
    return { file, text: fs.readFileSync(file, 'utf8'), expected: list?.slice((p - 1) * size, p * size) };
  });
  const rulesFile = opts.rules ?? path.join(opts.batchDir, '规则.tsv');
  const rules = new Map<string, string>();
  if (fs.existsSync(rulesFile))
    for (const { l } of tsvLines(fs.readFileSync(rulesFile, 'utf8'))) {
      const [id, name] = l.split('\t');
      rules.set(id!, name!);
    }
  const glossFile = opts.glossary ?? path.join(opts.batchDir, '对照表.tsv');
  const glossary = fs.existsSync(glossFile) ? parseGlossary(fs.readFileSync(glossFile, 'utf8')) : [];
  return { groups: readGroups(opts.groups), keys, outputs, rules, glossary };
};

const TS_LOCAL = new Set(['局部变量', '参数', '类型参数', '标签']);
const TS_PROPERTY = new Set(['属性', '方法', '访问器', '未解析属性']);
const TS_TYPE = new Set(['类型', '接口', '类型参数', '类']);
const PY_LOCAL = new Set(['局部变量', '参数']);
const PY_KEY = new Set(['成员', '字符串键']);

/** 局部的（局部变量、参数，和挂在函数链下的声明）：撞名、对照表只报警告 */
export const isLocal = (g: Group): boolean => {
  if (isPython(g)) return PY_LOCAL.has(g.kind) || /@\d+$/.test(g.id);
  if (TS_LOCAL.has(g.kind)) return true;
  if (TS_PROPERTY.has(g.kind)) return false;
  const chain = g.id.split('#')[1] ?? '';
  return chain.includes('.');
};

const CAMEL = /^_?[a-z][A-Za-z0-9]*$/;
const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
const UPPER = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;
const SNAKE = /^_*[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

/** 按种类该用的大小写：TS 类型和组件 PascalCase、常数可 UPPER_SNAKE、其余 camelCase；Python 照 PEP 8 */
const styles = (g: Group): [RegExp[], string] => {
  const k = g.kind;
  if (isPython(g)) {
    if (k === '类') return [[PASCAL], 'PascalCase'];
    if (k === '字符串键') return [[CAMEL, SNAKE], 'camelCase 或 snake_case'];
    if (k === '模块变量') return [[SNAKE, UPPER], 'snake_case 或 UPPER_SNAKE'];
    if (k === '导入别名') return [[CAMEL, SNAKE, PASCAL, UPPER], '标识符'];
    return [[SNAKE], 'snake_case'];
  }
  if (TS_TYPE.has(k) || k === 'JSX 组件' || g.flags?.jsxComponent) return [[PASCAL], 'PascalCase'];
  if (['导入别名', '导出别名', '其他', '无声明'].includes(k)) return [[CAMEL, PASCAL, UPPER], '标识符'];
  if (k === '变量' || TS_PROPERTY.has(k)) return [[CAMEL, UPPER], 'camelCase 或 UPPER_SNAKE'];
  return [[CAMEL], 'camelCase'];
};

// 黑名单形状（用户 11-15 的反例：a/b/x1/she/thing/data2/temp）
const VAGUE = /^(?:she|he|him|her|it|thing|things|stuff|temp|tmp|foo|bar|obj|val)\d*$/i;
const VAGUE_NUMBERED = /^(?:data|info|item|value|thing|temp|tmp|obj|arr|list)\d+$/i;
// 数字本身是名字一部分的技术词（vec3、sha1、base64、utf8、log2…）
const TECH_DIGITS = /(?:vec|mat|sha|base|utf|int|uint|float|log|atan|mp|md|h|ipv|rgba?|x|ivec|uvec)\d+$/i;
const ZH_NUMBER = /[\d〇零一二三四五六七八九十两百千]/;

type Words = { globals: GlobalNames; python: PythonNames };
let wordsCache: Words | undefined;
const words = (): Words => (wordsCache ??= { globals: loadGlobals(), python: loadPythonNames() });

/** 单个新名本身的问题：合法性、关键字、全局名、大小写、黑名单形状、序号后缀 */
export const checkName = (g: Group, n: string): { level: Level; type: string; detail: string }[] => {
  const out: { level: Level; type: string; detail: string }[] = [];
  const w = words();
  const binding = !TS_PROPERTY.has(g.kind) && !PY_KEY.has(g.kind);
  if (isPython(g)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) return [{ level: '错', type: '非法标识符', detail: '不是 ASCII 标识符' }];
    if (w.python.keywords.has(n) && g.kind !== '字符串键') out.push({ level: '错', type: '关键字', detail: 'Python 关键字' });
    if (binding && w.python.builtins.has(n)) out.push({ level: '警告', type: '全局名', detail: '遮住 Python 内置名' });
  } else {
    const bad = badNewName(n);
    if (bad === '不是 ASCII 标识符') return [{ level: '错', type: '非法标识符', detail: bad }];
    if (bad) out.push({ level: binding ? '错' : '警告', type: '关键字', detail: binding ? bad : `${bad}（属性能用，但简写 { 名 } 会坏）` });
    // 上下文关键字（type、of、override…）当名字没问题，只有这三个在 ES 模块的严格模式里不能绑定
    else if (binding && /^(?:await|arguments|eval)$/.test(n)) out.push({ level: '错', type: '关键字', detail: '严格模式里不能当绑定名' });
    if (binding) {
      const g0 = w.globals;
      if (TS_TYPE.has(g.kind) && g0.types.has(n)) out.push({ level: '警告', type: '全局名', detail: '遮住全局类型' });
      else if (!TS_TYPE.has(g.kind) && g0.callable.has(n)) out.push({ level: '警告', type: '全局名', detail: '遮住全局函数或构造器' });
      else if (!isLocal(g) && !TS_TYPE.has(g.kind) && g0.plain.has(n)) out.push({ level: '警告', type: '全局名', detail: '模块顶层遮住全局值' });
    }
  }
  const [ok, want] = styles(g);
  if (!ok.some((r) => r.test(n))) out.push({ level: '警告', type: '大小写', detail: `${g.kind} 应为 ${want}` });
  const typeParam = g.kind === '类型参数';
  if ((/^[A-Za-z]$/.test(n) && !typeParam) || /^[A-Za-z]\d+$/.test(n) || VAGUE.test(n) || VAGUE_NUMBERED.test(n))
    out.push({ level: '错', type: '黑名单', detail: '单字母、字母加数字或 she/thing/temp/data2 这类说不清内容的名字' });
  else if (/\d$/.test(n) && !ZH_NUMBER.test(g.name) && !TECH_DIGITS.test(n))
    out.push({ level: '警告', type: '序号后缀', detail: '中文名里没有数字，新名却以数字结尾' });
  return out;
};

/** 中文名里出现的核心词：从左到右最长匹配（区段 不会再算成 段）；通用词只认整名，上下文词不查 */
export const coreWords = (zh: string, glossary: GlossaryEntry[]): GlossaryEntry[] => {
  const cands = glossary.filter((e) => e.cls !== '上下文' && e.en.length).sort((a, b) => b.zh.length - a.zh.length);
  const out: GlossaryEntry[] = [];
  for (let i = 0; i < zh.length; ) {
    const e = cands.find((c) => zh.startsWith(c.zh, i) && (c.cls !== '通用' || c.zh === zh));
    if (e) {
      out.push(e);
      i += e.zh.length;
    } else i++;
  }
  return out;
};

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** 新名里用的是哪个译法（取最长的那个：segment 和 seg 都中时算 segment）；专名分大小写（liYing、LiYing 对，liying 不对） */
export const variantUsed = (e: GlossaryEntry, n: string): string | undefined => {
  const hit = e.en.filter((v) => (e.cls === '专名' ? n.includes(v) || n.includes(capital(v)) : n.toLowerCase().includes(v.toLowerCase())));
  return hit.sort((a, b) => b.length - a.length)[0];
};

export const checkGlossary = (g: Group, n: string, glossary: GlossaryEntry[]): { level: Level; type: string; detail: string }[] =>
  coreWords(g.name, glossary)
    .filter((e) => !variantUsed(e, n))
    .map((e) => ({
      level: e.zh === g.name && !isLocal(g) ? '错' : '警告',
      type: '对照表',
      detail: `${e.zh} 按对照表译 ${e.en.join('|')}`,
    }));

/** 一组的名字落在哪些作用域：模块顶层（分值、类型两个空间）、同一类型的属性、函数里（块结构看不到，只报警告） */
export const scopesOf = (g: Group): { scope: string; level: Level }[] => {
  const out = new Map<string, Level>();
  for (const id of [g.id, ...(g.aliases ?? [])]) {
    if (isPython(g)) {
      if (id.startsWith("'")) out.set('K:', '警告');
      else if (id.startsWith('.')) out.set('A:', '警告');
      else {
        const m = /^(.*)#[^#]*?(?:@(\d+))?$/.exec(id);
        if (m) out.set(m[2] ? `L:${m[1]}@${m[2]}` : `M:${m[1]}`, m[2] ? '警告' : '错');
      }
      continue;
    }
    const i = id.indexOf('#');
    if (i < 0 || g.kind === '无声明') continue;
    const file = id.slice(0, i);
    const prefix = id.slice(i + 1).split('.').slice(0, -1).join('.');
    if (TS_PROPERTY.has(g.kind)) {
      if (prefix) out.set(`P:${file}#${prefix}`, '错');
      continue;
    }
    const spaces = g.kind === '类' || g.kind === '导入别名' ? ['V', 'T'] : TS_TYPE.has(g.kind) ? ['T'] : ['V'];
    for (const sp of spaces) {
      if (!prefix && !TS_LOCAL.has(g.kind)) out.set(`M${sp}:${file}`, '错');
      else out.set(`L${sp}:${file}#${prefix}`, '警告');
    }
  }
  return [...out].map(([scope, level]) => ({ scope, level }));
};

/** 读各输出表成行，顺手查格式、缺行、多余、重复 */
export const parseRows = (inp: Inputs, issues: Issue[]): Row[] => {
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const o of inp.outputs) {
    const short = path.basename(o.file);
    const expected = o.expected ? new Set(o.expected) : undefined;
    for (const { l, n } of tsvLines(o.text)) {
      const cols = l.split('\t');
      const key = cols[0]!.trim();
      const newName = (cols[1] ?? '').trim();
      const where = `${short}:${n}`;
      const groupId = inp.keys.get(key) ?? (inp.groups.has(key) ? key : undefined);
      const g = groupId ? inp.groups.get(groupId) : undefined;
      const add = (type: string, detail: string, level: Level = '错') => issues.push({ level, type, key, name: g?.name ?? '', newName, detail: `${where} ${detail}` });
      if (cols.length < 2 || cols.length > 3) add('格式', `应为 2–3 列（组、新名、拿不准原因），这行 ${cols.length} 列`);
      if (!g) {
        add('多余', groupId ? '组 id 不在 groups.jsonl' : '行号认不出');
        continue;
      }
      if (seen.has(key)) {
        add('多余', '重复的行');
        continue;
      }
      seen.add(key);
      if (expected && !expected.has(key)) add('多余', '不是这一页的行号');
      if (inp.rules.has(groupId!)) add('多余', `规则.tsv 已定为 ${inp.rules.get(groupId!)}，不用拼`);
      if (!newName) {
        add('格式', '新名是空的');
        continue;
      }
      if (cols[1] !== newName) add('格式', '新名前后有空白', '警告');
      rows.push({ key, groupId: groupId!, name: g.name, newName, note: (cols[2] ?? '').trim(), where });
    }
    for (const k of o.expected ?? [])
      if (!seen.has(k)) issues.push({ level: '错', type: '缺行', key: k, name: inp.groups.get(inp.keys.get(k) ?? '')?.name ?? '', newName: '', detail: short });
  }
  return rows;
};

/** 同一作用域里不同中文名拼成了同一个新名；函数里的再和本文件模块顶层比（遮蔽） */
const checkCollisions = (rows: Row[], inp: Inputs, issues: Issue[]) => {
  const all = [...rows];
  for (const [id, newName] of inp.rules) {
    const g = inp.groups.get(id);
    if (g) all.push({ key: id, groupId: id, name: g.name, newName, note: '', where: '规则.tsv' });
  }
  const byScope = new Map<string, { row: Row; level: Level }[]>();
  for (const row of all)
    for (const { scope, level } of scopesOf(inp.groups.get(row.groupId)!)) {
      const k = `${scope}\0${row.newName}`;
      if (!byScope.has(k)) byScope.set(k, []);
      byScope.get(k)!.push({ row, level });
    }
  const report = (row: Row, level: Level, type: string, others: Row[], what: string) => {
    if (row.where === '规则.tsv') return;
    issues.push({ level, type, key: row.key, name: row.name, newName: row.newName, detail: `${what}：${others.map((o) => `${o.key}(${o.name})`).join('、')}` });
  };
  for (const [k, list] of byScope) {
    const names = new Set(list.map((x) => x.row.name));
    if (names.size > 1)
      for (const { row, level } of list)
        report(row, level, level === '错' ? '撞名' : '可能撞名', list.filter((x) => x.row.name !== row.name).map((x) => x.row), k.startsWith('P:') ? '同一类型的属性' : '同一作用域');
    const m = /^L([VT]):(.*?)#/.exec(k);
    if (!m) continue;
    const top = byScope.get(`M${m[1]}:${m[2]}\0${k.split('\0')[1]}`)?.filter((x) => !names.has(x.row.name));
    if (top?.length) for (const { row } of list) report(row, '警告', '遮蔽', top.map((x) => x.row), '遮住本文件模块顶层的');
  }
};

const tally = (m: Map<string, Row[]>) =>
  [...m]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([v, rs]) => `${v}×${rs.length}(${rs.slice(0, 3).map((r) => r.key).join(',')}${rs.length > 3 ? '…' : ''})`)
    .join('、');

/** 一词多译（只看非局部的）：对照表里给了几个译法的领域词实际混着用；同一个两字以上的中文名拼成了不同的名字 */
const checkConsistency = (rows: Row[], inp: Inputs, issues: Issue[]) => {
  const byWord = new Map<string, Map<string, Row[]>>();
  const byName = new Map<string, Map<string, Row[]>>();
  const push = (m: Map<string, Map<string, Row[]>>, k: string, v: string, r: Row) => {
    if (!m.has(k)) m.set(k, new Map());
    const inner = m.get(k)!;
    if (!inner.has(v)) inner.set(v, []);
    inner.get(v)!.push(r);
  };
  for (const r of rows) {
    const g = inp.groups.get(r.groupId)!;
    if (isLocal(g) || g.kind === '导入别名') continue;
    for (const e of coreWords(g.name, inp.glossary)) {
      const v = e.cls === '领域' && e.en.length > 1 ? variantUsed(e, r.newName) : undefined;
      if (v) push(byWord, e.zh, v, r);
    }
    if ([...g.name].length >= 2) push(byName, g.name, r.newName.toLowerCase(), r);
  }
  for (const [zh, m] of byWord)
    if (m.size > 1) issues.push({ level: '警告', type: '一词多译', key: '', name: zh, newName: [...m.keys()].join('|'), detail: `对照表允许的译法混用：${tally(m)}` });
  for (const [zh, m] of byName)
    if (m.size > 1) issues.push({ level: '警告', type: '一词多译', key: '', name: zh, newName: [...m.keys()].join('|'), detail: `同一个中文名拼法不一：${tally(m)}` });
};

export const checkTables = (inp: Inputs): { rows: Row[]; issues: Issue[] } => {
  const issues: Issue[] = [];
  const rows = parseRows(inp, issues);
  for (const r of rows) {
    const g = inp.groups.get(r.groupId)!;
    for (const x of [...checkName(g, r.newName), ...checkGlossary(g, r.newName, inp.glossary)])
      issues.push({ ...x, key: r.key, name: r.name, newName: r.newName, detail: x.detail });
  }
  checkCollisions(rows, inp, issues);
  checkConsistency(rows, inp, issues);
  const rank = (i: Issue) => (i.level === '错' ? 0 : 1);
  // 导入别名、类在值和类型两个空间各算一次，撞名会报两遍
  const seen = new Set<string>();
  const unique = issues.filter((i) => {
    const k = [i.level, i.type, i.key, i.name, i.detail].join('\0');
    return !seen.has(k) && !!seen.add(k);
  });
  unique.sort((a, b) => rank(a) - rank(b) || a.type.localeCompare(b.type) || a.key.localeCompare(b.key));
  return { rows, issues: unique };
};

export const issuesTsv = (issues: Issue[]): string =>
  ['级别\t类\t行号\t中文名\t新名\t说明', ...issues.map((i) => [i.level, i.type, i.key, i.name, i.newName, i.detail].join('\t'))].join('\n') + '\n';

export const summary = (rows: Row[], issues: Issue[]): string => {
  const count = (lv: Level) => issues.filter((i) => i.level === lv).length;
  const types = new Map<string, number>();
  for (const i of issues) types.set(`${i.level}:${i.type}`, (types.get(`${i.level}:${i.type}`) ?? 0) + 1);
  const detail = [...types].map(([k, v]) => `${k} ${v}`).join('、');
  return `核表：${rows.length} 行，错 ${count('错')}，警告 ${count('警告')}${detail ? `（${detail}）` : ''}`;
};
