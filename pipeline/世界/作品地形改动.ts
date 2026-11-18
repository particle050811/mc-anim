import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { esbuildAliasPlugin, nonCodeLoaders } from '../资产/esbuild插件.ts';
import { workAssetLockPath, bytesPath, readAssetLock } from '../资产/资产锁.ts';
import type { LandmarkCutout, FlattenArea } from '../../engine/voxel/导入区段.ts';
export type TerrainChange = { name: string; pack: string; digBoxes: LandmarkCutout[]; flattenAreas: FlattenArea[] };

/** 打包执行登记文件：asset: 换成数据根里的 JSON；缺字节返回 null（错误照抛） */
export const readTerrainEdits = async (root: string, work: string, dataRoot: string): Promise<TerrainChange[] | null> => {
  const assetLock = { ...readAssetLock(path.join(root, 'assets', '资产锁')), ...readAssetLock(workAssetLockPath(work)) };
  let missingPath = '';
  const out = await build({
    entryPoints: [path.join(work, '地点/地形改动.ts')],
    absWorkingDir: root,
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    jsx: 'automatic',
    loader: { ...nonCodeLoaders, '.json': 'json' },
    logLevel: 'silent',
    plugins: [
      esbuildAliasPlugin(root),
      {
        name: '真资产',
        setup(b) {
          b.onResolve({ filter: /^asset:/ }, (a) => ({ path: a.path.slice('asset:'.length), namespace: '真资产' }));
          b.onLoad({ filter: /.*/, namespace: '真资产' }, (a) => {
            const l = assetLock[a.path],
              f = l && bytesPath(l, dataRoot);
            if (!l) return { errors: [{ text: `资产锁里没有 asset:${a.path}` }] };
            // 贴图、音频同 宽松资产插件 给个字符串：挖框、整平用不到它们，真要解码会在执行时报错，不会悄悄算错
            if (l.suffix !== '.json') return { contents: `export default ${JSON.stringify(`asset:${a.path}`)};`, loader: 'js' };
            if (!fs.existsSync(f!)) {
              missingPath ||= a.path;
              return { contents: 'export default null;', loader: 'js' };
            }
            return { contents: fs.readFileSync(f!, 'utf8'), loader: 'json' };
          });
        },
      },
    ],
  });
  if (missingPath) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-地形改动-'));
  try {
    const f = path.join(dir, '登记.mjs');
    fs.writeFileSync(f, out.outputFiles[0]!.text, 'utf8');
    return ((await import(pathToFileURL(f).href)) as { terrainEdits: TerrainChange[] }).terrainEdits;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};
