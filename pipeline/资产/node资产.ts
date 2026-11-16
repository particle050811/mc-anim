// 在 Node 里（不经 Remotion 打包）执行带 `asset:<id>` import 的 engine 模块：只认 JSON 资产，按资产锁换成数据根 store/ 里的字节（钩子在 node资产钩子.ts）。
// anim world 用它直接跑 engine/voxel 的区段包格式和方块表（格式只有一份定义，不另抄一份）。
// vitest 不走这个钩子（它自己转 import，不认 asset:），所以没有单测直接载入体素库；烘焙的逐字节核对见 docs/世界.md。
// 别的后缀（贴图、音频）在 Node 里没有意义，碰到就报错，不悄悄给占位。
import fs from 'node:fs';
import { readAssetLock, bytesPath } from './资产锁.ts';

/** asset id → 字节的绝对路径（只收 .json、字节在数据根的） */
export const assetJsonTable = (dataRoot?: string): Record<string, string> => {
  const assetJsonMap: Record<string, string> = {};
  for (const [id, l] of Object.entries(readAssetLock())) {
    if (l.suffix !== '.json') continue;
    const f = bytesPath(l, dataRoot);
    if (fs.existsSync(f)) assetJsonMap[id] = f;
  }
  return assetJsonMap;
};
