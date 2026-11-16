// 魔法酒狐核对的画面：按视图表一帧画一个视图，左上角写视图名和对应的游戏截图。
// 只放她、木地板和她身下那块地毯（颜色是近似的，房子另做）；灯是均匀的环境光加一盏正面偏上的平行光，看清贴图用；「暗」的视图只留很暗的环境光，看发光。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { standPose } from '@库/角色/骨架.tsx';
import { MagicalWineFox, magicalWineFoxLookAt } from '@库/角色/魔法酒狐.tsx';
import { FirstPersonRig } from '../../地点/机位.tsx';
import { views } from './视图.ts';
import { CheckCanvas, CheckLabel, checkGrey, useCheckView, ZUp } from '@engine/段/核对画面.tsx';

// 她面朝南（yaw 180），脚底在地毯顶面；地毯 1/16 格厚，铺在木地板上
const liYing = { ...standPose([0, 0, 0]), yaw: 180 };
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
  const gaze = v.头 === '看玩家' ? magicalWineFoxLookAt(liYing, v.眼, v.stancePose) : v.头;
  return (
    <AbsoluteFill style={{ background: checkGrey.background }}>
      <CheckCanvas width={v.width} height={v.height} background={checkGrey.background}>
        <FirstPersonRig 眼={v.眼} 看={v.看} fov={v.fov} />
        <ZUp>
          <ambientLight intensity={(v.暗 ? 0.06 : 0.55) * Math.PI} />
          {!v.暗 && <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />}
          {v.ground && <Ground />}
          <MagicalWineFox pose={liYing} stancePose={v.stancePose} 看={gaze} sec={v.sec} hat={v.hat} glow={v.glow} />
        </ZUp>
      </CheckCanvas>
      <CheckLabel title={v.name}>
        {gaze && <div style={{ fontSize: 16 }}>看 [{gaze.map((x) => x.toFixed(1)).join(', ')}]</div>}
        {v.gameShot && <div style={{ fontSize: 16 }}>对照游戏截图 {v.gameShot}</div>}
        {v.sec !== undefined && <div style={{ fontSize: 16 }}>第 {v.sec} 秒</div>}
      </CheckLabel>
    </AbsoluteFill>
  );
};

export default picture;
