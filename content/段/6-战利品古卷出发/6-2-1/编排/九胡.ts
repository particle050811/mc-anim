// 九胡：在南窗边看海，听到「对了」回头转身，小跑到屋子中间，最后贴到 6-2-4 首帧的姿态。
import { standPose, type FigurePose } from '../../../../../world/角色/骨架.tsx';
import { lerp, mixPose, ss, walkSwing, yawToward } from '../动作.ts';
import { FPS, lastFrame, cues } from './时间线.ts';
import { J0, JH_END, jiuhuPath, walkPlans, trip } from './站位.ts';
import { liying } from './李樱.ts';

// ---------- 九胡 ----------
export type JiuhuState = { pose: FigurePose; tail: number; bend: number; gait: number; run: number };
const jhStand = (loc: number[], yaw: number, d: Partial<FigurePose> = {}): FigurePose => ({ ...standPose(loc), yaw, ...d });
// 角度挪到 [180, 360)：九胡从朝南（180）一路转到朝东北（6-2-4 首帧 -65.5 = 294.5），都在这一圈里，插值不绕远路
const deg180 = (a: number) => ((((a - 180) % 360) + 360) % 360) + 180;
export const jiuhu = (globalFrame: number): JiuhuState => {
  const tail = (globalFrame - lastFrame) / 9; // 6-2-4 第 0 帧尾巴相位为 0
  if (globalFrame >= lastFrame) return { pose: JH_END.pose, tail: JH_END.tail, bend: JH_END.bend, gait: 0, run: 0 };
  const t = globalFrame / FPS;
  const lyLoc = liying(globalFrame).loc;
  const [m0, m1] = cues.jiuhuTurn;
  const [j0, j1] = cues.jiuhuWalk;
  if (t < j0) {
    // 看海：头慢慢左右转；听到喊声回头（他在她左后方），再整个人转过来
    const look = 10 * Math.sin((2 * Math.PI * t) / 7);
    const back = ss((t - cues.jiuhuLookBack) / 0.45) * (1 - ss((t - m0) / (m1 - m0)));
    const faceHim = deg180(yawToward(J0, lyLoc));
    const yaw = lerp(180, faceHim, ss((t - m0) / (m1 - m0)));
    return { pose: jhStand(J0, yaw, { headYaw: lerp(look, 55, back) * (1 - ss((t - m0) / (m1 - m0))), headPitch: 4 * back }), tail, bend: 0, gait: 0, run: 0 };
  }
  // 小跑到屋子中间，然后一直侧身看着李樱；最后转到 6-2-4 首帧的朝向
  const progress = trip(t, j0, j1, jiuhuPath.length, walkPlans.jiuhu[2]);
  const loc = jiuhuPath.at(progress.s);
  const turnIn = deg180(yawToward(J0, liying(j0 * FPS).loc));
  const track = deg180(yawToward(loc, lyLoc));
  let yaw = lerp(turnIn, deg180(jiuhuPath.heading(progress.s)), ss((t - j0) / 0.35));
  yaw = lerp(yaw, track, ss((t - (j1 - 0.3)) / 0.8));
  yaw = lerp(yaw, deg180(JH_END.pose.yaw ?? 0), ss((t - cues.handOver[0]) / (cues.handOver[1] - cues.handOver[0])));
  const amp = 26 * Math.min(1, progress.speed / 1.4);
  const pose = walkSwing(jhStand(loc, yaw), progress.s / 1.1, amp, { R: true, L: true });
  // 最后贴到 6-2-4 首帧的姿态（朝向换到同一圈里再插）
  const end = { ...JH_END.pose, yaw: deg180(JH_END.pose.yaw ?? 0) };
  return { pose: mixPose(pose, end, ss((t - cues.handOver[0]) / (cues.handOver[1] - cues.handOver[0]))), tail, bend: 0, gait: progress.s / 1.1, run: 0.4 * Math.min(1, progress.speed / 1.4) };
};
