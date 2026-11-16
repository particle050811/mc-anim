// 人写的 TOML 按键表逐个键改名：词法扫一遍认出键的位置（表头、点分键、行内表），只换键记号，注释、空行、对齐、引号写法都不动。
// 撞名不在这里查：改完 smol-toml 再解析会报重复键（核对那步）。
import { applyEdits, type RenameResult } from './改json.ts';
import { canonical, isMapAt, type KeyTable } from './键表.ts';

export type TomlKeyToken = { key: string; start: number; end: number; parent: string[]; quote: '' | '"' | "'" };

const BARE_STOP = new Set([' ', '\t', '\r', '\n', '=', '.', '[', ']', '{', '}', ',', '#', '"', "'"]);

export const scanTomlKeys = (text: string, t: KeyTable, onKey: (k: TomlKeyToken) => void) => {
  let i = 0;
  const arrayTables = new Set<string>();
  const fail = (what: string): never => {
    throw new Error(`TOML 第 ${text.slice(0, i).split('\n').length} 行：${what}`);
  };
  const ws = () => {
    while (text[i] === ' ' || text[i] === '\t') i++;
  };
  const comment = () => {
    if (text[i] === '#') while (i < text.length && text[i] !== '\n') i++;
  };
  /** 空白、换行、注释（数组和多行行内表里都可能有） */
  const wsnl = () => {
    for (;;) {
      ws();
      comment();
      if (text[i] === '\n' || text[i] === '\r') i++;
      else return;
    }
  };
  const quoted = (q: '"' | "'") => {
    const multi = text.startsWith(q.repeat(3), i);
    const s = i;
    i += multi ? 3 : 1;
    for (;;) {
      if (i >= text.length) fail('字符串没收尾');
      if (q === '"' && text[i] === '\\') {
        i += 2;
        continue;
      }
      if (multi ? text.startsWith(q.repeat(3), i) : text[i] === q) break;
      if (!multi && text[i] === '\n') fail('单行字符串里换行');
      i++;
    }
    i += multi ? 3 : 1;
    // 多行字符串收尾可以多带一两个引号（"""a"""" 是 a"）
    if (multi) while (text[i] === q) i++;
    return [s, i] as const;
  };
  /** 一个键段：返回原键（中文）并回调 */
  const keySegment = (parent: string[]) => {
    const c = text[i];
    let key: string;
    let s = i;
    let quote: TomlKeyToken['quote'] = '';
    if (c === '"' || c === "'") {
      quote = c;
      const [a, b] = quoted(c);
      s = a;
      key = c === '"' ? (JSON.parse(text.slice(a, b)) as string) : text.slice(a + 1, b - 1);
    } else {
      while (i < text.length && !BARE_STOP.has(text[i]!)) i++;
      if (i === s) fail('该是键');
      key = text.slice(s, i);
    }
    onKey({ key, start: s, end: i, parent, quote });
    return key;
  };
  /** 点分键：返回这个键的完整路径 */
  const dottedKey = (base: string[]) => {
    const p = [...base];
    for (;;) {
      ws();
      p.push(canonical(t, keySegment([...p])));
      ws();
      if (text[i] !== '.') return p;
      i++;
    }
  };
  const value = (p: string[]): void => {
    ws();
    const c = text[i];
    if (c === '"' || c === "'") return void quoted(c);
    if (c === '[') {
      i++;
      for (;;) {
        wsnl();
        if (text[i] === ']') return void i++;
        value([...p, '[]']);
        wsnl();
        if (text[i] === ',') i++;
        else if (text[i] !== ']') fail('数组里该是逗号或 ]');
      }
    }
    if (c === '{') {
      i++;
      for (;;) {
        wsnl();
        if (text[i] === '}') return void i++;
        keyValue(p);
        wsnl();
        if (text[i] === ',') i++;
        else if (text[i] !== '}') fail('行内表里该是逗号或 }');
      }
    }
    const s = i;
    while (i < text.length && !',]}#\r\n'.includes(text[i]!)) i++;
    if (i === s) fail('该是值');
  };
  const keyValue = (base: string[]) => {
    const p = dottedKey(base);
    ws();
    if (text[i++] !== '=') fail('键后面该是 =');
    value(p);
  };
  let table: string[] = [];
  for (;;) {
    wsnl();
    if (i >= text.length) break;
    if (text[i] === '[') {
      const isArray = text[i + 1] === '[';
      i += isArray ? 2 : 1;
      const p: string[] = [];
      for (;;) {
        ws();
        p.push(canonical(t, keySegment([...p])));
        ws();
        if (text[i] === '.') {
          i++;
          // 前缀是表数组（[[a]] 之后的 [a.b]）：落在最后一个元素里
          if (arrayTables.has(p.join('\u0001'))) p.push('[]');
          continue;
        }
        break;
      }
      if (!text.startsWith(isArray ? ']]' : ']', i)) fail('表头没收尾');
      i += isArray ? 2 : 1;
      if (isArray) {
        arrayTables.add(p.join('\u0001'));
        p.push('[]');
      }
      table = p;
    } else keyValue(table);
    ws();
    comment();
    if (i < text.length && text[i] !== '\n' && text[i] !== '\r') fail('一行里键值后面还有东西');
  }
};

const BARE_OK = /^[A-Za-z0-9_-]+$/;

export const renameToml = (text: string, t: KeyTable): RenameResult => {
  const edits: [number, number, string][] = [];
  scanTomlKeys(text, t, (k) => {
    if (isMapAt(t, k.parent)) return;
    const next = t.forward.get(k.key);
    if (!next) return;
    // 新键都是驼峰英文，照原来的引号写法写；原来是裸键就还写裸键
    if (k.quote === '' && !BARE_OK.test(next)) throw new Error(`新键 ${next} 不能写成裸键`);
    edits.push([k.start, k.end, k.quote ? `${k.quote}${next}${k.quote}` : next]);
  });
  return { text: applyEdits(text, edits), renamed: edits.length, collisions: [] };
};

export const tomlSkeleton = (text: string, t: KeyTable) => {
  const edits: [number, number, string][] = [];
  scanTomlKeys(text, t, (k) => edits.push([k.start, k.end, '\u0000']));
  return applyEdits(text, edits);
};
