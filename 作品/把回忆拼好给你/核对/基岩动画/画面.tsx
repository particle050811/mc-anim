// 基岩动画核对的画面：左半手抄版、右半播放器版，各一张画布、同一个机位、同一个 秒，两只都站在原点，像素可以直接相减。
// 不放在同一张画布里左右排开：透视下两边看到的侧面不一样，法杖、尾巴这种在身后的东西会错开，看着像动作不同。
// 播放器版的尾巴：单帧拿不到前面帧积分出来的弹簧，变量表用稳态解填（尾巴稳态.ts），和手抄版同一个做法。
// 标了 控制器 的视图左右换成两种控制器（控制器示例.ts）。
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { standPose } from '@库/角色/骨架.tsx';
import { MagicalWineFox } from '@库/角色/魔法酒狐.tsx';
import { 画幅 } from '../../分镜.ts';
import { 第一人称机位 } from '../../地点/机位.tsx';
import { GeckoLib坐到站, 基岩坐到站, 控制器层们 } from './控制器示例.ts';
import { 尾巴稳态变量 } from './尾巴稳态.ts';
import { 视图们, type 视图 } from './视图.ts';
import { 魔法酒狐播放器版 } from './魔法酒狐播放器版.ts';

const 位置 = { ...standPose([0, 0, 0]), yaw: 180 };

const 半边: React.FC<{ v: 视图; 标题: string; children: React.ReactNode }> = ({ v, 标题, children }) => (
  <div style={{ position: 'relative', width: 画幅.宽 / 2, height: 画幅.高 }}>
    <ThreeCanvas width={画幅.宽 / 2} height={画幅.高} gl={{ antialias: true }}>
      <color attach="background" args={['#5a5e66']} />
      <第一人称机位 眼={v.眼} 看={v.看} 视角={v.视角} />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <ambientLight intensity={0.55 * Math.PI} />
        <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
        <mesh position={[0, 0, -0.05]}>
          <boxGeometry args={[9, 9, 0.1]} />
          <meshStandardMaterial color="#b8945f" />
        </mesh>
        {children}
      </group>
    </ThreeCanvas>
    <div style={{ position: 'absolute', left: 16, bottom: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 18, textShadow: '0 1px 3px #000' }}>{标题}</div>
  </div>
);

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  const 变量 = 尾巴稳态变量(魔法酒狐播放器版.动画文件!, v.秒);
  return (
    <AbsoluteFill style={{ background: '#5a5e66', flexDirection: 'row' }}>
      {v.控制器 ? (
        <>
          <半边 v={v} 标题="GeckoLib 控制器：sit → idle，过渡 10 刻">
            <魔法酒狐播放器版 pose={位置} 秒={v.秒} 环境={{ 变量 }} 层们={控制器层们(GeckoLib坐到站)} />
          </半边>
          <半边 v={v} 标题="基岩版控制器：sit → idle，blend_transition 0.5 秒">
            <魔法酒狐播放器版 pose={位置} 秒={v.秒} 环境={{ 变量 }} 层们={控制器层们(基岩坐到站)} />
          </半边>
        </>
      ) : (
        <>
          <半边 v={v} 标题="手抄版（库/角色/魔法酒狐.tsx）">
            <MagicalWineFox pose={位置} 秒={v.秒} />
          </半边>
          <半边 v={v} 标题="播放器版（定义生物 + 原版动画文件）">
            <魔法酒狐播放器版 pose={位置} 秒={v.秒} 环境={{ 变量 }} />
          </半边>
        </>
      )}
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
        <div>{v.名}</div>
        {v.说明 && <div style={{ fontSize: 16 }}>{v.说明}</div>}
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
