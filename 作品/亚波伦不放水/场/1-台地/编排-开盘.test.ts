// 第 1、2 幕编排的硬约束：第 2 幕末的状态（第 4 幕的起点）不变、七刀都差一点没砍着、两刀间隔够冷却、两人站着不动的时间不超过两幕的 20%（用户 11-10 嫌「大部分时间都是在站着不动」）。
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

const { 瞬移刻, 史蒂夫位, 亚波伦位, 祭坛点, 悬停高, 现身后, 幕起, 七刀, 史蒂夫右手, 静止判定, 受困本地, 开盘轴, 轮盘参 } = await import('./编排-开盘.ts');
const { 现身位置 } = await import('../../特效/安息仪式时序.ts');
const 线 = (await import('./时间线.ts')).default;
const 事 = 线.事件;
const 幕4 = 现身后(事.开盘完.秒);

describe('第 1、2 幕编排', () => {
  it('现身到第 2 幕末还是 17 秒（第 4、5 幕按现身后的秒取浮动和盘转角）', () => {
    expect(幕4).toBeCloseTo(17, 9);
  });

  it('第 2 幕末：她在祭坛上空 悬停高、盘张完；他在 受困本地 站住、拿着剑', () => {
    const 她 = 亚波伦位(幕4);
    expect(她[0]).toBeCloseTo(祭坛点[0] + 现身位置[0], 9);
    expect(她[1]).toBeCloseTo(祭坛点[1] + 现身位置[1], 9);
    expect(她[2]).toBeCloseTo(祭坛点[2] + 悬停高, 9);
    for (const d of [0, 0.3]) expect(Math.hypot(...亚波伦位(幕4 - d).map((x, i) => x - 她[i]!))).toBeLessThan(1e-9);
    const 他 = 史蒂夫位(幕4);
    const 他后 = 史蒂夫位(幕4 - 0.3);
    expect(Math.hypot(他[0] - 他后[0], 他[1] - 他后[1], 他[2] - 他后[2])).toBeLessThan(1e-9);
    // 受困本地 [8, −6]：x 东、y 北；场景坐标里 祭坛点 往东 8、往北 −6（真下界场景是平移，不转）
    expect(他[0] - 祭坛点[0]).toBeCloseTo(受困本地[0], 6);
    expect(他[1] - 祭坛点[1]).toBeCloseTo(受困本地[1], 6);
    expect(史蒂夫右手(幕4)).toBe('剑');
    expect(轮盘参(幕4)!.刻).toBeGreaterThanOrEqual(19);
    expect(开盘轴.at(-1)!.做).toBe('指向');
  });

  it('七刀：两刀间隔够原版剑的冷却（0.625 秒），每一刀她都在剑够不着又不远的地方', () => {
    for (let i = 1; i < 七刀.length; i++) expect(七刀[i]! - 七刀[i - 1]!).toBeGreaterThanOrEqual(0.625);
    const 最近们 = 七刀.map((c) => {
      // 出手后 0.3 秒里（剑挥过去那几刻），她身上（脚底到头顶的竖线）离他眼睛最近多远。剑加手臂够到眼前约 2 格：
      // 大于 2.0 格算躲开了，小于 3.2 格算「差一点」（不是远远躲着）。第四刀是砍进她瞬移留下的烟里，从她挪走那一刻算
      let 最近 = Infinity;
      for (let d = 0; d <= 0.3; d += 0.02) {
        const t = 幕起 + c + d;
        if (t < 瞬移刻 && 幕起 + c < 瞬移刻 && 瞬移刻 - (幕起 + c) < 0.3) continue;
        const 眼 = 史蒂夫位(t);
        眼[2] += 1.62;
        const 她 = 亚波伦位(t);
        const z = Math.min(Math.max(眼[2], 她[2]), 她[2] + 1.95);
        最近 = Math.min(最近, Math.hypot(她[0] - 眼[0], 她[1] - 眼[1], z - 眼[2]));
      }
      return 最近;
    });
    console.log(`七刀出手时她离他眼睛最近：${最近们.map((d) => d.toFixed(2)).join('、')} 格`);
    for (const [i, d] of 最近们.entries()) {
      expect(d, `第 ${i + 1} 刀`).toBeGreaterThan(2.0);
      expect(d, `第 ${i + 1} 刀`).toBeLessThan(3.2);
    }
  });

  it('两人站着不动的时间加起来不超过两幕总长的 20%', () => {
    const [起, 止] = [现身后(事.开始.秒), 幕4];
    const 步 = 1 / 60;
    let [史, 亚] = [0, 0];
    for (let t = 起; t < 止; t += 步) {
      if (静止判定.史蒂夫(t)) 史 += 步;
      if (静止判定.亚波伦(t)) 亚 += 步;
    }
    const 比 = (史 + 亚) / (止 - 起);
    console.log(`第 1、2 幕共 ${(止 - 起).toFixed(2)} 秒：史蒂夫静止 ${史.toFixed(2)} 秒，亚波伦静止 ${亚.toFixed(2)} 秒，合计占 ${(比 * 100).toFixed(1)}%`);
    expect(比).toBeLessThanOrEqual(0.2);
  });
});
