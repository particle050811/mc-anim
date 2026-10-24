import { describe, expect, it } from 'vitest';
import { 正片事件 } from '../../分镜.ts';
import { 地面高, 平原花, 新世界方块 } from './地形.ts';
import { 你, 地形范围, 地形雾, 机位们, 樱花林, 雾色 } from './参数.ts';
import { 你在, 机位在, 走出 } from './编排.ts';

describe('新世界的地形', () => {
  it('出生点那格地面顶在 0，周围压平', () => {
    expect(地面高(0, 0)).toBe(0);
    for (const [i, j] of [[1, 0], [0, 1], [-1, -1], [1, 3]]) expect(Math.abs(地面高(i!, j!))).toBeLessThanOrEqual(1);
  });
  it('樱花林：落定时朝镜头这一边在雾前面（后半片按原版的雾淡进雾里），推到头整片在雾前面', () => {
    const 距 = (机: { 眼: readonly number[] }) => Math.hypot(樱花林.心[0] - 机.眼[0]!, 樱花林.心[1] - 机.眼[1]!);
    expect(距(机位们.落定) - 樱花林.林半径).toBeLessThan(地形雾.起);
    expect(距(机位们.落定)).toBeLessThan(地形雾.止);
    expect(距(机位们.推终) + 樱花林.林半径).toBeLessThan(地形雾.起);
  });
  it('原版的雾色：平原 12 区块（#c0d8ff 往天色 #78a7ff 拉 14.6%）', () => {
    expect(雾色).toBe('#b5d1ff');
  });
  it('方块定死（铺两次一样多）、樱花林里有樱花树叶和粉红花簇、平原里没有', () => {
    const a = 新世界方块(), b = 新世界方块();
    expect(a.平原.length).toBe(b.平原.length);
    expect(a.樱花林.length).toBe(b.樱花林.length);
    expect(a.樱花林.some((x) => x.状态.startsWith('minecraft:cherry_leaves'))).toBe(true);
    expect(a.樱花林.some((x) => x.状态.startsWith('minecraft:pink_petals'))).toBe(true);
    expect(a.平原.some((x) => x.状态.includes('cherry'))).toBe(false);
  });
  it('樱花树照原版长出斜枝：有横着的樱花原木（axis=x 或 z），叶子团挂在枝头', () => {
    const { 樱花林: 林 } = 新世界方块();
    expect(林.some((x) => x.状态 === 'minecraft:cherry_log[axis=x]' || x.状态 === 'minecraft:cherry_log[axis=z]')).toBe(true);
    const 木 = 林.filter((x) => x.状态.startsWith('minecraft:cherry_log'));
    const 叶 = 林.filter((x) => x.状态 === 'minecraft:cherry_leaves');
    expect(叶.length).toBeGreaterThan(木.length * 3);
  });
  it('树枝树叶不钻进地里', () => {
    const { 樱花林: 林, 平原: 原 } = 新世界方块();
    for (const b of [...林, ...原]) if (/log|leaves/.test(b.状态)) expect(b.位[2]).toBeGreaterThanOrEqual(地面高(b.位[0], b.位[1]));
  });
  it('平原的花照原版 flower_plain：出生点到樱花林这一路上有郁金香，也有别的花', () => {
    const 花 = new Set<string>();
    for (let j = 0; j <= 地形范围.植物半径; j += 2) for (let i = -40; i <= 60; i += 2) 花.add(平原花(i, j));
    expect([...花].some((x) => x.endsWith('_tulip'))).toBe(true);
    expect(花.has('minecraft:dandelion')).toBe(true);
    expect([...花].some((x) => /poppy|azure_bluet|oxeye_daisy|cornflower/.test(x))).toBe(true);
  });
  it('樱花林的山不是同心圆：同一个离心距离上，各方向的高差得出两格以上', () => {
    const 高们 = Array.from({ length: 24 }, (_, k) => {
      const a = (k / 24) * Math.PI * 2;
      return 地面高(Math.round(樱花林.心[0] + Math.cos(a) * 28), Math.round(樱花林.心[1] + Math.sin(a) * 28));
    });
    expect(Math.max(...高们) - Math.min(...高们)).toBeGreaterThanOrEqual(2);
  });
});

describe('镜头和你', () => {
  it('钻完落定、推镜从落定接着推，接缝不跳', () => {
    expect(机位在(1, 0)).toEqual({ ...机位们.落定, 眼: [...机位们.落定.眼], 看: [...机位们.落定.看] });
    const 接 = 机位在(1, 1e-6);
    expect(接.眼[1]).toBeCloseTo(机位们.落定.眼[1]);
  });
  it('起步前站在出生点；起步后朝樱花林走，越走越远', () => {
    const 站 = 你在(正片事件.第1句起步.帧 - 1);
    expect(站.脚).toEqual(你.脚);
    expect(站.走秒).toBeNull();
    const 走 = 你在(正片事件.第1句起步.帧 + 12);
    expect(走.脚[1]).toBeGreaterThan(你.脚[1]);
    expect(走.脚[0]).toBeGreaterThan(你.脚[0]);
    expect(走出(1)).toBeGreaterThan(走出(0.5));
    // 原版走速 4.317：走一秒（起步加速一点点）差不多 4 格
    expect(走出(1)).toBeGreaterThan(3.9);
    expect(走出(1)).toBeLessThan(4.317);
  });
});
