// 潮涌（goety:tidal_focus）的元数据和弹道。出处见 tidal.tsx。
import { 定义法术元, type 点 } from '../接口.ts';
import { 减, 加, 乘, 单位, 长, type 弹道 } from '../零件/弹道.ts';

/** 浪从施法者脚下贴地出发：片里取 起点 正下方的地面 */
export const 潮涌起 = (起点: 点, 目标: 点): 点 => [起点[0], 起点[1], 目标[2]];
/**
 * TidalSurge（AbstractWave）：每刻 速 = 速 × 0.9 + 方向 × (f² × 0.2)，f = min(活跃刻 ÷ 10, 1)，再 × 0.99；寿命 = floor(距离) + 10。
 * 到寿命或撞到人就停下拍 10 刻（slam），再 10 刻缩没（waveScale 每刻 − 0.1）。返回弹道、停下的刻。
 */
export const 潮涌道 = (起点: 点, 目标: 点): { 道: 弹道; 停刻: number } => {
  const 起 = 潮涌起(起点, 目标);
  const 向 = 单位(减(目标, 起));
  const 寿命 = Math.floor(长(减(目标, 起))) + 10;
  const 表: 点[] = [起];
  let 速: 点 = [0, 0, 0];
  let 停刻 = 寿命;
  for (let n = 0; n < 寿命; n++) {
    const f = Math.min(n / 10, 1);
    速 = 乘(加(乘(速, 0.9), 乘(向, f * f * 0.2)), 0.99);
    表.push(加(表[n]!, 速));
    if (长(减(目标, 表[n + 1]!)) < 1) {
      停刻 = n + 1;
      break;
    }
  }
  return { 道: (n) => 表[Math.min(表.length - 1, Math.max(0, Math.floor(n)))]!, 停刻 };
};

const 时长 = (起点: 点, 目标: 点) => {
  const 命中秒 = 潮涌道(起点, 目标).停刻 / 20;
  return { 长秒: 命中秒 + 1, 命中秒 };
};

export default 定义法术元({
  id: 'tidal',
  ...时长([-10, 0, 7], [0, 0, 0]),
  时长,
  // TidalSpell：PLAYER_SPLASH_HIGH_SPEED；浪每 5 刻一声 GENERIC_SWIM 音量 0.15（没记）
  声音: [{ 资产: '音效/entity.player.splash.high_speed', 秒: 0 }],
});
