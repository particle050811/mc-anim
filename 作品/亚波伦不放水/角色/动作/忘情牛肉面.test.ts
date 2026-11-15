// 忘情牛肉面：时间线的秒数、左右对称、解出来的骨骼转角是不是有限数，腿的反解（并脚站直时腿不该有转角），头跟着上身慢半拍。
import { describe, expect, it } from 'vitest';
import { onePassSec, headAngleAt, noodleDancePose, noodleDanceEnv, timeline, danceAt, solveSkeleton, mirrorPose } from './忘情牛肉面.ts';

describe('忘情牛肉面', () => {
  it('时间线按时间递增，从 0 秒到一遍结束，都卡在 08 抽帧的 0.25 秒格上（片尾除外）', () => {
    const timelineSecs = timeline.map(([sec]) => sec);
    expect(timelineSecs[0]).toBe(0);
    expect(timelineSecs.at(-1)).toBe(onePassSec);
    for (let i = 1; i < timelineSecs.length; i++) expect(timelineSecs[i]!).toBeGreaterThan(timelineSecs[i - 1]!);
    for (const sec of timelineSecs.slice(0, -1)) expect(sec * 4).toBe(Math.round(sec * 4));
  });

  it('关键帧那一刻取到的就是那个姿势', () => {
    const [sec, dancePose] = timeline.find(([sec]) => sec === 2.5)!;
    const poseAt = danceAt(sec);
    expect(poseAt.hip[0]).toBeCloseTo(dancePose.hip[0], 9);
    expect(poseAt.leftUpperArm[1]).toBeCloseTo(dancePose.leftUpperArm[1], 9);
  });

  it('每 1/60 秒的骨骼转角、位移都是有限数', () => {
    for (let f = 0; f <= onePassSec * 60; f++) {
      for (const [boneName, pose] of Object.entries(noodleDancePose(f / 60))) {
        for (const v of [...(pose.rot ?? []), ...(pose.pos ?? [])]) expect(Number.isFinite(v), `${boneName} 第 ${f} 帧`).toBe(true);
      }
    }
  });

  it('并脚站直：腿的转角接近 0（脚的落点和模型的站姿差不到半像素）', () => {
    const bones = solveSkeleton(danceAt(9));
    for (const boneName of ['LeftLeg', 'RightLeg', 'LeftLowerLeg', 'RightLowerLeg']) for (const v of bones[boneName]!.rot!) expect(Math.abs(v)).toBeLessThan(4);
  });

  it('镜像：左臂的转角 = 原来右臂的转角，y、z 反号', () => {
    const p = danceAt(1.5);
    const [a, b] = [solveSkeleton(p), solveSkeleton(mirrorPose(p))];
    const [leftArmRot, rightArmRot] = [b.LeftArm!.rot!, a.RightArm!.rot!];
    expect(leftArmRot[0]).toBeCloseTo(rightArmRot[0]!, 6);
    expect(leftArmRot[1]).toBeCloseTo(-rightArmRot[1]!, 6);
    expect(leftArmRot[2]).toBeCloseTo(-rightArmRot[2]!, 6);
  });

  it('循环：过了一遍从头再来；不循环停在收住的站姿', () => {
    expect(noodleDancePose(onePassSec + 1.5, { 循环: true })).toEqual(noodleDancePose(1.5));
    // 头的弹簧在收住后还要回稳一会儿，所以拿收住 3 秒后比；身子收住那一刻就停了
    const { Head: headBone, ...bodyBones } = noodleDancePose(onePassSec + 5);
    const { Head: headRetract, ...bodyRetract } = noodleDancePose(onePassSec);
    expect(bodyBones).toEqual(bodyRetract);
    expect(headBone).toEqual(noodleDancePose(onePassSec + 3).Head);
    headRetract!.rot!.forEach((v, i) => expect(v).toBeCloseTo(headBone!.rot![i]!, 1));
  });

  it('环境：站着不动时转身、竖直速度是 0，第二段转身时有转身速度', () => {
    expect(noodleDanceEnv(9.2).query).toEqual({ yaw_speed: 0, vertical_speed: 0 });
    expect(Math.abs(noodleDanceEnv(3.62).query!.yaw_speed as number)).toBeGreaterThan(50);
  });

  it('头跟着上身侧倒、比身子晚：第一下身子 0.3 秒倒到最大，头的歪在那以后才到最大，且至少歪 3 度（原来只歪 ±2.6 度）', () => {
    let [bodyMaxSec, headMaxSec, headMax] = [0, 0, 0];
    let bodyMax = 0;
    for (let t = 0; t <= 0.6; t += 1 / 120) {
      if (danceAt(t).bodyTilt > bodyMax) [bodyMax, bodyMaxSec] = [danceAt(t).bodyTilt, t];
      if (headAngleAt(t)[1] > headMax) [headMax, headMaxSec] = [headAngleAt(t)[1], t];
    }
    expect(headMaxSec).toBeGreaterThan(bodyMaxSec + 0.05);
    expect(headMax).toBeGreaterThan(3);
  });

  it('头：取哪一秒和取的顺序无关；跳完站稳后回到正前方', () => {
    const earlier = headAngleAt(2.37);
    headAngleAt(8.1);
    expect(headAngleAt(2.37)).toEqual(earlier);
    for (const v of headAngleAt(onePassSec + 2)) expect(Math.abs(v)).toBeLessThan(0.05);
  });
});
