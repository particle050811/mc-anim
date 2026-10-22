// 飞行镜头共用：机位、主世界跟着镜头走的天空和日光、公里尺度的雾。
// 机位 { pos, tgt, lens, roll }：pos / tgt 是场景坐标（Z 朝上），lens 按 36mm 横向画幅换算。
// 飞行镜头不要横滚（用户 10-01 定），各镜头不填 `roll`，留着只是接口兼容。扫帚转弯的内倾见 lib/飞行路径.ts 的 `bankAngle`。
import { useThree } from '@react-three/fiber';
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { SunLight } from 'three/examples/jsm/lights/SunLight.js';
import { CascadedShadow, quarterOctaveCeil } from '@engine/light/级联阴影.ts';
import { rad } from '@engine/anim/anim.ts';
import { SKY, SkyDome } from '@engine/light/天空.tsx';
import { overworldMix } from '@engine/light/光照配比.ts';
import { OverworldSky, SUN_OW } from './主世界光照.tsx';
import { 渲染输入 } from '@engine/core/渲染设置.ts';

export type CamPose = { pos: number[]; tgt: number[]; lens: number; roll?: number };

const toThree = ([x, y, z]: number[]) => new THREE.Vector3(x, z, -y);

export const FlightRig: React.FC<{ c: CamPose; near?: number; far?: number }> = ({ c: camPose, near = 0.05, far = 150000 }) => {
  const { camera, size, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const cam = camera as THREE.PerspectiveCamera;
  cam.fov = (2 * Math.atan(18 / camPose.lens / (size.width / size.height)) * 180) / Math.PI;
  cam.near = near;
  cam.far = far;
  cam.position.copy(toThree(camPose.pos));
  cam.up.set(0, 1, 0);
  cam.lookAt(toThree(camPose.tgt));
  if (camPose.roll) cam.rotateZ(-rad(camPose.roll));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

// 主世界日光投影：照暮色主光（lib/暮色光照.tsx）的做法，three 的 `SunLight` + 三级级联软阴影（lib/级联阴影.ts）。
// 远端取能见度的 1.5 倍、不超过 3 公里，按四分之一个八度取整（级联大小不每帧变，影子边不游动），最后 40% 淡掉；切分在 max(300, 2 × 离地) 米。
// 体素地形要投影得在 `VoxelWorld` 上给同一个 `shadowLightDir`（见 lib/体素/材质.ts），画布要开 shadows。
// 对比：--props='{"overworldShadow":false}' 换回不投影的日光
export const overworldShadowOn = (渲染输入() as { overworldShadow?: boolean }).overworldShadow !== false;
export const overworldShadowFar = (visibility: number) => quarterOctaveCeil(Math.min(visibility * 1.5, 3000));
export const OverworldSunLight: React.FC<{ sun?: [number, number, number]; shadowFar: number; aboveGround: number; intensity?: number }> = ({ sun = SUN_OW, shadowFar: shadowFar, aboveGround: heightAgl, intensity: intensity = overworldMix.直射 }) => {
  const light = useMemo(() => {
    const sunLight = new SunLight(SKY.sunLight, intensity);
    const sh = new CascadedShadow();
    sh.mapSize.set(4096, 4096);
    sh.bias = 0;
    sh.normalBias = 0.02;
    sunLight.shadow = sh;
    sunLight.castShadow = true;
    return sunLight;
  }, []);
  useEffect(() => () => light.dispose(), [light]);
  const sunDir = new THREE.Vector3(...sun).normalize();
  light.position.set(sunDir.x, sunDir.y, sunDir.z);
  light.intensity = intensity;
  const sh = light.shadow as CascadedShadow;
  sh.camera.far = shadowFar;
  sh.splitDist = Math.max(300, 2 * heightAgl);
  return <primitive object={light} />;
};

// 主世界的天和灯（lib/主世界光照.tsx）：穹顶跟着镜头走（穹顶半径只有 480），Photon 的天、雾、云（`photon` 给 false 就不开：钻到地下时），灯的配比 `overworldMix`。
// 日光默认不投影（公里尺度的阴影贴图盖不住），要投影的镜头传 `shadow`（换成 `OverworldSunLight`；`shadowFar` = 投影远端，`aboveGround` = 镜头离地高，米）
export const FlightSky: React.FC<{ camPos: number[]; sun?: [number, number, number]; shadow?: { shadowFar: number; aboveGround: number }; photon?: boolean }> = ({
  camPos: camPos,
  sun = SUN_OW,
  shadow,
  photon = true,
}) => {
  const light = useMemo(() => new THREE.DirectionalLight(SKY.sunLight, overworldMix.直射), []);
  const sunOffset = new THREE.Vector3(...sun).normalize().multiplyScalar(1000);
  light.position.set(camPos[0] + sunOffset.x, camPos[1] + sunOffset.y, camPos[2] + sunOffset.z);
  light.target.position.set(camPos[0], camPos[1], camPos[2]);
  light.target.updateMatrixWorld();
  return (
    <>
      {photon && <OverworldSky />}
      <group position={camPos as [number, number, number]}>
        <SkyDome sun={sun} />
      </group>
      {shadow && overworldShadowOn ? (
        <OverworldSunLight sun={sun} shadowFar={shadow.shadowFar} aboveGround={shadow.aboveGround} />
      ) : (
        <>
          <primitive object={light} />
          <primitive object={light.target} />
        </>
      )}
      <hemisphereLight args={[SKY.skyLight, SKY.groundLight, overworldMix.天光]} position={[0, 0, 1]} />
      <ambientLight intensity={overworldMix.环境光} />
    </>
  );
};

// 公里尺度的雾：指数平方雾，能见度 = 雾浓到一半的距离（米）
export const FlightFog: React.FC<{ visibility: number; color?: string }> = ({ visibility, color: color = SKY.fog }) => (
  <fogExp2 attach="fog" args={[color, Math.sqrt(Math.LN2) / visibility]} />
);
