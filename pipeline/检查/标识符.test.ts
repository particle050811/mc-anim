import { describe, expect, it } from 'vitest';
import { makeRepo, runRule } from './测试夹具.ts';
import { hanBaselinePath, hanIdentifiers } from './规则/标识符.ts';

const baselineFile = (...names: string[]) => ({ [hanBaselinePath]: ['# 测试', ...names].join('\n') + '\n' });

describe('标识符', () => {
  it('只认语法树里的标识符：字符串、注释、模板字符串、JSX 文本、正则不算', () => {
    const src = [
      '// 注释里的 长度 不算',
      "const label = '字符串里的 宽度';",
      'const t = `模板 ${label} 中段 ${label} 结尾`;',
      'const re = /[一-龥]+/;',
      'export const View = () => <div title="属性值">文本 {t}{re.source}</div>;',
      'export const 起秒 = 1;',
      'const o = { 高: 2, "引号键": 3 };',
      'export const y = o.高 + 起秒;',
    ].join('\n');
    expect(Object.fromEntries(hanIdentifiers('a.tsx', src))).toEqual({ '起秒': [6, 8], '高': [7, 8] });
  });

  it('合规：代码里的中文名都在基线里', async () => {
    const root = makeRepo(baselineFile('起秒', '高'), { 'engine/a.ts': 'export const 起秒 = 1;\nexport const y = ({ 高: 2 }).高 + 起秒;\n' });
    const { violations, report } = await runRule('idents', root);
    expect(violations).toEqual([]);
    expect(report.infoLines.join('\n')).toMatch(/基线 2 个名字，代码里现有 2 个/);
  });

  it('新的中文名报出来，基线里没了的名字提示删行，没有基线也报', async () => {
    const root = makeRepo(baselineFile('起秒', '旧名字'), { 'pipeline/b.ts': 'export const 起秒 = 1;\n\nexport const 新变量 = 起秒;\n' });
    const v = (await runRule('idents', root)).violations.join('\n');
    expect(v).toMatch(/pipeline\/b\.ts:3 新的中文标识符「新变量」（1 处：pipeline\/b\.ts:3）/);
    expect(v).toMatch(/基线里有 1 个名字代码里已经没有了，从 pipeline\/检查\/中文标识符基线\.txt 删掉这几行：旧名字/);
    expect((await runRule('idents', makeRepo({ 'engine/a.ts': 'export const x = 1;\n' }))).violations.join()).toMatch(/没有 pipeline\/检查\/中文标识符基线\.txt/);
  });
});
