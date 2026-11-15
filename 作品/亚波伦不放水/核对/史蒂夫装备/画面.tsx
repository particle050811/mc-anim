// 史蒂夫装备核对的画面：灰底、一块地面、一盏环境光加一盏平行光（同 核对/娘化亚波伦），史蒂夫站在原点面朝南。视图表在 视图.ts。
// 画布不开抗锯齿：史蒂夫的贴图没做 UV 内收，开了轮廓会冒出相邻格子的颜色（见 库/角色/史蒂夫.tsx）。
// 机位：坐标照场景约定（Z 朝上），进 three 换成 Y 朝上，场景内容放在 rotation [−π/2, 0, 0] 的 group 里。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import * as THREE from 'three';
import { sceneToThree } from '@engine/core/three换算.ts';
import { ItemDisplay, ItemSprite } from '@engine/model/物品贴图.tsx';
import { png } from '@engine/model/贴图.ts';
import { useViewIndex } from '@engine/段/时间.tsx';
import { GlintItem } from '@库/物品/附魔物品.tsx';
import { stevePose } from '@库/角色/史蒂夫.tsx';
import { EquippedSteve } from '../../角色/史蒂夫装备.tsx';
import { Valettein, ValetteinIcon, valetteinDisplay } from '../../物品/断曜流光.tsx';
import { defaultAppearance } from '../../物品/装备外观.ts';
import { aspect, views, type View } from './视图.ts';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import divineHelmetPng from 'asset:贴图/物品/神灵金头盔';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import divineChestplatePng from 'asset:贴图/物品/神灵金胸甲';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import divineLeggingsPng from 'asset:贴图/物品/神灵金护腿';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import divineBootsPng from 'asset:贴图/物品/神灵金靴子';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import ascensionRingPng from 'asset:贴图/物品/晋升之环';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import oldDivineHelmetPng from 'asset:贴图/物品/神灵金头盔.旧版';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import oldDivineChestplatePng from 'asset:贴图/物品/神灵金胸甲.旧版';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import oldDivineLeggingsPng from 'asset:贴图/物品/神灵金护腿.旧版';
// 待迁移（私有资产）：启示录保留所有权益，只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import oldDivineBootsPng from 'asset:贴图/物品/神灵金靴子.旧版';

const CameraRig: React.FC<{ v: View }> = ({ v }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = v.fov;
  cam.near = 0.05;
  cam.far = 256;
  cam.position.copy(sceneToThree(v.眼));
  cam.up.set(0, 1, 0);
  cam.lookAt(sceneToThree(v.看));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

// 物品空间 Y 朝上、正面 +Z，场景 Z 朝上：绕 X 转 +90 度立起来，正面朝南对着镜头
const Upright: React.FC<{ x: number; z?: number; scale?: number; children: React.ReactNode }> = ({ x, z = 1.5, scale = 1, children }) => (
  <group position={[x, 0, z]} rotation={[Math.PI / 2, 0, 0]} scale={scale}>
    {children}
  </group>
);

const newArmorIcons = [divineHelmetPng, divineChestplatePng, divineLeggingsPng, divineBootsPng];
const oldArmorIcons = [oldDivineHelmetPng, oldDivineChestplatePng, oldDivineLeggingsPng, oldDivineBootsPng];

// 上排旧版带附魔光效，中排旧版原图，下排新版原图
const IconRow: React.FC<{ 秒: number }> = ({ 秒: sec }) => (
  <>
    {oldArmorIcons.map((iconImgUri, i) => (
      <React.Fragment key={i}>
        <Upright x={(i - 2.5) * 1.25} z={3.0}>
          <GlintItem layers={[{ tex: png(iconImgUri) }]} sec={sec} />
        </Upright>
        <Upright x={(i - 2.5) * 1.25} z={1.8}>
          <ItemSprite layers={[{ tex: png(iconImgUri) }]} />
        </Upright>
        <Upright x={(i - 2.5) * 1.25} z={0.6}>
          <ItemSprite layers={[{ tex: png(newArmorIcons[i]!) }]} />
        </Upright>
      </React.Fragment>
    ))}
    <Upright x={1.5 * 1.25} z={3.0}>
      <ValetteinIcon appearance="旧版" glintSec={sec} />
    </Upright>
    <Upright x={1.5 * 1.25} z={1.8}>
      <ValetteinIcon appearance="旧版" />
    </Upright>
    <Upright x={1.5 * 1.25} z={0.6}>
      <ValetteinIcon appearance="新版" />
    </Upright>
    <Upright x={2.5 * 1.25} z={1.8}>
      <ItemSprite layers={[{ tex: png(ascensionRingPng) }]} />
    </Upright>
  </>
);

const picture: React.FC = () => {
  const v = views[useViewIndex()]!;
  const holdSword = v.equipment?.剑 !== false;
  const appearance = v.equipment?.appearance ?? defaultAppearance;
  const bottomBackground = v.darkBg ? '#0c0c10' : '#5a5e66';
  return (
    <AbsoluteFill style={{ background: bottomBackground }}>
      <ThreeCanvas width={aspect.宽} height={aspect.高} gl={{ antialias: false }}>
        <color attach="background" args={[bottomBackground]} />
        <CameraRig v={v} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <ambientLight intensity={0.55 * Math.PI} />
          <directionalLight position={[1.5, -4, 4]} intensity={0.6 * Math.PI} />
          <mesh position={[0, 0, -0.05]}>
            <boxGeometry args={[12, 12, 0.1]} />
            <meshStandardMaterial color={v.darkBg ? '#15151a' : '#8a8f98'} />
          </mesh>
          {v.onlyItem === '图标' ? (
            <IconRow 秒={v.秒} />
          ) : v.onlyItem === '剑模型' ? (
            <Upright x={0} scale={2}>
              <ItemDisplay t={valetteinDisplay[appearance].gui}>
                <Valettein appearance={appearance} glintSec={v.秒} />
              </ItemDisplay>
            </Upright>
          ) : (
            <EquippedSteve pose={stevePose([0, 0, 0], 180, { sec: v.秒, holdR: holdSword })} 秒={v.秒} equipment={v.equipment} />
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
