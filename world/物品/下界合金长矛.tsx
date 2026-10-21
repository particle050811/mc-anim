// 下界合金长矛：原版 1.21.11 的 minecraft:netherite_spear（游戏是 1.20.1，没有）。模型贴图取自 game/缓存/client-1.21.11.jar（npm run 取材 -- 长矛）。
// 用 item/netherite_spear_in_hand（32×32，矛杆右下到左上斜贯整图）；thirdperson_righthand scale [1.7, 1.7, 0.85]，矛全长约 2.3 格，手握贴图中心。
// 坐标：矛尖朝 +Z，握持点在原点，矛面朝 ±X，单位格。
// 挂到 骑扫帚.tsx 的 `liYing.右手` 用 `SpearInHand`（握持点坐标系是玩家模型像素，要乘 16；玩家 0.9375 倍，矛跟着缩）。
import React from 'react';
import { rad } from '../../engine/anim/anim.ts';
import { ItemSprite } from '../../engine/model/物品贴图.tsx';
import { png } from '../../engine/model/贴图.ts';
import tex from 'asset:贴图/物品/下界合金长矛';

const LAYERS = [{ tex: png(tex) }];
export const SPEAR = {
  scale: 1.7, // spear_in_hand 的 thirdperson 缩放
  // 握持点到矛尖：贴图中心 (16,16) 到矛尖像素 (0.5,0.5) 的对角线
  tip: (15.5 * Math.SQRT2 * 1.7) / 32,
  butt: (15.5 * Math.SQRT2 * 1.7) / 32,
  colors: ['#4a3b3f', '#5d4a4f', '#2b2226', '#7a6670'], // 碎屑、残影取色
};

// 贴图里矛是从右下 (1,-1) 指向左上 (-1,1)：先绕 Z 转 -45° 让矛沿 +Y，绕 X 转 90° 把 +Y 转到 +Z（这时贴图面朝 -Y），再绕矛轴转 90° 让贴图面朝 +X
export const NetheriteSpear: React.FC<{ opacity?: number }> = ({ opacity }) => (
  <group rotation={[0, 0, rad(90)]}>
    <group rotation={[rad(90), 0, 0]}>
      <group rotation={[0, 0, rad(-45)]} scale={[SPEAR.scale, SPEAR.scale, 0.85]}>
        <ItemSprite layers={LAYERS} opacity={opacity} />
      </group>
    </group>
  </group>
);

// 骑扫帚套件的手上：<group quaternion={handAim(姿态, 方向)}><SpearInHand /></group>
export const SpearInHand: React.FC = () => (
  <group scale={16}>
    <NetheriteSpear />
  </group>
);
