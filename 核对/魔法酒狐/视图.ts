// 魔法酒狐核对的视图表（纯数据，段.ts 也读）：一帧一个视图。
// 现在只有一个占位；模型组件做好后，照 作品/应力转动/核对/角色包/视图.ts 的样子填正、背、仰视和第一人称机位这些视图。
export type 视图 = {
  名: string;
  宽: number;
  高: number;
};

export const 视图们: readonly 视图[] = [{ 名: '占位', 宽: 1280, 高: 720 }];

export const 页宽 = Math.max(...视图们.map((v) => v.宽));
export const 页高 = Math.max(...视图们.map((v) => v.高));
