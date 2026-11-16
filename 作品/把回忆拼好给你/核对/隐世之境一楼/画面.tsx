// 隐世之境一楼核对的画面：按视图表画网格，盖上游戏截图或灯位框。
// 平光：方块材质的自发光关掉，只留 π 的环境光（three 的漫反射是 颜色 × 光 ÷ π），画出来就是 贴图 × 顶点色（染色和 AO；朝向明暗不在顶点色里）。
// 成片灯的视图换成 地点 的 一楼灯光，和 一楼机位-游戏截图 比亮度、色温。
// 待迁移（私有资产）：对照用的游戏截图私有（核对段，不进成片），公开构建缺了怎么降级还没定
import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { useSelfLight } from '@engine/light/光照配比.ts';
import { standPose } from '@库/角色/骨架.tsx';
import { MagicalWineFox, magicalWineFoxLookAt } from '@库/角色/魔法酒狐.tsx';
import { uiFontFamily } from '@库/界面/基础.tsx';
import shot from 'asset:截图/隐世之境/一楼机位';
import { FirstPersonRig } from '../../地点/机位.tsx';
import { firstFloor, FirstFloorLighting, hallLamps, HiddenWorldFloor, type LampPos } from '../../地点/隐世之境一楼.tsx';
import { views } from './视图.ts';
import { useViewIndex } from '@engine/段/时间.tsx';

const liftTopBox = [[-1, -27, 5.97, 22, 1, 10]];
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const frameColor = (l: LampPos) => (l.kind === 'lantern' ? '#ffd23f' : l.lit ? '#ff7a1a' : '#9a9a9a');

/** 一格方块的线框（位 = 方块底面中心） */
const BlockFrame: React.FC<{ 位: V3; 色: string }> = ({ 位: pos, 色: color }) => (
  <lineSegments position={[pos[0], pos[1], pos[2] + 0.5]} renderOrder={10}>
    <edgesGeometry args={[unitBox]} />
    <lineBasicMaterial color={color} depthTest={false} toneMapped={false} />
  </lineSegments>
);

// 她面朝南（yaw 180），脚底在地毯顶面
const maidPose = { ...standPose(firstFloor.maid), yaw: 180 };
const StandFigure: React.FC<{ kind: '灰盒' | '酒狐'; 眼: V3 }> = ({ kind: figureKind, 眼: eye }) =>
  figureKind === '灰盒' ? (
    <mesh position={[firstFloor.maid[0], firstFloor.maid[1], firstFloor.maid[2] + 0.425]} castShadow receiveShadow>
      <boxGeometry args={[0.5, 0.5, 0.85]} />
      <meshStandardMaterial color="#b5b5b5" />
    </mesh>
  ) : (
    <MagicalWineFox pose={maidPose} 看={magicalWineFoxLookAt(maidPose, eye)} />
  );

// 排在 第一人称机位 后面，盖掉它设的色调映射；和它一样订阅整个 useThree，它重渲时这里也跟着重渲、仍在它后面
const KeepTone: React.FC = () => {
  useThree().gl.toneMapping = THREE.NoToneMapping;
  return null;
};

const FlatLight: React.FC = () => {
  useSelfLight(0);
  return <ambientLight intensity={Math.PI} />;
};

const picture: React.FC = () => {
  const v = views[useViewIndex()]!;
  const size = { width: v.width, height: v.height };
  const lanternCount = hallLamps.filter((l) => l.kind === 'lantern').length;
  const candleCount = hallLamps.length - lanternCount;
  return (
    <AbsoluteFill style={{ background: '#1b1d22' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, ...size }}>
        {v.screenshot !== 1 && (
          <ThreeCanvas {...size} gl={{ antialias: true }}>
            <color attach="background" args={['#9fc4ff']} />
            <FirstPersonRig 眼={v.cameraRig.眼} 看={v.cameraRig.看} fov={v.cameraRig.fov} />
            {v.keepTone && <KeepTone />}
            <group rotation={[-Math.PI / 2, 0, 0]}>
              {v.filmLamp ? <FirstFloorLighting /> : <FlatLight />}
              <HiddenWorldFloor hide={v.liftTop ? liftTopBox : undefined} />
              {v.figure && <StandFigure kind={v.figure} 眼={v.cameraRig.眼} />}
              {v.showLamps && hallLamps.map((l, i) => <BlockFrame key={i} 位={l.位} 色={frameColor(l)} />)}
              {v.showLamps && <BlockFrame 位={firstFloor.maid} 色="#ff4fd8" />}
            </group>
          </ThreeCanvas>
        )}
        {v.screenshot ? <Img src={shot} style={{ position: 'absolute', left: 0, top: 0, ...size, opacity: v.screenshot }} /> : null}
        <div style={{ position: 'absolute', left: 16, top: 12, fontFamily: uiFontFamily, fontSize: 22, color: '#ffffff', textShadow: '0 1px 3px #000' }}>
          核对-隐世之境一楼 · {v.name}
          {v.showLamps ? `（灯笼 ${lanternCount} 黄、蜡烛 ${candleCount} 橙/灰没点、女仆 粉）` : ''}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default picture;
