// 两张床（物品/床.tsx 原版红床、物品/女仆床.tsx 车万女仆女仆床）的朝向和量出来的尺寸。纯模块，给摆位置、算光斑、测试用。
// 坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格）。

/** 床头朝哪边（方块状态的 facing） */
export type 床朝向 = 'north' | 'south' | 'east' | 'west';
/** 朝向的格步（场景坐标：北 = +y）：床尾 = 床头 − 这一步 */
export const 朝向步: Record<床朝向, readonly [number, number]> = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0] };

/** 原版床床垫顶面离地多高（格）：BedRenderer.renderPiece 先抬 9/16、床身 6 像素厚往下压，顶面就在 9/16 */
export const 床面高 = 9 / 16;
/** 女仆床被子顶面离地多高（格）：被子方盒 y 3.25 + 4.25，膨胀 0.03（maid_bed/pink.json） */
export const 女仆床面高 = (3.25 + 4.25 + 0.03) / 16;
/** 女仆床床头板顶离地多高（格）：床头板方盒 y 0.25 + 12.25，外面那层膨胀 0.2 */
export const 女仆床头板高 = (0.25 + 12.25 + 0.2) / 16;
