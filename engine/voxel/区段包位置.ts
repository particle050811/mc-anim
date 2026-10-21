// 区段包在数据根 渲染/ 下的位置：区段包/<名>/<版本>/<文件>，版本按进 Git 的 区段包版本.json 取（发布新版本、算版本见 工具/导入/区段包版本.mjs）。
import versionTable from '../../assets/地形版本.json';

const versions: Record<string, string> = versionTable.版本;

const packVersion = (packName: string) => {
  const version = versions[packName];
  if (!version) throw new Error(`区段包 ${packName} 没在 src/lib/体素/区段包版本.json 里登记版本`);
  return version;
};
// 相对 渲染/ 的路径，交给 lib/数据源.ts。一个包取到的各个文件要出自同一版：取包时记下 packDir，后面的文件都从它拼，缓存也按它做键
export const packDir = (packName: string) => `区段包/${packName}/${packVersion(packName)}`;
