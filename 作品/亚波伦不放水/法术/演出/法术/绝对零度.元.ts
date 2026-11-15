// 绝对零度（revelationfix goety_revelation:ice_focus）的元数据和冰矛的摆法。出处见 ice.tsx。
import { mulberry32 } from '@engine/core/数学.ts';
import { defineSpellMeta, type Vec3 } from '../接口.ts';
import { sub, scaleVec, unitVec, parabola } from '../零件/弹道.ts';
import { trajectoryGroundTick } from '../零件/甲/共用.ts';
import type { ArrowRainShot } from '../零件/甲/落雨.ts';

/** 引导放多久：游戏里按住就一直放；片里只放 60 刻（自己定的） */
export const absZeroReleaseTicks = 60;
const domainRadius = 24; // 12 + 下界魔杖 12
const halfSide = domainRadius * 2; // radius4 / 2：x、y、z 各 ±48

/** 每刻 1 颗 IceSpear，生在「施法者头顶天花板」(这里取 脚底 + 15 格，没有天花板) 周围 ±48 格的立方体，朝施法者脚底射，散布 20～30（四分之一的概率几乎不散） */
export const iceSpears = (from: Vec3, seed: number): ArrowRainShot[] => {
  const r = mulberry32(seed * 97 + 5);
  const feet: Vec3 = [from[0], from[1], from[2] - 0.5];
  const spawnCenter: Vec3 = [feet[0], feet[1], feet[2] + 15.5];
  return Array.from({ length: absZeroReleaseTicks }, (_, k) => {
    const spawnJitter = () => (r() * 2 - 1) * halfSide;
    let spawnPos: Vec3 = [spawnCenter[0] + spawnJitter(), spawnCenter[1] + spawnJitter(), spawnCenter[2] + spawnJitter()];
    // 游戏里生在方块里会重抽竖直 ±2；这里地面以下当方块处理
    if (spawnPos[2] < feet[2]) spawnPos = [spawnPos[0], spawnPos[1], spawnCenter[2] + (r() * 4 - 2)];
    let spread = 20 + r() * 10;
    if (r() < 0.25) spread = r();
    const rate = 1.0 + 1.5 * r();
    const dir = unitVec(sub(feet, spawnPos));
    const jitterOffset = 0.0172275 * spread;
    const dirJitter = () => jitterOffset * (r() - r());
    const speedVec = scaleVec(unitVec([dir[0] + dirJitter(), dir[1] + dirJitter(), dir[2] + dirJitter()]), rate);
    const trajectory = parabola(spawnPos, speedVec, { drag: 0.99, 重力: 0.05 });
    return { launchTick: k, spawnPos, trajectory, flightTick: trajectoryGroundTick(trajectory, feet[2], 200) ?? 200 };
  });
};

export default defineSpellMeta({
  id: 'ice',
  长秒: (absZeroReleaseTicks + 60) / 20,
  hitSec: 1,
  // CastingSound frost_prepare_spell；每颗矛 ICE_SPIKE_CAST 音量 2，这里每 5 刻记一声
  声音: [
    { 资产: '音效/诡厄巫法/goety.frost_prepare_spell.1', 秒: 0 },
    ...Array.from({ length: absZeroReleaseTicks / 5 }, (_, k) => ({ 资产: '音效/诡厄巫法/goety.ice_spike_cast', 秒: (k * 5) / 20, 音量: 2 })),
  ],
});
