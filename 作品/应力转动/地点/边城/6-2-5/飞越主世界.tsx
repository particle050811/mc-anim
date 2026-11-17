// 6-2-5 飞越主世界、6-2-6 边城在望的画面：骑乘套件 + 主世界真实地形（主世界-116 导入 + 远景兜底，lib/体素/主世界地形.ts）+ 新边城 + 云，
// 按 编排.ts 的共用时间线组装。声音（配乐 Wasted 从 33.1 接着放、悬停起三小节渐弱）照 6-飞越主世界俯冲边城 段.ts 的 cue 放（11-06 迁成原生段，cue 照基线声音清单转写）。
// 首帧是草束盖满画面（6-2-4 末帧），33.1 草束从画面下方抽走、露出基地小岛上空的高空。
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { useCurrentSec } from '@engine/段/时间.tsx';
import { FlightFog, FlightRig, FlightSky, overworldShadowFar } from '../../飞行镜头.tsx';
import { LevelParams, canvasDpr } from '@engine/core/渲染级别.ts';
import { ScreenAo } from '@engine/voxel/屏幕AO.tsx';
import { SUN_OW_DIR } from '../../主世界光照.tsx';
import { VoxelWorld } from '@engine/voxel/世界.tsx';
import { RideBroom } from '@库/角色/骑扫帚.tsx';
import { JiuhuHandCompass } from '../../../角色/九胡持指南针.tsx';
import { WornSheath } from '@库/物品/拔刀剑.tsx';
import { BorderTown } from '../../边城轮廓.tsx';
import { useFallTerrain } from '../6-3-下坠/地形.ts';
import { borderTownPos } from '../../主世界116.ts';
import * as choreo from './编排.ts';
import { trialFarM } from '@engine/light/高度雾.ts';

export const sheath = <WornSheath />;

// 配乐（cue 里的数当年这样算出来）：这次飞行从 33.1（低频砸回来，草束抽走）起接着放，按全局秒算歌曲时间。用户 2026-10-05「音乐卡点别管了 最后再管」：
// 航线搬到真实地形以后飞行比原来按配乐排的长了约 4 秒，段的长度不再跟着小节走，配乐只是照常挂着。
// 渐弱照原来的意思放在悬停那一刻起、三小节（原来是 46.1 悬停、渐弱到 49.1），(1 − x)² 曲线；第六章飞行.ts 里后一半的 淡出 还是按小节写的旧位置，比现在的悬停早 4 秒，没用。

// 6-2-5、6-2-6 是同一条航线上接着的两截
const flightSpan = [choreo.segmentTable['6-2-5'].start, choreo.segmentTable['6-2-6'].end] as const;

// T：编排.ts 的全局秒
export const FlightView: React.FC<{ T: number }> = ({ T: globalSec }) => {
  const { width, height } = useVideoConfig();
  const terrain = useFallTerrain();
  if (!terrain) return null;
  const cam = choreo.camera(globalSec);
  const broomState = choreo.broom(globalSec);
  const riders = choreo.riders(globalSec);
  return (
    <AbsoluteFill>
      <ThreeCanvas width={width} height={height} shadows="percentage" gl={{ antialias: true, logarithmicDepthBuffer: true }} dpr={canvasDpr(LevelParams.视频.dpr)}>
        <FlightFog visibility={choreo.visibility(globalSec)} far={trialFarM(terrain.farM)} />
        <FlightRig c={cam} near={0.02} ahead={{ sec: globalSec, at: choreo.camera, range: flightSpan }} />
        <ScreenAo />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          {/* 天、灯、云（lib/主世界光照.tsx）；日光投影见 lib/飞行镜头.tsx 的 `OverworldSunLight` */}
          <FlightSky camPos={cam.pos} shadow={{ shadowFar: overworldShadowFar(choreo.visibility(globalSec)), aboveGround: cam.pos[2] - choreo.routeGround(cam.pos[0], cam.pos[1]) }} />
          <VoxelWorld worldKey={terrain.key} source={terrain.source} center={cam.pos} pixel={LevelParams.视频.pixel} far={trialFarM(terrain.farM)} heightRange={terrain.heightRange} shadowLightDir={SUN_OW_DIR} />
          <group position={borderTownPos}>
            <BorderTown />
          </group>
          <RideBroom pos={broomState.位置} yaw={broomState.facing} pitch={broomState.pitch} roll={broomState.roll} liYing={{ ...riders.李樱, hipItem: sheath }} jiuhu={{ ...riders.九胡, rightHand: <JiuhuHandCompass ride /> }} />
        </group>
      </ThreeCanvas>
    </AbsoluteFill>
  );
};

export const FlyOverworld: React.FC = () => {
  const sec = useCurrentSec();
  return <FlightView T={choreo.segmentTable['6-2-5'].start + sec} />;
};
