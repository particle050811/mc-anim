// 作品的 台词.toml：人写的唯一源（每句的字、角色、念法、语气、口型手修），外加 [配音]（默认后端、种子、响度、许可）和 [音色.<角色>]（参考音频、逐字稿）。
// 配音、开口、文本哈希、成品sha、口型 这几项由 anim voice 写回（只改那一行，注释和排版不动），人不用手填哈希。
import crypto from 'node:crypto';
import fs from 'node:fs';
import { parse } from 'smol-toml';
import type { 台词条目 } from '../检查/规则/台词.ts';

export type 口型手修 = { 成品sha?: string; 字?: [string, number, number][]; 注?: string };
/** 一句的合成设置（都可选，覆盖 [配音] 和 [音色.<角色>]） */
export type 合成设置 = { 后端?: string; 参考?: string; 逐字稿?: string; 种子?: number[]; 语气参考?: string; 强度?: number; 不裁?: boolean; 参数?: Record<string, unknown> };
export type 台词行 = Omit<台词条目, '口型手修'> & {
  /** 交给 TTS、对口型的字（和字幕的 文本 不同时写，如数字写成读法、日语念法） */
  念?: string;
  /** 中文（默认）、日语、英语、粤语 */
  语言?: string;
  /** 这句的情境和语气（挑候选、给能按文字控制语气的后端） */
  语气?: string;
  口型手修?: 口型手修;
  合成?: 合成设置;
};
export type 配音设置 = { 后端: string; 种子: number[]; 目标响度: number; 峰值上限: number; 许可: string; 后端参数: Record<string, Record<string, unknown>> };
export type 音色 = { 参考: string; 逐字稿: string };
export type 作品台词 = { 台词: 台词行[]; 配音: 配音设置; 音色: Record<string, 音色> };

export const 默认配音: 配音设置 = { 后端: 'firered-本机', 种子: [1234, 20261010, 7, 42], 目标响度: -18, 峰值上限: -1.5, 许可: 'LicenseRef-待定', 后端参数: {} };

/** 字的 sha256 前 12 位 */
export const 文本哈希 = (文本: string) => crypto.createHash('sha256').update(文本, 'utf8').digest('hex').slice(0, 12);

export const 念的字 = (t: Pick<台词行, '念' | '文本'>) => t.念 ?? t.文本;

/** 台词.toml 的 文本哈希 该是的值：配音念的字（念，没写同 文本）的哈希。念的字改了对不上 = 配音过期；只改字幕时写 念 = 原来的字，哈希照旧对得上 */
export const 配音文本哈希 = (t: Pick<台词行, '念' | '文本'>) => 文本哈希(念的字(t));

export const 解析作品台词 = (文本: string): 作品台词 => {
  const d = parse(文本) as { 台词?: 台词行[]; 配音?: Partial<配音设置>; 音色?: Record<string, 音色> };
  return { 台词: d.台词 ?? [], 配音: { ...默认配音, ...(d.配音 ?? {}) }, 音色: d.音色 ?? {} };
};

export const 读作品台词 = (file: string): 作品台词 | null => (fs.existsSync(file) ? 解析作品台词(fs.readFileSync(file, 'utf8')) : null);

// ---------- 写回：只改某一句的几项，一项一行 ----------

export type TOML值 = string | number | boolean | readonly TOML值[] | { readonly [k: string]: TOML值 };

const 键文本 = (k: string) => (/^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k));
/** 单行 TOML 值。数是整数的写成 x.0（开口这类秒数和现有写法一致） */
export const toml值 = (v: TOML值): string => {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`TOML 写不了 ${v}`);
    return Number.isInteger(v) ? `${v}.0` : String(v);
  }
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(toml值).join(', ')}]`;
  return `{ ${Object.entries(v as Record<string, TOML值>).map(([k, x]) => `${键文本(k)} = ${toml值(x)}`).join(', ')} }`;
};

const 键行 = /^\s*("(?:[^"\\]|\\.)*"|[A-Za-z0-9_-]+)\s*=/;
// 表头 [a."b"] / [[a]]：整行是键路径、又不在多行数组里（数组里的 [2]、["等", 0.03, 0.19] 不算）
const 键段 = String.raw`(?:"(?:[^"\\]|\\.)*"|'[^']*'|[A-Za-z0-9_-]+)`;
const 表头行 = new RegExp(String.raw`^\s*\[\[?\s*${键段}(?:\s*\.\s*${键段})*\s*\]\]?\s*(?:#.*)?$`);
const 括号差 = (l: string) => {
  const 去串 = l.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '').replace(/#.*/, '');
  return (去串.match(/\[/g)?.length ?? 0) - (去串.match(/\]/g)?.length ?? 0);
};
const 表头们 = (行们: readonly string[]) => {
  let 深 = 0;
  return 行们.map((l) => {
    const 是 = 深 === 0 && 表头行.test(l);
    if (!是) 深 = Math.max(0, 深 + 括号差(l));
    return 是;
  });
};
const 键名 = (行: string) => {
  const m = 键行.exec(行);
  return m ? (m[1]!.startsWith('"') ? (JSON.parse(m[1]!) as string) : m[1]!) : null;
};

/** 把 id 那一句的这些项改成给的值（undefined = 删掉这一行）；没有的项插在这一句的最后一个键后面（子表头之前） */
export const 改台词字段 = (文本: string, id: string, 字段: Record<string, TOML值 | undefined>): string => {
  const 行们 = 文本.split('\n');
  const 是头 = 表头们(行们);
  let 起 = -1;
  for (let i = 0; i < 行们.length; i++) {
    if (!是头[i] || !/^\s*\[\[\s*"?台词"?\s*\]\]\s*$/.test(行们[i]!)) continue;
    let j = i + 1;
    while (j < 行们.length && !是头[j]) {
      if (键名(行们[j]!) === 'id' && parse(行们[j]!).id === id) 起 = i;
      j++;
    }
    if (起 >= 0) break;
  }
  if (起 < 0) throw new Error(`台词.toml 里没有 id = "${id}" 这一句`);
  let 止 = 起 + 1;
  while (止 < 行们.length && !是头[止]) 止++;
  for (const [k, v] of Object.entries(字段)) {
    const 新行 = v === undefined ? null : `${键文本(k)} = ${toml值(v)}`;
    let 在 = -1;
    for (let i = 起 + 1; i < 止; i++) if (键名(行们[i]!) === k) 在 = i;
    if (在 >= 0) {
      if (新行 === null) {
        行们.splice(在, 1);
        止--;
      } else 行们[在] = 新行;
    } else if (新行 !== null) {
      // 插在最后一项的值写完的那行后面（多行数组的收括号之后）
      let 末键 = 起;
      let 深 = 0;
      for (let i = 起 + 1; i < 止; i++) {
        const l = 行们[i]!;
        深 = Math.max(0, 深 + 括号差(l));
        if (深 === 0 && l.trim() && !l.trim().startsWith('#')) 末键 = i;
      }
      行们.splice(末键 + 1, 0, 新行);
      止++;
    }
  }
  const 结果 = 行们.join('\n');
  // 按行改是为了不动注释和排版；改完整份重新解析，和「只改了这一句这几项」逐项比，对不上就不写（宁可报错也不弄坏人写的源）
  const 期望 = parse(文本) as { 台词?: Record<string, unknown>[] };
  const 行 = 期望.台词?.find((x) => x.id === id);
  if (!行) throw new Error(`台词.toml 里没有 id = "${id}" 这一句`);
  for (const [k, v] of Object.entries(字段)) {
    if (v === undefined) delete 行[k];
    else 行[k] = v;
  }
  let 改后: unknown = null;
  try {
    改后 = parse(结果);
  } catch {
    // 改坏了，下面报
  }
  if (改后 === null || 规范(改后) !== 规范(期望)) throw new Error(`台词.toml 的 ${id} 按行改不了（这一句的写法超出了写回认得的格式），请手改：${JSON.stringify(字段)}`);
  return 结果;
};

/** 比内容用：键排序后的 JSON */
const 规范 = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
