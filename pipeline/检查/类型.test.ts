// 类型规则真跑 tsc、ruff、pyright，样例仓库各带自己的配置，不吃用户全局的 ruff 设置
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { codeRoot } from '../环境/路径.ts';
import { CheckReport, CheckContext } from '../源码/上下文.ts';
import { runTsc, tscCacheFile } from './规则/类型.ts';
import { runRule, makeRepo } from './测试夹具.ts';

const config = {
  'tsconfig.json': JSON.stringify({
    compilerOptions: { strict: true, noEmit: true, target: 'es2022', module: 'esnext', moduleResolution: 'bundler', allowImportingTsExtensions: true, types: [] },
    include: ['pipeline'],
  }),
  'pyproject.toml': ['[project]', 'name = "样例"', 'version = "0"', '[tool.ruff]', 'target-version = "py311"', '[tool.ruff.lint]', 'select = ["E4", "E7", "E9", "F"]', '[tool.pyright]', 'include = ["py"]', 'pythonVersion = "3.11"'].join('\n'),
};

describe('类型', () => {
  it('合规样例放行', async () => {
    const root = makeRepo(config, {
      'pipeline/a.ts': 'export const 加 = (a: number, b: number): number => a + b;\n',
      'py/srpy/a.py': 'def 加(a: int, b: int) -> int:\n    return a + b\n',
    });
    expect((await runRule('types', root)).violations).toEqual([]);
  });

  it('tsc、ruff、pyright 的错都拦', async () => {
    const root = makeRepo(config, {
      'pipeline/a.ts': "export const 加 = (a: number, b: number): number => a + b;\nexport const 坏: number = 加(1, '2');\n",
      'py/srpy/a.py': 'import os\n\n\ndef 加(a: int, b: int) -> int:\n    return a + b\n\n\n坏: str = 加(1, 2)\n',
    });
    const v = (await runRule('types', root)).violations.join('\n');
    expect(v).toMatch(/tsc：pipeline\/a.ts\(2,.*error TS2345/);
    expect(v).toMatch(/ruff：py\/srpy\/a.py:1:8: F401/);
    expect(v).toMatch(/pyright：.*py\/srpy\/a.py:8:.* - error: /);
  });

  describe('tsc 增量缓存：结果和从头查的一样', () => {
    const validSource = 'export const 加 = (a: number, b: number): number => a + b;\n';
    /** 查两遍：带缓存的（先于它的查询留下的缓存还在）和从头查的（--deep 不读缓存），必须一样才返回 */
    const checkTypes = (root: string) => {
      const runOnce = (depthCheck: boolean) => {
        const c = new CheckContext(root, { depthCheck });
        const report = new CheckReport();
        runTsc(c, report);
        return report.violations.map((q) => q.文本);
      };
      const incrementalRun = runOnce(false);
      expect(incrementalRun).toEqual(runOnce(true));
      return incrementalRun.join('\n');
    };
    const writeFile = (root: string, p: string, content: string) => {
      fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
      fs.writeFileSync(path.join(root, p), content);
    };

    it('改文件、没改再查、修好：结果跟着变，错不会因为命中缓存被吞', () => {
      const root = makeRepo(config, { 'pipeline/a.ts': validSource, 'pipeline/b.ts': "import { 加 } from './a.ts';\nexport const 三 = 加(1, 2);\n" });
      expect(checkTypes(root)).toBe('');
      expect(fs.existsSync(tscCacheFile(new CheckContext(root)))).toBe(true);
      writeFile(root, 'pipeline/a.ts', 'export const 加 = (a: string, b: number): number => b;\n'); // 只改 a，错报在没动过的 b
      expect(checkTypes(root)).toMatch(/pipeline\/b.ts\(2,.*error TS2345/);
      expect(checkTypes(root)).toMatch(/pipeline\/b.ts\(2,.*error TS2345/);
      writeFile(root, 'pipeline/a.ts', validSource);
      expect(checkTypes(root)).toBe('');
    }, 120_000);

    it('新增、删除文件，模块解析变了', () => {
      const root = makeRepo(config, { 'pipeline/a.ts': validSource, 'pipeline/b.ts': "import { 加 } from './a.ts';\nexport const 三 = 加(1, 2);\n" });
      expect(checkTypes(root)).toBe('');
      writeFile(root, 'pipeline/新.ts', "export const 坏: number = '字';\n");
      expect(checkTypes(root)).toMatch(/pipeline\/新.ts\(1,.*error TS2322/);
      fs.rmSync(path.join(root, 'pipeline/新.ts'));
      expect(checkTypes(root)).toBe('');
      fs.rmSync(path.join(root, 'pipeline/a.ts'));
      expect(checkTypes(root)).toMatch(/pipeline\/b.ts\(1,.*error TS2307/);
      writeFile(root, 'pipeline/a.ts', validSource);
      expect(checkTypes(root)).toBe('');
    }, 120_000);

    it('改 tsconfig、改依赖包的类型声明', () => {
      const root = makeRepo(config, {
        'pipeline/a.ts': "import { 包值 } from '假包';\nexport const 数: number = 包值;\nexport const f = (x: number) => { const 没用 = x; return x; };\n",
        'node_modules/假包/package.json': JSON.stringify({ name: '假包', version: '1.0.0', types: 'index.d.ts' }),
        'node_modules/假包/index.d.ts': 'export declare const 包值: number;\n',
      });
      expect(checkTypes(root)).toBe('');
      writeFile(root, 'node_modules/假包/index.d.ts', 'export declare const 包值: string;\n');
      expect(checkTypes(root)).toMatch(/pipeline\/a.ts\(2,.*error TS2322/);
      writeFile(root, 'node_modules/假包/index.d.ts', 'export declare const 包值: number;\n');
      expect(checkTypes(root)).toBe('');
      const strict = JSON.parse(config['tsconfig.json']) as { compilerOptions: Record<string, unknown> };
      strict.compilerOptions.noUnusedLocals = true;
      writeFile(root, 'tsconfig.json', JSON.stringify(strict));
      expect(checkTypes(root)).toMatch(/pipeline\/a.ts\(3,.*error TS6133/);
    }, 120_000);

    it('缓存文件坏了、空了也照常查，不当通过', () => {
      const root = makeRepo(config, { 'pipeline/a.ts': "export const 坏: number = '字';\n" });
      expect(checkTypes(root)).toMatch(/error TS2322/);
      const cacheFile = tscCacheFile(new CheckContext(root));
      for (const badContent of ['{不是 JSON', '', '{}', '{"version":"0.0.0"}']) {
        fs.writeFileSync(cacheFile, badContent);
        expect(checkTypes(root)).toMatch(/error TS2322/);
      }
    }, 120_000);

    it('--deep 不读不写缓存；缓存不进仓库', () => {
      const root = makeRepo(config, { 'pipeline/a.ts': validSource });
      const c = new CheckContext(root, { depthCheck: true });
      runTsc(c, new CheckReport());
      expect(fs.existsSync(tscCacheFile(c))).toBe(false);
      expect(path.relative(root, tscCacheFile(c)).split(path.sep).slice(0, 2)).toEqual(['node_modules', '.cache']);
      expect(fs.readFileSync(path.join(codeRoot(), '.gitignore'), 'utf8').split('\n')).toContain('node_modules/');
    }, 120_000);
  });
});
