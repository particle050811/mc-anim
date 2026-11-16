// 魔法酒狐表情核对的画面：按视图表一帧画一个视图，左上角写视图名。地面、灯同 核对-魔法酒狐（看清贴图用，颜色是近似的）。
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { standPose } from '@库/角色/骨架.tsx';
import { Jiuhu } from '@库/角色/九胡.tsx';
import { MagicalWineFox, magicalWineFoxLookAt } from '@库/角色/魔法酒狐.tsx';
import { aspect } from '../../分镜/时间.ts';
import { FirstPersonRig } from '../../地点/机位.tsx';
import { views } from './视图.ts';
import { useViewIndex } from '@engine/段/时间.tsx';

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
  const v = views[useViewIndex()]!;
  const gaze = v.头 === '看玩家' ? magicalWineFoxLookAt(liYing, v.眼) : undefined;
  return (
    <AbsoluteFill style={{ background: '#5a5e66' }}>
      <ThreeCanvas width={aspect.width} height={aspect.height} gl={{ antialias: true }}>
        <color attach="background" args={['#5a5e66']} />
        <FirstPersonRig 眼={v.眼} 看={v.看} fov={v.fov} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.55 * Math.PI} />
          <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
          <Ground />
          {v.九胡 ? <Jiuhu pose={jiuHu} tail={(v.sec ?? 0) * 2} /> : <MagicalWineFox pose={liYing} 看={gaze} expression={v.expression} blink={v.blink} sec={v.sec} />}
        </group>
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
        <div>{v.name}</div>
        {v.九胡 && <div style={{ fontSize: 16 }}>九胡站着，尾巴相位 = 秒 × 2，和同一秒的魔法酒狐比</div>}
      </div>
    </AbsoluteFill>
  );
};

export default picture;
