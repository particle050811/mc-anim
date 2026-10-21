// 把一组显式 import 的资产拼成和 import.meta.webpackContext 同形的函数（keys() 按码位排序，和 webpack 一样），
// 代替旧代码按目录批量导入资产文件（资产不再是仓库里的相对文件，只能逐个 import 'asset:<id>'）。
export const 资产目录 = <T>(表: Record<string, T>) => {
  const 键们 = Object.keys(表).sort();
  const 取 = (k: string): T => {
    if (!(k in 表)) throw new Error(`资产目录里没有 ${k}`);
    return 表[k]!;
  };
  return Object.assign(取, { keys: () => 键们 });
};
