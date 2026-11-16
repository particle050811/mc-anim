// JSON、JSONL 按键表逐个键改名：只换对象键那几个字符串记号，值、空白、缩进、换行一个字节不动（不重新序列化）。
import { canonical, isMapAt, type KeyTable } from './键表.ts';

/** 一个对象键记号：[start, end) 是含引号的原文；parent 是它所在对象的路径（中文原键），object 是这个对象的序号（查撞名） */
export type KeyToken = { key: string; start: number; end: number; parent: string[]; object: number };

const WS = new Set([' ', '\t', '\n', '\r']);

/** 扫出 JSON 文本里所有对象键记号（按出现顺序）；不是合法 JSON 就抛错 */
export const scanJsonKeys = (text: string, t: KeyTable, onKey: (k: KeyToken) => void) => {
  let i = 0;
  let objects = 0;
  const fail = (what: string): never => {
    throw new Error(`JSON 第 ${text.slice(0, i).split('\n').length} 行：${what}`);
  };
  const ws = () => {
    while (i < text.length && WS.has(text[i]!)) i++;
  };
  const str = () => {
    if (text[i] !== '"') fail('该是字符串');
    const s = i++;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    if (i >= text.length) fail('字符串没收尾');
    i++;
    return [s, i] as const;
  };
  const value = (path: string[]): void => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++;
      const object = objects++;
      ws();
      if (text[i] === '}') return void i++;
      for (;;) {
        ws();
        const [s, e] = str();
        const key = JSON.parse(text.slice(s, e)) as string;
        onKey({ key, start: s, end: e, parent: path, object });
        ws();
        if (text[i++] !== ':') fail('键后面该是冒号');
        value([...path, canonical(t, key)]);
        ws();
        const d = text[i++];
        if (d === '}') return;
        if (d !== ',') fail('对象里该是逗号或 }');
      }
    }
    if (c === '[') {
      i++;
      ws();
      if (text[i] === ']') return void i++;
      for (;;) {
        value([...path, '[]']);
        ws();
        const d = text[i++];
        if (d === ']') return;
        if (d !== ',') fail('数组里该是逗号或 ]');
      }
    }
    if (c === '"') return void str();
    const s = i;
    while (i < text.length && !WS.has(text[i]!) && !',]}'.includes(text[i]!)) i++;
    if (i === s) fail('该是值');
  };
  value([]);
  ws();
  if (i !== text.length) fail('值后面还有东西');
};

export type RenameResult = { text: string; renamed: number; collisions: string[] };

/** 按表改一份 JSON 文本；同一对象里改完撞名记进 collisions（不改那个文件） */
export const renameJson = (text: string, t: KeyTable): RenameResult => {
  const edits: [number, number, string][] = [];
  const seen = new Map<number, Set<string>>();
  const collisions: string[] = [];
  scanJsonKeys(text, t, (k) => {
    const next = isMapAt(t, k.parent) ? k.key : (t.forward.get(k.key) ?? k.key);
    const names = seen.get(k.object) ?? seen.set(k.object, new Set()).get(k.object)!;
    if (names.has(next)) collisions.push(`${[...k.parent, k.key].join('.')} → ${next}`);
    names.add(next);
    if (next !== k.key) edits.push([k.start, k.end, JSON.stringify(next)]);
  });
  return { text: applyEdits(text, edits), renamed: edits.length, collisions };
};

export const applyEdits = (text: string, edits: [number, number, string][]) => {
  let out = '';
  let at = 0;
  for (const [s, e, r] of edits) {
    out += text.slice(at, s) + r;
    at = e;
  }
  return out + text.slice(at);
};

/** 把所有对象键记号换成占位：改前改后的骨架相同 = 值和排版逐字节没动 */
export const jsonSkeleton = (text: string, t: KeyTable) => {
  const edits: [number, number, string][] = [];
  scanJsonKeys(text, t, (k) => edits.push([k.start, k.end, '\u0000']));
  return applyEdits(text, edits);
};

/** JSONL：逐行改（空行原样） */
export const renameJsonl = (text: string, t: KeyTable): RenameResult => {
  let renamed = 0;
  const collisions: string[] = [];
  const lines = text.split('\n').map((line) => {
    if (!line.trim()) return line;
    const cr = line.endsWith('\r') ? '\r' : '';
    const r = renameJson(cr ? line.slice(0, -1) : line, t);
    renamed += r.renamed;
    collisions.push(...r.collisions);
    return r.text + cr;
  });
  return { text: lines.join('\n'), renamed, collisions };
};

/** 同一对象里重复的键（JSON.parse 会悄悄留后一个，解析后比较看不出来） */
export const duplicateJsonKeys = (text: string, t: KeyTable) => {
  const seen = new Map<number, Set<string>>();
  const dup: string[] = [];
  scanJsonKeys(text, t, (k) => {
    const names = seen.get(k.object) ?? seen.set(k.object, new Set()).get(k.object)!;
    if (names.has(k.key)) dup.push([...k.parent, k.key].join('.'));
    names.add(k.key);
  });
  return dup;
};
