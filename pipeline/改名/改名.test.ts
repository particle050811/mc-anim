import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Workspace } from './工程.ts';
import { scan } from './扫.ts';
import { apply, readTable } from './改.ts';

const files: Record<string, string> = {
  'tsconfig.json': JSON.stringify({
    compilerOptions: { strict: true, module: 'preserve', moduleResolution: 'bundler', allowImportingTsExtensions: true, noEmit: true, target: 'ES2023' },
    include: ['*.ts'],
  }),
  'a.ts': [
    'export type 型 = { 秒: number; 帧: number };',
    'export const 造 = (秒: number): 型 => ({ 秒, 帧: 2 });',
    'const t: { 拍: number } | { 秒: number } = { 拍: 1 };',
    "export const 拍了 = '拍' in t ? t.拍 : 0;",
    'export const 表 = { 对视: 1, 摇铃: 2 } as const satisfies Record<string, number>;',
    "export const 接: string = '对视';",
    '',
  ].join('\n'),
  'b.ts': [
    "import { 造, type 型 } from './a.ts';",
    'const { 秒 } = 造(1);',
    'const seconds = 3;',
    'export const 和 = (x: 型) => x.秒 + 秒 + seconds;',
    '',
  ].join('\n'),
  // 先写成没有上下文类型的字面量、再当实参传：TS 改名不连，要按结构配对
  'd.ts': [
    "import type { 型 } from './a.ts';",
    'const 值 = { 秒: 1, 帧: 2 };',
    'const 收 = (x: 型) => x.帧;',
    'export const 结果 = 收(值);',
    '',
  ].join('\n'),
  // 类型守卫里 '秒' in t 的 t 是 object：按谓词的类型认
  'e.ts': ["import type { 型 } from './a.ts';", "export const 是型 = (t: object): t is 型 => '秒' in t;", "export const 秒键: keyof 型 & keyof { 帧: number } | keyof 型 = '秒';", ''].join('\n'),
  // 字符串里写的代码：代码里的字符串（句、止）不算标识符
  'f.ts': [
    'export type 用 = { 在: number; 依据: string; 句: number; 拍: number; 止: number };',
    'const 样本 = "const x = { 在: 1, 依据: `第${n}句` };";',
    "export const 生成 = (名: string) => `export const ${名} = { 拍: '${名}.止' };` + 样本;",
    '',
  ].join('\n'),
  // 正片事件那种写法：键从实参推出来（Record<K, …> 没有声明），再经展开、keyof typeof 注解、as
  'c.ts': [
    'const 解 = <K extends string>(t: Record<K, number>): Record<K, string> => ({}) as Record<K, string>;',
    'const 定 = { 甲事: 1 } as const satisfies Record<string, number>;',
    'export const 事件 = 解(定);',
    'const 合 = { ...事件 };',
    'export const 全: Readonly<Record<keyof typeof 合, string>> = Object.fromEntries([]) as Record<keyof typeof 合, string>;',
    'export const 用 = 全.甲事 + 事件.甲事;',
    '',
  ].join('\n'),
};

const dirs: string[] = [];
const fixture = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), '改名-'));
  dirs.push(d);
  for (const [f, t] of Object.entries(files)) fs.writeFileSync(path.join(d, f), t);
  execFileSync('git', ['init', '-q'], { cwd: d });
  execFileSync('git', ['add', '.'], { cwd: d });
  return d;
};
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

describe('改名工具', () => {
  it('扫：简写拆成属性、值两组，in 的字符串并进属性组，事件名列成字符串引用', () => {
    const r = scan(new Workspace(fixture()));
    const ids = new Map(r.groups.map((g) => [g.id, g]));
    expect(ids.get('a.ts#型.秒')?.files).toBe(4); // a、b、d（结构配对）、e（类型守卫）
    expect(ids.get('a.ts#造.秒')?.kind).toBe('参数');
    expect(ids.get('a.ts#造')?.exported).toBe(true);
    // '拍' in t 的字符串并进了 { 拍: number } 的组
    const 拍 = r.groups.find((g) => g.name === '拍' && g.kind === '属性');
    expect(拍?.locs.some((l) => l.str)).toBe(true);
    expect(ids.get('a.ts#表.对视')?.flags.keyLike).toBeTruthy();
    expect(ids.get('a.ts#表.对视')?.flags.stringRefsUnchecked).toBe(1);
    const 嵌 = (n: string) => (r.strings[n] ?? []).filter((x) => x.file === 'f.ts' && x.via === '嵌入代码').length;
    expect([嵌('在'), 嵌('依据'), 嵌('句'), 嵌('拍'), 嵌('止')]).toEqual([1, 1, 0, 1, 0]);
    // 映射出来的键顺着实参、展开、typeof 连回原来的键
    expect(ids.get('c.ts#定.甲事')?.count).toBe(3);
  });

  it('改、核：简写按两面拼，字符串跟着改，改前改后指向不变', () => {
    const root = fixture();
    const r = scan(new Workspace(root));
    const table = readTable(['a.ts#型.秒\tseconds', 'a.ts#造.秒\ts', 'a.ts#造\tmake', 'a.ts#表.对视\tgaze\tall'].join('\n'));
    const rep = apply(root, r, table, { write: true });
    expect(rep.errors).toEqual([]);
    expect(rep.mismatches).toEqual([]);
    expect(rep.newDiagnostics).toEqual([]);
    expect(rep.written).toBe(true);
    const a = fs.readFileSync(path.join(root, 'a.ts'), 'utf8');
    const b = fs.readFileSync(path.join(root, 'b.ts'), 'utf8');
    expect(a).toContain('export const make = (s: number): 型 => ({ seconds: s, 帧: 2 });');
    expect(a).toContain("export const 接: string = 'gaze';");
    expect(b).toContain('const { seconds: 秒 } = make(1);');
    expect(b).toContain('x.seconds + 秒 + seconds');
    expect(fs.readFileSync(path.join(root, 'd.ts'), 'utf8')).toContain('const 值 = { seconds: 1, 帧: 2 };');
    expect(fs.readFileSync(path.join(root, 'e.ts'), 'utf8')).toContain("'seconds' in t");
    expect(fs.readFileSync(path.join(root, 'e.ts'), 'utf8')).toContain("| keyof 型 = 'seconds';");
  });

  it('核：新名遮住、撞上原来的名字时不落盘', () => {
    const root = fixture();
    const r = scan(new Workspace(root));
    const rep = apply(root, r, readTable('b.ts#秒\tseconds'), { write: true });
    expect(rep.ok).toBe(false);
    expect(rep.written).toBe(false);
    expect(rep.mismatches.length + rep.newDiagnostics.length).toBeGreaterThan(0);
    expect(fs.readFileSync(path.join(root, 'b.ts'), 'utf8')).toBe(files['b.ts']);
  });
});
