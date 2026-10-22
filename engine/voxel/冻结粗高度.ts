// 冻结的粗高度：编排（航线、巡航高度、地标原点）在模块加载时同步要用区段包的 包.json 里的原点和粗高度图，这份拷进仓库（assets/冻结粗高度/<包名>.json），
// 不在打包时 import Git 外的区段包：没有地形包也能打包、渲古城这类不用地形的段；别人重烘地形、换平台重烘，已经卡好配乐的航线也不跟着变（报告第 5 条）。
// 用到哪个包的编排自己 import 那一份交进来，engine 不登记有哪些包：加一份不用改 engine，也不让没用到它的段跟着过期。
// 重新生成：旧项目工具 工具/导入/更新冻结粗高度.ts（待迁移），从登记的那版区段包拷。渲染时导入地形取到 包.json 后和这里比指纹，对不上只报警。
import { coarseHeightFingerprint, decodeCoarseHeight, type 包信息, type 粗高度图 } from './区段包.ts';

export type 冻结粗高度文件 = { 说明: string; 包: string; 版本: string; 指纹: string; 维度: string; 原点: [number, number, number]; 粗高度: 包信息['粗高度'] };

// 本页面里用过的冻结文件（包名 → 文件），导入地形时拿来比指纹
const used = new Map<string, 冻结粗高度文件>();
const decoded = new Map<string, 粗高度图>();

const remember = (file: 冻结粗高度文件) => {
  used.set(file.包, file);
  return file;
};
// 包的原点 [ox, oy, oz]（游戏坐标，见 区段包.ts 文件头）
export const frozenOrigin = (file: 冻结粗高度文件) => remember(file).原点;
export const frozenCoarse = (file: 冻结粗高度文件): 粗高度图 => {
  let coarse = decoded.get(file.包);
  if (!coarse) decoded.set(file.包, (coarse = decodeCoarseHeight(remember(file))));
  return coarse;
};

// 导入地形取到的那版包的粗高度和冻结的对不上：画面上的地形是新的，航线还按冻结的那份排，可能钻地、离树太近
export const checkFrozenCoarse = (packName: string, runtime: 粗高度图) => {
  const file = used.get(packName);
  if (!file) return;
  const fingerprint = coarseHeightFingerprint(runtime);
  if (fingerprint !== file.指纹)
    console.warn(`冻结粗高度：区段包 ${packName} 的粗高度（指纹 ${fingerprint}）和冻结的那份（${file.版本}，指纹 ${file.指纹}）不一样，编排还按冻结的排；要跟上新地形，重新生成 assets/冻结粗高度/ 下那份（工具待迁移，见本文件头）再核对航线`);
};
