// 7-4-4 起疑的画面：编排.ts 的人、书、机位按帧画出来。场景：城主府书房网格（屋里）+ 6-3 同一套边城（窗外的广场）。
// 灯：同 7-4-3（太阳 SUN_OW、主世界的配比），书房的窗朝北，阳光照不进来：屋里只有天光（环境光压低）和两盏吊灯笼、桌上三根蜡烛的暖光，
// 窗外的广场是大太阳，乔雷夫的背影衬在亮窗前面。屋子一带开软阴影（天空.tsx 的 SunLight）。最后 1 秒黑场。
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { LevelParams, canvasDpr } from '@engine/core/渲染级别.ts';
import { FlightFog, FlightRig } from '../../地点/飞行镜头.tsx';
import { ScreenAo } from '@engine/voxel/屏幕AO.tsx';
import { QiaoLeifu } from '../../角色/乔雷夫.tsx';
import { OpenBook } from '@库/物品/书.tsx';
import { BorderTown } from '../../地点/边城轮廓.tsx';
import { lordStudy, LordStudyMesh } from '../../地点/边城室内.tsx';
import { borderTownPos } from '../../地点/主世界116.ts';
import { SkyDome, SunLight, SKY } from '@engine/light/天空.tsx';
import * as fallChoreo from '../../地点/边城/6-3-下坠/编排.ts';
import { SlabFloor } from '../../地点/边城/6-3-下坠/竖井.tsx';
import { OverworldSky, SUN_OW } from '../../地点/主世界光照.tsx';
import { RoomLights } from '../../场/7-收场/7-4-3/画面.tsx';
import * as choreo from './编排.ts';

export const SuspicionPicture: React.FC<{ f: number }> = ({ f: frame }) => {
  const { width, height } = useVideoConfig();
  const cam = choreo.camAt(frame);
  const pit = fallChoreo.crater();
  const pose = choreo.qiaoLeifuPose(frame);
  return (
    <AbsoluteFill style={{ backgroundColor: SKY.horizon }}>
      <ThreeCanvas width={width} height={height} shadows="percentage" gl={{ antialias: true, logarithmicDepthBuffer: true }} dpr={canvasDpr(LevelParams.视频.dpr)}>
        <FlightFog visibility={2500} />
        <FlightRig c={cam} near={0.02} />
        <ScreenAo />
        <OverworldSky />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <group position={cam.pos as [number, number, number]}>
            <SkyDome sun={SUN_OW} />
          </group>
          <SunLight sun={SUN_OW} center={choreo.roomToWorld([5.5, -4.5, 2])} extent={16} />
          <ambientLight intensity={0.17} />
          <hemisphereLight args={['#cfe0f5', '#5a4a3a', 0.38]} position={[0, 0, 1]} />
          <RoomLights
            lights={[
              ...lordStudy.lanterns.map((p) => ({ p: choreo.roomToWorld(p), 强: 2.0 })),
              { p: choreo.roomToWorld(lordStudy.candle), 强: 1.2 },
            ]}
          />
          <group position={borderTownPos}>
            <BorderTown holeRect={pit.holeRect} />
          </group>
          <SlabFloor holeRect={pit.holeRect} />
          <group position={choreo.roomToWorld([0, 0, 0])}>
            <LordStudyMesh />
          </group>
          <QiaoLeifu pose={{ ...pose, loc: choreo.roomToWorld(pose.loc) }} />
          <group position={choreo.roomToWorld(choreo.bookOnDesk)}>
            <OpenBook pages={choreo.书页们} crumple={choreo.crumpleAt(frame)} gripPt={choreo.pageGripPt} />
          </group>
        </group>
      </ThreeCanvas>
      <AbsoluteFill style={{ backgroundColor: '#000', opacity: choreo.blackout(frame) }} />
    </AbsoluteFill>
  );
};
