// 散射。出处 goety 2.5.60.6：ScatterSpell、ScatterMine、ScatterMineRenderer、ScatterMineModel、PulsatingCircleParticle、RedstoneExplodeParticle、BigElectricParticle。
// - 普通法杖：施法者正前、右、左各 4 格放一颗地雷（setIsSpell，贴图用 scatter_mine_glow_spell），落到地面。
// - 渲染器（没炸时）：mulPose(Y 90°)，scale(−s, −s, s)，translate(0, −1.45, 0)；s 头 2 刻是 1，之后从 3 每刻 −0.5 缩到 1.25。
//   底层 alpha 0.15（头 5 刻用发光贴图，之后用 scatter_mine）；再画一层 entityTranslucentEmissive 的发光贴图，alpha = getGlow（第 5 刻起每刻 −0.0045）。
// - 每刻 1 颗 BIG_ELECTRIC（位置在碰撞箱里随机）；20 刻后每 10 刻一圈贴地的 PulsatingCircle（寿命 30，半边长在 1～1.5 之间来回，每到头换一张 mine_pulse 贴图）。
// - 引爆：4 刻里 s 每刻 +3、发光 alpha 每刻 −0.1（itemEntityTranslucentCull）；createParticleBall(0.5, 2)：5×5×5 立方的外壳 98 颗 REDSTONE_EXPLODE
//   （RisingParticle，暗红 0.44/0.05/0.02，不透明，generic 随机一张）往外，速度约 0.5；外加 1 颗 BIG_ELECTRIC。
// 自己定的：引爆时刻（见 散射.元.ts）。粗做：地雷碰撞箱按 0.5 格估；REDSTONE_EXPLODE 出生时的随机扰动没照抄。
// 没做：有人踩才炸的触发；配风暴法杖的另一种放法（那一支不走这段代码）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 地面贴花 } from '../零件/地面贴花.tsx';
import { MC空间, 取模型, 度, 模型件 } from '../零件/实体.tsx';
import { 贴图粒子, type 粒子出生, type 粒子类 } from '../零件/粒子.tsx';
import 元, { 地雷位, 地雷引爆刻, 地雷胀刻 } from './散射.元.ts';
import 模型数据 from 'asset:模型/法术/goety/ScatterMineModel';
import 雷图 from 'asset:贴图/法术/goety/entity/projectiles/scatter_mine';
import 雷亮图 from 'asset:贴图/法术/goety/entity/projectiles/scatter_mine_glow_spell';
import 脉1 from 'asset:贴图/法术/goety/particle/mine_pulse';
import 脉2 from 'asset:贴图/法术/goety/particle/mine_pulse2';
import 脉3 from 'asset:贴图/法术/goety/particle/mine_pulse3';
import 脉4 from 'asset:贴图/法术/goety/particle/mine_pulse4';
import 电1 from 'asset:贴图/法术/goety/particle/big_electric_1';
import 电2 from 'asset:贴图/法术/goety/particle/big_electric_2';
import 电3 from 'asset:贴图/法术/goety/particle/big_electric_3';
import 尘0 from 'asset:贴图/特效/粒子/generic_0';
import 尘1 from 'asset:贴图/特效/粒子/generic_1';
import 尘2 from 'asset:贴图/特效/粒子/generic_2';
import 尘3 from 'asset:贴图/特效/粒子/generic_3';
import 尘4 from 'asset:贴图/特效/粒子/generic_4';
import 尘5 from 'asset:贴图/特效/粒子/generic_5';
import 尘6 from 'asset:贴图/特效/粒子/generic_6';
import 尘7 from 'asset:贴图/特效/粒子/generic_7';

const 模型 = 取模型(模型数据, 'ScatterMineModel');
const 脉帧 = [脉1, 脉2, 脉3, 脉4].map(png);
const 电类: 粒子类 = { 帧: [电1, 电2, 电3].map(png), 选帧: '按年龄', 混合: '半透明', 摩擦: 0.96, 色: [1, 0.9, 1] };
const 红爆类: 粒子类 = { 帧: [尘7, 尘6, 尘5, 尘4, 尘3, 尘2, 尘1, 尘0].map(png), 选帧: '随机', 摩擦: 0.96, 色: [0.44, 0.05, 0.02], 大小: (年龄, 寿命) => 1 - (年龄 / 寿命) ** 2 * 0.5 };

const 散射: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 整 = Math.floor(刻);
  const 位们 = 地雷位(起点, 目标);
  const 电: 粒子出生[] = [];
  const 红: 粒子出生[] = [];
  位们.forEach((位, i) => {
    const r = rng(种子 * 311 + i);
    for (let t = 0; t < Math.min(地雷引爆刻, 刻); t++)
      电.push({
        刻: t,
        位: [位[0] + (r() - 0.5) * 0.5, 位[1] + (r() - 0.5) * 0.5, 位[2] + r() * 0.5],
        速: [(-0.05 + r() * 0.05) * 0.25, (-0.05 + r() * 0.05) * 0.25, (-0.05 + r() * 0.05) * 0.25],
        寿命: 2 + Math.floor(r() * 2),
        半径: 0.1 * (r() * 0.5 + 0.5) * 2 * 2,
        种子: t,
      });
    电.push({ 刻: 地雷引爆刻, 位, 速: [0.25, 0, 0], 寿命: 2 + Math.floor(r() * 2), 半径: 0.1 * (r() * 0.5 + 0.5) * 4, 种子: 999 });
    let n = 0;
    for (let a = -2; a <= 2; a++)
      for (let b = -2; b <= 2; b++)
        for (let c = -2; c <= 2; c++) {
          if (Math.max(Math.abs(a), Math.abs(b), Math.abs(c)) < 2) continue;
          const d = [b + (r() - r()) * 0.5, c + (r() - r()) * 0.5, a + (r() - r()) * 0.5] as const;
          const 长 = Math.hypot(d[0], d[1], d[2]) / 0.5;
          红.push({ 刻: 地雷引爆刻, 位, 速: [d[0] / 长, d[1] / 长, d[2] / 长], 寿命: Math.floor(8 / (r() * 0.8 + 0.2)) + 4, 半径: 0.1 * (r() * 0.5 + 0.5) * 2, 种子: i * 200 + n++ });
        }
  });
  return (
    <>
      {位们.map((位, i) => {
        if (刻 >= 地雷引爆刻 + 地雷胀刻) return null;
        const 炸 = 刻 >= 地雷引爆刻;
        const 小 = 整 < 3 ? 1 : Math.max(1.25, 3 - 0.5 * (整 - 2));
        const s = 炸 ? 小 + 3 * (整 - 地雷引爆刻 + 1) : 小;
        const 亮 = Math.max(0, 1 - 0.0045 * Math.max(0, Math.min(整, 地雷引爆刻) - 5) - (炸 ? 0.1 * (整 - 地雷引爆刻 + 1) : 0));
        return (
          <MC空间 key={i} 位={位}>
            <group rotation={[0, 度(90), 0]}>
              <group scale={[-s, -s, s]}>
                <group position={[0, -1.45, 0]}>
                  {!炸 && <模型件 模型={模型} 图={png(整 < 5 ? 雷亮图 : 雷图)} 画法="半透明" 透明度={0.15} />}
                  <模型件 模型={模型} 图={png(雷亮图)} 画法="半透明" 透明度={亮} />
                </group>
              </group>
            </group>
          </MC空间>
        );
      })}
      {位们.flatMap((位, i) =>
        Array.from({ length: Math.max(0, Math.floor((Math.min(刻, 地雷引爆刻) - 20) / 10) + 1) }, (_, k) => {
          const 年龄 = 整 - (20 + k * 10);
          if (年龄 < 1 || 年龄 >= 30 || 刻 >= 地雷引爆刻) return null;
          const 半 = 1 + 0.1 * Math.abs(((年龄 - 1) % 10) - 5);
          const 张 = Math.floor(rng(种子 * 7 + i * 100 + k * 10 + Math.floor((年龄 - 1) / 5))() * 4);
          return <地面贴花 key={`${i}-${k}`} 位={位} 图={脉帧[张]!} 半径={半} 抬高={0.05 + k * 0.001} />;
        }),
      )}
      <贴图粒子 类={电类} 出生们={电} 秒={秒} />
      <贴图粒子 类={红爆类} 出生们={红} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 散射);
