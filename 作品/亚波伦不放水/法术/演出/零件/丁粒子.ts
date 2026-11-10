// 丁组用的几种模组粒子类（贴图序列照 数据/法术/goety/particles/*.json 的 textures 顺序）和出生时的初速。
// 都是 TextureSheetParticle 的子类，物理走 粒子.tsx 的 贴图粒子；这里只填构造函数里的常数。
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import type { 点 } from '../接口.ts';
import { 原版粒子初速, type 粒子出生, type 粒子类 } from './粒子.tsx';
import 霜1 from 'asset:贴图/法术/goety/particle/frost_1';
import 霜2 from 'asset:贴图/法术/goety/particle/frost_2';
import 霜3 from 'asset:贴图/法术/goety/particle/frost_3';
import 霜4 from 'asset:贴图/法术/goety/particle/frost_4';
import 霜5 from 'asset:贴图/法术/goety/particle/frost_5';
import 霜6 from 'asset:贴图/法术/goety/particle/frost_6';
import 火1 from 'asset:贴图/法术/goety/particle/big_fire_1';
import 火2 from 'asset:贴图/法术/goety/particle/big_fire_2';
import 火3 from 'asset:贴图/法术/goety/particle/big_fire_3';
import 火4 from 'asset:贴图/法术/goety/particle/big_fire_4';
import 火5 from 'asset:贴图/法术/goety/particle/big_fire_5';
import 火6 from 'asset:贴图/法术/goety/particle/big_fire_6';
import 火7 from 'asset:贴图/法术/goety/particle/big_fire_7';
import 火8 from 'asset:贴图/法术/goety/particle/big_fire_8';
import 云0 from 'asset:贴图/法术/goety/particle/spell_cloud_0';
import 云1 from 'asset:贴图/法术/goety/particle/spell_cloud_1';
import 云2 from 'asset:贴图/法术/goety/particle/spell_cloud_2';
import 云3 from 'asset:贴图/法术/goety/particle/spell_cloud_3';
import 云4 from 'asset:贴图/法术/goety/particle/spell_cloud_4';
import 云5 from 'asset:贴图/法术/goety/particle/spell_cloud_5';
import 云6 from 'asset:贴图/法术/goety/particle/spell_cloud_6';
import 云7 from 'asset:贴图/法术/goety/particle/spell_cloud_7';
import 云8 from 'asset:贴图/法术/goety/particle/spell_cloud_8';
import 云9 from 'asset:贴图/法术/goety/particle/spell_cloud_9';
import 云10 from 'asset:贴图/法术/goety/particle/spell_cloud_10';
import 云11 from 'asset:贴图/法术/goety/particle/spell_cloud_11';
import 沙0 from 'asset:贴图/特效/粒子/generic_0';
import 沙1 from 'asset:贴图/特效/粒子/generic_1';
import 沙2 from 'asset:贴图/特效/粒子/generic_2';
import 沙3 from 'asset:贴图/特效/粒子/generic_3';
import 沙4 from 'asset:贴图/特效/粒子/generic_4';
import 沙5 from 'asset:贴图/特效/粒子/generic_5';
import 沙6 from 'asset:贴图/特效/粒子/generic_6';
import 沙7 from 'asset:贴图/特效/粒子/generic_7';
import 溅0 from 'asset:贴图/特效/粒子/splash_0';
import 溅1 from 'asset:贴图/特效/粒子/splash_1';
import 溅2 from 'asset:贴图/特效/粒子/splash_2';
import 溅3 from 'asset:贴图/特效/粒子/splash_3';
import 地火1 from 'asset:贴图/法术/goety/particle/big_fire_ground_1';
import 地火2 from 'asset:贴图/法术/goety/particle/big_fire_ground_2';
import 地火3 from 'asset:贴图/法术/goety/particle/big_fire_ground_3';
import 地火4 from 'asset:贴图/法术/goety/particle/big_fire_ground_4';
import 地火5 from 'asset:贴图/法术/goety/particle/big_fire_ground_5';
import 地火6 from 'asset:贴图/法术/goety/particle/big_fire_ground_6';
import 地火7 from 'asset:贴图/法术/goety/particle/big_fire_ground_7';
import 地火8 from 'asset:贴图/法术/goety/particle/big_fire_ground_8';
import 火柱1 from 'asset:贴图/法术/goety/particle/big_fire_drop_1';
import 火柱2 from 'asset:贴图/法术/goety/particle/big_fire_drop_2';
import 火柱3 from 'asset:贴图/法术/goety/particle/big_fire_drop_3';
import 火柱4 from 'asset:贴图/法术/goety/particle/big_fire_drop_4';
import 火柱5 from 'asset:贴图/法术/goety/particle/big_fire_drop_5';
import 火柱6 from 'asset:贴图/法术/goety/particle/big_fire_drop_6';
import 火柱7 from 'asset:贴图/法术/goety/particle/big_fire_drop_7';
import 火柱8 from 'asset:贴图/法术/goety/particle/big_fire_drop_8';
import 带图 from 'asset:贴图/法术/goety/particle/trail';

/** RisingParticle / FireParticle 的构造：先过 Particle 的随机速度，再 × 0.01 + 给定速度；位置抖 ±0.05（RisingParticle 才抖）。位、速都是场景坐标 */
export const 上升初值 = (种子: number, 位: 点, 给定速: 点, 抖位 = true): { 位: 点; 速: 点; 种子: number } => {
  const r = rng(种子);
  // 游戏坐标 [x, y 竖直, z 南] = 场景 [x, z, −y]
  const [gx, gy, gz] = 原版粒子初速(r, 给定速[0], 给定速[2], -给定速[1]);
  const d = (): number => (抖位 ? (r() - r()) * 0.05 : 0);
  return {
    位: [位[0] + d(), 位[1] + d(), 位[2] + d()],
    速: [gx * 0.01 + 给定速[0], -gz * 0.01 + 给定速[1], gy * 0.01 + 给定速[2]],
    种子: 种子 * 31 + 7,
  };
};

/** vanilla 的 Particle 默认 quadSize = 0.1 × (rand × 0.5 + 0.5) × 2 */
export const 默认半径 = (r: () => number): number => 0.1 * (r() * 0.5 + 0.5) * 2;

/** FROST_NOVA：原版 FlameParticle.Provider + 霜的贴图（frost_1～6 再回 5～1），pickSprite 随机挑一张；大小随寿命缩到一半 */
export const 霜新星类: 粒子类 = {
  帧: [霜1, 霜2, 霜3, 霜4, 霜5, 霜6, 霜5, 霜4, 霜3, 霜2, 霜1].map(png),
  选帧: '随机',
  摩擦: 0.96,
  大小: (年龄, 寿命) => 1 - (年龄 / 寿命) ** 2 * 0.5,
};

/** BIG_FIRE：FireParticle，半边长 × 3，寿命 8，不碰撞、不透明、贴图按年龄；ReversibleParticle 随机左右翻转这里没做 */
export const 大火类: 粒子类 = {
  帧: [火1, 火2, 火3, 火4, 火5, 火6, 火7, 火8].map(png),
  选帧: '按年龄',
  摩擦: 0.96,
};
export const 大火寿命 = 8;

/** SPELL_SQUARE：贴图是 particle/trail，摩擦 0.96、重力 −0.1（往上飘），透明度 1 − 年龄 ÷ 寿命，满亮度半透明 */
export const 方块类: 粒子类 = {
  帧: [png(带图)],
  选帧: '按年龄',
  摩擦: 0.96,
  重力: -0.1,
  混合: '半透明',
  透明度: (年龄, 寿命) => 1 - Math.min(1, Math.max(0, 年龄 / 寿命)),
};

/** SPELL_CLOUD：FireParticle.ColorProvider，半边长 × 3、寿命 8、不动、不透明，颜色给定；贴图 spell_cloud_0～11 按年龄 */
export const 云片类: 粒子类 = {
  帧: [云0, 云1, 云2, 云3, 云4, 云5, 云6, 云7, 云8, 云9, 云10, 云11].map(png),
  选帧: '按年龄',
  摩擦: 0.96,
};
export const 云片寿命 = 8;

/** FALLING_DUST（方块粒子）：generic_0～7 按年龄，每刻竖直 −0.003（游戏里下限 −0.14，这里没封），不吃摩擦，颜色出生时定，半边长 × 0.675 */
export const 落尘类 = (地面: number): 粒子类 => ({
  帧: [沙0, 沙1, 沙2, 沙3, 沙4, 沙5, 沙6, 沙7].map(png),
  选帧: '按年龄',
  重力: 0.075,
  摩擦: 1,
  地面,
});

/** RAIN（WaterDropParticle）：splash_0～3 随机一张，每刻竖直 −0.06（它自己的 tick 直接减 gravity，不乘 0.04，所以这里重力写 1.5），蓝色 (0.2, 0.3, 1.0)，出生竖直速度 0.1～0.3 */
export const 雨滴类: 粒子类 = {
  帧: [溅0, 溅1, 溅2, 溅3].map(png),
  选帧: '随机',
  重力: 1.5,
  摩擦: 0.98,
  色: [0.2, 0.3, 1],
};

/** BIG_FIRE_GROUND：FireParticle（半边长 × 3、寿命 8、不动），贴图 big_fire_ground_1～8 按年龄，不透明 */
export const 地火类: 粒子类 = {
  帧: [地火1, 地火2, 地火3, 地火4, 地火5, 地火6, 地火7, 地火8].map(png),
  选帧: '按年龄',
  摩擦: 0.96,
};

/** FIERY_PILLAR：半边长出生 0.4～0.65，之后每刻 1.0 + 年龄比 × 0.5；摩擦 0.99，寿命 10～29；半透明满亮度；贴图 big_fire_drop_1～8 按年龄 */
export const 火柱类: 粒子类 = {
  帧: [火柱1, 火柱2, 火柱3, 火柱4, 火柱5, 火柱6, 火柱7, 火柱8].map(png),
  选帧: '按年龄',
  摩擦: 0.99,
  混合: '半透明',
  大小: (年龄, 寿命) => (1 + (年龄 / 寿命) * 0.5) / 1,
};
