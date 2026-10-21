// 监守者（原版 1.20.1 Warden，远古城市）：模型、贴图、发光层、动作全部照抄原版客户端（npm run 取材 -- 监守者）。
// 依据原版 SRG 客户端 jar 的 javap 反汇编（官方名对照查 取材mod/build/createMcpToSrg/output.tsrg）：
// - 模型 `WardenModel.createBodyLayer`：贴图 128×128，11 个部件、10 个方盒；站直头顶 3.125 格、触角尖 3.69；碰撞箱 0.9×2.9，钻出和挖地时 0.9×1.0。`WardenRenderer` 影子半径 0.9，不额外缩放。
// - 5 个 `WardenEmissiveLayer`（全亮、半透明、不写深度、两面画，只乘方向明暗，每层只画指定部件）：
//   1 bioluminescent_layer alpha 恒 1（头、臂、腿）；2、3 pulsating_spots_1/2 alpha=max(0,cos(刻×0.045[+π])×0.25)（身子头臂腿，周期约 7 秒）；
//   4 warden.png 重画 alpha=`getTendrilAnimation`（两片触角）；5 warden_heart alpha=`getHeartAnimation`（身子，心脏高 1.13～1.69 格）。隐身都不画。
// - 心跳（`Warden.tick`）：tickCount % 间隔 == 0 时 heartAnimation=10，每刻减 1，取值 /10；间隔 = 40 − floor(clamp(怒气/80,0,1)×30) 刻。
// - 触角：实体事件 61（听到震动）设 tendrilAnimation=10，每刻减 1，/10；摆动 = 触角动画×cos(刻×2.25)×π×0.1（左右相反）。
// - `WardenModel.setupAnim` 顺序：resetPose → 头看向目标 → `animateWalk`（limbSwing×0.8662，摆幅 min(0.5, 3×limbSwingAmount)）→ 待机（刻×0.1）→ 触角 →
//   叠加 6 个关键帧动画：攻击、音爆、挖地、钻出、吼叫、嗅（`HierarchicalModel.animate`，规则见 lib/关键帧动画.ts）。
// - `WardenAnimation` 时长：钻出 6.68 秒、挖地 5.0、吼叫 4.2、嗅 4.16、攻击 0.333、音爆 3.0（第 34 刻 = 1.7 秒出声波伤害），数据在 监守者.模型.json 的 animations。
//   触发：钻出/挖地/吼叫/嗅 = 姿势变成 EMERGING/DIGGING/ROARING/SNIFFING；攻击 = 实体事件 4（同时停吼叫）；音爆 = 事件 62；被幽匿尖啸体召唤时就是 EMERGING。
//   钻出和吼叫里的 right_ear / left_ear 两条通道模型里没有对应部件（是 *_tendril），游戏里不生效，这里也不生效。
// - 钻出、挖地前 4.5 秒，客户端每刻在脚下 ±0.7 格方形撒 30 个方块碎屑（初速度 0）：`WARDEN.emergeParticles`。
// 坐标：原点在脚底中心，Z 朝上，正面朝 -Y，单位格（同 lib/实体模型.tsx）。钻出时埋地下的部分照动画下沉，组件不裁剪，地面由场景挡。
import React from 'react';
import * as THREE from 'three';
import type { V3 } from '../../engine/model/parts.tsx';
import { EntityLayer, EntityModel, EntityModelData, EntityPart, MODEL_TO_ENTITY } from '../../engine/model/实体模型.tsx';
import { AnimDef, applyAnimation, mthCos, mthSin, restPose, toPartPoses } from '../../engine/anim/关键帧动画.ts';
import { png } from '../../engine/model/贴图.ts';
import { VanillaTopple } from '../特效/原版死亡.tsx';
import raw from 'asset:模型/角色/监守者';
import texBase from 'asset:贴图/角色/监守者/本体';
import texBio from 'asset:贴图/角色/监守者/生物发光';
import texHeart from 'asset:贴图/角色/监守者/心脏';
import texSpots1 from 'asset:贴图/角色/监守者/脉动斑纹1';
import texSpots2 from 'asset:贴图/角色/监守者/脉动斑纹2';

type Raw = { models: { 监守者: EntityModelData }; animations: Record<'钻出' | '挖地' | '吼叫' | '嗅' | '攻击' | '音爆', AnimDef> };
const DATA = raw as unknown as Raw;
const MODEL = DATA.models.监守者;
export const WARDEN_ANIMS = DATA.animations;
const TEX = { body: png(texBase), bio: png(texBio), heart: png(texHeart), spots1: png(texSpots1), spots2: png(texSpots2) };

export const WARDEN = {
  height: 3.125,
  tendrilTop: 3.6875,
  shoulder: 2.125,
  chest: 1.41, // 心脏中心高度（胸口，长矛之类对准这里）
  box: [0.9, 2.9] as [number, number],
  boxBuried: [0.9, 1.0] as [number, number],
  shadow: 0.9,
  // 各动画时长（秒）；服务端对应姿势持续的刻数：钻出 134、挖地 100、吼叫 84、嗅 84、攻击冷却 18、音爆 60
  emergeSec: WARDEN_ANIMS.钻出.length,
  digSec: WARDEN_ANIMS.挖地.length,
  roarSec: WARDEN_ANIMS.吼叫.length,
  sniffSec: WARDEN_ANIMS.嗅.length,
  attackSec: WARDEN_ANIMS.攻击.length,
  sonicBoomSec: WARDEN_ANIMS.音爆.length,
  sonicBoomHitSec: 1.7, // `SonicBoom.TICKS_BEFORE_PLAYING_SOUND` = 34 刻：这一刻放声波、造成伤害
  heartbeatTicks: { calm: 40, angriest: 10 },
  // 钻出 / 挖地时脚下的方块碎屑（客户端 `clientDiggingParticles`）：每刻 30 个、持续到动画 4.5 秒、脚下 ±0.7 格方形内、初速度 0
  emergeParticles: { perTick: 30, durationSec: 4.5, 半宽: 0.7 },
  // 钻出的进度（秒，按 钻出 动画逐帧算各部件方盒的最高 / 最低点得出，见 预览/监守者/监守者-钻出-剖面*.png）：
  // 开始时身子、腿整体往下沉 63 像素，全身埋在地下；0.52 秒手先伸出地面、0.6 触角、0.8 头顶、1.08 肩冒头；1.2～3.0 秒撑着地面停住；
  // 3.2 头整个出来、3.86 身子、4.7 腿全部出来；4.4～5.8 蹲着往前趴，6.0～6.64 站直。（3.4～6.0 秒双手撑地，手掌会插进地面 0.1～0.2 格，原版就是这样）
  emergeDepth: 63 / 16,
  emergeProgress: { 手: 0.52, 触角: 0.6, 头顶: 0.8, 肩: 1.08, headOut: 3.22, bodyOut: 3.86, feetDown: 4.7, 站直: 6.64 },
  // 碎屑配色（取自本体贴图）：近黑的青灰身体、深青、手臂和肋骨的骨白、发光的青色
  debris: ['#0d1217', '#111b21', '#034150', '#062e37', '#bbc39b', '#29dfeb'],
};

const BIO_PARTS = ['head', 'left_arm', 'right_arm', 'left_leg', 'right_leg']; // getBioluminescentLayerModelParts
const SPOT_PARTS = ['body', 'head', 'left_arm', 'right_arm', 'left_leg', 'right_leg']; // getPulsatingSpotsLayerModelParts
const TENDRIL_PARTS = ['left_tendril', 'right_tendril']; // getTendrilsLayerModelParts
const HEART_PARTS = ['body']; // getHeartLayerModelParts
const DEG = Math.fround(0.017453292);

export type WardenProps = {
  秒: number; // 游戏时间（秒）：驱动待机摆动、脉动斑纹、自动心跳；ageInTicks = 秒×20
  钻出?: number; // 各关键帧动画已经播放的秒数；不给 = 不播。可以同时给几个（游戏里也是叠加的）
  吼叫?: number;
  嗅?: number;
  攻击?: number;
  音爆?: number;
  挖地?: number;
  行走?: { 相位: number; 幅度: number }; // limbSwing（走过的距离累计，格）、limbSwingAmount（0～1，速度换算的摆幅；摆幅 = min(0.5, 3×幅度)，幅度 ≥ 0.17 就到顶）
  头偏?: number; // 度（netHeadYaw，正 = 往实体自己的右手边转）
  headPitch?: number; // 度（headPitch，正 = 低头）
  触角?: number; // tendrilAnimation 0～1：触角摆动 + 触角发光；不给 = 0
  心跳?: number; // heartAnimation 0～1；不给就按 秒 和 心跳间隔 自动算（每次心跳从 1 降到 0，用 10 刻）
  heartbeatTicks?: number; // 刻，默认 40（不生气）
  // 光照：默认照原版实体的光照画本体（不受场景光影响）——贴图 × 方向明暗（顶 1、前后 0.74、左右 0.5、底 0.4）× 亮度，
  // 亮度默认 1 = 夜视（用户 10-02：古城里一律按夜视）。和实机对照过（预览/监守者/实机-*.png）。
  brightness?: number; // 亮度图亮度 0～1：模拟暗处（发光层不受影响，照样全亮）
  sceneLight?: boolean; // true = 本体改用场景里的灯（MeshStandardMaterial，和巫妖等其他实体模型一样），亮度 不起作用
  opacity?: number;
  // 第 7 章补的：
  受伤?: number; // 0～1：受伤变红（hurtTime > 0，原版 10 刻），见 特效/原版死亡.tsx
  secSinceDeath?: number; // 死了多久（秒）：照原版 `LivingEntityRenderer` 往实体左边倒下、变红，满 1 秒实体移除不再画（白烟用 原版粒子.tsx 的 死亡烟雾）
};

// 每次心跳从 1 线性降到 0、10 刻降完；tickCount % 间隔 == 0 那一刻跳（Warden.tick + getHeartAnimation）
export const wardenHeart = (sec: number, intervalTicks = WARDEN.heartbeatTicks.calm) => {
  const age = sec * 20;
  const since = ((age % intervalTicks) + intervalTicks) % intervalTicks;
  return Math.max(0, 1 - since / 10);
};

export const wardenPose = (props: WardenProps) => {
  const age = props.秒 * 20;
  const pose = restPose(MODEL.root);
  const { head, body, left_arm, right_arm, left_leg, right_leg, left_tendril, right_tendril } = pose;
  head.rot[0] = Math.fround((props.headPitch ?? 0) * DEG);
  head.rot[1] = Math.fround((props.头偏 ?? 0) * DEG);
  const ls = props.行走?.相位 ?? 0;
  const la = props.行走?.幅度 ?? 0;
  const swingAmp = Math.min(0.5, 3 * la);
  const f1 = ls * 0.8662;
  const f2 = mthCos(f1);
  const f3 = mthSin(f1);
  const f4 = Math.min(0.35, swingAmp);
  head.rot[2] += 0.3 * f3 * swingAmp;
  head.rot[0] += 1.2 * mthCos(f1 + 1.5707964) * f4;
  body.rot[2] = 0.1 * f3 * swingAmp;
  body.rot[0] = 1 * f2 * f4;
  left_leg.rot[0] = 1 * f2 * swingAmp;
  right_leg.rot[0] = 1 * mthCos(f1 + 3.1415927) * swingAmp;
  left_arm.rot[0] = -(0.8 * f2 * swingAmp);
  left_arm.rot[2] = 0;
  right_arm.rot[0] = -(0.8 * f3 * swingAmp);
  right_arm.rot[2] = 0;
  left_arm.rot[1] = 0;
  left_arm.offset = [13, -13, 1];
  right_arm.rot[1] = 0;
  right_arm.offset = [-13, -13, 1];
  const idlePhase = age * 0.1;
  const gc = mthCos(idlePhase);
  const gs = mthSin(idlePhase);
  head.rot[2] += 0.06 * gc;
  head.rot[0] += 0.06 * gs;
  body.rot[2] += 0.025 * gs;
  body.rot[0] += 0.025 * gc;
  const tf = (props.触角 ?? 0) * Math.fround(Math.cos(age * 2.25) * Math.PI * 0.10000000149011612);
  left_tendril.rot[0] = tf;
  right_tendril.rot[0] = -tf;
  // 关键帧动画（游戏里的顺序：攻击、音爆、挖地、钻出、吼叫、嗅）
  if (props.攻击 !== undefined) applyAnimation(pose, WARDEN_ANIMS.攻击, props.攻击);
  if (props.音爆 !== undefined) applyAnimation(pose, WARDEN_ANIMS.音爆, props.音爆);
  if (props.挖地 !== undefined) applyAnimation(pose, WARDEN_ANIMS.挖地, props.挖地);
  if (props.钻出 !== undefined) applyAnimation(pose, WARDEN_ANIMS.钻出, props.钻出);
  if (props.吼叫 !== undefined) applyAnimation(pose, WARDEN_ANIMS.吼叫, props.吼叫);
  if (props.嗅 !== undefined) applyAnimation(pose, WARDEN_ANIMS.嗅, props.嗅);
  return pose;
};

// 5 个发光层（顺序、贴图、alpha、部件照 WardenRenderer 的构造方法）
export const wardenLayers = (props: WardenProps): EntityLayer[] => {
  const age = props.秒 * 20;
  const k = props.opacity ?? 1;
  const heart = props.心跳 ?? wardenHeart(props.秒, props.heartbeatTicks);
  return [
    { tex: TEX.bio, alpha: 1 * k, parts: BIO_PARTS },
    { tex: TEX.spots1, alpha: Math.max(0, mthCos(age * 0.045) * 0.25) * k, parts: SPOT_PARTS },
    { tex: TEX.spots2, alpha: Math.max(0, mthCos(age * 0.045 + 3.1415927) * 0.25) * k, parts: SPOT_PARTS },
    { tex: TEX.body, alpha: (props.触角 ?? 0) * k, parts: TENDRIL_PARTS },
    { tex: TEX.heart, alpha: heart * k, parts: HEART_PARTS },
  ];
};

// ---------- 钉在身子上的东西（箭）：跟着 body 部件走（走路摆、音爆后仰、攻击），不只跟着实体 ----------
// 监守者在世界里：脚底位置、实体朝向、前倾（画面里外面套的两层 group：先绕 Z 转朝向、再绕 X 前倾），加上画模型的参数
export type WardenFrame = { p: V3; entityYaw: number; 前倾?: number; props: WardenProps };
const pathTo = (part: EntityPart, name: string): EntityPart[] | null => {
  if (part.name === name) return [part];
  for (const child of part.children) {
    const sub = pathTo(child, name);
    if (sub) return [part, ...sub];
  }
  return null;
};
const BODY_PATH = pathTo(MODEL.root, 'body')!;
const BODY_CUBE = BODY_PATH[BODY_PATH.length - 1].cubes[0];
// body 的坐标系（模型像素、y 朝下、正面 -z）→ 世界，和 EntityModel 画的一样一层层乘
const bodyMatrix = (f: WardenFrame) => {
  const pose = wardenPose(f.props);
  const m = new THREE.Matrix4()
    .makeTranslation(f.p[0], f.p[1], f.p[2])
    .multiply(new THREE.Matrix4().makeRotationZ((f.entityYaw * Math.PI) / 180))
    .multiply(new THREE.Matrix4().makeRotationX(((f.前倾 ?? 0) * Math.PI) / 180))
    .multiply(new THREE.Matrix4().makeTranslation(0, 0, 1.501))
    .multiply(MODEL_TO_ENTITY)
    .multiply(new THREE.Matrix4().makeScale(1 / 16, 1 / 16, 1 / 16));
  for (const part of BODY_PATH) {
    const pp = pose[part.name];
    m.multiply(new THREE.Matrix4().makeTranslation(pp.offset[0], pp.offset[1], pp.offset[2]))
      .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pp.rot[0], pp.rot[1], pp.rot[2], 'ZYX')))
      .multiply(new THREE.Matrix4().makeScale(pp.scale[0], pp.scale[1], pp.scale[2]));
  }
  return m;
};
const toV3 = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];
export type BodyPin = { p: V3; dir: V3 }; // body 坐标系里的点和方向
// 世界里的点、方向 → 钉在这一刻的身子上
export const pinToWardenBody = (f: WardenFrame, p: V3, dir: V3): BodyPin => {
  const inv = bodyMatrix(f).invert();
  return { p: toV3(new THREE.Vector3(...p).applyMatrix4(inv)), dir: toV3(new THREE.Vector3(...dir).transformDirection(inv)) };
};
// 钉着的东西在这一刻的世界位置、方向
export const wardenBodyPinAt = (f: WardenFrame, pin: BodyPin): { p: V3; dir: V3 } => {
  const m = bodyMatrix(f);
  return { p: toV3(new THREE.Vector3(...pin.p).applyMatrix4(m)), dir: toV3(new THREE.Vector3(...pin.dir).transformDirection(m)) };
};
// body 方盒的中心（像素坐标，往上 up 格）在世界里的位置：往身子上射箭瞄这里
export const wardenBodyPoint = (f: WardenFrame, up = 0): V3 => {
  const c = BODY_CUBE.from.map((v, i) => v + BODY_CUBE.size[i] / 2);
  return toV3(new THREE.Vector3(c[0], c[1] - up * 16, c[2]).applyMatrix4(bodyMatrix(f)));
};
// 从 start 沿 dir 的射线第一次碰到 body 方盒的点（世界）；碰不到返回 undefined
export const wardenBodyHit = (f: WardenFrame, start: V3, dir: V3): V3 | undefined => {
  const m = bodyMatrix(f);
  const inv = m.clone().invert();
  const o = new THREE.Vector3(...start).applyMatrix4(inv);
  const d = new THREE.Vector3(...start).add(new THREE.Vector3(...dir)).applyMatrix4(inv).sub(o);
  let t0 = -Infinity;
  let t1 = Infinity;
  for (const axis of [0, 1, 2] as const) {
    const lo = BODY_CUBE.from[axis];
    const hi = lo + BODY_CUBE.size[axis];
    const oa = o.getComponent(axis);
    const da = d.getComponent(axis);
    if (Math.abs(da) < 1e-9) {
      if (oa < lo || oa > hi) return undefined;
      continue;
    }
    const a = (lo - oa) / da;
    const b = (hi - oa) / da;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  if (t0 > t1 || t1 < 0) return undefined;
  return toV3(o.add(d.multiplyScalar(Math.max(0, t0))).applyMatrix4(m));
};

// 死亡（原版，监守者没有自己的死亡动画）：LivingEntityRenderer.setupRotations 倒下 + 变红，20 刻后移除、放 20 个 poof（碰撞箱 0.9×2.9 里）；
// 音效 entity.warden.death。音爆的粒子和声音在 特效/监守者音波.tsx。
export const Warden: React.FC<WardenProps> = (props) => {
  const dead = props.secSinceDeath !== undefined && props.secSinceDeath >= 0;
  if (dead && props.secSinceDeath! >= 1) return null;
  const red = dead ? 1 : (props.受伤 ?? 0);
  return (
    <VanillaTopple secSinceDeath={props.secSinceDeath}>
      <EntityModel
        model={MODEL}
        tex={TEX.body}
        pose={toPartPoses(wardenPose(props))}
        layers={wardenLayers(props)}
        opacity={props.opacity ?? 1}
        mcLight={props.sceneLight ? undefined : (props.brightness ?? 1)}
        hurt={red}
      />
    </VanillaTopple>
  );
};
