// 数据源接口：Git 外的大数据（区段包、远景包、求解缓存、光体缓存）按相对 public 目录的路径取，路径写法同 engine/core/数据源.ts。
// 三种实现：页面（engine/core/页面数据源.ts，转发给 数据源.ts）、Node（pipeline/世界/node数据源.ts，按链接表读数据根）、内存（engine/core/内存数据源.ts，测试用）。
// 读数据的纯函数一律把源当第一个参数；只有 React 钩子从 pageDataSource() 取默认源。纯模块，不 import remotion（Node 和测试都要执行它）。
// 现在只有第一阶段（远景网格、交界修正、包元数据）用到的方法；没调用方的不先留。以后要加：第二阶段 导入地形.ts 改走数据源时加
// range（块头索引的 Range）、bytes（模型.bin）、url（工人按绝对地址取块文件）；第三阶段 求解缓存、光体缓存改走时加 canReadSync + textSync（模块初始化时同步取）、gunzipIfAny（缓存层可以没有）。
export type DataSource = {
  readonly kind: 'page' | 'node' | 'memory';
  /** 取不到就抛 missingDataError；hint：报错里跟着的提示（怎么生成这份数据） */
  json<T>(rel: string, hint?: string): Promise<T>;
  /** 可以没有的：取不到给 null */
  jsonIfAny<T>(rel: string): Promise<T | null>;
  /** gzip 文件解开 */
  gunzip(rel: string, hint?: string): Promise<ArrayBuffer>;
  /** 每个键只取一次，按源隔离；取失败的也留着，不重取。键要带上数据的版本 */
  once<T>(key: string, load: () => Promise<T>): Promise<T>;
};

// 和 数据源.ts 的报错同一个写法；status：页面是 HTTP 状态，Node 是错误码
export const missingDataError = (rel: string, status: number | string, hint = '') => new Error(`取不到 ${rel}（${status}）${hint ? '，' + hint : ''}`);

/** 实例自己的去重表（Node、内存源用；页面源转给 数据源.ts 的 loadOnce，和 导入地形.ts 共用一张） */
export const onceTable = () => {
  const loaded = new Map<string, Promise<unknown>>();
  return <T>(key: string, load: () => Promise<T>): Promise<T> => {
    let promise = loaded.get(key) as Promise<T> | undefined;
    if (!promise) {
      promise = load();
      loaded.set(key, promise);
    }
    return promise;
  };
};
