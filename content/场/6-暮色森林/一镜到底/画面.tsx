// 一镜到底的画面：按全局帧 `F` 画出这一帧（路线.ts 的扫帚、镜头.ts 的机位、各段 戏.tsx 的 boss 和特效），光照全程是暮色森林那一套。
// 地形是游戏真实地貌导入的（模型/场景/暮色新世界.tsx）。整条一镜到底在 6-1-4至9 一段里（6-1/段界.ts），`OnerSegment` 给出段起帧：段内第 `frame` 帧 = 全局帧 `起` + `frame`。
import { ThreeCanvas } from '@remotion/three';
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { rad } from '../../../../engine/anim/anim.ts';
import type { V3 } from '../../../../engine/model/parts.tsx';
import { FlightRig } from '../../../../world/地点/飞行镜头.tsx';
import { TwilightLighting, twilightFogFar, clampFogToEdge, TWILIGHT_CRUISE_FOG_FAR } from '../../../../engine/light/暮色光照.tsx';
import { twilightSunDir } from '../../../../engine/light/光照配比.ts';
import { LevelParams, type RenderLevel, canvasDpr } from '../../../../engine/core/渲染级别.ts';
import { ScreenAo } from '../../../../engine/voxel/屏幕AO.tsx';
import { MusicAudio } from '../../../../world/配乐/配乐音轨.tsx';
import { halfGain, ch6FlightMusic } from '../../../../world/配乐/第六章飞行.ts';
import type { BonePose } from '../../../../engine/model/基岩模型.tsx';
import { broomMatrix, handAim, jiuhuRideBones, RIDE, RideBroom, type RideJiuhu, type RideLiYing } from '../../../../world/角色/骑扫帚.tsx';
import type { FigurePose } from '../../../../world/角色/骨架.tsx';
import { SPEAR_RIDER } from '../../../../world/角色/骑扫帚持矛.tsx';
import { WornSheath } from '../../../../world/物品/拔刀剑.tsx';
import { SpearInHand } from '../../../../world/物品/下界合金长矛.tsx';
import { ItemPickup, type 拾取件 } from '../../../../world/特效/物品拾取.tsx';
import { TwilightTerrain, twilightLandmark, twilightHeightAboveGround, viewEdgeDistance, type TwilightLandmarkName } from '../../../../world/地点/暮色新世界.tsx';
import * as P613 from '../6-1-3/编排.ts';
import * as castleChoreo from '../6-1-9/编排.ts';
import { LichScene, lichRiderTweak } from '../6-1-5/戏.tsx';
import { HydraScene } from '../6-1-6/戏.tsx';
import { UrGhastScene, AlphaYetiScene } from '../6-1-7/戏.tsx';
import { SnowQueenScene } from '../6-1-8/戏.tsx';
import { GiantScene } from '../6-1-8b/戏.tsx';
import { cameraAt, type Cam } from './镜头.ts';
import * as route from './路线.ts';
import { SpearDrill, LootLayer, drillGhost, drillSpin } from './战利品.tsx';
import { OnerSound } from './声音.tsx';

const ss = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

const sheath = <WornSheath />;

// ---------- 骑手 ----------
// 首帧 = 6-1-3 末帧的姿势；30 帧内压成高速飞行的姿势（李樱前倾 46、抬头看前面，九胡抱腰贴着他）。
// 长矛：离巫妖怪塔的穿刺线还有 1.5 公里时亮出来（按物品切换：矛从手里长出来），之后一直平端到降落；起飞后 1.5 公里前姿势还在往高速飞行压，所以不早于第 30 帧。
// 每次冲刺击杀，矛头外面包一个动力钻头的虚影（用户 10-02，见 战利品.tsx）
const F_SPEAR = Math.max(30, route.帧(route.时刻(route.标记路程('巫妖.前') - 1500)));
const END613 = P613.riders(P613.beats.末帧);
const ly613 = END613.liYing as { lean: number; headRaise: number };
const jh613 = END613.jiuhu as { lean: number; headRaise: number };
export const ridersAt = (frame: number, physT: number) => {
  const k0 = ss(frame / 30);
  const ks = ss((frame - F_SPEAR) / 12);
  const grow = ss((frame - F_SPEAR - 3) / 8);
  const lean = lerp(lerp(ly613.lean, 46, k0), SPEAR_RIDER.lean, ks);
  const headRaise = lerp(lerp(ly613.headRaise, 30, k0), 8, ks);
  const drill = drillGhost(frame);
  let liYing: RideLiYing = {
    lean,
    headRaise,
    hipItem: sheath,
    poseOverride: (b) => ({
      ...b,
      armR: lerp(b.armR, SPEAR_RIDER.poseOverride.armR, ks),
      armRRoll: lerp(b.armRRoll, SPEAR_RIDER.poseOverride.armRRoll, ks),
      elbowR: lerp(b.elbowR ?? 0, SPEAR_RIDER.poseOverride.elbowR, ks),
    }),
    右手:
      grow > 0
        ? (pose) => (
            <group quaternion={handAim(pose, [0, 1, 0])}>
              <group scale={grow}>
                <SpearInHand />
                {drill > 0.005 && <SpearDrill opacity={drill} spin={drillSpin(physT)} />}
              </group>
            </group>
          )
        : undefined,
  };
  let jiuHu: RideJiuhu = {
    lean: lerp(jh613.lean, 30, k0),
    hugWaist: 1,
    tailPhase: (P613.beats.末帧 + frame) / 9,
    风: 1,
    headRaise: lerp(jh613.headRaise, 10, k0),
  };
  // 巫妖：左手甩药水、鼓风机
  const tl = physT - route.贯穿时刻.巫妖;
  if (tl > -0.2 && tl < 1) {
    liYing = { ...lichRiderTweak(tl, liYing), hipItem: sheath };
  }
  let broomAppear = 1;
  const td = physT - route.T_ARRIVE;
  if (td >= 0) ({ 李樱: liYing, 九胡: jiuHu, 扫帚出现: broomAppear } = releasedRiders(td, liYing, jiuHu));
  return { liYing: liYing, jiuhu: jiuHu, broomAppear: broomAppear };
};

// ---------- 6-1-9 脱手：长矛直接收起，扫帚变成掉落物吸进李樱身体里，两人冲到屋顶上（6-1-9/编排.ts 的 下扫帚） ----------
// 两人一起走的坐标系还是 `route.扫帚` 给的（脱手后按抛物线往前下方落、身子慢慢放平），这里只把姿势从跨坐换成落地的站姿。
// 李樱的 `loc` 是「腿伸直时的脚底」，跨坐时和站着一样高（`landingStickHeight` 按它定的），腿一放下来脚就踩在屋顶上；九胡的模型原点挪到同一高度。
// 不做着地的缓冲（屈膝）
const dismount = castleChoreo.dismount;
// 骨骼按转角逐个混（基岩动画的 rot 是加在骨骼自带转角上的，没写的骨骼就是 0 = 模型本来的站姿）
const mixBones = (from: Record<string, BonePose>, to: Record<string, BonePose>, k: number) => {
  const mixed: Record<string, BonePose> = { ...from };
  for (const boneName of new Set([...Object.keys(from), ...Object.keys(to)])) {
    if (!from[boneName]?.rot && !to[boneName]?.rot) continue;
    const ra = from[boneName]?.rot ?? [0, 0, 0];
    const rb = to[boneName]?.rot ?? [0, 0, 0];
    mixed[boneName] = { ...from[boneName], rot: ra.map((v, i) => v + (rb[i] - v) * k) };
  }
  return mixed;
};
const releasedRiders = (td: number, liYing: RideLiYing, jiuHu: RideJiuhu) => {
  const fallDur = route.落地时长();
  // 在空中把腿放下来、身子直起来，着地那一刻正好站直；两手微微张开保持平衡。着地后 `站正` 秒内回到正常站姿
  // （一直保持着地姿势会显得人是歪的，用户 10-09 指出）
  const k = ss(td / fallDur);
  const landed = td >= fallDur;
  const standUp = ss((td - fallDur) / dismount.standUp);
  const landOrStand = (landVal: number, standVal: number) => lerp(landVal, standVal, standUp);
  const origPose = liYing.poseOverride;
  const ly: RideLiYing = {
    ...liYing,
    poseOverride: (base) => {
      const pose = typeof origPose === 'function' ? origPose(base) : { ...base, ...origPose };
      const result: FigurePose = {
        ...pose,
        pitch: lerp(pose.pitch, landOrStand(-6, 0), k),
        headPitch: lerp(pose.headPitch, landOrStand(4, 0), k),
        headYaw: lerp(pose.headYaw, 0, k),
        legR: lerp(pose.legR, 0, k),
        legL: lerp(pose.legL, 0, k),
        kneeR: lerp(pose.kneeR ?? 0, 0, k),
        kneeL: lerp(pose.kneeL ?? 0, 0, k),
        legRRoll: lerp(pose.legRRoll ?? 0, 0, k),
        legLRoll: lerp(pose.legLRoll ?? 0, 0, k),
        armR: lerp(pose.armR, landOrStand(20, 0), k),
        armL: lerp(pose.armL, landOrStand(20, 0), k),
        armRRoll: lerp(pose.armRRoll, landOrStand(-15, 0), k),
        armLRoll: lerp(pose.armLRoll, landOrStand(-15, 0), k),
        elbowR: lerp(pose.elbowR ?? 0, landOrStand(15, 0), k),
        elbowL: lerp(pose.elbowL ?? 0, landOrStand(15, 0), k),
        ground: landed ? 1 : 0,
      };
      return result;
    },
    右手: undefined, // 长矛直接收起来（按物品切换，原版一换手就没了）
  };
  const standBones: Record<string, BonePose> = {};
  ['Tail', 'Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6', 'Tail7'].forEach((boneName, i) => {
    standBones[boneName] = { rot: [0, Math.sin((jiuHu.tailPhase ?? 0) - i * 0.6) * (i < 3 ? 8 : 5), 0] };
  });
  const jh: RideJiuhu = {
    ...jiuHu,
    boneOverrides: mixBones(jiuhuRideBones(jiuHu), standBones, k),
    // 跨坐时模型原点在 jiuhuHipZ − 站髋；站着时要在 −落地杆高（屋顶）
    offset: [0, 0, k * (RIDE.jiuhuStandHip - RIDE.jiuhuHipZ - dismount.landingStickHeight)],
  };
  return { 李樱: ly, 九胡: jh, 扫帚出现: 0 };
};

// 收扫帚：扫帚一收起来就变成它的物品（掉落物，车万女仆的扫帚物品贴图），带着脱手时的冲劲被吸进李樱身体里，不落地（用户 10-09）。吸的动作同战利品（模型/特效/物品拾取.tsx），吸多久见 `dismount.absorbSec`
let broomItems: 拾取件[] | undefined;
const stowBroom = (physT: number) => {
  const td = physT - route.T_ARRIVE;
  if (td < 0 || td >= dismount.absorbSec) return null;
  if (!broomItems) {
    // 原版实体收起时掉落物生成在实体原点（扫帚杆中心往下 `stickZ`），自己不带速度：两人冲出去，它留在身后一点，再追上去被吸进李樱身体里。
    // 放在杆中心、带着冲劲的话整段都藏在两人中间被九胡尾巴挡住
    const P0 = route.扫帚(route.F_LAND).位置;
    broomItems = [{ 名: '扫帚', p0: [P0[0], P0[1], P0[2] - RIDE.stickZ + 0.25], v0: [0, 0, 0], spinAxis: [0.2, -0.1, 0.3], spinSpeed: 20, 起吸: 0, 吸完: dismount.absorbSec }];
  }
  // 吸到李樱胸口（他在前座）
  const broom = route.扫帚(route.帧(physT));
  const yaw = rad(broom.朝向);
  const chest: V3 = [broom.位置[0] - Math.sin(yaw) * RIDE.front, broom.位置[1] + Math.cos(yaw) * RIDE.front, broom.位置[2] + 0.8];
  return { items: broomItems, τ: td, target: chest };
};

// 这些地标离镜头多远以内才画（米）：雾最远 22 公里，新世界整片不到 13 公里，基本都画
const isNear = (landmark: TwilightLandmarkName, camPos: number[], maxDist = 16000) => {
  const origin = twilightLandmark(landmark).原点;
  return Math.hypot(origin[0] - camPos[0], origin[1] - camPos[1]) < maxDist;
};

// 一帧（全局帧 `F`）。机位：给了就用它（核对用的静帧），不给就按 镜头.ts。
// 级别：见 lib/渲染级别.ts。`像素`、`远`、`dpr`（画布超采样倍数）不给就用这一级的（关键帧级超采样 1，配 --scale=4 出 5120×2880）。
// 屏幕AO：体素地形的屏幕空间环境光遮蔽（lib/体素/屏幕AO.tsx），默认开
// `tweakRiders`：在这一帧的骑手姿势上再改（6-1-9b 落地后接着一镜到底末帧往下演），不给就照 `ridersAt` 原样
// `extra`：另外画进场景的东西（场景坐标 Z 朝上）；`loot={false}` 不画战利品箱和掉落物（封面.tsx）
export type Riders = ReturnType<typeof ridersAt>;
export const OnerFrame: React.FC<{ F: number; cam?: Cam; level?: RenderLevel; screenAo?: boolean; tweakRiders?: (base: Riders) => Riders; extra?: React.ReactNode; loot?: boolean } & Partial<LevelParams>> = ({
  F: frame,
  cam: camOverride,
  level: level = '视频',
  screenAo: AO = true,
  tweakRiders,
  extra,
  loot = true,
  ...overrides
}) => {
  const { 像素: lodPixels, 远: farDist, dpr } = { ...LevelParams[level], ...overrides };
  const { width, height } = useVideoConfig();
  const cam = camOverride ?? cameraAt(frame);
  const broom = route.扫帚(frame);
  const physT = broom.T;
  const riders = tweakRiders ? tweakRiders(ridersAt(frame, physT)) : ridersAt(frame, physT);
  const stow = stowBroom(physT);
  const broomMat = broomMatrix(broom.位置, broom.朝向, broom.俯仰, broom.横滚);
  // 雾和投影的级联按镜头离脚下地物多高算（新世界的地面不在 z = 0：终焉高原在 z 96）；
  // 往导入范围的边那边看时，雾的远端压到边以内（lib/暮色光照 的 `clampFogToEdge`）
  const aboveGround = twilightHeightAboveGround(cam.pos);
  const fogFar = clampFogToEdge(Math.max(TWILIGHT_CRUISE_FOG_FAR, twilightFogFar(aboveGround)), viewEdgeDistance(cam.pos, cam.tgt));
  // 镜头钻进结构里（巫妖的房间、宫殿顶层、小屋、雪怪的洞）时补一盏不投影的点光，免得黑成一片
  const indoorLights: V3[] = [];
  for (const [bossName, halfSpan] of [['巫妖', 0.6], ['冰雪女王', 0.5], ['巨人', 0.5], ['雪怪首领', 0.8]] as const) {
    const t = route.局部时间(bossName, frame);
    if (t > -halfSpan && t < halfSpan) indoorLights.push(route.穿刺表[bossName].矛尖(0));
  }
  return (
    <AbsoluteFill>
      <ThreeCanvas width={width} height={height} shadows="percentage" gl={{ antialias: true, logarithmicDepthBuffer: true }} dpr={canvasDpr(dpr)}>
        <TwilightLighting camPos={cam.pos} fogFar={fogFar} aboveGround={aboveGround} />
        <FlightRig c={cam} near={0.05} far={150000} />
        {AO && <ScreenAo />}{/* 照 Voxy 的屏幕空间 AO（用户 10-03），默认开，关掉传 屏幕AO={false} */}
        <group rotation={[-Math.PI / 2, 0, 0]}>
          {indoorLights.map((p, i) => (
            <pointLight key={i} position={[p[0], p[1], p[2] + 5]} intensity={70} distance={26} decay={1.5} color="#f2eee6" />
          ))}
          <TwilightTerrain
            camPos={cam.pos}
            landmarks={[...(isNear('娜迦庭院', cam.pos, 4000) ? ['娜迦庭院' as const] : []), ...(isNear('终焉高原城堡', cam.pos) ? ['终焉高原城堡' as const] : [])]}
            t={P613.T612 + (P613.beats.末帧 + frame) / 24}
            clearPlants={P613.CLEAR_PLANTS}
            像素={lodPixels}
            远={farDist}
            shadowLightDir={twilightSunDir}
          />
          {isNear('巫妖怪塔', cam.pos) && <LichScene t={route.局部时间('巫妖', frame)} camPos={cam.pos} />}
          {isNear('九头蛇巢穴', cam.pos) && <HydraScene t={route.局部时间('九头蛇', frame)} broom={broom.位置} />}
          {isNear('幽冥高塔', cam.pos) && <UrGhastScene t={route.局部时间('暮初恶魂', frame)} broom={broom.位置} />}
          {isNear('雪怪洞窟', cam.pos) && <AlphaYetiScene t={route.局部时间('雪怪首领', frame)} camPos={cam.pos} />}
          {isNear('极光宫殿', cam.pos) && <SnowQueenScene t={route.局部时间('冰雪女王', frame)} camPos={cam.pos} />}
          {isNear('云中小屋', cam.pos) && <GiantScene t={route.局部时间('巨人', frame)} camPos={cam.pos} />}
          <RideBroom pos={broom.位置} yaw={broom.朝向} pitch={broom.俯仰} roll={broom.横滚} liYing={riders.liYing} jiuhu={riders.jiuhu} broom={{ appear: riders.broomAppear }} />
          {stow && <ItemPickup items={stow.items} τ={stow.τ} target={stow.target} camPos={cam.pos} />}
          {/* 冲刺击杀时冒出来、被矛打碎的战利品箱，物品被吸到李樱身上（用户 2026-10-02） */}
          {loot && <LootLayer T={physT} broom={broomMat} camPos={cam.pos} />}
          {extra}
        </group>
      </ThreeCanvas>
    </AbsoluteFill>
  );
};

// 一镜到底的一截：段内第 frame 帧 = 全局帧 `起` + frame，挂上配乐和原版音效（`帧数`：放到哪儿，音效截在这里）。整条一镜到底是 6-1-4至9 的一截（6-1/段界.ts）。
// 配乐按全局帧接着 6-1-3 往下放（一镜到底第 0 帧 = 6-1-3 末帧，歌曲时间 = 6-1-3 编排的 `songSec`(6-1-3 帧数 − 1 + 全局帧)），用户 10-08 要完整连贯的音乐
export const OnerSegment: React.FC<{ 起: number; 帧数: number }> = ({ 起: startFrame, 帧数: frameCount }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <OnerFrame F={startFrame + frame} />
      <MusicAudio song={ch6FlightMusic.song} startSec={P613.songSec(P613.FRAMES - 1 + startFrame)} gain={(t) => halfGain(ch6FlightMusic, '前一半', t)} />
      {/* 原版音效：排在全局时间轴上，见 声音.tsx */}
      <OnerSound startFrame={startFrame} frameCount={frameCount} />
    </AbsoluteFill>
  );
};
