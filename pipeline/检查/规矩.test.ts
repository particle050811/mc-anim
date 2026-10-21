import { describe, expect, it } from 'vitest';
import { 基础, 跑, 造仓库 } from './测试夹具.ts';
import { 解析落点 } from './规则/规矩.ts';

const 规矩表 = (落点: string, 例外: string) => ({
  'rules/规矩.toml': [
    '[["规矩"]]',
    'id = "打击停顿"',
    '"默认值" = 1',
    '"级别" = "参考"',
    '"原话" = []',
    '"针对" = "打中"',
    '"出处" = ["测试"]',
    `"落点" = ${落点}`,
    `"例外" = ${例外}`,
  ].join('\n'),
});
const 画面 = (调用: string) => ({
  'content/段/7-甲/画面.tsx': `import { 例外 } from '../../../engine/core/例外.ts';\nexport const 停 = ${调用};\nexport default () => null;\n`,
});

describe('规矩', () => {
  it('合规样例放行：代码例外和表一一对应、值相同；旧项目里的落点和没搬的段只算待迁移', async () => {
    const 根 = 造仓库(
      基础(),
      规矩表(
        '["engine/core/例外.ts 例外", "旧:src/lib/anim.ts HIT_STOP_FRAMES", "待迁移:sourcing/worlds/（M10 建）"]',
        '[{ "段" = "7-甲", "值" = 3, "原因" = "看过的版本", "出处" = "用户 10-21" }, { "段" = "6-斩娜迦", "值" = 2, "原因" = "看过的版本", "出处" = "用户 10-21" }]',
      ),
      画面("例外('打击停顿', 3, { 段: '7-甲', 原因: '看过的版本' })"),
    );
    const { 违规, 报 } = await 跑('规矩', 根);
    expect(违规).toEqual([]);
    expect(报.待迁移.map((q) => q.文本)).toEqual([
      '规矩「打击停顿」 的落点 旧:src/lib/anim.ts HIT_STOP_FRAMES',
      '规矩「打击停顿」 的落点 待迁移:sourcing/worlds/（M10 建）',
      '规矩「打击停顿」对 段 6-斩娜迦 的例外（段 6-斩娜迦 还没搬）',
    ]);
  });

  it('代码例外没登记、登记了代码里没有、值不一致、规矩不存在、写错地方、落点不在都拦', async () => {
    const 根 = 造仓库(
      基础(),
      规矩表(
        '["engine/core/例外.ts 例外、没有的符号", "engine/core/不存在.ts", "engine/core 例外", "src/lib/anim.ts"]',
        '[{ "段" = "7-甲", "值" = 2, "原因" = "看过的版本", "出处" = "用户" }, { "场" = "7-场一", "值" = 1, "原因" = "整场", "出处" = "用户" }]',
      ),
      画面("[例外('打击停顿', 3, { 段: '7-甲', 原因: 'x' }), 例外('没有这条', 1, { 段: '7-甲', 原因: 'x' }), 例外('打击停顿', 4, { 段: '7-乙', 原因: 'x' })]"),
      { 'world/角色/甲.ts': "import { 例外 } from '../../engine/core/例外.ts';\nexport const 甲 = 例外('打击停顿', 5, { 段: '7-甲', 原因: '共用代码开口子' });\n" },
    );
    const v = (await 跑('规矩', 根)).违规.join('\n');
    expect(v).toMatch(/画面.tsx:2 规矩「打击停顿」对 段 7-甲 的例外：代码里的值是 3，表里登记的是 2/);
    expect(v).toMatch(/例外用的规矩「没有这条」不在 rules\/规矩.toml 里/);
    expect(v).toMatch(/content\/段\/7-甲\/ 里的例外要写 段: '7-甲'/);
    expect(v).toMatch(/world\/角色\/甲.ts:2 例外 只写在 content\/段\/ 或 content\/场\//);
    expect(v).toMatch(/规矩「打击停顿」登记了对 场 7-场一 的例外，代码里却没有/);
    expect(v).toMatch(/落点 engine\/core\/例外.ts 里找不到符号 没有的符号/);
    expect(v).toMatch(/落点 engine\/core\/不存在.ts 不存在/);
    expect(v).toMatch(/落点 engine\/core 是目录，写了符号就要落到具体文件/);
    expect(v).toMatch(/落点「src\/lib\/anim.ts」要写成 <路径> \[符号、符号…\]/);
  });

  it('搬家 R2-A 暂放在 world/地点/<地点>/<旧目录>/ 的剧情编排里可以写例外，别的 world 照拦', async () => {
    const 根 = 造仓库(
      基础(),
      规矩表('[]', '[{ "段" = "7-甲", "值" = 2, "原因" = "看过的版本", "出处" = "用户 10-21" }]'),
      { 'world/地点/边城/6-3-6/落地.ts': "import { 例外 } from '../../../../engine/core/例外.ts';\nexport const 停 = 例外('打击停顿', 2, { 段: '7-甲', 原因: '看过的版本' });\n" },
      { 'world/地点/边城轮廓.ts': "import { 例外 } from '../../engine/core/例外.ts';\nexport const 停 = 例外('打击停顿', 2, { 段: '7-甲', 原因: '看过的版本' });\n" },
    );
    const v = (await 跑('规矩', 根)).违规;
    expect(v.join('\n')).toMatch(/world\/地点\/边城轮廓.ts:2 例外 只写在 content\/段\/ 或 content\/场\//);
    expect(v.filter((x) => x.includes('6-3-6'))).toEqual([]);
  });

  it('场里被几段借用的代码，段 写成数组：每段各登记一条，少登记的拦；段目录里不许写数组', async () => {
    const 根 = 造仓库(
      基础(),
      规矩表('[]', '[{ "段" = "7-甲", "值" = 2, "原因" = "x", "出处" = "y" }, { "段" = "7-乙", "值" = 2, "原因" = "x", "出处" = "y" }]'),
      { 'content/场/7-场一/画面.tsx': "import { 例外 } from '../../../engine/core/例外.ts';\nexport const 停 = 例外('打击停顿', 2, { 段: ['7-甲', '7-乙', '7-丙'], 原因: '借用' });\n" },
      画面("例外('打击停顿', 2, { 段: ['7-甲'], 原因: 'x' })"),
    );
    const v = (await 跑('规矩', 根)).违规.join('\n');
    expect(v).toMatch(/content\/场\/7-场一\/画面.tsx:2 规矩「打击停顿」对 段 7-丙 的例外没在 rules\/规矩.toml 登记/);
    expect(v).not.toMatch(/对 段 7-乙 的例外没在/);
    expect(v).toMatch(/content\/段\/7-甲\/画面.tsx:2 content\/段\/7-甲\/ 里的例外要写 段: '7-甲'/);
  });

  it('代码例外没登记就拦', async () => {
    const 根 = 造仓库(基础(), 画面("例外('打击停顿', 3, { 段: '7-甲', 原因: '看过的版本' })"));
    expect((await 跑('规矩', 根)).违规.join('\n')).toMatch(/规矩「打击停顿」对 段 7-甲 的例外没在 rules\/规矩.toml 登记/);
  });

  it('改名导入、命名空间导入、转出、把 例外 当值传都拦，x.例外(...) 也算例外调用', async () => {
    const 根 = 造仓库(基础(), {
      'content/段/7-甲/画面.tsx': [
        "import { 例外 as 豁免 } from '../../../engine/core/例外.ts';",
        "import * as 核 from '../../../engine/core/例外';",
        "export const a = 豁免('打击停顿', 6, { 段: '7-甲', 原因: 'x' });",
        "export const b = 核.例外('打击停顿', 7, { 段: '7-甲', 原因: 'x' });",
        'export default () => null;',
        '',
      ].join('\n'),
      'content/段/7-甲/别名.ts': "import { 例外 } from '../../../engine/core/例外.ts';\nexport const 豁免 = 例外;\nexport { 例外 as 开口 };\n",
      'world/转出.ts': "export * from '../engine/core/例外.ts';\n",
    });
    const v = (await 跑('规矩', 根)).违规.join('\n');
    expect(v).toMatch(/画面.tsx:1 不许给 例外 改名导入/);
    expect(v).toMatch(/画面.tsx:2 不许用命名空间导入 engine\/core\/例外.ts/);
    expect(v).toMatch(/画面.tsx:4 规矩「打击停顿」对 段 7-甲 的例外没在 rules\/规矩.toml 登记/);
    expect(v).toMatch(/别名.ts:2 例外 只能直接调用/);
    expect(v).toMatch(/别名.ts:3 不许转出 例外/);
    expect(v).toMatch(/world\/转出.ts:1 不许转出 engine\/core\/例外.ts/);
  });

  it('落点格式', () => {
    expect(解析落点('engine/core/例外.ts 例外、例外依据')).toEqual({ 路径: 'engine/core/例外.ts', 符号: ['例外', '例外依据'] });
    expect(解析落点('world/角色/跑步.ts（照旧 跑步.ts） runPoseAt')).toEqual({ 路径: 'world/角色/跑步.ts', 符号: ['runPoseAt'] });
    expect(解析落点('rules/')).toEqual({ 路径: 'rules', 符号: [] });
    expect(解析落点('旧:src/lib/anim.ts X')).toEqual({ 待迁移: true });
    expect('错' in 解析落点('参考模型库/src/x.ts')).toBe(true);
  });
});
