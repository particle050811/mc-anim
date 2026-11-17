// 试看参数表（REMOTION_ANIM_TRIAL 的 JSON）在 pipeline 这头的解析和核对：键、「关」的项、对象值的子键都要在登记表里（engine/core/调试开关.ts），
// 写错了当场报错，不等到页面里悄悄没人读（暮色远景 照旧注释写 雾远、代码却读 fogFar，参数一直没生效）。
// 还管 still --trial 的短名（文件名、预览小标题用）和 anim trial list 打印的表。
import { createHash } from 'node:crypto';
import { debugSwitches, findSwitch, type DebugSwitch } from '../../engine/core/调试开关.ts';

export type TrialTable = Record<string, unknown>;

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const trialNames = () => (debugSwitches as readonly DebugSwitch[]).filter((s) => s.kind === 'trial' && !s.pending).map((s) => s.name);
const offNames = () => (debugSwitches as readonly DebugSwitch[]).filter((s) => s.kind === 'off' && !s.pending).map((s) => s.name);

/**
 * 核对一张试看表，返回提醒（用到了还在分支上的占位名：main 上没人读）。from 是报错里说的来源（环境变量名或 --trial）。
 * 不认识的键、子键、「关」的项都直接报错
 */
export const checkTrialTable = (table: unknown, from: string): string[] => {
  if (!isPlainObject(table)) throw new Error(`${from} 要是 JSON 对象（{"<名>": 值}），拿到的是 ${JSON.stringify(table)}`);
  const notes: string[] = [];
  for (const [key, value] of Object.entries(table)) {
    const row = findSwitch('trial', key);
    if (!row) throw new Error(`${from} 里的「${key}」没登记：认的名字有 ${trialNames().join('、')}（anim trial list）`);
    if (row.pending) notes.push(`${from} 里的「${key}」还在 ${row.pending} 上，main 上没人读，这一项不起作用`);
    if (row.keys && isPlainObject(value)) {
      const unknown = Object.keys(value).filter((k) => !row.keys!.includes(k));
      if (unknown.length) throw new Error(`${from} 里「${key}」的 ${unknown.join('、')} 没人读：认的是 ${row.keys.join('、')}（格式 ${row.format}）`);
    }
    if (key === '关') {
      if (!Array.isArray(value) || !value.every((x) => typeof x === 'string')) throw new Error(`${from} 的「关」要是项名数组，如 ["高度雾", "云"]`);
      for (const item of value as string[]) {
        const o = findSwitch('off', item);
        if (!o) throw new Error(`${from} 的「关」里「${item}」没登记：能关的有 ${offNames().join('、')}（anim trial list）`);
        if (o.pending) notes.push(`「关」里的「${item}」还没接（${o.note ?? o.pending}），这一项不起作用`);
      }
    }
  }
  return notes;
};

export const parseTrialJson = (raw: string, from: string): TrialTable => {
  let table: unknown;
  try {
    table = JSON.parse(raw);
  } catch (e) {
    throw new Error(`${from} 不是合法 JSON：${(e as Error).message}（${raw}）`);
  }
  for (const n of checkTrialTable(table, from)) console.error(`!! ${n}`);
  return table as TrialTable;
};

const scalarText = (v: unknown): string => (Array.isArray(v) ? v.map(scalarText).join('+') : isPlainObject(v) ? JSON.stringify(v) : String(v));
const unsafeFileChars = /[<>:"/\\|?*\x00-\x1f\s]/g;

/**
 * 一组参数的短名：雾曲线.起=0.8、关=高度雾+云，几个键用「,」连。能当文件名；太长的截断再带 6 位哈希，几组之间不会撞。
 * 空表（基准那一组）叫「基准」
 */
export const trialShortName = (delta: TrialTable): string => {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(delta)) {
    if (isPlainObject(v) && Object.keys(v).length) for (const [sub, sv] of Object.entries(v)) parts.push(`${k}.${sub}=${scalarText(sv)}`);
    else parts.push(`${k}=${scalarText(v)}`);
  }
  if (!parts.length) return '基准';
  const name = parts.join(',').replace(unsafeFileChars, '_');
  if (name.length <= 60) return name;
  return `${name.slice(0, 50)}…${createHash('sha256').update(JSON.stringify(delta)).digest('hex').slice(0, 6)}`;
};

const readerText = (s: DebugSwitch) => s.readers.join('、');
const kindTitle: Record<DebugSwitch['kind'], string> = { trial: '试看参数（REMOTION_ANIM_TRIAL 的键）', off: '「关」能关的项（{"关": [...]}）', channel: '页面认的调试环境变量' };

/** anim trial list 打印的表：按种类分三块，每行 名字、管什么、改不改画面、谁认、格式、落点，再带占位和备注 */
export const formatSwitchTable = (rows: readonly DebugSwitch[] = debugSwitches): string => {
  const out: string[] = ['调试、试看开关（engine/core/调试开关.ts）。都不进指纹；占位 = 还没合进 main，写了也不起作用。', ''];
  for (const kind of ['trial', 'off', 'channel'] as const) {
    out.push(`== ${kindTitle[kind]}`);
    for (const s of rows.filter((r) => r.kind === kind)) {
      out.push(`${s.name}${s.pending ? `  [占位：${s.pending}]` : ''}`);
      out.push(`    管：${s.purpose}`);
      out.push(`    改画面：${s.changesPicture ? '改' : '不改'}　进指纹：不进　谁认：${readerText(s)}`);
      out.push(`    格式：${s.format}`);
      out.push(`    落点：${s.files.join('、')}`);
      if (s.note) out.push(`    备注：${s.note}`);
    }
    out.push('');
  }
  out.push('用法：REMOTION_ANIM_TRIAL=\'{"雾曲线": {"起": 0.8}}\' anim still|bench|film …；still 一次几组：--trial \'<JSON>\' --trial \'<JSON>\' [--baseline] [--contact]');
  return out.join('\n');
};
