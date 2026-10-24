// 门口这一场的画布：正交侧机位 + 原版明暗灯 + 天 + 小木屋，角色等放 children（Z 朝上的 group 里，坐标同 地点/门口小木屋.tsx）。
// 三渲二的平涂（engine/三渲二/，另一路在做）好了以后，把 门口内容 和角色一起套进 <平涂> 就行，机位、取景不用动。
import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { 出片倍数, 原版明暗灯, 正交侧机位, type 侧取景 } from '../../地点/侧剖面.tsx';
import { 侧剖面天空 } from '../../地点/天空.tsx';
import type { 天弧 as 天弧类型 } from '../../地点/天体.ts';
import { 门口小木屋, type 门口小木屋属性 } from '../../地点/门口小木屋.tsx';
import { 取景 as 整屏取景, 天弧, 天色, 白天刻, 群系 } from './参数.ts';

export type 门口内容属性 = 门口小木屋属性 & {
  取景?: 侧取景;
  /** 游戏刻（地点/天体.ts），天色和太阳月亮跟着走；默认 白天刻 */
  刻?: number;
  /** 太阳月亮走的弧；null 不画太阳月亮。默认 参数.ts 的 天弧，圆心挪到取景中线，横半径收到画面半宽减一格以内（半屏时压成椭圆） */
  弧?: 天弧类型 | null;
  /** 天随昼夜变暗的程度（0～1） */
  明暗幅度?: number;
  /** 方块、角色整体亮度（sRGB 乘数，夜里压暗用） */
  亮度?: number;
};

/** 画布里面的东西（Z 朝上的 group），给要自己包 ThreeCanvas 的地方用 */
export const 门口内容: React.FC<门口内容属性 & { children?: React.ReactNode }> = ({ 取景 = 整屏取景, 刻 = 白天刻, 弧, 明暗幅度, 亮度, children, 群系: 群 = 群系, ...屋 }) => {
  const 页宽 = useThree((s) => s.size.width);
  const 半宽 = (页宽 * 出片倍数) / 取景.每格 / 2;
  const 天体弧 = 弧 === null ? undefined : (弧 ?? { 心: [取景.中心[0], 天弧.心[1]] as const, 半径: 天弧.半径, 横半径: Math.min(天弧.半径, 半宽 - 1) });
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <原版明暗灯 亮度={亮度} />
      <侧剖面天空 {...取景} 色={天色} 刻={刻} 弧={天体弧} 明暗幅度={明暗幅度} />
      <门口小木屋 {...屋} 群系={群} />
      {children}
    </group>
  );
};

/** 宽高是页面像素（成片 scale 2）；半屏给 宽 640 和 半屏取景(1280, …) */
export const 门口画布: React.FC<门口内容属性 & { 宽?: number; 高?: number; children?: React.ReactNode }> = ({ 宽 = 1280, 高 = 720, 取景 = 整屏取景, ...rest }) => (
  <ThreeCanvas orthographic flat width={宽} height={高} gl={{ antialias: false }}>
    <正交侧机位 {...取景} />
    <门口内容 取景={取景} {...rest} />
  </ThreeCanvas>
);
