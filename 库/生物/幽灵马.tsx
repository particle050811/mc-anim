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
import { type V3 } from '../../engine/model/parts.tsx';
import { EntityModel, type EntityModelData } from '../../engine/model/实体模型.tsx';
import { mthCos, restPose, toPartPoses } from '../../engine/anim/关键帧动画.ts';
import { png } from '../../engine/model/贴图.ts';
import { VanillaTopple } from '../特效/原版死亡.tsx';
import type { ParticleSpawn } from '../特效/原版粒子.tsx';
import raw from 'asset:模型/角色/幽灵马';
import tex from 'asset:贴图/角色/幽灵马';
import { mulberry32 } from '../../engine/core/数学.ts';
import { STEED } from './幽灵马骑乘.ts';

export { STEED, VANILLA_RIDE, horseGait, steedStand, steedRear, riderFeet } from './幽灵马骑乘.ts';

const MODEL = (raw as unknown as { models: { 幽灵马: EntityModelData } }).models.幽灵马;
const TEX = png(tex);
const DEG = Math.fround(0.017453292);

export type SteedProps = {
  sec: number; // 游戏时间
  walkCycle?: { legPhase: number; amplitude: number }; // limbSwing（累计）、limbSwingAmount（0～1）；用 马步态() 从速度算
  headYaw?: number; // 度，夹在 ±20
  headPitch?: number; // 度
  rearAmount?: number; // 原版 standAnim（0～1），起跳时用 steedStand() 从起跳时刻算
  hasRider?: boolean; // 画缰绳
  brightness?: number; // 原版实体光照的亮度，默认 1（夜视）
  secSinceDeath?: number;
  hurt?: number;
};

const RIDING = ['left_saddle_line', 'right_saddle_line'];
const BABY = ['left_hind_baby_leg', 'right_hind_baby_leg', 'left_front_baby_leg', 'right_front_baby_leg'];

export const steedPose = (props: SteedProps) => {
  const pose = restPose(MODEL.root);
  const ls = props.walkCycle?.legPhase ?? 0;
  const la = props.walkCycle?.amplitude ?? 0;
  const s = props.rearAmount ?? 0; // f11（standAnim）；eat 是 0，所以 1 − max(stand, eat) = 1 − s
  const r = 1 - s;
  const f3 = Math.max(-20, Math.min(20, props.headYaw ?? 0));
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
  const paw = mthCos(props.sec * 20 * 0.6 + Math.PI);
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

export const SpectralSteed: React.FC<SteedProps> = (props) => {
  if (props.secSinceDeath !== undefined && props.secSinceDeath >= 1) return null;
  const pose = toPartPoses(steedPose(props));
  for (const partName of BABY) pose[partName] = { ...pose[partName], hide: true };
  if (!props.hasRider) for (const partName of RIDING) pose[partName] = { ...pose[partName], hide: true };
  const red = props.secSinceDeath !== undefined && props.secSinceDeath >= 0 ? 1 : (props.hurt ?? 0);
  return (
    <VanillaTopple secSinceDeath={props.secSinceDeath}>
      <EntityModel model={MODEL} tex={TEX} pose={pose} scale={STEED.scale} hurt={red} mcLight={props.brightness ?? 1} />
    </VanillaTopple>
  );
};

// 马身上冒的附魔字母：位置(刻) 给马脚底的场景位置；t0、t1 秒之间每刻 25% 放一个
export const steedParticles = (posAtTick: (tick: number) => V3, t0: number, t1: number, seed: number): ParticleSpawn[] => {
  const rand = mulberry32(seed * 6007 + 1);
  const out: ParticleSpawn[] = [];
  for (let k = Math.ceil(t0 * 20); k <= t1 * 20; k++) {
    if (rand() >= 0.25) continue;
    // 游戏坐标 d = (x, y 上, z) → 场景 (x, −z, y)
    const gx = rand() * 2 * 0.75 - 0.75;
    const gy = rand() * 2 * 0.75 - 0.75;
    const gz = rand() * 2 * 0.75 - 0.75;
    const at = posAtTick(k);
    out.push({ kind: 'enchant', 刻: k, p: [at[0] + gx, at[1] - gz, at[2] + gy + 1], v: [gx * 0.01, -gz * 0.01, 0.08 + gy * 0.01], seed: seed * 389 + k });
  }
  return out;
};
