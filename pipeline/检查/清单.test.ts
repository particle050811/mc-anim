import { describe, expect, it } from 'vitest';
import { base, runRule, makeRepo } from './测试夹具.ts';
import { isSegKeyValid } from './规则/清单.ts';

const segList = (...segKeys: string[]) => ({
  '作品/应力转动/清单.ts': [
    `export const 清单 = [${segKeys.map((k) => `{ 键: '${k}', 章: ${k.startsWith('核对-') ? "'核对'" : k.split('-')[0]} }`).join(', ')}];`,
    "export const 段目录 = (键: string) => (键.startsWith('核对-') ? `核对/${键.slice(3)}` : `段/${键}`);",
  ].join('\n'),
});
const makeSeg = (segKey: string, defSource: string) => ({
  [`作品/应力转动/段/${segKey}/段.ts`]: `import { 定义段 } from '@engine/段/段定义.ts';\nexport default 定义段(${defSource});\n`,
  [`作品/应力转动/段/${segKey}/画面.tsx`]: 'export default () => null;\n',
});

describe('清单', () => {
  it('合规样例放行：两段同场连续、首尾正好接上，核对段在 作品/应力转动/核对/', async () => {
    const root = makeRepo(
      base(),
      segList('7-甲', '7-乙', '核对-看看'),
      makeSeg('7-甲', "{ 场: '7-场一', 秒: 10, 宽: 4, 高: 4, 地形: [], 场窗口: { 起秒: 0, 止秒: 10 } }"),
      makeSeg('7-乙', "{ 场: '7-场一', 秒: 5, 宽: 4, 高: 4, 地形: [], 场窗口: { 起秒: 10, 止秒: 15 }, 连续: true }"),
      { '作品/应力转动/核对/看看/段.ts': "import { 定义段 } from '@engine/段/段定义.ts';\nexport default 定义段({ 场: '核对', 秒: 1, 宽: 4, 高: 4, 地形: [] });\n", '作品/应力转动/核对/看看/画面.tsx': 'export default () => null;\n' },
    );
    expect((await runRule('清单', root)).violations).toEqual([]);
  });

  it('目录不在清单、段键不合规、段名重复、撞旧名、连续段没接上都拦', async () => {
    const root = makeRepo(
      base(),
      segList('7-甲', '7-乙', '8-甲', '7-老名', '7-丙_x'),
      makeSeg('7-乙', "{ 场: '7-场一', 秒: 5, 宽: 4, 高: 4, 地形: [], 场窗口: { 起秒: 11, 止秒: 16 }, 连续: true }"),
      makeSeg('7-甲', "{ 场: '7-场一', 秒: 10, 宽: 4, 高: 4, 地形: [], 场窗口: { 起秒: 0, 止秒: 10 } }"),
      makeSeg('8-甲', "{ 场: '8-场', 秒: 1, 宽: 4, 高: 4, 地形: [] }"),
      makeSeg('7-老名', "{ 场: '7-场一', 秒: 1, 宽: 4, 高: 4, 地形: [] }"),
      makeSeg('7-多余', "{ 场: '7-场一', 秒: 1, 宽: 4, 高: 4, 地形: [] }"),
    );
    const v = (await runRule('清单', root)).violations.join('\n');
    expect(v).toMatch(/作品\/应力转动\/段\/7-多余\/ 不在清单里/);
    expect(v).toMatch(/段键要是 7-<段名>.*7-丙_x/);
    expect(v).toMatch(/段名「甲」重复：7-甲 和 8-甲/);
    expect(v).toMatch(/段键 7-老名 撞了旧名表第 3 行的旧名「7-老名」/);
    expect(v).toMatch(/7-乙 标了 连续：上一段 7-甲 止于场时间线第 10 秒，本段起于第 11 秒/);
  });

  it('注册.tsx 收的目录没有文件：报出来（新作品还没有正片段、段/ 没占位）', async () => {
    const registrationFiles = {
      '作品/应力转动/注册.tsx': "export const 模块 = { 段: import.meta.webpackContext('./段', { regExp: /x/ }), 核对: import.meta.webpackContext('./核对', { regExp: /x/ }) };\n",
    };
    const v = (await runRule('清单', makeRepo(base(), registrationFiles))).violations.join('\n');
    expect(v).toMatch(/作品\/应力转动\/核对\/ 没有文件/);
    expect(v).not.toMatch(/作品\/应力转动\/段\/ 没有文件/);
    expect((await runRule('清单', makeRepo(base(), registrationFiles, { '作品/应力转动/核对/说明.md': '占位\n' }))).violations).toEqual([]);
  });

  it('段键规则', () => {
    expect(isSegKeyValid('6-斩娜迦', 6)).toBe(true);
    expect(isSegKeyValid('6-贪功钻出Warden', 6)).toBe(true);
    expect(isSegKeyValid('6-斩-娜迦', 6)).toBe(false);
    expect(isSegKeyValid('7-斩娜迦', 6)).toBe(false);
    expect(isSegKeyValid('核对-冒烟', '核对')).toBe(true);
    expect(isSegKeyValid('核对-6-羊毛搜刮-关键帧', '核对')).toBe(true);
  });
});

describe('加载', () => {
  it('纯模块执行得了就放行', async () => {
    const { violations, report } = await runRule('加载', makeRepo(base()));
    expect(violations).toEqual([]);
    expect(report.infoLines[0]).toMatch(/执行了 4 个纯模块/);
  });

  it('段.ts、时间线.ts 里的断言 throw 了就拦', async () => {
    const root = makeRepo(base(), makeSeg('7-甲', "{ 场: '7-场一', 秒: 10, 宽: 4, 高: 4, 地形: [], 场窗口: { 起秒: 0, 止秒: 9 } }"), {
      '作品/应力转动/场/7-场一/时间线.ts': "const 事件 = { 起: 30, 止: 20 };\nif (事件.止 < 事件.起) throw new Error('时间线：止 在 起 前面');\nexport default 事件;\n",
    });
    const v = (await runRule('加载', root)).violations.join('\n');
    expect(v).toMatch(/作品\/应力转动\/段\/7-甲\/段.ts 执行出错：场窗口 \[0, 9\) 有 9 秒，段长是 10 秒/);
    expect(v).toMatch(/作品\/应力转动\/场\/7-场一\/时间线.ts 执行出错：时间线：止 在 起 前面/);
  });
});
