// esbuild 的 asset: 解析（指纹、检查拿依赖闭包用，不出真正的包）：asset:<id> 解析成虚拟模块，记下用到的 id 和 sha256；
// 锁里没有的 id 让构建失败，报错和 webpack 那边一样。其余非代码文件（png、ogg、bin…）只当空模块，内容由资产 sha 或文件本身进指纹。
// 另有 @engine/、@库/ 别名的解析（表在 环境/别名.ts）。
import path from 'node:path';
import type { Plugin } from 'esbuild';
import { aliasTable } from '../环境/别名.ts';
import { MissingAsset, type AssetLock } from './资产锁.ts';

export type AssetRecordMap = Map<string, string>; // id → sha256

export const esbuildAssetPlugin = (assetLock: AssetLock, assetRecord: AssetRecordMap): Plugin => ({
  name: 'anim-资产',
  setup(build) {
    build.onResolve({ filter: /^asset:/ }, (args) => {
      const id = args.path.slice('asset:'.length);
      const entry = assetLock[id];
      if (!entry) return { errors: [{ text: new MissingAsset(`资产锁里没有「${id}」：先在 assets/registry/<类>.toml（只有一部作品用的在 <作品根>/资产表/）登记，再跑 anim assets add ${id} <文件> 入库、写资产锁`).message }] };
      assetRecord.set(id, entry.sha256);
      return { path: id, namespace: 'anim-资产' };
    });
    build.onLoad({ filter: /.*/, namespace: 'anim-资产' }, (args) => ({ contents: `export default ${JSON.stringify('asset:' + assetLock[args.path]!.sha256)};`, loader: 'js' }));
  },
});

/** 闭包里会遇到的非代码文件：当空模块（文件本身仍在 metafile.inputs 里，照样进指纹） */
export const nonCodeLoaders = Object.fromEntries(
  ['.png', '.jpg', '.webp', '.ogg', '.wav', '.m4a', '.mp3', '.bin', '.ttf', '.otf', '.woff', '.woff2', '.css', '.cjs.map'].map((ext) => [ext, 'empty' as const]),
);

const aliasFilter = new RegExp(`^(${Object.keys(aliasTable).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`);

/** `@engine/x`、`@库/x` 按代码根下的相对路径解析。插件的 onResolve 先于 packages: 'external' 的判断，不然会被当成 npm 包放过去 */
export const esbuildAliasPlugin = (codeRoot: string): Plugin => ({
  name: 'anim-别名',
  setup(build) {
    build.onResolve({ filter: aliasFilter }, async (args) => {
      const aliasPrefix = Object.keys(aliasTable).find((k) => args.path.startsWith(k))!;
      const relSpecifier = `./${path.posix.join(aliasTable[aliasPrefix]!, args.path.slice(aliasPrefix.length))}`;
      const r = await build.resolve(relSpecifier, { kind: args.kind, resolveDir: codeRoot, importer: args.importer, with: args.with, pluginData: args.pluginData });
      return r.errors.length ? { errors: r.errors } : { path: r.path, external: r.external, namespace: r.namespace, sideEffects: r.sideEffects };
    });
  },
});
