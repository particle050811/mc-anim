// 作品里引用库和 engine 写 `@库/…`、`@engine/…`（作品目录挪到仓库外也能用）。这张表是唯一来源，各处接线都读它：
// esbuild（资产/esbuild插件.ts 的 esbuild别名插件）、webpack（资产/webpack.ts 的 resolve.alias）、Node（环境/别名钩子.ts，cli/main.ts 注册）、
// tsconfig.json 的 paths、vitest.config.ts 的 resolve.alias（这两处是静态配置，改这里要跟着改）。
// 不用 package.json 的 imports（#engine/*）：它按引用方最近的 package.json 解析，仓库外的作品用不了。
import path from 'node:path';

/** 前缀 → 相对代码根的目录 */
export const 别名表: Readonly<Record<string, string>> = { '@engine/': 'engine/', '@库/': '库/' };

/** `@engine/x`、`@库/x` → 代码根下的绝对路径；别的说明符返回 null */
export const 解析别名 = (说明符: string, 代码根: string): string | null => {
  for (const [前缀, 目录] of Object.entries(别名表)) {
    if (说明符.startsWith(前缀)) return path.join(代码根, ...目录.split('/'), ...说明符.slice(前缀.length).split('/'));
  }
  return null;
};

/** webpack 的 resolve.alias 形状：{ '@engine': <代码根>/engine, … } */
export const 别名目录 = (代码根: string): Record<string, string> =>
  Object.fromEntries(Object.entries(别名表).map(([前缀, 目录]) => [前缀.replace(/\/$/, ''), path.join(代码根, ...目录.split('/').filter(Boolean))]));
