// 生物地雷。出处 goety 2.5.60.6：BioMineSpell、BlockFinder.SummonWaterAwayRadius、BioMine、BioMineRenderer、BioMineModel、AcidPool、CircleExplodeParticle。
// - 4 颗，各自落在目标周围：x、z 各偏 −8～8 格的整数，要离目标至少 4 格；格子正中，贴地。
// - 渲染器：scale(−1, −1, 1)，translate(0, −1.5, 0)；贴图 biomine/<游戏时间 % 19>.png 每刻换一张；再画一层 RenderType.eyes 的 glow（发光层）。
// - 炸（trigger）：贴地扩散环 CircleExplode（白，大小 3，speed 1），原地留一个酸池（半径 2，颜色 0x20B33E，3 秒）。
// 粗做：酸池游戏里是 AcidPool 实体每刻在圈里放 BIG_CULT_SPELL 粒子（poolTick 没细读），这里每刻在半径 2 的圈里撒 2 颗绿色的 cult_spell 粒子（半边长 0.3）代替。
// 没做：放下时的 summonedParticles、炸开的 SphereExplode 球壳、酸池出现时的 ROLLING_SPIRAL；被打也会炸。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { MC空间, 取模型, 模型件 } from '../零件/实体.tsx';
import { 十六进制色 } from '../零件/材质.ts';
import type { 粒子出生 } from '../零件/粒子.tsx';
import { 尘云 } from '../零件/乙尘云.tsx';
import { 圆环爆 } from '../零件/乙圆环.tsx';
import 元, { 生物雷寿命刻, 生物雷最晚刻, 生物雷颗数, 酸池刻 } from './生物地雷.元.ts';
import 模型数据 from 'asset:模型/法术/goety/BioMineModel';
import 亮图 from 'asset:贴图/法术/goety/entity/projectiles/biomine/glow';
import 图0 from 'asset:贴图/法术/goety/entity/projectiles/biomine/0';
import 图1 from 'asset:贴图/法术/goety/entity/projectiles/biomine/1';
import 图2 from 'asset:贴图/法术/goety/entity/projectiles/biomine/2';
import 图3 from 'asset:贴图/法术/goety/entity/projectiles/biomine/3';
import 图4 from 'asset:贴图/法术/goety/entity/projectiles/biomine/4';
import 图5 from 'asset:贴图/法术/goety/entity/projectiles/biomine/5';
import 图6 from 'asset:贴图/法术/goety/entity/projectiles/biomine/6';
import 图7 from 'asset:贴图/法术/goety/entity/projectiles/biomine/7';
import 图8 from 'asset:贴图/法术/goety/entity/projectiles/biomine/8';
import 图9 from 'asset:贴图/法术/goety/entity/projectiles/biomine/9';
import 图10 from 'asset:贴图/法术/goety/entity/projectiles/biomine/10';
import 图11 from 'asset:贴图/法术/goety/entity/projectiles/biomine/11';
import 图12 from 'asset:贴图/法术/goety/entity/projectiles/biomine/12';
import 图13 from 'asset:贴图/法术/goety/entity/projectiles/biomine/13';
import 图14 from 'asset:贴图/法术/goety/entity/projectiles/biomine/14';
import 图15 from 'asset:贴图/法术/goety/entity/projectiles/biomine/15';
import 图16 from 'asset:贴图/法术/goety/entity/projectiles/biomine/16';
import 图17 from 'asset:贴图/法术/goety/entity/projectiles/biomine/17';
import 图18 from 'asset:贴图/法术/goety/entity/projectiles/biomine/18';

const 模型 = 取模型(模型数据, 'BioMineModel');
const 帧 = [图0, 图1, 图2, 图3, 图4, 图5, 图6, 图7, 图8, 图9, 图10, 图11, 图12, 图13, 图14, 图15, 图16, 图17, 图18].map(png);
const 白: readonly [number, number, number] = [1, 1, 1];
const 酸色 = 十六进制色(0x20b33e);

type 雷 = { 位: 点; 炸刻: number };
const 排雷 = (目标: 点, 种子: number): 雷[] =>
  Array.from({ length: 生物雷颗数 }, (_, i) => {
    const r = rng(种子 * 449 + i);
    let [x, y] = [4, 0];
    for (let 试 = 0; 试 < 16; 试++) {
      [x, y] = [Math.floor(r() * 17) - 8, Math.floor(r() * 17) - 8];
      if (x * x + y * y >= 16) break;
    }
    let 炸刻 = 生物雷寿命刻;
    while (炸刻 < 生物雷最晚刻 && Math.floor(r() * 8) !== 0) 炸刻++;
    return { 位: [目标[0] + x, 目标[1] + y, 目标[2]] as const, 炸刻 };
  });

const 生物地雷: React.FC<法术演出属性> = ({ 秒, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 雷们 = 排雷(目标, 种子);
  const 酸: 粒子出生[] = [];
  雷们.forEach((雷, i) => {
    const r = rng(种子 * 677 + i);
    for (let t = 雷.炸刻; t < Math.min(雷.炸刻 + 酸池刻, 刻); t++)
      for (let k = 0; k < 2; k++) {
        const [角, 距] = [r() * Math.PI * 2, Math.sqrt(r()) * 2];
        酸.push({ 刻: t, 位: [雷.位[0] + Math.cos(角) * 距, 雷.位[1] + Math.sin(角) * 距, 雷.位[2] + 0.2], 寿命: Math.floor(8 / (r() * 0.8 + 0.2)), 半径: 0.3, 色: 酸色, 种子: i * 1000 + t * 2 + k });
      }
  });
  return (
    <>
      {雷们.map((雷, i) =>
        刻 < 雷.炸刻 ? (
          <MC空间 key={i} 位={雷.位}>
            <group scale={[-1, -1, 1]}>
              <group position={[0, -1.5, 0]}>
                <模型件 模型={模型} 图={帧[Math.floor(刻) % 19]!} />
                <模型件 模型={模型} 图={png(亮图)} 画法="发光" />
              </group>
            </group>
          </MC空间>
        ) : (
          <圆环爆 key={i} 位={雷.位} 出生刻={雷.炸刻} 秒={秒} 大小={3} 颜色={白} 加速={1} />
        ),
      )}
      <尘云 出生们={酸} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 生物地雷);
