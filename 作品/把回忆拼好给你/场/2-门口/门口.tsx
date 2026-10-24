// 门口这一场的画布：后面一张 2D 的天（地点/天空.tsx），前面三渲二画布（平涂、正交像素机位带俯角、描边，背景透明）里放小木屋，
// 角色放 children（Z 朝上，坐标同 地点/门口小木屋.tsx；要描边的自己包 <描边>），气泡、聊天栏放 叠层。整片后期在段里包在最外面。
import React from 'react';
import { 三渲二画布 } from '@engine/三渲二/画布.tsx';
import type { 调子 } from '@engine/三渲二/调子.ts';
import { 侧机位 } from '../../地点/侧剖面.tsx';
import { 侧剖面天空 } from '../../地点/天空.tsx';
import type { 天弧 as 天弧类型 } from '../../地点/天体.ts';
import { 门口小木屋, type 门口小木屋属性 } from '../../地点/门口小木屋.tsx';
import { 描边 as 描边默认 } from '../../画风.ts';
import { 色板, type 调子名 } from '../../色板.ts';
import { 取景 as 默认取景, 天色, 正交顶面, 白天刻, 默认天弧, 群系, type 门口取景 } from './参数.ts';

const 乘色 = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(Math.min(255, v * k)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

export type 门口画布属性 = 门口小木屋属性 & {
  /** 画布的页面尺寸（成片 scale 2），要偶数；半屏给 宽 640 和 半屏取景(1280, …) */
  宽?: number;
  高?: number;
  /** 默认整屏取景（参数.ts）；半屏用 半屏取景(…) */
  取景?: 门口取景;
  /** 斜投影俯角（画风.ts 的 正交顶面）；0 = 纯侧面 */
  顶面?: number;
  /** 游戏刻（地点/天体.ts：0 日出、6000 正午、18000 午夜，可以超过 24000 往后数天），天色和太阳月亮跟着走；默认 白天刻 */
  刻?: number;
  /** 太阳月亮走的弧；null 不画太阳月亮。默认 参数.ts 的 默认天弧（跟着取景和画布大小算） */
  弧?: 天弧类型 | null;
  /** 天随昼夜变暗的程度（0～1） */
  明暗幅度?: number;
  /** 3D 的调子（色板.ts 的名字，或 插调子 插出来的）：平涂色调、描边色从这里取；天不用调子的，另画。默认 夏日白天 */
  调子?: 调子名 | 调子;
  /** 再乘在平涂色调上的亮度（sRGB 乘数）：夜里压暗方块和角色，发光的（火把）不乘 */
  亮度?: number;
  /** 画在三维画布上面的 2D 叠层（气泡、聊天栏），坐标是这块画布的页面坐标（地点/侧剖面.tsx 的 侧投影 算，顶面要同一个） */
  叠层?: React.ReactNode;
  /** 三维的场景内容：角色等 */
  children?: React.ReactNode;
};

/** 一块 宽 × 高 的定位容器：天、三维、叠层三层叠在一起 */
export const 门口画布: React.FC<门口画布属性> = ({
  宽 = 1280,
  高 = 720,
  取景 = 默认取景,
  顶面 = 正交顶面,
  刻 = 白天刻,
  弧,
  明暗幅度,
  调子: 调 = '夏日白天',
  亮度 = 1,
  叠层,
  children,
  群系: 群 = 群系,
  ...屋
}) => {
  if (宽 % 2 || 高 % 2) throw new Error(`门口画布的宽高要是偶数：${宽}×${高}`);
  const 天体弧 = 弧 === null ? undefined : (弧 ?? 默认天弧(取景, 宽, 高));
  const t = typeof 调 === 'string' ? 色板[调] : 调;
  return (
    <div style={{ position: 'relative', width: 宽, height: 高, overflow: 'hidden' }}>
      <侧剖面天空 取景={取景} 宽={宽} 高={高} 色={天色} 刻={刻} 弧={天体弧} 明暗幅度={明暗幅度} />
      <三渲二画布
        宽={宽}
        高={高}
        机位={侧机位(取景, 顶面)}
        色调={乘色(t.色调, 亮度)}
        描边={描边默认.开 ? { 宽: 描边默认.宽, 色: t.描边 } : false}
        style={{ position: 'absolute', left: 0, top: 0 }}
      >
        <门口小木屋 {...屋} 群系={群} />
        {children}
      </三渲二画布>
      {叠层}
    </div>
  );
};
