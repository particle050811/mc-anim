// 聊天栏和驯服爱心的核对画面：灰房间、她的位置放灰盒，机位和摆位同 1-一如既往 的占位（远景退到 6 格外）；爱心从灰盒脚底按她的碰撞箱放，聊天栏贴左下。
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { V3 } from '@engine/model/parts.tsx';
import { uiFontFamily } from '@库/界面/基础.tsx';
import { ChatOverlay } from '@库/界面/聊天栏.tsx';
import { HeartParticles, tamingHearts } from '@库/特效/爱心粒子.tsx';
import { 第一人称机位, 眼位 } from '../../地点/机位.tsx';
import { 聊天缩放, 视角 } from '../../场/1-隐世之境一楼/参数.ts';
import { 驯服聊天行 } from '../../场/1-隐世之境一楼/聊天.ts';
import { 视图们 } from './视图.ts';

const 她: V3 = [0, 0, 0];
const 玩家脚: V3 = [0, -2.25, 0];
const 看: V3 = [0, 0, 0.7];
const 远眼: V3 = [0, -6, 1.8];
const 远看: V3 = [0, 0, 1.4];
// 女仆的碰撞箱 0.6 × 1.5（TLM `EntityMaid.TYPE`，坐下不变）
const 爱心 = tamingHearts(她, 0.6, 1.5, 0, 1);
const 聊天 = 驯服聊天行(0);

const 盒: React.FC<{ 中: V3; 尺: V3; 色: string }> = ({ 中, 尺, 色 }) => (
  <mesh position={中}>
    <boxGeometry args={尺} />
    <meshStandardMaterial color={色} />
  </mesh>
);

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  return (
    <AbsoluteFill style={{ background: '#202226' }}>
      <ThreeCanvas width={v.宽} height={v.高} gl={{ antialias: true }}>
        <color attach="background" args={['#202226']} />
        {v.远景 ? <第一人称机位 眼={远眼} 看={远看} 视角={视角} /> : <第一人称机位 眼={眼位(玩家脚)} 看={看} 视角={视角} />}
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.9} />
          <directionalLight position={[2, -3, 5]} intensity={1.6} />
          <盒 中={[0, 0, -0.05]} 尺={[9, 8, 0.1]} 色="#8a8a8a" />
          <盒 中={[0, 4.05, 2]} 尺={[9, 0.1, 4]} 色="#9c9c9c" />
          <盒 中={[-4.55, 0, 2]} 尺={[0.1, 8, 4]} 色="#7b7b7b" />
          <盒 中={[4.55, 0, 2]} 尺={[0.1, 8, 4]} 色="#7b7b7b" />
          <盒 中={[0, 0, 4.05]} 尺={[9, 8, 0.1]} 色="#6a6a6a" />
          <盒 中={[她[0], 她[1], 她[2] + 0.425]} 尺={[0.5, 0.5, 0.85]} 色="#b5b5b5" />
          {v.爱心刻 !== undefined && <HeartParticles spawns={爱心} 刻={v.爱心刻} />}
        </group>
      </ThreeCanvas>
      {v.聊天刻 !== undefined && <ChatOverlay lines={聊天} 刻={v.聊天刻} s={聊天缩放} />}
      <div style={{ position: 'absolute', right: 20, top: 16, fontFamily: uiFontFamily, fontSize: 20, color: '#f2f2f2', textShadow: '0 1px 3px #000' }}>
        核对-聊天栏爱心 · {v.名}
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
