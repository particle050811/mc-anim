// 6-2-5 飞越主世界、6-2-6 边城在望的画面：骑乘套件 + 主世界真实地形（主世界-116 导入 + 远景兜底，lib/体素/主世界地形.ts）+ 新边城 + 云，
// 按 编排.ts 的共用时间线组装，挂上配乐（帧 0 = 33.1，往后照常接着放，见 飞行配乐）。
// 首帧是草束盖满画面（6-2-4 末帧），33.1 草束从画面下方抽走、露出基地小岛上空的高空。
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { FlightFog, FlightRig, FlightSky, overworldShadowFar } from '../../飞行镜头.tsx';
import { LevelParams, canvasDpr } from '@engine/core/渲染级别.ts';
import { ScreenAo } from '@engine/voxel/屏幕AO.tsx';
import { SUN_OW_DIR } from '../../主世界光照.tsx';
import { VoxelWorld } from '@engine/voxel/世界.tsx';
import { MusicAudio } from '../../../配乐/配乐音轨.tsx';
import { posToSec } from '@engine/audio/曲目.ts';
import { halfGain, ch6FlightMusic } from '../../../配乐/第六章飞行.ts';
import { RideBroom } from '@库/角色/骑扫帚.tsx';
import { JiuhuHandCompass } from '../../../角色/九胡持指南针.tsx';
import { WornSheath } from '@库/物品/拔刀剑.tsx';
import { BorderTown } from '../../边城轮廓.tsx';
import { useFallTerrain } from '../6-3-下坠/地形.ts';
import { borderTownPos } from '../../主世界116.ts';
import * as choreo from './编排.ts';

export const sheath = <WornSheath />;

// 配乐：这次飞行从 33.1（低频砸回来，草束抽走）起接着放，按全局帧算歌曲时间。用户 2026-10-05「音乐卡点别管了 最后再管」：
// 航线搬到真实地形以后飞行比原来按配乐排的长了约 4 秒，段的长度不再跟着小节走，配乐只是照常挂着。
// 渐弱照原来的意思放在悬停那一刻起、三小节（原来是 46.1 悬停、渐弱到 49.1）；第六章飞行.ts 里后一半的 淡出 还是按小节写的旧位置，
// 比现在的悬停早 4 秒，所以这里不用它的淡出，只用它的淡入（33.1 以后早就是满音量），淡出按这条时间线的悬停时刻自己算（同样的 (1 − x)² 曲线）
export const FlightMusic: React.FC<{ startFrame: number }> = ({ startFrame: startFrame }) => {
  const track = ch6FlightMusic;
  const startSec = posToSec(track.song, [33, 1]);
  const fadeStartSec = startSec + choreo.beats.stopFrame / 24;
  const fadeLenSec = 3 * track.song.分析.网格.每小节拍数 * track.song.分析.网格.拍长;
  const volumeAt = (t: number) => (t <= fadeStartSec ? 1 : Math.max(0, 1 - (t - fadeStartSec) / fadeLenSec) ** 2);
  return <MusicAudio song={track.song} startSec={startSec + startFrame / 24} gain={(t) => (t < startSec ? halfGain(track, '后一半', t) : volumeAt(t))} />;
};

export const FlightView: React.FC<{ G: number; startFrame: number }> = ({ G: globalFrame, startFrame: startFrame }) => {
  const { width, height } = useVideoConfig();
  const terrain = useFallTerrain();
  if (!terrain) return null;
  const cam = choreo.camera(globalFrame);
  const broomState = choreo.broom(globalFrame);
  const riders = choreo.riders(globalFrame);
  return (
    <AbsoluteFill>
      <ThreeCanvas width={width} height={height} shadows="percentage" gl={{ antialias: true, logarithmicDepthBuffer: true }} dpr={canvasDpr(LevelParams.视频.dpr)}>
        <FlightFog visibility={choreo.visibility(globalFrame)} />
        <FlightRig c={cam} near={0.02} />
        <ScreenAo />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          {/* 天、灯、云（lib/主世界光照.tsx）；日光投影见 lib/飞行镜头.tsx 的 `OverworldSunLight` */}
          <FlightSky camPos={cam.pos} shadow={{ shadowFar: overworldShadowFar(choreo.visibility(globalFrame)), aboveGround: cam.pos[2] - choreo.routeGround(cam.pos[0], cam.pos[1]) }} />
          <VoxelWorld 键={terrain.键} 来源={terrain.来源} 中心={cam.pos} 像素={LevelParams.视频.像素} 远={terrain.远} 高度={terrain.高度} shadowLightDir={SUN_OW_DIR} />
          <group position={borderTownPos}>
            <BorderTown />
          </group>
          <RideBroom pos={broomState.位置} yaw={broomState.朝向} pitch={broomState.俯仰} roll={broomState.横滚} liYing={{ ...riders.李樱, hipItem: sheath }} jiuhu={{ ...riders.九胡, 右手: <JiuhuHandCompass ride /> }} />
        </group>
      </ThreeCanvas>
      <FlightMusic startFrame={startFrame} />
    </AbsoluteFill>
  );
};

export const FlyOverworld: React.FC = () => {
  const frame = useCurrentFrame();
  const globalFrame = choreo.segmentTable['6-2-5'].起 + frame;
  return <FlightView G={globalFrame} startFrame={choreo.segmentTable['6-2-5'].起} />;
};
