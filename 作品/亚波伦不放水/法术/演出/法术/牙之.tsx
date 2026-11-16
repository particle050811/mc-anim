// 牙之。出处 goety 2.5.60.6：TeethSpell、ViciousTooth、ViciousToothRenderer、ViciousToothModel、ViciousPike、ViciousPikeRenderer、ViciousPikeModel、MinisterAnimations.SPIKE、FastFallDust。
// - 默认法杖：目标那格正上方 8 格出一颗大牙（上面有东西挡就低一些），悬停 60 刻（困难 40）后每刻加速 0.25 格/刻落下。
// - 大牙渲染器：mulPose(Y 90° − yRot)，scale(−f, −f, f)（头 20 刻 f = 悬停刻 ÷ 20），translate(0, −2.1, 0)；模型默认的 entityCutoutNoCull。
//   setupAnim：头 20 刻每画一帧 base.yRot += partialTick × 0.5（转速跟帧率走，这里按每刻 0.75 弧度算，60 帧时大致是这个数）。
// - 悬停时每刻 circularParticles(FAST_DUST 凝灰岩, 半径 0.25) = 1 颗：FastFallDust，白色（凝灰岩没有染色），generic 7 → 0 按年龄，
//   半边长 0.1 × (0.5～1) × 0.675，寿命 0.9 × 32 ÷ (随机 × 0.8 + 0.2) 刻，出生不带速度、每刻往下加速 0.01 到 0.14 封顶，落地停。
// - 落地或砸到人（onHit）：256 颗凝灰岩碎屑（散布半个碰撞箱，speed 1）；前后左右四个邻格各一根尖桩（位置是格子的整数角，不是格子中心，贴地抬 0.0625）。
// - 尖桩渲染器：scale(−2.25, −2.25, 2.25)（进度过 0.9 缩没），translate(0, −0.73, 0)，scale(0.5)；动作是关键帧 SPIKE（0.625 秒，线性）：
//   base、bone、bone2、bone3 分别从缩进 12、10、10、8 像素处在 0.125 秒里顶出来，停到 0.4167 秒，再在 0.625 秒缩回去；之后停在缩回的样子到第 22 刻消失。
// 没做 / 粗做：大牙碰撞箱的高度没查，按牙尖到史蒂夫头顶算命中；尖桩把人顶起一格（那是史蒂夫的事）。配灾厄法杖的 16 颗乱落不做。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { defineSpellPerformance } from '../定义.tsx';
import type { SpellPerformanceProps, Vec3 } from '../接口.ts';
import { MinecraftSpace, getModel, degToRad, ModelPart } from '../零件/实体.tsx';
import { facePatch, QuadGroup, type QuadItem } from '../零件/面片.tsx';
import { scatterDebris, BlockDebris } from '../零件/方块屑.tsx';
import meta, { bigFangHitTick, bigFangHoverTick, greatFangHeight, stakeLifeTicks } from './牙之.元.ts';
import viciousToothModelData from 'asset:模型/法术/goety/ViciousToothModel';
import viciousPikeModelData from 'asset:模型/法术/goety/ViciousPikeModel';
import viciousToothPng from 'asset:贴图/法术/goety/entity/projectiles/vicious_tooth';
import viciousPikePng from 'asset:贴图/法术/goety/entity/projectiles/vicious_pike';
import tuffPng from 'asset:贴图/法术/minecraft/block/tuff';
import generic0Png from 'asset:贴图/特效/粒子/generic_0';
import generic1Png from 'asset:贴图/特效/粒子/generic_1';
import generic2Png from 'asset:贴图/特效/粒子/generic_2';
import generic3Png from 'asset:贴图/特效/粒子/generic_3';
import generic4Png from 'asset:贴图/特效/粒子/generic_4';
import generic5Png from 'asset:贴图/特效/粒子/generic_5';
import generic6Png from 'asset:贴图/特效/粒子/generic_6';
import generic7Png from 'asset:贴图/特效/粒子/generic_7';
import { mulberry32 } from '@engine/core/数学.ts';

const viciousToothModel = getModel(viciousToothModelData, 'ViciousToothModel');
const viciousPikeModel = getModel(viciousPikeModelData, 'ViciousPikeModel');
const dustFrames = [generic7Png, generic6Png, generic5Png, generic4Png, generic3Png, generic2Png, generic1Png, generic0Png].map(png);
const tuffImg = png(tuffPng);

const GreatFang: React.FC<{ 位: Vec3; 刻: number }> = ({ 位: pos, 刻: tick }) => {
  const f = Math.min(1, Math.floor(tick) / 20);
  if (f <= 0) return null;
  const partPoses = tick < 20 ? { base: { rot: [0, tick * 0.75, 0] } } : undefined;
  return (
    <MinecraftSpace 位={pos}>
      <group rotation={[0, degToRad(90), 0]}>
        <group scale={[-f, -f, f]}>
          <group position={[0, -2.1, 0]}>
            <ModelPart model={viciousToothModel} image={png(viciousToothPng)} partPoses={partPoses} />
          </group>
        </group>
      </group>
    </MinecraftSpace>
  );
};

// SPIKE 的四个通道都是同一条时间线，只差缩进多少像素
const stakeShrink = (sec: number) => (sec <= 0.125 ? 1 - sec / 0.125 : sec <= 0.4167667 ? 0 : Math.min(1, (sec - 0.4167667) / (0.625 - 0.4167667)));
const Stake: React.FC<{ 位: Vec3; 刻: number }> = ({ 位: pos, 刻: tick }) => {
  if (tick < 0 || tick >= stakeLifeTicks) return null;
  const progress = 1 - (stakeLifeTicks - tick) / 20;
  const f1 = 2.25 * (progress > 0.9 ? Math.max(0, (1 - progress) / 0.1) : 1);
  if (f1 <= 0) return null;
  const shrink = stakeShrink(tick / 20);
  // posVec(0, −n, 0) 加到部件上是 y + n（模型 y 朝下：缩回地里）
  const partPoses = { base: { offset: [0, 12 * shrink, 0] }, bone: { offset: [0, -12 + 10 * shrink, 0] }, bone2: { offset: [0, -10 + 10 * shrink, 0] }, bone3: { offset: [0, -10 + 8 * shrink, 0] } };
  return (
    <MinecraftSpace 位={pos}>
      <group rotation={[0, degToRad(90), 0]}>
        <group scale={[-f1, -f1, f1]}>
          <group position={[0, -0.73, 0]}>
            <group scale={[0.5, 0.5, 0.5]}>
              <ModelPart model={viciousPikeModel} image={png(viciousPikePng)} partPoses={partPoses} />
            </group>
          </group>
        </group>
      </group>
    </MinecraftSpace>
  );
};

/** 悬停时往下掉的灰尘：每刻一颗 */
const dustFall = (fangPos: Vec3, groundZ: number, tick: number, seed: number): Map<number, QuadItem[]> => {
  const byFrame = new Map<number, QuadItem[]>();
  for (let t = 0; t <= Math.min(Math.floor(tick), bigFangHoverTick); t++) {
    const r = mulberry32(seed * 613 + t);
    const [angle, randDistance] = [r() * Math.PI * 2, Math.sqrt(r()) * 0.25];
    const lifetime = Math.max(1, Math.floor(Math.floor(32 / (r() * 0.8 + 0.2)) * 0.9));
    const age = tick - t;
    if (age >= lifetime) continue;
    const halfSize = 0.1 * (r() * 0.5 + 0.5) * 0.675;
    const [rotSpeed, spinInit] = [(r() - 0.5) * 0.1, r() * Math.PI * 2];
    // 第 j 刻移动用的速度是 −min(0.14, 0.01 × j)
    let fallDist = 0;
    for (let j = 0; j < Math.floor(age); j++) fallDist += Math.min(0.14, 0.01 * j);
    fallDist += Math.min(0.14, 0.01 * Math.floor(age)) * (age % 1);
    const z = Math.max(groundZ, fangPos[2] - fallDist);
    const frame = Math.min(7, Math.floor((age * 8) / lifetime));
    if (!byFrame.has(frame)) byFrame.set(frame, []);
    byFrame.get(frame)!.push(facePatch([fangPos[0] + Math.cos(angle) * randDistance, fangPos[1] + Math.sin(angle) * randDistance, z], halfSize * Math.min(1, (age / lifetime) * 32), undefined, undefined, undefined, z > groundZ ? spinInit + Math.PI * rotSpeed * 2 * age : 0));
  }
  return byFrame;
};

const FangAttack: React.FC<SpellPerformanceProps> = ({ sec: sec, target: target, seed: seed }) => {
  const tick = sec * 20;
  const fangPos: Vec3 = [target[0], target[1], target[2] + greatFangHeight(Math.min(tick, bigFangHitTick))];
  const dust = dustFall([target[0], target[1], target[2] + greatFangHeight(0)], target[2], tick, seed);
  // 命中时牙还在史蒂夫头顶；碎屑从牙身中间（碰撞箱按 1 × 1.5 估）炸开
  const slamPos: Vec3 = [target[0], target[1], target[2] + greatFangHeight(bigFangHitTick) + 0.75];
  // 尖桩在邻格的整数角上：格子中心往西北退半格（游戏的 −x、−z）再加方向
  const stakePositions = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).map(([dx, dy]): Vec3 => [target[0] - 0.5 + dx, target[1] + 0.5 + dy, target[2] + 0.0625]);
  return (
    <>
      {tick < bigFangHitTick && <GreatFang 位={fangPos} 刻={tick} />}
      {dustFrames.map((image, i) => (
        <QuadGroup key={i} image={image} items={dust.get(i) ?? []} blend="镂空" />
      ))}
      <BlockDebris spawns={scatterDebris(slamPos, 256, [0.5, 0.5, 0.75], 1, bigFangHitTick, seed * 17)} sec={sec} image={tuffImg} ground={target[2]} />
      {stakePositions.map((pos, i) => (
        <Stake key={i} 位={pos} 刻={tick - bigFangHitTick - 1} />
      ))}
    </>
  );
};

export default defineSpellPerformance(meta, FangAttack);
