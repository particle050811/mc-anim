// 6-1-3 起飞：把模型库里的场景、角色、扫帚按 编排.ts 组装成镜头。时间按秒取（决策 0015）。
// 声音（台词、音效、配乐）照 段.ts 的 cue 放（definePicture 自动挂），这里不挂。
// 场景：娜迦庭院导出网格 + 四周游戏真实地貌导入的地形（模型/场景/暮色新世界.tsx，2026-10-05 起）；李樱、九胡、扫帚都是取材的实机模型。
// 编排是庭院本地坐标：人、扫帚、宝箱、云都放进 <地标位 名="娜迦庭院">，镜头加上庭院原点换成世界坐标，地形照世界坐标画。
// 光照（用户 2026-10-02）：和 6-1-2 同一套暮色森林的天、光、雾（lib/暮色光照.tsx），一直用到 6-1-9。镜头 1（接 6-1-2 末帧）里
// 天空穹顶和 6-1-2 一样放在原点、主光的投影范围、雾一样（满视距 512 米，雾近端见 lib/暮色光照.tsx 的 `twilightFogNear`），首帧和 6-1-2 末帧接得上；切中景以后穹顶跟着镜头。云是 TwilightLighting 带的 Photon 云。
import { ThreeCanvas } from '@remotion/three';
import { LevelParams, canvasDpr } from '@engine/core/渲染级别.ts';
import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { useCurrentSec } from '@engine/段/时间.tsx';
import { FlightRig } from '../../../地点/飞行镜头.tsx';
import { TwilightLighting, twilightFogNear } from '@engine/light/暮色光照.tsx';
import { Jiuhu } from '@库/角色/九胡.tsx';
import { LiYing } from '@库/角色/李樱.tsx';
import { RideBroom } from '@库/角色/骑扫帚.tsx';
import { WornSheath } from '@库/物品/拔刀剑.tsx';
import { Chest, TWILIGHT_CHEST_TEX } from '@库/物品/箱子.tsx';
import { LandmarkPlacement, TwilightTerrain } from '../../../地点/暮色新世界.tsx';
import { farViewLighting, twilightFarViewM } from '../../../地点/暮色新世界/超远景.ts';
import { ScreenAo } from '@engine/voxel/屏幕AO.tsx';
import * as choreo from './编排.ts';
import { takeOffCamera, takeOffTwilight } from './机位.ts';
import { mouthAt } from '../../../配音/口型.ts';
import { LichScene } from '../6-1-5/戏.tsx';
import { pierceTimes } from '../一镜到底/路线.ts';
const sheath = <WornSheath />;

// 只画画面；声音照用到它的段（6-起飞、6-穿塔斩首领）段.ts 的 cue 放
export const TakeOff: React.FC = () => {
  const t = useCurrentSec();
  const { width, height } = useVideoConfig();
  const origin = choreo.courtyard.origin;
  const cam = takeOffCamera(t);
  const broom = choreo.broom(t);
  const riders = choreo.riders(t);
  const ly = choreo.liyingOnFoot(t);
  const jh = choreo.jiuhuOnFoot(t);
  const shot1 = t < choreo.beats.cutToMedium;
  const liYingMouth = mouthAt(choreo.lineCues, '李樱', t, 1);
  const jiuhuMouth = mouthAt(choreo.lineCues, '九胡', t, 1);
  return (
    <AbsoluteFill>
      <ThreeCanvas width={width} height={height} shadows="percentage" gl={{ antialias: true, logarithmicDepthBuffer: true }} dpr={canvasDpr(1)}>
        <TwilightLighting camPos={cam.pos} domeCenter={shot1 ? origin : undefined} fogFar={choreo.fogFar(t)} fogNear={twilightFogNear(choreo.fogFar(t))} aboveGround={choreo.aboveGround(t)} {...farViewLighting(choreo.farView(), choreo.farViewRamp(t))} farFog={choreo.farView() ? { far: twilightFarViewM(LevelParams.视频.far), ramp: choreo.farViewRamp(t) } : undefined} />
        <FlightRig c={cam} />
        {/* 屏幕空间 AO：同 6-1-2、一镜到底一直开着（云也画在它里面） */}
        <ScreenAo />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <TwilightTerrain camPos={cam.pos} landmarks={['娜迦庭院']} t={choreo.T612 + t} clearPlants={choreo.clearPlants(t)} {...takeOffTwilight()} />
          {/* 巫妖怪塔：起飞朝东南 135° 以后它就在正前方 2 公里（直航，用户 10-05「为什么起飞的时候就不能把那个扫帚摆好方向」），升上林海以后地平线上看得见塔尖。
              一镜到底（6-1-4+5）从第 0 帧起画它，这里不画的话末帧接 6-1-4+5 首帧时塔尖一下子冒出来（整合时逐像素比出来的）。
              时间照一镜到底的口径：6-1-3 末帧 = 一镜到底第 0 帧（物理时间 0），塔还没被撞 */}
          {t >= choreo.beats.takeoff && <LichScene t={t - choreo.beats.last - pierceTimes.巫妖} />}
          <LandmarkPlacement name="娜迦庭院">
            {broom.appear > 0 && (
              <RideBroom
                pos={broom.pos}
                yaw={broom.yaw}
                pitch={broom.pitch}
                roll={broom.roll}
                broom={{ appear: broom.appear }}
                liYing={riders.liYing ? { ...riders.liYing, hipItem: sheath, mouth: liYingMouth } : false}
                jiuhu={riders.jiuhu ? { ...riders.jiuhu, mouth: jiuhuMouth } : riders.jiuhu}
              />
            )}
            <group position={choreo.CHEST as [number, number, number]}>
              <Chest 贴图={TWILIGHT_CHEST_TEX.暮色橡木} />
            </group>
            {ly && <LiYing pose={ly} hipL={sheath} mouth={liYingMouth} />}
            {jh && <Jiuhu pose={jh.pose} tail={jh.tail} bend={jh.bend} gait={jh.gait} run={jh.run} mouth={jiuhuMouth} />}
          </LandmarkPlacement>
        </group>
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
