// 作品里引用库和 engine 写 `@库/…`、`@engine/…`（作品目录挪到仓库外也能用）。这张表是唯一来源，各处接线都读它：
// esbuild（资产/esbuild插件.ts 的 esbuild别名插件）、webpack（资产/webpack.ts 的 resolve.alias）、Node（环境/别名钩子.ts，cli/main.ts 注册）、
// tsconfig.json 的 paths、vitest.config.ts 的 resolve.alias（这两处是静态配置，改这里要跟着改）。
// 不用 package.json 的 imports（#engine/*）：它按引用方最近的 package.json 解析，仓库外的作品用不了。
import path from 'node:path';

/** 前缀 → 相对代码根的目录 */
export const aliasTable: Readonly<Record<string, string>> = { '@engine/': 'engine/', '@库/': '库/' };

/** `@engine/x`、`@库/x` → 代码根下的绝对路径；别的说明符返回 null */
export const resolveAlias = (specifier: string, codeRoot: string): string | null => {
  for (const [aliasPrefix, dir] of Object.entries(aliasTable)) {
    if (specifier.startsWith(aliasPrefix)) return path.join(codeRoot, ...dir.split('/'), ...specifier.slice(aliasPrefix.length).split('/'));
  }
  return null;
};

/** webpack 的 resolve.alias 形状：{ '@engine': <代码根>/engine, … } */
export const aliasDir = (codeRoot: string): Record<string, string> =>
  Object.fromEntries(Object.entries(aliasTable).map(([aliasPrefix, dir]) => [aliasPrefix.replace(/\/$/, ''), path.join(codeRoot, ...dir.split('/').filter(Boolean))]));
