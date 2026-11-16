import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codeRoot } from '../环境/路径.ts';
import { stripBasis, atKey, basisKey, endKey, segKeyField, segWindowKeys, startKey, timeKeys, type KeyTable } from './去依据.ts';
import type { Moment as StoryboardTime, EventDef as StoryboardEventDef, SegmentWindowDef as StoryboardSegWindow } from '../../作品/把回忆拼好给你/分镜/时间.ts';
import { computeMerkle } from './默克尔.ts';

const relPath = (p: string) => path.relative(codeRoot(), p).split(path.sep).join('/');

// 分镜.ts 的写法（把回忆拼好给你）：去依据.ts 不引作品的类型，键对不对在这里核。作品的类型加减键，下面的表 tsc 就编译不过
const storyboardTimeKeys: KeyTable<StoryboardTime> = { sec: true, beat: true, measure: true, 句: true, points: true, after: true, addSec: true };
const storyboardSegWindowKeys: KeyTable<StoryboardSegWindow> = { key: true, start: true, end: true, basis: true };
const storyboardEventKeys: KeyTable<StoryboardEventDef> = { 在: true, basis: true };
const storyboardFields: [keyof StoryboardEventDef, keyof StoryboardEventDef, keyof StoryboardSegWindow, keyof StoryboardSegWindow, keyof StoryboardSegWindow] = [atKey, basisKey, segKeyField, startKey, endKey];

it('分镜.ts 的时刻、事件、段窗都在认的形状里', () => {
  for (const k of Object.keys(storyboardTimeKeys)) expect(timeKeys.has(k), k).toBe(true);
  for (const k of Object.keys(storyboardSegWindowKeys)) expect(segWindowKeys.has(k), k).toBe(true);
  expect(Object.keys(storyboardEventKeys).sort()).toEqual([atKey, basisKey].sort());
  expect(storyboardFields).toHaveLength(5);
});

describe('去依据（文本）', () => {
  it('事件：只去说明文字，时刻留着', () => {
    expect(stripBasis(`const 表 = { 甲: { 在: { sec: 42 }, basis: "说明" } };`)).toBe(`const 表 = { 甲: { 在: { sec: 42 } } };`);
    expect(stripBasis(`const 表 = { 乙: { 在: { after: "甲", addSec: -1 / 20 }, basis: "说明" } };`)).toBe(`const 表 = { 乙: { 在: { after: "甲", addSec: -1 / 20 } } };`);
  });

  it('段窗：起止和键留着', () => {
    expect(stripBasis(`排段({ name: "串", segments: [{ key: "2-甲", start: { sec: 1 }, end: { beat: 3 }, basis: "说明" }, { key: "2-乙", end: { frameCount: 10 }, basis: "说明" }, { name: "丙", end: "放完", basis: "说明" }] });`)).toBe(
      `排段({ name: "串", segments: [{ key: "2-甲", start: { sec: 1 }, end: { beat: 3 } }, { key: "2-乙", end: { frameCount: 10 } }, { name: "丙", end: "放完" }] });`,
    );
  });

  it('说明换行、说明变长，结果一样', () => {
    const strippedShort = stripBasis(`const 表 = { 甲: { 在: { sec: 42 }, basis: "短" } };`);
    const strippedLong = stripBasis(`const 表 = { 甲: {\n  在: { sec: 42 },\n  basis: "很长很长的一段说明，换了一行"\n} };`);
    expect(strippedLong).toBe(strippedShort);
  });

  it('有时刻条目的模块：对象里的注释也去掉，正则和字符串里长得像注释的不动', () => {
    const source = `const 表 = {\n  // 第一版注释\n  甲: { 在: { sec: 1 }, basis: "说" },\n  /* 块注释 */\n  乙: { 在: { sec: 2 }, basis: "说" } // 行尾\n  // 表尾\n};\nconst s = "// 不是注释", r = /\\/\\/x/;`;
    const edited = source.replace('第一版注释', '改过').replace('块注释', '改过').replace('行尾', '改过').replace('表尾', '改过');
    const strippedForm = stripBasis(source);
    expect(stripBasis(edited)).toBe(strippedForm);
    expect(stripBasis(source.replace('// 第一版注释', '// 两行注释\n  // 第二行'))).toBe(strippedForm);
    expect(strippedForm).not.toMatch(/注释 \*\/|第一版|行尾|表尾/);
    expect(strippedForm).toContain('"// 不是注释"');
    expect(strippedForm).toContain('/\\/\\/x/');
  });

  it('没有时刻条目的模块一个字不动，注释留着（哈希和以前一样）', () => {
    const sourceText = `const 表 = {\n  // 注释\n  甲: { 字: "说", basis: "说" }\n};`;
    expect(stripBasis(sourceText)).toBe(sourceText);
  });

  it.each([
    ['别的结构里同名字段', `const x = { 字: "画在屏幕上", basis: "说明" };`],
    ['只有依据一个键', `const x = { basis: "说明" };`],
    ['解出的事件（秒、帧、依据）', `const x = { sec: 1, frame: 24, basis: "说明" };`],
    ['世界声明的块', `const x = { name: "岛", shape: "矩形", corners: [1, 2], basis: "说明" };`],
    ['字幕的换屏界', `const x = { sec: 1, 谷: null, basis: "按音节比例" };`],
    ['在 不是时刻（数组）', `const x = { 在: [1, 2], basis: "显示的字" };`],
    ['在 里有不认识的键', `const x = { 在: { 位置: 3 }, basis: "显示的字" };`],
    ['在 是变量', `const x = { 在: 某处, basis: "显示的字" };`],
    ['多一个键', `const x = { 在: { sec: 1 }, 字: "显示的字", basis: "说明" };`],
    ['有展开', `const x = { 在: { sec: 1 }, ...其他, basis: "说明" };`],
    ['依据是变量', `const x = { 在: { sec: 1 }, basis: 变量 };`],
    ['依据是模板拼接', 'const x = { 在: { sec: 1 }, basis: `第${n}句` };'],
    ['依据是函数调用', `const x = { 在: { sec: 1 }, basis: 算() };`],
    ['透传', `r[名] = { sec: 秒, frame: 歌曲帧(秒), basis: 表[名].basis };`],
    ['只有止没有键', `const x = { end: { sec: 1 }, basis: "说明" };`],
    ['止 不是时刻', `const x = { key: "甲", end: 变量, basis: "说明" };`],
    ['起 不是时刻', `const x = { key: "甲", start: 变量, end: { sec: 1 }, basis: "说明" };`],
    ['字符串里提到依据', `const x = "basis: 说明";`],
    ['变量叫依据', `const basis = "说明"; 画(basis);`],
  ])('不吃：%s', (_, sourceText) => {
    expect(stripBasis(sourceText)).toBe(sourceText);
  });
});

describe('去依据（模块哈希）', () => {
  let d: string;
  beforeEach(() => {
    d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-去依据-')));
  });
  afterEach(() => fs.rmSync(d, { recursive: true, force: true }));
  const writeToml = (content: string) => {
    fs.writeFileSync(path.join(d, '分镜.ts'), content);
    return computeMerkle([relPath(path.join(d, '分镜.ts'))]).then((r) => r.root[0]!);
  };
  const makeDefTableSource = (eventsText: string) => `const 定义 = { ${eventsText} } as const satisfies Record<string, { 在: object; basis: string }>;\nexport default 定义;\n`;

  it('只改依据不变；改帧号、秒、接的事件都变', async () => {
    const firstResult = await writeToml(makeDefTableSource(`甲: { 在: { frame: 100 }, basis: '第一版说明' }, 乙: { 在: { after: '甲', addSec: 1 }, basis: '说明' }`));
    expect(await writeToml(makeDefTableSource(`甲: { 在: { frame: 100 }, basis: '改过的说明' }, 乙: { 在: { after: '甲', addSec: 1 }, basis: '也改了' }`))).toBe(firstResult);
    expect(await writeToml(makeDefTableSource(`甲: { 在: { frame: 101 }, basis: '第一版说明' }, 乙: { 在: { after: '甲', addSec: 1 }, basis: '说明' }`))).not.toBe(firstResult);
    expect(await writeToml(makeDefTableSource(`甲: { 在: { frame: 100 }, basis: '第一版说明' }, 乙: { 在: { after: '甲', addSec: 2 }, basis: '说明' }`))).not.toBe(firstResult);
    expect(await writeToml(makeDefTableSource(`丙: { 在: { frame: 100 }, basis: '第一版说明' }, 乙: { 在: { after: '丙', addSec: 1 }, basis: '说明' }`))).not.toBe(firstResult);
  });

  it('表里各事件之间的注释（esbuild 不去）改了不变', async () => {
    const withComment = (note: string) => `const 定义 = {\n  // ${note}\n  甲: { 在: { frame: 1 }, basis: '说' },\n};\nexport default 定义;\n`;
    expect(await writeToml(withComment('改之后'))).toBe(await writeToml(withComment('改之前')));
  });

  it('别的结构里的依据改了照样变', async () => {
    const firstResult = await writeToml(`export const 屏 = { 字: '画在屏幕上', basis: '甲' };\n`);
    expect(await writeToml(`export const 屏 = { 字: '画在屏幕上', basis: '乙' };\n`)).not.toBe(firstResult);
  });

  it('真分镜：字面量的时刻依据全去掉，透传的留着', () => {
    const storyboardDir = path.join(codeRoot(), '作品/把回忆拼好给你/分镜');
    const allText = fs.readdirSync(storyboardDir).filter((f) => f.endsWith('.ts')).sort().map((f) => fs.readFileSync(path.join(storyboardDir, f), 'utf8')).join('\n');
    const strippedText = stripBasis(allText.replace(/ as const satisfies [^;]+;/g, ';'));
    expect(strippedText).toContain('basis: eventTable[eventName].basis');
    expect(strippedText).toContain('basis: w.basis');
    // 进哈希的文本里，除了类型声明和透传，再没有写死的依据
    const remaining = [...strippedText.matchAll(/basis: ['"`]/g)];
    expect(remaining.length).toBe(0);
  });
});
