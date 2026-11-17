// 骨架的姿势数据（FigurePose）和站直的默认姿势：纯数据，不带 react、three。
// 编排、测试、纯模块要姿势就从这里引，不用把 骨架.tsx（画骨架的组件和 three 的矩阵）拖进闭包；骨架.tsx 原样转出，老代码照旧能从那里引。
// 关节角的含义见 骨架.tsx 文件头。

export type FigurePose = {
  loc: number[];
  pitch: number; // 整体前倾（负值 = 往前倾）
  squash: number; // 整体竖向压缩：下蹲、低姿态滑停（MC 的腿不能弯）
  headPitch: number; // 负值 = 低头
  headYaw: number;
  legR: number;
  legL: number;
  armR: number;
  armRRoll: number;
  armL: number;
  armLRoll: number;
  kneeR?: number;
  kneeL?: number;
  elbowR?: number;
  elbowL?: number; // 肘可以是负的：前臂往后折（取材动画换算出来偶尔会有）
  ground?: number; // 脚贴地的程度，默认 1；腾空填 0
  yaw?: number; // 整体转身，正 = 往左转
  twist?: number; // 胸相对髋的扭转，正 = 胸口转向左（右肩往前送）
  legRRoll?: number; // 腿的侧摆，正值把脚收向身体中线（和手臂的 roll 同一约定）；叉开腿站填负值
  legLRoll?: number;
  // 腿抬起以后再绕竖轴往外张多少（度，正 = 脚往外侧张，左右各给各的），转在抬腿、`roll` 之后（最外层），同原版 ModelPart 的 yRot。
  // 腿平伸往前时 `roll` 绕的是腿自己，张不开，骑马（原版 riding：两腿 xRot −81°、yRot ±18°）要靠这个。不给就是 0。
  legRYaw?: number;
  legLYaw?: number;
  // 手臂抬起以后再绕竖轴往左转多少（度，和 `yaw` 同号），转在抬臂、`roll` 之后（最外层），同原版 ModelPart 的 yRot。
  // 手臂平举时 `roll` 绕的是手臂自己，转不出左右，拉弓（原版 BOW_AND_ARROW 两臂往中间收）要靠这个。不给就是 0。
  armRYaw?: number;
  armLYaw?: number;
};

export const standPose = (loc: number[]): FigurePose => ({
  loc, pitch: 0, squash: 1, headPitch: 0, headYaw: 0, legR: 0, legL: 0, armR: 0, armRRoll: 0, armL: 0, armLRoll: 0,
});
