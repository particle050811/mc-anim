// 娘化亚波伦核对的画面：灰底、一块地面、一盏环境光加一盏平行光，角色站在原点面朝南。视图表在 视图.ts。
// 机位：坐标照场景约定（Z 朝上），进 three 换成 Y 朝上，场景内容放在 rotation [−π/2, 0, 0] 的 group 里。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { sceneToThree } from '@engine/core/three换算.ts';
import { useViewIndex } from '@engine/段/时间.tsx';
import { rightHandCenter, GirlYaBoLun, defineAct, hover, raisedPose, stand, type YaBoLunAct } from '../../角色/娘化亚波伦.tsx';
import { ItemDisplay } from '@engine/model/物品贴图.tsx';
import { NetherWand, netherWandDisplay } from '../../物品/下界魔杖.tsx';
import { aspect, views, type View } from './视图.ts';

// 受击：attacked 是整身的动作，顶掉 idle 播一遍（YSM 里受伤时主动画怎么让位没核实，这里当成整段换）
const hurt = defineAct({ 主: (sec) => [{ 名: 'attacked', 秒: sec }] });
// 前飞：悬停 1 秒后水平速度跳到 20（YSM wiki：飞行时 ground_speed 是 20），看头发的弹簧
const flyForward = defineAct({ 主: () => [{ 名: 'fly' }], 环境: (sec) => ({ query: { ground_speed: sec >= 1 ? 20 : 0 } }), wandHoldPose: raisedPose.飞 });
const performances: Record<View['act'], YaBoLunAct> = { 站立: stand, 悬停: hover, 受击: hurt, 前飞: flyForward };

const CameraRig: React.FC<{ v: View }> = ({ v }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = v.fov;
  cam.near = 0.05;
  cam.far = 256;
  const lift = v.lift ?? 0;
  // 手部特写：手心和画角色用同一份 pose、表演、秒 算（已经带离地）
  const rightPalm = v.lookRightHand && rightHandCenter({ pose: { loc: [0, 0, lift], yaw: 180 }, 秒: v.秒, act: performances[v.act] });
  const eye = rightPalm ? [rightPalm[0] + v.lookRightHand![0], rightPalm[1] + v.lookRightHand![1], rightPalm[2] + v.lookRightHand![2]] : [v.眼[0], v.眼[1], v.眼[2] + lift];
  const lookAt = rightPalm ?? [v.看[0], v.看[1], v.看[2] + lift];
  cam.position.copy(sceneToThree([eye[0]!, eye[1]!, eye[2]!]));
  cam.up.set(0, 1, 0);
  cam.lookAt(sceneToThree([lookAt[0]!, lookAt[1]!, lookAt[2]!]));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

const picture: React.FC = () => {
  const v = views[useViewIndex()]!;
  return (
    <AbsoluteFill style={{ background: '#5a5e66' }}>
      <ThreeCanvas width={aspect.宽} height={aspect.高} gl={{ antialias: true }}>
        <color attach="background" args={['#5a5e66']} />
        <CameraRig v={v} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.55 * Math.PI} />
          <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
          <mesh position={[0, 0, -0.05]}>
            <boxGeometry args={[12, 12, 0.1]} />
            <meshStandardMaterial color="#8a8f98" />
          </mesh>
          {v.onlyWand ? (
            // 物品空间 Y 朝上，场景 Z 朝上：绕 X 转 +90 度立起来
            <group position={[0, 0, 1.5]} rotation={[Math.PI / 2, 0, 0]} scale={2}>
              <ItemDisplay t={netherWandDisplay.gui}>
                <NetherWand />
              </ItemDisplay>
            </group>
          ) : (
            <GirlYaBoLun pose={{ loc: [0, 0, v.lift ?? 0], yaw: 180 }} 秒={v.秒} act={performances[v.act]} variant={v.variant} holdWand={v.holdWand} />
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

export default picture;
