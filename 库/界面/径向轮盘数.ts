// 诡厄巫法（Goety 2.5.60.6，MIT）径向菜单的数和几何，照反编译的 com.Polarice3.Goety.client.gui.radial.GenericRadialMenu 逐项抄；
// 聚晶轮盘 FocusRadialMenuScreen 用的就是它。纯模块（没有 import），画法在 径向轮盘画.ts，组件在 径向轮盘.tsx。
// 坐标是 GUI 像素、屏幕朝向（x 右、y 下），圆心在 (0, 0)；角度是弧度，0 朝右，y 朝下所以角度增大是顺时针。

export const 径向轮盘数 = {
  /** GenericRadialMenu.baseRadius：扇形带内半径 */
  内半径: 30,
  /** draw()：radiusOut = radiusIn * 2.0F */
  外内比: 2,
  /** 构造函数：backgroundColor = 1056964608 = 0x3F000000（ARGB） */
  底色: 0x3f000000,
  /** 构造函数：backgroundColorHover = 1073741823 = 0x3FFFFFFF（ARGB） */
  悬停色: 0x3fffffff,
  /** OPEN_ANIMATION_LENGTH：开、合各 2.5 刻 */
  开合刻: 2.5,
  /** PRECISION = 0.0069444445F：drawPieArc 每段弧不超过这么多弧度（一格拆成 ceil(格角 / PRECISION) 个四边形），格与格共用端点、没有缝 */
  弧段弧度: 0.0069444445,
  /** drawBg()：背景贴图按 256×256 画在屏幕正中（blit 的宽、高、贴图宽、贴图高都是 256） */
  底纹边: 256,
  /** drawBg()：setShaderColor(1, 1, 1, 0.5F) */
  底纹不透明度: 0.5,
  /** draw()：画背景前 translate(animSide, animTop - 1.0F, 0)，背景比圆心高 1 个 GUI 像素 */
  底纹上移: 1,
  /** ItemStackRadialMenuItem.draw()：物品图标 16×16，先 translate(-8, -8) 再画在 (int)x、(int)y */
  图标边: 16,
  /** TextRadialMenuItem.draw()：y = (int)(y - 9 / 2)，9 是 Font.lineHeight，整数除法得 4 */
  文字上移: 4,
} as const;

/** ARGB 整数 → CSS 颜色 */
export const argb色 = (argb: number) => `rgba(${(argb >>> 16) & 255},${(argb >>> 8) & 255},${argb & 255},${((argb >>> 24) & 255) / 255})`;

/** getAngleFor(i, numItems) = (i / n + 0.25) × 2π + π：第 0 格的中线朝正上（3π/2，屏幕 y 朝下），往后顺时针排；i 可以带 ±0.5 取格的两条边 */
export const 格角 = (i: number, 格数: number) => (格数 === 0 ? 0 : (i / 格数 + 0.25) * Math.PI * 2 + Math.PI);

/** iterateVisible()：第 i 格占 [格角(i − 0.5), 格角(i + 0.5))，中线 = 两者平均 */
export const 格范围 = (i: number, 格数: number) => {
  const 起 = 格角(i - 0.5, 格数);
  const 止 = 格角(i + 0.5, 格数);
  return { 起, 止, 中: (起 + 止) * 0.5 };
};

/** updateAnimationState()：打开时进度 = (现在 − 开始) / 2.5，线性、没有缓动，到 1 进 NORMAL；关闭时是 1 − 它。刻从 tick() 记下开始时刻起算 */
export const 开合进度 = (刻: number, 开合刻: number = 径向轮盘数.开合刻) => Math.min(1, Math.max(0, 刻 / 开合刻));

export type 轮盘态 = {
  /** 进度 0～1 */
  进度: number;
  /** OPENING / CLOSING 时 true：只画背景和扇形带；false（NORMAL）才画图标、文字、圆心物品（draw() 里的 isReady()） */
  动画中: boolean;
  /** radiusIn = animated ? max(0.1, baseRadius × 进度) : baseRadius */
  内: number;
  /** radiusOut = radiusIn × 2 */
  外: number;
  /** itemRadius = (radiusIn + radiusOut) × 0.5 */
  图标半径: number;
  /** 背景贴图的缩放（anim），绕屏幕中心 */
  底纹缩放: number;
};

/** 打开后第几刻的状态（draw() 开头那几行）。刻 < 0 还没开，返回 null */
export const 轮盘态 = (刻: number, 内半径: number = 径向轮盘数.内半径): 轮盘态 | null => {
  if (刻 < 0) return null;
  const 进度 = 开合进度(刻);
  const 动画中 = 进度 < 1;
  const 内 = 动画中 ? Math.max(0.1, 内半径 * 进度) : 内半径;
  const 外 = 内 * 径向轮盘数.外内比;
  return { 进度, 动画中, 内, 外, 图标半径: (内 + 外) * 0.5, 底纹缩放: 动画中 ? 进度 : 1 };
};

/** drawItems() + ItemStackRadialMenuItem.draw()：图标左上角 = ((int)(x + r·cos), (int)(y + r·sin)) − 8。屏幕中心 x、y 是整数（width / 2 整数除法），
 *  屏幕坐标都是正的，(int) 就是向下取整，所以相对圆心是 floor(r·cos) − 8：图标落在 GUI 像素格上 */
export const 图标左上 = (角: number, 半径: number, 边: number = 径向轮盘数.图标边): [number, number] => [Math.floor(半径 * Math.cos(角)) - 边 / 2, Math.floor(半径 * Math.sin(角)) - 边 / 2];
