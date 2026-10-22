// 隐世之境一楼核对的画面：按视图表画网格，盖上游戏截图或灯位框。
// 平光：方块材质的自发光关掉，只留 π 的环境光（three 的漫反射是 颜色 × 光 ÷ π），画出来就是 贴图 × 顶点色（染色和 AO；朝向明暗不在顶点色里）。
// 成片灯的视图换成 地点 的 一楼灯光，和 一楼机位-游戏截图 比亮度、色温。
import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { useSelfLight } from '@engine/light/光照配比.ts';
import { standPose } from '@库/角色/骨架.tsx';
import { MagicalWineFox, magicalWineFoxLookAt } from '@库/角色/魔法酒狐.tsx';
import { uiFontFamily } from '@库/界面/基础.tsx';
import shot from 'asset:截图/隐世之境/一楼机位';
import { 第一人称机位 } from '../../地点/机位.tsx';
import { 一楼, 一楼灯光, 主厅灯, 隐世之境一楼, type 灯位 } from '../../地点/隐世之境一楼.tsx';
import { 视图们 } from './视图.ts';

const 掀顶盒 = [[-1, -27, 5.97, 22, 1, 10]];
const 单位盒 = new THREE.BoxGeometry(1, 1, 1);
const 框色 = (l: 灯位) => (l.种 === '灯笼' ? '#ffd23f' : l.点着 ? '#ff7a1a' : '#9a9a9a');

/** 一格方块的线框（位 = 方块底面中心） */
const 方块框: React.FC<{ 位: V3; 色: string }> = ({ 位, 色 }) => (
  <lineSegments position={[位[0], 位[1], 位[2] + 0.5]} renderOrder={10}>
    <edgesGeometry args={[单位盒]} />
    <lineBasicMaterial color={色} depthTest={false} toneMapped={false} />
  </lineSegments>
);

// 她面朝南（yaw 180），脚底在地毯顶面
const 女仆姿势 = { ...standPose(一楼.女仆), yaw: 180 };
const 站位: React.FC<{ 种: '灰盒' | '酒狐'; 眼: V3 }> = ({ 种, 眼 }) =>
  种 === '灰盒' ? (
    <mesh position={[一楼.女仆[0], 一楼.女仆[1], 一楼.女仆[2] + 0.425]} castShadow receiveShadow>
      <boxGeometry args={[0.5, 0.5, 0.85]} />
      <meshStandardMaterial color="#b5b5b5" />
    </mesh>
  ) : (
    <MagicalWineFox pose={女仆姿势} 看={magicalWineFoxLookAt(女仆姿势, 眼)} />
  );

// 排在 第一人称机位 后面，盖掉它设的色调映射；和它一样订阅整个 useThree，它重渲时这里也跟着重渲、仍在它后面
const 不压色调: React.FC = () => {
  useThree().gl.toneMapping = THREE.NoToneMapping;
  return null;
};

const 平光: React.FC = () => {
  useSelfLight(0);
  return <ambientLight intensity={Math.PI} />;
};

const 画面: React.FC = () => {
  const v = 视图们[useCurrentFrame()]!;
  const 尺寸 = { width: v.宽, height: v.高 };
  const 灯笼 = 主厅灯.filter((l) => l.种 === '灯笼').length;
  const 蜡烛 = 主厅灯.length - 灯笼;
  return (
    <AbsoluteFill style={{ background: '#1b1d22' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, ...尺寸 }}>
        {v.截图 !== 1 && (
          <ThreeCanvas {...尺寸} gl={{ antialias: true }}>
            <color attach="background" args={['#9fc4ff']} />
            <第一人称机位 眼={v.机位.眼} 看={v.机位.看} 视角={v.机位.视角} />
            {v.不压色调 && <不压色调 />}
            <group rotation={[-Math.PI / 2, 0, 0]}>
              {v.成片灯 ? <一楼灯光 /> : <平光 />}
              <隐世之境一楼 hide={v.掀顶 ? 掀顶盒 : undefined} />
              {v.站位 && <站位 种={v.站位} 眼={v.机位.眼} />}
              {v.灯位 && 主厅灯.map((l, i) => <方块框 key={i} 位={l.位} 色={框色(l)} />)}
              {v.灯位 && <方块框 位={一楼.女仆} 色="#ff4fd8" />}
            </group>
          </ThreeCanvas>
        )}
        {v.截图 ? <Img src={shot} style={{ position: 'absolute', left: 0, top: 0, ...尺寸, opacity: v.截图 }} /> : null}
        <div style={{ position: 'absolute', left: 16, top: 12, fontFamily: uiFontFamily, fontSize: 22, color: '#ffffff', textShadow: '0 1px 3px #000' }}>
          核对-隐世之境一楼 · {v.名}
          {v.灯位 ? `（灯笼 ${灯笼} 黄、蜡烛 ${蜡烛} 橙/灰没点、女仆 粉）` : ''}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
