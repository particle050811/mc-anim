// 求解缓存：模块初始化时的重计算（一镜到底的航线求解）按「层」存成文件，下一个页面直接读（用户 10-11：做个类似 Docker 的分级缓存）。
// Remotion 每渲一段至少开两个页面，每个页面都从头执行所有模块，古城这种用不到航线的段也照算（Root 一加载就 import 了全部镜头）。
// 分层：缓存键 = 哈希(层名 + 各层的键部件)，调用方把每一层放进 键部件：代码层是求解代码的源码指纹（`solverFingerprint(moduleName)`：打包时 pipeline/指纹/求解指纹.ts 按作品 清单.ts 导出的 求解入口 用 esbuild 列出模块依赖闭包、算哈希，pipeline/资产/webpack.ts 经 DefinePlugin 注入）；
// 数据层、输入层由调用方按值给（地形粗高度图指纹、这一程的起止端态和参数……）。哪层变了键就变；别的改动不碰这些层，照样命中。代码层按依赖闭包自动算，不手列文件，免得漏写依赖而缓存过期不自知。
// 读：同步取 public 目录下的 求解/<键>.json（链到 <数据根>/cache/求解/，见 pipeline/渲/public目录.ts；经 数据源.ts 的 fetchTextSync，模块初始化是同步的，等不了 fetch）。
// 写：页面写不了盘，新算出来的挂在 window.__求解缓存待写，由 anim render 在页面关掉前收走写进同一个目录（pipeline/渲/求解缓存收集.ts）。
// Studio 里不用（配置文件只在 Studio 启动时算一次指纹）；Node 里跑的工具没注入指纹，也不用。
// 数值原样存：Float64Array 按字节，-0、NaN、±Infinity 单独标出（JSON 会把 -0 写成 0、NaN 写成 null），读回来和现算逐位一样。
import { getRemotionEnvironment } from 'remotion';
import { canFetchSync, fetchTextSync } from './数据源.ts';

declare const __SOLVER_FINGERPRINTS__: Record<string, string> | undefined;

export const solverFingerprint = (moduleName: string): string | null => (typeof __SOLVER_FINGERPRINTS__ === 'undefined' ? null : (__SOLVER_FINGERPRINTS__[moduleName] ?? null));

// 64 位字符串哈希（两路 32 位乘法哈希）：键只用来找文件，不防碰撞攻击
export const hash64 = (str: string) => {
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ charCode, 2654435761);
    h2 = Math.imul(h2 ^ charCode, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
};

// 键部件转成确定的字符串：对象按键名排序，数字按 String（-0 单独写），类型数组逐个数字；函数不能当键（它的行为要靠代码层的指纹管）
const keyString = (x: unknown): string => {
  if (typeof x === 'number') return Object.is(x, -0) ? '-0' : String(x);
  if (typeof x === 'string') return JSON.stringify(x);
  if (typeof x === 'boolean' || x === null || x === undefined) return String(x);
  if (typeof x === 'function') throw new Error('求解缓存：函数不能放进键里');
  if (ArrayBuffer.isView(x)) return `[${Array.from(x as unknown as ArrayLike<number>, keyString).join(',')}]`;
  if (Array.isArray(x)) return `[${x.map(keyString).join(',')}]`;
  const obj = x as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${keyString(obj[k])}`).join(',')}}`;
};

const toBase64 = (floats: Float64Array) => {
  const bytes = new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength);
  let binStr = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binStr += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binStr);
};
const encode = (x: unknown) =>
  JSON.stringify(x, function (this: Record<string, unknown>, k) {
    const value = this[k];
    if (value instanceof Float64Array) return { $f64: toBase64(value) };
    if (ArrayBuffer.isView(value)) throw new Error('求解缓存：只认 Float64Array');
    if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0))) return { $n: Object.is(value, -0) ? '-0' : String(value) };
    return value;
  });
const decode = (s: string) =>
  JSON.parse(s, (_k, value) => {
    if (value && typeof value === 'object' && '$f64' in value) {
      const bytes = Uint8Array.from(atob(value.$f64), (c) => c.charCodeAt(0));
      return new Float64Array(bytes.buffer);
    }
    if (value && typeof value === 'object' && '$n' in value) return value.$n === '-0' ? -0 : Number(value.$n);
    return value;
  });

const cacheEnabled = typeof window !== 'undefined' && canFetchSync && !getRemotionEnvironment().isStudio;
const pendingWrites: Record<string, string> = cacheEnabled ? ((window as unknown as { __求解缓存待写?: Record<string, string> }).__求解缓存待写 ??= {}) : {};

// 层：这个缓存是什么（写进文件里，查问题用）；键部件：各层的键（代码层的指纹放第一个；拿不到指纹就不用缓存，照常算）
export const cachedSolve = <Result>(layer: string, keyParts: unknown[], compute: () => Result): Result => {
  if (!cacheEnabled || keyParts.some((k) => k === null)) return compute();
  const fileName = `${hash64(layer + '|' + keyString(keyParts))}.json`;
  const cached = fetchTextSync(`求解/${fileName}`);
  try {
    if (cached !== null) return decode(cached).值 as Result;
  } catch {
    // 坏了就现算
  }
  const value = compute();
  pendingWrites[fileName] = encode({ 层: layer, 值: value });
  return value;
};
