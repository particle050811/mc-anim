// 娘化亚波伦核对的画面：灰底、一块地面、一盏环境光加一盏平行光，角色站在原点面朝南。视图表在 视图.ts。
// 机位：坐标照场景约定（Z 朝上），进 three 换成 Y 朝上，场景内容放在 rotation [−π/2, 0, 0] 的 group 里。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { 场景到three } from '@engine/core/three换算.ts';
import { use视图下标 } from '@engine/段/时间.tsx';
import { 娘化亚波伦, 定表演, 悬停, 斜举, 站立, type 亚波伦表演 } from '../../角色/娘化亚波伦.tsx';
import { ItemDisplay } from '@engine/model/物品贴图.tsx';
import { 下界魔杖, 下界魔杖显示 } from '../../物品/下界魔杖.tsx';
import { 画幅, 视图们, type 视图 } from './视图.ts';

// 受击：attacked 是整身的动作，顶掉 idle 播一遍（YSM 里受伤时主动画怎么让位没核实，这里当成整段换）
const 受击 = 定表演({ 主: (秒) => [{ 名: 'attacked', 秒 }] });
// 前飞：悬停 1 秒后水平速度跳到 20（YSM wiki：飞行时 ground_speed 是 20），看头发的弹簧
const 前飞 = 定表演({ 主: () => [{ 名: 'fly' }], 环境: (秒) => ({ 查询: { ground_speed: 秒 >= 1 ? 20 : 0 } }), 持杖姿势: 斜举.飞 });
const 表演们: Record<视图['表演'], 亚波伦表演> = { 站立, 悬停, 受击, 前飞 };

const 机位: React.FC<{ v: 视图 }> = ({ v }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = v.视角;
  cam.near = 0.05;
  cam.far = 256;
  const 抬 = v.离地 ?? 0;
  cam.position.copy(场景到three([v.眼[0], v.眼[1], v.眼[2] + 抬]));
  cam.up.set(0, 1, 0);
  cam.lookAt(场景到three([v.看[0], v.看[1], v.看[2] + 抬]));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

const 画面: React.FC = () => {
  const v = 视图们[use视图下标()]!;
  return (
    <AbsoluteFill style={{ background: '#5a5e66' }}>
      <ThreeCanvas width={画幅.宽} height={画幅.高} gl={{ antialias: true }}>
        <color attach="background" args={['#5a5e66']} />
        <机位 v={v} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.55 * Math.PI} />
          <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
          <mesh position={[0, 0, -0.05]}>
            <boxGeometry args={[12, 12, 0.1]} />
            <meshStandardMaterial color="#8a8f98" />
          </mesh>
          {v.只杖 ? (
            // 物品空间 Y 朝上，场景 Z 朝上：绕 X 转 +90 度立起来
            <group position={[0, 0, 1.5]} rotation={[Math.PI / 2, 0, 0]} scale={2}>
              <ItemDisplay t={下界魔杖显示.gui}>
                <下界魔杖 />
              </ItemDisplay>
            </group>
          ) : (
            <娘化亚波伦 pose={{ loc: [0, 0, v.离地 ?? 0], yaw: 180 }} 秒={v.秒} 表演={表演们[v.表演]} 变体={v.变体} 持杖={v.持杖} />
          )}
        </group>
      </ThreeCanvas>
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 22, lineHeight: 1.4, textShadow: '0 1px 3px #000' }}>
        <div>{v.名}</div>
        {v.说明 && <div style={{ fontSize: 16 }}>{v.说明}</div>}
      </div>
    </AbsoluteFill>
  );
};

export default 画面;
