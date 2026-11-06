import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { 解析pnpm锁 } from '../指纹/默克尔.ts';
import { worktree目录, 装依赖 } from './开worktree.ts';

test('装依赖不许改锁文件；worktree 开在主检出旁边的 mc-anim-wt/', () => {
  expect(装依赖).toContain('--frozen-lockfile');
  expect(worktree目录('/x/mc-anim', '甲')).toBe(path.join('/x', 'mc-anim-wt', '甲'));
});

test('仓库里只有 pnpm 的锁文件，没有 package-lock.json（两份锁会各说各的）', () => {
  const 根 = path.resolve(import.meta.dirname, '../..');
  expect(fs.existsSync(path.join(根, 'pnpm-lock.yaml'))).toBe(true);
  expect(fs.existsSync(path.join(根, 'package-lock.json'))).toBe(false);
});

test('pnpm 锁读出的版本：去掉 peer 后缀；git 依赖取包自己的 version', () => {
  const 锁 = `lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      '@remotion/three':
        specifier: 4.0.537
        version: 4.0.537(react@19.3.0)(three@0.186.1)
      git包:
        specifier: github:a/b#abc
        version: https://codeload.github.com/a/b/tar.gz/abc
    devDependencies:
      vitest:
        specifier: 5.0.3
        version: 5.0.3

packages:

  git包@https://codeload.github.com/a/b/tar.gz/abc:
    resolution: {tarball: https://codeload.github.com/a/b/tar.gz/abc}
    version: 1.0.0

  vitest@5.0.3:
    resolution: {integrity: sha512-x}
`;
  expect(Object.fromEntries(解析pnpm锁(锁))).toEqual({ '@remotion/three': '4.0.537', git包: '1.0.0', vitest: '5.0.3' });
});
