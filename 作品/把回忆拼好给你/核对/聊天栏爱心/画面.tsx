// 聊天栏和驯服爱心的核对画面：灰房间、她的位置放灰盒，机位和摆位同 1-一如既往 的占位（远景退到 6 格外）；爱心从灰盒脚底按她的碰撞箱放，聊天栏贴左下。
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { V3 } from '@engine/model/parts.tsx';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { ChatOverlay } from '@库/界面/聊天栏.tsx';
import { HeartParticles, tamingHearts } from '@库/特效/爱心粒子.tsx';
import { FirstPersonRig, eyePos } from '../../地点/机位.tsx';
import { chatScale, fov } from '../../场/1-隐世之境一楼/参数.ts';
import { tamedChatLines } from '../../场/1-隐世之境一楼/聊天.ts';
import { views } from './视图.ts';
import { useViewIndex } from '@engine/段/时间.tsx';

const liYingPos: V3 = [0, 0, 0];
const playerFeet: V3 = [0, -2.25, 0];
const lookAt: V3 = [0, 0, 0.7];
const farEye: V3 = [0, -6, 1.8];
const farLookAt: V3 = [0, 0, 1.4];
// 女仆的碰撞箱 0.6 × 1.5（TLM `EntityMaid.TYPE`，坐下不变）
const hearts = tamingHearts(liYingPos, 0.6, 1.5, 0, 1);
const chatLines = tamedChatLines(0);

const Box: React.FC<{ 中: V3; size: V3; 色: string }> = ({ 中: center, size, 色: color }) => (
  <mesh position={center}>
    <boxGeometry args={size} />
    <meshStandardMaterial color={color} />
  </mesh>
);

const picture: React.FC = () => {
  const v = views[useViewIndex()]!;
  return (
    <AbsoluteFill style={{ background: '#202226' }}>
      <ThreeCanvas width={v.width} height={v.height} gl={{ antialias: true }}>
        <color attach="background" args={['#202226']} />
        {v.farView ? <FirstPersonRig 眼={farEye} 看={farLookAt} fov={fov} /> : <FirstPersonRig 眼={eyePos(playerFeet)} 看={lookAt} fov={fov} />}
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.9} />
          <directionalLight position={[2, -3, 5]} intensity={1.6} />
          <Box 中={[0, 0, -0.05]} size={[9, 8, 0.1]} 色="#8a8a8a" />
          <Box 中={[0, 4.05, 2]} size={[9, 0.1, 4]} 色="#9c9c9c" />
          <Box 中={[-4.55, 0, 2]} size={[0.1, 8, 4]} 色="#7b7b7b" />
          <Box 中={[4.55, 0, 2]} size={[0.1, 8, 4]} 色="#7b7b7b" />
          <Box 中={[0, 0, 4.05]} size={[9, 8, 0.1]} 色="#6a6a6a" />
          <Box 中={[liYingPos[0], liYingPos[1], liYingPos[2] + 0.425]} size={[0.5, 0.5, 0.85]} 色="#b5b5b5" />
          {v.heartTick !== undefined && <HeartParticles spawns={hearts} 刻={v.heartTick} />}
        </group>
      </ThreeCanvas>
      {v.chatTick !== undefined && <ChatOverlay lines={chatLines} 刻={v.chatTick} s={chatScale} />}
      <div style={{ position: 'absolute', right: 20, top: 16, fontFamily: uiFontFamily, fontSize: 20, color: '#f2f2f2', textShadow: '0 1px 3px #000' }}>
        核对-聊天栏爱心 · {v.name}
      </div>
    </AbsoluteFill>
  );
};

export default picture;
