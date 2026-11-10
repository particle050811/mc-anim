// 丁组用的几种模组粒子类（贴图序列是 anim extract --粒子帧 照粒子定义 textures 顺序生成的 粒子帧/ 模块）和出生时的初速。
// 都是 TextureSheetParticle 的子类，物理走 粒子.tsx 的 贴图粒子；这里只填构造函数里的常数。
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import type { 点 } from '../接口.ts';
import { 原版粒子初速, type 粒子出生, type 粒子类 } from './粒子.tsx';
import 霜新星帧 from '../../../粒子帧/goety/frost_nova.ts';
import 大火帧 from '../../../粒子帧/goety/big_fire.ts';
import 云片帧 from '../../../粒子帧/goety/spell_cloud.ts';
import 方块帧 from '../../../粒子帧/goety/spell_square.ts';
import 地火帧 from '../../../粒子帧/goety/big_fire_ground.ts';
import 火柱帧 from '../../../粒子帧/goety/fiery_pillar.ts';
import 燃烧帧 from '../../../粒子帧/goety/burning.ts';
import 雨滴帧 from '../../../粒子帧/minecraft/rain.ts';
import 霜花帧 from '../../../粒子帧/goety_revelation/frost_flower.ts';
// 落尘照手抄的 generic_0～7：原版 falling_dust.json 是 7→0（看过的画面为准，没跟定义）
import 沙0 from 'asset:贴图/特效/粒子/generic_0';
import 沙1 from 'asset:贴图/特效/粒子/generic_1';
import 沙2 from 'asset:贴图/特效/粒子/generic_2';
import 沙3 from 'asset:贴图/特效/粒子/generic_3';
import 沙4 from 'asset:贴图/特效/粒子/generic_4';
import 沙5 from 'asset:贴图/特效/粒子/generic_5';
import 沙6 from 'asset:贴图/特效/粒子/generic_6';
import 沙7 from 'asset:贴图/特效/粒子/generic_7';

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
  帧: 霜新星帧,
  选帧: '随机',
  摩擦: 0.96,
  大小: (年龄, 寿命) => 1 - (年龄 / 寿命) ** 2 * 0.5,
};

/** BIG_FIRE：FireParticle，半边长 × 3，寿命 8，不碰撞、不透明、贴图按年龄；ReversibleParticle 随机左右翻转这里没做 */
export const 大火类: 粒子类 = {
  帧: 大火帧,
  选帧: '按年龄',
  摩擦: 0.96,
};
export const 大火寿命 = 8;

/** SPELL_SQUARE：贴图是 particle/trail，摩擦 0.96、重力 −0.1（往上飘），透明度 1 − 年龄 ÷ 寿命，满亮度半透明 */
export const 方块类: 粒子类 = {
  帧: 方块帧,
  选帧: '按年龄',
  摩擦: 0.96,
  重力: -0.1,
  混合: '半透明',
  透明度: (年龄, 寿命) => 1 - Math.min(1, Math.max(0, 年龄 / 寿命)),
};

/** SPELL_CLOUD：FireParticle.ColorProvider，半边长 × 3、寿命 8、不动、不透明，颜色给定；贴图 spell_cloud_0～11 按年龄 */
export const 云片类: 粒子类 = {
  帧: 云片帧,
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
  帧: 雨滴帧,
  选帧: '随机',
  重力: 1.5,
  摩擦: 0.98,
  色: [0.2, 0.3, 1],
};

/** BIG_FIRE_GROUND：FireParticle（半边长 × 3、寿命 8、不动），贴图 big_fire_ground_1～8 按年龄，不透明 */
export const 地火类: 粒子类 = {
  帧: 地火帧,
  选帧: '按年龄',
  摩擦: 0.96,
};

/** FIERY_PILLAR：半边长出生 0.4～0.65，之后每刻 1.0 + 年龄比 × 0.5；摩擦 0.99，寿命 10～29；半透明满亮度；贴图 big_fire_drop_1～8 按年龄 */
export const 火柱类: 粒子类 = {
  帧: 火柱帧,
  选帧: '按年龄',
  摩擦: 0.99,
  混合: '半透明',
  大小: (年龄, 寿命) => (1 + (年龄 / 寿命) * 0.5) / 1,
};

/** FROST_FLOWER（启示录 FrostFlowerParticle）：generic_7→0 按年龄，重力 0.225、每刻速度 ×(0.95, 0.9, 0.95)（这里并成一个 0.92），
 * 半边长 0.1 × (随机² + 1)，寿命 (int)(16 ÷ (随机 × 0.8 + 0.2)) + 2，色基本是 (0.69, 0.87, 0.9)（渲染时按年龄夹到 0.55/0.77/0.98，夹法写反了，只剩这一档），
 * 透明度前 8 刻淡入。没做：每刻绕圈抖 1/32 格。 */
export const 霜花类: 粒子类 = {
  帧: 霜花帧,
  选帧: '按年龄',
  重力: 0.225,
  摩擦: 0.92,
  色: [0.69, 0.88, 0.9],
  透明度: (年龄) => Math.min(1, 年龄 / 8),
};

/** BURNING（goety 注册成 FlameParticle.Provider，贴图 minecraft:lava）：摩擦 0.96、不动重力，半边长随年龄 × (1 − 年龄比² × 0.5)，寿命 (int)(8 ÷ (随机 × 0.8 + 0.2)) + 4，不透明 */
export const 燃烧类: 粒子类 = {
  帧: 燃烧帧,
  选帧: '按年龄',
  摩擦: 0.96,
  大小: (年龄, 寿命) => 1 - (年龄 / 寿命) ** 2 * 0.5,
};
