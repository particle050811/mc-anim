import { describe, expect, it } from 'vitest';
import { 正片事件 } from '../../分镜.ts';
import { 天亮 } from '../../地点/天体.ts';
import { 剖面列, 剖面方块, 剥排方块, 地面高, 平原花, 树们, 新世界方块 } from './地形.ts';
import { 你, 剖面, 地形范围, 地形雾, 坑, 机位们, 樱花林, 聊天, 远山, 远林们, 雾色, type 机位帧 } from './参数.ts';
import { 你在, 停稳帧, 天刻在, 剥了, 机位在, 聊天刻在, 走 } from './编排.ts';
import { 星亮, 星们, 星向在 } from './星.ts';

const 句2 = 正片事件.第1句推完.帧;

/** 透视机位下一个点在成片（2560×1440）上的 y：针孔投影，z 朝上 */
const 成片y = (机: 机位帧, p: readonly number[]) => {
  const d = [0, 1, 2].map((i) => p[i]! - 机.眼[i]!);
  const f0 = [0, 1, 2].map((i) => 机.看[i]! - 机.眼[i]!);
  const fl = Math.hypot(...f0);
  const F = f0.map((v) => v / fl);
  // 右 = F × 上(0,0,1)，上' = 右 × F
  const R0 = [F[1]!, -F[0]!, 0];
  const rl = Math.hypot(...R0);
  const R = R0.map((v) => v / rl);
  const U = [R[1]! * F[2]! - R[2]! * F[1]!, R[2]! * F[0]! - R[0]! * F[2]!, R[0]! * F[1]! - R[1]! * F[0]!];
  const 点 = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i]!, 0);
  const ndc = 点(d, U) / (点(d, F) * Math.tan((机.视角 * Math.PI) / 360));
  return ((1 - ndc) / 2) * 1440;
};

describe('新世界的地形', () => {
  it('出生点那格地面顶在 0，周围压平', () => {
    expect(地面高(0, 0)).toBe(0);
    for (const [i, j] of [[1, 0], [0, 1], [-1, -1], [1, 3]]) expect(Math.abs(地面高(i!, j!))).toBeLessThanOrEqual(1);
  });
  it('樱花林：落定时朝镜头这一边在雾前面（后半片按原版的雾淡进雾里）；落到剖面时林子还在地平线上、没全进雾', () => {
    const 距 = (机: { 眼: readonly number[] }) => Math.hypot(樱花林.心[0] - 机.眼[0]!, 樱花林.心[1] - 机.眼[1]!);
    expect(距(机位们.落定) - 樱花林.林半径).toBeLessThan(地形雾.起);
    expect(距(机位们.落定)).toBeLessThan(地形雾.止);
    expect(距(机位们.剖面) - 樱花林.林半径).toBeLessThan(地形雾.起);
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
  it('地平线不是一条直线（用户 10-24「超平坦背景 合理吗？」）：远处一圈起伏的山，樱花林那个方向让开；远处有两片树林', () => {
    const 圈 = (r: number) =>
      Array.from({ length: 72 }, (_, k) => {
        const a = (k / 72) * Math.PI * 2;
        return 地面高(Math.round(Math.sin(a) * r), Math.round(Math.cos(a) * r));
      });
    // 起点以内是平原，远山不碰出生点那片
    expect(Math.max(...圈(远山.起 - 2).map(Math.abs))).toBeLessThanOrEqual(3);
    const 远 = 圈(120);
    expect(Math.max(...远) - Math.min(...远)).toBeGreaterThanOrEqual(6);
    expect(远.filter((h) => h >= 4).length).toBeGreaterThan(10);
    const 树 = 树们();
    for (const 林 of 远林们) expect(树.filter((t) => Math.hypot(t.i - 林.心[0], t.j - 林.心[1]) <= 林.半径).length).toBeGreaterThanOrEqual(5);
  });
  it('樱花林的山不是同心圆：同一个离心距离上，各方向的高差得出两格以上', () => {
    const 高们 = Array.from({ length: 24 }, (_, k) => {
      const a = (k / 24) * Math.PI * 2;
      return 地面高(Math.round(樱花林.心[0] + Math.cos(a) * 28), Math.round(樱花林.心[1] + Math.sin(a) * 28));
    });
    expect(Math.max(...高们) - Math.min(...高们)).toBeGreaterThanOrEqual(2);
  });
});

describe('剖面', () => {
  const 地上 = (bs: readonly { 状态: string; 位: readonly number[] }[], i: number, j: number) =>
    bs.filter((b) => b.位[0] === i && b.位[1] === j && b.位[2]! >= 地面高(i, j) - 1).map((b) => `${b.状态}@${b.位[2]}`);
  it('坑那一格和左右几格是平地（地面顶 0），坑够深：挖三格后站在泥土上', () => {
    for (let di = -2; di <= 2; di++) expect(地面高(坑.i + di, 坑.j)).toBe(0);
    expect(地面高(坑.i, 坑.j + 1)).toBe(0);
    const 坑列 = 剖面方块({ 挖掉: 坑.深, 顶土: false }).filter((b) => b.位[0] === 坑.i && b.位[1] === 坑.j);
    expect(Math.max(...坑列.map((b) => b.位[2]))).toBe(-坑.深 - 1);
  });
  it('还没挖、没撤的时候，剖面那两截地面上的东西和 新世界方块 一样（只是坑左右不长草），镜头落下来前看不出换过', () => {
    const 全 = 新世界方块().平原;
    const 剖 = 剖面方块({ 挖掉: 0, 顶土: false }), 剥 = 剥排方块(0);
    for (let i = 坑.i - 剖面.剥半宽; i <= 坑.i + 剖面.剥半宽; i++) {
      for (const j of [坑.j - 剖面.剥排, 坑.j - 3, 坑.j - 1]) expect(地上(剥, i, j)).toEqual(地上(全, i, j));
      if (Math.abs(i - 坑.i) > 剖面.让草) for (const j of [坑.j, 坑.j + 1]) expect(地上(剖, i, j)).toEqual(地上(全, i, j));
    }
  });
  it('剖面列：坑这一排、后墙那一排是「剖」，坑和镜头之间的几排是「剥」', () => {
    expect(剖面列(坑.i, 坑.j)).toBe('剖');
    expect(剖面列(坑.i, 坑.j + 1)).toBe('剖');
    expect(剖面列(坑.i, 坑.j - 1)).toBe('剥');
    expect(剖面列(坑.i, 坑.j + 2)).toBeNull();
    expect(剖面列(坑.i, 坑.j - 剖面.剥排 - 1)).toBeNull();
  });
  it('挖三填一：坑那一格按挖掉的格数空出来，填土在草方块原来的位置；后墙草方块以下压暗', () => {
    const 坑格 = (态: { 挖掉: number; 顶土: boolean }) => 剖面方块(态).filter((b) => b.位[0] === 坑.i && b.位[1] === 坑.j).map((b) => b.位[2]);
    expect(坑格({ 挖掉: 0, 顶土: false })).toContain(-1);
    expect(坑格({ 挖掉: 2, 顶土: false })).not.toContain(-2);
    expect(坑格({ 挖掉: 2, 顶土: false })).toContain(-3);
    expect(坑格({ 挖掉: 3, 顶土: true })).toContain(-1);
    expect(坑格({ 挖掉: 3, 顶土: true })).not.toContain(-2);
    const 后墙 = 剖面方块({ 挖掉: 3, 顶土: false }).filter((b) => b.位[0] === 坑.i && b.位[1] === 坑.j + 1);
    expect(后墙.find((b) => b.位[2] === -1)?.亮).toBeUndefined();
    expect(后墙.find((b) => b.位[2] === -2)?.亮).toBe(剖面.后墙亮);
  });
  it('撤排：剖开那一帧撤第一排，第 2 句首字前全撤完', () => {
    expect(剥了(正片事件.第1句剖开.帧 - 1)).toBe(0);
    expect(剥了(正片事件.第1句剖开.帧)).toBe(1);
    expect(剥了(句2 - 1)).toBe(剖面.剥排);
    expect(剥排方块(剖面.剥排)).toEqual([]);
  });
  it('剖面镜头：你站着的头顶在歌词那一条下面，坑底在画面里', () => {
    const 剖 = 机位们.剖面;
    expect(成片y(剖, [坑.i + 0.5, 坑.j + 0.5, 1.8])).toBeGreaterThan(189 + 20);
    expect(成片y(剖, [坑.i + 0.5, 坑.j, -坑.深])).toBeLessThan(1440 - 60);
    // 地面线在画面中间偏下，地平线在上半截
    const 地面线 = 成片y(剖, [坑.i + 0.5, 坑.j, 0]);
    expect(地面线).toBeGreaterThan(720);
    expect(地面线).toBeLessThan(840);
  });
});

describe('镜头、时间', () => {
  it('钻完落定，起步前不动；起步后往剖面落，剖开那一帧落到，之后不动', () => {
    expect(机位在(1, 正片事件.第1句起步.帧)).toEqual({ ...机位们.落定, 眼: [...机位们.落定.眼], 看: [...机位们.落定.看] });
    const 中 = 机位在(1, 正片事件.第1句起步.帧 + 1);
    expect(Math.abs(中.眼[2] - 机位们.落定.眼[2])).toBeLessThan(0.1);
    for (const f of [正片事件.第1句剖开.帧, 句2 - 1, 句2 + 30]) {
      const 机 = 机位在(1, f);
      机.眼.forEach((v, i) => expect(v).toBeCloseTo(机位们.剖面.眼[i]!, 9));
      expect(机.视角).toBeCloseTo(机位们.剖面.视角, 9);
    }
  });
  it('天：第 1 句整句天亮 1（看不见星星）；第 2 句首字起天亮缓起缓停地掉，填土那一拍黑透（星星满亮），之后照真时间走，不往回走', () => {
    const 填土 = 正片事件.填土.帧;
    for (let f = 正片事件.第1句加入游戏.帧; f <= 句2; f++) expect(天亮(天刻在(f))).toBe(1);
    expect(天亮(天刻在(句2 + 1))).toBeLessThan(1);
    // 天黑铺满第 2 句首字到填土：中间那一帧天亮一半左右，挖第一格时还亮
    expect(天亮(天刻在(Math.round((句2 + 填土) / 2)))).toBeCloseTo(0.5, 1);
    expect(天亮(天刻在(正片事件.挖一.帧))).toBeGreaterThan(0.8);
    expect(天亮(天刻在(填土 - 1))).toBeGreaterThan(0);
    expect(天亮(天刻在(填土))).toBe(0);
    expect(星亮(天刻在(填土))).toBeCloseTo(0.5, 6);
    // 第 1 句看不见星星：加到天上的 星亮² × 255 四舍五入是 0
    expect(Math.round(星亮(天刻在(句2)) ** 2 * 255)).toBe(0);
    for (let f = 正片事件.第1句加入游戏.帧 + 1; f < 填土 + 40; f++) expect(天刻在(f)).toBeGreaterThan(天刻在(f - 1));
  });
  it('聊天栏的钟：「Steve加入了游戏」剖开那一帧正好 200 刻（原版那一行消失），淡掉的 20 刻铺在剖开前 聊天.淡帧 帧；之前一直在走', () => {
    const 剖开 = 正片事件.第1句剖开.帧;
    expect(聊天刻在(正片事件.第1句加入游戏.帧)).toBe(0);
    expect(聊天刻在(剖开)).toBeCloseTo(200, 9);
    expect(聊天刻在(剖开 - 聊天.淡帧)).toBeCloseTo(180, 9);
    for (let f = 正片事件.第1句加入游戏.帧 + 1; f < 句2; f++) expect(聊天刻在(f)).toBeGreaterThan(聊天刻在(f - 1));
  });
});

describe('你', () => {
  it('起步前站在出生点；起步后朝坑那一格走，停在格子正中、不越过；第 2 句首字前转身朝东、低头', () => {
    expect(你在(正片事件.第1句起步.帧 - 1).脚).toEqual(你.脚);
    let 上 = 0;
    for (let f = 正片事件.第1句起步.帧; f <= 句2; f++) {
      const p = 你在(f).脚;
      const d = Math.hypot(p[0] - 你.脚[0], p[1] - 你.脚[1]);
      expect(d).toBeGreaterThanOrEqual(上 - 1e-9);
      上 = d;
    }
    const 停 = 你在(停稳帧);
    expect(停.脚[0]).toBeCloseTo(坑.i + 0.5, 2);
    expect(停.脚[1]).toBeCloseTo(坑.j + 0.5, 2);
    expect(停.步幅).toBeLessThan(0.05);
    const 末 = 你在(句2 - 1);
    expect(末.朝向).toBe(-90);
    expect(末.头).toBe(-90);
  });
  it('原版走速 4.317：按住走一秒（起步加速一点点）差不多 4 格；松开以后滑一小段停下', () => {
    expect(走(20).出).toBeGreaterThan(3.5);
    expect(走(1000).出).toBeCloseTo(Math.hypot(坑.i + 0.5 - 你.脚[0], 坑.j + 0.5 - 你.脚[1]), 6);
  });
});

describe('星星（原版 createStars）', () => {
  it('落在单位球壳里的才算：一千多颗、都是单位向量，半边 0.15～0.25', () => {
    expect(星们.length).toBeGreaterThan(700);
    expect(星们.length).toBeLessThan(1500);
    for (const s of 星们) {
      expect(Math.hypot(...s.向)).toBeCloseTo(1, 9);
      expect(s.半边).toBeGreaterThanOrEqual(0.15);
      expect(s.半边).toBeLessThan(0.25);
    }
  });
  it('天球照原版转：正午头顶的那一点，日出时在正东、午夜在脚下', () => {
    const 顶 = { 向: [0, 1, 0] as const, 半边: 0.2 };
    星向在(顶, 6000).forEach((v, i) => expect(v).toBeCloseTo([0, 0, 1][i]!, 6));
    const 出 = 星向在(顶, 0);
    expect(出[0]).toBeGreaterThan(0.9);
    expect(Math.abs(出[1])).toBeLessThan(1e-9);
    expect(星向在(顶, 18000)[2]).toBeCloseTo(-1, 6);
  });
  it('白天没有星星，夜里亮 0.5', () => {
    expect(星亮(6000)).toBe(0);
    expect(星亮(18000)).toBeCloseTo(0.5, 9);
  });
});
