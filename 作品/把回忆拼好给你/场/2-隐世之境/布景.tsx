// 第 15 句重逢这一场的布景：隐世之境一楼（西门推开）、门光、窗外的归隐之地，她和别的东西作为 children 放进同一个坐标系（网格本地）。
// 布景本身不转坐标：放进 rotation [−π/2, 0, 0] 的 group（三渲二画布已经套好这个 group，直接当 children）。
// 画布、机位由用的地方给（第一人称机位、手、聊天栏这些不在这里）。灯光先用一楼现成的那套看构图；套进三渲二平涂时传 灯光={false}（平涂不吃灯）。
import React, { useMemo } from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { standPose, type FigurePose } from '@库/角色/骨架.tsx';
import { magicalWineFoxLookAt } from '@库/角色/魔法酒狐.tsx';
import { eyePos } from '../../地点/机位.tsx';
import { lampBox } from '../../地点/灯盒.ts';
import { FirstFloorLighting, hallLamps } from '../../地点/隐世之境一楼.tsx';
import { mainHall, mainHallDoors, openDoorOpening, HiddenWorldDoors } from '../../地点/隐世之境主厅门.tsx';
import { lightDir, DoorLight, type DoorLightParams as DoorLightParams } from '../../特效/门光.tsx';
import { headTurnRange, liYing, doorOpen, cameraRig, hiddenLandPalette, doorLightParams } from './参数.ts';
import { OutsideCherryGrove } from './窗外.tsx';

/** 你站在门口时的眼睛（原版眼高 1.62） */
export const doorwayEye: V3 = eyePos(cameraRig.feet);

/** 她的站姿（脚底、身子朝向）；头往哪看另给，见 她看你 */
export const liYingPose: FigurePose = { ...standPose(liYing.feet), yaw: liYing.bodyFacing };

/** 她的头往 眼 看：[俯仰, 左右]（度，正 = 抬头、往她左边）。左右就是头比身子多转的角，超出 头转范围 的上限就夹住（差的那几度看上去还是在看你） */
export const liYingLookAt = (eye: V3 = doorwayEye, pose: FigurePose = liYingPose): [number, number] => {
  const [pitch, yaw] = magicalWineFoxLookAt(pose, eye, '站');
  const limit = headTurnRange[1];
  return [pitch, Math.max(-limit, Math.min(limit, yaw))];
};

/** 你推门进来的那扇门（西门），门光从它的门洞照进来；台面是地毯 */
export const entranceDoor = mainHallDoors.westDoor;
export const doorLightSurfaces = [mainHall.carpet] as const;

export const HiddenLandReunionBackdrop: React.FC<{
  /** 西门开多少（0～1），默认 参数 开门；门光的亮度跟着乘（推门那一下光跟着门缝变亮） */
  开?: number;
  /** 眼睛在哪（交给门光，光带朝它转；布景不画光带） */
  眼?: V3;
  /** 歌上的秒（浮尘飘） */
  sec?: number;
  /** 换掉一楼现成的灯；false = 不放灯（三渲二平涂不受光） */
  lighting?: React.ReactNode | false;
  doorLight?: boolean;
  /** 换一套门光参数（核对里比较用），不给就是 参数 的 门光参数 */
  doorLightParams?: DoorLightParams;
  outsideView?: boolean;
  children?: React.ReactNode;
}> = ({ 开: openAmount = doorOpen, 眼: eye = doorwayEye, sec: sec = 0, lighting, doorLight: hasDoorLight = true, doorLightParams: lightParams = doorLightParams, outsideView = true, children }) => {
  // 门没开到底时门扇斜在门洞里，光只从门扇外沿到门框那一截进来
  const opening = useMemo(() => openDoorOpening(entranceDoor, openAmount, lightDir(lightParams.azimuthDeg, lightParams.elevationDeg)), [openAmount, lightParams]);
  return (
    <>
      {lighting === undefined ? <FirstFloorLighting /> : lighting || null}
      <HiddenWorldDoors 开={{ westDoor: openAmount }} />
      {outsideView && <OutsideCherryGrove />}
      {hasDoorLight && openAmount > 0 && opening && (
        <DoorLight params={lightParams} opening={opening} ledges={doorLightSurfaces} 眼={eye} sec={sec} brightness={openAmount} lightBand={false} />
      )}
      {children}
    </>
  );
};

/** 封面帧的机位（透视，形状同三渲二的 透视机位参数）：你站在门口往屋里看 */
export const doorwayRig = { kind: '透视' as const, 眼: doorwayEye, 看: cameraRig.看, fov: cameraRig.fov };

/** 主厅点着的灯笼、蜡烛（[x0, y0, z0, x1, y1, z1]，网格本地，收紧到灯本身，见 地点/灯盒.ts）：三渲二平涂的 发光区 用，里面不乘整体色调 */
export const reunionGlowRegions: readonly (readonly number[])[] = hallLamps.filter((l) => l.lit).map(lampBox);

/** 画布背景：归隐之地的天色 */
export const skyColor = hiddenLandPalette.天;
