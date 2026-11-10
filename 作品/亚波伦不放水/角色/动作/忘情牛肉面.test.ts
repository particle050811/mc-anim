// 忘情牛肉面：时间线的秒数、左右对称、解出来的骨骼转角是不是有限数，以及腿的反解（并脚站直时腿不该有转角）。
import { describe, expect, it } from 'vitest';
import { 一遍秒, 忘情牛肉面姿势, 忘情牛肉面环境, 时间线, 舞姿在, 解骨骼, 镜像 } from './忘情牛肉面.ts';

describe('忘情牛肉面', () => {
  it('时间线按时间递增，从 0 秒到一遍结束，都卡在 08 抽帧的 0.25 秒格上（片尾除外）', () => {
    const 秒们 = 时间线.map(([秒]) => 秒);
    expect(秒们[0]).toBe(0);
    expect(秒们.at(-1)).toBe(一遍秒);
    for (let i = 1; i < 秒们.length; i++) expect(秒们[i]!).toBeGreaterThan(秒们[i - 1]!);
    for (const 秒 of 秒们.slice(0, -1)) expect(秒 * 4).toBe(Math.round(秒 * 4));
  });

  it('关键帧那一刻取到的就是那个姿势', () => {
    const [秒, 姿势] = 时间线.find(([秒]) => 秒 === 2.5)!;
    const 取 = 舞姿在(秒);
    expect(取.胯[0]).toBeCloseTo(姿势.胯[0], 9);
    expect(取.左上臂[1]).toBeCloseTo(姿势.左上臂[1], 9);
  });

  it('每 1/60 秒的骨骼转角、位移都是有限数', () => {
    for (let f = 0; f <= 一遍秒 * 60; f++) {
      for (const [骨, 姿] of Object.entries(忘情牛肉面姿势(f / 60))) {
        for (const v of [...(姿.rot ?? []), ...(姿.pos ?? [])]) expect(Number.isFinite(v), `${骨} 第 ${f} 帧`).toBe(true);
      }
    }
  });

  it('并脚站直：腿的转角接近 0（脚的落点和模型的站姿差不到半像素）', () => {
    const 骨 = 解骨骼(舞姿在(9));
    for (const 名 of ['LeftLeg', 'RightLeg', 'LeftLowerLeg', 'RightLowerLeg']) for (const v of 骨[名]!.rot!) expect(Math.abs(v)).toBeLessThan(4);
  });

  it('镜像：左臂的转角 = 原来右臂的转角，y、z 反号', () => {
    const p = 舞姿在(1.5);
    const [a, b] = [解骨骼(p), 解骨骼(镜像(p))];
    const [左, 右] = [b.LeftArm!.rot!, a.RightArm!.rot!];
    expect(左[0]).toBeCloseTo(右[0]!, 6);
    expect(左[1]).toBeCloseTo(-右[1]!, 6);
    expect(左[2]).toBeCloseTo(-右[2]!, 6);
  });

  it('循环：过了一遍从头再来；不循环停在收住的站姿', () => {
    expect(忘情牛肉面姿势(一遍秒 + 1.5, { 循环: true })).toEqual(忘情牛肉面姿势(1.5));
    expect(忘情牛肉面姿势(一遍秒 + 5)).toEqual(忘情牛肉面姿势(一遍秒));
  });

  it('环境：站着不动时转身、竖直速度是 0，第二段转身时有转身速度', () => {
    expect(忘情牛肉面环境(9.2).查询).toEqual({ yaw_speed: 0, vertical_speed: 0 });
    expect(Math.abs(忘情牛肉面环境(3.62).查询!.yaw_speed as number)).toBeGreaterThan(50);
  });
});
