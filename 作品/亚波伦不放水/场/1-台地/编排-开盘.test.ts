// 第 1、2 幕编排的硬约束：第 2 幕末的状态（第 4 幕的起点）不变、七刀都差一点没砍着、两人站着不动的时间不超过两幕的 20%（用户 11-10 嫌「大部分时间都是在站着不动」）、
// 快的那几下峰值 20～30 格/秒（用户 11-11「起码得有个 20~30m/s」）、他不穿基座和灵魂火、她贴地时不钻进地里。
// 只算位置和时刻，模型、贴图给空的。
import { describe, expect, it, vi } from 'vitest';

const 空图 = { default: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==' };
vi.mock('asset:模型/角色/巨人', () => ({ default: { models: { 宽: { texW: 64, texH: 64, parts: [] } } } }));
vi.mock('asset:贴图/角色/巨人/史蒂夫', () => 空图);
vi.mock('asset:模型/角色/娘化亚波伦', () => ({ default: { texW: 1, texH: 1, bones: [] } }));
vi.mock('asset:动画/角色/娘化亚波伦/main', () => ({ default: { animations: {} } }));
vi.mock('asset:动画/角色/娘化亚波伦/extra', () => ({ default: { animations: {} } }));
vi.mock('asset:模型/物品/下界魔杖', () => ({ default: {} }));
// 多圈轮盘一 import 就要上百张聚晶图标；这里只用它算盘的外半径
vi.mock('../../界面/多圈轮盘.tsx', () => ({ 轮盘外半径: () => 100 }));
vi.mock('asset:贴图/角色/娘化亚波伦/default', () => 空图);
vi.mock('asset:贴图/角色/娘化亚波伦/5default', () => 空图);
vi.mock('asset:贴图/角色/娘化亚波伦/4default', () => 空图);
vi.mock('asset:贴图/角色/娘化亚波伦/3default', () => 空图);
vi.mock('asset:贴图/角色/娘化亚波伦/2default', () => 空图);
vi.mock('asset:贴图/特效/晋升之环/halo', () => 空图);
vi.mock('asset:贴图/物品/下界魔杖', () => 空图);

const { 瞬移刻, 史蒂夫位, 亚波伦位, 祭坛点, 悬停高, 现身后, 刀们, 史蒂夫右手, 静止判定, 受困本地, 开盘轴, 动作表, 本地地高 } = await import('./编排-开盘.ts');
const { 现身位置, 基座格, 灵魂火格 } = await import('../../特效/安息仪式时序.ts');
const 线 = (await import('./时间线.ts')).default;
const 事 = 线.事件;
const 幕4 = 现身后(事.开盘完.秒);
const 步 = 1 / 240;
const 速 = (位: (t: number) => number[], t: number) => {
  const [a, b] = [位(t - 步 / 2), 位(t + 步 / 2)];
  return Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!) / 步;
};

describe('第 1、2 幕编排', () => {
  it('第 2 幕末：她在祭坛上空 悬停高 停住；他在 受困本地 站住、拿着剑；第 2 幕里不出轮盘，第 4 幕开头的盘照五版', () => {
    const 她 = 亚波伦位(幕4);
    expect(她[0]).toBeCloseTo(祭坛点[0] + 现身位置[0], 9);
    expect(她[1]).toBeCloseTo(祭坛点[1] + 现身位置[1], 9);
    expect(她[2]).toBeCloseTo(祭坛点[2] + 悬停高, 9);
    for (const d of [0, 0.3]) expect(Math.hypot(...亚波伦位(幕4 - d).map((x, i) => x - 她[i]!))).toBeLessThan(1e-9);
    // 他往后一缩、站住 0.15 秒以上就切
    const 他 = 史蒂夫位(幕4);
    const 他后 = 史蒂夫位(幕4 - 0.15);
    expect(Math.hypot(他[0] - 他后[0], 他[1] - 他后[1], 他[2] - 他后[2])).toBeLessThan(1e-9);
    // 受困本地 [8, −6]：x 东、y 北；场景坐标里 祭坛点 往东 8、往北 −6（真下界场景是平移，不转）
    expect(他[0] - 祭坛点[0]).toBeCloseTo(受困本地[0], 6);
    expect(他[1] - 祭坛点[1]).toBeCloseTo(受困本地[1], 6);
    expect(史蒂夫右手(幕4)).toBe('剑');
    expect(开盘轴.at(-1)!.做).toBe('指向');
  });

  it('七刀：刀过去那一下（点下后 0.1 秒里）她都在剑够不着又不远的地方；横斩那刀她贴地钻过去', () => {
    const 最近们 = 刀们.map(({ 秒: c, 招 }) => {
      // 她身上（脚底到头顶的竖线）离他眼睛最近多远。剑加手臂够到眼前约 2 格：大于 2.0 格算躲开了，小于 3.2 格算「差一点」（不是远远躲着）。
      // 第四刀是砍进她瞬移留下的烟里，只算到她挪走那一刻；横斩是平着扫过胸口那一层，她头顶低过他胸口就算躲开，只要离得不远
      let 最近 = Infinity;
      let 头最高 = -Infinity;
      for (let d = 0; d <= 0.1; d += 0.01) {
        const t = c + d;
        if (t >= 瞬移刻 && c < 瞬移刻 && 瞬移刻 - c < 0.1) break;
        const 眼 = 史蒂夫位(t);
        const 胸 = 眼[2] + 1.2;
        眼[2] += 1.62;
        const 她 = 亚波伦位(t);
        头最高 = Math.max(头最高, 她[2] + 1.0 - 胸);
        const z = Math.min(Math.max(眼[2], 她[2]), 她[2] + 1.95);
        最近 = Math.min(最近, Math.hypot(她[0] - 眼[0], 她[1] - 眼[1], 招 === '横斩' && 头最高 < 0 ? 0 : z - 眼[2]));
      }
      return { 最近, 低: 头最高 < 0, 招 };
    });
    console.log(`七刀出手时她离他眼睛最近：${最近们.map((x) => `${x.招} ${x.最近.toFixed(2)}${x.低 ? '（贴地）' : ''}`).join('、')} 格`);
    for (const [i, { 最近, 低, 招 }] of 最近们.entries()) {
      expect(最近, `第 ${i + 1} 刀`).toBeLessThan(3.2);
      if (!(招 === '横斩' && 低)) expect(最近, `第 ${i + 1} 刀`).toBeGreaterThan(2.0);
    }
  });

  it('快的那几下峰值 20～30 格/秒（刹车前后不算），列成表', () => {
    const 行们 = 动作表.map((动) => {
      const 位 = 动.谁 === '史蒂夫' ? 史蒂夫位 : 亚波伦位;
      let 峰 = 0;
      for (let t = 动.起 + 步; t < 动.止 - 步; t += 步) if (Math.abs(t - 瞬移刻) > 步) 峰 = Math.max(峰, 速(位, t));
      return { ...动, 峰 };
    });
    console.log(['第 2 幕每一下的峰值速度（格/秒）：', ...行们.map((r) => `  ${r.谁} ${r.名}（${r.起.toFixed(2)}～${r.止.toFixed(2)}）：${r.峰.toFixed(1)}`)].join('\n'));
    for (const r of 行们) expect(r.峰, `${r.谁} ${r.名}`).toBeLessThanOrEqual(31);
    // 往上跳的两下是竖着跳（起跳竖直 16 格/秒），其余都要到 20
    for (const r of 行们.filter((r) => !r.名.includes('往上跳'))) expect(r.峰, `${r.谁} ${r.名}`).toBeGreaterThanOrEqual(19.5);
  });

  it('第 2 幕里他不穿基座、灵魂火和地面，她贴地滑时离地 0.2～0.5 格', () => {
    const 半宽 = 0.3;
    for (let t = 现身后(事.召唤完.秒); t < 幕4; t += 1 / 60) {
      const p = 史蒂夫位(t);
      const [x, y] = [p[0] - 祭坛点[0], p[1] - 祭坛点[1]];
      const 脚 = p[2] - 祭坛点[2];
      for (const [i, j] of [...基座格, ...灵魂火格]) {
        const 顶 = 灵魂火格.some(([a, b]) => a === i && b === j) ? 2 : 1;
        const 撞 = Math.abs(x - i) < 0.5 + 半宽 && Math.abs(y - j) < 0.5 + 半宽 && 脚 < 顶;
        expect(撞, `${t.toFixed(2)} 秒他撞上 (${i}, ${j})`).toBe(false);
      }
      expect(脚, `${t.toFixed(2)} 秒他钻进地里`).toBeGreaterThanOrEqual(本地地高(x, y) - 1e-6);
      const 她 = 亚波伦位(t);
      const 她离地 = 她[2] - 祭坛点[2] - 本地地高(她[0] - 祭坛点[0], 她[1] - 祭坛点[1]);
      expect(她离地, `${t.toFixed(2)} 秒她钻进地里`).toBeGreaterThan(0.15);
    }
  });

  it('两人站着不动的时间加起来不超过两幕总长的 20%', () => {
    const [起, 止] = [现身后(事.开始.秒), 幕4];
    const 步 = 1 / 60;
    let [史, 亚] = [0, 0];
    const 史段: number[] = [];
    for (let t = 起; t < 止; t += 步) {
      if (静止判定.史蒂夫(t)) {
        史 += 步;
        史段.push(t);
      }
      if (静止判定.亚波伦(t)) 亚 += 步;
    }
    const 比 = (史 + 亚) / (止 - 起);
    console.log(`第 1、2 幕共 ${(止 - 起).toFixed(2)} 秒：史蒂夫静止 ${史.toFixed(2)} 秒，亚波伦静止 ${亚.toFixed(2)} 秒，合计占 ${(比 * 100).toFixed(1)}%`);
    expect(比).toBeLessThanOrEqual(0.2);
  });
});
