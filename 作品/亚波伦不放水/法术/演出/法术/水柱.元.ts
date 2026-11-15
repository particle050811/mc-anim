// 水柱（goety:water_jet_focus）的元数据。出处见 水柱.tsx。
import { defineSpellMeta, type Vec3 } from '../接口.ts';

/** 游戏里按住多久放多久；片里水柱开这么多刻（自己定的） */
export const waterPillarDurTicks = 50;
/** 水柱打在目标半身高（WaterJetRenderer：目标位置 + 身高 ÷ 2） */
export const waterLandPoint = (target: Vec3): Vec3 => [target[0], target[1], target[2] + 0.9];

export default defineSpellMeta({
  id: 'water_jet',
  // 水柱关掉之后，最后几滴水拖还要十几刻才落地
  长秒: (waterPillarDurTicks + 20) / 20,
  hitSec: 0,
  // WaterJetSpell.loopSound：WATER_JET 循环着响（这里只在开头放一次，循环由段里定）
  声音: [{ 资产: '音效/诡厄巫法/goety.water_jet', 秒: 0 }],
});
