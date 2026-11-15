// 把一组显式 import 的资产拼成和 import.meta.webpackContext 同形的函数（keys() 按码位排序，和 webpack 一样），
// 代替旧代码按目录批量导入资产文件（资产不再是仓库里的相对文件，只能逐个 import 'asset:<id>'）。
export const assetDir = <T>(assetMap: Record<string, T>) => {
  const keys = Object.keys(assetMap).sort();
  const getAsset = (k: string): T => {
    if (!(k in assetMap)) throw new Error(`资产目录里没有 ${k}`);
    return assetMap[k]!;
  };
  return Object.assign(getAsset, { keys: () => keys });
};
