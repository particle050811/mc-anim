// 魔法酒狐表情核对的画面：按视图表一帧画一个视图，左上角写视图名。地面、灯同 核对-魔法酒狐（看清贴图用，颜色是近似的）。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { standPose } from '@库/角色/骨架.tsx';
import { Jiuhu } from '@库/角色/九胡.tsx';
import { MagicalWineFox, magicalWineFoxLookAt } from '@库/角色/魔法酒狐.tsx';
import { aspect } from '../../分镜/时间.ts';
import { FirstPersonRig } from '../../地点/机位.tsx';
import { views } from './视图.ts';
import { CheckCanvas, CheckLabel, checkGrey, NeutralLights, useCheckView, ZUp } from '@engine/段/核对画面.tsx';

const liYing = { ...standPose([0, 0, 0]), yaw: 180 };
const jiuHu = { ...standPose([0, 0, 0]), yaw: 180 };
const carpetThickness = 1 / 16;

const Ground: React.FC = () => (
  <>
    <mesh position={[0, 0, -carpetThickness - 0.05]}>
      <boxGeometry args={[9, 9, 0.1]} />
      <meshStandardMaterial color="#b8945f" />
    </mesh>
    <mesh position={[0, 0, -carpetThickness / 2]}>
      <boxGeometry args={[3, 3, carpetThickness]} />
      <meshStandardMaterial color="#b84a9e" />
    </mesh>
  </>
);

const picture: React.FC = () => {
  const v = useCheckView(views);
  const gaze = v.头 === '看玩家' ? magicalWineFoxLookAt(liYing, v.眼) : undefined;
  return (
    <AbsoluteFill style={{ background: checkGrey.background }}>
      <CheckCanvas width={aspect.width} height={aspect.height} background={checkGrey.background}>
        <FirstPersonRig 眼={v.眼} 看={v.看} fov={v.fov} />
        <ZUp>
          <NeutralLights />
          <Ground />
          {v.九胡 ? <Jiuhu pose={jiuHu} tail={(v.sec ?? 0) * 2} /> : <MagicalWineFox pose={liYing} 看={gaze} expression={v.expression} blink={v.blink} sec={v.sec} />}
        </ZUp>
      </CheckCanvas>
      <CheckLabel title={v.name}>
        {v.九胡 && <div style={{ fontSize: 16 }}>九胡站着，尾巴相位 = 秒 × 2，和同一秒的魔法酒狐比</div>}
      </CheckLabel>
    </AbsoluteFill>
  );
};

export default picture;
