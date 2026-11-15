// 作品的 台词.toml：人写的唯一源（每句的字、角色、念法、语气、口型手修），外加 [配音]（默认后端、种子、响度、许可、可见性）和 [音色.<角色>]（参考音频、逐字稿）。
// 配音、开口、文本哈希、成品sha、口型 这几项由 anim voice 写回（只改那一行，注释和排版不动），人不用手填哈希。
import crypto from 'node:crypto';
import fs from 'node:fs';
import { parse } from 'smol-toml';
import type { LineEntry } from '../检查/规则/台词.ts';

export type LipManual = { 成品sha?: string; 字?: [string, number, number][]; 注?: string };
/** 一句的合成设置（都可选，覆盖 [配音] 和 [音色.<角色>]）。念：只交给 TTS 的字，和对口型的 念 不同时写（如数字写成读法，口型手修 却按字面标的） */
export type SynthSettings = { 后端?: string; 念?: string; 参考?: string; 逐字稿?: string; 种子?: number[]; 语气参考?: string; 强度?: number; 不裁?: boolean; 参数?: Record<string, unknown> };
export type VoiceLineRow = Omit<LineEntry, '口型手修'> & {
  /** 交给 TTS、对口型的字（和字幕的 文本 不同时写，如数字写成读法、日语念法） */
  念?: string;
  /** 中文（默认）、日语、英语、粤语 */
  语言?: string;
  /** 这句的情境和语气（挑候选、给能按文字控制语气的后端） */
  语气?: string;
  口型手修?: LipManual;
  合成?: SynthSettings;
};
export type VoiceSettings = { 后端: string; 种子: number[]; 目标响度: number; 峰值上限: number; 许可: string; 可见性: string; 后端参数: Record<string, Record<string, unknown>> };
export type Timbre = { 参考: string; 逐字稿: string };
export type WorkLines = { 台词: VoiceLineRow[]; 配音: VoiceSettings; 音色: Record<string, Timbre> };

// 用户 10-31 定：统一默认 IndexTTS2 云端（本机模型占内存太多），调模型的事交给 image-flow（docs/决策/0009）
export const defaultVoice: VoiceSettings = { 后端: 'image-flow', 种子: [1234, 20261010, 7, 42], 目标响度: -18, 峰值上限: -1.5, 许可: 'LicenseRef-待定', 可见性: '私有', 后端参数: {} };

/** 字的 sha256 前 12 位 */
export const textHash = (text: string) => crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12);

export const spokenTextOf = (t: Pick<VoiceLineRow, '念' | '文本'>) => t.念 ?? t.文本;

/** 台词.toml 的 文本哈希 该是的值：配音念的字（念，没写同 文本）的哈希。念的字改了对不上 = 配音过期；只改字幕时写 念 = 原来的字，哈希照旧对得上 */
export const voiceTextHash = (t: Pick<VoiceLineRow, '念' | '文本'>) => textHash(spokenTextOf(t));

export const parseWorkLines = (text: string): WorkLines => {
  const d = parse(text) as { 台词?: VoiceLineRow[]; 配音?: Partial<VoiceSettings>; 音色?: Record<string, Timbre> };
  return { 台词: d.台词 ?? [], 配音: { ...defaultVoice, ...(d.配音 ?? {}) }, 音色: d.音色 ?? {} };
};

export const readWorkLines = (file: string): WorkLines | null => (fs.existsSync(file) ? parseWorkLines(fs.readFileSync(file, 'utf8')) : null);

// ---------- 写回：只改某一句的几项，一项一行 ----------

export type TomlValue = string | number | boolean | readonly TomlValue[] | { readonly [k: string]: TomlValue };

const keyText = (k: string) => (/^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k));
/** 单行 TOML 值。数是整数的写成 x.0（开口这类秒数和现有写法一致） */
export const tomlValue = (v: TomlValue): string => {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`TOML 写不了 ${v}`);
    return Number.isInteger(v) ? `${v}.0` : String(v);
  }
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(tomlValue).join(', ')}]`;
  return `{ ${Object.entries(v as Record<string, TomlValue>).map(([k, x]) => `${keyText(k)} = ${tomlValue(x)}`).join(', ')} }`;
};

const keyLine = /^\s*("(?:[^"\\]|\\.)*"|[A-Za-z0-9_-]+)\s*=/;
// 表头 [a."b"] / [[a]]：整行是键路径、又不在多行数组里（数组里的 [2]、["等", 0.03, 0.19] 不算）
const keyPattern = String.raw`(?:"(?:[^"\\]|\\.)*"|'[^']*'|[A-Za-z0-9_-]+)`;
const headerPattern = new RegExp(String.raw`^\s*\[\[?\s*${keyPattern}(?:\s*\.\s*${keyPattern})*\s*\]\]?\s*(?:#.*)?$`);
const bracketDiff = (l: string) => {
  const noStrings = l.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '').replace(/#.*/, '');
  return (noStrings.match(/\[/g)?.length ?? 0) - (noStrings.match(/\]/g)?.length ?? 0);
};
const headerLines = (lines: readonly string[]) => {
  let depth = 0;
  return lines.map((l) => {
    const isHeaderLine = depth === 0 && headerPattern.test(l);
    if (!isHeaderLine) depth = Math.max(0, depth + bracketDiff(l));
    return isHeaderLine;
  });
};
const keyName = (line: string) => {
  const m = keyLine.exec(line);
  return m ? (m[1]!.startsWith('"') ? (JSON.parse(m[1]!) as string) : m[1]!) : null;
};

/** 把 id 那一句的这些项改成给的值（undefined = 删掉这一行）；没有的项插在这一句的最后一个键后面（子表头之前） */
export const editLineField = (text: string, id: string, fields: Record<string, TomlValue | undefined>): string => {
  const lines = text.split('\n');
  const isHeader = headerLines(lines);
  let startIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!isHeader[i] || !/^\s*\[\[\s*"?台词"?\s*\]\]\s*$/.test(lines[i]!)) continue;
    let j = i + 1;
    while (j < lines.length && !isHeader[j]) {
      if (keyName(lines[j]!) === 'id' && parse(lines[j]!).id === id) startIndex = i;
      j++;
    }
    if (startIndex >= 0) break;
  }
  if (startIndex < 0) throw new Error(`台词.toml 里没有 id = "${id}" 这一句`);
  let endIndex = startIndex + 1;
  while (endIndex < lines.length && !isHeader[endIndex]) endIndex++;
  for (const [k, v] of Object.entries(fields)) {
    const newLine = v === undefined ? null : `${keyText(k)} = ${tomlValue(v)}`;
    let index = -1;
    for (let i = startIndex + 1; i < endIndex; i++) if (keyName(lines[i]!) === k) index = i;
    if (index >= 0) {
      if (newLine === null) {
        lines.splice(index, 1);
        endIndex--;
      } else lines[index] = newLine;
    } else if (newLine !== null) {
      // 插在最后一项的值写完的那行后面（多行数组的收括号之后）
      let lastKey = startIndex;
      let depth = 0;
      for (let i = startIndex + 1; i < endIndex; i++) {
        const l = lines[i]!;
        depth = Math.max(0, depth + bracketDiff(l));
        if (depth === 0 && l.trim() && !l.trim().startsWith('#')) lastKey = i;
      }
      lines.splice(lastKey + 1, 0, newLine);
      endIndex++;
    }
  }
  const newText = lines.join('\n');
  // 按行改是为了不动注释和排版；改完整份重新解析，和「只改了这一句这几项」逐项比，对不上就不写（宁可报错也不弄坏人写的源）
  const expected = parse(text) as { 台词?: Record<string, unknown>[] };
  const line = expected.台词?.find((x) => x.id === id);
  if (!line) throw new Error(`台词.toml 里没有 id = "${id}" 这一句`);
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) delete line[k];
    else line[k] = v;
  }
  let updated: unknown = null;
  try {
    updated = parse(newText);
  } catch {
    // 改坏了，下面报
  }
  if (updated === null || canonicalValue(updated) !== canonicalValue(expected)) throw new Error(`台词.toml 的 ${id} 按行改不了（这一句的写法超出了写回认得的格式），请手改：${JSON.stringify(fields)}`);
  return newText;
};

/** 比内容用：键排序后的 JSON */
const canonicalValue = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
