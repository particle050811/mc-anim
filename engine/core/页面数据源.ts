// 页面（Remotion 渲染、Studio）上的数据源：每个方法原样转给 engine/core/数据源.ts，请求数、Range 并发队列、loadOnce 的表和键都和直接调一样。
// 数据源.ts 不改：它经 engine/audio/私有配乐.ts 进了全片的声音地址，改一个字那些段全过期。
// 只给 React 钩子取默认源；Node 里没有 window，直接报错，要显式传 pipeline/世界/node数据源.ts 的 nodeDataSource()。
import { canFetchSync, dataUrl, fetchGunzip, fetchJson, fetchJsonIfAny, fetchRange, fetchTextSync, gunzip, loadOnce } from './数据源.ts';
import { missingDataError, type DataSource } from './数据读取.ts';

const pageSource: DataSource = {
  kind: 'page',
  json: fetchJson,
  jsonIfAny: fetchJsonIfAny,
  gunzip: fetchGunzip,
  // 同 engine/light/光体缓存读写.ts 的取法
  gunzipIfAny: async (rel) => {
    const res = await fetch(dataUrl(rel));
    return res.ok ? gunzip(res.body!) : null;
  },
  // 同 engine/voxel/导入地形.ts 取模型的写法
  bytes: async (rel, hint) => {
    const res = await fetch(dataUrl(rel));
    if (!res.ok) throw missingDataError(rel, res.status, hint);
    return new Uint8Array(await res.arrayBuffer());
  },
  range: fetchRange,
  canReadSync: canFetchSync,
  textSync: fetchTextSync,
  once: loadOnce,
  url: dataUrl,
};

export const pageDataSource = (): DataSource => {
  if (typeof window === 'undefined') throw new Error('不在页面里：Node 里要显式传数据源（pipeline/世界/node数据源.ts 的 nodeDataSource()）');
  return pageSource;
};
