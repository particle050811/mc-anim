// 求解缓存的代码层指纹（engine/core/求解缓存.ts 的 solverFingerprint，资产/webpack.ts 打包时注入）：作品的 清单.ts 导出 求解入口
// （名 → 相对作品根的模块），取每个入口的默克尔根（默克尔.ts）前 16 位，闭包里任何一个模块的代码改了缓存就失效；不手列文件，漏列会拿到过期结果。
// 算不出来（esbuild 报错）就不注入那一项，那个求解照常现算。
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { 相对代码根 } from '../环境/路径.ts';
import { 算默克尔 } from './默克尔.ts';

export const 读求解入口 = async (作品根: string): Promise<Record<string, string>> => {
  const m = (await import(pathToFileURL(path.join(作品根, '清单.ts')).href)) as { 求解入口?: Record<string, string> };
  return m.求解入口 ?? {};
};

export const 求解指纹 = async (作品根: string): Promise<Record<string, string>> => {
  const 项 = await Promise.all(
    Object.entries(await 读求解入口(作品根)).map(async ([名, 入口]) => {
      try {
        return [[名, (await 算默克尔([相对代码根(path.join(作品根, 入口))])).根[0]!.slice(0, 16)] as const];
      } catch {
        return [];
      }
    }),
  );
  return Object.fromEntries(项.flat());
};
