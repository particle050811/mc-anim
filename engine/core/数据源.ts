// 取数据的唯一入口：Git 外的大数据（区段包、求解缓存，在数据根的 渲染/ 下，见 工具/公共/环境.mjs）一律经这里取，路径相对 渲染/ 写，如 `区段包/<名>/<版本>/包.json`
// （区段包的路径用 lib/体素/区段包位置.ts 拼）。现在 渲染/ 就是 Remotion 的 public 目录（remotion.config.ts），dataUrl 走 staticFile；换本地文件服务只改 dataUrl。
// 换的服务要支持 Range（回 206）和同源的同步 GET（求解缓存在模块初始化时同步取）。
import { staticFile } from 'remotion';

export const dataUrl = (rel: string) => staticFile(rel);

// gzip 解开（浏览器自带的解压流）
export const gunzip = (data: ArrayBuffer | ReadableStream<Uint8Array<ArrayBuffer>>): Promise<ArrayBuffer> => {
  const stream = data instanceof ReadableStream ? data : new Blob([data]).stream();
  return new Response(stream.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
};

const missing = (rel: string, status: number, hint: string) => new Error(`取不到 ${rel}（${status}）${hint ? '，' + hint : ''}`);

// hint：取不到时报错里跟着的提示（怎么生成这份数据）
export const fetchJson = async <T>(rel: string, hint = ''): Promise<T> => {
  const res = await fetch(dataUrl(rel));
  if (!res.ok) throw missing(rel, res.status, hint);
  return res.json() as Promise<T>;
};
// 可以没有的：取不到返回 null
export const fetchJsonIfAny = async <T>(rel: string): Promise<T | null> => {
  const res = await fetch(dataUrl(rel));
  return res.ok ? (res.json() as Promise<T>) : null;
};
export const fetchGunzip = async (rel: string, hint = ''): Promise<ArrayBuffer> => {
  const res = await fetch(dataUrl(rel));
  if (!res.ok) throw missing(rel, res.status, hint);
  return gunzip(res.body!);
};

// 同时在取的 Range 请求最多这么多个：一下子全发出去 Chrome 会报 net::ERR_INSUFFICIENT_RESOURCES。取完一个把名额直接交给排着的下一个
const maxConcurrentFetches = 64;
let activeFetches = 0;
const fetchQueue: (() => void)[] = [];
// 文件里 [start, start + len) 这一段的字节，gzip 的顺手解开。服务端不认 Range 的话会整个文件回 200，当错报出来
export const fetchRange = async (rel: string, start: number, len: number, gzip = false): Promise<ArrayBuffer> => {
  if (activeFetches < maxConcurrentFetches) activeFetches++;
  else await new Promise<void>((r) => fetchQueue.push(r));
  try {
    const res = await fetch(dataUrl(rel), { headers: { Range: `bytes=${start}-${start + len - 1}` } });
    if (res.status !== 206) throw new Error(`按 Range 取 ${rel} 的 ${start}～${start + len} 字节，回的是 ${res.status}（要 206）`);
    return await (gzip ? gunzip(res.body!) : res.arrayBuffer());
  } finally {
    const next = fetchQueue.shift();
    if (next) next();
    else activeFetches--;
  }
};

// 同步取文本（模块初始化时用，等不了 fetch）；取不到、出错返回 null。不在浏览器里（Node 跑的工具）canFetchSync 是 false
export const canFetchSync = typeof XMLHttpRequest !== 'undefined';
export const fetchTextSync = (rel: string): string | null => {
  try {
    const x = new XMLHttpRequest();
    x.open('GET', dataUrl(rel), false);
    x.send();
    return x.status === 200 ? x.responseText : null;
  } catch {
    return null;
  }
};

// 每个键只取一次，同一个标签页里各处共用（取失败的也留着，不重取）。键要带上数据的版本（区段包用 packDir），Studio 热更新换了版本才会重取
const loaded = new Map<string, Promise<unknown>>();
export const loadOnce = <T>(key: string, load: () => Promise<T>): Promise<T> => {
  let promise = loaded.get(key) as Promise<T> | undefined;
  if (!promise) {
    promise = load();
    loaded.set(key, promise);
  }
  return promise;
};
