// 三叉戟风暴（goety:trident_storm_focus → TridentStormSpell）的元数据和摆位。出处见 三叉戟风暴.tsx。
import { 定义法术元 } from '../接口.ts';

/** summonTridentMinor 的十字摆法：施法者四周各 2.5 格（另一种是四个斜角，二选一随机，片里固定十字） */
export const 戟偏 = [[2.5, 0], [0, 2.5], [-2.5, 0], [0, -2.5]] as const;
/** warmUp 2 秒，每根再各自随机晚 0～60 刻；落下后第 5 刻炸，warmUp + 40 + delay 时消失 */
export const 戟预警刻 = 40;
export const 戟炸隔刻 = 5;
export const 戟留刻 = 40;
export default 定义法术元({
  id: 'trident_storm',
  长秒: (戟预警刻 + 60 + 戟留刻) / 20,
  // 施法声 TRIDENT_STORM_PRE；每根落下时 TRIDENT_STORM_EXPLODE（音量 2、音高 0.85～1.05），时刻随种子变，这里记在最早可能的那一刻
  声音: [
    { 资产: '音效/诡厄巫法/goety.trident_storm_pre.1', 秒: 0 },
    { 资产: '音效/诡厄巫法/goety.trident_storm_explode.1', 秒: 戟预警刻 / 20, 音量: 2, 音高: 0.95 },
  ],
});
