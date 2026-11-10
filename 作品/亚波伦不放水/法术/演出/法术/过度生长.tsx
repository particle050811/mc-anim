// 过度生长。出处 goety 2.5.60.6：OvergrowthSpell、WandUtil.summonSurroundTrap / summonMonolith、QuickGrowingVine、AbstractVine、QuickGrowingVineRenderer、QuickGrowingVineModel、QuickGrowingVineAnimations（已提取）。
// - 不潜行、有目标时五种阵型随机（小方阵、夹道、立方、圆、围一圈）；片里固定用「围一圈」：目标周围 8 格各一根速生藤，第 i 根晚 i 刻破土，每根朝向四个正方向随机。
// - 渲染器是 MobRenderer：mulPose(Y 180° − yRot)，scale(−1, −1, 1)，translate(0, −1.501, 0)；外加一层 RenderType.eyes 的 quick_growing_vine_glow（发光层）。
//   动画：BURST（0.75 秒）→ 第 15 刻 IDLE（循环 1.125 秒）→ 寿命 3 秒到了 BURROW（0.75 秒）。
// - 破土、缩回时 diggingParticles：一圈 8 颗脚下方块碎屑（半径 1）。
// 粗做：缩回按 15 刻算（游戏里是 age 每刻减 getAgeSpeed 减到 0，没细查）；贴图用新版（配置 QuickGrowingVineTexture 的默认值没查，另一张是 _original）。
// 没做：破土时一圈往上飘的尘云（颜色取脚下方块的地图色）；藤打人（近战 AI）；另外四种阵型；潜行放的毒刺藤。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { MC空间, 取模型, 度, 模型件 } from '../零件/实体.tsx';
import { 关键帧姿态, 取动画 } from '../零件/关键帧.ts';
import { 圆里撒, 方块屑, type 屑出生 } from '../零件/方块屑.tsx';
import 元, { 藤蔓位, 藤蔓寿命刻, 藤蔓破土刻, 藤蔓缩回用刻, 藤蔓闲刻 } from './过度生长.元.ts';
import 模型数据 from 'asset:模型/法术/goety/QuickGrowingVineModel';
import 动画数据 from 'asset:动画/法术/goety/QuickGrowingVineAnimations';
import 图数据 from 'asset:贴图/法术/goety/entity/monolith/quick_growing_vine/quick_growing_vine';
import 亮图数据 from 'asset:贴图/法术/goety/entity/monolith/quick_growing_vine/quick_growing_vine_glow';

const 模型 = 取模型(模型数据, 'QuickGrowingVineModel');
const [破土, 闲, 缩回] = [取动画(动画数据, 'BURST'), 取动画(动画数据, 'IDLE'), 取动画(动画数据, 'BURROW')];

const 过度生长: React.FC<法术演出属性> = ({ 秒, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 位们 = 藤蔓位(目标);
  const 屑: 屑出生[] = 位们.flatMap((位, i) => [
    ...圆里撒([位[0], 位[1], 位[2] + 0.25], 1, 藤蔓破土刻(i), 种子 * 53 + i),
    ...圆里撒([位[0], 位[1], 位[2] + 0.25], 1, 藤蔓破土刻(i) + 藤蔓寿命刻, 种子 * 59 + i),
  ]);
  return (
    <>
      {位们.map((位, i) => {
        const 活 = 刻 - 藤蔓破土刻(i);
        if (活 < 0 || 活 >= 藤蔓寿命刻 + 藤蔓缩回用刻) return null;
        const 姿态 = 关键帧姿态(模型, [活 >= 藤蔓寿命刻 ? [缩回, (活 - 藤蔓寿命刻) / 20] : 活 >= 藤蔓闲刻 ? [闲, (活 - 藤蔓闲刻) / 20] : [破土, 活 / 20]]);
        const 朝 = Math.floor(rng(种子 * 97 + i)() * 4) * 90;
        return (
          <MC空间 key={i} 位={位}>
            <group rotation={[0, 度(180 - 朝), 0]}>
              <group scale={[-1, -1, 1]}>
                <group position={[0, -1.501, 0]}>
                  <模型件 模型={模型} 图={png(图数据)} 姿态={姿态} />
                  <模型件 模型={模型} 图={png(亮图数据)} 画法="发光" 姿态={姿态} />
                </group>
              </group>
            </group>
          </MC空间>
        );
      })}
      <方块屑 出生们={屑} 秒={秒} 地面={目标[2]} />
    </>
  );
};

export default 定义法术演出(元, 过度生长);
