// 类型规则真跑 tsc、ruff、pyright，样例仓库各带自己的配置，不吃用户全局的 ruff 设置
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 代码根 } from '../环境/路径.ts';
import { 报告, 检查上下文 } from './上下文.ts';
import { 跑tsc, tsc缓存文件 } from './规则/类型.ts';
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

  describe('tsc 增量缓存：结果和从头查的一样', () => {
    const 好 = 'export const 加 = (a: number, b: number): number => a + b;\n';
    /** 查两遍：带缓存的（先于它的查询留下的缓存还在）和从头查的（--深 不读缓存），必须一样才返回 */
    const 查 = (根: string) => {
      const 跑一遍 = (深: boolean) => {
        const c = new 检查上下文(根, { 深 });
        const 报 = new 报告();
        跑tsc(c, 报);
        return 报.违规.map((q) => q.文本);
      };
      const 增量 = 跑一遍(false);
      expect(增量).toEqual(跑一遍(true));
      return 增量.join('\n');
    };
    const 写 = (根: string, p: string, 内容: string) => {
      fs.mkdirSync(path.dirname(path.join(根, p)), { recursive: true });
      fs.writeFileSync(path.join(根, p), 内容);
    };

    it('改文件、没改再查、修好：结果跟着变，错不会因为命中缓存被吞', () => {
      const 根 = 造仓库(配置, { 'pipeline/a.ts': 好, 'pipeline/b.ts': "import { 加 } from './a.ts';\nexport const 三 = 加(1, 2);\n" });
      expect(查(根)).toBe('');
      expect(fs.existsSync(tsc缓存文件(new 检查上下文(根)))).toBe(true);
      写(根, 'pipeline/a.ts', 'export const 加 = (a: string, b: number): number => b;\n'); // 只改 a，错报在没动过的 b
      expect(查(根)).toMatch(/pipeline\/b.ts\(2,.*error TS2345/);
      expect(查(根)).toMatch(/pipeline\/b.ts\(2,.*error TS2345/);
      写(根, 'pipeline/a.ts', 好);
      expect(查(根)).toBe('');
    }, 120_000);

    it('新增、删除文件，模块解析变了', () => {
      const 根 = 造仓库(配置, { 'pipeline/a.ts': 好, 'pipeline/b.ts': "import { 加 } from './a.ts';\nexport const 三 = 加(1, 2);\n" });
      expect(查(根)).toBe('');
      写(根, 'pipeline/新.ts', "export const 坏: number = '字';\n");
      expect(查(根)).toMatch(/pipeline\/新.ts\(1,.*error TS2322/);
      fs.rmSync(path.join(根, 'pipeline/新.ts'));
      expect(查(根)).toBe('');
      fs.rmSync(path.join(根, 'pipeline/a.ts'));
      expect(查(根)).toMatch(/pipeline\/b.ts\(1,.*error TS2307/);
      写(根, 'pipeline/a.ts', 好);
      expect(查(根)).toBe('');
    }, 120_000);

    it('改 tsconfig、改依赖包的类型声明', () => {
      const 根 = 造仓库(配置, {
        'pipeline/a.ts': "import { 包值 } from '假包';\nexport const 数: number = 包值;\nexport const f = (x: number) => { const 没用 = x; return x; };\n",
        'node_modules/假包/package.json': JSON.stringify({ name: '假包', version: '1.0.0', types: 'index.d.ts' }),
        'node_modules/假包/index.d.ts': 'export declare const 包值: number;\n',
      });
      expect(查(根)).toBe('');
      写(根, 'node_modules/假包/index.d.ts', 'export declare const 包值: string;\n');
      expect(查(根)).toMatch(/pipeline\/a.ts\(2,.*error TS2322/);
      写(根, 'node_modules/假包/index.d.ts', 'export declare const 包值: number;\n');
      expect(查(根)).toBe('');
      const 严 = JSON.parse(配置['tsconfig.json']) as { compilerOptions: Record<string, unknown> };
      严.compilerOptions.noUnusedLocals = true;
      写(根, 'tsconfig.json', JSON.stringify(严));
      expect(查(根)).toMatch(/pipeline\/a.ts\(3,.*error TS6133/);
    }, 120_000);

    it('缓存文件坏了、空了也照常查，不当通过', () => {
      const 根 = 造仓库(配置, { 'pipeline/a.ts': "export const 坏: number = '字';\n" });
      expect(查(根)).toMatch(/error TS2322/);
      const 缓存 = tsc缓存文件(new 检查上下文(根));
      for (const 坏内容 of ['{不是 JSON', '', '{}', '{"version":"0.0.0"}']) {
        fs.writeFileSync(缓存, 坏内容);
        expect(查(根)).toMatch(/error TS2322/);
      }
    }, 120_000);

    it('--深 不读不写缓存；缓存不进仓库', () => {
      const 根 = 造仓库(配置, { 'pipeline/a.ts': 好 });
      const c = new 检查上下文(根, { 深: true });
      跑tsc(c, new 报告());
      expect(fs.existsSync(tsc缓存文件(c))).toBe(false);
      expect(path.relative(根, tsc缓存文件(c)).split(path.sep).slice(0, 2)).toEqual(['node_modules', '.cache']);
      expect(fs.readFileSync(path.join(代码根(), '.gitignore'), 'utf8').split('\n')).toContain('node_modules/');
    }, 120_000);
  });
});
