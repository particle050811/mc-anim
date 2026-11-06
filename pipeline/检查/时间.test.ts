import { describe, expect, it } from 'vitest';
import { 基础, 跑, 造仓库 } from './测试夹具.ts';
import { 查文件, 读帧号例外表 } from './规则/时间.ts';

const 表 = (...行: string[]) => ({ 'docs/帧号例外表.tsv': ['# 测试', '文件\t处数', ...行].join('\n') + '\n' });
const 旧段 = { '作品/应力转动/段/7-甲/旧.tsx': "import { useCurrentFrame } from 'remotion';\nexport const 甲 = () => { const f = useCurrentFrame(); return <div>{f}</div>; };\n" };

describe('时间', () => {
  it('合规：旧写法登记了；按秒写的、时间工具自己、注释和字符串里的不算；别的作品的行不管', async () => {
    const 根 = 造仓库(基础(), 旧段, 表('作品/应力转动/段/7-甲/旧.tsx\t1', '作品/别的/段/x/画面.tsx\t3'), {
      '作品/应力转动/段/7-甲/新.tsx': "import { use当前秒 } from '@engine/段/时间.tsx';\n// 以前是 useCurrentFrame()\nexport const 新 = () => <div>{use当前秒() + 'useCurrentFrame()'}</div>;\n",
      'engine/段/时间.tsx': "import { useCurrentFrame } from 'remotion';\nexport const use当前秒 = () => useCurrentFrame() / 24;\n",
    });
    const { 违规, 报 } = await 跑('时间', 根);
    expect(违规, 违规.join('\n')).toEqual([]);
    expect(报.信息.join('\n')).toMatch(/还有 1 处直接调帧号/);
  });

  it('新写的直接调用、use编排fps 都报；登记多了、文件没了要把表改小', async () => {
    const 根 = 造仓库(基础(), 旧段, 表('作品/应力转动/段/7-甲/旧.tsx\t2', '库/没了.tsx\t1'), {
      '库/新/动.tsx': "import { use编排fps } from '@engine/段/编排时钟.tsx';\nexport const 动 = () => use编排fps();\n",
    });
    const v = (await 跑('时间', 根)).违规.join('\n');
    expect(v).toMatch(/库\/新\/动.tsx:2 直接调 useCurrentFrame\(\)\/use编排fps\(\) 1 处（第 2 行），例外表登记 0 处：按秒写/);
    expect(v).toMatch(/旧.tsx 直接调帧号的现在 1 处，例外表登记 2 处/);
    expect(v).toMatch(/库\/没了.tsx 有 1 处，现在文件都没了/);
  });

  it('没有例外表、表头不对、处数不是正整数都报', async () => {
    expect((await 跑('时间', 造仓库(基础()))).违规.join('\n')).toMatch(/没有 docs\/帧号例外表.tsv/);
    expect(读帧号例外表('文件\t数\n').错).toHaveLength(1);
    expect(读帧号例外表('文件\t处数\na.tsx\t0\na.tsx\t1\na.tsx\t1\n').错).toHaveLength(2);
  });

  it('查文件：只认调用（标识符），不认属性和别名对象上的同名方法', () => {
    expect(查文件('a.tsx', 'const a = useCurrentFrame();\nconst b = x.useCurrentFrame();\nconst c = use编排fps();\n')).toEqual([1, 3]);
  });
});
