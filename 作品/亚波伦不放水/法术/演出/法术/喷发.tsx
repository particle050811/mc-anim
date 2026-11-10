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
import { rng } from '@engine/model/parts.tsx';
import { 定义法术演出 } from '../定义.tsx';
import type { 法术演出属性, 点 } from '../接口.ts';
import { 抛物线, 弹道位置, 弹道方向, type 弹道 } from '../零件/弹道.ts';
import { MC空间, 取模型, 模型件 } from '../零件/实体.tsx';
import { VanillaParticles, type ParticleSpawn } from '../零件/粒子.tsx';
import { 大爆炸 } from '../零件/乙爆炸.tsx';
import 元, { 喷发刻, 火山升刻, 火山寿命刻, 火山弹最长刻, 火山龄 } from './喷发.元.ts';
import 火山模型数据 from 'asset:模型/法术/goety/VolcanoModel';
import 弹模型数据 from 'asset:模型/法术/goety/BlastFungusModel';
import 火山图 from 'asset:贴图/法术/goety/entity/monolith/volcano';
import 火山亮图 from 'asset:贴图/法术/goety/entity/monolith/volcano_active';
import 弹图 from 'asset:贴图/法术/goety/entity/projectiles/pyroclast';

const 火山模型 = 取模型(火山模型数据, 'VolcanoModel');
const 弹模型 = 取模型(弹模型数据, 'BlastFungusModel');

type 弹 = { 出刻: number; 道: 弹道; 落刻: number };
const 排弹 = (目标: 点, 种子: number): 弹[] =>
  喷发刻.map((出刻, i) => {
    const r = rng(种子 * 761 + i);
    const 三角 = () => (r() - r()) * 0.0172275 * 12;
    const 向: 点 = [三角(), 三角(), 1 + 三角()];
    const 长 = Math.hypot(向[0], 向[1], 向[2]);
    const 道 = 抛物线([目标[0], 目标[1], 目标[2] + 0.6], [(向[0] / 长) * 1.5, (向[1] / 长) * 1.5, (向[2] / 长) * 1.5]);
    let 落刻 = 0;
    if (i > 0) {
      落刻 = 1;
      while (落刻 < 火山弹最长刻 && 道(落刻)[2] > 目标[2]) 落刻++;
    }
    return { 出刻, 道, 落刻 };
  });

const 喷发: React.FC<法术演出属性> = ({ 秒, 目标, 种子 }) => {
  const 刻 = 秒 * 20;
  const 龄 = 火山龄(刻);
  const 立稳 = 刻 >= 火山升刻 && 刻 < 火山寿命刻;
  const 弹们 = 排弹(目标, 种子);
  const 烟: ParticleSpawn[] = [];
  const 火: ParticleSpawn[] = [];
  const 炸: ParticleSpawn[] = [];
  for (let t = 火山升刻; t < Math.min(火山寿命刻, 刻); t++) if (!喷发刻.includes(t)) 烟.push({ 种: 'smoke', 刻: t, p: [目标[0], 目标[1], 目标[2]], 种子: 种子 * 9000 + t });
  弹们.forEach((弹, i) => {
    const r = rng(种子 * 131 + i);
    for (let n = 1; n <= 弹.落刻 && 弹.出刻 + n <= 刻; n++) {
      const 下 = 弹.道(n + 1);
      烟.push({ 种: 'smoke', 刻: 弹.出刻 + n, p: [下[0] + r() / 2, 下[1] - r() / 2, 下[2] + 0.5], 种子: 种子 * 70000 + i * 200 + n });
      火.push({ 种: 'flame', 刻: 弹.出刻 + n, p: [下[0] + r() / 2, 下[1] - r() / 2, 下[2] + 0.5], 种子: 种子 * 90000 + i * 200 + n });
    }
    const 落 = 弹.道(弹.落刻);
    炸.push(...大爆炸([落[0], 落[1], Math.max(落[2], 目标[2])], 弹.出刻 + 弹.落刻, 种子 * 17 + i));
  });
  return (
    <>
      {龄 > 0 && (
        <MC空间 位={目标}>
          <group scale={[-1, -1, 1]}>
            <模型件 模型={火山模型} 图={png(火山图)} 姿态={{ volcano: { offset: [0, 60 - 龄, 0] } }} />
            {立稳 && <模型件 模型={火山模型} 图={png(火山亮图)} 画法="发光" 姿态={{ volcano: { offset: [0, 0, 0] } }} />}
          </group>
        </MC空间>
      )}
      {弹们.map((弹, i) => {
        const n = 刻 - 弹.出刻;
        if (n < 0 || n >= 弹.落刻) return null;
        const 位 = 弹道位置(弹.道, n);
        const v = 弹道方向(弹.道, n);
        // 换成游戏坐标：vx = v[0]，vy = v[2]，vz = −v[1]
        const yRot = -(Math.atan2(-v[1], v[0]) + Math.PI / 2);
        const xRot = -(Math.atan2(Math.hypot(v[0], v[1]), v[2]) - Math.PI / 2);
        return (
          <MC空间 key={i} 位={位}>
            <group position={[0, 0.25, 0]}>
              <group rotation={[0, yRot, 0]}>
                <group rotation={[xRot, 0, 0]}>
                  <模型件 模型={弹模型} 图={png(弹图)} />
                </group>
              </group>
            </group>
          </MC空间>
        );
      })}
      <VanillaParticles spawns={烟} 秒={秒} size={2.5} />
      <VanillaParticles spawns={火} 秒={秒} />
      <VanillaParticles spawns={炸} 秒={秒} />
    </>
  );
};

export default 定义法术演出(元, 喷发);
