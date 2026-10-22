// 第 2 场基地谋划 6-2-1～6-2-3 的画面：基地工坊 + 李樱、九胡、桌上的战利品和结构指南针，按 编排.ts 组装，房间摆在基地小岛的真实地形上；
// 上面叠一层游戏界面（模型/界面/：6-2-1 的两页匠魂 JEI——链甲基底、冶炼炉燃料，6-2-2/6-2-3 的古卷铁砧页和思索标注，
// 6-2-3 的结构罗盘搜索界面——这个是游戏里录的整屏界面，连压暗底一起盖满画面），出现的时间在 编排.ts 的 界面()。
// 房间在世界里的摆法、灯、雾、天空、刀鞘全用 6-2-4 那一套（只读 import），6-2-3 末帧和 6-2-4 首帧逐像素一样（那一帧没有界面）。不挂配乐；台词和音效在 声音.tsx（各段的组件里挂）。
// 李樱的台词按配音动嘴（src/lib/口型.ts，开口取 声音.tsx 的 `lineCues`，全局帧）。
import { ThreeCanvas } from '@remotion/three';
import { canvasDpr } from '../../../../engine/core/渲染级别.ts';
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { rad } from '../../../../engine/anim/anim.ts';
import { FlightFog, FlightRig, FlightSky } from '../../../../world/地点/飞行镜头.tsx';
import { Jiuhu } from '../../../../world/角色/九胡.tsx';
import { LiYing } from '../../../../world/角色/李樱.tsx';
import { AlphaYetiFur, FieryBlood } from '../../../../world/物品/战利品.tsx';
import { StructureCompass } from '../../../../world/物品/结构指南针.tsx';
import { ScreenAo } from '../../../../engine/voxel/屏幕AO.tsx';
import { BaseWorkshop } from '../../../../world/地点/基地工坊.tsx';
import { BaseIslandTerrain } from '../../../../world/地点/基地小岛.tsx';
import { sheath } from '../../../../world/地点/边城/6-2-5/飞越主世界.tsx';
import { TomeRecipeWindow } from '../../../../world/界面/古卷.tsx';
import { FuelWindow, MailleWindow } from '../../../../world/界面/匠魂.tsx';
import { CompassUi } from '../../../../world/界面/结构罗盘.tsx';
import * as choreo from './编排.ts';
import { mouthAt } from '../../../../world/配音/口型.ts';
import { lineCues } from './声音.tsx';

const mouthCues = lineCues.map(({ id, frame }) => ({ id, 帧: frame }));

const asV3 = (p: number[]) => p as [number, number, number];
const LOOT_SIZE = 0.5;

export const BasePlanSegment: React.FC<{ segment: choreo.SegmentName }> = ({ segment: segment }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const globalFrame = choreo.segmentTable[segment].起 + frame;
  const cam = choreo.camera(globalFrame);
  const ly = choreo.liying(globalFrame);
  const jh = choreo.jiuhu(globalFrame);
  const blood = choreo.blood(globalFrame);
  const fur = choreo.fur(globalFrame);
  const cp = choreo.compass(globalFrame);
  const t = choreo.gearTime(globalFrame);
  const ui = choreo.uiState(globalFrame);
  const sec = globalFrame / choreo.FPS;
  const liYingMouth = mouthAt(mouthCues, '李樱', globalFrame, choreo.FPS);
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
            {/* 两件战利品都在桌上时交给 BaseWorkshop 画（和 6-2-4 同一段代码），拿在手里时自己画 */}
            <BaseWorkshop t={t} loot={blood.onTable && fur.onTable} exterior={false} />
            {!(blood.onTable && fur.onTable) && (
              <>
                <group position={asV3(blood.pos)} quaternion={blood.quat}>
                  <group scale={LOOT_SIZE}>
                    <FieryBlood />
                  </group>
                </group>
                <group position={asV3(fur.pos)} quaternion={fur.quat}>
                  <group scale={LOOT_SIZE}>
                    <AlphaYetiFur />
                  </group>
                </group>
              </>
            )}
            <group position={asV3(cp.pos)} quaternion={cp.quat}>
              <group scale={choreo.COMPASS_SIZE}>
                <StructureCompass needle={choreo.needle(globalFrame)} />
              </group>
            </group>
            <LiYing pose={ly} hipL={sheath} 嘴={liYingMouth} />
            <Jiuhu pose={jh.pose} tail={jh.tail} bend={jh.bend} gait={jh.gait} run={jh.run} />
          </group>
        </group>
      </ThreeCanvas>
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        {/* 6-2-1：看右手的毛皮 → 左上角（词条提示框在窗口下面）；看左手的血液 → 右上角（JEI 窗口左边还有一列催化剂，留出位置） */}
        <MailleWindow s={2.0} x={16 + 22 * 2.0} y={56} windowVisibility={ui.maille} tooltipVisibility={ui.mailleTooltip} t={sec} />
        <FuelWindow s={2.0} x={width - 198 * 2.0 - 16} y={56} windowVisibility={ui.fuel} t={sec} />
        {/* 6-2-2、6-2-3：人在画面左边，铁砧页和三条标注在右半边（右边那条标注伸出窗口右边约 52 个 GUI 像素） */}
        <TomeRecipeWindow s={2.3} x={width - 250 * 2.3 - 16} y={74} windowVisibility={ui.scroll} labels={ui.labels} t={sec} />
        {/* 6-2-3：俯拍指南针时打开结构罗盘，整屏 */}
        <CompassUi frame={ui.compassUiFrame} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
