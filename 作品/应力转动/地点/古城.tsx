// 古城（远古城市 minecraft:ancient_city）的夜视灯光，古城4x 的画面和 6-3-下坠 共用。
// 夜视（用户 10-02 嫌古城太黑）：一律按夜视药水画——光照亮度拉满、颜色照常。灯光见 `GuchengLight`：和地标场景同一套日光 + 天光 + 环境光但不投影（地下有洞顶，投影会整座城在阴影里），面朝向明暗和烘进去的环境光遮蔽照旧；幽匿块发光点、灵魂灯保留贴图本色。
import React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
// 夜视下的灯：日光从东南高处来（和地标场景同一套强度），不投影；地下没有天，天光的地面色压低一点让顶面和底面分得开
export const GUCHENG_SUN: V3 = [0.45, -0.55, 0.7];
export const GuchengLight: React.FC<{ brightness?: number }> = ({ brightness = 1 }) => (
  <>
    <directionalLight position={GUCHENG_SUN} intensity={3.2 * brightness} color="#fffaf0" />
    <hemisphereLight args={['#e8f0ff', '#5a5f66', 1.3 * brightness]} position={[0, 0, 1]} />
    <ambientLight intensity={0.7 * brightness} />
  </>
);
