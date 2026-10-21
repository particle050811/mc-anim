// 6-1-1 进入森林：把模型库里的场景、角色、道具、特效按 编排.ts 组装成镜头。
// 两半都是游戏实机方块。暮色森林这半的灯光、雾、地面照 6-1-2（镜头/6-1-2/娜迦参考模型.tsx），庭院网格摆在新世界的娜迦庭院上。
// 海岛这半在主世界-116 的基地小岛北岸（模型/场景/基地小岛.tsx）：编排用海岛本地坐标，人、水池、特效、天空、云放进 `islandOffset` 的组，镜头加 `islandOffset`；
// 灯不放进平移的组（天光按灯的位置定“上”，放进去就歪了）。天、灯、云是主世界统一的那套（lib/主世界光照.tsx）。
// 海岛这半单独一块画布：开对数深度（不开远处海面、浅滩会闪）和屏幕 AO，雾和最远距离同 6-2-1～6-2-4 的窗外。
import { ThreeCanvas } from '@remotion/three';
import { canvasDpr } from '../../../../engine/core/渲染级别.ts';
import { useThree } from '@react-three/fiber';
import React, { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { rad } from '../../../../engine/anim/anim.ts';
import { Box, rng, type V3 } from '../../../../engine/model/parts.tsx';
import { Jiuhu } from '../../../../world/角色/九胡.tsx';
import { LiYing } from '../../../../world/角色/李樱.tsx';
import type { FigurePose } from '../../../../world/角色/骨架.tsx';
import { WornSheath } from '../../../../world/物品/拔刀剑.tsx';
import { Diamond } from '../../../../world/物品/钻石.tsx';
import { PORTAL_ISLAND, PortalIsland } from '../../../../world/地点/传送门海岛.tsx';
import { BaseIslandTerrain, islandToWorld, islandOffset } from '../../../../world/地点/基地小岛.tsx';
import { FlightFog } from '../../../../world/地点/飞行镜头.tsx';
import { PostFx } from '../../../../engine/post/后期.tsx';
import { ScreenAo } from '../../../../engine/voxel/屏幕AO.tsx';
import { overworldWindowView } from '../../../../engine/voxel/主世界地形.ts';
import { SKY, SkyDome, SunLight, OverworldWaterSky, twilightFogColor } from '../../../../engine/light/天空.tsx';
import { PortalParticles } from '../../../../world/特效/传送粒子.tsx';
import { LightningBolt } from '../../../../world/特效/闪电.tsx';
import { courtyardToWorld, courtyardLightDir, courtyardLightGain } from '../6-1-2/娜迦参考模型.tsx';
import { LandmarkPlacement, TwilightTerrain } from '../../../../world/地点/暮色新世界.tsx';
import { shadowFarFor, TwilightClouds, TwilightSunLight, useTwilightFog } from '../../../../engine/light/暮色光照.tsx';
import { VIEW_FOG } from '../../../../engine/voxel/视距.ts';
import { OverworldSky, SUN_OW } from '../../../../world/地点/主世界光照.tsx';
import * as choreo from './编排.ts';
import { EnterForestSound, lineCues } from './声音.tsx';
import { mouthAt, type Mouth } from '../../../../world/角色/口型.ts';

export const ENTER_FOREST_FRAMES = choreo.END - 1;

// 台词口型：台词轨的帧是 Remotion 帧，编排帧 = Remotion 帧 + 1
const liYingMouth = (choreoFrame: number) => mouthAt(lineCues, '李樱', choreoFrame - 1);

// 场景坐标 (x, y, z) Z 朝上 → three.js (x, z, -y) Y 朝上
const toThree = ([x, y, z]: number[]) => new THREE.Vector3(x, z, -y);

const Rig: React.FC<{ f: number }> = ({ f: frame }) => {
  const { camera, size, gl } = useThree();
  gl.toneMapping = THREE.NeutralToneMapping;
  gl.toneMappingExposure = 1.0;
  const c0 = choreo.camera(frame);
  const tf = choreo.world(frame) === 'tf';
  const worldCam = tf ? { ...c0, pos: courtyardToWorld(c0.pos), tgt: courtyardToWorld(c0.tgt) } : { ...c0, pos: islandToWorld(c0.pos), tgt: islandToWorld(c0.tgt) };
  const cam = camera as THREE.PerspectiveCamera;
  // 焦距按 36mm 横向画幅换算，three.js 用竖向视角
  cam.fov = (2 * Math.atan(18 / worldCam.lens / (size.width / size.height)) * 180) / Math.PI;
  cam.near = 0.05;
  cam.far = tf ? 2000 : 60000;
  cam.position.copy(toThree(worldCam.pos));
  cam.up.set(0, 1, 0);
  cam.lookAt(toThree(worldCam.tgt));
  cam.updateProjectionMatrix();
  return null;
};

// 李樱腰上一直挂着刀（和 6-1-2 一样的刀鞘、一样的挂法）
const LiYingSheathed: React.FC<{ pose: FigurePose; 嘴?: Mouth }> = ({ pose, 嘴: mouth }) => (
  <LiYing
    pose={pose}
    嘴={mouth}
    hipL={<WornSheath />}
  />
);

const WaterGlow: React.FC<{ alpha: number }> = ({ alpha }) => {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        uniforms: { a: { value: 0 }, col: { value: new THREE.Color('#9feaff') } },
        // 海岛画布开了对数深度，要接上 logdepthbuf 那几段，不然深度对不上、整片被池水挡掉
        vertexShader:
          '#include <common>\n#include <logdepthbuf_pars_vertex>\nvarying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);\n#include <logdepthbuf_vertex>\n}',
        fragmentShader:
          '#include <logdepthbuf_pars_fragment>\nuniform float a; uniform vec3 col; varying vec2 vUv; void main(){\n#include <logdepthbuf_fragment>\nvec2 d = abs(vUv - 0.5) * 2.0; float r = max(d.x, d.y); float k = (1.0 - smoothstep(0.55, 1.0, r)) * (0.55 + 0.45 * (1.0 - length(vUv - 0.5) * 1.4)); gl_FragColor = vec4(col * k * a, 1.0); }',
      }),
    [],
  );
  mat.uniforms.a.value = alpha;
  if (alpha <= 0) return null;
  const [x0, y0, x1, y1] = PORTAL_ISLAND.poolRect;
  return (
    <mesh material={mat} position={[(x0 + x1) / 2, (y0 + y1) / 2, PORTAL_ISLAND.pool[2] + 0.02]} renderOrder={5}>
      <planeGeometry args={[x1 - x0, y1 - y0]} />
    </mesh>
  );
};

const Splash: React.FC<{ sec: number; at: V3 }> = ({ sec, at }) => {
  if (sec < 0 || sec > 0.6) return null;
  const rand = rng(17);
  return (
    <>
      {Array.from({ length: 12 }, (_, k) => {
        const angle = rand() * Math.PI * 2;
        const speed = 0.6 + rand() * 1.2;
        const up = 2.2 + rand() * 2.2;
        const z = at[2] + up * sec - 8 * sec * sec;
        if (z < at[2] - 0.02) return null;
        const size = 0.06 + rand() * 0.05;
        return <Box key={k} p={[at[0] + Math.cos(angle) * speed * sec, at[1] + Math.sin(angle) * speed * sec, z]} s={[size, size, size]} c="#cfefff" basic shadow={false} />;
      })}
    </>
  );
};

const Island: React.FC<{ f: number }> = ({ f: frame }) => (
  <>
    <OverworldSky />
    <SunLight sun={SUN_OW} center={islandToWorld(choreo.islandShadowCenter)} extent={30} />
    {/* 环境光照主世界的配比压过（原来 0.9，×0.34 同 lib/光照配比.ts 的 overworldMix），闪电那一下照旧 */}
    <ambientLight intensity={0.3 + 0.7 * choreo.flash(frame)} />
    <BaseIslandTerrain camPos={islandToWorld(choreo.camera(frame).pos)} />
    <group position={islandOffset}>
      <IslandScene f={frame} />
    </group>
  </>
);

const IslandScene: React.FC<{ f: number }> = ({ f: frame }) => {
  const ly = choreo.liying(frame);
  const jh = choreo.jiuhu(frame);
  const diamond = choreo.diamond(frame);
  const fl = choreo.flash(frame);
  return (
    <>
      <SkyDome sun={SUN_OW} />
      <PortalIsland active={choreo.portalActive(frame)} poolOnly />
      {ly.visible && <LiYingSheathed pose={ly.pose} 嘴={liYingMouth(frame)} />}
      {jh.visible && <Jiuhu pose={jh.pose} tail={jh.tail} />}
      {/* 钻石正面朝 -Y（镜头在南边），稍微仰一点让上沿的斜面受光；飞的时候绕竖轴打转 */}
      {diamond && diamond.scale > 0 && <Diamond position={diamond.loc} size={0.32 * diamond.scale} rotation={[rad(8), 0, rad(-12 + diamond.spin)]} />}
      <Splash sec={choreo.splashSec(frame)} at={[PORTAL_ISLAND.pool[0] + 0.1, PORTAL_ISLAND.pool[1] + 0.1, PORTAL_ISLAND.pool[2]]} />
      <WaterGlow alpha={choreo.waterGlow(frame)} />
      <LightningBolt position={choreo.BOLT_AT} seed={choreo.BOLT_SEED} flash={fl} />
      <PortalParticles emitters={choreo.islandEmitters()} sec={choreo.particleSec(frame)} size={2.2} />
    </>
  );
};

const nagaLandmarks: ['娜迦庭院'] = ['娜迦庭院'];
const TwilightForest: React.FC<{ f: number; t: number }> = ({ f: frame, t }) => {
  useTwilightFog(courtyardLightDir);
  const ly = choreo.liying(frame);
  const jh = choreo.jiuhu(frame);
  return (
    <>
      {/* 主光同 6-1-2 的庭院（70°/28°、0.75 倍，2026-10-13 起），不放进平移的组（平行光的目标在世界原点） */}
      <TwilightSunLight shadowFar={shadowFarFor(VIEW_FOG.far)} lightDir={courtyardLightDir} gain={courtyardLightGain} />
      <TwilightTerrain camPos={courtyardToWorld(choreo.camera(frame).pos)} landmarks={nagaLandmarks} t={t} shadowLightDir={courtyardLightDir} />
      <TwilightClouds sun={courtyardLightDir} />
      <LandmarkPlacement 名="娜迦庭院">
        {/* 暮色森林没有太阳：深蓝天、星星、地平线一圈薄荷绿，主光、天光、云都和 6-1-2 一样 */}
        <SkyDome twilight sun={courtyardLightDir} />
        {ly.visible && <LiYingSheathed pose={ly.pose} 嘴={liYingMouth(frame)} />}
        {jh.visible && <Jiuhu pose={jh.pose} tail={jh.tail} bend={jh.bend} gait={jh.gait} run={jh.run} />}
        <PortalParticles emitters={choreo.tfEmitters()} sec={choreo.particleSec(frame)} size={2.2} />
      </LandmarkPlacement>
    </>
  );
};

export const EnterForest: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const choreoFrame = frame + 1;
  const island = choreo.world(choreoFrame) === 'island';
  // 不超采样（用户 10-07 比过 2K 下超采样和不超采样，选不超采样，见 lib/渲染级别.ts）。
  // 声音见 声音.tsx，挂在两块画布外面，换画布时不打断。
  const soundTrack = <EnterForestSound />;
  if (island)
    return (
      <>
        {soundTrack}
        {/* 两块画布的 key 不同：gl 的设置只在建画布时生效，同一个位置只换 props 会沿用旧画布，暮色那一半就跟着开了对数深度 */}
        <ThreeCanvas key="海岛" width={width} height={height} shadows="percentage" gl={{ antialias: true, logarithmicDepthBuffer: true }} dpr={canvasDpr(1)}>
          <color attach="background" args={[SKY.horizon]} />
          <FlightFog visibility={overworldWindowView.visibility} />
          <OverworldWaterSky />
          <Rig f={choreoFrame} />
          <ScreenAo />
          <group rotation={[-Math.PI / 2, 0, 0]}>
            <Island f={choreoFrame} />
          </group>
        </ThreeCanvas>
      </>
    );
  return (
    <>
      {soundTrack}
      <ThreeCanvas key="暮色" width={width} height={height} shadows="percentage" gl={{ antialias: true }} dpr={canvasDpr(1)}>
        <color attach="background" args={[twilightFogColor]} />
        {/* 雾只给暮色森林（和 6-1-2 一样挂在场景上，满视距、只在视距边上淡出，lib/视距.ts） */}
        <fog attach="fog" args={[twilightFogColor, VIEW_FOG.near, VIEW_FOG.far]} />
        <Rig f={choreoFrame} />
        <PostFx drawsScene={false} />
        <ScreenAo />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <TwilightForest f={choreoFrame} t={frame / fps} />
        </group>
      </ThreeCanvas>
    </>
  );
};
