// 诡厄巫法（Goety 2.5.60.6，MIT）径向菜单的数和几何，照反编译的 com.Polarice3.Goety.client.gui.radial.GenericRadialMenu 逐项抄；
// 聚晶轮盘 FocusRadialMenuScreen 用的就是它。纯模块（没有 import），画法在 径向轮盘画.ts，组件在 径向轮盘.tsx。
// 坐标是 GUI 像素、屏幕朝向（x 右、y 下），圆心在 (0, 0)；角度是弧度，0 朝右，y 朝下所以角度增大是顺时针。

export const radialWheelConst = {
  /** GenericRadialMenu.baseRadius：扇形带内半径 */
  fullInnerRadius: 30,
  /** draw()：radiusOut = radiusIn * 2.0F */
  outerInnerRatio: 2,
  /** 构造函数：backgroundColor = 1056964608 = 0x3F000000（ARGB） */
  底色: 0x3f000000,
  /** 构造函数：backgroundColorHover = 1073741823 = 0x3FFFFFFF（ARGB） */
  hoverColor: 0x3fffffff,
  /** OPEN_ANIMATION_LENGTH：开、合各 2.5 刻 */
  openCloseTicks: 2.5,
  /** PRECISION = 0.0069444445F：drawPieArc 每段弧不超过这么多弧度（一格拆成 ceil(格角 / PRECISION) 个四边形），格与格共用端点、没有缝 */
  arcSegmentRad: 0.0069444445,
  /** drawBg()：背景贴图按 256×256 画在屏幕正中（blit 的宽、高、贴图宽、贴图高都是 256） */
  backdropSize: 256,
  /** drawBg()：setShaderColor(1, 1, 1, 0.5F) */
  backdropOpacity: 0.5,
  /** draw()：画背景前 translate(animSide, animTop - 1.0F, 0)，背景比圆心高 1 个 GUI 像素 */
  backdropLift: 1,
  /** ItemStackRadialMenuItem.draw()：物品图标 16×16，先 translate(-8, -8) 再画在 (int)x、(int)y */
  iconEdge: 16,
  /** TextRadialMenuItem.draw()：y = (int)(y - 9 / 2)，9 是 Font.lineHeight，整数除法得 4 */
  textLift: 4,
} as const;

/** ARGB 整数 → CSS 颜色 */
export const argbColor = (argb: number) => `rgba(${(argb >>> 16) & 255},${(argb >>> 8) & 255},${argb & 255},${((argb >>> 24) & 255) / 255})`;

/** getAngleFor(i, numItems) = (i / n + 0.25) × 2π + π：第 0 格的中线朝正上（3π/2，屏幕 y 朝下），往后顺时针排；i 可以带 ±0.5 取格的两条边 */
export const cellAngle = (i: number, cellCount: number) => (cellCount === 0 ? 0 : (i / cellCount + 0.25) * Math.PI * 2 + Math.PI);

/** iterateVisible()：第 i 格占 [格角(i − 0.5), 格角(i + 0.5))，中线 = 两者平均 */
export const cellRange = (i: number, cellCount: number) => {
  const startAngle = cellAngle(i - 0.5, cellCount);
  const end = cellAngle(i + 0.5, cellCount);
  return { 起: startAngle, 止: end, 中: (startAngle + end) * 0.5 };
};

/** updateAnimationState()：打开时进度 = (现在 − 开始) / 2.5，线性、没有缓动，到 1 进 NORMAL；关闭时是 1 − 它。刻从 tick() 记下开始时刻起算 */
export const openProgress = (tick: number, openCloseTicks: number = radialWheelConst.openCloseTicks) => Math.min(1, Math.max(0, tick / openCloseTicks));

export type WheelState = {
  /** 进度 0～1 */
  进度: number;
  /** OPENING / CLOSING 时 true：只画背景和扇形带；false（NORMAL）才画图标、文字、圆心物品（draw() 里的 isReady()） */
  animating: boolean;
  /** radiusIn = animated ? max(0.1, baseRadius × 进度) : baseRadius */
  内: number;
  /** radiusOut = radiusIn × 2 */
  outerRadius: number;
  /** itemRadius = (radiusIn + radiusOut) × 0.5 */
  iconRadius: number;
  /** 背景贴图的缩放（anim），绕屏幕中心 */
  patternScale: number;
};

/** 打开后第几刻的状态（draw() 开头那几行）。刻 < 0 还没开，返回 null */
export const WheelState = (tick: number, fullInnerRadius: number = radialWheelConst.fullInnerRadius): WheelState | null => {
  if (tick < 0) return null;
  const progress = openProgress(tick);
  const animating = progress < 1;
  const innerRadius = animating ? Math.max(0.1, fullInnerRadius * progress) : fullInnerRadius;
  const outerRadius = innerRadius * radialWheelConst.outerInnerRatio;
  return { 进度: progress, animating, 内: innerRadius, outerRadius, iconRadius: (innerRadius + outerRadius) * 0.5, patternScale: animating ? progress : 1 };
};

/** drawItems() + ItemStackRadialMenuItem.draw()：图标左上角 = ((int)(x + r·cos), (int)(y + r·sin)) − 8。屏幕中心 x、y 是整数（width / 2 整数除法），
 *  屏幕坐标都是正的，(int) 就是向下取整，所以相对圆心是 floor(r·cos) − 8：图标落在 GUI 像素格上 */
export const iconTopLeft = (angle: number, radius: number, side: number = radialWheelConst.iconEdge): [number, number] => [Math.floor(radius * Math.cos(angle)) - side / 2, Math.floor(radius * Math.sin(angle)) - side / 2];
