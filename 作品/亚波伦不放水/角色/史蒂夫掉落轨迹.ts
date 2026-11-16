// 史蒂夫死后散落物品的轨迹（纯模块；照原版 1.20.1 的扔法和 ItemEntity.tick，说明见 史蒂夫掉落.tsx 文件头）。
// 画面（史蒂夫掉落.tsx）和第 5 幕的编排（场/1-台地/击败拍.ts 让她落脚躲开地上的东西）共用这一份。
import { mulberry32 } from '@engine/core/数学.ts';
import type { V3 } from '@engine/model/parts.tsx';

export type DropTrack = { lane: V3[]; phaseRad: number };
/** 本片史蒂夫死后掉几件（史蒂夫掉落.tsx 的 史蒂夫掉落件 一一对应） */
export const steveDropCount = 8;

/** 件数 件物品从死的那一刻起每刻的位置（第 0 项是出生位置）。脚底：人的脚底中心；眼高：物品出在眼高下 0.3 格；地面：落到这个高度停（不给 = 脚底的高度）；刻数：算多少刻 */
export const deathDropTrack = (feet: V3, itemCount: number, seed: number, options: { 眼高: number; ground?: number; 刻数?: number }): DropTrack[] => {
  const { 眼高: eyeHeight, ground = feet[2], 刻数: tickCount = 200 } = options;
  const rand = mulberry32(seed * 69621 + 7);
  return Array.from({ length: itemCount }, () => {
    const f = rand() * 0.5;
    const a = rand() * Math.PI * 2;
    const phaseRad = rand() * Math.PI * 2;
    // 游戏 (x, y, z) → 场景 (x, z 水平, y 竖直)
    let [x, y, z] = [feet[0], feet[1], feet[2] + eyeHeight - 0.3];
    let [vx, vy, vz] = [-Math.sin(a) * f, Math.cos(a) * f, 0.2];
    const trail: V3[] = [[x, y, z]];
    let landed = false;
    for (let k = 0; k < tickCount; k++) {
      vz -= 0.04;
      x += vx;
      y += vy;
      z += vz;
      if (z <= ground) {
        z = ground;
        vz = 0;
        landed = true;
      } else landed = false;
      const drag = landed ? 0.6 * 0.98 : 0.98;
      vx *= drag;
      vy *= drag;
      vz *= 0.98;
      trail.push([x, y, z]);
    }
    return { lane: trail, phaseRad };
  });
};
