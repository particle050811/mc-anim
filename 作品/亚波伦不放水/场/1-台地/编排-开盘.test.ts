// 第 1、2 幕编排的硬约束：第 2 幕末的状态（第 4 幕的起点）不变、断曜流光冲刺照游戏、两次冲都没碰着她（第一次她瞬移走、第二次从她脚底下过去）、
// 两人站着不动的时间不超过两幕的 20%（用户 11-10 嫌「大部分时间都是在站着不动」）、快的那几下峰值不低于 20 格/秒（用户 11-11「起码得有个 20~30m/s」，慢放那段按世界秒算）、
// 他不穿基座和灵魂火、她不钻进地里。
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

const { 瞬移刻, 史蒂夫位, 亚波伦位, 祭坛点, 悬停高, 现身后, 史蒂夫右手, 静止判定, 受困本地, 开盘轴, 动作表, 本地地高, 幕起, 幕末, 第二幕末, 史蒂夫眼 } = await import('./编排-开盘.ts');
const 时 = await import('./开盘时刻.ts');
const { 算冲刺, 贴地仰角上限 } = await import('../../物品/断曜流光冲刺.ts');
const { 开完刻 } = await import('../../界面/分圈.ts');
const { 世界秒, 片秒, 慢放率 } = await import('./开盘拍.ts');
const { 现身位置, 基座格, 灵魂火格 } = await import('../../特效/安息仪式时序.ts');
const 线 = (await import('./时间线.ts')).default;
const 事 = 线.事件;
const 幕4 = 现身后(事.开盘完.秒);
const 步 = 1 / 240;
const 速 = (位: (t: number) => number[], t: number) => {
  const [a, b] = [位(t - 步 / 2), 位(t + 步 / 2)];
  return Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!) / 步;
};
const 本 = (p: readonly number[]) => [p[0]! - 祭坛点[0], p[1]! - 祭坛点[1], p[2]! - 祭坛点[2]];

describe('第 1、2 幕编排', () => {
  it('第 2 幕末：她在祭坛上空 悬停高 停住、杖指他、盘全开；他在 受困本地 站住、拿着剑；到第 4 幕开头都不动', () => {
    const 她 = 亚波伦位(幕4);
    expect(她[0]).toBeCloseTo(祭坛点[0] + 现身位置[0], 9);
    expect(她[1]).toBeCloseTo(祭坛点[1] + 现身位置[1], 9);
    expect(她[2]).toBeCloseTo(祭坛点[2] + 悬停高, 9);
    // 第 2 幕的钟走世界秒，比片秒短：幕末 到第 4 幕开头之间两人都停着
    expect(幕末).toBeLessThan(幕4);
    for (const t of [幕末, 幕末 + 0.3, 幕4 - 0.3]) expect(Math.hypot(...亚波伦位(t).map((x, i) => x - 她[i]!))).toBeLessThan(1e-9);
    const 他 = 史蒂夫位(幕4);
    for (const t of [幕末, 幕末 - 0.1]) expect(Math.hypot(...史蒂夫位(t).map((x, i) => x - 他[i]!))).toBeLessThan(1e-9);
    // 受困本地 [8, −6]：x 东、y 北；场景坐标里 祭坛点 往东 8、往北 −6（真下界场景是平移，不转）
    expect(他[0] - 祭坛点[0]).toBeCloseTo(受困本地[0], 6);
    expect(他[1] - 祭坛点[1]).toBeCloseTo(受困本地[1], 6);
    expect(史蒂夫右手(幕4)).toBe('剑');
    expect(开盘轴.at(-1)!.做).toBe('指向');
    expect(开盘轴.at(-1)!.到!).toBeLessThan(幕末);
    expect(第二幕末.盘.刻).toBeGreaterThanOrEqual(开完刻(3));
    // 末了站直了（眼高 1.62），第 4 幕的 眼高 照这个
    expect(史蒂夫眼(幕末)[2] - 他[2]).toBeCloseTo(1.62, 2);
    console.log(`第 2 幕末（编排的钟 ${幕末.toFixed(3)} 秒）：她脚底本地 ${本(第二幕末.亚波伦位).map((x) => x.toFixed(2))}、朝向 ${第二幕末.亚波伦朝向.toFixed(1)} 度；他脚底本地 ${本(第二幕末.史蒂夫位).map((x) => x.toFixed(2))}、朝向 ${第二幕末.史蒂夫朝向.toFixed(1)} 度；盘张开后 ${第二幕末.盘.刻.toFixed(1)} 刻`);
  });

  it('断曜流光冲刺照游戏：平地上一刻 3.6 格、视线不往上 10.8 格、仰 2～2.5 度 15.8 格；两次冲正好停在下一次的起点和受困位', () => {
    const 平 = (仰角: number) => 算冲刺({ 起: [0, 0, 0], 向: [1, 0], 仰角, 地高: () => 0 });
    expect(平(0).点[1]![0]).toBeCloseTo(3.6, 9);
    expect(平(0).远).toBeCloseTo(3.6 + (3.6 * 0.91) / (1 - 0.6 * 0.91), 1);
    expect(平(贴地仰角上限 - 0.01).落地刻).toBe(1);
    expect(平(贴地仰角上限 + 0.01).落地刻).toBe(2);
    expect(平(2.25).远).toBeCloseTo(15.82, 1);
    expect(时.一冲.落地刻).toBe(3);
    expect(时.二冲.落地刻).toBe(1);
    expect(时.二仰).toBeLessThanOrEqual(贴地仰角上限);
    const 末二 = 时.二冲.点.at(-1)!;
    expect(Math.hypot(末二[0] - 受困本地[0], 末二[1] - 受困本地[1])).toBeLessThan(0.01);
  });

  it('两次冲都没碰着她：第一次他冲到之前她已经挪走；第二次他从她脚底下过去，旋风顶上离她脚底还有 0.4 格以上', () => {
    // 他横躺着冲（头朝前，长 1.8 格），外面一层旋风半径 0.7：他身子前端离她那一竖条（她脚底到头顶）水平不到 0.9 格算碰着
    const 前端 = (w: number) => {
      const p = 时.史二本地(w);
      const 向 = w < 时.拍.冲二 ? 时.一向 : 时.二向;
      return [p[0] + 向[0] * 1.8, p[1] + 向[1] * 1.8, p[2]];
    };
    let 一最近 = Infinity;
    for (let w = 时.拍.冲一; w < 时.拍.移; w += 1 / 240) {
      const [p, q] = [前端(w), 时.她二本地(w)];
      一最近 = Math.min(一最近, Math.hypot(p[0]! - q[0], p[1]! - q[1]));
    }
    let 二最低 = Infinity;
    for (let w = 时.拍.冲二; w < 时.拍.冲二 + 0.6; w += 1 / 240) {
      const p = 时.史二本地(w);
      const q = 时.她二本地(w);
      // 他身子那一段（脚底到前端）离她水平不到 0.9 格的时候，比高
      for (let u = 0; u <= 1.8; u += 0.1) {
        const [x, y] = [p[0] + 时.二向[0] * u, p[1] + 时.二向[1] * u];
        if (Math.hypot(x - q[0], y - q[1]) < 0.9) 二最低 = Math.min(二最低, q[2] - (p[2] + 0.3 + 0.7));
      }
    }
    console.log(`第一次冲：她挪走之前他身子前端离她最近 ${一最近.toFixed(2)} 格；第二次冲：他从她底下过去时旋风顶离她脚底最少 ${二最低.toFixed(2)} 格`);
    expect(一最近).toBeGreaterThan(0.9);
    expect(二最低).toBeGreaterThan(0.4);
  });

  it('快的那几下峰值不低于 20 格/秒（世界秒；慢放那段另列片上看着多快），列成表', () => {
    const 行们 = 动作表.map((动) => {
      const 位 = 动.谁 === '史蒂夫' ? 史蒂夫位 : 亚波伦位;
      let [峰, 峰时] = [0, 0];
      for (let t = 动.起 + 步; t < 动.止 - 步; t += 步)
        if (Math.abs(t - 瞬移刻) > 步) {
          const v = 速(位, t);
          if (v > 峰) [峰, 峰时] = [v, t];
        }
      const 片 = 片秒(峰时 - 幕起);
      return { ...动, 峰, 片速: 峰 * 慢放率(片) };
    });
    console.log(['第 2 幕每一下的峰值速度（格/秒）：', ...行们.map((r) => `  ${r.谁} ${r.名}（编排 ${r.起.toFixed(2)}～${r.止.toFixed(2)}）：${r.峰.toFixed(1)}${r.慢放 ? `，片上 ${r.片速.toFixed(1)}` : ''}`)].join('\n'));
    for (const r of 行们) expect(r.峰, `${r.谁} ${r.名}`).toBeGreaterThanOrEqual(20);
  });

  it('第 2 幕里他不穿基座、灵魂火和地面，她不钻进地里', () => {
    const 半宽 = 0.3;
    for (let t = 幕起; t < 幕末; t += 1 / 120) {
      const [x, y, 脚] = 本(史蒂夫位(t)) as [number, number, number];
      for (const [i, j] of [...基座格, ...灵魂火格]) {
        const 顶 = 灵魂火格.some(([a, b]) => a === i && b === j) ? 2 : 1;
        const 撞 = Math.abs(x - i) < 0.5 + 半宽 && Math.abs(y - j) < 0.5 + 半宽 && 脚 < 顶;
        expect(撞, `${t.toFixed(2)} 秒他撞上 (${i}, ${j})`).toBe(false);
      }
      expect(脚, `${t.toFixed(2)} 秒他钻进地里`).toBeGreaterThanOrEqual(本地地高(x, y) - 1e-6);
      const 她 = 本(亚波伦位(t));
      const 她离地 = 她[2]! - 本地地高(她[0]!, 她[1]!);
      expect(她离地, `${t.toFixed(2)} 秒她钻进地里`).toBeGreaterThan(0.15);
      // 她飞出来不从灵魂火上穿过去（火苗高到 2 格，她宽 0.6）
      for (const [i, j] of 灵魂火格) expect(Math.abs(她[0]! - i) < 0.8 && Math.abs(她[1]! - j) < 0.8 && 她[2]! < 2.2, `${t.toFixed(2)} 秒她穿过灵魂火 (${i}, ${j})`).toBe(false);
    }
  });

  it('慢放：世界秒、片秒互逆，世界钟一阶连续、单调', () => {
    for (let s = 0; s < 事.开盘完.秒 - 事.召唤完.秒; s += 0.01) {
      expect(片秒(世界秒(s))).toBeCloseTo(s, 6);
      expect(世界秒(s + 0.001) - 世界秒(s)).toBeGreaterThan(0);
      expect(Math.abs((世界秒(s + 0.002) - 世界秒(s + 0.001)) - (世界秒(s + 0.001) - 世界秒(s)))).toBeLessThan(1e-5);
    }
  });

  it('两人站着不动的时间加起来不超过两幕总长的 20%', () => {
    const [起, 止] = [现身后(事.开始.秒), 幕末];
    const 步 = 1 / 60;
    let [史, 亚] = [0, 0];
    for (let t = 起; t < 止; t += 步) {
      if (静止判定.史蒂夫(t)) 史 += 步;
      if (静止判定.亚波伦(t)) 亚 += 步;
    }
    const 比 = (史 + 亚) / (止 - 起);
    console.log(`第 1、2 幕共 ${(止 - 起).toFixed(2)} 秒（世界秒）：史蒂夫静止 ${史.toFixed(2)} 秒，亚波伦静止 ${亚.toFixed(2)} 秒，合计占 ${(比 * 100).toFixed(1)}%`);
    expect(比).toBeLessThanOrEqual(0.2);
  });
});
