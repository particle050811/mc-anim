// 喷发。出处 goety 2.5.60.6：EruptionSpell、Volcano、AbstractMonolith、VolcanoRenderer、VolcanoModel、Pyroclast、AbstractFungusRenderer（PyroclastRenderer）、BlastFungusModel、MobUtil.shootUp。
// - 火山出在目标那格正中。渲染器：mulPose(Y yRot = 0)，scale(−1, −1, 1)；setupAnim 把 volcano.y 直接设成 60 − age（像素，立稳后是 0，不是模型里写的 24）；立稳后再用 RenderType.eyes 画一遍 volcano_active（发光层）。
// - 立稳后每刻 1 颗 LARGE_SMOKE（SmokeParticle 放大 2.5 倍）；到点喷火山弹：shootFromRotation(−90°, 0, 0, 速度 1.5, 散布 12)，
//   即方向 (0, 1, 0) 每个分量加三角分布 ±0.0172275 × 12，再乘 1.5。火山弹是 ThrowableProjectile（阻力 0.99、重力 0.03）。
// - 火山弹渲染器：translate(0, 碰撞箱高 ÷ 2, 0)，mulPose(Y −(atan2(vz, vx) + 90°))，mulPose(X −(atan2(水平速, vy) − 90°))，满亮度；每刻身后 1 颗 LARGE_SMOKE、1 颗 FLAME。
// - 火山弹碰到人（碰撞箱外扩 1 格）或落地就炸：有主人时走原版式爆炸（威力 3，EXPLOSION_EMITTER）。史蒂夫站在火山口上，所以第一颗一出膛就炸。
// 粗做：后六颗当史蒂夫已经被炸开，照常飞上去再落在四周（游戏里他要是还站着，每颗都会出膛就炸）；火山弹出膛高度、碰撞箱高按 0.6、0.5 格估。
// 没做：喷口的 LAVA 粒子（原版 lava 粒子库里还没有）；配下界法杖时多出的两座火山。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { parabola, trajectoryPos, trajectoryDir, type Trajectory } from '../零件/弹道.ts';
import { MinecraftSpace, getModel, ModelPart } from '../零件/实体.tsx';
import { VanillaParticles, type ParticleSpawn } from '../零件/粒子.tsx';
import { bigExplosion } from '../零件/乙爆炸.tsx';
import meta, { eruptTicks, volcanoRiseTicks, volcanoLifeTicks, volcanoBombMaxTicks, volcanoAge } from './喷发.元.ts';
import volcanoModelData from 'asset:模型/法术/goety/VolcanoModel';
import blastFungusModelData from 'asset:模型/法术/goety/BlastFungusModel';
import volcanoPng from 'asset:贴图/法术/goety/entity/monolith/volcano';
import volcanoActivePng from 'asset:贴图/法术/goety/entity/monolith/volcano_active';
import pyroclastPng from 'asset:贴图/法术/goety/entity/projectiles/pyroclast';
import { mulberry32 } from '@engine/core/数学.ts';

const volcanoModel = getModel(volcanoModelData, 'VolcanoModel');
const blastFungusModel = getModel(blastFungusModelData, 'BlastFungusModel');

type Projectile = { launchTick: number; trajectory: Trajectory; landTick: number };
const shotRow = (target: Vec3, seed: number): Projectile[] =>
  eruptTicks.map((launchTick, i) => {
    const r = mulberry32(seed * 761 + i);
    const jitter = () => (r() - r()) * 0.0172275 * 12;
    const spread: Vec3 = [jitter(), jitter(), 1 + jitter()];
    const vecLength = Math.hypot(spread[0], spread[1], spread[2]);
    const trajectory = parabola([target[0], target[1], target[2] + 0.6], [(spread[0] / vecLength) * 1.5, (spread[1] / vecLength) * 1.5, (spread[2] / vecLength) * 1.5]);
    let landTick = 0;
    if (i > 0) {
      landTick = 1;
      while (landTick < volcanoBombMaxTicks && trajectory(landTick)[2] > target[2]) landTick++;
    }
    return { launchTick, trajectory, landTick };
  });

const Eruption: React.FC<SpellPerformanceProps> = ({ sec: sec, target: target, seed: seed }) => {
  const tick = sec * 20;
  const age = volcanoAge(tick);
  const steady = tick >= volcanoRiseTicks && tick < volcanoLifeTicks;
  const projectiles = shotRow(target, seed);
  const smokeSpawns: ParticleSpawn[] = [];
  const flames: ParticleSpawn[] = [];
  const blastParticles: ParticleSpawn[] = [];
  for (let t = volcanoRiseTicks; t < Math.min(volcanoLifeTicks, tick); t++) if (!eruptTicks.includes(t)) smokeSpawns.push({ kind: 'smoke', 刻: t, p: [target[0], target[1], target[2]], seed: seed * 9000 + t });
  projectiles.forEach((projectile, i) => {
    const r = mulberry32(seed * 131 + i);
    for (let n = 1; n <= projectile.landTick && projectile.launchTick + n <= tick; n++) {
      const nextPos = projectile.trajectory(n + 1);
      smokeSpawns.push({ kind: 'smoke', 刻: projectile.launchTick + n, p: [nextPos[0] + r() / 2, nextPos[1] - r() / 2, nextPos[2] + 0.5], seed: seed * 70000 + i * 200 + n });
      flames.push({ kind: 'flame', 刻: projectile.launchTick + n, p: [nextPos[0] + r() / 2, nextPos[1] - r() / 2, nextPos[2] + 0.5], seed: seed * 90000 + i * 200 + n });
    }
    const landing = projectile.trajectory(projectile.landTick);
    blastParticles.push(...bigExplosion([landing[0], landing[1], Math.max(landing[2], target[2])], projectile.launchTick + projectile.landTick, seed * 17 + i));
  });
  return (
    <>
      {age > 0 && (
        <MinecraftSpace 位={target}>
          <group scale={[-1, -1, 1]}>
            <ModelPart model={volcanoModel} image={png(volcanoPng)} partPoses={{ volcano: { offset: [0, 60 - age, 0] } }} />
            {steady && <ModelPart model={volcanoModel} image={png(volcanoActivePng)} 画法="发光" partPoses={{ volcano: { offset: [0, 0, 0] } }} />}
          </group>
        </MinecraftSpace>
      )}
      {projectiles.map((projectile, i) => {
        const n = tick - projectile.launchTick;
        if (n < 0 || n >= projectile.landTick) return null;
        const pos = trajectoryPos(projectile.trajectory, n);
        const v = trajectoryDir(projectile.trajectory, n);
        // 换成游戏坐标：vx = v[0]，vy = v[2]，vz = −v[1]
        const yRot = -(Math.atan2(-v[1], v[0]) + Math.PI / 2);
        const xRot = -(Math.atan2(Math.hypot(v[0], v[1]), v[2]) - Math.PI / 2);
        return (
          <MinecraftSpace key={i} 位={pos}>
            <group position={[0, 0.25, 0]}>
              <group rotation={[0, yRot, 0]}>
                <group rotation={[xRot, 0, 0]}>
                  <ModelPart model={blastFungusModel} image={png(pyroclastPng)} />
                </group>
              </group>
            </group>
          </MinecraftSpace>
        );
      })}
      <VanillaParticles spawns={smokeSpawns} sec={sec} size={2.5} />
      <VanillaParticles spawns={flames} sec={sec} />
      <VanillaParticles spawns={blastParticles} sec={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, Eruption);
