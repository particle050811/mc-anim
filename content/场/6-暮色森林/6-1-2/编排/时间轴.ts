// 6-1-2 的时间轴（切镜帧、停住 12 帧、跳过助跑的剧情帧换算）和助跑道几何，其余各模块都从这里取。
import { rad, holdTime } from '../../../../../engine/anim/anim.ts';

export const FPS = 24;
export const S2 = 92; // 切到庭院西墙外：滞空 → 迅冲斩擦着镜头掠过、斩向庭院中心
export const S2C = 113; // 硬切到横穿点上方的俯拍：他从画面左上冲进来，横穿娜迦脖子，从右边冲出去
export const S2B = 122; // 切到庭院中心（俯拍只有 7 帧时太快，多留 2 帧看他滑出去）：急停、收刀、娜迦断开消散、宝箱
export const S3 = 212; // 切到迷宫里的九胡：她被传送到了水池南边那条东西向通道的西头，开跑直奔中心
// 剧情帧的终点（不含）。
export const END = 244;

// 迅冲比原来长 12 帧，动作和娜迦关键帧是按短迅冲调的，所以不改关键帧，把时间轴在迅冲开头"停住"12 帧（f98～110 按 f98 姿态），之后顺延。
const HOLD0 = 98;
export const HOLD = 12;
export const warp = holdTime([HOLD0, HOLD]);

// 助跑缩短：全速跑中途跳过 52 帧"剧情时间"（传送门往东挪近所致），各处关键帧、机位参数因此不用改。
// f 都是剧情帧，组装镜头用 `story()` 换算；跑过的距离、步态相位按实际帧算（`lyL`、`jhL`、`lyPhase`），位置脚步才连续。
const SKIP_AT = 28;
const SKIP = 52;
export const story = (f: number) => (f < SKIP_AT ? f : f + SKIP);
export const real = (f: number) => (f < SKIP_AT ? f : f < SKIP_AT + SKIP ? SKIP_AT : f - SKIP);
export const FRAMES = END - 1 - SKIP;
// 剧情帧 → 段内帧（Remotion 帧 = 实际帧 − 1）：声音.tsx 的配音、音效按它落帧
export const segFrame = (s: number) => real(s) - 1;

export const ss = (x: number) => { const clamped = Math.min(1, Math.max(0, x)); return clamped * clamped * (3 - 2 * clamped); };
export const lerp3 = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);

// ---------- 跑道 ----------
export const LANE_E = [-89, -0.4]; // L = 0 的点（水沟里）；L 往西增大
const LANE_DEG = 90;
export const HX = Math.sin(rad(LANE_DEG));
export const HY = Math.cos(rad(LANE_DEG));
export const lanePt = (L: number, off = 0): [number, number] => [LANE_E[0] - HX * L + HY * off, LANE_E[1] - HY * L - HX * off];
// 跑道地面高度，每 2 格一个（L = 0, 2, 4 …），从导出的网格量的；a = -1
const LANE_GROUND = '000a0000000001111110000000000111111111111111111111111111';
const gz = (c: string) => (c === 'a' ? -1 : +c);
const cellZ = (i: number) => gz(LANE_GROUND[Math.min(Math.max(i, 0), LANE_GROUND.length - 1)]);
// 跑过台阶（往东跑 = L 减小，格 i 和 i−1 的交界在 L = 2i − 1）：下台阶照玩家重力（约 32 米/秒²）按 40 米/秒跑速落，1 格要跑出 10 米才落地；
// 上台阶在边前 3 米里抬上去。按格线性插值的话 1 格不到一帧就走完，看着一帧掉一格（用户 10-18）。
const RUN_V = 40;
const STEP_UP = 3;
export const laneZ = (laneDist: number) => {
  let z = cellZ(Math.round(laneDist / 2));
  for (let i = 1; i < LANE_GROUND.length; i++) {
    const edge = 2 * i - 1;
    const hi = cellZ(i);
    const lo = cellZ(i - 1);
    const d = edge - laneDist;
    if (hi > lo && d >= 0) z = Math.max(z, hi - 16 * (d / RUN_V) ** 2);
    if (lo > hi && d < 0 && d > -STEP_UP) z = Math.max(z, hi + (lo - hi) * ss(1 + d / STEP_UP));
  }
  return z;
};
export const LANE_YAW = -LANE_DEG; // 朝东跑：从朝 +Y 往右转 90°
export const GO = 8; // 两人同时起跑
