// 原版箱子界面（ContainerScreen，3 行箱子）箱子部分的尺寸和格子位置，GUI 像素。纯数据，镜头编排和 箱子界面.tsx 共用（出处见 箱子界面.tsx 文件头）。
// 高 = 标题区 17 + 3 行 × 18 + 下边 7（generic_54.png 底边留白，同左右边距）
export const chestScreenSize = { width: 176, height: 17 + 3 * 18 + 7 };
// 箱子格编号 0～26（逐行），返回物品图标左上角
export const slotPos = (i: number): [number, number] => [8 + 18 * (i % 9), 18 + 18 * Math.floor(i / 9)];
export const slotCenter = (i: number): [number, number] => {
  const [x, y] = slotPos(i);
  return [x + 8, y + 8];
};
export const allSlots = Array.from({ length: 27 }, (_, i) => i);
