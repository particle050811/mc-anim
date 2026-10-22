// 魔法酒狐表情核对的画面：按视图表一帧画一个视图，左上角写视图名。地面、灯同 核对-魔法酒狐（看清贴图用，颜色是近似的）。
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { standPose } from '@库/角色/骨架.tsx';
import { Jiuhu } from '@库/角色/九胡.tsx';
import { MagicalWineFox, magicalWineFoxLookAt } from '@库/角色/魔法酒狐.tsx';
import { 画幅 } from '../../分镜.ts';
import { 第一人称机位 } from '../../地点/机位.tsx';
import { 视图们 } from './视图.ts';

const 她 = { ...standPose([0, 0, 0]), yaw: 180 };
const 九胡 = { ...standPose([0, 0, 0]), yaw: 180 };
const 地毯厚 = 1 / 16;

const 地面: React.FC = () => (
  <>
    <mesh position={[0, 0, -地毯厚 - 0.05]}>
      <boxGeometry args={[9, 9, 0.1]} />
      <meshStandardMaterial color="#b8945f" />
    </mesh>
    <mesh position={[0, 0, -地毯厚 / 2]}>
      <boxGeometry args={[3, 3, 地毯厚]} />
      <meshStandardMaterial color="#b84a9e" />
    </mesh>
  </>
);

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  const 看 = v.头 === '看玩家' ? magicalWineFoxLookAt(她, v.眼) : undefined;
  return (
    <AbsoluteFill style={{ background: '#5a5e66' }}>
      <ThreeCanvas width={画幅.宽} height={画幅.高} gl={{ antialias: true }}>
        <color attach="background" args={['#5a5e66']} />
        <第一人称机位 眼={v.眼} 看={v.看} 视角={v.视角} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.55 * Math.PI} />
          <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
          <地面 />
          {v.九胡 ? <Jiuhu pose={九胡} tail={(v.秒 ?? 0) * 2} /> : <MagicalWineFox pose={她} 看={看} 表情={v.表情} 眨眼={v.眨眼} 秒={v.秒} />}
        </group>
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
        <div>{v.名}</div>
        {v.九胡 && <div style={{ fontSize: 16 }}>九胡站着，尾巴相位 = 秒 × 2，和同一秒的魔法酒狐比</div>}
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
