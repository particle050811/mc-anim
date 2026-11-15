// 史蒂夫苦力怕核对的视图表（纯数据，段.ts 也读）：一帧一种姿势，画面里并排三个正交机位（正面、侧面、四分之三）；第 15 帧是第一人称的空手，
// 后面几帧：不传 mcLight 的默认材质、三渲二像素密度下 0.9375 倍和 1 倍的对比、开抗锯齿画布的已知毛病。
// 姿势的具体数在 画面.tsx 里按 库/角色/史蒂夫.tsx、库/生物/苦力怕.tsx 的函数算；这里只排帧和起名。
export type StevePosePreset = '站' | '走-迈开' | '走-半步' | '潜行' | '潜行走' | '看左上' | '看脚前' | '拿蛋糕' | '拿蛋糕走' | '潜行看左上拿蛋糕';
export type CreeperPosePreset = '站' | '走-追人' | '走-逃跑' | '转头左上' | '转头超限';

// 默认材质：不传 mcLight（三渲二平涂走的就是这条路）；抗锯齿：画布开多重采样
type RenderOptions = { defaultMaterial?: true; antialias?: true };
export type View =
  | ({ 名: string; subject: '史蒂夫'; poseKey: StevePosePreset } & RenderOptions)
  | ({ 名: string; subject: '苦力怕'; poseKey: CreeperPosePreset } & RenderOptions)
  | { 名: string; subject: '像素密度' }
  | { 名: string; subject: '第一人称' };

export const views: readonly View[] = [
  { 名: '史蒂夫 站（秒 0，两臂轻晃在最外）', subject: '史蒂夫', poseKey: '站' },
  { 名: '史蒂夫 走 4.3 米/秒，腿迈到最开', subject: '史蒂夫', poseKey: '走-迈开' },
  { 名: '史蒂夫 走，迈到一半', subject: '史蒂夫', poseKey: '走-半步' },
  { 名: '史蒂夫 潜行', subject: '史蒂夫', poseKey: '潜行' },
  { 名: '史蒂夫 潜行走 1.3 米/秒', subject: '史蒂夫', poseKey: '潜行走' },
  { 名: '史蒂夫 看左上方（超过 50°，身子跟着转）', subject: '史蒂夫', poseKey: '看左上' },
  { 名: '史蒂夫 看脚前 1 格的地面', subject: '史蒂夫', poseKey: '看脚前' },
  { 名: '史蒂夫 右手拿蛋糕（红点是算出来的物品中心）', subject: '史蒂夫', poseKey: '拿蛋糕' },
  { 名: '史蒂夫 拿蛋糕走', subject: '史蒂夫', poseKey: '拿蛋糕走' },
  { 名: '史蒂夫 潜行 + 看左上 + 拿蛋糕', subject: '史蒂夫', poseKey: '潜行看左上拿蛋糕' },
  { 名: '苦力怕 站', subject: '苦力怕', poseKey: '站' },
  { 名: '苦力怕 走（追人 2.7 米/秒），腿迈到最开', subject: '苦力怕', poseKey: '走-追人' },
  { 名: '苦力怕 走（逃 3.9 米/秒），迈到一半', subject: '苦力怕', poseKey: '走-逃跑' },
  { 名: '苦力怕 转头看左上方', subject: '苦力怕', poseKey: '转头左上' },
  { 名: '苦力怕 看身后（超过 75°，身子跟着转）', subject: '苦力怕', poseKey: '转头超限' },
  { 名: '第一人称 史蒂夫的空手', subject: '第一人称' },
  { 名: '史蒂夫 拿蛋糕，默认材质（不传 mcLight，环境光 π = 贴图原色）', subject: '史蒂夫', poseKey: '拿蛋糕', defaultMaterial: true },
  { 名: '苦力怕 站，默认材质（同上）', subject: '苦力怕', poseKey: '站', defaultMaterial: true },
  { 名: '像素密度：一个方块贴图像素 = 成片 6 像素（三渲二 N=6）', subject: '像素密度' },
  { 名: '已知限制：开抗锯齿的画布', subject: '史蒂夫', poseKey: '站', antialias: true },
];
