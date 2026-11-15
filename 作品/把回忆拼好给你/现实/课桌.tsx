// 第 13 句分屏现实那半（右屏）：高三教室靠墙的一张课桌，按 MC 方块搭（放进 现实画布，三渲二平涂、正交侧剖面机位朝北，同分屏另一半的门口）。
// 墙是白色混凝土粉末（像刷过的灰墙），桌面是白桦木台阶，桌肚里暗；墙上物品展示框里挂着整张课表，桌上立着倒计时日历。布局在 课桌布局.ts。
// 只画物件、没有人（用户 10-24「手和铅笔盒显然也多余了」）。纯按 props 画，不读帧号。
import type React from 'react';
import { BlockAssembly, type PlacedBlock } from '@engine/model/方块拼搭.tsx';
import { Outline } from '@engine/三渲二/描边.tsx';
import { desk, placement } from './课桌布局.ts';
import { PixelSpace } from './像素块.tsx';
import { CalendarBook } from './日历本.tsx';
import type { FlyingPage } from './日历.ts';
import { Timetable, type LitCell } from './课表.tsx';

export type { LitCell };

/** 亮度档（sRGB 数值乘）：桌肚里背板最暗、底板次之（侧视里分得出里外）。Agent 暂定 */
export const deskBrightness = { deskBellyBack: 0.4, deskBellyBottom: 0.55 } as const;

const deskBlocks = (): PlacedBlock[] => {
  const out: PlacedBlock[] = [];
  const placeBlock = (blockState: string, i: number, j: number, k: number, brightness?: number) => out.push({ 状态: blockState, 位: [i, j, k], brightness });
  const { depth, left, right, deskBellyDepth, deskBellyBottom, wallTop } = desk;
  for (let i = left; i < right; i++) {
    for (let k = 0; k < wallTop; k++) placeBlock('minecraft:white_concrete_powder', i, depth, k);
    for (let j = 0; j < depth; j++) placeBlock('minecraft:birch_slab[type=top]', i, j, -1);
    // 桌肚：背板立在 j = 桌肚深，底板一层上半砖；前面敞着
    for (let k = deskBellyBottom + 1; k < -1; k++) placeBlock('minecraft:birch_planks', i, deskBellyDepth, k, deskBrightness.deskBellyBack);
    for (let j = 0; j < deskBellyDepth; j++) placeBlock('minecraft:birch_slab[type=top]', i, j, deskBellyBottom, deskBrightness.deskBellyBottom);
  }
  return out;
};
const blocks = deskBlocks();

export type RealDeskParams = {
  /** 日历最上面那页的天数（现实/日历.ts 的 日历数） */
  calendar: number;
  /** 还在空中的日历纸 */
  flyPages?: readonly FlyingPage[];
  /** 课表哪几格亮、亮多少 */
  litCells?: readonly LitCell[];
  /** 斜投影里往里一个贴图像素画面上升几个（正交顶面 / N），给日历本排飞纸 */
  oblique: number;
};

export const RealDesk: React.FC<RealDeskParams> = ({ calendar, flyPages, litCells, oblique }) => {
  const { scale, ...timetablePos } = placement.timetable;
  return (
    <>
      <BlockAssembly blocks={blocks} />
      <PixelSpace 位={[0, 0, 0]}>
        <group position={[timetablePos.x, timetablePos.y, timetablePos.z]} scale={scale}>
          <Timetable x={0} y={0} z={0} litCells={litCells} />
        </group>
        <Outline>
          <CalendarBook {...placement.calendarPos} pagesOnTop={calendar} flyPages={flyPages} oblique={oblique} />
        </Outline>
      </PixelSpace>
    </>
  );
};
