// 环境核对的画面：一块草地上的小木屋、一棵橡树、李樱，四周一大片草色地面铺到天边（看雾和天边），机位朝西南偏西、略仰（看得到天、云和主世界的太阳）。
// 偶数帧（0、2、4）用现有组件，下一帧用 <环境> 预设，其余一字不差（不叠字，好逐像素比）；画布按视图换（key），每帧新的 WebGL 上下文，共用 uniform 卸下时各自复位。
// 仰望的视图同一个镜头位置、抬到仰角约 80°（午夜月亮在天顶）。
import { ThreeCanvas } from '@remotion/three';
import React, { useEffect, useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { canvasDpr } from '@engine/core/渲染级别.ts';
import { TwilightLighting, twilightFogNear } from '@engine/light/暮色光照.tsx';
import { 环境 } from '@engine/light/环境组件.tsx';
import 主世界画法 from '@engine/light/画法/主世界.tsx';
import 暮色画法 from '@engine/light/画法/暮色.tsx';
import { 暮色环境 } from '@engine/light/环境预设.ts';
import { 拼搭网格, type 方块 } from '@engine/model/方块拼搭.tsx';
import { ScreenAo } from '@engine/voxel/屏幕AO.tsx';
import { VIEW_DISTANCE } from '@engine/voxel/视距.ts';
import { LiYing } from '@库/角色/李樱.tsx';
import { standPose } from '@库/角色/骨架.tsx';
import { FlightFog, FlightRig, FlightSky, overworldShadowFar, type CamPose } from '../../地点/飞行镜头.tsx';
import { 主世界环境 } from '../../地点/主世界环境.ts';
import 环境轨 from './环境.ts';
import { 视图们, 能见度 } from './视图.ts';

const 机位: CamPose = { pos: [22, 10, 3.5], tgt: [0, 2, 5], lens: 24 };
const 仰望机位: CamPose = { pos: [22, 10, 3.5], tgt: [20.6, 9.5, 11.9], lens: 24 };
const 暮色雾远 = VIEW_DISTANCE;

const 场景方块 = (() => {
  const out: 方块[] = [];
  const 放 = (状态: string, i: number, j: number, k: number) => out.push({ 状态, 位: [i, j, k] });
  for (let i = -24; i < 24; i++) for (let j = -24; j < 24; j++) 放('minecraft:grass_block', i, j, -1);
  // 小木屋：x 0～6、y 0～5，四角原木，圆石墙基，木板墙，南墙开门、东墙开窗，木板平顶
  for (let i = 0; i <= 6; i++)
    for (let j = 0; j <= 5; j++) {
      const 边 = i === 0 || i === 6 || j === 0 || j === 5;
      const 角 = (i === 0 || i === 6) && (j === 0 || j === 5);
      for (let k = 0; k <= 3; k++) {
        if (!边) continue;
        if (角) 放('minecraft:oak_log', i, j, k);
        else if (k === 0) 放('minecraft:cobblestone', i, j, k);
        else if (j === 0 && i === 3 && k <= 2) continue;
        else if (i === 6 && (j === 2 || j === 3) && k === 2) 放('minecraft:glass', i, j, k);
        else 放('minecraft:oak_planks', i, j, k);
      }
      放('minecraft:oak_planks', i, j, 4);
    }
  for (let k = 0; k <= 4; k++) 放('minecraft:oak_log', -8, 7, k);
  for (let i = -10; i <= -6; i++)
    for (let j = 5; j <= 9; j++)
      for (let k = 3; k <= 6; k++) {
        const r = k >= 5 ? 1 : 2;
        if (Math.abs(i + 8) <= r && Math.abs(j - 7) <= r && !(i === -8 && j === 7 && k <= 4)) 放('minecraft:oak_leaves', i, j, k);
      }
  return out;
})();

const 场景: React.FC = () => {
  const meshes = useMemo(() => {
    const ms = 拼搭网格(场景方块, { 群系: 'minecraft:plains' });
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

const 灯天: React.FC<{ 帧: number }> = ({ 帧 }) => {
  const v = 视图们[帧]!;
  const cam = 机位;
  if (v.套 === '暮色')
    return v.用 === '现有' ? (
      <TwilightLighting camPos={cam.pos} fogFar={暮色雾远} fogNear={twilightFogNear(暮色雾远)} />
    ) : (
      <环境 描述={暮色环境({ 雾远: 暮色雾远, 雾近: twilightFogNear(暮色雾远) })} 画法={暮色画法} 镜头={cam.pos} />
    );
  if (v.套 === '时刻') return <环境 描述={环境轨} 画法={主世界画法} 镜头={cam.pos} />;
  const 投影 = v.套 === '主世界投影';
  return v.用 === '现有' ? (
    <FlightFog visibility={能见度} />
  ) : (
    <环境 描述={主世界环境({ 能见度, 投影远: 投影 ? overworldShadowFar(能见度) : undefined })} 画法={主世界画法} 镜头={cam.pos} 离地={cam.pos[2]} />
  );
};

const 画面: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const v = 视图们[frame]!;
  const 主世界现有 = v.用 === '现有' && v.套 !== '暮色';
  return (
    <AbsoluteFill>
      <ThreeCanvas key={frame} width={width} height={height} shadows="percentage" gl={{ antialias: true, logarithmicDepthBuffer: true }} dpr={canvasDpr(1)}>
        <灯天 帧={frame} />
        <FlightRig c={v.套 === '时刻' && v.仰望 ? 仰望机位 : 机位} />
        <ScreenAo />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          {主世界现有 && (
            <FlightSky camPos={机位.pos} shadow={v.套 === '主世界投影' ? { shadowFar: overworldShadowFar(能见度), aboveGround: 机位.pos[2] } : undefined} />
          )}
          <场景 />
        </group>
      </ThreeCanvas>
    </AbsoluteFill>
  );
};

export default 画面;
