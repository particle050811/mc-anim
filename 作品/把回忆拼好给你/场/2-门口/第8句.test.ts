import { describe, expect, it } from 'vitest';
import { 侧投影 } from '../../地点/侧剖面.tsx';
import { 正片事件 } from '../../分镜.ts';
import { 第8句N, 第8句取景, 第8句地面离底, 哈气站位 } from './第8句.ts';

// 地点/门口小木屋.tsx 的门、开着的门板（那边是 tsx，测试不引）
const 门洞 = { x0: -0.5, x1: 0.5 };
const 开着的门板 = { x0: -1.5, x1: -0.5 };
const 史蒂夫半宽 = 0.5; // 正面：身子 8、两臂各 4 个贴图像素

describe('第 8 句哈气那一拍', () => {
  it('取景：门在画面正中，地面线离底落在偶数成片像素上', () => {
    const 取 = 第8句取景();
    expect(取.每格).toBe(16 * 第8句N);
    expect(第8句N % 2).toBe(0);
    const 投 = 侧投影(取, 1280, 720);
    expect(投(0, 0).x).toBe(640);
    const 离底 = (720 - 投(0, 0).y) * 2;
    expect(离底).toBeCloseTo(第8句地面离底 * 取.每格, 6);
    expect(Math.round(离底) % 2).toBe(0);
  });

  it('站位：你到苦力怕四五格，她在中间；你不站门洞、不挡开着的门板；三个都在画里', () => {
    const { 你, 她, 苦力怕 } = 哈气站位;
    expect(你 - 苦力怕).toBeGreaterThanOrEqual(4);
    expect(你 - 苦力怕).toBeLessThanOrEqual(5);
    expect(她).toBeGreaterThan(苦力怕);
    expect(她).toBeLessThan(你);
    for (const 区 of [门洞, 开着的门板]) expect(你 + 史蒂夫半宽 <= 区.x0 || 你 - 史蒂夫半宽 >= 区.x1).toBe(true);
    const 半宽格 = 2560 / 2 / 第8句取景().每格;
    expect(苦力怕 - 0.5).toBeGreaterThan(-半宽格 + 1);
  });

  it('时刻取自分镜：哈气在三稿 27.80', () => {
    expect(正片事件.哈气.秒).toBeCloseTo(27.8, 1);
  });
});
