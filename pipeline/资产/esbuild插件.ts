// esbuild 的 asset: 解析（指纹、检查拿依赖闭包用，不出真正的包）：asset:<id> 解析成虚拟模块，记下用到的 id 和 sha256；
// 锁里没有的 id 让构建失败，报错和 webpack 那边一样。其余非代码文件（png、ogg、bin…）只当空模块，内容由资产 sha 或文件本身进指纹。
import type { Plugin } from 'esbuild';
import { 缺资产, type 资产锁 } from './资产锁.ts';

export type 资产记录 = Map<string, string>; // id → sha256

export const esbuild资产插件 = (锁: 资产锁, 记录: 资产记录): Plugin => ({
  name: 'anim-资产',
  setup(build) {
    build.onResolve({ filter: /^asset:/ }, (args) => {
      const id = args.path.slice('asset:'.length);
      const 条目 = 锁[id];
      if (!条目) return { errors: [{ text: new 缺资产(`资产锁里没有「${id}」：先在 assets/registry/<类>.toml 登记，再跑 anim assets add ${id} <文件> 入库、写资产锁`).message }] };
      记录.set(id, 条目.sha256);
      return { path: id, namespace: 'anim-资产' };
    });
    build.onLoad({ filter: /.*/, namespace: 'anim-资产' }, (args) => ({ contents: `export default ${JSON.stringify('asset:' + 锁[args.path]!.sha256)};`, loader: 'js' }));
  },
});

/** 闭包里会遇到的非代码文件：当空模块（文件本身仍在 metafile.inputs 里，照样进指纹） */
export const 非代码loader = Object.fromEntries(
  ['.png', '.jpg', '.webp', '.ogg', '.wav', '.m4a', '.mp3', '.bin', '.ttf', '.otf', '.woff', '.woff2', '.css', '.cjs.map'].map((ext) => [ext, 'empty' as const]),
);
