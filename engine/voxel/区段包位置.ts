// 区段包在 public 目录下的位置：terrain/<名>/<版本>/<文件>（terrain 链到 <数据根>/terrain，见 pipeline/渲/public目录.ts），版本按进 Git 的 assets/地形版本.json 取。
import versionTable from '../../assets/地形版本.json';

const versions: Record<string, string> = Object.fromEntries(Object.entries(versionTable.包).map(([k, v]) => [k, v.版本]));

const packVersion = (packName: string) => {
  const version = versions[packName];
  if (!version) throw new Error(`区段包 ${packName} 没在 assets/地形版本.json 里登记版本`);
  return version;
};
// 相对 public 目录的路径，交给 engine/core/数据源.ts。一个包取到的各个文件要出自同一版：取包时记下 packDir，后面的文件都从它拼，缓存也按它做键
export const packDir = (packName: string) => `terrain/${packName}/${packVersion(packName)}`;
