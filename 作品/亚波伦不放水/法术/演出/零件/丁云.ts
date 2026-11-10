// 冰雹云、季风云（AbstractSpellCloud）每刻放的粒子：云面上的 SPELL_CLOUD，和激活后从云底落下的雨/尘。出处 goety 2.5.60.6：AbstractSpellCloud.cloudParticles、rainParticles。
// 中心 = 云所在的点；半径 = 云半径。每刻 π × 半径² 颗（k < π r²，所以多一颗取整），圆盘上均匀撒点（sqrt 取半径）。
import { rng } from '@engine/model/parts.tsx';
import type { 点 } from '../接口.ts';
import type { 色 } from './材质.ts';
import { 默认半径, 云片寿命 } from './丁粒子.ts';
import type { 粒子出生 } from './粒子.tsx';

const 圆盘点 = (r: () => number, 中心: 点, 半径: number): 点 => {
  const 角 = r() * Math.PI * 2;
  const 远 = Math.sqrt(r()) * 半径;
  return [中心[0] + Math.cos(角) * 远, 中心[1] + Math.sin(角) * 远, 中心[2]];
};
const 颗数 = (半径: number) => Math.ceil(Math.PI * 半径 * 半径);

/** 云面 SPELL_CLOUD：从刻 0 到 止刻（不含）每刻放；色 = 颜色参数 × 速度 0.5 */
export const 云面们 = (种子: number, 中心: 点, 半径: number, 止刻: number, 色: 色): 粒子出生[] => {
  const r = rng(种子);
  const 出生们: 粒子出生[] = [];
  for (let t = 0; t < 止刻; t++) {
    for (let k = 0; k < 颗数(半径); k++) {
      出生们.push({ 刻: t, 位: 圆盘点(r, 中心, 半径), 速: [(r() - 0.5) * 0.01, (r() - 0.5) * 0.01, (r() - 0.5) * 0.01], 寿命: 云片寿命, 半径: 默认半径(r) * 3, 色, 种子: Math.floor(r() * 1e9) });
    }
  }
  return 出生们;
};

/** 落尘（雪块的 FALLING_DUST）：寿命 (int)(32 ÷ (随机 × 0.8 + 0.2)) × 0.9，颜色 0.6～1.0 × 0.8～1.0 的灰白 */
export const 落尘们 = (种子: number, 中心: 点, 半径: number, 起刻: number, 止刻: number): 粒子出生[] => {
  const r = rng(种子);
  const 出生们: 粒子出生[] = [];
  for (let t = 起刻; t < 止刻; t++) {
    for (let k = 0; k < 颗数(半径); k++) {
      const 亮 = (r() * 0.4 + 0.6) * (r() * 0.2 + 0.8);
      出生们.push({ 刻: t, 位: 圆盘点(r, 中心, 半径), 寿命: Math.floor(Math.floor(32 / (r() * 0.8 + 0.2)) * 0.9), 半径: 默认半径(r) * 0.675, 色: [亮, 亮, 亮], 种子: Math.floor(r() * 1e9) });
    }
  }
  return 出生们;
};

/** 雨滴（RAIN）：寿命 (int)(8 ÷ (随机 × 0.8 + 0.2))；水平速度几乎 0，竖直先往上 0.1～0.3（WaterDropParticle 的构造） */
export const 雨滴们 = (种子: number, 中心: 点, 半径: number, 起刻: number, 止刻: number): 粒子出生[] => {
  const r = rng(种子);
  const 出生们: 粒子出生[] = [];
  for (let t = 起刻; t < 止刻; t++) {
    for (let k = 0; k < 颗数(半径); k++) {
      出生们.push({ 刻: t, 位: 圆盘点(r, 中心, 半径), 速: [(r() - 0.5) * 0.02, (r() - 0.5) * 0.02, r() * 0.2 + 0.1], 寿命: Math.floor(8 / (r() * 0.8 + 0.2)), 半径: 默认半径(r), 种子: Math.floor(r() * 1e9) });
    }
  }
  return 出生们;
};
