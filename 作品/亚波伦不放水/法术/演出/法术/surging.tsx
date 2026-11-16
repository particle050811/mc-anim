// 电涌。出处 goety 2.5.60.6：SurgingSpell（蓄力类，每 6 刻一颗）、SurgingOrb（SpellHurtingProjectile）、SurgingOrbRenderer、TrailEffect、SLightningPacket。
// - 配下界魔杖：setOrange(true)，贴图换 scatter_bolt_orange，尾迹和命中的颜色换金色（ChatFormatting.GOLD 0xFFAA00）。
// - 弹：朝镜头的方片，边长 0.25 + f1，f1 = (sin(年龄 ÷ 5) × 0.2 + 0.2) × clientScale（每刻 + 0.2 封顶 1），中心抬半个实体高；贴图横排 16 帧每刻一帧；entityTranslucent。
// - 三条尾迹：TrailEffect(宽 0.05, 长 1.75)，绕飞行轴半径 0.15、相位 年龄 ÷ 4 再各差 120°，pointed_trail 贴图、镂空、金色。
// - 命中：球爆（金色，尺寸 0.5，速 1）+ 8 道电弧（从命中点到各轴 ±1 格内的随机点，寿命 8 刻）。
// 自己定的：游戏里按住多久放多久，片里一次演 3 颗。没核：方片顶点是不是 ±0.5（照 ElectroOrbRenderer 的写法当成是）；电弧用的是 shock 那套参数（粗 0.04）。
// 没做：追踪转向（tickCount > 2 起方向往目标转，turnRate 0.2 ÷ 惯性）——目标不动，直线就是它。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { addVec, scaleVec, unitVec, trajectoryPos, trajectoryDir } from '../零件/弹道.ts';
import { ElectricArc } from '../零件/电弧.tsx';
import { arcPresets } from '../零件/电弧形.ts';
import { Quad } from '../零件/面片.tsx';
import { SphereBurst } from '../零件/甲/爆.tsx';
import { hexColor, trajectoryAt } from '../零件/甲/共用.ts';
import { Trail } from '../零件/甲/尾迹.tsx';
import meta, { surgeShots } from './surging.元.ts';
import scatterBoltPng from 'asset:贴图/法术/goety/entity/projectiles/scatter_bolt_orange';
import pointedTrailPng from 'asset:贴图/法术/goety/entity/projectiles/pointed_trail';
import { mulberry32 } from '@engine/core/数学.ts';

const gold = hexColor(0xffaa00);
const halfHeight = 0.15;

const Surge: React.FC<SpellPerformanceProps> = ({ sec: sec, from, target: target, seed: seed }) => {
  const tick = sec * 20;
  return (
    <>
      {surgeShots(from, target).map((projectile, i) => {
        const t = tick - projectile.launchTick;
        if (t < 0) return null;
        if (t >= projectile.flightTick) {
          const pos = addVec(trajectoryAt(projectile.trajectory, projectile.flightTick), [0, 0, halfHeight]);
          const r = mulberry32(seed * 19 + i);
          return (
            <React.Fragment key={i}>
              <SphereBurst 位={pos} 刻={t - projectile.flightTick} 色={gold} 尺寸={0.5} 速={1} />
              {Array.from({ length: 8 }, (_, k) => (
                <ElectricArc key={k} start={pos} end={[pos[0] + r() * 2 - 1, pos[1] + r() * 2 - 1, pos[2] + r() * 2 - 1]} settings={arcPresets.shock} 刻={t - projectile.flightTick} lifeTicks={8} 色={gold} opacity={0.8} seed={seed * 23 + i * 8 + k} />
              ))}
            </React.Fragment>
          );
        }
        const p = trajectoryPos(projectile.trajectory, t);
        const dir = trajectoryDir(projectile.trajectory, t);
        // 和飞行方向垂直的两个轴
        const perp: Vec3 = unitVec([-dir[1], dir[0], 0]);
        const perpVec: Vec3 = [dir[1] * perp[2] - dir[2] * perp[1], dir[2] * perp[0] - dir[0] * perp[2], dir[0] * perp[1] - dir[1] * perp[0]];
        const spiral = (priorTick: number, phase: number): Vec3 => {
          const age = Math.max(0, t - priorTick);
          const angle = age / 4 + phase;
          return addVec(addVec(trajectoryPos(projectile.trajectory, age), [0, 0, halfHeight]), addVec(scaleVec(perp, Math.cos(angle) * 0.15), scaleVec(perpVec, Math.sin(angle) * 0.15)));
        };
        const beamWidth = 0.25 + (Math.sin(t / 5) * 0.2 + 0.2) * Math.min(1, t * 0.2);
        const u = (Math.floor(t) % 16) / 16;
        return (
          <React.Fragment key={i}>
            {[0, 1, 2].map((k) => (
              <Trail key={k} points={Array.from({ length: Math.min(12, Math.floor(t) + 1) }, (_, j) => spiral(j * 0.5, (k * 2 * Math.PI) / 3))} width={0.05} length={1.75} image={png(pointedTrailPng)} 色={gold} 实心 blend="镂空" />
            ))}
            <Quad image={png(scatterBoltPng)} 位={[p[0], p[1], p[2] + halfHeight]} halfWidth={beamWidth / 2} uv={[u, 0, u + 1 / 16, 1]} blend="半透明" />
          </React.Fragment>
        );
      })}
    </>
  );
};

export default defineSpellPerformance(meta, Surge);
