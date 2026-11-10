// 散射（goety:scatter_focus → ScatterSpell）的元数据和摆位。出处见 散射.tsx。
import { 定义法术元, type 点 } from '../接口.ts';

/** 三颗地雷：施法者正前、右、左各 4 格（水平），落到地面 */
export const 地雷位 = (起点: 点, 目标: 点): 点[] => {
  const [dx, dy] = [目标[0] - 起点[0], 目标[1] - 起点[1]];
  const 长 = Math.hypot(dx, dy) || 1;
  const [fx, fy] = [dx / 长, dy / 长];
  // 场景坐标 Z 朝上：面朝 (fx, fy) 时右手边是 (fy, −fx)
  return [
    [起点[0] + fx * 4, 起点[1] + fy * 4, 目标[2]],
    [起点[0] + fy * 4, 起点[1] - fx * 4, 目标[2]],
    [起点[0] - fy * 4, 起点[1] + fx * 4, 目标[2]],
  ];
};
/**
 * 游戏里地雷放下 20 刻后有敌人走进 0.6 格就炸，没人踩就等 10 秒（200 刻）到点自己炸。
 * 片里没人去踩，等 10 秒太长，自己定成第 60 刻炸（不是游戏里的数）。
 */
export const 地雷引爆刻 = 60;
/** 引爆后 growTick 1→5，4 刻里胀大变淡再消失 */
export const 地雷胀刻 = 4;

export default 定义法术元({
  id: 'scatter',
  长秒: (地雷引爆刻 + 40) / 20,
  // SoundUtil.playRedstoneMineLoad（三颗各响一遍，这里记一遍）：BOMB_LOAD（音高 1.2～1.5）、REDSTONE_GOLEM_ELECTRIC_SPARKS（音高 2）、BOMB_SPAWN（音高 1.3～1.6）；
  // finalizeExplosion：REDSTONE_EXPLODE（音量 4、音高约 0.7）
  声音: [
    { 资产: '音效/诡厄巫法/goety.bomb_load', 秒: 0, 音高: 1.35 },
    { 资产: '音效/诡厄巫法/goety.redstone_golem_electric_sparks.1', 秒: 0, 音高: 2 },
    { 资产: '音效/诡厄巫法/goety.bomb_spawn.1', 秒: 0, 音高: 1.45 },
    { 资产: '音效/诡厄巫法/goety.redstone_explode.1', 秒: 地雷引爆刻 / 20, 音量: 4, 音高: 0.7 },
  ],
});
