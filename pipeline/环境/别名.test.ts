import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { 别名目录, 解析别名 } from './别名.ts';
import { 代码根, 作品根 } from './路径.ts';
import { 算默克尔 } from '../指纹/默克尔.ts';
import { webpack改写 } from '../资产/webpack.ts';

const 根 = 代码根();
// 一个只用 Node 自带能力就能执行的 engine 文件
const 目标 = 'engine/core/资产目录.ts';

/** 在仓库外的临时目录造一个引用 @engine/ 的文件（模拟放在仓库外的作品） */
const 造外部文件 = () => {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-别名-')));
  fs.writeFileSync(path.join(d, '甲.ts'), `import { 资产目录 } from '@engine/core/资产目录.ts';\nexport default 资产目录({ b: 2, a: 1 }).keys();\n`);
  return d;
};

describe('别名', () => {
  it('@engine/、@库/ 解析到代码根下，别的说明符不管', () => {
    expect(解析别名('@engine/core/资产目录.ts', 根)).toBe(path.join(根, 'engine', 'core', '资产目录.ts'));
    expect(解析别名('@库/角色/李樱.tsx', 根)).toBe(path.join(根, '库', '角色', '李樱.tsx'));
    expect(解析别名('./engine/x.ts', 根)).toBeNull();
    expect(解析别名('@remotion/three', 根)).toBeNull();
    expect(别名目录(根)).toEqual({ '@engine': path.join(根, 'engine'), '@库': path.join(根, '库') });
  });

  it('esbuild（指纹、检查用的依赖闭包）认得别名，不把它当 npm 包放过去', async () => {
    const d = 造外部文件();
    try {
      const { 明细 } = await 算默克尔([path.relative(根, path.join(d, '甲.ts')).split(path.sep).join('/')]);
      expect(Object.keys(明细.模块)).toContain(目标);
    } finally {
      fs.rmSync(d, { recursive: true });
    }
  });

  it('Node 里 import() 进来的文件认得别名（cli/main.ts、清单/清单.ts 注册的钩子）', () => {
    const d = 造外部文件();
    try {
      const 注册 = pathToFileURL(path.join(根, 'pipeline', '环境', '别名注册.ts')).href;
      const 甲 = pathToFileURL(path.join(d, '甲.ts')).href;
      const 出 = execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(注册)}); const m = await import(${JSON.stringify(甲)}); console.log(JSON.stringify(m.default));`], {
        encoding: 'utf8',
      });
      expect(JSON.parse(出.trim())).toEqual(['a', 'b']);
    } finally {
      fs.rmSync(d, { recursive: true });
    }
  });

  it('webpack 改写：保留 Remotion 的别名、加上 @engine/ @库/，npm 包先找代码根的 node_modules', async () => {
    const 改 = await webpack改写(作品根())({ resolve: { alias: { react: '/x/react' } }, module: { rules: [] }, plugins: [] } as never);
    expect(改.resolve?.alias).toEqual({ react: '/x/react', '@engine': path.join(根, 'engine'), '@库': path.join(根, '库') });
    expect(改.resolve?.modules).toEqual([path.join(根, 'node_modules'), 'node_modules']);
  });
});
