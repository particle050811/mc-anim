import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { aliasDir, resolveAlias } from './别名.ts';
import { codeRoot } from './路径.ts';
import { workRoot } from './作品.ts';
import { computeMerkle } from '../指纹/默克尔.ts';
import { webpackOverride } from '../资产/webpack.ts';

const root = codeRoot();
// 一个只用 Node 自带能力就能执行的 engine 文件
const targetFile = 'engine/core/资产目录.ts';

/** 在仓库外的临时目录造一个引用 @engine/ 的文件（模拟放在仓库外的作品） */
const makeExternalFile = () => {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-别名-')));
  fs.writeFileSync(path.join(d, '甲.ts'), `import { assetDir } from '@engine/core/资产目录.ts';\nexport default assetDir({ b: 2, a: 1 }).keys();\n`);
  return d;
};

describe('别名', () => {
  it('@engine/、@库/ 解析到代码根下，别的说明符不管', () => {
    expect(resolveAlias('@engine/core/资产目录.ts', root)).toBe(path.join(root, 'engine', 'core', '资产目录.ts'));
    expect(resolveAlias('@库/角色/李樱.tsx', root)).toBe(path.join(root, '库', '角色', '李樱.tsx'));
    expect(resolveAlias('./engine/x.ts', root)).toBeNull();
    expect(resolveAlias('@remotion/three', root)).toBeNull();
    expect(aliasDir(root)).toEqual({ '@engine': path.join(root, 'engine'), '@库': path.join(root, '库') });
  });

  it('esbuild（指纹、检查用的依赖闭包）认得别名，不把它当 npm 包放过去', async () => {
    const d = makeExternalFile();
    try {
      const { detail: detail } = await computeMerkle([path.relative(root, path.join(d, '甲.ts')).split(path.sep).join('/')]);
      expect(Object.keys(detail.modules)).toContain(targetFile);
    } finally {
      fs.rmSync(d, { recursive: true });
    }
  });

  it('Node 里 import() 进来的文件认得别名（cli/main.ts、清单/清单.ts 注册的钩子）', () => {
    const d = makeExternalFile();
    try {
      const registrationUrl = pathToFileURL(path.join(root, 'pipeline', '环境', '别名注册.ts')).href;
      const moduleAUrl = pathToFileURL(path.join(d, '甲.ts')).href;
      const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(registrationUrl)}); const m = await import(${JSON.stringify(moduleAUrl)}); console.log(JSON.stringify(m.default));`], {
        encoding: 'utf8',
      });
      expect(JSON.parse(stdout.trim())).toEqual(['a', 'b']);
    } finally {
      fs.rmSync(d, { recursive: true });
    }
  });

  it('webpack 改写：保留 Remotion 的别名、加上 @engine/ @库/，npm 包先找代码根的 node_modules', async () => {
    const rewritten = await webpackOverride(workRoot())({ resolve: { alias: { react: '/x/react' } }, module: { rules: [] }, plugins: [] } as never);
    expect(rewritten.resolve?.alias).toEqual({ react: '/x/react', '@engine': path.join(root, 'engine'), '@库': path.join(root, '库') });
    expect(rewritten.resolve?.modules).toEqual([path.join(root, 'node_modules'), 'node_modules']);
  });
});
