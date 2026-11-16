// Node 的 resolve/load 钩子：`asset:<id>` → 资产锁里那份 JSON 的默认导出（世界/体素库.ts 注册，表由 node资产.ts 的 资产json表 算好传进来）。
// Node 要求 load 拿到的是完整 URL，所以 resolve 换成 store 里字节的 file: URL，带个查询参数让 load 认出来。
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

type ResolveResult = { url: string; format?: string | null; shortCircuit?: boolean };
type LoadResult = { format: string; source?: string | Buffer; shortCircuit?: boolean };

const paramsKey = 'mc-anim-asset';
let assetJsonMap: Record<string, string> = {};

export const initialize = (data: { 表: Record<string, string> }) => {
  assetJsonMap = data.表;
};

export const resolve = (specifier: string, context: unknown, next: (s: string, c?: unknown) => ResolveResult | Promise<ResolveResult>) => {
  if (!specifier.startsWith('asset:')) return next(specifier, context);
  const id = specifier.slice('asset:'.length);
  const f = assetJsonMap[id];
  if (!f) throw new Error(`Node 里只能 import JSON asset，且字节要在数据根：asset:${id} 不是（先 anim assets pull 或 anim assets add）`);
  const url = pathToFileURL(f);
  url.searchParams.set(paramsKey, id);
  return { url: url.href, shortCircuit: true };
};

export const load = (url: string, context: unknown, next: (u: string, c?: unknown) => LoadResult | Promise<LoadResult>) => {
  const u = new URL(url);
  if (!u.searchParams.has(paramsKey)) return next(url, context);
  return { format: 'module', source: `export default ${fs.readFileSync(fileURLToPath(u), 'utf8')};`, shortCircuit: true };
};
