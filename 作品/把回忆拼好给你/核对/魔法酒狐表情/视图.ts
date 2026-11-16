// 魔法酒狐表情核对的视图表（纯数据，段.ts 也读）：一帧一个视图。坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格），
// 原点是她脚底，她照隐世之境那只女仆面朝南（yaw 180）坐在地毯顶面上；机位、灯同 核对-魔法酒狐。
// 秒：给她的 秒（尾巴、自动眨眼按它取样）。九胡：这一帧不画她，换成站着的九胡，尾巴相位 = 秒 × 2（应力转动里常用的 帧/12），和她的尾巴比摆得自不自然。
import type { V3 } from '@engine/model/parts.tsx';
import { magicalWineFoxExpressions, type MagicalWineFoxExpression } from '@库/角色/魔法酒狐动作.ts';

export type View = {
  name: string;
  眼: V3;
  看: V3; // 机位对准的点
  fov: number; // 竖直视角（度）
  expression?: MagicalWineFoxExpression;
  blink?: number | 'auto';
  sec?: number;
  头?: '看玩家'; // 头转过来对准机位
  九胡?: boolean;
};

// 脸部特写：机位和眼睛一样高，正对着脸
const closeup = { 眼: [0, -1.3, 0.7] as V3, 看: [0.03, 0, 0.66] as V3, fov: 20 };
// 第一人称推镜推到底：玩家站在她南边 2 格、眼高 1.62，视角收到 24°，她抬头看玩家（验证片结尾的构图）
const pushToEnd = { 眼: [0, -2, 1.62] as V3, 看: [0.03, 0, 0.7] as V3, fov: 24, 头: '看玩家' as const };
// 尾巴：从身后偏西、高一点看（背后法杖斜到东边地上，从西边看不挡尾巴）；九胡站着，尾巴高些，机位跟着抬
const fromBehind = { 眼: [-1.6, 2.6, 1.7] as V3, 看: [0, 0.15, 0.4] as V3, fov: 28, expression: '无' as const };
const jiuHuFromBehind = { 眼: [-1.6, 2.6, 1.9] as V3, 看: [0, 0.15, 0.7] as V3, fov: 34, 九胡: true };

export const views: readonly View[] = [
  ...magicalWineFoxExpressions.map((expression) => ({ name: `表情-${expression}`, ...closeup, expression })),
  ...magicalWineFoxExpressions.map((expression) => ({ name: `推到底-${expression}`, ...pushToEnd, expression })),
  // 眨眼：游戏曲线开头那一下，0 睁、0.0833 闭、0.25 睁；0.0417 闭一半看眉毛跟着下来；0.125 是曲线冲过头（夹成全闭）的地方
  ...[0, 0.0417, 0.0833, 0.125, 0.25].map((sec) => ({ name: `眨眼-${sec}秒`, ...closeup, expression: '无' as const, blink: 'auto' as const, sec: sec })),
  { name: '难过-眨眼闭一半', ...closeup, expression: '难过', blink: 0.5 }, // 难过的眉毛转角和眨眼的眉毛位置要同时生效
  ...[0, 0.5, 1, 1.5, 2, 2.5, 3].map((sec) => ({ name: `尾巴-${sec}秒`, ...fromBehind, blink: 0, sec: sec })),
  ...[0, 0.5, 1, 1.5, 2, 2.5, 3].map((sec) => ({ name: `九胡尾巴-${sec}秒`, ...jiuHuFromBehind, sec: sec })),
];
