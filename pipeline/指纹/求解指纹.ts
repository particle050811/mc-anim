// 求解缓存的代码层指纹（engine/core/求解缓存.ts 的 solverFingerprint，资产/webpack.ts 打包时注入）：作品的 清单.ts 导出 求解入口
// （名 → 相对作品根的模块），取每个入口的默克尔根（默克尔.ts）前 16 位，闭包里任何一个模块的代码改了缓存就失效；不手列文件，漏列会拿到过期结果。
// 算不出来（esbuild 报错）就不注入那一项，那个求解照常现算。
// 引擎自己的缓存（不分作品）的入口在 engineSolveEntries，一项可以有几个入口，指纹取它们默克尔根合起来的哈希。
import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { relativeToCodeRoot } from '../环境/路径.ts';
import { computeMerkle } from './默克尔.ts';

export const readSolveEntries = async (workRoot: string): Promise<Record<string, string>> => {
  const m = (await import(pathToFileURL(path.join(workRoot, '清单.ts')).href)) as { solveEntries?: Record<string, string> };
  return m.solveEntries ?? {};
};

/**
 * 光体缓存（engine/light/光体缓存.ts）：存的是光体工人的结果，区段数据由区段工人解码，这两个工人的闭包管住了结果的全部算法（含方块表、发光表、缓存格式）。
 * 显卡收集不存，着色器改了不用让它失效
 */
export const engineSolveEntries: Readonly<Record<string, readonly string[]>> = { '光体': ['engine/light/光体工人.ts', 'engine/voxel/区段工人.ts'] };

const fingerprintOf = async (entries: readonly string[]) => {
  const roots = (await computeMerkle([...entries])).root;
  return roots.length === 1 ? roots[0]!.slice(0, 16) : crypto.createHash('sha256').update(roots.join('\n')).digest('hex').slice(0, 16);
};

export const solveFingerprints = async (workRoot: string): Promise<Record<string, string>> => {
  const entries: [string, readonly string[]][] = [
    ...Object.entries(await readSolveEntries(workRoot)).map(([solverName, entry]): [string, string[]] => [solverName, [relativeToCodeRoot(path.join(workRoot, entry))]]),
    ...Object.entries(engineSolveEntries),
  ];
  const items = await Promise.all(
    entries.map(async ([solverName, files]) => {
      try {
        return [[solverName, await fingerprintOf(files)] as const];
      } catch {
        return [];
      }
    }),
  );
  return Object.fromEntries(items.flat());
};
