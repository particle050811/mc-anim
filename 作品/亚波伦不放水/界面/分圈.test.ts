// 分圈算法和排盘：每圈格数加起来正好 N、不超容量、不重不漏；最里一圈的开合和原版 GenericRadialMenu 一样。
import { describe, expect, it } from 'vitest';
import { 径向轮盘数, 格角, 轮盘态 } from '@库/界面/径向轮盘数.ts';
import { 法术表 } from '../法术/法术表.ts';
import { 分圈, 圈半径, 圈容量, 圈态, 开完刻, 最少圈数, 落格, 适配缩放, 默认开合, 默认圈形, type 分法 } from './分圈.ts';
import { 学派顺序, 排法术, 排盘, 选法术 } from './轮盘法术.ts';

const 和 = (数: readonly number[]) => 数.reduce((a, b) => a + b, 0);

describe('分圈', () => {
  it('圈半径和容量：最里一圈是原版的 30～60、20 格，往外每圈加 30', () => {
    expect(圈半径(0)).toEqual({ 内: 30, 外: 60, 图标: 45 });
    expect(圈半径(2)).toEqual({ 内: 90, 外: 120, 图标: 105 });
    expect([0, 1, 2, 3, 4].map((k) => 圈容量(k))).toEqual([20, 33, 46, 60, 73]);
  });

  it('最少圈数：20 以内一圈，71 个三圈，128 个四圈', () => {
    expect([0, 1, 20, 21, 53, 54, 71, 99, 100, 128, 159, 160].map((n) => 最少圈数(n))).toEqual([1, 1, 1, 2, 2, 3, 3, 3, 4, 4, 4, 5]);
  });

  it('片子用到的两档：71 个 → 14、24、33；128 个 → 16、27、37、48', () => {
    expect(分圈(71)).toEqual([14, 24, 33]);
    expect(分圈(128)).toEqual([16, 27, 37, 48]);
    expect(分圈(71, { 分法: '均分' })).toEqual([20, 26, 25]);
    expect(分圈(71, { 分法: '填满内圈' })).toEqual([20, 33, 18]);
  });

  it('N 从 0 到 300、三种分法：总数正好 N，每圈不超容量，圈数是最少圈数', () => {
    for (const 法 of ['按周长', '均分', '填满内圈'] as 分法[]) {
      for (let N = 0; N <= 300; N++) {
        const 每圈 = 分圈(N, { 分法: 法 });
        expect(和(每圈)).toBe(N);
        expect(每圈.length).toBe(最少圈数(N));
        每圈.forEach((n, k) => {
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(圈容量(k));
        });
      }
    }
  });

  it('按周长分时图标间距不小于原版 20 格的间距，各圈间距相差不到一格的量', () => {
    const 原版间距 = (2 * Math.PI * 45) / 20;
    for (const N of [71, 84, 128]) {
      const 间距 = 分圈(N).map((n, k) => (2 * Math.PI * 圈半径(k).图标) / n);
      for (const d of 间距) expect(d).toBeGreaterThanOrEqual(原版间距 - 1e-9);
      expect(Math.max(...间距) / Math.min(...间距)).toBeLessThan(1.1);
    }
  });

  it('指定圈数：给多了照样分完，给少了报错', () => {
    expect(和(分圈(71, { 圈数: 5 }))).toBe(71);
    expect(分圈(71, { 圈数: 5 }).length).toBe(5);
    expect(() => 分圈(71, { 圈数: 2 })).toThrow(/装不下/);
  });

  it('落格：每项一个（圈，格），不重不漏', () => {
    const 每圈 = 分圈(128);
    const 位 = 落格(每圈);
    expect(位.length).toBe(128);
    expect(new Set(位.map((p) => `${p.圈}|${p.格}`)).size).toBe(128);
    每圈.forEach((n, k) => expect(位.filter((p) => p.圈 === k).map((p) => p.格)).toEqual(Array.from({ length: n }, (_, i) => i)));
  });

  it('适配缩放：720 高、留 24，三圈取 8/3，四圈取 2', () => {
    expect(适配缩放(120, 720, 24, 1 / 3, 8 / 3)).toBeCloseTo(8 / 3, 9);
    expect(适配缩放(150, 720, 24, 1 / 3, 8 / 3)).toBeCloseTo(2, 9);
    expect(适配缩放(60, 720, 24, 1 / 3, 8 / 3)).toBeCloseTo(8 / 3, 9);
  });
});

describe('开合', () => {
  it('最里一圈和原版 GenericRadialMenu 的 radiusIn、radiusOut、itemRadius 逐刻一样', () => {
    for (const 刻 of [0, 0.5, 1.25, 2.4, 2.5, 3, 40]) {
      const 原 = 轮盘态(刻)!;
      const 多 = 圈态(0, 刻)!;
      expect(多.内).toBeCloseTo(原.内, 12);
      expect(多.外).toBeCloseTo(原.外, 12);
      expect(多.图标半径).toBeCloseTo(原.图标半径, 12);
      expect(多.动画中).toBe(原.动画中);
    }
  });

  it('原版的数：2.5 刻线性，开完内 30 外 60，图标半径 45；第 0 格朝正上，顺时针', () => {
    expect(轮盘态(-1)).toBeNull();
    expect(轮盘态(1.25)).toMatchObject({ 进度: 0.5, 动画中: true, 内: 15, 外: 30, 底纹缩放: 0.5 });
    expect(轮盘态(0)!.内).toBeCloseTo(0.1, 12);
    expect(轮盘态(2.5)).toMatchObject({ 进度: 1, 动画中: false, 内: 30, 外: 60, 图标半径: 45 });
    expect(径向轮盘数.底色).toBe(1056964608);
    expect(径向轮盘数.悬停色).toBe(1073741823);
    expect(Math.sin(格角(0, 20))).toBeCloseTo(-1, 12);
    expect(Math.cos(格角(5, 20))).toBeCloseTo(1, 12);
  });

  it('外圈依次弹开：没轮到是 null，内沿不动、外沿长到位；相邻圈反向转', () => {
    expect(圈态(1, 2.4)).toBeNull();
    expect(圈态(1, 3.75)).toMatchObject({ 进度: 0.5, 动画中: true, 内: 60, 外: 75 });
    expect(圈态(2, 7.5)).toMatchObject({ 进度: 1, 动画中: false, 内: 90, 外: 120, 图标半径: 105 });
    expect(开完刻(3)).toBe(7.5);
    expect(圈态(0, 20)!.转角).toBeCloseTo((默认开合.转速 * Math.PI) / 180, 12);
    expect(圈态(1, 20)!.转角).toBeCloseTo(-圈态(0, 20)!.转角, 12);
    expect(圈态(1, 20, 默认圈形, { ...默认开合, 转速: 0 })!.转角).toBeCloseTo(0, 12);
  });
});

describe('排盘', () => {
  it('有画面档 71 个三圈，全部档 128 个四圈（去掉 5 个空壳），每个法术正好落一格', () => {
    const 默认 = 排盘();
    expect(默认.每圈格数).toEqual([14, 24, 33]);
    expect(默认.项.length).toBe(71);
    expect(默认.项.every((项) => 项.齐放)).toBe(true);
    const 全 = 排盘({ 放: '全部' });
    expect(全.每圈格数).toEqual([16, 27, 37, 48]);
    expect(new Set(全.项.map((项) => 项.键)).size).toBe(128);
    expect(new Set(全.项.map((项) => `${项.圈}|${项.格}`)).size).toBe(128);
    expect(全.项.filter((项) => 项.齐放).length).toBe(71);
    expect(new Set(全.项.map((项) => 项.法)).size).toBe(法术表.filter((法) => 法.类 !== '空壳').length);
  });

  it('按学派排：同学派连成一段，学派表盖住法术表里出现的全部学派；照注册排就是法术表的顺序', () => {
    expect(new Set(法术表.map((法) => 法.学派))).toEqual(new Set(学派顺序));
    const 排 = 排法术(选法术('全部'), '学派');
    expect(排.length).toBe(128);
    const 段数 = 排.filter((法, i) => i === 0 || 排[i - 1]!.学派 !== 法.学派).length;
    expect(段数).toBe(new Set(排.map((法) => 法.学派)).size);
    expect(排法术(选法术('有画面'), '注册')).toEqual(法术表.filter((法) => 法.类 === '有画面'));
  });

  it('聚晶键的形状：命名空间:注册名_focus', () => {
    const { 项 } = 排盘({ 放: '全部' });
    expect(项.find((项) => 项.法.注册名 === 'fireball')!.键).toBe('goety:fireball_focus');
    expect(项.find((项) => 项.法.注册名 === 'revelation')!.键).toBe('goety_revelation:revelation_focus');
  });
});
