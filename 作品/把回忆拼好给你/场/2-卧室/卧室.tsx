// 卧室这一场的画布：三渲二画布（平涂、正交像素机位带俯角、描边）里放小木屋卧室和窗光，背景就是后窗里、屋外那一小截看得见的天色。
// 角色放 children（Z 朝上，坐标同 地点/小木屋卧室布局.ts；要描边的自己包 <描边>）。整片后期、歌词在段里包。
import type React from 'react';
import { 三渲二画布 } from '@engine/三渲二/画布.tsx';
import type { 调子 } from '@engine/三渲二/调子.ts';
import { 侧机位, type 侧取景 } from '../../地点/侧剖面.tsx';
import { 小木屋卧室 } from '../../地点/小木屋卧室.tsx';
import { 描边 as 描边默认 } from '../../画风.ts';
import { 卧室取景, 卧室描边宽, 卧室顶面, type 窗光档 } from './参数.ts';
import { 窗光 } from './窗光.tsx';

export type 卧室画布属性 = {
  宽?: number;
  高?: number;
  /** 默认 参数.ts 的 卧室取景（N = 22）；结尾下沉时段里传挪过的 */
  取景?: 侧取景;
  顶面?: number;
  /** 3D 的调子：平涂色调、描边色从这里取 */
  调子: 调子;
  /** 背景（后窗里、屋外的天）；默认用调子的天 */
  天?: string;
  /** 这一档窗光；null = 没有光斑 */
  光: 窗光档;
  描边宽?: number;
  children?: React.ReactNode;
};

export const 卧室画布: React.FC<卧室画布属性> = ({ 宽 = 1280, 高 = 720, 取景 = 卧室取景, 顶面 = 卧室顶面, 调子: t, 天, 光, 描边宽 = 卧室描边宽, children }) => (
  <div style={{ position: 'relative', width: 宽, height: 高, overflow: 'hidden' }}>
    <三渲二画布 宽={宽} 高={高} 机位={侧机位(取景, 顶面)} 天={天 ?? t.天} 色调={t.色调} 描边={描边默认.开 ? { 宽: 描边宽, 色: t.描边 } : false}>
      <小木屋卧室 />
      {光 && <窗光 方向={光.方向} 倍={光.倍} />}
      {children}
    </三渲二画布>
  </div>
);
