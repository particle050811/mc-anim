// 晋升之环的画：原版贴片（照游戏）和本片自制的三个候选（真几何的精工器物和光，见 晋升之环几何.ts、精工材质.ts），以及戴到头后的摆法
// （史蒂夫戴的那层在 角色/戴环史蒂夫.tsx）。游戏里的画法和出处在 晋升之环形.ts 的文件头；用户 11-10 定史蒂夫戴它、娘化亚波伦头后的眼形大光环也换成它，候选还没挑。
// 原版贴片：贴图 贴图/特效/晋升之环/halo（启示录 textures/entity/player/halo.png，16×16），两面都画、两面看都不镜像（照 ModelPart 方盒南北两面的 UV），
//   加色混合、不受光、透明度 < 0.1 丢掉（energy_swirl）。加色的东西在亮底上会发白，游戏里就这样。
// 候选：金、宝石受光并反射自带的环境；亮线、宝石的亮处用拔刀剑的泛光往外溢一小圈（只作用在这些网格上，不是全场景泛光）；
//   环后面垫一圈很淡的加色柔光（本片加的，游戏里没有）。
// 环坐标：环面在 XY 平面，+Z 朝正面的观众，+Y 朝上，单位是戴的人的模型像素。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { png } from '@engine/model/贴图.ts';
import { entityTexture } from '@engine/model/贴图方盒.tsx';
import { KATANA_BLOOM_LAYER, useKatanaBloom } from '@库/物品/拔刀剑泛光.tsx';
import haloPng from 'asset:贴图/特效/晋升之环/halo';
import { RingBody } from './晋升之环几何.ts';
import { yaBoLunHeadAxis, vanillaRing, vanillaSpinAngle, wearSpec, type CandidateName, type RingVariant } from './晋升之环形.ts';
import { haloMaterial, bloomClasses, fineMaterials } from './精工材质.ts';

const radPerDeg = Math.PI / 180;

// ── 原版贴片 ──
const patchMaterial = () =>
  new THREE.MeshBasicMaterial({ map: entityTexture(png(haloPng)), blending: THREE.AdditiveBlending, alphaTest: 0.1, transparent: true, side: THREE.FrontSide, toneMapped: false });
let patchMaterialCache: THREE.MeshBasicMaterial | undefined;
const patchGeometry = new THREE.PlaneGeometry(vanillaRing.sideLength, vanillaRing.sideLength);

/** 原版那张片（环坐标，环心在原点），按秒自转 */
export const AscensionHaloPatch: React.FC<{ 秒: number }> = ({ 秒: sec }) => {
  const material = (patchMaterialCache ??= patchMaterial());
  return (
    <group rotation={[0, 0, vanillaSpinAngle(sec) * radPerDeg]}>
      <mesh geometry={patchGeometry} material={material} />
      <mesh geometry={patchGeometry} material={material} rotation={[0, Math.PI, 0]} />
    </group>
  );
};

// ── 候选 ──
const haloCache = new Map<CandidateName, { geometry: THREE.PlaneGeometry; material: THREE.ShaderMaterial }>();
const getHalo = (variant: CandidateName) => {
  let cached = haloCache.get(variant);
  if (!cached) {
    const ringBody = RingBody(variant);
    haloCache.set(variant, (cached = { geometry: new THREE.PlaneGeometry(ringBody.haloHalfSize * 2, ringBody.haloHalfSize * 2), material: haloMaterial(ringBody.haloBands) }));
  }
  return cached;
};
const setBloomLayer = (bloom: boolean) => (m: THREE.Mesh | null) => m?.layers[bloom ? 'enable' : 'disable'](KATANA_BLOOM_LAYER);

/** 一个候选（环坐标，环心在原点），各层按秒转；晕 默认画 */
export const AscensionHaloCandidate: React.FC<{ variant: CandidateName; 秒: number; withHalo?: boolean }> = ({ variant, 秒: sec, withHalo: showHalo = true }) => {
  useKatanaBloom();
  const ringBody = RingBody(variant);
  const materials = fineMaterials();
  const haloPad = useMemo(() => getHalo(variant), [variant]);
  return (
    <>
      {ringBody.layers.map((ringLayer, i) => (
        <group key={i} matrix={ringLayer.poseAt(sec, new THREE.Matrix4())} matrixAutoUpdate={false}>
          {ringLayer.parts.map(({ 类: matKind, geo }) => (
            <mesh key={matKind} ref={setBloomLayer(bloomClasses.has(matKind))} geometry={geo} material={materials[matKind]} renderOrder={matKind === '芒' ? 2 : 0} />
          ))}
        </group>
      ))}
      {/* 柔光垫在环面上（加色、不写深度）；先画环再画它 */}
      {showHalo && <mesh geometry={haloPad.geometry} material={haloPad.material} renderOrder={1} />}
    </>
  );
};

/** 原版贴片或一个候选（环坐标，环心在原点） */
export const AscensionHalo: React.FC<{ variant: RingVariant; 秒: number; withHalo?: boolean }> = ({ variant, 秒: sec, withHalo }) => (variant === '原版' ? <AscensionHaloPatch 秒={sec} /> : <AscensionHaloCandidate variant={variant} 秒={sec} withHalo={withHalo} />);

/** 戴在头后（头坐标：原点 = 头的转轴，+Y 朝上，+Z 朝脸的前方，单位是那个人的模型像素）：位置、前倾、大小照 晋升之环形.ts 的 戴法 */
export const HeadRing: React.FC<{ variant: RingVariant; 秒: number; wearer: '史蒂夫' | '亚波伦' }> = ({ variant, 秒: sec, wearer }) => {
  const placement = wearSpec[wearer][variant];
  return (
    <group position={[placement.位[0], placement.位[1], placement.位[2]]} rotation={[placement.tiltDeg * radPerDeg, 0, 0]} scale={placement.scale}>
      <AscensionHalo variant={variant} 秒={sec} />
    </group>
  );
};

/** 挂到娘化亚波伦的 aaabody 骨骼上（不跟头转，原因见 戴法 的注释）：先挪到站姿时 Head 的转轴，骨骼坐标正面朝 −Z，绕 Y 转半圈换成头坐标 */
export const yaBoLunHeadRing = (variant: RingVariant, sec: number): React.ReactNode => (
  <group position={[yaBoLunHeadAxis[0], yaBoLunHeadAxis[1], yaBoLunHeadAxis[2]]} rotation={[0, Math.PI, 0]}>
    <HeadRing variant={variant} 秒={sec} wearer="亚波伦" />
  </group>
);
