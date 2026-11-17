// 重锤的尺寸：握持点到锤头中心、到顶钮多远，模型缩放和柄轴。纯数（照资源包 geo.json 的 cube 数值抄下来的常数，不在运行时读模型），不带模型字节、react、three。
// 出处、握持点和朝向的约定见 重锤.tsx 文件头。编排要锤长就从这里引，不用把 重锤.tsx 拖进闭包；重锤.tsx 原样转出 MACE。

export const MACE_MODEL_SCALE = 1.5; // mace_wield 给 rightitem 的缩放：模型一个单位 = 玩家 1.5 像素
export const MACE_HANDLE_AXIS: [number, number] = [-0.5, -0.20711]; // 柄轴在 item2 文件坐标里的 x、z
const HEAD_CENTER_Y = 4.70711 + 5 / 2; // 锤头中心沿柄的位置（item2 的 y，握持点为 0）
const TIP_Y = 9.60711 + 1.2; // 顶钮最远处
export const MACE = {
  head: (HEAD_CENTER_Y * MACE_MODEL_SCALE) / 16, // 握持点到锤头中心（格，沿锤柄方向）
  tip: (TIP_Y * MACE_MODEL_SCALE) / 16, // 握持点到顶钮最远处
};
