// Node 的 resolve 钩子：把 `@engine/…`、`@库/…` 解析成代码根下的文件（表在 别名.ts）。cli/main.ts 用 module.register 注册，
// 管线在 Node 里 import() 的作品文件（清单.ts、段.ts、场的时间线和末态）才认得这两个前缀。静态 import 图在注册之前就解析完了，
// 所以 pipeline 自己的代码不写别名，只有动态 import 进来的作品文件可以写。
import { pathToFileURL } from 'node:url';
import { resolveAlias } from './别名.ts';

type ResolveResult = { url: string; format?: string | null; shortCircuit?: boolean };
type NextHook = (specifier: string, context?: unknown) => ResolveResult | Promise<ResolveResult>;

let codeRoot = '';

export const initialize = (data: { codeRoot: string }) => {
  codeRoot = data.codeRoot;
};

export const resolve = (specifier: string, context: unknown, next: NextHook) => {
  const resolvedTarget = codeRoot ? resolveAlias(specifier, codeRoot) : null;
  return next(resolvedTarget ? pathToFileURL(resolvedTarget).href : specifier, context);
};
