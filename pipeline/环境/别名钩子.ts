// Node 的 resolve 钩子：把 `@engine/…`、`@库/…` 解析成代码根下的文件（表在 别名.ts）。cli/main.ts 用 module.register 注册，
// 管线在 Node 里 import() 的作品文件（清单.ts、段.ts、场的时间线和末态）才认得这两个前缀。静态 import 图在注册之前就解析完了，
// 所以 pipeline 自己的代码不写别名，只有动态 import 进来的作品文件可以写。
import { pathToFileURL } from 'node:url';
import { 解析别名 } from './别名.ts';

type 解析结果 = { url: string; format?: string | null; shortCircuit?: boolean };
type 下一步 = (说明符: string, 上下文?: unknown) => 解析结果 | Promise<解析结果>;

let 代码根 = '';

export const initialize = (data: { 代码根: string }) => {
  代码根 = data.代码根;
};

export const resolve = (说明符: string, 上下文: unknown, next: 下一步) => {
  const 目标 = 代码根 ? 解析别名(说明符, 代码根) : null;
  return next(目标 ? pathToFileURL(目标).href : 说明符, 上下文);
};
