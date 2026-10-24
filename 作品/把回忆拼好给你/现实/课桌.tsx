// 第 13 句分屏现实那半（右屏）：高三教室靠墙的一张课桌，按 MC 方块搭（放进 现实画布，三渲二平涂、正交侧剖面机位朝北，同分屏另一半的门口）。
// 墙是白色混凝土粉末（像刷过的灰墙），桌面是白桦木台阶，桌肚里暗；墙上物品展示框里挂着整张课表，桌上立着倒计时日历。布局在 课桌布局.ts。
// 只画物件、没有人（用户 10-24「手和铅笔盒显然也多余了」）。纯按 props 画，不读帧号。
import type React from 'react';
import { 方块拼搭, type 方块 } from '@engine/model/方块拼搭.tsx';
import { 描边 } from '@engine/三渲二/描边.tsx';
import { 课桌, 摆放 } from './课桌布局.ts';
import { 像素空间 } from './像素块.tsx';
import { 日历本 } from './日历本.tsx';
import type { 飞页 } from './日历.ts';
import { 课表, type 亮格 } from './课表.tsx';

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
  /** 日历最上面那页的天数（现实/日历.ts 的 日历数） */
  日历: number;
  /** 还在空中的日历纸 */
  飞?: readonly 飞页[];
  /** 课表哪几格亮、亮多少 */
  亮格?: readonly 亮格[];
  /** 斜投影里往里一个贴图像素画面上升几个（正交顶面 / N），给日历本排飞纸 */
  斜: number;
};

export const 现实课桌: React.FC<现实课桌参数> = ({ 日历, 飞, 亮格, 斜 }) => {
  const { 倍, ...课表位 } = 摆放.课表;
  return (
    <>
      <方块拼搭 方块们={方块们} />
      <像素空间 位={[0, 0, 0]}>
        <group position={[课表位.x, 课表位.y, 课表位.z]} scale={倍}>
          <课表 x={0} y={0} z={0} 亮格={亮格} />
        </group>
        <描边>
          <日历本 {...摆放.日历} 顶={日历} 飞={飞} 斜={斜} />
        </描边>
      </像素空间>
    </>
  );
};
