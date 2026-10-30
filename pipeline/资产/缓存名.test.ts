// webpack 缓存名稳定（缓存名.ts）：锁、求解指纹变了 Remotion 算出的缓存名不变；同一个持久缓存目录下，
// 改锁、改求解代码以后用真 webpack 打包，产物跟着变（不读过期缓存），没变的模块确实从缓存取。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterAll, describe, expect, it } from 'vitest';
import webpack from 'webpack';

// 数据根在 import 配置之前设好（配置读得懒）
const 临时 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-缓存名-')));
process.env.ANIM_DATA = path.join(临时, '数据根');

const { webpack改写 } = await import('./webpack.ts');
const { 稳定缓存名 } = await import('./缓存名.ts');
const { 缺字节占位插件 } = await import('./缺字节.ts');
const { 入库 } = await import('./资产锁.ts');
const require = createRequire(import.meta.url);
// Remotion 不导出这个模块，按文件取（它算缓存名用的就是这个函数）
const { computeHashAndFinalConfig } = require(path.join(path.dirname(require.resolve('@remotion/bundler')), 'shared-bundler-config.js')) as {
  computeHashAndFinalConfig: (conf: unknown, o: { enableCaching: boolean; environment: string; remotionRoot: string }) => [string, unknown];
};

afterAll(() => fs.rmSync(临时, { recursive: true, force: true }));

const 作品根 = path.join(临时, '作品');
fs.mkdirSync(作品根, { recursive: true });
fs.writeFileSync(path.join(作品根, '清单.ts'), "export const 求解入口 = { 测试求解: '求解.ts' };\n");
const 写求解 = (n: number) => fs.writeFileSync(path.join(作品根, '求解.ts'), `export const 解 = ${n};\n`);
const 字节 = (名: string, 内容: string) => {
  const f = path.join(临时, 名);
  fs.writeFileSync(f, 内容);
  return 入库(f, 'store');
};
const 写锁 = (条目: ReturnType<typeof 字节>) => fs.writeFileSync(path.join(作品根, '资产锁.json'), JSON.stringify({ '测试/甲': 条目 }));

const 基础配置 = () => ({ plugins: [], module: { rules: [] }, resolve: {} }) as never;
const 缓存名 = async (稳定: boolean) => {
  const 改 = 稳定 ? 稳定缓存名(webpack改写(作品根)) : webpack改写(作品根);
  return computeHashAndFinalConfig(await 改(基础配置()), { enableCaching: true, environment: 'production', remotionRoot: 临时 })[0];
};

describe('缓存名', () => {
  it('改锁、改求解代码，Remotion 算出的缓存名不变（不套 稳定缓存名 就会变）', async () => {
    写求解(1);
    写锁(字节('一.json', '{"值":1}'));
    const [稳, 原] = [await 缓存名(true), await 缓存名(false)];
    写锁(字节('二.json', '{"值":2}'));
    写求解(2);
    expect(await 缓存名(true)).toBe(稳);
    expect(await 缓存名(false)).not.toBe(原);
  });

  it('缺字节占位插件：锁和要换的入口不进缓存名，数据根进', async () => {
    const 套 = async (p: unknown) => JSON.stringify(await 稳定缓存名(async () => ({ plugins: [p] }) as never)({} as never));
    const 一 = await 套(new 缺字节占位插件({ a: { sha256: '1', 大小: 1, 库: 'store', 后缀: '' } }, '/根', new Map([['/x', { 名: 'x', ids: ['a'] }]])));
    expect(await 套(new 缺字节占位插件({}, '/根'))).toBe(一);
    expect(await 套(new 缺字节占位插件({}, '/别的根'))).not.toBe(一);
  });
});

describe('同一个持久缓存目录', () => {
  const 入口 = path.join(临时, '入口.js');
  fs.writeFileSync(path.join(临时, '不变.js'), 'export const 不变 = "不变的模块";\n');
  fs.writeFileSync(入口, "import 甲 from 'asset:测试/甲';\nimport { 不变 } from './不变.js';\nexport default [甲, 不变, __SOLVER_FINGERPRINTS__];\n");

  /** 一次独立的 webpack 编译（新 compiler，像新开一个进程），缓存名固定，返回产物文本和这次真编了的模块 */
  const 打包 = async (出: string) => {
    const c = await 稳定缓存名(webpack改写(作品根))(基础配置());
    const compiler = webpack({
      ...(c as object),
      mode: 'development',
      devtool: false,
      context: 临时,
      entry: 入口,
      output: { path: path.join(临时, 出), filename: 'main.js', library: { type: 'commonjs2' } },
      cache: { type: 'filesystem', cacheDirectory: path.join(临时, '缓存'), name: '固定', version: '固定' },
      infrastructureLogging: { level: 'error' },
    });
    const stats = await new Promise<webpack.Stats>((ok, 坏) => compiler.run((e, s) => (e ? 坏(e) : ok(s!))));
    await new Promise<void>((ok, 坏) => compiler.close((e) => (e ? 坏(e) : ok())));
    if (stats.hasErrors()) throw new Error(stats.toString('errors-only'));
    const 编了 = (stats.toJson({ modules: true }).modules ?? []).filter((m) => m.built).map((m) => m.name ?? '');
    return { 产物: fs.readFileSync(path.join(临时, 出, 'main.js'), 'utf8'), 编了 };
  };
  const 值 = (产物: string) => {
    const m = { exports: {} as { default: [{ 值: number }, string, Record<string, string>] } };
    new Function('module', 'exports', 'require', 产物)(m, m.exports, require);
    return m.exports.default;
  };

  it('改锁、改求解代码后产物跟着变，没变的模块从缓存取', async () => {
    写求解(1);
    写锁(字节('一.json', '{"值":1}'));
    const 一 = await 打包('出一');
    const [甲1, 不变1, 求解1] = 值(一.产物);
    expect(甲1).toEqual({ 值: 1 });
    expect(不变1).toBe('不变的模块');
    expect(Object.keys(求解1)).toEqual(['测试求解']);
    expect(一.编了.some((n) => n.includes('不变.js'))).toBe(true);

    写锁(字节('二.json', '{"值":2}'));
    写求解(2);
    const 二 = await 打包('出二');
    const [甲2, , 求解2] = 值(二.产物);
    expect(甲2).toEqual({ 值: 2 });
    expect(求解2.测试求解).not.toBe(求解1.测试求解);
    // 缓存确实在用：没变的模块这次没重编
    expect(二.编了.some((n) => n.includes('不变.js'))).toBe(false);
  });
});
