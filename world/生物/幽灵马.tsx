// 幽灵马（铁魔法「召唤骏马」召出来的 SummonedHorse，游戏里叫 spectral_steed）：原版马的模型 + 铁魔法的贴图（npm run 取材 -- 幽灵马）。
// 出处（irons_spellbooks-1.20.1-3.16.3.jar + 原版 1.20.1 SRG 客户端 jar，javap 反汇编）：
// - SpectralSteedRenderer extends AbstractHorseRenderer：模型就是原版 HorseModel（ModelLayers.HORSE，createBodyMesh(CubeDeformation.NONE)，贴图 64×64），
//   缩放 1.1（AbstractHorseRenderer.scale，绕脚底）；贴图 irons_spellbooks:textures/entity/horse/spectral_steed.png（淡蓝白的马身 + 原版样式的棕色马鞍），
//   没有别的层（原版 HorseRenderer 的花纹、马铠层它没加）。渲染类型是模型默认的 entityCutoutNoCull——不是半透明的，「幽灵」只在贴图颜色上。
// - 实体尺寸 1.3964844×1.6（EntityRegistry），isSaddled、isTamed 恒为真：马鞍那几块（saddle、嘴两侧、头套、嘴套）一直画，
//   有人骑（isVehicle）时再画两根缰绳（left/right_saddle_line）；幼马的四条腿不画。
// - 动作 HorseModel.prepareMobModel + setupAnim（照字节码，eat/mouth 动画是 0、不在水里、尾巴不甩；人立量 s 见 `steedPose`、`steedStand`）：
//   头组 head_parts 在 (0,4,−12)、xRot = 30° + 头仰（limbSwingAmount > 0.2 时再 + cos(limbSwing×0.8)×0.15×limbSwingAmount，跑起来点头）、
//   yRot = 头偏（夹在 ±20°）；f11 = cos(limbSwing×0.6662 + π)、f12 = f11×0.8×amount：前腿 y 14、z −10，左前 xRot = f12、右前 = −f12，
//   左后 xRot = −f11×0.5×amount、右后 = +f11×0.5×amount；尾巴 xRot = 30° + amount×0.75、y = −5 + amount、z = 2 + 2×amount；身子 y = 11。
// - 骑乘：马鞍上的人脚底在 马的位置 + 1.6×0.75 − 0.35 = 0.85 格（Entity.positionRider 默认 bbHeight×0.75，玩家 getMyRidingOffset −0.35）；
//   人的骑马姿势是原版 HumanoidModel riding：两腿 xRot −81°、yRot ±18°（往外张），两臂 xRot −36°（见 VANILLA_RIDE）。
// - 起跳人立（SummonedHorse 没改这些）：玩家按住空格只蓄力（LocalPlayer.aiStep 的 jumpRidingScale），松开那一刻才发 START_RIDING_JUMP，
//   服务端 handleStartJump → standIfPossible：standCounter = 1、setStanding(true)，每刻 +1、过 20 放下；同一刻马起跳。所以人立和离地同时开始，和跳多久无关。
// - 粒子（SummonedHorse.tick → spawnParticles，客户端）：每刻 25% 的概率放 1 个 enchant（附魔台那种字母），
//   位置 = 马 + d + (0,1,0)，d 各分量 = 随机×1.5 − 0.75，速度 = (d×0.01, 0.08 + d.y×0.01, d×0.01)。见 幽灵马粒子()。
// - 召唤（SummonHorseSpell.onCast）：马出生在施法者脚下 + 朝向×1.5 + (0, 0.15, 0)，存在 12000 刻；施法 1 秒（castTime 20、LONG），
//   音效 entity.illusioner.prepare_mirror（开始）→ entity.illusioner.mirror_move（完成）。召唤本身不放粒子；到期 onUnSummon 放 25 个 poof。
//   马的叫声、脚步、死亡用原版马的（entity.horse.*）。
// 坐标：原点在脚底中心，Z 朝上，正面朝 −Y（lib/实体模型.tsx）。
import React from 'react';
import { rng, V3 } from '../../engine/model/parts.tsx';
import { EntityModel, EntityModelData } from '../../engine/model/实体模型.tsx';
import { mthCos, restPose, toPartPoses } from '../../engine/anim/关键帧动画.ts';
import { png } from '../../engine/model/贴图.ts';
import { VanillaTopple } from '../特效/原版死亡.tsx';
import type { ParticleSpawn } from '../特效/原版粒子.tsx';
import raw from 'asset:模型/角色/幽灵马';
import tex from 'asset:贴图/角色/幽灵马';

const MODEL = (raw as unknown as { models: { 幽灵马: EntityModelData } }).models.幽灵马;
const TEX = png(tex);
const DEG = Math.fround(0.017453292);

export const STEED = {
  scale: 1.1,
  box: [1.3964844, 1.6] as [number, number],
  riderHeight: 1.6 * 0.75 - 0.35, // 骑手脚底离马脚底
  summonForward: 1.5, // 出生在施法者前方 1.5 格、高 0.15 格
};
// 原版 HumanoidModel 骑乘姿势（setupAnim 里 riding 那一支），给骨架.tsx 换算用：度，原版 ModelPart 的 xRot/yRot
export const VANILLA_RIDE = { legXRot: -81, legYRot: 18, armXRot: -36 };

export type SteedProps = {
  秒: number; // 游戏时间
  行走?: { 相位: number; 幅度: number }; // limbSwing（累计）、limbSwingAmount（0～1）；用 马步态() 从速度算
  头偏?: number; // 度，夹在 ±20
  headPitch?: number; // 度
  人立?: number; // 原版 standAnim（0～1），起跳时用 steedStand() 从起跳时刻算
  有人骑?: boolean; // 画缰绳
  brightness?: number; // 原版实体光照的亮度，默认 1（夜视）
  secSinceDeath?: number;
  受伤?: number;
};

// 匀速跑时的 limbSwingAmount、limbSwing：原版 WalkAnimationState.update(min(每刻位移×4, 1), 0.4)，匀速时 amount 收敛到 min(1, 4×速度/20)，
// limbSwing 每刻 += amount。速度单位 格/秒；秒 = 跑了多久
export const horseGait = (speed: number, runSec: number) => {
  const swingAmount = Math.min(1, (4 * speed) / 20);
  return { 相位: runSec * 20 * swingAmount, 幅度: swingAmount };
};

const RIDING = ['left_saddle_line', 'right_saddle_line'];
const BABY = ['left_hind_baby_leg', 'right_hind_baby_leg', 'left_front_baby_leg', 'right_front_baby_leg'];

export const steedPose = (props: SteedProps) => {
  const pose = restPose(MODEL.root);
  const ls = props.行走?.相位 ?? 0;
  const la = props.行走?.幅度 ?? 0;
  const s = props.人立 ?? 0; // f11（standAnim）；eat 是 0，所以 1 − max(stand, eat) = 1 − s
  const r = 1 - s;
  const f3 = Math.max(-20, Math.min(20, props.头偏 ?? 0));
  let f4 = (props.headPitch ?? 0) * DEG;
  if (la > 0.2) f4 += mthCos(ls * 0.8) * 0.15 * la;
  // 人立：头组往上往后挪到 (−4, −4)、低头角从 30° 收到 15°；身子绕后胯 (y 11, z 5) 往上翻 45°；前腿挪上去刨（cos(age×0.6 + π) 来回 ±1 弧度，围着 −60°），后腿往前 15°
  const hp = pose.head_parts;
  hp.offset = [0, -4 * s + 4 * r, -4 * s - 12 * r];
  hp.rot = [s * (Math.fround(0.2617994) + f4) + r * (Math.fround(0.5235988) + f4), f3 * DEG, 0];
  pose.body.rot[0] = Math.fround(-0.7853982) * s;
  pose.body.offset = [pose.body.offset[0], 11, pose.body.offset[2]];
  const f11 = mthCos(ls * 0.6662 + Math.PI);
  const f12 = f11 * 0.8 * la;
  const paw = mthCos(props.秒 * 20 * 0.6 + Math.PI);
  for (const leg of ['left_front_leg', 'right_front_leg']) pose[leg].offset = [pose[leg].offset[0], 2 * s + 14 * r, -6 * s - 10 * r];
  const hindTilt = Math.fround(0.2617994) * s;
  pose.left_hind_leg.rot[0] = hindTilt - f11 * 0.5 * la * r;
  pose.right_hind_leg.rot[0] = hindTilt + f11 * 0.5 * la * r;
  pose.left_front_leg.rot[0] = (Math.fround(-1.0471976) + paw) * s + f12 * r;
  pose.right_front_leg.rot[0] = (Math.fround(-1.0471976) - paw) * s - f12 * r;
  pose.tail.rot = [Math.PI / 6 + la * 0.75, 0, 0];
  pose.tail.offset = [0, -5 + la, 2 + la * 2];
  return pose;
};

// 人立量 standAnim（AbstractHorse.tick）：立着每刻 s += (1 − s)×0.4 + 0.05（封顶 1，5 刻立满），放下每刻 s += (0.8s³ − s)×0.6 − 0.05（到 0，5 刻落平）。
// 起跳那一刻 setStanding(true)，往后 19 刻立着、第 20 刻放下（standCounter 过 20）；没落平又起跳就重新数。刻与刻之间按 partialTick 线性插值。
// takeoffs：这匹马每一跃离地的时刻（秒，升序，可以有负的——上一场的跳）；t 秒。
const STAND_TICKS = 19;
const FADE_TICKS = 5;
export const steedStand = (takeoffs: readonly number[], t: number): number => {
  let last = -1;
  for (let i = 0; i < takeoffs.length; i++) if (takeoffs[i] <= t) last = i;
  if (last < 0) return 0;
  // 往前找连着的那几跳（上一跳还没落平就又跳了），从其中第一跳那一刻起逐刻算
  let first = last;
  while (first > 0 && takeoffs[first] - takeoffs[first - 1] < (STAND_TICKS + FADE_TICKS + 1) / 20) first--;
  const starts = takeoffs.slice(first, last + 1).map((t0) => (t0 - takeoffs[first]) * 20);
  const tau = (t - takeoffs[first]) * 20;
  const k = Math.floor(tau);
  if (k > starts[starts.length - 1] + STAND_TICKS + FADE_TICKS + 1) return 0;
  let prev = 0;
  let cur = 0;
  for (let tick = 1; tick <= k + 1; tick++) {
    prev = cur;
    const standing = starts.some((start) => tick > start && tick <= start + STAND_TICKS);
    cur = standing ? Math.min(1, cur + (1 - cur) * 0.4 + 0.05) : Math.max(0, cur + (0.8 * cur * cur * cur - cur) * 0.6 - 0.05);
  }
  return prev + (cur - prev) * (tau - k);
};
// 马和骑手的人立量：骑手（positionRider）用的是上一刻的 standAnimO，比马晚 1 刻
export const steedRear = (takeoffs: readonly number[], t: number) => ({ 马: steedStand(takeoffs, t), 骑手: steedStand(takeoffs, t - 1 / 20) });
// 骑手脚底（AbstractHorse.positionRider）：马脚底 + 骑乘高，人立时再往后 0.7 格、往上 0.15 格 × 骑手人立量。yaw 同骨架（正 = 往左，0 朝 +Y）
export const riderFeet = (horseFeet: V3, yaw: number, rear = 0): V3 => {
  const yawRad = (yaw * Math.PI) / 180;
  return [horseFeet[0] + 0.7 * rear * Math.sin(yawRad), horseFeet[1] - 0.7 * rear * Math.cos(yawRad), horseFeet[2] + STEED.riderHeight + 0.15 * rear];
};

export const SpectralSteed: React.FC<SteedProps> = (props) => {
  if (props.secSinceDeath !== undefined && props.secSinceDeath >= 1) return null;
  const pose = toPartPoses(steedPose(props));
  for (const partName of BABY) pose[partName] = { ...pose[partName], hide: true };
  if (!props.有人骑) for (const partName of RIDING) pose[partName] = { ...pose[partName], hide: true };
  const red = props.secSinceDeath !== undefined && props.secSinceDeath >= 0 ? 1 : (props.受伤 ?? 0);
  return (
    <VanillaTopple secSinceDeath={props.secSinceDeath}>
      <EntityModel model={MODEL} tex={TEX} pose={pose} scale={STEED.scale} hurt={red} mcLight={props.brightness ?? 1} />
    </VanillaTopple>
  );
};

// 马身上冒的附魔字母：位置(刻) 给马脚底的场景位置；t0、t1 秒之间每刻 25% 放一个
export const steedParticles = (posAtTick: (tick: number) => V3, t0: number, t1: number, seed: number): ParticleSpawn[] => {
  const rand = rng(seed * 6007 + 1);
  const out: ParticleSpawn[] = [];
  for (let k = Math.ceil(t0 * 20); k <= t1 * 20; k++) {
    if (rand() >= 0.25) continue;
    // 游戏坐标 d = (x, y 上, z) → 场景 (x, −z, y)
    const gx = rand() * 2 * 0.75 - 0.75;
    const gy = rand() * 2 * 0.75 - 0.75;
    const gz = rand() * 2 * 0.75 - 0.75;
    const at = posAtTick(k);
    out.push({ 种: 'enchant', 刻: k, p: [at[0] + gx, at[1] - gz, at[2] + gy + 1], v: [gx * 0.01, -gz * 0.01, 0.08 + gy * 0.01], 种子: seed * 389 + k });
  }
  return out;
};
