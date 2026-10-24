// 第 6、7 句的她和你：她（魔法酒狐，新动作版）第 6 句抱膝坐在坑边，第 7 句站起来两手举向天放法术；你（原版玩家模型）坐在她东边（演绎：腿照原版骑乘姿势）。
// 帽子照她平时的样子戴着（用户 10-24「戴帽子多余」删的是摘帽当伞那一段）。谁在哪、看哪在 编排.ts。
import type React from 'react';
import { 贴图像素对齐 } from '@engine/三渲二/对齐.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { MagicalWineFoxEx } from '@库/角色/魔法酒狐新动作组件.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import type { 你态, 她态 } from './编排.ts';
import * as 参 from './参数.ts';

export const 她: React.FC<{ 态: 她态; 秒: number }> = ({ 态, 秒 }) => (
  <贴图像素对齐 锚={态.loc}>
    <MagicalWineFoxEx
      pose={{ ...standPose([...态.loc]), yaw: 态.yaw }}
      姿势={态.姿势}
      表情={态.表情}
      看={态.看}
      秒={秒}
      眨眼="auto"
      骨骼={态.施法 ? { RightArm: { rot: 参.施法臂.右 }, LeftArm: { rot: 参.施法臂.左 } } : undefined}
    />
  </贴图像素对齐>
);

export const 你: React.FC<{ 态: 你态; 秒: number }> = ({ 态, 秒 }) => {
  const p = stevePose(态.loc, 态.yaw, { headYaw: 态.头偏, headPitch: 态.头仰, sec: 秒 });
  const { 腿, 腿张, 臂 } = 参.你坐;
  return (
    <贴图像素对齐 锚={态.loc}>
      <Steve pose={{ ...p, legR: 腿, legL: 腿, legRYaw: 腿张, legLYaw: 腿张, armR: p.armR + 臂, armL: p.armL + 臂 }} />
    </贴图像素对齐>
  );
};
