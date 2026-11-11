// 史蒂夫死后散落物品的轨迹（纯模块；照原版 1.20.1 的扔法和 ItemEntity.tick，说明见 史蒂夫掉落.tsx 文件头）。
// 画面（史蒂夫掉落.tsx）和第 5 幕的编排（场/1-台地/击败拍.ts 让她落脚躲开地上的东西）共用这一份。
import { mulberry32 } from '@engine/core/数学.ts';
import type { V3 } from '@engine/model/parts.tsx';

export type 掉落轨迹 = { 路: V3[]; 相位: number };
/** 本片史蒂夫死后掉几件（史蒂夫掉落.tsx 的 史蒂夫掉落件 一一对应） */
export const 史蒂夫掉落件数 = 8;

/** 件数 件物品从死的那一刻起每刻的位置（第 0 项是出生位置）。脚底：人的脚底中心；眼高：物品出在眼高下 0.3 格；地面：落到这个高度停（不给 = 脚底的高度）；刻数：算多少刻 */
export const 死亡掉落轨迹 = (脚底: V3, 件数: number, 种子: number, 选项: { 眼高: number; 地面?: number; 刻数?: number }): 掉落轨迹[] => {
  const { 眼高, 地面 = 脚底[2], 刻数 = 200 } = 选项;
  const rand = mulberry32(种子 * 69621 + 7);
  return Array.from({ length: 件数 }, () => {
    const f = rand() * 0.5;
    const a = rand() * Math.PI * 2;
    const 相位 = rand() * Math.PI * 2;
    // 游戏 (x, y, z) → 场景 (x, z 水平, y 竖直)
    let [x, y, z] = [脚底[0], 脚底[1], 脚底[2] + 眼高 - 0.3];
    let [vx, vy, vz] = [-Math.sin(a) * f, Math.cos(a) * f, 0.2];
    const 路: V3[] = [[x, y, z]];
    let 着地 = false;
    for (let k = 0; k < 刻数; k++) {
      vz -= 0.04;
      x += vx;
      y += vy;
      z += vz;
      if (z <= 地面) {
        z = 地面;
        vz = 0;
        着地 = true;
      } else 着地 = false;
      const 阻 = 着地 ? 0.6 * 0.98 : 0.98;
      vx *= 阻;
      vy *= 阻;
      vz *= 0.98;
      路.push([x, y, z]);
    }
    return { 路, 相位 };
  });
};
