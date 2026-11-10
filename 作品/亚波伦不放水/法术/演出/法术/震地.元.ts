// 震地（goety:quaking_focus → QuakingSpell）的元数据和排位。出处见 震地.tsx。
import { 定义法术元, type 点 } from '../接口.ts';

/** 默认 range 12：第 i 刻震到施法者前方第 i 格（i = 0～12） */
export const 震射程 = 12;
/** 三列：正前方和左右各偏 1.5 格 */
export const 震侧偏 = [0, 1.5, -1.5] as const;
/** 弹起的方块最多活的刻数（popUp 给得大时），收尾留的余量 */
const 块余刻 = 12;

const 时长 = (起点: 点, 目标: 点) => {
  const 距 = Math.round(Math.hypot(目标[0] - 起点[0], 目标[1] - 起点[1]));
  return { 长秒: (震射程 + 块余刻) / 20, ...(距 <= 震射程 ? { 命中秒: 距 / 20 } : {}) };
};

// distance % 4 == 0 的那几刻（0、4、8、12），三列各响一组 WALL_ERUPT + DIRT_DEBRIS + GENERIC_EXPLODE（音高 0.8～1.2）；这里每刻记一组
const 响刻 = [0, 4, 8, 12];
export default 定义法术元({
  id: 'quaking',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  声音: 响刻.flatMap((刻) => [
    { 资产: '音效/诡厄巫法/goety.wall_erupt.1', 秒: 刻 / 20 },
    { 资产: '音效/诡厄巫法/goety.dirt_debris.1', 秒: 刻 / 20 },
    { 资产: '音效/entity.generic.explode.1', 秒: 刻 / 20 },
  ]),
});
