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
