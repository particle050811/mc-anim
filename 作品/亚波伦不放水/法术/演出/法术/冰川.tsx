// 冰川。出处 goety 2.5.60.6：IceChunkSpell、IceChunk、IceChunkRenderer、IceChunkModel、CircleExplodeParticle。
// - 冰块出在目标头上 4 格。头 20 刻（isStarting）从小长大：scale = hovering ÷ 10，用 RenderType.eyes 画 ice_chunk_spawn（发光、加色），模型绕竖轴自转；
//   之后 scale 2、贴图 ice_chunk（entityCutoutNoCull）。渲染器：mulPose(Y 90° − yRot)，scale(−f, −f, f)，translate(0, −1.45, 0)。
// - 悬停到第 100 刻（会跟着目标飘，片里目标不动），之后每刻加速 0.25 格/刻砸下。
// - 砸中（onHit）：256 颗浮冰碎屑；贴地扩散环 CircleExplode（0xFFFEFF，大小 5，speed 1）；60 颗 POOF 往外；冰块消失。
// 粗做：长大时的自转游戏里每画一帧累加 ageInTicks（转速跟帧率走、越转越快），这里按每刻 0.6 弧度匀速。
// 没做：长大时外圈往里聚的 GatherFrost 粒子、第 20 刻的 SUMMON 粒子、悬停时的 CLOUD 光环和落雪（FALLING_DUST）——原版 cloud、falling_dust 粒子库里还没有。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { MC空间, 取模型, 度, 模型件 } from '../零件/实体.tsx';
import { 十六进制色 } from '../零件/材质.ts';
import { 屑撒, 方块屑 } from '../零件/方块屑.tsx';
import { VanillaParticles, type ParticleSpawn } from '../零件/粒子.tsx';
import { 圆环爆 } from '../零件/乙圆环.tsx';
import 元, { 冰块命中刻, 冰块长成刻, 冰块高 } from './冰川.元.ts';
import 模型数据 from 'asset:模型/法术/goety/IceChunkModel';
import 冰图 from 'asset:贴图/法术/goety/entity/projectiles/ice_chunk';
import 冰生图 from 'asset:贴图/法术/goety/entity/projectiles/ice_chunk_spawn';
import 浮冰图 from 'asset:贴图/法术/minecraft/block/packed_ice';

const 模型 = 取模型(模型数据, 'IceChunkModel');
const 环色 = 十六进制色(0xfffeff);

const 冰川: React.FC<法术演出属性> = ({ 秒, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 长 = 刻 < 冰块长成刻;
  const f = 长 ? Math.floor(刻) / 10 : 2;
  const 位: 点 = [目标[0], 目标[1], 目标[2] + 冰块高(Math.min(刻, 冰块命中刻))];
  // 砸中时冰块中心（碰撞箱 2 × 2 估）
  const 砸位: 点 = [目标[0], 目标[1], 目标[2] + 冰块高(冰块命中刻) + 1];
  const r = rng(种子 * 409 + 1);
  const 烟: ParticleSpawn[] = Array.from({ length: 60 }, (_, i): ParticleSpawn => {
    const 角 = r() * Math.PI * 2;
    const 速 = 0.2 + r() * 0.3;
    return { 种: 'poof', 刻: 冰块命中刻, p: [目标[0], 目标[1], 目标[2] + 0.2], v: [Math.cos(角) * 速, Math.sin(角) * 速, 0.05], 种子: 种子 * 3000 + i };
  });
  return (
    <>
      {刻 < 冰块命中刻 && f > 0 && (
        <MC空间 位={位}>
          <group rotation={[0, 度(90), 0]}>
            <group scale={[-f, -f, f]}>
              <group position={[0, -1.45, 0]}>
                <模型件 模型={模型} 图={png(长 ? 冰生图 : 冰图)} 画法={长 ? '发光' : '镂空'} 姿态={长 ? { chunk: { rot: [0, 刻 * 0.6, 0] } } : undefined} />
              </group>
            </group>
          </group>
        </MC空间>
      )}
      <方块屑 出生们={屑撒(砸位, 256, [1, 1, 1], 1, 冰块命中刻, 种子 * 23)} 秒={秒} 图={png(浮冰图)} 地面={目标[2]} />
      <圆环爆 位={目标} 出生刻={冰块命中刻} 秒={秒} 大小={5} 颜色={环色} 加速={1} />
      <VanillaParticles spawns={烟} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 冰川);
