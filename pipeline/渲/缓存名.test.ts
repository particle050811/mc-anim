// webpack 缓存名稳定（缓存名.ts）：锁、求解指纹变了 Remotion 算出的缓存名不变；同一个持久缓存目录下，
// 改锁、改求解代码以后用真 webpack 打包，产物跟着变（不读过期缓存），没变的模块确实从缓存取。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterAll, describe, expect, it } from 'vitest';
import webpack from 'webpack';

// 数据根在 import 配置之前设好（配置读得懒）
const tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-缓存名-')));
process.env.ANIM_DATA = path.join(tempDir, '数据根');

const { webpackOverride } = await import('../资产/webpack.ts');
const { stableCacheName } = await import('./缓存名.ts');
const { MissingBytePlaceholderPlugin: missingBytePlaceholderPlugin } = await import('../分发/缺字节.ts');
const { importToStore, writeAssetLock } = await import('../资产/资产锁.ts');
const require = createRequire(import.meta.url);
// Remotion 不导出这个模块，按文件取（它算缓存名用的就是这个函数）
const { computeHashAndFinalConfig } = require(path.join(path.dirname(require.resolve('@remotion/bundler')), 'shared-bundler-config.js')) as {
  computeHashAndFinalConfig: (conf: unknown, o: { enableCaching: boolean; environment: string; remotionRoot: string }) => [string, unknown];
};

afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));

const workRoot = path.join(tempDir, '作品');
fs.mkdirSync(workRoot, { recursive: true });
fs.writeFileSync(path.join(workRoot, '清单.ts'), "export const solveEntries = { 测试求解: '求解.ts' };\n");
const writeSolveFile = (n: number) => fs.writeFileSync(path.join(workRoot, '求解.ts'), `export const 解 = ${n};\n`);
const bytesLockEntry = (fileName: string, content: string) => {
  const f = path.join(tempDir, fileName);
  fs.writeFileSync(f, content);
  return importToStore(f, 'store');
};
const writeSingleLock = (entry: ReturnType<typeof bytesLockEntry>) => writeAssetLock({ '测试/甲': entry }, path.join(workRoot, '资产锁'));

const baseConfig = () => ({ plugins: [], module: { rules: [] }, resolve: {} }) as never;
const cacheName = async (stable: boolean) => {
  const rewrite = stable ? stableCacheName(webpackOverride(workRoot)) : webpackOverride(workRoot);
  return computeHashAndFinalConfig(await rewrite(baseConfig()), { enableCaching: true, environment: 'production', remotionRoot: tempDir })[0];
};

describe('缓存名', () => {
  it('改锁、改求解代码，Remotion 算出的缓存名不变（不套 稳定缓存名 就会变）', async () => {
    writeSolveFile(1);
    writeSingleLock(bytesLockEntry('一.json', '{"值":1}'));
    const [stableName, originalName] = [await cacheName(true), await cacheName(false)];
    writeSingleLock(bytesLockEntry('二.json', '{"值":2}'));
    writeSolveFile(2);
    expect(await cacheName(true)).toBe(stableName);
    expect(await cacheName(false)).not.toBe(originalName);
  });

  it('缺字节占位插件：锁和要换的入口不进缓存名，数据根进', async () => {
    const cacheNameOf = async (p: unknown) => JSON.stringify(await stableCacheName(async () => ({ plugins: [p] }) as never)({} as never));
    const nameWithLock = await cacheNameOf(new missingBytePlaceholderPlugin({ a: { sha256: '1', size: 1, lib: 'store', suffix: '' } }, '/根', new Map([['/x', { name: 'x', ids: ['a'] }]])));
    expect(await cacheNameOf(new missingBytePlaceholderPlugin({}, '/根'))).toBe(nameWithLock);
    expect(await cacheNameOf(new missingBytePlaceholderPlugin({}, '/别的根'))).not.toBe(nameWithLock);
  });
});

describe('同一个持久缓存目录', () => {
  const entryFile = path.join(tempDir, '入口.js');
  fs.writeFileSync(path.join(tempDir, '不变.js'), 'export const 不变 = "不变的模块";\n');
  fs.writeFileSync(entryFile, "import 甲 from 'asset:测试/甲';\nimport { 不变 } from './不变.js';\nexport default [甲, 不变, __SOLVER_FINGERPRINTS__];\n");

  /** 一次独立的 webpack 编译（新 compiler，像新开一个进程），缓存名固定，返回产物文本和这次真编了的模块 */
  const bundleOut = async (dirName: string) => {
    const c = await stableCacheName(webpackOverride(workRoot))(baseConfig());
    const compiler = webpack({
      ...(c as object),
      mode: 'development',
      devtool: false,
      context: tempDir,
      entry: entryFile,
      output: { path: path.join(tempDir, dirName), filename: 'main.js', library: { type: 'commonjs2' } },
      cache: { type: 'filesystem', cacheDirectory: path.join(tempDir, '缓存'), name: '固定', version: '固定' },
      infrastructureLogging: { level: 'error' },
    });
    const stats = await new Promise<webpack.Stats>((ok, reject) => compiler.run((e, s) => (e ? reject(e) : ok(s!))));
    await new Promise<void>((ok, reject) => compiler.close((e) => (e ? reject(e) : ok())));
    if (stats.hasErrors()) throw new Error(stats.toString('errors-only'));
    const compiled = (stats.toJson({ modules: true }).modules ?? []).filter((m) => m.built).map((m) => m.name ?? '');
    return { artifacts: fs.readFileSync(path.join(tempDir, dirName, 'main.js'), 'utf8'), compiled };
  };
  const value = (bundleOutput: string) => {
    const m = { exports: {} as { default: [{ 值: number }, string, Record<string, string>] } };
    new Function('module', 'exports', 'require', bundleOutput)(m, m.exports, require);
    return m.exports.default;
  };

  it('改锁、改求解代码后产物跟着变，没变的模块从缓存取', async () => {
    writeSolveFile(1);
    writeSingleLock(bytesLockEntry('一.json', '{"值":1}'));
    const firstBuild = await bundleOut('出一');
    const [firstItem, unchangedModule, solverFirst] = value(firstBuild.artifacts);
    expect(firstItem).toEqual({ 值: 1 });
    expect(unchangedModule).toBe('不变的模块');
    expect(Object.keys(solverFirst)).toEqual(['测试求解', '光体']);
    expect(firstBuild.compiled.some((n) => n.includes('不变.js'))).toBe(true);

    writeSingleLock(bytesLockEntry('二.json', '{"值":2}'));
    writeSolveFile(2);
    const secondPack = await bundleOut('出二');
    const [secondItem, , solverSecond] = value(secondPack.artifacts);
    expect(secondItem).toEqual({ 值: 2 });
    expect(solverSecond.测试求解).not.toBe(solverFirst.测试求解);
    // 缓存确实在用：没变的模块这次没重编
    expect(secondPack.compiled.some((n) => n.includes('不变.js'))).toBe(false);
  });
});
