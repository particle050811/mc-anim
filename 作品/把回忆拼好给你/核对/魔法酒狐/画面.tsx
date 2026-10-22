// 魔法酒狐核对的画面：按视图表一帧画一个视图，左上角写视图名和对应的游戏截图。
// 只放她、木地板和她身下那块地毯（颜色是近似的，房子另做）；灯是均匀的环境光加一盏正面偏上的平行光，看清贴图用；「暗」的视图只留很暗的环境光，看发光。
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { standPose } from '@库/角色/骨架.tsx';
import { MagicalWineFox, magicalWineFoxLookAt } from '@库/角色/魔法酒狐.tsx';
import { 第一人称机位 } from '../../地点/机位.tsx';
import { 视图们 } from './视图.ts';

// 她面朝南（yaw 180），脚底在地毯顶面；地毯 1/16 格厚，铺在木地板上
const 她 = { ...standPose([0, 0, 0]), yaw: 180 };
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
  const 看 = v.头 === '看玩家' ? magicalWineFoxLookAt(她, v.眼, v.姿势) : v.头;
  return (
    <AbsoluteFill style={{ background: '#5a5e66' }}>
      <ThreeCanvas width={v.宽} height={v.高} gl={{ antialias: true }}>
        <color attach="background" args={['#5a5e66']} />
        <第一人称机位 眼={v.眼} 看={v.看} 视角={v.视角} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={(v.暗 ? 0.06 : 0.55) * Math.PI} />
          {!v.暗 && <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />}
          {v.地面 && <地面 />}
          <MagicalWineFox pose={她} 姿势={v.姿势} 看={看} 秒={v.秒} 帽子={v.帽子} 发光={v.发光} />
        </group>
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
        <div>{v.名}</div>
        {看 && <div style={{ fontSize: 16 }}>看 [{看.map((x) => x.toFixed(1)).join(', ')}]</div>}
        {v.对照 && <div style={{ fontSize: 16 }}>对照游戏截图 {v.对照}</div>}
        {v.秒 !== undefined && <div style={{ fontSize: 16 }}>第 {v.秒} 秒</div>}
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
