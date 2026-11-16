// B 站封面的安全区（03-封面.md：交 1920×1080，4:3 取中间）：纯函数，按画面宽高（像素）给出各区的边。
// 4:3：1920 宽里取 x 240～1680，她的脸和左下聊天栏那行字都要落在里面；底边约 20%、16:9 右下角约 31% × 28% 不放脸和字（时长角标、标题遮挡）。
import { coverChatLayout } from './参数.ts';

export const coverSafeArea = (W: number, H: number) => ({
  fourThreeRect: { x0: (W * 240) / 1920, x1: (W * 1680) / 1920 },
  bottomEdge: { y0: H * 0.8 },
  bottomRight: { x0: W * (1 - 0.31), y0: H * (1 - 0.28) },
});

/** 点 (x, y)（像素）能不能放脸和字：在 4:3 里、不在底边 20%、不在右下角 */
export const coverPointFits = (W: number, H: number, x: number, y: number): boolean => {
  const { fourThreeRect, bottomEdge, bottomRight } = coverSafeArea(W, H);
  return x >= fourThreeRect.x0 && x <= fourThreeRect.x1 && y < bottomEdge.y0 && !(x > bottomRight.x0 && y > bottomRight.y0);
};

export type Rect = { x0: number; y0: number; x1: number; y1: number };

/** 整个框（四个角，右、下边取开区间）能不能放 */
export const coverBoxFits = (W: number, H: number, b: Rect): boolean =>
  [
    [b.x0, b.y0],
    [b.x1 - 0.01, b.y0],
    [b.x0, b.y1 - 0.01],
    [b.x1 - 0.01, b.y1 - 0.01],
  ].every(([x, y]) => coverPointFits(W, H, x!, y!));

/** 封面版聊天行的黑条（页面像素）：照原版一行的样子，左边 2 像素系统竖条、字从 4 起，黑条贴着字收（右边也留 4），高 9（界面像素）。
 *  字宽是界面像素（像素字体的 字宽） */
export const coverChatBox = (textWidth: number, layout = coverChatLayout): Rect => {
  const halfScale = layout.scale / 2;
  return { x0: layout.left, y0: layout.下 - 9 * halfScale, x1: layout.left + (textWidth + 8) * halfScale, y1: layout.下 };
};
