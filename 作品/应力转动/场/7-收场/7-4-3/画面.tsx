// 7-4-3 报告的画面：编排.ts、坑口.ts 的人、书、机位按帧画出来。
// 镜头 1 坑口：6-3-8/画面.tsx 的 PursuerScene（地形、边城、坑、竖井、碎块、灯都是 6-3-10 那一套），人换成 坑口.ts 的两人和卫兵。
// 屋里：卫兵室网格 + 6-3 同一套边城、石半砖地面挖坑（窗外）。灯：太阳同主世界（SUN_OW，正西 20°），屋子一带开软阴影（天空.tsx 的 SunLight）。
// 卫兵室的窗朝东，下午的太阳照不进屋（用户 10-15：不为窗光改太阳），屋里是天光和灯笼、蜡烛两盏暖色点光（游戏里亮度 15、14 的光源）。窗外的城照常是大太阳。
import { ThreeCanvas } from "@remotion/three";
import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { rad } from "@engine/anim/anim.ts";
import { LevelParams, canvasDpr } from "@engine/core/渲染级别.ts";
import { FlightFog, FlightRig } from "../../../地点/飞行镜头.tsx";
import { ScreenAo } from "@engine/voxel/屏幕AO.tsx";
import { Guard } from "../../../角色/卫兵.tsx";
import { HuangPan, LiuXinzhong } from "../../../角色/追兵.tsx";
import { ArtificerCane } from "@库/物品/匠师之杖.tsx";
import { OpenBook, ClosedBook, HeldItemSprite, featherTex } from "@库/物品/书.tsx";
import { BorderTown } from "../../../地点/边城轮廓.tsx";
import { guardRoom, GuardRoomMesh } from "../../../地点/边城室内.tsx";
import { borderTownPos } from "../../../地点/主世界116.ts";
import { SkyDome, SunLight, SKY } from "@engine/light/天空.tsx";
import { OverworldSky, SUN_OW } from "../../../地点/主世界光照.tsx";
import * as fallChoreo from "../../../地点/边城/6-3-下坠/编排.ts";
import { SlabFloor } from "../../../地点/边城/6-3-下坠/竖井.tsx";
import { PursuerScene } from "../../../地点/边城/6-3-8/画面.tsx";
import { lastSec as lastSec6 } from "../../../地点/边城/6-3-8/编排.ts";
import * as choreo from "./编排.ts";
import * as pit from "./坑口.ts";

// 7-4 的灯照主世界的配比（用户 10-15 定，lib/飞行镜头.tsx 的 FlightSky：直射 8.4、天光 1.0、环境光 0.17），屋里自己补的光按同样的比例压（天光 ×0.77、环境光 ×0.34）
export const RoomLights: React.FC<{ lights: { p: number[]; 强: number }[] }> = ({
  lights,
}) => (
  <>
    {lights.map((l, i) => (
      <pointLight
        key={i}
        position={l.p as [number, number, number]}
        color="#ffb565"
        intensity={l.强}
        distance={9}
        decay={1.6}
      />
    ))}
  </>
);

// 镜头 1：6-3-10 末帧那一刻的场景（碎块、竖井都停在那时候），人按段内帧动
const pitSceneT = lastSec6;
const PitPicture: React.FC<{ f: number }> = ({ f }) => {
  const liu = pit.leaperPose("刘", f);
  const huang = pit.leaperPose("黄", f);
  return (
    <PursuerScene
      t={pitSceneT}
      cam={pit.pitCam(f)}
      actors={
        <>
          {Array.from({ length: pit.guardCount }, (_, i) => {
            const g = pit.guardPose(f, i);
            return (
              <group key={i} position={[borderTownPos[0] + g.pos[0], borderTownPos[1] + g.pos[1], borderTownPos[2] + g.pos[2]]} rotation={[0, 0, rad(180 + g.bodyYaw)]}>
                <Guard sec={f / choreo.FPS + i * 0.7} glintSec={f / choreo.FPS} headPitch={g.headPitch} headYaw={g.headYaw} raiseSpyglass={0} skinIndex={i} crouch={g.crouch} limbSwing={g.limbSwing} stride={g.stride} capeLift={g.capeLift} />
              </group>
            );
          })}
          {huang && <HuangPan pose={huang} />}
          {liu && <LiuXinzhong pose={liu} />}
        </>
      }
    />
  );
};

export const ReportPicture: React.FC<{ f: number }> = ({ f }) => (f < choreo.shot1End ? <PitPicture f={f} /> : <RoomPicture f={f} />);

const RoomPicture: React.FC<{ f: number }> = ({ f: frame }) => {
  const { width, height } = useVideoConfig();
  const cam = choreo.camAt(frame);
  const crater = fallChoreo.crater();
  const liu = choreo.liuXinzhongState(frame);
  const guard = choreo.guardState(frame);
  const roomCenter = choreo.roomToWorld([4.5, -3, 1.5]);
  const liuWorldPose = { ...liu.pose, loc: choreo.roomToWorld(liu.pose.loc) };
  // 书：拿起前摊在桌上（合 0～1）；拿起以后是合上的书，变换见 编排.ts 的 bookMatrix（跟着手走）
  const bookMat = choreo.bookMatrix(frame);
  return (
    <AbsoluteFill style={{ backgroundColor: SKY.horizon }}>
      <ThreeCanvas
        width={width}
        height={height}
        shadows="percentage"
        gl={{ antialias: true, logarithmicDepthBuffer: true }}
        dpr={canvasDpr(LevelParams.视频.dpr)}
      >
        <FlightFog visibility={2500} />
        <FlightRig c={cam} near={0.02} />
        <ScreenAo />
        <OverworldSky />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <group position={cam.pos as [number, number, number]}>
            <SkyDome sun={SUN_OW} />
          </group>
          <SunLight sun={SUN_OW} center={roomCenter} extent={14} />
          <ambientLight intensity={0.15} />
          <RoomLights
            lights={[
              { p: choreo.roomToWorld(guardRoom.灯笼), 强: 2.2 },
              { p: choreo.roomToWorld(guardRoom.candle), 强: 0.9 },
            ]}
          />
          {/* 窗外：边城、挖了坑的地面（坑在南边一百米，窗朝东看不到） */}
          <group position={borderTownPos}>
            <BorderTown holeRect={crater.holeRect} />
          </group>
          <SlabFloor holeRect={crater.holeRect} />
          {/* 屋 */}
          <group position={choreo.roomToWorld([0, 0, 0])}>
            <GuardRoomMesh />
          </group>
          {/* 刘心忠：书页镜里右手拿羽毛笔；递书镜里羽毛已经随署名没了（编排.ts 的 holdingQuill），右手空着 */}
          <LiuXinzhong
            pose={liuWorldPose}
            右手={liu.holdingQuill ? <HeldItemSprite tex={featherTex} /> : <group />}
          />
          {/* 匠师之杖靠在东北墙角：杖尖点地，往东北斜着靠在墙上 */}
          <group
            position={choreo.roomToWorld(choreo.staffPos)}
            rotation={[rad(-6), rad(6), 0]}
            scale={1.95 / 32}
          >
            <group position={[0, 0, 13]}>
              <ArtificerCane />
            </group>
          </group>
          {/* 书（屋里坐标） */}
          <group position={choreo.roomToWorld([0, 0, 0])}>
            <group matrix={bookMat} matrixAutoUpdate={false}>
              {choreo.bookOnHand(frame) ? <ClosedBook /> : <OpenBook pages={choreo.bookPages} charCounts={choreo.charCounts(frame)} closed={choreo.closeBook(frame)} />}
            </group>
          </group>
          {/* 卫兵：递书镜才进画 */}
          {frame >= choreo.shot2End && (
            <group position={choreo.roomToWorld(guard.pos)} rotation={[0, 0, rad(guard.yaw)]}>
              <Guard
                sec={frame / choreo.FPS}
                glintSec={frame / choreo.FPS}
                raiseSpyglass={0}
                rightArm={guard.rightArm}
                headPitch={guard.headPitch}
                headYaw={guard.headYaw}
                limbSwing={guard.limbSwing}
                stride={guard.stride}
                skinIndex={3}
              />
            </group>
          )}
        </group>
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
