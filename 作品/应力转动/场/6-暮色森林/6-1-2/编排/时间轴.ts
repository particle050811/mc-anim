// 6-1-2 的时间轴（切镜时刻、停住 0.5 秒、跳过助跑的剧情时间换算）和助跑道几何，其余各模块都从这里取。
// 时间都是秒。剧情时间原来按 1/24 秒一格排（第 1 格是段首），关键帧照原来的格写成 n / 24，所以剧情时间轴的原点不在段首：段首是剧情时间 `STORY_T0`。
import { holdTime } from '@engine/anim/anim.ts';
import { rad, smoothstep01, lerpV } from '@engine/core/数学.ts';

export const S2 = 92 / 24; // 切到庭院西墙外：滞空 → 迅冲斩擦着镜头掠过、斩向庭院中心
export const S2C = 113 / 24; // 硬切到横穿点上方的俯拍：他从画面左上冲进来，横穿娜迦脖子，从右边冲出去
export const S2B = 122 / 24; // 切到庭院中心（俯拍只有 7/24 秒时太快，多留 2/24 秒看他滑出去）：急停、收刀、娜迦断开消散、宝箱
export const S3 = 212 / 24; // 切到迷宫里的九胡：她被传送到了水池南边那条东西向通道的西头，开跑直奔中心
// 剧情时间的终点（不含）。
export const END = 244 / 24;

// 迅冲比原来长 0.5 秒，动作和娜迦关键帧是按短迅冲调的，所以不改关键帧，把时间轴在迅冲开头"停住"0.5 秒（98/24～110/24 秒按 98/24 秒的姿态），之后顺延。
const HOLD0 = 98 / 24;
export const HOLD = 12 / 24;
export const warp = holdTime([HOLD0, HOLD]);

// 助跑缩短：全速跑中途跳过 52/24 秒"剧情时间"（传送门往东挪近所致），各处关键帧、机位参数因此不用改。
// 时间都是剧情时间，组装镜头用 `story()` 换算；跑过的距离、步态相位按实际时间算（`lyL`、`jhL`、`lyPhase`），位置脚步才连续。
const SKIP_AT = 28 / 24;
const SKIP = 52 / 24;
export const story = (t: number) => (t < SKIP_AT ? t : t + SKIP);
export const real = (t: number) => (t < SKIP_AT ? t : t < SKIP_AT + SKIP ? SKIP_AT : t - SKIP);
// 段首（段内第 0 秒）在剧情时间里的时刻：关键帧表是从这里写起的
export const STORY_T0 = 1 / 24;
// 段长（秒）：剧情时间到 END 为止
export const LENGTH = END - STORY_T0 - SKIP;
// 段内秒 ↔ 剧情时间：声音.tsx 的配音、音效按 `segSec` 落
export const storyOfSeg = (sec: number) => story(sec + STORY_T0);
export const segSec = (s: number) => real(s) - STORY_T0;
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
// 正好压在格线上（整数）时台阶高度不连续，浮点零头落在哪边决定这一帧的高度。按秒算的距离比原来按帧算的多出 1e-14 量级的零头，
// 只把略大于整数的收回整数，6-斩娜迦 跑道段每一帧都和原来按帧算的一致（两边都收的话，有一帧原来就落在格线外侧，反而对不上）
const LANE_SLACK = 1e-9;
export const laneZ = (rawLaneDist: number) => {
  const whole = Math.round(rawLaneDist);
  const over = rawLaneDist - whole;
  const laneDist = over > 0 && over < LANE_SLACK ? whole : rawLaneDist;
  let z = cellZ(Math.round(laneDist / 2));
  for (let i = 1; i < LANE_GROUND.length; i++) {
    const edge = 2 * i - 1;
    const hi = cellZ(i);
    const lo = cellZ(i - 1);
    const d = edge - laneDist;
    if (hi > lo && d >= 0) z = Math.max(z, hi - 16 * (d / RUN_V) ** 2);
    if (lo > hi && d < 0 && d > -STEP_UP) z = Math.max(z, hi + (lo - hi) * smoothstep01(1 + d / STEP_UP));
  }
  return z;
};
export const LANE_YAW = -LANE_DEG; // 朝东跑：从朝 +Y 往右转 90°
export const GO = 8 / 24; // 两人同时起跑
