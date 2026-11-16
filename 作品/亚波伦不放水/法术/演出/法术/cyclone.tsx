// 气旋。出处 goety 2.5.60.6：CycloneSpell、Cyclone（AbstractCyclone）、CycloneRenderer、CycloneModel；原版 PlayerCloudParticle。
// - 弹：惯性 0.68 朝目标飘；卷到人后停在那转，spun 数到 80 刻散掉，散的时候放 50 颗 cloud。飞的时候每刻一颗 cloud。
// - 模型 CycloneModel（四节越往上越粗的方筒叠起来，外面套一层 16×24×16 的风）：PoseStack translate(0, 1.5 × size, 0) · ZP(180°) · scale(size)，size = 1；entityTranslucent alpha 0.45。
//   setupAnim：base.yRot = 年龄，往上每节在父节的转动上再叠（换算下来 bottom −0.5 × 年龄、mid −0.2 × 年龄、top 0.3 × 年龄），wind.yRot = 年龄 × 0.25（弧度）。
// 自己定的：游戏里从施法者脚边贴地出发，片里从 起点（空中）直着飘到史蒂夫脚下。
// 没做：setupAnim 里的 chainFlap（四节左右摆动，没读）；卷到人之后把人往上带。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps } from '../接口.ts';
import { trajectoryPos } from '../零件/弹道.ts';
import { MinecraftSpace, getModel, degToRad, ModelPart } from '../零件/实体.tsx';
import { TexturedParticles, type ParticleBirth } from '../零件/粒子.tsx';
import { eachTick, gaussian } from '../零件/甲/共用.ts';
import { cloudParticle, cloudClass } from '../零件/甲/原版粒子.ts';
import meta, { cycloneArriveTick, cycloneCurlTicks, cyclonePath } from './cyclone.元.ts';
import cycloneModelData from 'asset:模型/法术/goety/CycloneModel';
import cyclonePng from 'asset:贴图/法术/goety/entity/projectiles/cyclone';
import { mulberry32 } from '@engine/core/数学.ts';

const cycloneModel = getModel(cycloneModelData, 'CycloneModel');

const Cyclone: React.FC<SpellPerformanceProps> = ({ sec: sec, from, target: target, seed: seed, options }) => {
  const tick = sec * 20;
  const trajectory = cyclonePath(from, target, options?.highSpeed);
  const arriveTick = cycloneArriveTick(from, target, options?.highSpeed);
  const scatterTick = arriveTick + cycloneCurlTicks;
  const r = mulberry32(seed * 37 + 3);
  const clouds: ParticleBirth[] = eachTick(1, Math.min(tick, arriveTick)).map((n) => cloudParticle(r, n, trajectory(n)));
  if (tick >= scatterTick) {
    const p = trajectory(arriveTick);
    for (let i = 0; i < 50; i++) clouds.push(cloudParticle(r, scatterTick, [p[0] + gaussian(r) * 0.5, p[1] + gaussian(r) * 0.5, p[2] + 0.75 + gaussian(r) * 0.75], [gaussian(r) * 0.05, gaussian(r) * 0.05, gaussian(r) * 0.05]));
  }
  const spinPose = (k: number) => ({ rot: [0, tick * k, 0] });
  return (
    <>
      {tick < scatterTick && (
        <MinecraftSpace 位={trajectoryPos(trajectory, Math.min(tick, arriveTick))}>
          <group position={[0, 1.5, 0]} rotation={[0, 0, degToRad(180)]}>
            <ModelPart model={cycloneModel} image={png(cyclonePng)} 画法="半透明" opacity={0.45} partPoses={{ base: spinPose(1), bottom: spinPose(-0.5), mid: spinPose(-0.2), top: spinPose(0.3), wind: spinPose(0.25) }} />
          </group>
        </MinecraftSpace>
      )}
      <TexturedParticles type={cloudClass} spawns={clouds} sec={sec} />
    </>
  );
};

export default defineSpellPerformance(meta, Cyclone);
