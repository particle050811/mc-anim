// 类型规则真跑 tsc、ruff、pyright，样例仓库各带自己的配置，不吃用户全局的 ruff 设置
import { describe, expect, it } from 'vitest';
import { 跑, 造仓库 } from './测试夹具.ts';

const 配置 = {
  'tsconfig.json': JSON.stringify({
    compilerOptions: { strict: true, noEmit: true, target: 'es2022', module: 'esnext', moduleResolution: 'bundler', allowImportingTsExtensions: true, types: [] },
    include: ['pipeline'],
  }),
  'pyproject.toml': ['[project]', 'name = "样例"', 'version = "0"', '[tool.ruff]', 'target-version = "py311"', '[tool.ruff.lint]', 'select = ["E4", "E7", "E9", "F"]', '[tool.pyright]', 'include = ["py"]', 'pythonVersion = "3.11"'].join('\n'),
};

describe('类型', () => {
  it('合规样例放行', async () => {
    const 根 = 造仓库(配置, {
      'pipeline/a.ts': 'export const 加 = (a: number, b: number): number => a + b;\n',
      'py/srpy/a.py': 'def 加(a: int, b: int) -> int:\n    return a + b\n',
    });
    expect((await 跑('类型', 根)).违规).toEqual([]);
  });

  it('tsc、ruff、pyright 的错都拦', async () => {
    const 根 = 造仓库(配置, {
      'pipeline/a.ts': "export const 加 = (a: number, b: number): number => a + b;\nexport const 坏: number = 加(1, '2');\n",
      'py/srpy/a.py': 'import os\n\n\ndef 加(a: int, b: int) -> int:\n    return a + b\n\n\n坏: str = 加(1, 2)\n',
    });
    const v = (await 跑('类型', 根)).违规.join('\n');
    expect(v).toMatch(/tsc：pipeline\/a.ts\(2,.*error TS2345/);
    expect(v).toMatch(/ruff：py\/srpy\/a.py:1:8: F401/);
    expect(v).toMatch(/pyright：.*py\/srpy\/a.py:8:.* - error: /);
  });
});
