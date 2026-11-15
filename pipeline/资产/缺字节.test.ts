import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MissingBytePlaceholderPlugin, missingBytes, pickMissingBytesEntry, placeholderSource, entryPlaceholderSource } from './缺字节.ts';
import type { DepGraph } from '../检查/上下文.ts';
import type { AssetLock } from './资产锁.ts';

const assetLock: AssetLock = {
  '截图/私': { sha256: 'a'.repeat(64), 后缀: '.png', 大小: 1, 库: '私有' },
  '截图/私有在': { sha256: 'b'.repeat(64), 后缀: '.png', 大小: 1, 库: '私有' },
  '模型/提取缺': { sha256: 'c'.repeat(64), 后缀: '.json', 大小: 1, 库: 'store' },
  '贴图/公在': { sha256: 'd'.repeat(64), 后缀: '.png', 大小: 1, 库: 'store' },
};
const makeRoot = () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-缺字节-'));
  fs.mkdirSync(path.join(dataRoot, '私有', 'bb'), { recursive: true });
  fs.writeFileSync(path.join(dataRoot, '私有', 'bb', 'b'.repeat(64)), 'x');
  fs.mkdirSync(path.join(dataRoot, 'store', 'dd'), { recursive: true });
  fs.writeFileSync(path.join(dataRoot, 'store', 'dd', 'd'.repeat(64)), 'x');
  return dataRoot;
};

/** 假的 webpack：只接 normalModuleFactory.beforeResolve */
const runResolve = (plugin: MissingBytePlaceholderPlugin, request: string, context?: string) => {
  let resolveHook: ((d: { request: string; context?: string }) => void) | undefined;
  plugin.apply({ hooks: { normalModuleFactory: { tap: (_n, fn) => fn({ hooks: { beforeResolve: { tap: (_o, f) => (resolveHook = f) } } }) } } });
  const d = { request, context };
  resolveHook!(d);
  return d.request;
};
const evaluate = (file: string) => {
  const m: { exports: { __esModule?: boolean; default?: unknown } } = { exports: {} };
  new Function('module', fs.readFileSync(file, 'utf8'))(m);
  return m.exports;
};

describe('缺字节', () => {
  it('挑登记了、字节不在数据根的，私有、提取都算；没登记的不管', () => {
    expect(missingBytes(['截图/私', '截图/私有在', '模型/提取缺', '贴图/公在', '没登记'], assetLock, makeRoot())).toEqual(['截图/私', '模型/提取缺']);
  });

  it('打包时缺字节的 asset: 换成占位模块，取 default 才抛错、说清是哪件；字节在的、别的请求不动', () => {
    const dataRoot = makeRoot();
    const plugin = new MissingBytePlaceholderPlugin(assetLock, dataRoot);
    const replacedPath = runResolve(plugin, 'asset:模型/提取缺');
    expect(replacedPath).toBe(path.join(dataRoot, 'cache', '缺字节', `${'c'.repeat(64)}.cjs`));
    const m = evaluate(replacedPath);
    expect(m.__esModule).toBe(true);
    expect(() => m.default).toThrow(/资产「模型\/提取缺」的字节不在/);
    expect(runResolve(plugin, 'asset:截图/私')).toContain(path.join('cache', '缺字节'));
    expect(runResolve(plugin, 'asset:截图/私有在')).toBe('asset:截图/私有在');
    expect(runResolve(plugin, 'asset:贴图/公在')).toBe('asset:贴图/公在');
    expect(runResolve(plugin, './别的.ts', dataRoot)).toBe('./别的.ts');
    expect([...plugin.replaced].sort()).toEqual(['截图/私', '模型/提取缺']);
    expect(placeholderSource('截图/私', '/x')).toContain('get default()');
  });

  it('闭包碰到缺字节的段入口（画面、叠层）整个换成一渲就抛错的组件；段.ts、外壳换不了的单列；别的入口不动', () => {
    const makeEdge = (target: string) => ({ 到: target, external: false });
    const depGraph: DepGraph = {
      edges: new Map([
        ['作品/甲/核对/三渲二/画面.tsx', [makeEdge('库/角色/九胡.tsx')]],
        ['作品/甲/核对/三渲二/段.ts', []],
        ['作品/甲/段/2-乙/画面.tsx', [makeEdge('库/界面/公.ts')]],
        ['作品/甲/段/1-丙/叠层-字.tsx', [makeEdge('库/界面/像素字.ts')]],
        ['作品/甲/段/1-丙/段.ts', [makeEdge('库/界面/像素字.ts')]],
        ['作品/甲/index.ts', []],
        ['库/角色/九胡.tsx', []],
        ['库/界面/公.ts', []],
        ['库/界面/像素字.ts', []],
      ]),
      资产: new Map([
        ['库/角色/九胡.tsx', ['模型/九胡', '贴图/九胡']],
        ['库/界面/公.ts', ['贴图/公']],
        ['库/界面/像素字.ts', ['字体/像素字']],
      ]),
      错误: [],
    };
    const r = pickMissingBytesEntry(depGraph, '作品/甲', new Set(['模型/九胡', '贴图/九胡', '字体/像素字']));
    expect([...r.换]).toEqual([
      ['作品/甲/核对/三渲二/画面.tsx', ['模型/九胡', '贴图/九胡']],
      ['作品/甲/段/1-丙/叠层-字.tsx', ['字体/像素字']],
    ]);
    expect([...r.cannotReplace]).toEqual([['作品/甲/段/1-丙/段.ts', ['字体/像素字']]]);

    const repoRoot = makeRoot();
    const workDir = path.join(repoRoot, '仓库', '作品', '甲');
    const plugin = new MissingBytePlaceholderPlugin(assetLock, repoRoot, new Map([[path.join(workDir, '核对', '三渲二', '画面.tsx'), { 名: '作品/甲/核对/三渲二/画面.tsx', ids: ['模型/九胡'] }]]));
    const replacedPath = runResolve(plugin, './三渲二/画面.tsx', path.join(workDir, '核对'));
    expect(replacedPath).toContain(path.join('cache', '缺字节', '入口-'));
    const m = evaluate(replacedPath);
    expect('default' in m).toBe(true);
    expect(() => (m.default as () => void)()).toThrow(/作品\/甲\/核对\/三渲二\/画面\.tsx 要的字节 「模型\/九胡」 不在数据根/);
    expect(runResolve(plugin, './三渲二/段.ts', path.join(workDir, '核对'))).toBe('./三渲二/段.ts');
    expect(entryPlaceholderSource('x', ['a', 'b', 'c', 'd'])).toContain('等 4 件');
  });
});
