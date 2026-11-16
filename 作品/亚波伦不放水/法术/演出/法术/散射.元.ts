// 散射（goety:scatter_focus → ScatterSpell）的元数据和摆位。出处见 散射.tsx。
import { defineSpellMeta, type Vec3 } from '../接口.ts';

/** 三颗地雷：施法者正前、右、左各 4 格（水平），落到地面 */
export const minePositions = (from: Vec3, target: Vec3): Vec3[] => {
  const [dx, dy] = [target[0] - from[0], target[1] - from[1]];
  const vecLength = Math.hypot(dx, dy) || 1;
  const [fx, fy] = [dx / vecLength, dy / vecLength];
  // 场景坐标 Z 朝上：面朝 (fx, fy) 时右手边是 (fy, −fx)
  return [
    [from[0] + fx * 4, from[1] + fy * 4, target[2]],
    [from[0] + fy * 4, from[1] - fx * 4, target[2]],
    [from[0] - fy * 4, from[1] + fx * 4, target[2]],
  ];
};
/**
 * 游戏里地雷放下 20 刻后有敌人走进 0.6 格就炸，没人踩就等 10 秒（200 刻）到点自己炸。
 * 片里没人去踩，等 10 秒太长，自己定成第 60 刻炸（不是游戏里的数）。
 */
export const mineDetonateTick = 60;
/** 引爆后 growTick 1→5，4 刻里胀大变淡再消失 */
export const mineSwellTicks = 4;

export default defineSpellMeta({
  id: 'scatter',
  长秒: (mineDetonateTick + 40) / 20,
  // SoundUtil.playRedstoneMineLoad（三颗各响一遍，这里记一遍）：BOMB_LOAD（音高 1.2～1.5）、REDSTONE_GOLEM_ELECTRIC_SPARKS（音高 2）、BOMB_SPAWN（音高 1.3～1.6）；
  // finalizeExplosion：REDSTONE_EXPLODE（音量 4、音高约 0.7）
  sound: [
    { asset: '音效/诡厄巫法/goety.bomb_load', sec: 0, 音高: 1.35 },
    { asset: '音效/诡厄巫法/goety.redstone_golem_electric_sparks.1', sec: 0, 音高: 2 },
    { asset: '音效/诡厄巫法/goety.bomb_spawn.1', sec: 0, 音高: 1.45 },
    { asset: '音效/诡厄巫法/goety.redstone_explode.1', sec: mineDetonateTick / 20, 音量: 4, 音高: 0.7 },
  ],
});
