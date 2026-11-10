// 水柱（goety:water_jet_focus）的元数据。出处见 水柱.tsx。
import { 定义法术元, type 点 } from '../接口.ts';

/** 游戏里按住多久放多久；片里水柱开这么多刻（自己定的） */
export const 水柱持续刻 = 50;
/** 水柱打在目标半身高（WaterJetRenderer：目标位置 + 身高 ÷ 2） */
export const 水柱落点 = (目标: 点): 点 => [目标[0], 目标[1], 目标[2] + 0.9];

export default 定义法术元({
  id: 'water_jet',
  // 水柱关掉之后，最后几滴水拖还要十几刻才落地
  长秒: (水柱持续刻 + 20) / 20,
  命中秒: 0,
  // WaterJetSpell.loopSound：WATER_JET 循环着响（这里只在开头放一次，循环由段里定）
  声音: [{ 资产: '音效/诡厄巫法/goety.water_jet', 秒: 0 }],
});
