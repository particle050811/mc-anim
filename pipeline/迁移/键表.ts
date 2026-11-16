// 盘上数据改键名（代码改英文第三步）的键表：pipeline/迁移/盘键表/<格式>.tsv，一行「中文键<TAB>英文键」；
// 「@map<TAB><路径>」声明这个位置的对象的键是数据（路径、资产 id、角色名、包名……），不改，往里照常递归。
// 路径用中文原键、点分，数组元素写 []，* 配任意一个键；空路径是根。改过一遍的文件里路径段先按表翻回中文再配，所以重跑幂等。
import fs from 'node:fs';
import path from 'node:path';

export type KeyTable = {
  format: string;
  forward: Map<string, string>;
  /** 英文键 → 中文键（路径段规范化用） */
  backward: Map<string, string>;
  maps: string[][];
};

export const keyTableDir = () => path.join(import.meta.dirname, '盘键表');

const parsePattern = (p: string): string[] => (p === '' ? [] : p.split('.').flatMap((s) => (s.endsWith('[]') ? (s === '[]' ? ['[]'] : [s.slice(0, -2), '[]']) : [s])));

export const parseKeyTable = (format: string, text: string): KeyTable => {
  const forward = new Map<string, string>();
  const backward = new Map<string, string>();
  const maps: string[][] = [];
  for (const [i, raw] of text.split('\n').entries()) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() || line.startsWith('#')) continue;
    const [a, b = ''] = line.split('\t');
    if (a === '@map') {
      maps.push(parsePattern(b));
      continue;
    }
    if (i === 0 || a === '中文键') continue;
    if (!a || !/^[A-Za-z][A-Za-z0-9]*$/.test(b)) throw new Error(`盘键表/${format}.tsv 第 ${i + 1} 行：新键要是驼峰英文（${JSON.stringify(line)}）`);
    if (forward.has(a)) throw new Error(`盘键表/${format}.tsv：${a} 写了两次`);
    if (backward.has(b)) throw new Error(`盘键表/${format}.tsv：${backward.get(b)}、${a} 都改成 ${b}，同一格式一个新键只给一个旧键`);
    forward.set(a, b);
    backward.set(b, a);
  }
  return { format, forward, backward, maps };
};

export const loadKeyTable = (format: string, dir = keyTableDir()) => parseKeyTable(format, fs.readFileSync(path.join(dir, `${format}.tsv`), 'utf8'));

/** 路径段规范成中文原键 */
export const canonical = (t: KeyTable, key: string) => t.backward.get(key) ?? key;

export const isMapAt = (t: KeyTable, parent: readonly string[]) =>
  t.maps.some((p) => p.length === parent.length && p.every((s, i) => (s === '*' ? parent[i] !== '[]' : s === parent[i])));

export const HAN = /\p{Script=Han}/u;

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== 'object' || Array.isArray(v) || v instanceof Date) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/** 解析出来的值按表改键（核对用：改前解析后改键 应当等于 改后再解析） */
export const renameParsed = (t: KeyTable, v: unknown, parent: string[] = []): unknown => {
  if (Array.isArray(v)) return v.map((x) => renameParsed(t, x, [...parent, '[]']));
  if (!isPlainObject(v)) return v;
  const isMap = isMapAt(t, parent);
  // 原型照抄（smol-toml 出的对象没有原型），isDeepStrictEqual 比原型
  const out = Object.create(Object.getPrototypeOf(v)) as Record<string, unknown>;
  for (const [k, x] of Object.entries(v)) out[isMap ? k : (t.forward.get(k) ?? k)] = renameParsed(t, x, [...parent, canonical(t, k)]);
  return out;
};

/** 改完还留着的键：表里的中文键（该改没改）、含汉字但表里没有的键（漏登记） */
export const leftoverKeys = (t: KeyTable, v: unknown, parent: string[] = [], out = { missed: new Set<string>(), unlisted: new Set<string>() }) => {
  if (Array.isArray(v)) v.forEach((x) => leftoverKeys(t, x, [...parent, '[]'], out));
  else if (isPlainObject(v)) {
    const isMap = isMapAt(t, parent);
    for (const [k, x] of Object.entries(v)) {
      if (!isMap && t.forward.has(k)) out.missed.add(k);
      else if (!isMap && HAN.test(k)) out.unlisted.add(k);
      leftoverKeys(t, x, [...parent, canonical(t, k)], out);
    }
  }
  return out;
};
