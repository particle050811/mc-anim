// 6-3-8、6-3-10 的画面：按编排秒 `t` 画出这一帧（编排.ts 的人、卫兵、机位）。各段 Composition（二人登场.tsx、6-3-10/追进竖井.tsx）只给段名，段内帧换 t 用编排.ts 的 `toSec`（含跳下城墙那一截跳切）。
// 场景和 6-3-4～6-3-6 是同一套（6-3-下坠/画面.tsx 原样拿来）：主世界-116 的真实地形、边城、挖掉的坑和竖井、碎块、Photon 的云、和 6-2-5 同一套太阳天光。
// 砸穿后格子都碎完了（`ShaftFill` 按 `fallTime` 画，全空）；碎块.tsx 里落地碎块寿命 30 秒，这几段要演到砸地后 40 多秒，所以碎块按砸地后 29 秒那一刻画（停住不动，也不会突然消失）。
// 坑口不冒烟（用户 10-12 嫌浓烟多余）：不画碎块.tsx 的 `烟尘`、`余烟`，不画 6-3-6 的震波；古城地面照 6-3-6 砸完落定的样子（坑、落块、裂纹，竖井.tsx 的 `AncientCity` 默认）。
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { rad } from '../../../../engine/anim/anim.ts';
import { LevelParams, canvasDpr } from '../../../../engine/core/渲染级别.ts';
import { ScreenAo } from '../../../../engine/voxel/屏幕AO.tsx';
import { VoxelWorld } from '../../../../engine/voxel/世界.tsx';
import { FlightFog, FlightRig, FlightSky } from '../../飞行镜头.tsx';
import { Guard } from '../../../角色/卫兵.tsx';
import { HuangPan, LiuXinzhong } from '../../../角色/追兵.tsx';
import { BorderTown } from '../../边城轮廓.tsx';
import { poolSurfaceZ } from '../水池.tsx';
import { VanillaParticles, waterSplash, type ParticleSpawn } from '../../../特效/原版粒子.tsx';
import { borderTownPos } from '../../主世界116.ts';
import * as fallChoreo from '../6-3-下坠/编排.ts';
import * as fallTimeline from '../6-3-下坠/时间线.ts';
import { AncientCity, SlabFloor, ShaftWalls, UnderFog, UNDER_BACKGROUND } from '../6-3-下坠/竖井.tsx';
import { ShaftFill } from '../6-3-下坠/填块.tsx';
import { useFallTerrain } from '../6-3-下坠/地形.ts';
import { BlockDebris, type FxParams } from '../6-3-下坠/碎块.tsx';
import * as choreo from './编排.ts';
import { withTalkNod } from '../../../配音/口型.ts';


// 特效参数：和 6-3-下坠/画面.tsx 的 `fx()` 同一份数（碎块按它生成）
let FX: FxParams | null = null;
const fx = (): FxParams => {
  if (FX) return FX;
  const shaft = fallChoreo.liYingShaft();
  const imp = fallTimeline.撞击时刻();
  FX = { impact: imp, 中心: fallChoreo.shaftCellCenter(), groundZ: fallChoreo.groundZ, caveCeilingZ: fallChoreo.caveCeilingZ, ancientCityFloorZ: fallChoreo.ancientCityFloorZ, breachSec: imp + shaft.breachDelay, landSec: shaft.落地 };
  return FX;
};

// 跳进落水池的溅水（Entity.doWaterSplashEffect，按落水那一刻的速度，玩家宽 0.6）：城的局部坐标，画在城的 group 里
let SPLASHES: ParticleSpawn[] | null = null;
const splashes = (): ParticleSpawn[] => {
  if (SPLASHES) return SPLASHES;
  const jumps = [choreo.leaderPoolJump('刘'), choreo.leaderPoolJump('黄'), ...choreo.卫兵位置.map((_, i) => choreo.guardPoolJump(i))];
  SPLASHES = jumps.flatMap((jump, k) => waterSplash(jump.entry.pos, jump.entry.vel, jump.entry.sec * 20, 0.6, poolSurfaceZ, 63 + k));
  return SPLASHES;
};

// actors：给了就换掉这里的卫兵和两人（7-4-3 两人从竖井跳回坑口，场景照这一套）
export const PursuerScene: React.FC<{ t: number; cam?: choreo.Cam; actors?: React.ReactNode }> = ({ t, cam: camOverride, actors }) => {
  const { width, height } = useVideoConfig();
  const terrain = useFallTerrain();
  const cam = camOverride ?? choreo.camPose(t);
  const fxParams = fx();
  const physSec = choreo.fallTime(t);
  const pit = fallChoreo.crater();
  const under = cam.pos[2] < fallChoreo.groundZ - 0.5;
  const huang = choreo.huangPanState(t);
  const liu = choreo.liuXinzhongState(t);
  if (!terrain) return null;
  return (
    <AbsoluteFill style={{ backgroundColor: UNDER_BACKGROUND }}>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true, logarithmicDepthBuffer: true }} dpr={canvasDpr(LevelParams.视频.dpr)}>
        {under ? <UnderFog /> : <FlightFog visibility={fallTimeline.起点.visibility} />}
        <FlightRig c={cam} near={0.02} />
        <ScreenAo />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          {/* 灯：同 6-3-下坠/画面.tsx 地面上那一套（天空穹顶跟着镜头） */}
          <FlightSky camPos={cam.pos} photon={!under} />
          {!under && <VoxelWorld 键={terrain.键} 来源={terrain.来源} 中心={cam.pos} 像素={LevelParams.视频.像素} 远={terrain.远} 高度={terrain.高度} />}
          <group position={borderTownPos}>
            <BorderTown holeRect={pit.holeRect} />
            {!actors && t < choreo.cues.切坑 && <VanillaParticles spawns={splashes()} 秒={t} />}
          </group>
          <SlabFloor holeRect={pit.holeRect} />
          <group position={[fxParams.中心[0], fxParams.中心[1], 0]}>
            <ShaftWalls />
            <ShaftFill w={physSec} />
          </group>
          {cam.pos[2] < fallChoreo.groundZ + 30 && <AncientCity center={fxParams.中心} />}
          {actors ?? (
            <>
            {/* 卫兵（每人一张脸，同 6-3-4） */}
            {choreo.卫兵位置.map((_, i) => {
              const guard = choreo.guardPoseAt(t, i);
              if (!guard.present) return null;
              const pos = guard.pos;
              return (
                <group key={i} position={[borderTownPos[0] + pos[0], borderTownPos[1] + pos[1], borderTownPos[2] + pos[2]]} rotation={[0, 0, rad(180 + guard.bodyYaw)]}>
                  <Guard sec={physSec + i * 0.7} glintSec={physSec} headPitch={guard.headPitch} headYaw={guard.headYaw} raiseSpyglass={guard.raiseSpyglass} skinIndex={i} crouch={guard.crouch} limbSwing={guard.limbSwing} stride={guard.stride} capeLift={guard.capeLift} lean={guard.lean} />
                </group>
              );
            })}
            {huang.present && <HuangPan pose={withTalkNod(huang.pose, choreo.lineCuesBySegment['6-3-8'], '黄叛', t * choreo.FPS)} />}
            {liu.present && <LiuXinzhong pose={liu.pose} />}
            </>
          )}
          <BlockDebris P={fxParams} w={Math.min(physSec, fxParams.impact + 29)} />
        </group>
      </ThreeCanvas>
    </AbsoluteFill>
  );
};

export const PursuerSegment: React.FC<{ segment: choreo.SegmentName }> = ({ segment: segment }) => {
  const frame = useCurrentFrame();
  return <PursuerScene t={choreo.toSec(segment, frame)} />;
};

// 核对：一帧一个视图（编排秒 + 可选机位），出静帧定机位、动作用：npx remotion render 6-3-8至10-核对 <目录> --sequence --props=<json>
export type CheckView = { t: number; 机位?: choreo.Cam };
export const PursuerCheck: React.FC<{ views: CheckView[] }> = ({ views }) => {
  const frame = useCurrentFrame();
  const view = views[Math.min(frame, views.length - 1)];
  return <PursuerScene t={view.t} cam={view.机位} />;
};
