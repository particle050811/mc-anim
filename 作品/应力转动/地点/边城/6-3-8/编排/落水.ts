// 6-3-8 从城墙走道内沿跳进墙脚的落水池（边城/布局/共用.ts 的 `fallPool`）、蹚到南边池沿爬上岸、跳下池沿到环城路、往西跑向城门大街。卫兵和两人共用。
// 城的局部坐标（米，Z 朝上，北 = +Y），全局秒 t。都是朝正南跳、朝正南蹚，所以落水前后只算南北一个方向，上岸以后才沿路拐弯。
// 照原版逐刻（1/20 秒）算，刻与刻之间线性插值：
// - 空中：每刻先移动，再水平 × 0.91、竖直 (v − 0.08) × 0.98；跳起竖直起速 0.42，迈出去是 0。跳出去以后不按方向键（站池边跳水都这么控），只剩空气阻力，
//   水平总共滑出 v0 × (1 − 0.91^刻数) / 0.09，按要落的地方定 v0。
// - 脚底低于水面那一刻落水（Entity.doWaterSplashEffect：溅水和落水声，摔落距离清零、不掉血）。
// - 水里：一直按着前进和跳（LivingEntity.travel 水里：前进加 0.02，疾跑时水平 × 0.9、竖直 × 0.8，再往下 0.005；没过脚底 0.4 以上才往上浮 0.04）。
//   池深 1.39 米，人站在池底水到胸口；顶到池沿、往上让 0.6 格就不挨着池沿时 jumpOutOfFluid（竖直 0.3）扒上去。
// - 池沿顶上：地面疾跑 5.6 米/秒；从池沿南边迈下去落到路上（空中同上，按着前进加 0.026）。池沿一格宽、路三格宽，快了会冲进对面的房子，所以到路上才提速：
//   按默认的 `RAMP_SEC`（跑步.ts）加到 `topSpeed`（精英 30、卫兵 20 米/秒，用户 10-20）。
import type { V3 } from '@engine/model/parts.tsx';
import { fallPool } from '../../布局/共用.ts';
import { poolSurfaceZ } from '../../水池.tsx';
import { RAMP_SEC, runCadence, speedProfile } from '@库/角色/跑步.ts';
import { lerp } from './工具.ts';

const WALK_Z = 28.5; // 走道顶面
const ROAD_Z = 0.5; // 城里地面（石半砖顶面）
const HALF = 0.3; // 人的碰撞箱半宽（玩家 0.6 宽）
const rimTop = fallPool.waterTop;
const rimInner = fallPool.y0; // 南池沿的北面
const rimOuter = fallPool.y0 - 1; // 南池沿的南面
const MAIN_STREET_X = 5; // 拐进城门大街的地方
const SPRINT = 0.28; // 疾跑，格/刻
const TICK = 1 / 20;

export type PoolPhase = '空中' | '水里' | '岸上' | '路上';
// walked：水平走过的路（米）；cycles：步态周期数（∫步频 dt，见 模型/角色/跑步.ts），摆腿相位按它
export type PoolSample = { pos: V3; phase: PoolPhase; speed: number; heading: number; walked: number; cycles: number };
export type PoolJumpOpts = { takeoffSec: number; x: number; y: number; vz0: number; vh0: number; wadeDelay: number; topSpeed: number };
export type PoolJump = PoolJumpOpts & { at: (t: number) => PoolSample; entry: { sec: number; pos: V3; vel: V3 }; roadSec: number };

// 跳出去以后不按方向键、落到水面要几刻（竖直只看 vz0）
export const ticksToSurface = (vz0: number) => {
  let z = WALK_Z;
  let vz = vz0;
  for (let k = 1; k < 200; k++) {
    z += vz;
    vz = (vz - 0.08) * 0.98;
    if (z < poolSurfaceZ) return k;
  }
  return 200;
};
// 要落在起跳点往南 d 米处，起跳时的水平速度（格/刻）
export const vhForDrop = (d: number, vz0: number) => (d * 0.09) / (1 - 0.91 ** ticksToSurface(vz0));

type TickState = { y: number; z: number; phase: PoolPhase; walked: number; cycles: number };
export const poolJump = (opts: PoolJumpOpts): PoolJump => {
  const { x, vz0, vh0 } = opts;
  let y = opts.y;
  let z = WALK_Z;
  let vh = vh0; // 往南为正
  let vz = vz0;
  let walked = 0;
  let cycles = 0;
  let phase: PoolPhase = '空中';
  let wet = false; // 落过水
  let entry: PoolJump['entry'] | null = null;
  let bottomTick = -1;
  const ticks: TickState[] = [{ y, z, phase, walked, cycles }];
  const inPool = (py: number, pz: number) => py - HALF < fallPool.y1 && py + HALF > rimInner && pz < poolSurfaceZ;
  for (let k = 1; k < 400 && phase !== '路上'; k++) {
    const pushing = wet && bottomTick >= 0 && k - bottomTick >= opts.wadeDelay / TICK;
    const grounded0 = z <= (y - HALF < rimInner && y + HALF > rimOuter ? rimTop : ROAD_Z) + 1e-6 && vz === 0;
    // 按键：水里前进 + 跳；冒出水面、扒池沿时在空中按前进（疾跑空中 0.026）；从池沿迈下去就松开（要往西拐，不然冲进路对面的房子），地上的加速在后面摩擦那步一起算
    if (inPool(y, z)) {
      if (pushing) {
        vh += 0.02;
        if (poolSurfaceZ - z > 0.4) vz += 0.04;
      }
    } else if (wet && !grounded0 && y + HALF > rimOuter) vh += 0.026;
    // 移动：先水平（南池沿挡住：脚底低于池沿顶、碰撞箱从北面顶上去），再竖直（脚下是池沿顶还是池底 / 路面）
    const yPrev = y;
    const zPrev = z;
    let hitRim = false;
    y -= vh;
    if (z < rimTop && y - HALF < rimInner && yPrev - HALF >= rimInner - 1e-6) {
      y = rimInner + HALF;
      vh = 0;
      hitRim = true;
    }
    z += vz;
    const floorZ = y - HALF < rimInner && y + HALF > rimOuter ? rimTop : ROAD_Z;
    const grounded = z <= floorZ && zPrev >= floorZ - 1e-6;
    if (grounded) {
      z = floorZ;
      vz = 0;
    }
    walked += yPrev - y;
    cycles += runCadence(Math.abs(yPrev - y) / TICK) * TICK;
    if (!wet && inPool(y, z)) {
      wet = true;
      entry = { sec: opts.takeoffSec + k * TICK, pos: [x, y, z], vel: [0, y - yPrev, z - zPrev] };
    }
    if (wet && bottomTick < 0 && z <= ROAD_Z + 1e-6) bottomTick = k;
    // 阻力、重力
    if (inPool(y, z)) {
      vh *= 0.9;
      vz = vz * 0.8 - 0.005;
      if (hitRim && pushing && z + 0.6 >= rimTop) vz = 0.3;
    } else if (grounded) {
      vh = vh * 0.546 + SPRINT * (1 - 0.546); // 地面：摩擦 0.6 × 0.91，疾跑速度往 5.6 米/秒靠
    } else {
      vh *= 0.91;
      vz = (vz - 0.08) * 0.98;
    }
    // 段落：还在池子上方（含冒出水面扑腾）算水里，上了池沿到落地以前算岸上
    if (wet) phase = y + HALF > rimInner ? '水里' : grounded && z <= ROAD_Z + 1e-6 ? '路上' : '岸上';
    ticks.push({ y, z, phase, walked, cycles });
  }
  if (!entry) throw new Error(`6-3-8 落水：x ${x} 起跳没落进水池`);
  const lastTick = ticks.length - 1;
  const roadSec = opts.takeoffSec + lastTick * TICK;
  const roadStart: V3 = [x, ticks[lastTick].y, ROAD_Z];
  // 路上：从落地的地方沿环城路（南池沿和房子之间，y 189～191）往西，到城门大街往南
  const route: V3[] = [roadStart, [MAIN_STREET_X, roadStart[1], ROAD_Z], [MAIN_STREET_X, 120, ROAD_Z]];
  const along = (dist: number): { pos: V3; dir: number[] } => {
    let left = Math.max(0, dist);
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1];
      const b = route[i];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (left <= len || i === route.length - 1) {
        const f = len > 0 ? Math.min(left / len, 1) : 1;
        return { pos: [lerp(a[0], b[0], f), lerp(a[1], b[1], f), ROAD_Z], dir: [b[0] - a[0], b[1] - a[1]] };
      }
      left -= len;
    }
    return { pos: route[route.length - 1], dir: [0, -1] };
  };
  const headingOf = (dir: number[]) => Math.atan2(-dir[0], dir[1]) * (180 / Math.PI);
  const roadRun = speedProfile([[0, SPRINT * 20], [RAMP_SEC, opts.topSpeed]]);
  const at = (t: number): PoolSample => {
    const sinceTakeoff = t - opts.takeoffSec;
    const k = sinceTakeoff / TICK;
    if (k <= lastTick) {
      const i = Math.max(0, Math.min(Math.floor(k), lastTick - 1));
      const f = Math.max(0, Math.min(1, k - i));
      const a = ticks[i];
      const b = ticks[i + 1];
      const speed = Math.abs(b.y - a.y) / TICK;
      return { pos: [x, lerp(a.y, b.y, f), lerp(a.z, b.z, f)], phase: k < 0 ? '空中' : b.phase, speed, heading: 180, walked: lerp(a.walked, b.walked, f), cycles: lerp(a.cycles, b.cycles, f) };
    }
    // 路上：从疾跑 5.6 米/秒起 `RAMP_SEC` 加到 topSpeed；朝向往前看 0.6 米，落地时从朝南转到朝西用 0.25 秒
    const run = roadRun(t - roadSec);
    const here = along(run.dist);
    const ahead = along(run.dist + 0.6);
    const routeHeading = headingOf([here.dir[0] + ahead.dir[0], here.dir[1] + ahead.dir[1]]);
    const heading = lerp(180, routeHeading, Math.min(1, (t - roadSec) / 0.25));
    return { pos: here.pos, phase: '路上', speed: run.speed, heading, walked: ticks[lastTick].walked + run.dist, cycles: ticks[lastTick].cycles + run.cycles };
  };
  return { ...opts, at, entry, roadSec };
};
