// 第 15 句重逢这一场的布景：隐世之境一楼（西门推开）、门光、窗外的归隐之地，她和别的东西作为 children 放进同一个坐标系（网格本地）。
// 布景本身不转坐标：放进 rotation [−π/2, 0, 0] 的 group（三渲二画布已经套好这个 group，直接当 children）。
// 画布、机位由用的地方给（第一人称机位、手、聊天栏这些不在这里）。灯光先用一楼现成的那套看构图；套进三渲二平涂时传 灯光={false}（平涂不吃灯）。
import React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { standPose, type FigurePose } from '@库/角色/骨架.tsx';
import { magicalWineFoxLookAt } from '@库/角色/魔法酒狐.tsx';
import { 眼位 } from '../../地点/机位.tsx';
import { 一楼灯光, 主厅灯 } from '../../地点/隐世之境一楼.tsx';
import { 主厅, 主厅门们, 隐世之境一楼开门 } from '../../地点/隐世之境主厅门.tsx';
import { 门光, type 人影, type 门光参数 as 门光参数类 } from '../../特效/门光.tsx';
import { 头转范围, 她, 开门, 机位, 归隐之地, 门光参数 } from './参数.ts';
import { 窗外樱花林 } from './窗外.tsx';

/** 你站在门口时的眼睛（原版眼高 1.62） */
export const 门口眼: V3 = 眼位(机位.脚);

/** 她的站姿（脚底、身子朝向）；头往哪看另给，见 她看你 */
export const 她姿势: FigurePose = { ...standPose(她.脚), yaw: 她.身子朝向 };

/** 她的头往 眼 看：[俯仰, 左右]（度，正 = 抬头、往她左边）。左右就是头比身子多转的角，超出 头转范围 的上限就夹住（差的那几度看上去还是在看你） */
export const 她看你 = (眼: V3 = 门口眼, 姿势: FigurePose = 她姿势): [number, number] => {
  const [俯仰, 左右] = magicalWineFoxLookAt(姿势, 眼, '站');
  const 上限 = 头转范围[1];
  return [俯仰, Math.max(-上限, Math.min(上限, 左右))];
};

/** 你推门进来的那扇门（西门），门光从它的门洞照进来；台面是地毯 */
export const 进门 = 主厅门们.西门;
export const 门光台面 = [主厅.地毯] as const;

/** 你自己挡在门口投下的影子（站在 机位.脚，原版玩家 1.8 格高）。封面帧不放：西门只有 1 格宽，亮带差不多整条被影子盖掉，只剩两道毛边 */
export const 你的影子: 人影 = { 脚: [机位.脚[0], 机位.脚[1]], 高: 1.8 };

export const 隐世之境重逢布景: React.FC<{
  /** 西门开多少（0～1），默认 参数 开门；门光的亮度跟着乘（推门那一下光跟着门缝变亮） */
  开?: number;
  /** 眼睛在哪（光带朝它转） */
  眼?: V3;
  /** 歌上的秒（浮尘飘） */
  秒?: number;
  /** 换掉一楼现成的灯；false = 不放灯（三渲二平涂不受光） */
  灯光?: React.ReactNode | false;
  门光?: boolean;
  /** 门光的光带（镜头站在门洞里时默认关，见 参数 门光参数.光带） */
  光带?: boolean;
  /** 换一套门光参数（核对里比较用），不给就是 参数 的 门光参数 */
  门光参数?: 门光参数类;
  /** 地块里挖出你的影子 */
  影子?: boolean;
  窗外?: boolean;
  children?: React.ReactNode;
}> = ({ 开 = 开门, 眼 = 门口眼, 秒 = 0, 灯光, 门光: 有门光 = true, 光带 = false, 门光参数: 光参 = 门光参数, 影子 = false, 窗外 = true, children }) => (
  <>
    {灯光 === undefined ? <一楼灯光 /> : 灯光 || null}
    <隐世之境一楼开门 开={{ 西门: 开 }} />
    {窗外 && <窗外樱花林 />}
    {有门光 && 开 > 0 && (
      <门光 参数={光参} 洞={进门.洞} 台面们={门光台面} 眼={眼} 秒={秒} 人影={影子 ? 你的影子 : undefined} 亮={开} 光带={光带} />
    )}
    {children}
  </>
);

/** 封面帧的机位（透视，形状同三渲二的 透视机位参数）：你站在门口往屋里看 */
export const 门口机位 = { 种: '透视' as const, 眼: 门口眼, 看: 机位.看, 视角: 机位.视角 };

/** 主厅的灯笼、点着的蜡烛各占的那一格（[x0, y0, z0, x1, y1, z1]，网格本地）：三渲二平涂的 发光区 用，里面不乘整体色调 */
export const 重逢发光区: readonly (readonly number[])[] = 主厅灯
  .filter((l) => l.点着)
  .map(({ 位: [x, y, z] }) => [x - 0.5, y - 0.5, z, x + 0.5, y + 0.5, z + 1]);

/** 画布背景：归隐之地的天色 */
export const 天色 = 归隐之地.天;
