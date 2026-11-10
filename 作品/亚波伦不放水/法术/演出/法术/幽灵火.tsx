// 幽灵火（样板：落在地面的）。出处 goety 2.5.60.6：IceBouquetSpell、WandUtil.spawn4x4IceBouquet、IceBouquet、GroundProjectile、IceBouquetRenderer、IceBouquetModel、IceBouquetTextures、MagicSmokeParticle。
// - 摆位（默认法杖走 spawn4x4IceBouquet）：目标脚下一丛，再随机挑一个象限，隔 1.5 格补三丛，排成 2×2。配死灵法杖是单丛、无名法杖是塔，片里用不到。
// - 贴图（IceBouquetTextures）：每刻换一张，先 pre1～13（鬼火冒头），再 fire1～32 循环。
// - 渲染器：mulPose(Y 轴 90° − yaw)，scale(−f, −1.25, f)，translate(0, −1.45, 0)；f = 0.8，pre 阶段（头 13 刻）是 0.4；最后 2 刻 f 线性缩到 0。
//   先用 entityTranslucent 画一遍 alpha 0.15，再用 ModRenderType.wraith（eyes 着色器、加色、满亮度）画一遍。
//   模型 IceBouquetModel 是几片交叉的 16×16 面片，setupAnim 给 middle 部件套了常量缩放 (0.9, 1.5, 0.9)。
// - 烟（IceBouquet.tick 客户端，第 10 刻起每刻一颗）：MagicSmokeParticle，颜色从 0xB8E5FF 渐变到 0x015687，寿命 10～19 刻，大小 0.2，
//   出生在碰撞箱（0.8 宽 × 1 高）里随机处；速度 水平 ±0.05、竖直 0.1～0.2，摩擦 0.96；不透明粒子，贴图是原版 generic_0。
// 没做：烧着时每刻 1/24 概率响一声原版火的噼啪；MagicSmokeParticleOption 四个参数的构造函数给的重力没查，按 0 算。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { MC空间, 取模型, 度, 模型件 } from '../零件/实体.tsx';
import { 序列帧 } from '../零件/面片.tsx';
import { 十六进制色, type 色 } from '../零件/材质.ts';
import { 贴图粒子, type 粒子出生, type 粒子类 } from '../零件/粒子.tsx';
import 元, { 幽灵火寿命刻 } from './幽灵火.元.ts';
import 模型数据 from 'asset:模型/法术/goety/IceBouquetModel';
import 烟图 from 'asset:贴图/特效/粒子/generic_0';
import 预1 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre1';
import 预2 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre2';
import 预3 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre3';
import 预4 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre4';
import 预5 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre5';
import 预6 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre6';
import 预7 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre7';
import 预8 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre8';
import 预9 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre9';
import 预10 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre10';
import 预11 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre11';
import 预12 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre12';
import 预13 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/pre/pre13';
import 火1 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire1';
import 火2 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire2';
import 火3 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire3';
import 火4 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire4';
import 火5 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire5';
import 火6 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire6';
import 火7 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire7';
import 火8 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire8';
import 火9 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire9';
import 火10 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire10';
import 火11 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire11';
import 火12 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire12';
import 火13 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire13';
import 火14 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire14';
import 火15 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire15';
import 火16 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire16';
import 火17 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire17';
import 火18 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire18';
import 火19 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire19';
import 火20 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire20';
import 火21 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire21';
import 火22 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire22';
import 火23 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire23';
import 火24 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire24';
import 火25 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire25';
import 火26 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire26';
import 火27 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire27';
import 火28 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire28';
import 火29 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire29';
import 火30 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire30';
import 火31 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire31';
import 火32 from 'asset:贴图/法术/goety/entity/projectiles/ghost_fire/fire32';

const 模型 = 取模型(模型数据, 'IceBouquetModel');
const 帧们 = [预1, 预2, 预3, 预4, 预5, 预6, 预7, 预8, 预9, 预10, 预11, 预12, 预13, 火1, 火2, 火3, 火4, 火5, 火6, 火7, 火8, 火9, 火10, 火11, 火12, 火13, 火14, 火15, 火16, 火17, 火18, 火19, 火20, 火21, 火22, 火23, 火24, 火25, 火26, 火27, 火28, 火29, 火30, 火31, 火32].map(png);
const 预帧数 = 13;
const 姿态 = { middle: { scale: [0.9, 1.5, 0.9] } };

/** 四丛的位置：目标脚下一丛，加一个随机象限的三丛（间隔 1.5 格） */
const 四丛 = (目标: 点, 种子: number): 点[] => {
  const 象限 = Math.floor(rng(种子)() * 4);
  const [sx, sy] = [象限 >= 2 ? -1.5 : 1.5, 象限 % 2 === 1 ? -1.5 : 1.5];
  return [目标, [目标[0], 目标[1] + sy, 目标[2]], [目标[0] + sx, 目标[1], 目标[2]], [目标[0] + sx, 目标[1] + sy, 目标[2]]];
};

const 烟色从 = 十六进制色(0xb8e5ff);
const 烟色到 = 十六进制色(0x015687);
const 混色 = (t: number): 色 => [0, 1, 2].map((i) => 烟色从[i]! + (烟色到[i]! - 烟色从[i]!) * t) as unknown as 色;
// getQuadSize：大小 × clamp(年龄 ÷ 寿命 × 32, 0, 1)，出生后很快长到满
const 烟类: 粒子类 = { 帧: [png(烟图)], 选帧: '随机', 摩擦: 0.96, 混合: '镂空', 大小: (年龄, 寿命) => Math.min(1, Math.max(0, (年龄 / 寿命) * 32)) };

const 烟 = (位: 点, 到刻: number, 种子: number): 粒子出生[] => {
  const 出: 粒子出生[] = [];
  for (let t = 10; t <= Math.min(到刻, 幽灵火寿命刻 - 1); t++) {
    const r = rng(种子 * 131 + t);
    const 寿命 = 10 + Math.floor(r() * 10);
    出.push({
      刻: t,
      位: [位[0] + (r() - 0.5) * 0.8, 位[1] + (r() - 0.5) * 0.8, 位[2] + r()],
      速: [((r() * 2 - 1) / 10) * 0.5, ((r() * 2 - 1) / 10) * 0.5, 0.1 + r() / 10],
      寿命,
      半径: 0.2,
      种子: t,
      // 颜色随年龄渐变：出生表每帧重排，直接按当前年龄给
      色: 混色(Math.min(1, Math.max(0, (到刻 - t) / 寿命))),
    });
  }
  return 出;
};

const 一丛: React.FC<{ 位: 点; 刻: number }> = ({ 位, 刻 }) => {
  // 贴图序号每刻 +1：0～12 是 pre，13～44 是 fire，到 44 回 13
  const n = Math.floor(刻);
  const 图 = n < 预帧数 ? 帧们[n]! : 序列帧(帧们.slice(预帧数), n - 预帧数, true);
  const 剩 = 幽灵火寿命刻 - 刻;
  const f = (n < 预帧数 ? 0.5 : 1) * 0.8 * (剩 < 2 ? Math.max(0, 剩 / 2) : 1);
  if (f <= 0) return null;
  return (
    <MC空间 位={位}>
      {/* 实体 yaw 恒 0：mulPose(YP 90°) */}
      <group rotation={[0, 度(90), 0]}>
        <group scale={[-f, -1.25, f]}>
          <group position={[0, -1.45, 0]}>
            <模型件 模型={模型} 图={图} 画法="半透明" 透明度={0.15} 姿态={姿态} />
            <模型件 模型={模型} 图={图} 画法="加色" 姿态={姿态} />
          </group>
        </group>
      </group>
    </MC空间>
  );
};

const 幽灵火: React.FC<法术演出属性> = ({ 秒, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 丛们 = 四丛(目标, 种子);
  return (
    <>
      {丛们.map((位, i) => (
        <React.Fragment key={i}>
          <一丛 位={位} 刻={刻} />
          <贴图粒子 类={烟类} 出生们={烟(位, 刻, 种子 + i)} 秒={秒} />
        </React.Fragment>
      ))}
    </>
  );
};

export default 定义法术演出(元, 幽灵火);
