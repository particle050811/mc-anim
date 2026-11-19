// 忘情牛肉面：时间线的秒数、左右对称、解出来的骨骼转角是不是有限数，腿的反解（并脚站直时腿不该有转角），头跟着上身慢半拍。
import { describe, expect, it } from 'vitest';
import { onePassSec, headAngleAt, noodleDancePose, noodleDanceEnv, danceAt, solveSkeleton, mirrorPose } from './忘情牛肉面.ts';
import { leftDancerTrack } from './草地舞采样.ts';
import settlement from '../../段/6-结算舞/段.ts';

const expectPlanted = (actual: readonly number[], anchor: readonly number[]) => {
  actual.forEach((value, axis) => expect(value).toBeCloseTo(anchor[axis]!, 9));
};

describe('忘情牛肉面', () => {
  it('主参考 423 帧、30 fps，结算舞 846 帧，不加结尾', () => {
    expect(leftDancerTrack[0]![0]).toBe(0);
    expect(leftDancerTrack.at(-1)![0]).toBe(422);
    expect(onePassSec).toBe(423 / 30);
    expect(settlement.sec * 60).toBe(846);
    expect(danceAt(onePassSec + 1)).toEqual(danceAt(onePassSec));
  });

  it('每 1/60 秒的骨骼转角、位移都是有限数', () => {
    for (let f = 0; f < settlement.sec * 60; f++) {
      for (const [boneName, pose] of Object.entries(noodleDancePose(f / 60))) {
        expect([...(pose.rot ?? []), ...(pose.pos ?? [])].every(Number.isFinite), `${boneName} 第 ${f} 帧`).toBe(true);
      }
    }
  });

  it('镜像：左臂的转角 = 原来右臂的转角，y、z 反号', () => {
    const p = danceAt(1.5);
    const [a, b] = [solveSkeleton(p), solveSkeleton(mirrorPose(p))];
    const [leftArmRot, rightArmRot] = [b.LeftArm!.rot!, a.RightArm!.rot!];
    expect(leftArmRot[0]).toBeCloseTo(rightArmRot[0]!, 6);
    expect(leftArmRot[1]).toBeCloseTo(-rightArmRot[1]!, 6);
    expect(leftArmRot[2]).toBeCloseTo(-rightArmRot[2]!, 6);
  });

  it('两次屈膝后收再落地时支撑脚不滑，第一次抬得更高', () => {
    for (const [takeOff, peak, contact] of [[3.40, 3.50, 3.74], [5.23, 5.32, 5.59]]) {
      for (let frame = Math.ceil(takeOff * 60); frame / 60 <= contact; frame++) {
        expectPlanted(danceAt(frame / 60).rightFoot, danceAt(peak).rightFoot);
      }
      expect(danceAt(peak).leftFoot[1]).toBeGreaterThan(5);
      expect(danceAt(peak).leftFoot[2]).toBeLessThan(-3);
      expect(danceAt(contact).leftFoot[1]).toBe(0);
    }
    expect(danceAt(3.50).leftFoot[1]).toBeGreaterThan(danceAt(5.32).leftFoot[1]);
  });

  it('交臂段交替收脚：宽、窄、宽，脚离地后才平移', () => {
    const width = (sec: number) => Math.abs(danceAt(sec).leftFoot[0] - danceAt(sec).rightFoot[0]);
    expect(width(7.56) - width(7.99)).toBeGreaterThan(8);
    expect(width(8.48) - width(7.99)).toBeGreaterThan(7);
    expect(danceAt(7.85).rightFoot[1]).toBeGreaterThan(2);
    expect(danceAt(8.69).leftFoot[1]).toBeGreaterThan(2);
  });

  it('第一次高收腿低头侧看，第二次只轻点，两次之间抬头', () => {
    expect(headAngleAt(3.50)[2]).toBeGreaterThan(20);
    expect(headAngleAt(3.50)[0]).toBeLessThan(-20);
    expect(headAngleAt(3.50)[2]).toBeGreaterThan(headAngleAt(5.32)[2] + 6);
    expect(headAngleAt(4.35)[2]).toBeLessThan(7);
  });

  it('转身经过背面、提脚再着地，叉腰收住以后双脚不滑', () => {
    expect(danceAt(11.66).转).toBeGreaterThan(175);
    expect(danceAt(12.03).转).toBe(360);
    expect(danceAt(11.46).rightFoot[1]).toBeGreaterThan(4);
    expect(danceAt(11.69).rightFoot[1]).toBe(0);
    for (const sec of [12.6,13,13.6,14.08]) {
      expectPlanted(danceAt(sec).leftFoot, danceAt(14.1).leftFoot);
      expectPlanted(danceAt(sec).rightFoot, danceAt(14.1).rightFoot);
      expect(danceAt(sec).leftForeArm[0]).toBeLessThan(-0.7);
    }
  });

  it('默认只跳一遍，显式循环时才重放', () => {
    expect(noodleDancePose(onePassSec + 1.5, { 循环: true })).toEqual(noodleDancePose(1.5));
    expect(noodleDancePose(onePassSec + 1.5)).not.toEqual(noodleDancePose(1.5));
  });

  it('转身时头和发饰跟随；舞后速度回到零', () => {
    expect(Math.abs(noodleDanceEnv(11.55).query!.yaw_speed as number)).toBeGreaterThan(150);
    expect(headAngleAt(11.76)[0]).toBeGreaterThan(110);
    expect(noodleDanceEnv(onePassSec + 1).query).toEqual({ yaw_speed: 0, vertical_speed: 0 });
  });

  it('头：随机取帧不改结果，舞后回稳在原片末姿', () => {
    const earlier = headAngleAt(2.37);
    headAngleAt(8.1);
    expect(headAngleAt(2.37)).toEqual(earlier);
    const settled = noodleDancePose(onePassSec + 3).Head!.rot!;
    solveSkeleton(danceAt(onePassSec)).Head!.rot!.forEach((angle, axis) => expect(settled[axis]).toBeCloseTo(angle, 4));
  });
});
