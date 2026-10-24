// 第 13 句左屏的现实：高三教室靠墙的一张课桌，按 MC 方块搭（放进 现实画布，三渲二平涂、正交侧剖面机位朝北，同右屏门口）。
// 墙是白色混凝土粉末（像刷过的灰墙），桌面是白桦木台阶，桌肚里暗；墙上物品展示框里挂着课表，桌上立着撕页倒计时、玻璃笔筒。布局在 课桌布局.ts。
// 只画物件，人只露一只手（撕页手.tsx，另放）。纯按 props 画，不读帧号。
import type React from 'react';
import { 方块拼搭, type 方块 } from '@engine/model/方块拼搭.tsx';
import { 描边 } from '@engine/三渲二/描边.tsx';
import { 课桌, 摆放 } from './课桌布局.ts';
import { 像素空间 } from './像素块.tsx';
import { 撕页本 } from './撕页本.tsx';
import { 笔筒 } from './笔筒.tsx';
import { 课表, type 亮格 } from './课表.tsx';
import { 笔筒满度, 默认页们 } from './撕页.ts';

export type { 亮格 };

/** 亮度档（sRGB 数值乘）：桌肚里背板最暗、底板次之（侧视里分得出里外）。Agent 暂定 */
export const 课桌亮度 = { 桌肚背: 0.4, 桌肚底: 0.55 } as const;

const 课桌方块 = (): 方块[] => {
  const out: 方块[] = [];
  const 放 = (状态: string, i: number, j: number, k: number, 亮?: number) => out.push({ 状态, 位: [i, j, k], 亮 });
  const { 深, 左, 右, 桌肚深, 桌肚底, 墙顶 } = 课桌;
  for (let i = 左; i < 右; i++) {
    for (let k = 0; k < 墙顶; k++) 放('minecraft:white_concrete_powder', i, 深, k);
    for (let j = 0; j < 深; j++) 放('minecraft:birch_slab[type=top]', i, j, -1);
    // 桌肚：背板立在 j = 桌肚深，底板一层上半砖；前面敞着
    for (let k = 桌肚底 + 1; k < -1; k++) 放('minecraft:birch_planks', i, 桌肚深, k, 课桌亮度.桌肚背);
    for (let j = 0; j < 桌肚深; j++) 放('minecraft:birch_slab[type=top]', i, j, 桌肚底, 课桌亮度.桌肚底);
  }
  return out;
};
const 方块们 = 课桌方块();

export type 现实课桌参数 = {
  /** 撕页进度（撕页.ts）：整数 k 停在 页们[k]，小数是正在撕 */
  翻页: number;
  页们?: readonly number[];
  /** 笔筒满度 0～1；不给就跟着翻页走（笔筒满度） */
  笔芯?: number;
  /** 课表哪几格亮、亮多少 */
  亮格?: readonly 亮格[];
  /** 撕页本右下角翻起多大（贴图像素），手捏着的时候翻；不给按撕页本的默认 */
  翻角?: number;
};

export const 现实课桌: React.FC<现实课桌参数> = ({ 翻页, 页们 = 默认页们, 笔芯, 亮格, 翻角 }) => {
  const 满度 = 笔芯 ?? 笔筒满度(翻页, 页们.length);
  return (
    <>
      <方块拼搭 方块们={方块们} />
      <像素空间 位={[0, 0, 0]}>
        <课表 {...摆放.课表} 亮格={亮格} />
        <描边>
          <撕页本 {...摆放.撕页本} 翻页={翻页} 页们={页们} 翻角={翻角} />
          <笔筒 {...摆放.笔筒} 满度={满度} />
        </描边>
      </像素空间>
    </>
  );
};
