import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codeRoot } from '../环境/路径.ts';
import { stripBasis } from './去依据.ts';
import { computeMerkle } from './默克尔.ts';

const relPath = (p: string) => path.relative(codeRoot(), p).split(path.sep).join('/');

describe('去依据（文本）', () => {
  it('事件：只去说明文字，时刻留着', () => {
    expect(stripBasis(`const 表 = { 甲: { 在: { 秒: 42 }, 依据: "说明" } };`)).toBe(`const 表 = { 甲: { 在: { 秒: 42 } } };`);
    expect(stripBasis(`const 表 = { 乙: { 在: { after: "甲", addSec: -1 / 20 }, 依据: "说明" } };`)).toBe(`const 表 = { 乙: { 在: { after: "甲", addSec: -1 / 20 } } };`);
  });

  it('段窗：起止和键留着', () => {
    expect(stripBasis(`排段({ 名: "串", 段们: [{ 键: "2-甲", 起: { 秒: 1 }, 止: { beat: 3 }, 依据: "说明" }, { 键: "2-乙", 止: { 帧数: 10 }, 依据: "说明" }, { 名: "丙", 止: "放完", 依据: "说明" }] });`)).toBe(
      `排段({ 名: "串", 段们: [{ 键: "2-甲", 起: { 秒: 1 }, 止: { beat: 3 } }, { 键: "2-乙", 止: { 帧数: 10 } }, { 名: "丙", 止: "放完" }] });`,
    );
  });

  it('说明换行、说明变长，结果一样', () => {
    const strippedShort = stripBasis(`const 表 = { 甲: { 在: { 秒: 42 }, 依据: "短" } };`);
    const strippedLong = stripBasis(`const 表 = { 甲: {\n  在: { 秒: 42 },\n  依据: "很长很长的一段说明，换了一行"\n} };`);
    expect(strippedLong).toBe(strippedShort);
  });

  it('有时刻条目的模块：对象里的注释也去掉，正则和字符串里长得像注释的不动', () => {
    const source = `const 表 = {\n  // 第一版注释\n  甲: { 在: { 秒: 1 }, 依据: "说" },\n  /* 块注释 */\n  乙: { 在: { 秒: 2 }, 依据: "说" } // 行尾\n  // 表尾\n};\nconst s = "// 不是注释", r = /\\/\\/x/;`;
    const edited = source.replace('第一版注释', '改过').replace('块注释', '改过').replace('行尾', '改过').replace('表尾', '改过');
    const strippedForm = stripBasis(source);
    expect(stripBasis(edited)).toBe(strippedForm);
    expect(stripBasis(source.replace('// 第一版注释', '// 两行注释\n  // 第二行'))).toBe(strippedForm);
    expect(strippedForm).not.toMatch(/注释 \*\/|第一版|行尾|表尾/);
    expect(strippedForm).toContain('"// 不是注释"');
    expect(strippedForm).toContain('/\\/\\/x/');
  });

  it('没有时刻条目的模块一个字不动，注释留着（哈希和以前一样）', () => {
    const sourceText = `const 表 = {\n  // 注释\n  甲: { 字: "说", 依据: "说" }\n};`;
    expect(stripBasis(sourceText)).toBe(sourceText);
  });

  it.each([
    ['别的结构里同名字段', `const x = { 字: "画在屏幕上", 依据: "说明" };`],
    ['只有依据一个键', `const x = { 依据: "说明" };`],
    ['解出的事件（秒、帧、依据）', `const x = { 秒: 1, 帧: 24, 依据: "说明" };`],
    ['世界声明的块', `const x = { 名: "岛", 形状: "矩形", 两角: [1, 2], 依据: "说明" };`],
    ['字幕的换屏界', `const x = { 秒: 1, 谷: null, 依据: "按音节比例" };`],
    ['在 不是时刻（数组）', `const x = { 在: [1, 2], 依据: "显示的字" };`],
    ['在 里有不认识的键', `const x = { 在: { 位置: 3 }, 依据: "显示的字" };`],
    ['在 是变量', `const x = { 在: 某处, 依据: "显示的字" };`],
    ['多一个键', `const x = { 在: { 秒: 1 }, 字: "显示的字", 依据: "说明" };`],
    ['有展开', `const x = { 在: { 秒: 1 }, ...其他, 依据: "说明" };`],
    ['依据是变量', `const x = { 在: { 秒: 1 }, 依据: 变量 };`],
    ['依据是模板拼接', 'const x = { 在: { 秒: 1 }, 依据: `第${n}句` };'],
    ['依据是函数调用', `const x = { 在: { 秒: 1 }, 依据: 算() };`],
    ['透传', `r[名] = { 秒, 帧: 歌曲帧(秒), 依据: 表[名].依据 };`],
    ['只有止没有键', `const x = { 止: { 秒: 1 }, 依据: "说明" };`],
    ['止 不是时刻', `const x = { 键: "甲", 止: 变量, 依据: "说明" };`],
    ['起 不是时刻', `const x = { 键: "甲", 起: 变量, 止: { 秒: 1 }, 依据: "说明" };`],
    ['字符串里提到依据', `const x = "依据: 说明";`],
    ['变量叫依据', `const 依据 = "说明"; 画(依据);`],
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
    return computeMerkle([relPath(path.join(d, '分镜.ts'))]).then((r) => r.根[0]!);
  };
  const makeDefTableSource = (eventsText: string) => `const 定义 = { ${eventsText} } as const satisfies Record<string, { 在: object; 依据: string }>;\nexport default 定义;\n`;

  it('只改依据不变；改帧号、秒、接的事件都变', async () => {
    const firstResult = await writeToml(makeDefTableSource(`甲: { 在: { 帧: 100 }, 依据: '第一版说明' }, 乙: { 在: { after: '甲', addSec: 1 }, 依据: '说明' }`));
    expect(await writeToml(makeDefTableSource(`甲: { 在: { 帧: 100 }, 依据: '改过的说明' }, 乙: { 在: { after: '甲', addSec: 1 }, 依据: '也改了' }`))).toBe(firstResult);
    expect(await writeToml(makeDefTableSource(`甲: { 在: { 帧: 101 }, 依据: '第一版说明' }, 乙: { 在: { after: '甲', addSec: 1 }, 依据: '说明' }`))).not.toBe(firstResult);
    expect(await writeToml(makeDefTableSource(`甲: { 在: { 帧: 100 }, 依据: '第一版说明' }, 乙: { 在: { after: '甲', addSec: 2 }, 依据: '说明' }`))).not.toBe(firstResult);
    expect(await writeToml(makeDefTableSource(`丙: { 在: { 帧: 100 }, 依据: '第一版说明' }, 乙: { 在: { after: '丙', addSec: 1 }, 依据: '说明' }`))).not.toBe(firstResult);
  });

  it('表里各事件之间的注释（esbuild 不去）改了不变', async () => {
    const withComment = (note: string) => `const 定义 = {\n  // ${note}\n  甲: { 在: { 帧: 1 }, 依据: '说' },\n};\nexport default 定义;\n`;
    expect(await writeToml(withComment('改之后'))).toBe(await writeToml(withComment('改之前')));
  });

  it('别的结构里的依据改了照样变', async () => {
    const firstResult = await writeToml(`export const 屏 = { 字: '画在屏幕上', 依据: '甲' };\n`);
    expect(await writeToml(`export const 屏 = { 字: '画在屏幕上', 依据: '乙' };\n`)).not.toBe(firstResult);
  });

  it('真分镜：字面量的时刻依据全去掉，透传的留着', () => {
    const storyboardDir = path.join(codeRoot(), '作品/把回忆拼好给你/分镜');
    const allText = fs.readdirSync(storyboardDir).filter((f) => f.endsWith('.ts')).sort().map((f) => fs.readFileSync(path.join(storyboardDir, f), 'utf8')).join('\n');
    const strippedText = stripBasis(allText.replace(/ as const satisfies [^;]+;/g, ';'));
    expect(strippedText).toContain('依据: eventTable[eventName].依据');
    expect(strippedText).toContain('依据: d.依据');
    // 进哈希的文本里，除了类型声明和透传，再没有写死的依据
    const remaining = [...strippedText.matchAll(/依据: ['"`]/g)];
    expect(remaining.length).toBe(0);
  });
});
