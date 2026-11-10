import { describe, expect, it } from 'vitest';
import { 编译, 求值 } from './Molang.ts';
import { 二阶一步, 二阶常数, 二阶推进器, 二阶稳态, 二阶起始, type 二阶函数 } from './二阶系统.ts';

// 阶跃：第 1 秒起输入从 0 跳到 10
const 阶跃 = (秒: number) => (秒 >= 1 ? 10 : 0);
const 建 = (输入: (秒: number) => number, 参: [number, number, number] = [2, 0.6, 0], 记?: number[]) =>
  二阶推进器((秒, f) => {
    记?.push(秒);
    f(['头发', 输入(秒), ...参]);
  });
const 取 = (f: 二阶函数) => f(['头发', 123, 2, 0.6, 0]);

describe('二阶系统', () => {
  it('常数照 f、ζ、r 算', () => {
    const k = 二阶常数(2, 0.6, 1);
    expect(k.k1).toBeCloseTo(0.6 / (Math.PI * 2), 12);
    expect(k.k2).toBeCloseTo(1 / (4 * Math.PI) ** 2, 12);
    expect(k.k3).toBeCloseTo(0.6 / (4 * Math.PI), 12);
  });

  it('输入不变就不动；阶跃后欠阻尼冲过头再收到输入上', () => {
    const k = 二阶常数(2, 0.3, 0);
    let s = 二阶起始(0);
    for (let i = 0; i < 60; i++) s = 二阶一步(s, 0, 1 / 60, k);
    expect(s.y).toBe(0);
    let 峰 = 0;
    for (let i = 0; i < 600; i++) {
      s = 二阶一步(s, 10, 1 / 60, k);
      峰 = Math.max(峰, s.y);
    }
    expect(峰).toBeGreaterThan(11);
    expect(s.y).toBeCloseTo(10, 4);
  });

  it('r 是初始响应：r > 0 第一步就朝输入走，r < 0 先反着走', () => {
    const 第一步 = (r: number) => 二阶一步(二阶一步(二阶起始(0), 10, 1 / 60, 二阶常数(2, 0.5, r)), 10, 1 / 60, 二阶常数(2, 0.5, r)).y;
    expect(第一步(1)).toBeGreaterThan(第一步(0));
    expect(第一步(-2)).toBeLessThan(0);
  });

  it('步长很大也不发散', () => {
    const k = 二阶常数(30, 0.1, 0);
    let s = 二阶起始(0);
    for (let i = 0; i < 200; i++) s = 二阶一步(s, 1, 0.1, k);
    expect(Math.abs(s.y)).toBeLessThan(3);
  });

  it('结果只看时间：倒着取、跳着取、重复取，都和新建一个一口气推到那一刻逐位相同', () => {
    const 甲 = 建(阶跃);
    const 时刻 = [3.5, 1.2, 0, 1.2, 7.25, 1.0166666, 2, 0.5, 7.25, 1.2];
    for (const t of 时刻) expect(取(甲.在(t))).toBe(取(建(阶跃).在(t)));
    expect(取(甲.在(0.5))).toBe(0);
    expect(取(甲.在(1.2))).toBeGreaterThan(0);
    expect(取(甲.在(7.25))).toBeCloseTo(10, 3);
  });

  it('从最近的存档接着推，不从 0 重来', () => {
    const 记: number[] = [];
    const 甲 = 建(阶跃, [2, 0.6, 0], 记);
    甲.在(5);
    expect(记.length).toBe(301);
    记.length = 0;
    甲.在(3.5); // 存档在第 3 秒（每 60 步一份），再推 30 步
    expect(记.length).toBe(30);
    记.length = 0;
    甲.在(3.6); // 接着刚才的
    expect(记.length).toBe(6);
  });

  it('不在格上的时刻从前一格推不满一步，不影响格上的结果', () => {
    const 甲 = 建(阶跃);
    const 格上 = 取(甲.在(1.5));
    const 中间 = 取(甲.在(1.5 + 1 / 120));
    expect(中间).not.toBe(格上);
    expect(取(甲.在(1.5))).toBe(格上);
    expect(取(甲.在(1.5 + 1 / 60))).toBe(取(建(阶跃).在(1.5 + 1 / 60)));
  });

  it('同一步里同名调几次只推一次；没出现过的名字原样给输入', () => {
    let 次 = 0;
    const 甲 = 二阶推进器((秒, f) => {
      const a = f(['胸', 阶跃(秒), 3, 0.3, 0]);
      const b = f(['胸', 阶跃(秒), 3, 0.3, 0]);
      expect(b).toBe(a);
      次++;
    });
    const f = 甲.在(1.1);
    expect(次).toBe(67);
    expect(f(['胸', 0, 3, 0.3, 0])).toBe(建(阶跃, [3, 0.3, 0]).在(1.1)(['头发', 0, 3, 0.3, 0]));
    expect(f(['没见过', 42, 1, 1, 0])).toBe(42);
  });

  it('接进 Molang：第一个参数是字符串名字', () => {
    const 式 = 编译("0.6*ysm.second_order('头发垂直', math.clamp(-3*q.vertical_speed+v.hv,-10,120), 2, 0.6, 0)");
    const 输入 = (秒: number) => ({ 查询: { vertical_speed: 秒 >= 1 ? -5 : 0 }, 变量: {} });
    const 甲 = 二阶推进器((秒, f) => void 求值(式, { ...输入(秒), 函数: { 'ysm.second_order': f } }));
    expect(求值(式, { ...输入(0.9), 函数: { 'ysm.second_order': 甲.在(0.9) } })).toBe(0);
    const 晃 = 求值(式, { ...输入(1.3), 函数: { 'ysm.second_order': 甲.在(1.3) } });
    expect(晃).toBeGreaterThan(0);
    expect(晃).not.toBeCloseTo(9, 1);
    expect(求值(式, { ...输入(9), 函数: { 'ysm.second_order': 甲.在(9) } })).toBeCloseTo(9, 3);
    expect(求值(式, { ...输入(1.3), 函数: { 'ysm.second_order': 二阶稳态 } })).toBe(9);
  });
});
