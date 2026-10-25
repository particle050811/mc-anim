import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 缺字节占位插件, 缺字节, 挑缺字节入口, 占位源码, 入口占位源码 } from './缺字节.ts';
import type { 依赖图 } from '../检查/上下文.ts';
import type { 资产锁 } from './资产锁.ts';

const 锁: 资产锁 = {
  '截图/私': { sha256: 'a'.repeat(64), 后缀: '.png', 大小: 1, 库: '私有' },
  '截图/私有在': { sha256: 'b'.repeat(64), 后缀: '.png', 大小: 1, 库: '私有' },
  '模型/提取缺': { sha256: 'c'.repeat(64), 后缀: '.json', 大小: 1, 库: 'store' },
  '贴图/公在': { sha256: 'd'.repeat(64), 后缀: '.png', 大小: 1, 库: 'store' },
};
const 造根 = () => {
  const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-缺字节-'));
  fs.mkdirSync(path.join(根, '私有', 'bb'), { recursive: true });
  fs.writeFileSync(path.join(根, '私有', 'bb', 'b'.repeat(64)), 'x');
  fs.mkdirSync(path.join(根, 'store', 'dd'), { recursive: true });
  fs.writeFileSync(path.join(根, 'store', 'dd', 'd'.repeat(64)), 'x');
  return 根;
};

/** 假的 webpack：只接 normalModuleFactory.beforeResolve */
const 跑解析 = (插件: 缺字节占位插件, request: string, context?: string) => {
  let 钩: ((d: { request: string; context?: string }) => void) | undefined;
  插件.apply({ hooks: { normalModuleFactory: { tap: (_n, fn) => fn({ hooks: { beforeResolve: { tap: (_o, f) => (钩 = f) } } }) } } });
  const d = { request, context };
  钩!(d);
  return d.request;
};
const 求值 = (file: string) => {
  const m: { exports: { __esModule?: boolean; default?: unknown } } = { exports: {} };
  new Function('module', fs.readFileSync(file, 'utf8'))(m);
  return m.exports;
};

describe('缺字节', () => {
  it('挑登记了、字节不在数据根的，私有、提取都算；没登记的不管', () => {
    expect(缺字节(['截图/私', '截图/私有在', '模型/提取缺', '贴图/公在', '没登记'], 锁, 造根())).toEqual(['截图/私', '模型/提取缺']);
  });

  it('打包时缺字节的 asset: 换成占位模块，取 default 才抛错、说清是哪件；字节在的、别的请求不动', () => {
    const 根 = 造根();
    const 插件 = new 缺字节占位插件(锁, 根);
    const 换成 = 跑解析(插件, 'asset:模型/提取缺');
    expect(换成).toBe(path.join(根, 'cache', '缺字节', `${'c'.repeat(64)}.cjs`));
    const m = 求值(换成);
    expect(m.__esModule).toBe(true);
    expect(() => m.default).toThrow(/资产「模型\/提取缺」的字节不在/);
    expect(跑解析(插件, 'asset:截图/私')).toContain(path.join('cache', '缺字节'));
    expect(跑解析(插件, 'asset:截图/私有在')).toBe('asset:截图/私有在');
    expect(跑解析(插件, 'asset:贴图/公在')).toBe('asset:贴图/公在');
    expect(跑解析(插件, './别的.ts', 根)).toBe('./别的.ts');
    expect([...插件.换了].sort()).toEqual(['截图/私', '模型/提取缺']);
    expect(占位源码('截图/私', '/x')).toContain('get default()');
  });

  it('闭包碰到缺字节的段入口（画面、叠层）整个换成一渲就抛错的组件；段.ts、外壳换不了的单列；别的入口不动', () => {
    const 边 = (到: string) => ({ 到, 外部: false });
    const 图: 依赖图 = {
      边: new Map([
        ['作品/甲/核对/三渲二/画面.tsx', [边('库/角色/九胡.tsx')]],
        ['作品/甲/核对/三渲二/段.ts', []],
        ['作品/甲/段/2-乙/画面.tsx', [边('库/界面/公.ts')]],
        ['作品/甲/段/1-丙/叠层-字.tsx', [边('库/界面/像素字.ts')]],
        ['作品/甲/段/1-丙/段.ts', [边('库/界面/像素字.ts')]],
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
    const r = 挑缺字节入口(图, '作品/甲', new Set(['模型/九胡', '贴图/九胡', '字体/像素字']));
    expect([...r.换]).toEqual([
      ['作品/甲/核对/三渲二/画面.tsx', ['模型/九胡', '贴图/九胡']],
      ['作品/甲/段/1-丙/叠层-字.tsx', ['字体/像素字']],
    ]);
    expect([...r.换不了]).toEqual([['作品/甲/段/1-丙/段.ts', ['字体/像素字']]]);

    const 根 = 造根();
    const 作品 = path.join(根, '仓库', '作品', '甲');
    const 插件 = new 缺字节占位插件(锁, 根, new Map([[path.join(作品, '核对', '三渲二', '画面.tsx'), { 名: '作品/甲/核对/三渲二/画面.tsx', ids: ['模型/九胡'] }]]));
    const 换成 = 跑解析(插件, './三渲二/画面.tsx', path.join(作品, '核对'));
    expect(换成).toContain(path.join('cache', '缺字节', '入口-'));
    const m = 求值(换成);
    expect('default' in m).toBe(true);
    expect(() => (m.default as () => void)()).toThrow(/作品\/甲\/核对\/三渲二\/画面\.tsx 要的字节 「模型\/九胡」 不在数据根/);
    expect(跑解析(插件, './三渲二/段.ts', path.join(作品, '核对'))).toBe('./三渲二/段.ts');
    expect(入口占位源码('x', ['a', 'b', 'c', 'd'])).toContain('等 4 件');
  });
});
