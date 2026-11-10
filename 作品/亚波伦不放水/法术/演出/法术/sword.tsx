// 魔力剑。出处 goety 2.5.60.6：SwordSpell、SwordProjectile（AbstractArrow）、SwordProjectileRenderer（scale 1.25）；原版 ItemRenderer 的 GROUND 显示、EnchantmentTableParticle。
// - 弹：把一把剑当物品画出来飞：PoseStack scale(1.25) · YP(yaw − 90) · ZP(pitch − 45)，物品 GROUND 变换（缩 0.5、抬 2/16 格）；出生 2 刻后才画。
// - 每刻一颗 enchant 粒子：出生在 位置 + 速度 × 0.75，速度参数 = 弹的速度。
// 自己定的：游戏里飞出去的是施法者副手（或主手）里那把剑的样子，片里亚波伦手里没有剑，用了钻石剑的贴图。
// 和游戏的差别：物品在游戏里有 1/16 格的厚度，这里是一张两面画的平片。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性 } from '../接口.ts';
import { 减, 加, 乘, 弹道位置, 弹道方向 } from '../零件/弹道.ts';
import { MC空间, 度 } from '../零件/实体.tsx';
import { 面材质 } from '../零件/材质.ts';
import { VanillaParticles, type ParticleSpawn } from '../零件/粒子.tsx';
import { 各刻, 箭角 } from '../零件/甲/共用.ts';
import 元, { 魔力剑道 } from './sword.元.ts';
import 剑图 from 'asset:贴图/法术/minecraft/item/diamond_sword';

const 魔力剑: React.FC<法术演出属性> = ({ 秒, 起点, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const { 道, 到刻 } = 魔力剑道(起点, 目标);
  const 粒: ParticleSpawn[] = 各刻(1, Math.min(刻, 到刻)).map((n) => {
    const 速 = 减(道(n + 1), 道(n));
    const p = 加(道(n), 乘(速, 0.75));
    return { 种: 'enchant', 刻: n, p: [p[0], p[1], p[2]], v: [速[0], 速[1], 速[2]], 种子: 种子 * 53 + n };
  });
  const { yaw, pitch } = 箭角(弹道方向(道, 刻));
  return (
    <>
      {刻 >= 2 && 刻 < 到刻 && (
        <MC空间 位={弹道位置(道, 刻)}>
          <group scale={[1.25, 1.25, 1.25]}>
            <group rotation={[0, 度(yaw - 90), 0]}>
              <group rotation={[0, 0, 度(pitch - 45)]}>
                {/* GROUND：translate(0, 2/16, 0)、scale 0.5；贴图第一行朝上，planeGeometry 的 v 反着，y 取负 */}
                <mesh position={[0, 0.125, 0]} scale={[0.5, -0.5, 0.5]} material={面材质(png(剑图), { 混合: '镂空' })} frustumCulled={false}>
                  <planeGeometry args={[1, 1]} />
                </mesh>
              </group>
            </group>
          </group>
        </MC空间>
      )}
      <VanillaParticles spawns={粒} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 魔力剑);
