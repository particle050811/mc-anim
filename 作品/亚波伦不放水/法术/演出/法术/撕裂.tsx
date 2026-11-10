// 撕裂。出处 goety 2.5.60.6：VoidRiftSpell、VoidRift（CastSpellTrap）、VoidRiftRenderer、ServerParticleUtil.gatheringParticles / createParticleBall、ShockwaveParticleOption。
// 裂隙放在目标脚下，一张朝向镜头的方片（实体渲染器：大小 = 4 + 半径加成，激活后 × 1.5；方片 x ∈ [−0.5, 0.5]、y ∈ [−0.25, 0.75] 乘大小）：
// - 预热：贴图 open_1～3 按预热进度三等分；每刻一颗 PORTAL 在裂隙周围随机撒（y + 0.5）；
// - 预热完：激活，换 rift_1，之后每 20 刻往后换一张（rift_1～5）；每刻从边长 2×16 的方框棱上抽 1/25 的点，放 PORTAL 往中心聚（速度 = 偏移 × 0.5）；
// - 时间到：缩回 open_3 合上 20 刻，然后爆：冲击波环（0x7317D2，大小 8，淡出）加一团龙息粒子球（半径 8）。
// 半径加成按 0 算（法术默认）。
// 自己定的：预热 60 刻、张开 60 刻（游戏 115、300）；裂隙占位宽 1 格撒 PORTAL（没查实体碰撞箱）。
// 没做：吸人、拉方块、伤害、SpellExplosion 的击退和虚空侵蚀；爆炸点在地面上 0.5 格；PORTAL 的聚集中心取脚上 1.6 格（眼高没查）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { 冲击波环 } from '../零件/冲击波.tsx';
import { 面片 } from '../零件/面片.tsx';
import { 十六色 } from '../零件/甲/共用.ts';
import { 龙息, 龙息类 } from '../零件/甲/原版粒子.ts';
import { VanillaParticles, type ParticleSpawn, 贴图粒子 } from '../零件/粒子.tsx';
import 元, { 撕裂爆刻, 撕裂预热刻, 撕裂张开刻 } from './撕裂.元.ts';
import 开1 from 'asset:贴图/法术/goety/entity/projectiles/void_rift/open_1';
import 开2 from 'asset:贴图/法术/goety/entity/projectiles/void_rift/open_2';
import 开3 from 'asset:贴图/法术/goety/entity/projectiles/void_rift/open_3';
import 裂1 from 'asset:贴图/法术/goety/entity/projectiles/void_rift/rift_1';
import 裂2 from 'asset:贴图/法术/goety/entity/projectiles/void_rift/rift_2';
import 裂3 from 'asset:贴图/法术/goety/entity/projectiles/void_rift/rift_3';
import 裂4 from 'asset:贴图/法术/goety/entity/projectiles/void_rift/rift_4';
import 裂5 from 'asset:贴图/法术/goety/entity/projectiles/void_rift/rift_5';

const 图们 = [开1, 开2, 开3, 裂1, 裂2, 裂3, 裂4, 裂5].map(png);
const 爆色 = 十六色(7542738);
const 聚范围 = 16;

/** 棱上的点（游戏格子偏移）：gatheringParticles 里 x、y、z 中至少两个等于 ±range 的那些 */
const 棱点们: readonly [number, number, number][] = (() => {
  const 们: [number, number, number][] = [];
  const n = 聚范围;
  for (let x = -n; x <= n; x++) for (let y = -n; y <= n; y++) for (let z = -n; z <= n; z++) {
    const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
    if ((x !== 0 || (ay !== n && az !== n)) && (y !== 0 || (ax !== n && az !== n)) && (z !== 0 || (ax !== n && ay !== n))) continue;
    们.push([x, y, z]);
  }
  return 们;
})();

const 撕裂: React.FC<法术演出属性> = ({ 秒, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 激活 = 刻 >= 撕裂预热刻;
  const 合上 = 刻 >= 撕裂预热刻 + 撕裂张开刻;
  const 炸了 = 刻 >= 撕裂爆刻;
  let 张 = 0;
  if (!激活) 张 = Math.min(2, Math.floor((刻 / 撕裂预热刻) * 3));
  else if (合上) 张 = 2;
  else 张 = 3 + (Math.floor((刻 - 撕裂预热刻) / 20) % 5);
  const 大 = (激活 ? 6 : 4);
  const 心: 点 = [目标[0], 目标[1], 目标[2] + 0.25 * 大];

  // PORTAL：预热期每刻一颗；张开期每刻 1/25 的棱点往中心聚（场景速度 = [x, −z, y] × 0.5，偏移加 [−0.5..0, −2..−1, −0.5..0] 随机）
  const 粒们: ParticleSpawn[] = [];
  const 末 = Math.min(刻, 撕裂爆刻);
  for (let t = 0; t < 末; t++) {
    const r = rng(种子 * 7919 + t);
    if (t < 撕裂预热刻) {
      粒们.push({ 种: 'portal', 刻: t, p: [目标[0] + (r() - 0.5), 目标[1] + (r() - 0.5), 目标[2] + 0.5], v: [0, 0, 0], 种子: 种子 * 31 + t });
    } else if (t < 撕裂预热刻 + 撕裂张开刻) {
      for (const [bx, by, bz] of 棱点们) {
        if (r() >= 1 / 25) continue;
        const f = -0.5 + r();
        const f1 = -2 + r();
        const f2 = -0.5 + r();
        粒们.push({ 种: 'portal', 刻: t, p: [目标[0], 目标[1], 目标[2] + 1.6], v: [(f + bx) * 0.5, -(f2 + bz) * 0.5, (f1 + by) * 0.5], 种子: 种子 * 53 + t * 1009 + 粒们.length });
      }
    }
  }

  // 爆：createParticleBall(龙息, 半径 8)：只有外壳（i 到头才扫满 j、k）
  const 龙们 = React.useMemo(() => {
    const r = rng(种子 * 104729);
    const 出: ReturnType<typeof 龙息>[] = [];
    const 半 = 8;
    const 中: 点 = [目标[0], 目标[1], 目标[2] + 0.5];
    for (let i = -半; i <= 半; i++) for (let j = -半; j <= 半; j++) for (let k = -半; k <= 半; k += (i === -半 || i === 半 || j === -半 || j === 半) ? 1 : 半 * 2) {
      const d3 = j + (r() - r()) * 0.5;
      const d4 = i + (r() - r()) * 0.5;
      const d5 = k + (r() - r()) * 0.5;
      const d6 = Math.sqrt(d3 * d3 + d4 * d4 + d5 * d5) / 0.5 + (r() + r() + r() - 1.5) * 0.1;
      出.push(龙息(r, 撕裂爆刻, 中, [(d3 / d6) * 0.5, -(d5 / d6) * 0.5, (d4 / d6) * 0.5]));
    }
    return 出;
  }, [目标[0], 目标[1], 目标[2], 种子]);

  return (
    <>
      {!炸了 && <面片 图={图们[张]!} 位={心} 半宽={大 / 2} 混合="镂空" />}
      <VanillaParticles spawns={粒们} 秒={秒} />
      {炸了 && <冲击波环 位={[目标[0], 目标[1], 目标[2] + 0.5]} 刻={刻 - 撕裂爆刻} 大小={8} 色={爆色} 速={0} />}
      {炸了 && <贴图粒子 类={龙息类} 出生们={龙们} 秒={秒} />}
    </>
  );
};

export default 定义法术演出(元, 撕裂);
