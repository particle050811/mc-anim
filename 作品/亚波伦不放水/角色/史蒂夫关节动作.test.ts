// 走位里认腾空、往前还是倒着走，和带关节的动作的几个定点：站着不动腿是直的、蓄力和落地缓冲的起止、剑招的蓄斩停收。
import { describe, expect, it, vi } from 'vitest';
import type { V3 } from '@engine/model/parts.tsx';
import { stevePose } from '@库/角色/史蒂夫.tsx';
import { 剑招拍, 剑招长, 招表 } from './剑招.ts';
import { 加关节动作, 落地权, 蓄力权 } from './史蒂夫关节动作.ts';
import { 定走位 } from './史蒂夫走位.ts';

// 库里的史蒂夫一 import 就要模型和皮肤的字节；这里只算姿势，给个空模型和 1×1 的图
vi.mock('asset:模型/角色/巨人', () => ({ default: { models: { 宽: { texW: 64, texH: 64, parts: [] } } } }));
vi.mock('asset:贴图/角色/巨人/史蒂夫', () => ({ default: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==' }));

// 往 +y 匀速走 2 格/秒；0.5 秒处脚下高了一格（地形的台阶，不是跳）；1.0～1.5 秒跳一下（重力 24.6，落回原高）
const 位 = (t: number): V3 => {
  const τ = t - 1;
  return [0, 2 * t, (t >= 0.5 ? 1 : 0) + (τ > 0 && τ < 0.5 ? 6.15 * τ - 12.3 * τ * τ : 0)];
};

describe('史蒂夫走位', () => {
  it('从轨迹里认出腾空：台阶不算，起跳前、空中、落地后各给对时间', () => {
    const 走 = 定走位({ 位, 看: () => [0, 100, 1], 起: 0, 初朝向: 0 });
    expect(走.在(0.5).跳.空中).toBeUndefined();
    expect(走.在(0.3).跳).toEqual({});
    expect(走.在(0.9).跳.起跳前秒).toBeCloseTo(0.1, 1);
    const 空 = 走.在(1.2).跳;
    expect(空.空中!.已).toBeCloseTo(0.2, 1);
    expect(空.空中!.剩).toBeCloseTo(0.3, 1);
    expect(空.空长).toBeCloseTo(0.5, 1);
    const 落 = 走.在(1.6).跳;
    expect(落.落地后秒).toBeCloseTo(0.1, 1);
    expect(落.落地速).toBeCloseTo(6.15, 0);
    expect(走.在(2.3).跳).toEqual({});
  });

  it('向：脸朝移动方向是 1，倒着走是 −1', () => {
    expect(定走位({ 位, 看: () => [0, 100, 1], 起: 0, 初朝向: 0 }).在(0.8).走.向).toBeCloseTo(1, 2);
    expect(定走位({ 位, 看: () => [0, -100, 1], 起: 0, 初朝向: 180 }).在(0.8).走.向).toBeCloseTo(-1, 2);
  });
});

describe('史蒂夫关节动作', () => {
  const 站 = { 摆: 0, 步幅: 0, 秒: 0, 右持: true, 左持: false, 持剑: true };

  it('站着不动：腿是直的、脚踩实，只有肘微屈', () => {
    const pose = 加关节动作(stevePose([0, 0, 0], 0, { holdR: true }), 站);
    expect([pose.legR, pose.legL, pose.kneeR, pose.kneeL, pose.pitch]).toEqual([0, 0, 0, 0, 0]);
    expect(pose.ground).toBe(1);
    expect(pose.elbowR).toBeGreaterThan(pose.elbowL!);
  });

  it('蓄力只在起跳前、缓冲只在落地后；空中两膝收起来、髋不沉', () => {
    expect(蓄力权({ 起跳前秒: 0.4, 空长: 0.5 })).toBe(0);
    expect(蓄力权({ 起跳前秒: 0.08, 空长: 0.5 })).toBeGreaterThan(0.9);
    expect(蓄力权({ 起跳前秒: 0, 空长: 0.5 })).toBe(0);
    expect(落地权({ 落地后秒: 0, 落地速: 8, 空长: 0.5 })).toBe(0);
    expect(落地权({ 落地后秒: 0.07, 落地速: 8, 空长: 0.5 })).toBeCloseTo(1, 6);
    expect(落地权({ 落地后秒: 0.4, 落地速: 8, 空长: 0.5 })).toBe(0);
    const 空 = 加关节动作(stevePose([0, 0, 0], 0, { holdR: true }), { ...站, 跳: { 空中: { 已: 0.25, 剩: 0.25 }, 空长: 0.5 }, 挥过: true });
    expect(空.kneeR).toBeGreaterThan(60);
    expect(空.kneeL).toBeGreaterThan(60);
    expect(空.ground).toBe(0);
  });

  it('剑招：蓄力满摆到蓄，斩完停在末（剑身顺着手臂压下去），收完回到平时；斩、停的时候不管蓄力', () => {
    const 平 = 加关节动作(stevePose([0, 0, 0], 0, { holdR: true }), 站);
    const 在 = (挥秒: number | undefined, 蓄力 = 0) => 加关节动作(stevePose([0, 0, 0], 0, { holdR: true }), { ...站, ...(挥秒 === undefined ? {} : { 挥秒 }), 招: '下劈', 蓄招: '下劈', 蓄力 });
    const 蓄 = 在(undefined, 1);
    expect(蓄.armR).toBeCloseTo(招表.下劈.蓄.臂, 6);
    expect(蓄.elbowR).toBeCloseTo(招表.下劈.蓄.肘, 6);
    const 末 = 在(剑招拍.斩 + 0.01, 1);
    expect(末.armR).toBeCloseTo(招表.下劈.末.臂, 6);
    expect(末.腕R).toBeCloseTo(招表.下劈.末.腕, 6);
    expect(末.pitch).toBeLessThan(平.pitch - 15);
    const 收完 = 在(剑招长 + 0.01);
    expect(收完.armR).toBeCloseTo(平.armR, 6);
    expect(收完.腕R).toBe(0);
  });
});
