// vitest 里的 `asset:<id>`：形状和 webpack 打包后一样（webpack.ts），engine、库、作品的模块在单测里能直接导入，不用逐个 vi.mock 补。
// JSON 读数据根里的真字节（解析后的值）；png 给 data URI（同 webpack，单测能解出真像素）；别的后缀（音频、.bin 等）给 "asset:<id>" 占位字符串。
// 只在 vitest 里给占位（用户 11-17 定）：单测要的是把模块导进来、测纯逻辑，音频、二进制的 URL 本来只给浏览器取；
// Node 工具（node资产.ts）照旧碰到非 JSON 就报错，那里真去读字节，给了占位会悄悄出错的结果。锁里没有的 id、JSON 和 png 的字节不在数据根，这里也报错。
// 用哪份锁按引用方定：作品目录里的模块用那部作品的锁（读作品资产锁，含换用和材质包，同出片）；engine、库的模块用共用锁（不换用、不套材质包），
// 单测结果不随「当前作品」变。
import fs from 'node:fs';
import path from 'node:path';
import { listWorks } from '../环境/作品.ts';
import { readAssetLock, readWorkAssetLock, resolveAsset, type AssetLock } from './资产锁.ts';

const prefix = 'asset:';
// 虚拟模块 id：\0 开头 vite 不当文件；带上用哪份锁，同一 id 在不同作品里换用的不混成一个模块
const virtualPrefix = '\0anim资产:';
const sharedLockKey = '';

/** vite 插件的最小形状（不为类型多引 vite 依赖） */
type VitePlugin = { name: string; enforce: 'pre'; resolveId: (source: string, importer?: string) => string | undefined; load: (id: string) => string | undefined };

export const vitestAssetPlugin = (): VitePlugin => {
  const locks = new Map<string, AssetLock>();
  const lockFor = (workRoot: string) => {
    let lock = locks.get(workRoot);
    if (!lock) locks.set(workRoot, (lock = workRoot === sharedLockKey ? readAssetLock() : readWorkAssetLock(workRoot)));
    return lock;
  };
  let workRoots: string[] | undefined;
  const workOf = (importer: string | undefined) => {
    if (!importer) return sharedLockKey;
    workRoots ??= [...listWorks().values()];
    const file = path.resolve(importer.split('?')[0]!);
    return workRoots.find((root) => file.startsWith(root + path.sep)) ?? sharedLockKey;
  };
  return {
    name: 'anim-资产',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!source.startsWith(prefix)) return undefined;
      return `${virtualPrefix}${encodeURIComponent(workOf(importer))}:${source.slice(prefix.length)}`;
    },
    load(moduleId) {
      if (!moduleId.startsWith(virtualPrefix)) return undefined;
      const rest = moduleId.slice(virtualPrefix.length);
      const sep = rest.indexOf(':');
      const workRoot = decodeURIComponent(rest.slice(0, sep));
      const id = rest.slice(sep + 1);
      const lock = lockFor(workRoot);
      const suffix = lock[id]?.suffix;
      // 占位的不碰字节（数据根缺私有音频也能导入）；锁里没有的交给 resolveAsset 报错
      if (suffix && suffix !== '.json' && suffix !== '.png') return `export default ${JSON.stringify(prefix + id)};`;
      const { file } = resolveAsset(id, lock);
      if (suffix === '.json') return `export default ${fs.readFileSync(file, 'utf8')};`;
      return `export default ${JSON.stringify(`data:image/png;base64,${fs.readFileSync(file).toString('base64')}`)};`;
    },
  };
};
