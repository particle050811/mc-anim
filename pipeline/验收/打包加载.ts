// 在本进程里加载一份检出的作品模块（连 画面.tsx、three 一起）：esbuild 按那份检出的根打包（@engine/、@库/ 解析到它自己的目录），
// npm 包留在外部、按本检出的 node_modules 解析（版本锁死，两边一样）；asset: 按给的资产锁取字节：json 给内容、png 给 data URI、别的给 asset:<id> 字符串。
// 动作体检（verify motion）、成片时间轴、anim impact 加载对方检出的代码都走这里。
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { codeRoot as selfRoot } from '../环境/路径.ts';
import { esbuildAliasPlugin } from '../资产/esbuild插件.ts';
import { resolveAsset, type AssetLock } from '../资产/资产锁.ts';

export type BundleEntry = { file: string } | { contents: string; resolveDir: string };

export const importBundled = async (entry: BundleEntry, o: { codeRoot: string; lock: AssetLock }): Promise<Record<string, unknown>> => {
  const built = await build({
    ...('file' in entry ? { entryPoints: [entry.file] } : { stdin: { contents: entry.contents, resolveDir: entry.resolveDir, loader: 'ts', sourcefile: '入口.ts' } }),
    bundle: true, format: 'esm', packages: 'external', platform: 'node', write: false, jsx: 'automatic', logLevel: 'silent',
    plugins: [esbuildAliasPlugin(o.codeRoot), {
      name: 'bundle-assets', setup(builder) {
        builder.onResolve({ filter: /^asset:/ }, args => ({ path: args.path.slice(6), namespace: 'bundle-asset' }));
        builder.onLoad({ filter: /.*/, namespace: 'bundle-asset' }, args => {
          const { file, entry: asset } = resolveAsset(args.path, o.lock);
          if (asset.suffix === '.json') return { contents: fs.readFileSync(file), loader: 'json' };
          const value = asset.suffix === '.png' ? `data:image/png;base64,${fs.readFileSync(file).toString('base64')}` : `asset:${args.path}`;
          return { contents: `export default ${JSON.stringify(value)}` };
        });
      },
    }],
  });
  // 写进本检出的 node_modules 下：外部的 npm 包从这里往上找得到
  const cache = path.join(selfRoot(), 'node_modules', '.cache');
  fs.mkdirSync(cache, { recursive: true });
  const dir = fs.mkdtempSync(path.join(cache, 'bundle-'));
  try {
    const moduleFile = path.join(dir, 'entry.mjs');
    fs.writeFileSync(moduleFile, built.outputFiles[0]!.contents);
    return (await import(pathToFileURL(moduleFile).href)) as Record<string, unknown>;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};
