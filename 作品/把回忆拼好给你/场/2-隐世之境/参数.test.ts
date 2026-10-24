import { describe, expect, it } from 'vitest';
import { 她, 头转范围, 机位 } from './参数.ts';

// 头比身子多转的角：她脚底到你眼睛的水平方向，和她身子朝向差多少（度）。
// 忽略头心离脚底那几厘米的水平偏移（库/角色/魔法酒狐.tsx 的 head.站 约 6 厘米），差不到 2°，所以两头各留 2° 的余量
const 头转角 = () => {
  const [dx, dy] = [机位.脚[0] - 她.脚[0], 机位.脚[1] - 她.脚[1]];
  const 朝你 = (Math.atan2(-dx, dy) * 180) / Math.PI; // 同 骨架.tsx 的 yaw：0 朝北、正往西
  const 差 = 朝你 - 她.身子朝向;
  return ((((差 + 180) % 360) + 360) % 360) - 180;
};

describe('第 15 句重逢的站位', () => {
  it('头比身子多转的角（夹在上限以后）在建议的 45～60° 里，离正对你差不到 10°', () => {
    const 正对 = Math.abs(头转角());
    const 转 = Math.min(正对, 头转范围[1]);
    expect(转).toBeGreaterThanOrEqual(头转范围[0] - 2);
    expect(转).toBeLessThanOrEqual(75);
    expect(正对 - 转).toBeLessThanOrEqual(10);
  });
});
