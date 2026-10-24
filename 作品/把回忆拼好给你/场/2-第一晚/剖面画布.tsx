// 第一晚这一场的画布：后面一张 2D 的天（地点/天空.tsx，太阳月亮按刻走），前面三渲二画布（平涂、正交侧剖面带俯角、描边，背景透明）里放地形，
// 角色、掉落物、裂纹、粒子放 children（Z 朝上，坐标同 参数.ts；要描边的自己包 <描边>），聊天栏、死亡画面放在画布外面（界面不跟镜头）。
// 照 场/2-门口/门口.tsx 的 门口画布 写（场之间不互引）。整片后期在段里包在最外面。
import type React from 'react';
import { 方块拼搭, type 方块 } from '@engine/model/方块拼搭.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import { 三渲二画布 } from '@engine/三渲二/画布.tsx';
import type { 调子 } from '@engine/三渲二/调子.ts';
import { 侧机位 } from '../../地点/侧剖面.tsx';
import { 侧剖面天空 } from '../../地点/天空.tsx';
import { 描边 as 描边默认 } from '../../画风.ts';
import { 天色, 正交顶面, 近景, 近景天弧, 远景, 远景天弧 } from './参数.ts';

/** 格原点：格 i 的中心落在 x = i（同 地点/门口小木屋.tsx 的 格原点） */
const 格原点: V3 = [-0.5, 0, 0];
const 群系 = 'minecraft:plains';

export const 机位们 = { 远: { ...远景, 弧: 远景天弧 }, 近: { ...近景, 弧: 近景天弧 } } as const;

export const 剖面画布: React.FC<{
  镜: keyof typeof 机位们;
  /** 天上的游戏刻（地点/天体.ts） */
  刻: number;
  调子: 调子;
  地形: readonly 方块[];
  宽?: number;
  高?: number;
  children?: React.ReactNode;
}> = ({ 镜, 刻, 调子: t, 地形, 宽 = 1280, 高 = 720, children }) => {
  const 机 = 机位们[镜];
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高, overflow: 'hidden' }}>
      <侧剖面天空 取景={机.取景} 宽={宽} 高={高} 色={天色} 刻={刻} 弧={机.弧} />
      <三渲二画布
        宽={宽}
        高={高}
        机位={侧机位(机.取景, 正交顶面)}
        色调={t.色调}
        描边={描边默认.开 ? { 宽: 机.描边宽, 色: t.描边 } : false}
        style={{ position: 'absolute', left: 0, top: 0 }}
      >
        <方块拼搭 方块们={地形} 原点={格原点} 群系={群系} 正面花草 />
        {children}
      </三渲二画布>
    </div>
  );
};
