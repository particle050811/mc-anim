// 画虚空震弹和它的爆。出处 goety 2.5.60.6：VoidShock、VoidShockRenderer、VoidShockModel、TrailEffect、CircleExplodeParticle、SphereExplodeParticle。
// - 弹：VoidShockModel（4×4×4 的外壳套一个 3×3×3 的芯），translate(0, 0.3, 0)；内层贴图发光层（eyes）alpha 1，外层贴图再画一遍 alpha 0.4；锁定后 bolt 朝飞行方向。
// - 每刻一颗 portal 粒子；锁定后拖尾迹 TrailEffect(宽 0.2, 长 3)，solid_trail、深紫（DARK_PURPLE 0xAA00AA × 1.2）。
// - 爆：圆爆、球爆各两个（尺寸 1.5、3.0），色 0xB103D8。
// 没做：锁定那一刻的 sparkle 粒子、爆的时候两圈 dust_cloud 粒子。没核：渲染器的 scale（这里照同类用 (−1, −1, 1)）、圆爆球爆的 speed 参数（当 1）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import type { 点 } from '../../接口.ts';
import { 减, 单位 } from '../弹道.ts';
import { MC空间, 取模型, 度, 模型件 } from '../实体.tsx';
import { VanillaParticles, type ParticleSpawn } from '../粒子.tsx';
import { 圆爆, 球爆 } from './爆.tsx';
import { 各刻, 十六色, 转向角 } from './共用.ts';
import { 尾迹 } from './尾迹.tsx';
import { 虚空震位, 虚空震撞刻, type 虚空震 } from './虚空震.ts';
import 模型数据 from 'asset:模型/法术/goety/VoidShockModel';
import 内图 from 'asset:贴图/法术/goety/entity/projectiles/void_shock_inner';
import 外图 from 'asset:贴图/法术/goety/entity/projectiles/void_shock_outer';
import 尾迹图 from 'asset:贴图/法术/goety/entity/projectiles/solid_trail';

const 模型 = 取模型(模型数据, 'VoidShockModel');
const 深紫: readonly [number, number, number] = [0.8, 0, 0.8];
const 爆色 = 十六色(0xb103d8);

export const 虚空震们: React.FC<{ 震们: readonly 虚空震[]; 目标: 点; 秒: number; 种子: number }> = ({ 震们, 目标, 秒, 种子 }) => {
  const 刻 = 秒 * 20;
  const 粒: ParticleSpawn[] = 震们.flatMap((震, i) =>
    各刻(1, Math.min(刻 - 震.出刻, 虚空震撞刻(震, 目标))).map((n) => {
      const p = 虚空震位(震, 目标, n);
      return { 种: 'portal' as const, 刻: 震.出刻 + n, p: [p[0], p[1], p[2] + 0.3] as [number, number, number], 种子: 种子 * 211 + i * 1009 + n };
    }),
  );
  return (
    <>
      {震们.map((震, i) => {
        const t = 刻 - 震.出刻;
        if (t < 0) return null;
        const 撞 = 虚空震撞刻(震, 目标);
        if (t >= 撞) {
          const 位 = 虚空震位(震, 目标, 撞);
          return (
            <React.Fragment key={i}>
              {[1.5, 3].map((尺寸) => (
                <React.Fragment key={尺寸}>
                  <圆爆 位={位} 刻={t - 撞} 色={爆色} 尺寸={尺寸} />
                  <球爆 位={位} 刻={t - 撞} 色={爆色} 尺寸={尺寸} />
                </React.Fragment>
              ))}
            </React.Fragment>
          );
        }
        const p = 虚空震位(震, 目标, t);
        const 锁了 = t > 震.锁刻;
        const 角 = 锁了 ? 转向角(单位(减(虚空震位(震, 目标, t + 1), p))) : { yaw: 0, pitch: 0 };
        const 姿态 = { bolt: { rot: [度(角.pitch), 度(角.yaw), 0] } };
        return (
          <React.Fragment key={i}>
            <MC空间 位={p}>
              <group position={[0, 0.3, 0]}>
                <group scale={[-1, -1, 1]}>
                  <模型件 模型={模型} 图={png(内图)} 画法="加色" 姿态={姿态} />
                  <模型件 模型={模型} 图={png(外图)} 画法="加色" 透明度={0.4} 姿态={姿态} />
                </group>
              </group>
            </MC空间>
            {锁了 && (
              <尾迹
                点们={Array.from({ length: Math.min(8, Math.floor(t - 震.锁刻) + 2) }, (_, j) => {
                  const q = 虚空震位(震, 目标, Math.max(震.锁刻, t - j));
                  return [q[0], q[1], q[2] + 0.3] as const;
                })}
                宽={0.2}
                长={3}
                图={png(尾迹图)}
                色={深紫}
                实心
                混合="镂空"
              />
            )}
          </React.Fragment>
        );
      })}
      <VanillaParticles spawns={粒} 秒={秒} />
    </>
  );
};
