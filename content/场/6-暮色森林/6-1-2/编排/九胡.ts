// 九胡：林道上被甩开的跑法，S3 起被传送进迷宫后顺通道跑向中心（6-1-3 接着用同一路线）。
import { track } from '../../../../../engine/anim/anim.ts';
import { FigurePose } from '../../../../../world/角色/骨架.tsx';
import { FPS, S3, END, real, ss, lanePt, laneZ, LANE_YAW, GO } from './时间轴.ts';
import { makeTrail, trailOn } from './折线.ts';
import { START_L } from './李樱.ts';

// ---------- 九胡：晚 1 秒起跑，10 米/秒，被远远甩开；S3 她已被传送进迷宫 ----------
// 用户 10-01：酒狐有跟随主人的设定，主人走远会被瞬移过去，所以最后直接出现在迷宫里；下一段 6-1-3 她跑到中心，二人从中心起飞。
const JH_OFF = -0.6; // 起跑时站在李樱左手边
export const JH_GO = GO + 20;
const V_JH = 10 / FPS;
const JH_ACC = 10;
export const jhDist = (frame: number) => {
  const realFrame = real(frame);
  return realFrame <= JH_GO ? 0 : realFrame <= JH_GO + JH_ACC ? (V_JH * (realFrame - JH_GO) ** 2) / (2 * JH_ACC) : (V_JH * JH_ACC) / 2 + V_JH * (realFrame - JH_GO - JH_ACC);
};
export const JH_STRIDE = 2.8; // 一个周期（两步）跑 2.8 格：10 米/秒下每秒 3.6 个周期
export const jiuhu = (frame: number) => {
  if (frame >= S3) return jiuhuMaze(frame - S3);
  const dist = jhDist(frame);
  const laneDist = START_L - dist;
  const ph = (2 * Math.PI * dist) / JH_STRIDE;
  const run = track([[JH_GO, 0], [JH_GO + 4, 1]], frame);
  const land = 1 - ss((frame - 1) / 6);
  const swing = 52 * Math.sin(ph) * run;
  const hop = Math.abs(Math.sin(ph));
  const pose: FigurePose = {
    loc: [...lanePt(laneDist, JH_OFF), laneZ(laneDist) + 0.18 * hop * run],
    pitch: -14 * run,
    squash: 1,
    headPitch: 8 * run,
    headYaw: 0,
    legR: swing,
    legL: -swing,
    armR: -swing * 0.8,
    armRRoll: 0,
    armL: swing * 0.8,
    armLRoll: 0,
    yaw: LANE_YAW,
  };
  return { pose, gait: ph / (2 * Math.PI), run, bend: 28 * land, tail: ph / 2 };
};

// ---------- 九胡在迷宫里：被传送进来，顺通道直奔中心（6-1-3 接着用同一路线）----------
// 游戏依据（touhoulittlemaid-1.5.3 反汇编）：女仆离主人超过 10 格就 `EntityMaid.teleportToOwner`，在主人脚下 ±3 格随机挑一格，无粒子无音效，所以不加特效，直接切到她已在迷宫里、愣一下开跑。落点是剧情安排（用户定）。
// 路线（用户 10-02 要直线跑过来）：正西被水池挡住，最接近正西又直奔中心的是水池南边东西向通道（y -9～-7，平地 z=0），西头顶着南北向树篱（x -26～-22）。
// 落点在西头贴树篱（x -20.2），往东跑 14 格，最后 7 格往左偏 33° 拐到李樱西南边扫帚旁；全长 21 格，离树篱至少 1.3 格。
export const JH_MAZE_PTS: [number, number, number][] = [
  // [x, y, 拐角倒圆半径]
  [-20.2, -8, 0], // 传送落点：水池南边通道的西头，背后贴着树篱
  [-6, -7.6, 5],
  [0.1, -3.6, 0], // 停下的地方
];
const JH_MAZE = makeTrail(JH_MAZE_PTS);
// 时间 t = 传送后过了几帧（6-1-2 的 S3 那一帧是 0；6-1-3 的第 0 帧接 6-1-2 末帧，t = MAZE_T612）
const MZ_LOOK = 4; // 刚被传送过来，站着愣 4 帧（看一眼中心的方向）
const MZ_ACC = 8; // 8 帧加到 10 米/秒
const MZ_DEC = 12; // 刹车用 12 帧，滑出 2.5 格，正好停在路线终点
const MZ_CRUISE = (JH_MAZE.len - (V_JH * MZ_ACC) / 2 - (V_JH * MZ_DEC) / 2) / V_JH; // 全速跑几帧
export const MAZE_T612 = END - 1 - S3;
export const MAZE_ARRIVE = MZ_LOOK + MZ_ACC + MZ_CRUISE + MZ_DEC;
// 开跑 4 帧后边跑边喊「等等我啊，狗修金Sama！」（用户 10-20：从她开始跑的这个镜头就喊），一口气连读下来，刹车前说完；说进 6-1-3 的后半截那边接着放
export const MAZE_SHOUT = MZ_LOOK + 4;
export const mazeDist = (t: number) => {
  const elapsed = t - MZ_LOOK;
  if (elapsed <= 0) return 0;
  if (elapsed <= MZ_ACC) return (V_JH * elapsed * elapsed) / (2 * MZ_ACC);
  const d1 = (V_JH * MZ_ACC) / 2;
  if (elapsed <= MZ_ACC + MZ_CRUISE) return d1 + V_JH * (elapsed - MZ_ACC);
  const brakeT = Math.min(elapsed - MZ_ACC - MZ_CRUISE, MZ_DEC);
  return d1 + V_JH * MZ_CRUISE + V_JH * (brakeT - (brakeT * brakeT) / (2 * MZ_DEC));
};
export const mazeAt = (d: number) => trailOn(JH_MAZE, Math.min(d, JH_MAZE.len));
export const jiuhuMaze = (t: number) => {
  const dist = mazeDist(t);
  const [x, y, dir] = mazeAt(dist);
  const ph = (2 * Math.PI * dist) / JH_STRIDE;
  const elapsed = t - MZ_LOOK;
  const run = ss(elapsed / 3) * (1 - ss((elapsed - MZ_ACC - MZ_CRUISE - MZ_DEC * 0.4) / (MZ_DEC * 0.6)));
  const brake = ss((elapsed - MZ_ACC - MZ_CRUISE) / 4) * (1 - ss((elapsed - MZ_ACC - MZ_CRUISE - MZ_DEC) / 6));
  const stopped = ss((elapsed - MZ_ACC - MZ_CRUISE - MZ_DEC * 0.6) / 8);
  const swing = 52 * Math.sin(ph) * run;
  const hop = Math.abs(Math.sin(ph));
  const look = 1 - ss(elapsed / 4);
  const pose: FigurePose = {
    loc: [x, y, 0.18 * hop * run],
    pitch: -14 * run + 10 * brake,
    squash: 1,
    headPitch: 8 * run + 6 * look,
    headYaw: 25 * look,
    legR: swing + 5 * stopped,
    legL: -swing - 5 * stopped,
    armR: -swing * 0.8 + 4 * stopped,
    armRRoll: 10 * stopped,
    armL: swing * 0.8 + 4 * stopped,
    armLRoll: 10 * stopped,
    yaw: dir - 90,
  };
  return { pose, gait: ph / (2 * Math.PI), run, bend: 0, tail: ph / 2 + 0.25 * Math.max(0, elapsed - MZ_ACC - MZ_CRUISE - MZ_DEC) };
};
