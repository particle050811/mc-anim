// 6-1-3 起飞：把模型库里的场景、角色、扫帚按 编排.ts 组装成镜头，挂上这一段的配乐（2026-10-10 起配乐晚 配乐延后 帧进，见 编排.ts）。
// 场景：娜迦庭院导出网格 + 四周游戏真实地貌导入的地形（模型/场景/暮色新世界.tsx，2026-10-05 起）；李樱、九胡、扫帚都是取材的实机模型。
// 编排是庭院本地坐标：人、扫帚、宝箱、云都放进 <地标位 名="娜迦庭院">，镜头加上庭院原点换成世界坐标，地形照世界坐标画。
// 光照（用户 2026-10-02）：和 6-1-2 同一套暮色森林的天、光、雾（lib/暮色光照.tsx），一直用到 6-1-9。镜头 1（接 6-1-2 末帧）里
// 天空穹顶和 6-1-2 一样放在原点、主光的投影范围、雾一样（满视距 512 米，雾近端见 lib/暮色光照.tsx 的 `twilightFogNear`），首帧和 6-1-2 末帧接得上；切中景以后穹顶跟着镜头。云是 TwilightLighting 带的 Photon 云。
import { ThreeCanvas } from '@remotion/three';
import { canvasDpr } from '../../../../engine/core/渲染级别.ts';
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { FlightRig } from '../../../../world/地点/飞行镜头.tsx';
import { TwilightLighting, twilightFogNear } from '../../../../engine/light/暮色光照.tsx';
import { twilightSunDir } from '../../../../engine/light/光照配比.ts';
import { SegmentMusic } from '../../../../world/配乐/配乐音轨.tsx';
import { 声音Sequence } from '../../../../engine/audio/声音Sequence.tsx';
import { Jiuhu } from '../../../../world/角色/九胡.tsx';
import { LiYing } from '../../../../world/角色/李樱.tsx';
import { RideBroom } from '../../../../world/角色/骑扫帚.tsx';
import { WornSheath } from '../../../../world/物品/拔刀剑.tsx';
import { Chest, TWILIGHT_CHEST_TEX } from '../../../../world/物品/箱子.tsx';
import { LandmarkPlacement, TwilightTerrain } from '../../../../world/地点/暮色新世界.tsx';
import { ScreenAo } from '../../../../engine/voxel/屏幕AO.tsx';
import * as choreo from './编排.ts';
import { TakeoffSound } from './声音.tsx';
import { mouthAt } from '../../../../world/角色/口型.ts';
import { LichScene } from '../6-1-5/戏.tsx';
import { 贯穿时刻 } from '../一镜到底/路线.ts';

export const SUN = twilightSunDir;

const sheath = <WornSheath />;

export const TakeOff: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const local = choreo.camera(frame);
  const origin = choreo.courtyard.原点;
  const toWorld = (p: number[]) => [p[0] + origin[0], p[1] + origin[1], p[2] + origin[2]];
  const cam = { ...local, pos: toWorld(local.pos), tgt: toWorld(local.tgt) };
  const broom = choreo.broom(frame);
  const riders = choreo.riders(frame);
  const ly = choreo.liyingOnFoot(frame);
  const jh = choreo.jiuhuOnFoot(frame);
  const shot1 = frame < choreo.beats.cutToMedium;
  const liYingMouth = mouthAt(choreo.lineCues, '李樱', frame);
  const jiuhuMouth = mouthAt(choreo.lineCues, '九胡', frame);
  return (
    <AbsoluteFill>
      <ThreeCanvas width={width} height={height} shadows="percentage" gl={{ antialias: true, logarithmicDepthBuffer: true }} dpr={canvasDpr(1)}>
        <TwilightLighting camPos={cam.pos} domeCenter={shot1 ? origin : undefined} fogFar={choreo.fogFar(frame)} fogNear={twilightFogNear(choreo.fogFar(frame))} aboveGround={choreo.aboveGround(frame)} />
        <FlightRig c={cam} />
        {/* 屏幕空间 AO：同 6-1-2、一镜到底一直开着（云也画在它里面） */}
        <ScreenAo />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <TwilightTerrain camPos={cam.pos} landmarks={['娜迦庭院']} t={choreo.T612 + frame / 24} clearPlants={choreo.clearPlants(frame)} shadowLightDir={twilightSunDir} />
          {/* 巫妖怪塔：起飞朝东南 135° 以后它就在正前方 2 公里（直航，用户 10-05「为什么起飞的时候就不能把那个扫帚摆好方向」），升上林海以后地平线上看得见塔尖。
              一镜到底（6-1-4+5）从第 0 帧起画它，这里不画的话末帧接 6-1-4+5 首帧时塔尖一下子冒出来（整合时逐像素比出来的）。
              时间照一镜到底的口径：6-1-3 末帧 = 一镜到底第 0 帧（物理时间 0），塔还没被撞 */}
          {frame >= choreo.beats.起飞 && <LichScene t={(frame - choreo.beats.末帧) / 24 - 贯穿时刻.巫妖} />}
          <LandmarkPlacement 名="娜迦庭院">
            {broom.appear > 0 && (
              <RideBroom
                pos={broom.pos}
                yaw={broom.yaw}
                pitch={broom.pitch}
                roll={broom.roll}
                broom={{ appear: broom.appear }}
                liYing={riders.liYing ? { ...riders.liYing, hipItem: sheath, 嘴: liYingMouth } : false}
                jiuhu={riders.jiuhu ? { ...riders.jiuhu, 嘴: jiuhuMouth } : riders.jiuhu}
              />
            )}
            <group position={choreo.CHEST as [number, number, number]}>
              <Chest 贴图={TWILIGHT_CHEST_TEX.暮色橡木} />
            </group>
            {ly && <LiYing pose={ly} hipL={sheath} 嘴={liYingMouth} />}
            {jh && <Jiuhu pose={jh.pose} tail={jh.tail} bend={jh.bend} gait={jh.gait} run={jh.run} 嘴={jiuhuMouth} />}
          </LandmarkPlacement>
        </group>
      </ThreeCanvas>
      <TakeoffSound />
      <声音Sequence from={choreo.musicDelay}>
        <SegmentMusic segmentId={choreo.segmentId} />
      </声音Sequence>
    </AbsoluteFill>
  );
};
