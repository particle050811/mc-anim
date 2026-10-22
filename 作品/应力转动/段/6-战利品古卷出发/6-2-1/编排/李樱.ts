// 李樱：关键姿态（模块加载时按手要到的位置反解一次），按时刻表在姿态间过渡，进门和走到屋子中间的走路。
import { standPose, type FigurePose } from '@库/角色/骨架.tsx';
import { lerp, mixPose, near, reach, ss, walkSwing, withPose } from '../动作.ts';
import { FPS, lastFrame, cues } from './时间线.ts';
import { LY_H, tableSpot, COMPASS_ON_TABLE, LY_END, LOOT_GRIP, lootTable, sub, enter, exitPath, walkPlans, trip } from './站位.ts';

// ---------- 李樱的关键姿态（模块加载时按手要到的位置反解一次） ----------
const stand = (d: Partial<FigurePose> = {}) => withPose(standPose(tableSpot), { elbowR: 6, elbowL: 6, armRRoll: 2, armLRoll: 2, ...d });
// 前倾时腿跟着补回来，腿保持竖直（骨架的腿角是相对躯干的）
const lean = (deg: number, d: Partial<FigurePose> = {}) => stand({ pitch: -deg, legR: deg, legL: deg, ...d });
// 每只手：[目标点, 初值 [arm, roll, elbow], 范围（可省）]。
// 骨架的上臂没有绕自身轴的拧转，小臂只能在「上臂 + 往前」那个面里弯，所以手要送到胸口正中时只能把整条上臂往里横过来，会穿进胸口；
// 这里照 MC 的做法：手放在肩膀前面、或者伸远一点再往中间并，上臂一律往前抬（范围卡住），不去够贴着胸口的位置
type Arm = [number[], [number, number, number], [number, number][]?];
const LIM: [number, number][] = [[-10, 120], [-40, 60], [0, 140]];
const ik = (pose: FigurePose, rightArm: Arm | null, leftArm: Arm | null) => {
  let out = pose;
  if (rightArm) out = reach(out, 'R', rightArm[0], LY_H, { init: rightArm[1], lim: rightArm[2] ?? LIM });
  if (leftArm) out = reach(out, 'L', leftArm[0], LY_H, { init: leftArm[1], lim: leftArm[2] ?? LIM });
  return out;
};
const FWD: [number, number][] = [[50, 110], [-40, 70], [0, 120]]; // 两手往前伸、在身前并拢

const poses = (() => {
  const blood = sub(lootTable('炽热的血'), LOOT_GRIP);
  const fur = sub(lootTable('雪怪首领毛皮'), LOOT_GRIP);
  const leanTable = ik(lean(5, { headPitch: -10 }), [[2.28, -2.9, 1.1], [15, 20, 85]], [[1.72, -2.9, 1.1], [15, 20, 85]]);
  return {
    stand: stand(),
    reachOut: ik(lean(24, { headPitch: -18 }), [fur, [85, 10, 25]], [blood, [85, 10, 25]]),
    // 两样东西端在胸前（别挡住脸），先看右手的毛皮、再看左手的血，最后满意地点点头
    raise: ik(stand({ headPitch: -16 }), [[2.34, -2.92, 1.28], [55, 0, 80]], [[1.66, -2.92, 1.28], [55, 0, 80]]),
    lookBlood: ik(stand({ headPitch: -18, headYaw: 14 }), [[2.36, -2.94, 1.24], [50, 0, 80]], [[1.74, -2.92, 1.36], [60, 0, 90]]),
    lookFur: ik(stand({ headPitch: -18, headYaw: -14 }), [[2.26, -2.92, 1.36], [60, 0, 90]], [[1.64, -2.94, 1.24], [50, 0, 80]]),
    nod: ik(stand({ headPitch: -24 }), [[2.32, -2.92, 1.27], [55, 0, 80]], [[1.68, -2.92, 1.27], [55, 0, 80]]),
    leanTable: leanTable,
    // 6-2-2
    lookDown: withPose(leanTable, { headPitch: -40, pitch: -7, legR: 7, legL: 7 }),
    // 左小臂竖到左肩前面，像看手表那样看袖口
    lookSleeve: ik(withPose(leanTable, { headPitch: -26, headYaw: 22, pitch: -4, legR: 4, legL: 4 }), null, [[1.66, -2.98, 1.45], [40, -10, 100], [[10, 90], [-30, 30], [40, 140]]]),
    tap: withPose(leanTable, { headPitch: -34, headYaw: -4, pitch: -6, legR: 6, legL: 6 }),
    // 抬眼看画面右边打开的 JEI（往自己左边偏一点头）
    lookUi: withPose(leanTable, { headPitch: -3, headYaw: 12, pitch: -3, legR: 3, legL: 3 }),
    // 6-2-3
    // 右拳举到肩前，左掌平摊在胸前；右拳砸进左掌
    windUp: ik(stand({ headPitch: 5 }), [[2.3, -3.0, 1.66], [110, -8, 60]], [[1.98, -2.84, 1.17], [75, 40, 20], FWD]),
    slap: ik(stand({ headPitch: 2 }), [[2.02, -2.84, 1.27], [75, 40, 25], FWD], [[1.98, -2.84, 1.17], [75, 40, 20], FWD]),
    handsDown: stand({ headPitch: 3, armR: 10, armL: 6, elbowR: 14, elbowL: 10 }),
    // 拍完手又看回界面；说到「保护5」时点一下头（夸克古卷那句开口后 5.25 秒）
    handsDownLook: stand({ headPitch: -1, headYaw: 12, armR: 10, armL: 6, elbowR: 14, elbowL: 10 }),
    nodLook: stand({ headPitch: -13, headYaw: 10, armR: 10, armL: 6, elbowR: 14, elbowL: 10 }),
    // 身子往右前方探，右手去够桌角的指南针
    grab: ik(lean(22, { headPitch: -26, yaw: -20, armL: 6, loc: [2.1, -3.28, 0] }), [sub(COMPASS_ON_TABLE, [0.02, 0.06, -0.09]), [75, 0, 20]], null),
    // 右手平托着指南针端在胸前，左手在旁边虚扶。低头 −24°（指南针托高以后，头再低下巴就顶进表壳，见 站位.ts 的 COMPASS_GRIP）
    holdCompass: ik(lean(4, { headPitch: -24 }), [[2.12, -2.86, 1.2], [70, 35, 30], FWD], [[1.84, -2.9, 1.08], [70, 35, 30], FWD]),
    lookUp: ik(stand({ headPitch: 0, headYaw: 22 }), [[2.12, -2.86, 1.2], [70, 35, 30], FWD], [[1.84, -2.9, 1.08], [70, 35, 30], FWD]),
  };
})();

// 分段过渡：按时刻表在几个姿态之间平滑切换（每段 [开始秒, 结束秒, 目标姿态]）
const chain = (t: number, first: FigurePose, steps: [number, number, FigurePose][]) => {
  let pose = first;
  for (const [start, end, target] of steps) {
    if (t <= start) break;
    pose = mixPose(pose, target, ss((t - start) / (end - start)));
  }
  return pose;
};

// ---------- 李樱 ----------
export const liying = (globalFrame: number): FigurePose => {
  if (globalFrame >= lastFrame) return LY_END;
  const t = globalFrame / FPS;
  // 6-2-1 进门
  if (t < cues.atTable + 0.01) {
    const progress = trip(t, walkPlans.enter[0], walkPlans.enter[1], enter.length, walkPlans.enter[2], walkPlans.enter[3]);
    const loc = enter.at(progress.s);
    const yaw = lerp(enter.heading(progress.s), 0, ss((t - 1.3) / (cues.atTable - 1.3)));
    return walkSwing(withPose(poses.stand, { loc, yaw }), progress.s / 1.5, 30 * Math.min(1, progress.speed / 1.5));
  }
  if (t < cues.lookDown) {
    return chain(t, poses.stand, [
      [cues.atTable, cues.grab, poses.reachOut],
      [cues.grab, cues.raised, poses.raise],
      [cues.lookFur[0], cues.lookFur[1], poses.lookFur],
      [cues.lookBlood[0], cues.lookBlood[1], poses.lookBlood],
      [9.0, 9.5, poses.raise],
      [cues.nod[0], cues.nod[1], poses.nod],
      [cues.putDown, cues.putDone, poses.reachOut],
      [cues.putDone, 11.9, poses.leanTable],
    ]);
  }
  if (t < cues.slap - 0.4) {
    let pose = chain(t, poses.leanTable, [
      [cues.lookDown, cues.lookDown + 1.0, poses.lookDown],
      [cues.raiseSleeve, cues.raiseSleeve + 1.0, poses.lookSleeve],
      [cues.lowerSleeve, cues.lowerSleeve + 0.8, poses.tap],
      [cues.lookUi[0], cues.lookUi[1], poses.lookUi],
    ]);
    // 右手手指敲桌面：没有手指，用右手一下一下地抬起落下代替（每秒 2.5 下）
    const [tapStart, tapEnd] = cues.tapTable;
    if (t > tapStart && t < tapEnd) {
      const amp = ss((t - tapStart) / 0.3) * (1 - ss((t - (tapEnd - 0.3)) / 0.3));
      const tap = Math.max(0, Math.sin(2 * Math.PI * 2.5 * (t - tapStart))) ** 2;
      pose = { ...pose, elbowR: (pose.elbowR ?? 0) + 9 * amp * tap, armR: pose.armR + 2 * amp * tap };
    }
    return pose;
  }
  // 6-2-3
  if (t < cues.walk[0]) {
    return chain(t, poses.lookUi, [
      [cues.slap - 0.4, cues.slap - 0.1, poses.windUp],
      [cues.slap - 0.1, cues.slap, poses.slap],
      [cues.slap + 0.4, cues.slap + 1.1, poses.handsDownLook],
      [cues.slap + 5.05, cues.slap + 5.4, poses.nodLook],
      [cues.slap + 5.4, cues.slap + 5.85, poses.handsDownLook],
      [cues.grabCompass - 0.5, cues.grabCompass, poses.grab],
      [cues.grabCompass, cues.holdLevel, poses.holdCompass],
      [cues.lookUp, cues.lookUp + 0.5, poses.lookUp],
    ]);
  }
  // 走到屋子中间：右手平端着指南针，左手跟着步子摆；最后转向九胡、把指南针伸到她面前（到 6-2-4 首帧的姿态）
  const [w0, w1] = cues.walk;
  const progress = trip(t, w0, w1, exitPath.length, walkPlans.exit[2]);
  const loc = exitPath.at(progress.s);
  const hd = exitPath.heading(progress.s);
  let yaw = lerp(0, hd, ss((t - w0) / 0.6));
  yaw = lerp(yaw, near(LY_END.yaw ?? 0, yaw), ss((t - (w1 - 0.7)) / 0.9));
  // 起步时左手放下来，跟着步子摆；右手一直平端着指南针
  const base = mixPose(poses.lookUp, withPose(poses.lookUp, { armL: 0, armLRoll: 2, elbowL: 6 }), ss((t - w0) / 0.5));
  const walk = walkSwing(withPose(base, { loc, yaw, headYaw: lerp(22, 0, ss((t - w0) / 0.6)), headPitch: lerp(0, -4, ss((t - w0) / 0.6)) }), progress.s / 1.5, 26 * Math.min(1, progress.speed / 1.5), { L: true });
  return mixPose(walk, LY_END, ss((t - cues.handOver[0]) / (cues.handOver[1] - cues.handOver[0])));
};
