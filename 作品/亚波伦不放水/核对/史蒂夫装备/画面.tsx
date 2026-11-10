// 史蒂夫装备核对的画面：灰底、一块地面、一盏环境光加一盏平行光（同 核对/娘化亚波伦），史蒂夫站在原点面朝南。视图表在 视图.ts。
// 画布不开抗锯齿：史蒂夫的贴图没做 UV 内收，开了轮廓会冒出相邻格子的颜色（见 库/角色/史蒂夫.tsx）。
// 机位：坐标照场景约定（Z 朝上），进 three 换成 Y 朝上，场景内容放在 rotation [−π/2, 0, 0] 的 group 里。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { 场景到three } from '@engine/core/three换算.ts';
import { ItemDisplay, ItemSprite } from '@engine/model/物品贴图.tsx';
import { png } from '@engine/model/贴图.ts';
import { use视图下标 } from '@engine/段/时间.tsx';
import { GlintItem } from '@库/物品/附魔物品.tsx';
import { stevePose } from '@库/角色/史蒂夫.tsx';
import { 装备史蒂夫 } from '../../角色/史蒂夫装备.tsx';
import { 断曜流光, 断曜流光图标, 断曜流光显示 } from '../../物品/断曜流光.tsx';
import { 画幅, 视图们, type 视图 } from './视图.ts';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import 头盔图标 from 'asset:贴图/物品/神灵金头盔';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import 胸甲图标 from 'asset:贴图/物品/神灵金胸甲';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import 护腿图标 from 'asset:贴图/物品/神灵金护腿';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import 靴子图标 from 'asset:贴图/物品/神灵金靴子';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import 环图标 from 'asset:贴图/物品/晋升之环';

const 机位: React.FC<{ v: 视图 }> = ({ v }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = v.视角;
  cam.near = 0.05;
  cam.far = 256;
  cam.position.copy(场景到three(v.眼));
  cam.up.set(0, 1, 0);
  cam.lookAt(场景到three(v.看));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

// 物品空间 Y 朝上、正面 +Z，场景 Z 朝上：绕 X 转 +90 度立起来，正面朝南对着镜头
const 立着: React.FC<{ x: number; z?: number; 倍?: number; children: React.ReactNode }> = ({ x, z = 1.5, 倍 = 1, children }) => (
  <group position={[x, 0, z]} rotation={[Math.PI / 2, 0, 0]} scale={倍}>
    {children}
  </group>
);

const 图标排: React.FC<{ 秒: number }> = ({ 秒 }) => (
  <>
    {[头盔图标, 胸甲图标, 护腿图标, 靴子图标].map((图, i) => (
      <React.Fragment key={i}>
        <立着 x={(i - 2.5) * 1.25} z={2.2}>
          <GlintItem layers={[{ tex: png(图) }]} sec={秒} />
        </立着>
        <立着 x={(i - 2.5) * 1.25} z={0.9}>
          <ItemSprite layers={[{ tex: png(图) }]} />
        </立着>
      </React.Fragment>
    ))}
    <立着 x={1.5 * 1.25} z={0.9}>
      <断曜流光图标 />
    </立着>
    <立着 x={2.5 * 1.25} z={0.9}>
      <ItemSprite layers={[{ tex: png(环图标) }]} />
    </立着>
  </>
);

const 画面: React.FC = () => {
  const v = 视图们[use视图下标()]!;
  const 拿剑 = v.装备?.剑 !== false;
  const 底 = v.暗底 ? '#0c0c10' : '#5a5e66';
  return (
    <AbsoluteFill style={{ background: 底 }}>
      <ThreeCanvas width={画幅.宽} height={画幅.高} gl={{ antialias: false }}>
        <color attach="background" args={[底]} />
        <机位 v={v} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.55 * Math.PI} />
          <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
          <mesh position={[0, 0, -0.05]}>
            <boxGeometry args={[12, 12, 0.1]} />
            <meshStandardMaterial color={v.暗底 ? '#15151a' : '#8a8f98'} />
          </mesh>
          {v.只物品 === '图标' ? (
            <图标排 秒={v.秒} />
          ) : v.只物品 === '剑模型' ? (
            <立着 x={0} 倍={2}>
              <ItemDisplay t={断曜流光显示.gui}>
                <断曜流光 />
              </ItemDisplay>
            </立着>
          ) : (
            <装备史蒂夫 pose={stevePose([0, 0, 0], 180, { sec: v.秒, holdR: 拿剑 })} 秒={v.秒} 装备={v.装备} />
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
