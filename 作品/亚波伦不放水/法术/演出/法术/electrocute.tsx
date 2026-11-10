// 电刑。出处 goety 2.5.60.6：ElectrocuteSpell、ElectroOrb（SpellThrowableProjectile）、ElectroOrbRenderer。
// - 弹：朝镜头的方片，边长 1 格 × (1 + f1)，f1 = sin(年龄 ÷ 5) × 0.2 + 0.2（一胀一缩），中心抬 0.25 格；贴图 electro_orb 横排 16 帧，每刻一帧；entityTranslucent。
// - 弹道：出手 0.66 格/刻。游戏里有目标时每刻往目标加速（方向 ÷ 距离² × 0.2，各轴钳 ±0.25），目标不动时就是一条直线，加速这里没算（最后一两格会快一点）。
// - 命中：游戏里只有一声 THUNDERBOLT。冲击波环（Shockwave）、球爆、REDSTONE_EXPLODE 声只在配风暴法杖时才有，配下界魔杖没有——和分镜写的「炸出一圈电环」对不上，照游戏没画。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 弹道位置 } from '../零件/弹道.ts';
import { 面片 } from '../零件/面片.tsx';
import 元, { 电刑命中刻, 电刑道 } from './electrocute.元.ts';
import 球图 from 'asset:贴图/法术/goety/entity/projectiles/electro_orb';

const 电刑: React.FC<法术演出属性> = ({ 秒, 起点, 目标 }) => {
  const 刻 = 秒 * 20;
  if (刻 >= 电刑命中刻(起点, 目标)) return null;
  const p = 弹道位置(电刑道(起点, 目标), 刻);
  const 倍 = 1 + Math.sin(刻 / 5) * 0.2 + 0.2;
  const u = (Math.floor(刻) % 16) / 16;
  return <面片 图={png(球图)} 位={[p[0], p[1], p[2] + 0.25 * 倍]} 半宽={0.5 * 倍} uv={[u, 0, u + 1 / 16, 1]} 混合="半透明" />;
};

export default 定义法术演出(元, 电刑);
