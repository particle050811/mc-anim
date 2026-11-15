// 第 6、7 句的她和你：她（魔法酒狐，新动作版）第 6 句抱膝坐在坑边，第 7 句站起来两手举向天放法术；你（原版玩家模型）坐在她东边（演绎：腿照原版骑乘姿势）。
// 帽子照她平时的样子戴着（用户 10-24「戴帽子多余」删的是摘帽当伞那一段）。谁在哪、看哪在 编排.ts。
import type React from 'react';
import { TexturePixelAlign } from '@engine/三渲二/对齐.tsx';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { MagicalWineFoxEx } from '@库/角色/魔法酒狐新动作组件.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import type { YouState, LiYingState } from './编排.ts';
import * as params from './参数.ts';

export const LiYing: React.FC<{ liYingState: LiYingState; 秒: number }> = ({ liYingState, 秒: sec }) => (
  <TexturePixelAlign 锚={liYingState.loc}>
    <MagicalWineFoxEx
      pose={{ ...standPose([...liYingState.loc]), yaw: liYingState.yaw }}
      stancePose={liYingState.stancePose}
      expression={liYingState.expression}
      看={liYingState.看}
      秒={sec}
      blink="auto"
      skeleton={liYingState.skeleton ?? (liYingState.casting ? { RightArm: { rot: params.castArm.rightArm }, LeftArm: { rot: params.castArm.leftArm } } : undefined)}
    />
  </TexturePixelAlign>
);

export const You: React.FC<{ youState: YouState; 秒: number }> = ({ youState, 秒: sec }) => {
  const p = stevePose(youState.loc, youState.yaw, { headYaw: youState.headYaw, headPitch: youState.headPitch, sec: sec });
  const { legPitch, legSpread, armPitch } = params.youSit;
  return (
    <TexturePixelAlign 锚={youState.loc}>
      <Steve pose={{ ...p, legR: legPitch, legL: legPitch, legRYaw: legSpread, legLYaw: legSpread, armR: p.armR + armPitch, armL: p.armL + armPitch }} />
    </TexturePixelAlign>
  );
};
