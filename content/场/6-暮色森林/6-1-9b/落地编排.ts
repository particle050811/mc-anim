// 6-1-9b 开头的从天落地（编排，纯函数）：用户 10-18 的思路——一镜到底快到城堡时剪掉，不演骑扫帚降落（收扫帚、冲下屋顶那些难做的都删），
// 改成两人在切点那一刻离开扫帚，带着扫帚的冲劲斜着飞进城堡、落到屋顶上（用户 10-18：不是从天上竖着掉，要带着扫帚的惯性斜着飞进来），落地时站位排好、动作做足。
// 两个镜头，中间一刀硬切（用户 10-18：中间不要追拍，不然还是连续镜头）：
//   ① 6-1-9：一镜到底原样飞到 `F_CUT`（扫帚刚开始往屋顶平台扎）；
//   ② 6-1-9b：一镜到底末帧的机位（二人右前方低处），李樱从画面左边的垛口低低地滑进来、半蹲落地、往前滑一段停住，
//      九胡晚 `JIUHU_LAG` 帧落在他右后方，起身站定。
// 硬切处剪掉一整小节（用户 10-18 嫌落地后空镜头太多）加 `ONER_TRIM` 帧画面（用户 10-20 又剪了俯冲的尾巴），只剪画面：② 的配乐接着 ① 一路放（编排.ts 的 `musicStartSec`）。
// 两人用一镜到底末帧的站姿，这里加位移和姿势；脱手到切过来之间不演，轨迹只管画面里那几帧的方向和速度。
// 飞行轨迹不照原版逐刻算（用户 10-18：数学上不必精确，画面上要合理）：起点的位置、方向取切点那一帧的扫帚，经垛口（`CRENEL_LOCAL`）到着地点，两截 Hermite 曲线接成一条；
// 速度从扫帚的速度按指数衰减到 `LAND_SPEED`（像被空气拖慢），飞多久按这条速度曲线走完全程来定，切过来时李樱刚出垛口、九胡正过垛口。
// 着地照原版 `LivingEntity.checkFallDamage`：摔落距离 > 3 格时脚下崩出方块粒子；声音同 6-3 落进古城（entity.player.big_fall + 方块 fall 声）。
import { type Key, sampleLag } from '../../../../engine/anim/anim.ts';
import type { V3 } from '../../../../engine/model/parts.tsx';
import { rng } from '../../../../engine/model/parts.tsx';
import type { BonePose } from '../../../../engine/model/基岩模型.tsx';
import type { RideJiuhu, RideLiYing } from '../../../../world/角色/骑扫帚.tsx';
import type { FigurePose } from '../../../../world/角色/骨架.tsx';
import { particleInitVel, particlePath } from '../../../../world/特效/粒子面片.tsx';
import type { BreakParticle } from '../../../../world/特效/方块破坏粒子.tsx';
import type { SoundCue } from '../../../../engine/audio/游戏音效.tsx';
import * as choreo619 from '../6-1-9/编排.ts';
import type { Riders } from '../一镜到底/画面.tsx';
import * as route from '../一镜到底/路线.ts';
import * as choreo619b from './编排.ts';

const FPS = 24;
const ss = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};

const F0 = choreo619b.F0;
// ① → ②：F0 往前一小节（`BAR_CUT_FRAMES`）再早 `ONER_TRIM` 帧：扫帚刚压下机头往屋顶平台扎，离城垛还远
export const F_CUT = F0 - choreo619b.BAR_CUT_FRAMES - choreo619b.ONER_TRIM;
export const T_LIYING = F0 + choreo619b.landFrame; // 李樱着地（全局帧）
export const JIUHU_LAG = 3; // 两人同一刻离开扫帚，九胡飞得稍慢一点
export const T_JIUHU = T_LIYING + JIUHU_LAG;

// ---------- 场坐标：一镜到底末帧扫帚（两人一起走的坐标系，朝向 0 = 面朝北）的本地坐标，x 东、y 北、z 上，z = 0 是屋顶 ----------
const B0 = route.扫帚(F0).位置;
const roofZ = choreo619.castleOrigin[2] + choreo619.ROOF_Z;
const fromScene = (p: number[]): V3 => [B0[0] + p[0], B0[1] + p[1], roofZ + p[2]];
// 站位（场坐标）：李樱在前座（骑扫帚.tsx 的 RIDE.front），九胡在后座再挪 6-1-9b 的 `jiuhuStepTo`，即他右后方
const LIYING_AT: V3 = [0, 0.35, 0];
const JIUHU_AT: V3 = [choreo619b.jiuhuStepTo[0], -0.35 + choreo619b.jiuhuStepTo[1], 0];

// ---------- 飞行轨迹（场坐标，相对各自的站位） ----------
// 落地要平缓，才和 6-1-9 末尾接得上（用户 10-20：「后面落地角度可以再稍微平缓一点」）。落点正南是平台南沿那排城垛（本地 y 3～5、高 3 格，
// x 每 5 格一个 3 格宽的垛，垛之间 2 格宽的垛口只有 1 格高的底，见 工具/一镜到底/out/体素/终焉高原城堡.npz），从垛顶上过，画面里最后几米得约 35° 扎下来；
// 所以从落点西南那个垛口（本地 x 340～341，在机位 A 画面左缘里）低低地滑进来：切点到垛口约 19°，垛口到着地约 22°，和 6-1-9 末尾扫帚往下扎的 15° 差不多。
// 过垛口时脚底离屋顶 2.35 米：腿从垛口里过，张开的两臂在垛顶以上，出垛口时手刚好擦过垛顶
const CRENEL_LOCAL: V3 = [341, 4.5, choreo619.ROOF_Z + 2.35];
const crenel = (dx: number): V3 => [choreo619.castleOrigin[0] + CRENEL_LOCAL[0] + dx - B0[0], choreo619.castleOrigin[1] + CRENEL_LOCAL[1] - B0[1], CRENEL_LOCAL[2] - choreo619.ROOF_Z];
const LAND_SPEED = 27; // 着地时的速度（米/秒），也差不多是滑进画面的速度
const LAND_PITCH = -14; // 着地时往下的角度（度），比过垛口那截收平一点
// 着地以后往前滑多少帧停住（按着地时的水平速度匀减速，滑的距离 = 速度 × 帧数 / 2）
const SKID_FRAMES = 6;
const skidLength = ((LAND_SPEED * Math.cos((LAND_PITCH * Math.PI) / 180)) / FPS) * (SKID_FRAMES / 2);
// 速度 v(t) = LAND_SPEED + (扫帚速度 − LAND_SPEED)·e^(−t/TAU)
const TAU = 0.3;
const broomRelease = route.扫帚(F_CUT);
// 扫帚的方向：朝向 0 = 北、正 = 往左；俯仰正 = 抬头
const releaseDir = (): V3 => {
  const yaw = (broomRelease.朝向 * Math.PI) / 180;
  const pitch = (broomRelease.俯仰 * Math.PI) / 180;
  return [-Math.sin(yaw) * Math.cos(pitch), Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch)];
};
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (v: V3): V3 => {
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
};
// 三次 Hermite：p0 → p1，两端切线 m0、m1
const hermite = (p0: V3, m0: V3, p1: V3, m1: V3, u: number): V3 => {
  const [h00, h10, h01, h11] = [2 * u ** 3 - 3 * u * u + 1, u ** 3 - 2 * u * u + u, -2 * u ** 3 + 3 * u * u, u ** 3 - u * u];
  return [0, 1, 2].map((i) => h00 * p0[i] + h10 * m0[i] + h01 * p1[i] + h11 * m1[i]) as V3;
};
type Flight = { at: (u: number) => V3; arc: Float64Array; T: number; t0: number; touch: V3; skidDir: V3 };
const ARC_N = 800;
const pathDist = (t: number, v0: number) => LAND_SPEED * t + (v0 - LAND_SPEED) * TAU * (1 - Math.exp(-t / TAU));
// stand：站位；seat：离开扫帚时在扫帚上坐的位置相对站位差多少（李樱就在前座；九胡在后座，站位又往右后挪了 `jiuhuStepTo`）；gap：过垛口的那一点（场坐标）
const flight = (touchFrame: number, stand: V3, seat: V3, gap: V3): Flight => {
  const start: V3 = [broomRelease.位置[0] - B0[0] + seat[0], broomRelease.位置[1] - B0[1] + seat[1], broomRelease.位置[2] - B0[2] + seat[2]];
  const g = sub(gap, stand);
  // 过了垛口朝站位直着滑过去：着地点在站位前面滑的那一截
  const skidDir = unit([-g[0], -g[1], 0]);
  const touch: V3 = [-skidDir[0] * skidLength, -skidDir[1] * skidLength, 0];
  const pitch = (LAND_PITCH * Math.PI) / 180;
  const d2: V3 = [skidDir[0] * Math.cos(pitch), skidDir[1] * Math.cos(pitch), Math.sin(pitch)];
  const t1 = unit(unit(sub(g, start)).map((v, i) => v + unit(sub(touch, g))[i]) as V3);
  const L1 = Math.hypot(...sub(g, start));
  const L2 = Math.hypot(...sub(touch, g));
  const d0 = releaseDir();
  const at = (u: number): V3 => {
    const w = u * (L1 + L2);
    if (w < L1) return hermite(start, d0.map((v) => v * L1) as V3, g, t1.map((v) => v * L1) as V3, w / L1);
    return hermite(g, t1.map((v) => v * L2) as V3, touch, d2.map((v) => v * L2) as V3, Math.min(1, (w - L1) / L2));
  };
  const arc = new Float64Array(ARC_N + 1);
  for (let k = 1; k <= ARC_N; k++) {
    const a = at((k - 1) / ARC_N);
    const b = at(k / ARC_N);
    arc[k] = arc[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  // 按速度曲线走完全程要多久（二分）：着地在 touchFrame，起飞就在这么多秒以前（在硬切前，画外）
  let lo = 0;
  let hi = 60;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (pathDist(mid, broomRelease.速度) > arc[ARC_N]) hi = mid;
    else lo = mid;
  }
  return { at, arc, T: (lo + hi) / 2, t0: touchFrame, touch, skidDir };
};
const flights = {
  liYing: flight(T_LIYING, LIYING_AT, [0, 0, 0], crenel(-0.1)),
  jiuhu: flight(T_JIUHU, JIUHU_AT, [-choreo619b.jiuhuStepTo[0], -choreo619b.jiuhuStepTo[1], 0], crenel(0)),
};
// 第 F 帧相对站位的位移：空中沿路径走，着地后匀减速滑到站位
const offsetAt = (fl: Flight, F: number): V3 => {
  const c = F - fl.t0;
  if (c >= 0) {
    const k = Math.min(1, c / SKID_FRAMES);
    const left = skidLength * (1 - k) * (1 - k);
    return [-fl.skidDir[0] * left, -fl.skidDir[1] * left, 0];
  }
  const s = pathDist(Math.max(0, fl.T + c / FPS), broomRelease.速度);
  let k = 0;
  while (k < ARC_N - 1 && fl.arc[k + 1] < s) k++;
  const u = (k + Math.min(1, Math.max(0, (s - fl.arc[k]) / (fl.arc[k + 1] - fl.arc[k])))) / ARC_N;
  return fl.at(u);
};
// 诊断用（工具里量轨迹、核对擦不擦方块）：第 F 帧（全局帧）两人相对各自站位的位移
export const landingOffset = (who: keyof typeof flights, F: number) => offsetAt(flights[who], F);
// 摔落距离：从脱手的高度算
const fallHeight = flights.liYing.at(0)[2];

// ---------- 李樱（绝对姿势，度；约定同 骨架.tsx）：空中往前倾着冲、两臂张开、低头看落点；着地前直起身、腿伸到前面，着地半蹲多蹲一会儿再起身 ----------
// 着地后半蹲、蹲住 6 帧（摔得重），起身冲过头再回
const H = -60; // 空中一直是这个姿势（脱手到着地约 30 帧，比这短）
const liyingKeys: Record<string, Key[]> = {
  pitch: [[H, -28], [-14, -24], [-6, -4], [-2, -2], [0, -8], [3, -32], [9, -28], [18, 3], [23, -1.5], [30, 0]],
  headPitch: [[H, -22], [-8, -18], [0, 6], [3, 20], [9, 16], [18, -2], [23, 1], [30, 0]],
  legR: [[H, 20], [-14, 16], [-6, 30], [-2, 22], [0, 12], [3, 80], [9, 74], [18, 2], [23, 4], [30, 0]],
  legL: [[H, -16], [-14, -12], [-6, 14], [-2, 10], [0, 6], [3, 68], [9, 62], [18, 0], [23, 2], [30, 0]],
  kneeR: [[H, 50], [-8, 35], [-2, 18], [0, 15], [3, 112], [9, 102], [18, 4], [23, 6], [30, 0]],
  kneeL: [[H, 40], [-8, 30], [-2, 20], [0, 18], [3, 112], [9, 102], [18, 3], [23, 5], [30, 0]],
  legRRoll: [[H, -10], [-8, -10], [0, -6], [3, -8], [9, -8], [18, 0], [30, 0]],
  legLRoll: [[H, -10], [-8, -10], [0, -6], [3, -8], [9, -8], [18, 0], [30, 0]],
  armR: [[H, 25], [-8, 25], [0, 20], [3, 40], [9, 36], [18, -6], [23, 2], [30, 0]],
  armL: [[H, 15], [-8, 15], [0, 18], [3, 36], [9, 32], [18, -5], [23, 2], [30, 0]],
  armRRoll: [[H, -75], [-8, -70], [0, -42], [3, -26], [9, -22], [18, -6], [23, -2], [30, 0]],
  armLRoll: [[H, -70], [-8, -66], [0, -40], [3, -28], [9, -22], [18, -6], [23, -2], [30, 0]],
  elbowR: [[H, 20], [-8, 20], [0, 18], [3, 30], [9, 28], [18, 4], [30, 0]],
  elbowL: [[H, 20], [-8, 20], [0, 18], [3, 30], [9, 28], [18, 4], [30, 0]],
};
const LY_DONE = 30;
const lagFrames: Record<string, number> = { headPitch: 1, armR: 1, armL: 1, armRRoll: 1, armLRoll: 1, elbowR: 1, elbowL: 1 };
// 风里两臂微微抖（着地前收掉）
const flutter = (c: number) => (1 - ss((c + 8) / 6)) * Math.sin(c * 0.9);

const tweakLiying = (ly: RideLiYing, c: number): RideLiYing => {
  if (c - 1 >= LY_DONE) return ly;
  const basePose = ly.poseOverride;
  const off = offsetAt(flights.liYing, T_LIYING + c);
  return {
    ...ly,
    poseOverride: (base: FigurePose) => {
      const pose: FigurePose = typeof basePose === 'function' ? basePose(base) : { ...base, ...basePose };
      const out: FigurePose = { ...pose, loc: [pose.loc[0] + off[0], pose.loc[1] + off[1], pose.loc[2] + off[2]], ground: c >= 0 ? 1 : 0 };
      for (const [k, keys] of Object.entries(liyingKeys)) (out as Record<string, unknown>)[k] = sampleLag(keys, c, lagFrames[k] ?? 0);
      out.armRRoll += 5 * flutter(c);
      out.armLRoll += 5 * flutter(c + 2);
      return out;
    },
  };
};

// ---------- 九胡（骨骼增量，到末尾归零）：比李樱轻，蹲得浅、起得快 ----------
const JH_PX = 0.7 / 16;
const jiuhuKeys: Record<string, Key[]> = {
  上身: [[H, 26], [-14, 22], [-6, 6], [0, 8], [3, 24], [8, 20], [16, -3], [21, 1], [28, 0]],
  头: [[H, 22], [-8, 18], [0, 0], [28, 0]], // 低头看落点（rot.x 正 = 低头）
  右腿: [[H, 15], [-14, 12], [-6, 26], [-2, 16], [0, 8], [3, 50], [8, 44], [16, 0], [28, 0]],
  左腿: [[H, -10], [-8, -5], [-2, 0], [0, 5], [3, 46], [8, 40], [16, 0], [28, 0]],
  右膝: [[H, 45], [-8, 35], [-2, 15], [0, 12], [3, 95], [8, 85], [16, 0], [28, 0]],
  左膝: [[H, 50], [-8, 40], [-2, 18], [0, 15], [3, 90], [8, 80], [16, 0], [28, 0]],
  臂前: [[H, 10], [-8, 10], [0, 15], [3, 30], [8, 26], [16, -5], [21, 0], [28, 0]],
  臂张: [[H, 70], [-8, 65], [0, 40], [3, 22], [8, 18], [16, 4], [28, 0]],
  耳: [[H, -15], [-1, -15], [2, 14], [6, 0], [28, 0]], // 下落时被风压平，着地一抖
};
const JH_DONE = 28;
const legHeight = (thigh: number, knee: number) => {
  const deg2rad = Math.PI / 180;
  return 7.7 * Math.cos(thigh * deg2rad) + 8.7 * Math.cos((thigh - knee) * deg2rad) + 2.55;
};
const addRot = (bone: BonePose | undefined, delta: number[]): BonePose => {
  const rot = bone?.rot ?? [0, 0, 0];
  return { ...bone, rot: rot.map((v, i) => v + (delta[i] ?? 0)) };
};
// 尾巴不管，落地后.tsx 按全局帧接着摆
const tweakJiuhu = (jh: RideJiuhu, c: number, F: number): RideJiuhu => {
  const baseOffset = jh.offset ?? [0, 0, 0];
  const bones = { ...(jh.boneOverrides ?? {}) };
  const offset: V3 = [baseOffset[0] + choreo619b.jiuhuStepTo[0], baseOffset[1] + choreo619b.jiuhuStepTo[1], baseOffset[2]];
  if (c - 1 >= JH_DONE) return { ...jh, boneOverrides: bones, offset };
  const keyAt = (k: string) => sampleLag(jiuhuKeys[k], c, 1);
  const [upperBody, head, legR, legL, kneeR, kneeL, armFwd, armOut, ear] = ['上身', '头', '右腿', '左腿', '右膝', '左膝', '臂前', '臂张', '耳'].map(keyAt);
  bones.UpBody = addRot(bones.UpBody, [upperBody, 0, 0]);
  bones.Head = addRot(bones.Head, [-0.6 * upperBody + head, 0, 0]);
  bones.RightLeg = addRot(bones.RightLeg, [-legR, 0, 0]);
  bones.LeftLeg = addRot(bones.LeftLeg, [-legL, 0, 0]);
  bones.RightLowerLeg = addRot(bones.RightLowerLeg, [kneeR, 0, 0]);
  bones.LeftLowerLeg = addRot(bones.LeftLowerLeg, [kneeL, 0, 0]);
  bones.RightFoot = addRot(bones.RightFoot, [legR - kneeR, 0, 0]);
  bones.LeftFoot = addRot(bones.LeftFoot, [legL - kneeL, 0, 0]);
  bones.RightArm = addRot(bones.RightArm, [-armFwd, 0, armOut + 4 * flutter(c + 1)]);
  bones.LeftArm = addRot(bones.LeftArm, [-armFwd, 0, -armOut - 4 * flutter(c + 3)]);
  bones.Left_ear = addRot(bones.Left_ear, [ear, 0, 0]);
  bones.Right_ear = addRot(bones.Right_ear, [ear, 0, 0]);
  const hipDrop = c >= 0 ? (18.95 - Math.max(legHeight(legR, kneeR), legHeight(legL, kneeL))) * JH_PX : 0;
  const off = offsetAt(flights.jiuhu, F);
  return { ...jh, boneOverrides: bones, offset: [offset[0] + off[0], offset[1] + off[1], offset[2] + off[2] - hipDrop] };
};

export const tweakRiders = (F: number) => (riders: Riders): Riders => ({
  ...riders,
  liYing: tweakLiying(riders.liYing, F - T_LIYING),
  jiuhu: tweakJiuhu(riders.jiuhu, F - T_JIUHU, F),
});

// ---------- 着地粒子（`LivingEntity.checkFallDamage` → `ServerLevel.sendParticles`） ----------
// 个数 150 × min(0.2 + ⌈摔落距离 − 3⌉ / 15, 2.5)，都从脚下那一点出，速度每轴高斯 × 0.15，再经 `Particle` 构造函数随机化；TerrainParticle 重力 1、摩擦 0.98、落到屋顶上停住
export const particleCount = Math.floor(150 * Math.min(0.2 + Math.ceil(fallHeight - 3) / 15, 2.5));
const gaussian = (rand: () => number) => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const burst = (feet: V3, seed: number): BreakParticle[] => {
  const rand = rng(seed);
  const out: BreakParticle[] = [];
  for (let i = 0; i < particleCount; i++) {
    // 游戏坐标（y 朝上）：x = 场景 x、y = 场景 z、z = -场景 y
    const [gx, gy, gz] = particleInitVel(rand, gaussian(rand) * 0.15, gaussian(rand) * 0.15, gaussian(rand) * 0.15);
    const life = Math.floor(4 / (rand() * 0.9 + 0.1));
    const half = (0.1 * (rand() * 0.5 + 0.5) * 2) / 2;
    const uo = rand() * 3;
    const vo = rand() * 3;
    out.push({
      path: particlePath(feet, [gx, -gz, gy], life + 1, { gravity: 1, friction: 0.98, ground: roofZ + half }),
      life,
      half,
      uv: [(uo + 1) / 4, vo / 4, uo / 4, (vo + 1) / 4],
      color: [0.6, 0.6, 0.6],
    });
  }
  return out;
};
// 着地点（场坐标）
const touchAt = (stand: V3, fl: Flight): V3 => [stand[0] + fl.touch[0], stand[1] + fl.touch[1], 0];
export const bursts = [
  { at: T_LIYING, ps: burst(fromScene([...touchAt(LIYING_AT, flights.liYing).slice(0, 2), 0.01]), 61901) },
  { at: T_JIUHU, ps: burst(fromScene([...touchAt(JIUHU_AT, flights.jiuhu).slice(0, 2), 0.01]), 61902) },
];

// ---------- 声音（帧 = 6-1-9b 段内帧） ----------
// 照 6-3-下坠/声音.tsx 的落地：`LivingEntity.causeFallDamage` 的摔落声（> 4 点 → entity.player.big_fall，1、1，在人身上）+ `playBlockFallSound`（脚下方块 fall 声，volume × 0.5、pitch × 0.75；城堡砖是 STONE）
export const landingSounds: SoundCue[] = [
  ['李樱', T_LIYING, touchAt(LIYING_AT, flights.liYing), 0.31],
  ['九胡', T_JIUHU, touchAt(JIUHU_AT, flights.jiuhu), 0.67],
].flatMap(([name, at, p, pick]) => {
  const frame = (at as number) - F0;
  const pos = p as V3;
  return [
    { 名: `${name}落地`, 事件: 'entity.player.big_fall', 帧: frame, 位置: fromScene([pos[0], pos[1], 0.9]), 音量: 1, 音高: 1, 选: pick as number },
    { 名: `${name}落地·城堡砖`, 事件: 'block.stone.fall', 帧: frame, 位置: fromScene(pos), 音量: 0.5, 音高: 0.75, 选: 1 - (pick as number) },
  ];
});

