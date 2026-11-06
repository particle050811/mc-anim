import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { 代码根 } from '../环境/路径.ts';
import { 去依据 } from './去依据.ts';
import { 算默克尔 } from './默克尔.ts';

const 相对 = (p: string) => path.relative(代码根(), p).split(path.sep).join('/');

describe('去依据（文本）', () => {
  it('事件：只去说明文字，时刻留着', () => {
    expect(去依据(`const 表 = { 甲: { 在: { 秒: 42 }, 依据: "说明" } };`)).toBe(`const 表 = { 甲: { 在: { 秒: 42 } } };`);
    expect(去依据(`const 表 = { 乙: { 在: { 接: "甲", 加秒: -1 / 20 }, 依据: "说明" } };`)).toBe(`const 表 = { 乙: { 在: { 接: "甲", 加秒: -1 / 20 } } };`);
  });

  it('段窗：起止和键留着', () => {
    expect(去依据(`排段({ 名: "串", 段们: [{ 键: "2-甲", 起: { 秒: 1 }, 止: { 拍: 3 }, 依据: "说明" }, { 键: "2-乙", 止: { 帧数: 10 }, 依据: "说明" }, { 名: "丙", 止: "放完", 依据: "说明" }] });`)).toBe(
      `排段({ 名: "串", 段们: [{ 键: "2-甲", 起: { 秒: 1 }, 止: { 拍: 3 } }, { 键: "2-乙", 止: { 帧数: 10 } }, { 名: "丙", 止: "放完" }] });`,
    );
  });

  it('说明换行、说明变长，结果一样', () => {
    const 甲 = 去依据(`const 表 = { 甲: { 在: { 秒: 42 }, 依据: "短" } };`);
    const 乙 = 去依据(`const 表 = { 甲: {\n  在: { 秒: 42 },\n  依据: "很长很长的一段说明，换了一行"\n} };`);
    expect(乙).toBe(甲);
  });

  it('有时刻条目的模块：对象里的注释也去掉，正则和字符串里长得像注释的不动', () => {
    const 甲 = `const 表 = {\n  // 第一版注释\n  甲: { 在: { 秒: 1 }, 依据: "说" },\n  /* 块注释 */\n  乙: { 在: { 秒: 2 }, 依据: "说" } // 行尾\n  // 表尾\n};\nconst s = "// 不是注释", r = /\\/\\/x/;`;
    const 乙 = 甲.replace('第一版注释', '改过').replace('块注释', '改过').replace('行尾', '改过').replace('表尾', '改过');
    const 去 = 去依据(甲);
    expect(去依据(乙)).toBe(去);
    expect(去依据(甲.replace('// 第一版注释', '// 两行注释\n  // 第二行'))).toBe(去);
    expect(去).not.toMatch(/注释 \*\/|第一版|行尾|表尾/);
    expect(去).toContain('"// 不是注释"');
    expect(去).toContain('/\\/\\/x/');
  });

  it('没有时刻条目的模块一个字不动，注释留着（哈希和以前一样）', () => {
    const 文本 = `const 表 = {\n  // 注释\n  甲: { 字: "说", 依据: "说" }\n};`;
    expect(去依据(文本)).toBe(文本);
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
  ])('不吃：%s', (_, 文本) => {
    expect(去依据(文本)).toBe(文本);
  });
});

describe('去依据（模块哈希）', () => {
  let d: string;
  beforeEach(() => {
    d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-去依据-')));
  });
  afterEach(() => fs.rmSync(d, { recursive: true, force: true }));
  const 写 = (内容: string) => {
    fs.writeFileSync(path.join(d, '分镜.ts'), 内容);
    return 算默克尔([相对(path.join(d, '分镜.ts'))]).then((r) => r.根[0]!);
  };
  const 表 = (事件: string) => `const 定义 = { ${事件} } as const satisfies Record<string, { 在: object; 依据: string }>;\nexport default 定义;\n`;

  it('只改依据不变；改帧号、秒、接的事件都变', async () => {
    const 原 = await 写(表(`甲: { 在: { 帧: 100 }, 依据: '第一版说明' }, 乙: { 在: { 接: '甲', 加秒: 1 }, 依据: '说明' }`));
    expect(await 写(表(`甲: { 在: { 帧: 100 }, 依据: '改过的说明' }, 乙: { 在: { 接: '甲', 加秒: 1 }, 依据: '也改了' }`))).toBe(原);
    expect(await 写(表(`甲: { 在: { 帧: 101 }, 依据: '第一版说明' }, 乙: { 在: { 接: '甲', 加秒: 1 }, 依据: '说明' }`))).not.toBe(原);
    expect(await 写(表(`甲: { 在: { 帧: 100 }, 依据: '第一版说明' }, 乙: { 在: { 接: '甲', 加秒: 2 }, 依据: '说明' }`))).not.toBe(原);
    expect(await 写(表(`丙: { 在: { 帧: 100 }, 依据: '第一版说明' }, 乙: { 在: { 接: '丙', 加秒: 1 }, 依据: '说明' }`))).not.toBe(原);
  });

  it('表里各事件之间的注释（esbuild 不去）改了不变', async () => {
    const 带注释 = (注: string) => `const 定义 = {\n  // ${注}\n  甲: { 在: { 帧: 1 }, 依据: '说' },\n};\nexport default 定义;\n`;
    expect(await 写(带注释('改之后'))).toBe(await 写(带注释('改之前')));
  });

  it('别的结构里的依据改了照样变', async () => {
    const 原 = await 写(`export const 屏 = { 字: '画在屏幕上', 依据: '甲' };\n`);
    expect(await 写(`export const 屏 = { 字: '画在屏幕上', 依据: '乙' };\n`)).not.toBe(原);
  });

  it('真分镜：字面量的时刻依据全去掉，透传的留着', () => {
    const 目录 = path.join(代码根(), '作品/把回忆拼好给你/分镜');
    const 文本 = fs.readdirSync(目录).filter((f) => f.endsWith('.ts')).sort().map((f) => fs.readFileSync(path.join(目录, f), 'utf8')).join('\n');
    const 去后 = 去依据(文本.replace(/ as const satisfies [^;]+;/g, ';'));
    expect(去后).toContain('依据: 表[名].依据');
    expect(去后).toContain('依据: d.依据');
    // 进哈希的文本里，除了类型声明和透传，再没有写死的依据
    const 剩 = [...去后.matchAll(/依据: ['"`]/g)];
    expect(剩.length).toBe(0);
  });
});
