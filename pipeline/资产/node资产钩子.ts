// Node 的 resolve/load 钩子：`asset:<id>` → 资产锁里那份 JSON 的默认导出（世界/体素库.ts 注册，表由 node资产.ts 的 资产json表 算好传进来）。
// Node 要求 load 拿到的是完整 URL，所以 resolve 换成 store 里字节的 file: URL，带个查询参数让 load 认出来。
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

type 解析结果 = { url: string; format?: string | null; shortCircuit?: boolean };
type 载入结果 = { format: string; source?: string | Buffer; shortCircuit?: boolean };

const 参数 = 'mc-anim-asset';
let 表: Record<string, string> = {};

export const initialize = (data: { 表: Record<string, string> }) => {
  表 = data.表;
};

export const resolve = (说明符: string, 上下文: unknown, next: (s: string, c?: unknown) => 解析结果 | Promise<解析结果>) => {
  if (!说明符.startsWith('asset:')) return next(说明符, 上下文);
  const id = 说明符.slice('asset:'.length);
  const f = 表[id];
  if (!f) throw new Error(`Node 里只能 import JSON 资产，且字节要在数据根：asset:${id} 不是（先 anim assets pull 或 anim assets add）`);
  const url = pathToFileURL(f);
  url.searchParams.set(参数, id);
  return { url: url.href, shortCircuit: true };
};

export const load = (url: string, 上下文: unknown, next: (u: string, c?: unknown) => 载入结果 | Promise<载入结果>) => {
  const u = new URL(url);
  if (!u.searchParams.has(参数)) return next(url, 上下文);
  return { format: 'module', source: `export default ${fs.readFileSync(fileURLToPath(u), 'utf8')};`, shortCircuit: true };
};
