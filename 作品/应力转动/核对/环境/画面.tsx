// 环境核对的画面：一块草地上的小木屋、一棵橡树、李樱，四周一大片草色地面铺到天边（看雾和天边），机位朝西南偏西、略仰（看得到天、云和主世界的太阳）。
// 偶数帧（0、2、4）用现有组件，下一帧用 <环境> 预设，其余一字不差（不叠字，好逐像素比）；画布按视图换（key），每帧新的 WebGL 上下文，共用 uniform 卸下时各自复位。
// 仰望的视图同一个镜头位置、抬到仰角约 80°（午夜月亮在天顶）。
import { ThreeCanvas } from '@remotion/three';
import React, { useEffect, useMemo } from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { canvasDpr } from '@engine/core/渲染级别.ts';
import { useViewIndex } from '@engine/段/时间.tsx';
import { TwilightLighting, twilightFogNear } from '@engine/light/暮色光照.tsx';
import { Environment } from '@engine/light/环境组件.tsx';
import overworldStyle from '@engine/light/画法/主世界.tsx';
import twilightStyle from '@engine/light/画法/暮色.tsx';
import { twilightEnv } from '@engine/light/环境预设.ts';
import { assemblyMeshes, type PlacedBlock } from '@engine/model/方块拼搭.tsx';
import { ScreenAo } from '@engine/voxel/屏幕AO.tsx';
import { VIEW_DISTANCE } from '@engine/voxel/视距.ts';
import { LiYing } from '@库/角色/李樱.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import { FlightFog, FlightRig, FlightSky, overworldShadowFar, type CamPose } from '../../地点/飞行镜头.tsx';
import { overworldEnv } from '../../地点/主世界环境.ts';
import envTrack from './环境.ts';
import { viewFps, views, visibility } from './视图.ts';

const cameraRig: CamPose = { pos: [22, 10, 3.5], tgt: [0, 2, 5], lens: 24 };
const lookUpRig: CamPose = { pos: [22, 10, 3.5], tgt: [20.6, 9.5, 11.9], lens: 24 };
const twilightFogFar = VIEW_DISTANCE;

const sceneBlocks = (() => {
  const out: PlacedBlock[] = [];
  const placeBlock = (blockState: string, i: number, j: number, k: number) => out.push({ state: blockState, 位: [i, j, k] });
  for (let i = -24; i < 24; i++) for (let j = -24; j < 24; j++) placeBlock('minecraft:grass_block', i, j, -1);
  // 小木屋：x 0～6、y 0～5，四角原木，圆石墙基，木板墙，南墙开门、东墙开窗，木板平顶
  for (let i = 0; i <= 6; i++)
    for (let j = 0; j <= 5; j++) {
      const isEdge = i === 0 || i === 6 || j === 0 || j === 5;
      const corner = (i === 0 || i === 6) && (j === 0 || j === 5);
      for (let k = 0; k <= 3; k++) {
        if (!isEdge) continue;
        if (corner) placeBlock('minecraft:oak_log', i, j, k);
        else if (k === 0) placeBlock('minecraft:cobblestone', i, j, k);
        else if (j === 0 && i === 3 && k <= 2) continue;
        else if (i === 6 && (j === 2 || j === 3) && k === 2) placeBlock('minecraft:glass', i, j, k);
        else placeBlock('minecraft:oak_planks', i, j, k);
      }
      placeBlock('minecraft:oak_planks', i, j, 4);
    }
  for (let k = 0; k <= 4; k++) placeBlock('minecraft:oak_log', -8, 7, k);
  for (let i = -10; i <= -6; i++)
    for (let j = 5; j <= 9; j++)
      for (let k = 3; k <= 6; k++) {
        const r = k >= 5 ? 1 : 2;
        if (Math.abs(i + 8) <= r && Math.abs(j - 7) <= r && !(i === -8 && j === 7 && k <= 4)) placeBlock('minecraft:oak_leaves', i, j, k);
      }
  return out;
})();

const Scene: React.FC = () => {
  const meshes = useMemo(() => {
    const ms = assemblyMeshes(sceneBlocks, { biome: 'minecraft:plains' });
    for (const m of ms) m.castShadow = m.receiveShadow = true;
    return ms;
  }, []);
  useEffect(() => () => meshes.forEach((m) => m.geometry.dispose()), [meshes]);
  return (
    <>
      {meshes.map((m) => (
        <primitive key={m.name} object={m} />
      ))}
      {/* 草地外面一大片地面：看雾和天边 */}
      <mesh position={[0, 0, -0.01]} receiveShadow>
        <planeGeometry args={[8000, 8000]} />
        <meshStandardMaterial color="#5d7f3c" roughness={1} />
      </mesh>
      <group position={[8, -3, 0]} rotation={[0, 0, -0.85]}>
        <LiYing pose={standPose([0, 0, 0])} />
      </group>
    </>
  );
};

const SkyLight: React.FC<{ frame: number }> = ({ frame: frame }) => {
  const v = views[frame]!;
  const cam = cameraRig;
  if (v.lightSet === '暮色')
    return v.usage === '现有' ? (
      <TwilightLighting camPos={cam.pos} fogFar={twilightFogFar} fogNear={twilightFogNear(twilightFogFar)} />
    ) : (
      <Environment description={twilightEnv({ fogFar: twilightFogFar, fogNear: twilightFogNear(twilightFogFar) })} 画法={twilightStyle} cameraPos={cam.pos} />
    );
  if (v.lightSet === '时刻') return <Environment description={envTrack} 画法={overworldStyle} cameraPos={cam.pos} frame={frame} />;
  const castShadow = v.lightSet === '主世界投影';
  return v.usage === '现有' ? (
    <FlightFog visibility={visibility} />
  ) : (
    <Environment description={overworldEnv({ visibility, shadowFar: castShadow ? overworldShadowFar(visibility) : undefined })} 画法={overworldStyle} cameraPos={cam.pos} eyeHeight={cam.pos[2]} />
  );
};

const picture: React.FC = () => {
  const frame = useViewIndex(viewFps);
  const { width, height } = useVideoConfig();
  const v = views[frame]!;
  const overworldExisting = v.usage === '现有' && v.lightSet !== '暮色';
  return (
    <AbsoluteFill>
      <ThreeCanvas key={frame} width={width} height={height} shadows="percentage" gl={{ antialias: true, logarithmicDepthBuffer: true }} dpr={canvasDpr(1)}>
        <SkyLight frame={frame} />
        <FlightRig c={v.lightSet === '时刻' && v.lookUp ? lookUpRig : cameraRig} />
        <ScreenAo />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          {overworldExisting && (
            <FlightSky camPos={cameraRig.pos} shadow={v.lightSet === '主世界投影' ? { shadowFar: overworldShadowFar(visibility), aboveGround: cameraRig.pos[2] } : undefined} />
          )}
          <Scene />
        </group>
      </ThreeCanvas>
    </AbsoluteFill>
  );
};

export default picture;
