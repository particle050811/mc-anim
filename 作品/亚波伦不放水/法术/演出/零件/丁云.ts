// 冰雹云、季风云（AbstractSpellCloud）每刻放的粒子：云面上的 SPELL_CLOUD，和激活后从云底落下的雨/尘。出处 goety 2.5.60.6：AbstractSpellCloud.cloudParticles、rainParticles。
// 中心 = 云所在的点；半径 = 云半径。每刻 π × 半径² 颗（k < π r²，所以多一颗取整），圆盘上均匀撒点（sqrt 取半径）。
import type { Vec3 } from '../接口.ts';
import type { RgbColor } from './材质.ts';
import { defaultRadius, cloudPieceLifetime } from './丁粒子.ts';
import type { ParticleBirth } from './粒子.tsx';
import { mulberry32 } from '@engine/core/数学.ts';

const diskPoint = (r: () => number, center: Vec3, radius: number): Vec3 => {
  const angle = r() * Math.PI * 2;
  const dist = Math.sqrt(r()) * radius;
  return [center[0] + Math.cos(angle) * dist, center[1] + Math.sin(angle) * dist, center[2]];
};
const particleCount = (radius: number) => Math.ceil(Math.PI * radius * radius);

/** 云面 SPELL_CLOUD：从刻 0 到 止刻（不含）每刻放；色 = 颜色参数 × 速度 0.5 */
export const cloudFaceSpawns = (seed: number, center: Vec3, radius: number, endTick: number, color: RgbColor): ParticleBirth[] => {
  const r = mulberry32(seed);
  const spawns: ParticleBirth[] = [];
  for (let t = 0; t < endTick; t++) {
    for (let k = 0; k < particleCount(radius); k++) {
      spawns.push({ 刻: t, 位: diskPoint(r, center, radius), 速: [(r() - 0.5) * 0.01, (r() - 0.5) * 0.01, (r() - 0.5) * 0.01], 寿命: cloudPieceLifetime, radius: defaultRadius(r) * 3, 色: color, seed: Math.floor(r() * 1e9) });
    }
  }
  return spawns;
};

/** 落尘（雪块的 FALLING_DUST）：寿命 (int)(32 ÷ (随机 × 0.8 + 0.2)) × 0.9，颜色 0.6～1.0 × 0.8～1.0 的灰白 */
export const fallingDustSpawns = (seed: number, center: Vec3, radius: number, startTick: number, endTick: number): ParticleBirth[] => {
  const r = mulberry32(seed);
  const spawns: ParticleBirth[] = [];
  for (let t = startTick; t < endTick; t++) {
    for (let k = 0; k < particleCount(radius); k++) {
      const brightness = (r() * 0.4 + 0.6) * (r() * 0.2 + 0.8);
      spawns.push({ 刻: t, 位: diskPoint(r, center, radius), 寿命: Math.floor(Math.floor(32 / (r() * 0.8 + 0.2)) * 0.9), radius: defaultRadius(r) * 0.675, 色: [brightness, brightness, brightness], seed: Math.floor(r() * 1e9) });
    }
  }
  return spawns;
};

/** 雨滴（RAIN）：寿命 (int)(8 ÷ (随机 × 0.8 + 0.2))；水平速度几乎 0，竖直先往上 0.1～0.3（WaterDropParticle 的构造） */
export const raindropSpawns = (seed: number, center: Vec3, radius: number, startTick: number, endTick: number): ParticleBirth[] => {
  const r = mulberry32(seed);
  const spawns: ParticleBirth[] = [];
  for (let t = startTick; t < endTick; t++) {
    for (let k = 0; k < particleCount(radius); k++) {
      spawns.push({ 刻: t, 位: diskPoint(r, center, radius), 速: [(r() - 0.5) * 0.02, (r() - 0.5) * 0.02, r() * 0.2 + 0.1], 寿命: Math.floor(8 / (r() * 0.8 + 0.2)), radius: defaultRadius(r), seed: Math.floor(r() * 1e9) });
    }
  }
  return spawns;
};
