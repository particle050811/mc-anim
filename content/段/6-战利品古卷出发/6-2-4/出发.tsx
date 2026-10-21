// 6-2-4 出发：基地工坊 + 李樱、九胡、扫帚，按 编排.ts 组装，挂上这一段的配乐（帧 0 = 29.1，后一半从切点淡入一拍）。
// 台词和音效：
// - 台词：九胡「哔↗哔↘，九胡导航持续为您服务。」，开口在下面 `lineCues`；说话时嘴按配音张合（src/lib/口型.ts）。
// - 唤出扫帚（`beats.唤出`）：车万女仆 `ItemBroom.useOn` 放扫帚实体时 level.playSound(null, 扫帚位置, SoundEvents.WOOL_PLACE, BLOCKS, 0.75, 0.8)。
// - 游戏里没有声音、所以不加的：递指南针、跨上扫帚（`EntityBroom` 骑上去不放声音，只有被打掉时的 getHitSound = 羊毛破坏声）、扫帚离地、转向、冲出门、往上窜（扫帚飞行没有声音）；两人跳上扫帚（玩家跳跃没有声音）。
// - 配乐（段配乐）原样不动；音效、台词直接叠在上面，不压配乐。
// 整个房间连人带扫帚放在一个 group 里，按 编排.ts 的 ROOM 摆在基地小岛上（模型/场景/基地小岛.tsx），窗外是导入的真实地形；
// 灯、天空、刀鞘都用 6-2-5 那一套（只读 import），末帧（草束盖满画面）和 6-2-5 首帧逐像素一样（为什么见 编排.ts 文件头）。
import { ThreeCanvas } from '@remotion/three';
import { canvasDpr } from '../../../../engine/core/渲染级别.ts';
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { rad } from '../../../../engine/anim/anim.ts';
import { FlightFog, FlightRig, FlightSky } from '../../../../world/地点/飞行镜头.tsx';
import { SegmentMusic } from '../../../../world/配乐/配乐音轨.tsx';
import { rng, type V3 } from '../../../../engine/model/parts.tsx';
import { GameSoundTrack, type SoundCue } from '../../../../engine/audio/游戏音效.tsx';
import { LineTrack } from '../../../../engine/audio/台词轨.tsx';
import { mouthAt } from '../../../../world/角色/口型.ts';
import { Jiuhu } from '../../../../world/角色/九胡.tsx';
import { LiYing } from '../../../../world/角色/李樱.tsx';
import { RideBroom } from '../../../../world/角色/骑扫帚.tsx';
import { StructureCompass } from '../../../../world/物品/结构指南针.tsx';
import { JiuhuHandCompass } from '../../../../world/角色/九胡持指南针.tsx';
import { ScreenAo } from '../../../../engine/voxel/屏幕AO.tsx';
import { BaseWorkshop } from '../../../../world/地点/基地工坊.tsx';
import { BaseIslandTerrain } from '../../../../world/地点/基地小岛.tsx';
import { sheath } from '../../../../world/地点/边城/6-2-5/飞越主世界.tsx';
import * as choreo from './编排.ts';

export const SET_OFF_FRAMES = choreo.FRAMES;

// 唤出扫帚：ItemBroom.useOn 的 playSound(WOOL_PLACE, 0.75, 0.8)，位置是扫帚实体（冒出来那一帧的扫帚位置）。
export const sounds: SoundCue[] = [
  { 名: '唤出扫帚', 事件: 'block.wool.place', 档: '中', 帧: choreo.beats.summon, 位置: choreo.toWorld(choreo.broom(choreo.beats.summon).位置) as V3, 音量: 0.75, 音高: 0.8, 选: rng(6204)() },
];
// 九胡坐稳、搂住李樱的腰就开口（用户 10-17：出发时给九胡一句，场与场之间不冷场）
export const lineCues = [{ id: '6-2-4-九胡-导航', 帧: choreo.beats.seated + 4 }];
const listener = (f: number) => choreo.camera(Math.min(Math.max(Math.round(f), 0), choreo.beats.lastFrame)).pos as V3;

export const SetOff: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const cam = choreo.camera(frame);
  const broomState = choreo.broom(frame);
  const riders = choreo.riders(frame);
  const ly = choreo.liyingOnFoot(frame);
  const jh = choreo.jiuhuOnFoot(frame);
  const cp = choreo.compass(frame);
  const jiuhuMouth = mouthAt(lineCues, '九胡', frame);
  return (
    <AbsoluteFill>
      <ThreeCanvas width={width} height={height} gl={{ antialias: true, logarithmicDepthBuffer: true }} dpr={canvasDpr(1)}>
        <FlightFog visibility={choreo.VISIBILITY} />
        <FlightRig c={cam} near={0.02} />
        <ScreenAo />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <FlightSky camPos={cam.pos} />
          <BaseIslandTerrain camPos={cam.pos} />
          <group position={choreo.ROOM.origin} rotation={[0, 0, rad(choreo.ROOM.heading)]}>
            <BaseWorkshop t={frame / 24} exterior={false} />
            {broomState.appear > 0 && (
              <RideBroom
                pos={broomState.位置}
                yaw={broomState.朝向}
                pitch={broomState.pitch}
                roll={broomState.roll}
                broom={{ appear: broomState.appear }}
                liYing={riders.liYing ? { ...riders.liYing, hipItem: sheath } : false}
                jiuhu={riders.jiuhu ? { ...riders.jiuhu, 嘴: jiuhuMouth, 右手: <JiuhuHandCompass ride /> } : riders.jiuhu}
              />
            )}
            {ly && <LiYing pose={ly} hipL={sheath} />}
            {jh && <Jiuhu pose={jh.pose} tail={jh.tail} bend={jh.bend} 嘴={jiuhuMouth} 骨骼={jh.bones} />}
            {cp && (
              // 先平托在李樱手上（表盘朝上、贴图上方朝北），递过去以后握在九胡手上；指针停在 0。上了扫帚以后挂在 RideBroom 九胡的右手上
              <group position={cp.pos as [number, number, number]} quaternion={cp.quat} scale={cp.scale}>
                <StructureCompass />
              </group>
            )}
          </group>
        </group>
      </ThreeCanvas>
      <SegmentMusic segmentId={choreo.segmentId} />
      <GameSoundTrack sounds={sounds} listener={listener} />
      <LineTrack 句们={lineCues} />
    </AbsoluteFill>
  );
};
