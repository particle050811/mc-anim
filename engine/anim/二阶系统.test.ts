import { describe, expect, it } from 'vitest';
import { compile, evaluate } from './Molang.ts';
import { secondOrderStep, SecondOrderConst, SecondOrderStepper, secondOrderSteady, secondOrderStart, type SecondOrderFn } from './二阶系统.ts';

// 阶跃：第 1 秒起输入从 0 跳到 10
const step = (sec: number) => (sec >= 1 ? 10 : 0);
const build = (inputAt: (sec: number) => number, springParams: [number, number, number] = [2, 0.6, 0], stepTimes?: number[], options?: Parameters<typeof SecondOrderStepper>[1]) =>
  SecondOrderStepper((sec, f) => {
    stepTimes?.push(sec);
    f(['头发', inputAt(sec), ...springParams]);
  }, options);
const evalSpring = (f: SecondOrderFn) => f(['头发', 123, 2, 0.6, 0]);

describe('二阶系统', () => {
  it('常数照 f、ζ、r 算', () => {
    const k = SecondOrderConst(2, 0.6, 1);
    expect(k.k1).toBeCloseTo(0.6 / (Math.PI * 2), 12);
    expect(k.k2).toBeCloseTo(1 / (4 * Math.PI) ** 2, 12);
    expect(k.k3).toBeCloseTo(0.6 / (4 * Math.PI), 12);
  });

  it('输入不变就不动；阶跃后欠阻尼冲过头再收到输入上', () => {
    const k = SecondOrderConst(2, 0.3, 0);
    let s = secondOrderStart(0);
    for (let i = 0; i < 60; i++) s = secondOrderStep(s, 0, 1 / 60, k);
    expect(s.y).toBe(0);
    let peak = 0;
    for (let i = 0; i < 600; i++) {
      s = secondOrderStep(s, 10, 1 / 60, k);
      peak = Math.max(peak, s.y);
    }
    expect(peak).toBeGreaterThan(11);
    expect(s.y).toBeCloseTo(10, 4);
  });

  it('r 是初始响应：r > 0 第一步就朝输入走，r < 0 先反着走', () => {
    const firstStep = (r: number) => secondOrderStep(secondOrderStep(secondOrderStart(0), 10, 1 / 60, SecondOrderConst(2, 0.5, r)), 10, 1 / 60, SecondOrderConst(2, 0.5, r)).y;
    expect(firstStep(1)).toBeGreaterThan(firstStep(0));
    expect(firstStep(-2)).toBeLessThan(0);
  });

  it('步长很大也不发散', () => {
    const k = SecondOrderConst(30, 0.1, 0);
    let s = secondOrderStart(0);
    for (let i = 0; i < 200; i++) s = secondOrderStep(s, 1, 0.1, k);
    expect(Math.abs(s.y)).toBeLessThan(3);
  });

  it('结果只看时间：倒着取、跳着取、重复取，都和新建一个一口气推到那一刻逐位相同', () => {
    const stepper = build(step);
    const sampleTimes = [3.5, 1.2, 0, 1.2, 7.25, 1.0166666, 2, 0.5, 7.25, 1.2];
    for (const t of sampleTimes) expect(evalSpring(stepper.在(t))).toBe(evalSpring(build(step).在(t)));
    expect(evalSpring(stepper.在(0.5))).toBe(0);
    expect(evalSpring(stepper.在(1.2))).toBeGreaterThan(0);
    expect(evalSpring(stepper.在(7.25))).toBeCloseTo(10, 3);
  });

  it('最近推过的各步留着，来回取不重推', () => {
    const stepTimes: number[] = [];
    const stepper = build(step, [2, 0.6, 0], stepTimes);
    const settled = evalSpring(stepper.在(5));
    expect(stepTimes.length).toBe(301);
    stepTimes.length = 0;
    const refValue = evalSpring(stepper.在(3.5));
    stepper.在(3.6);
    expect(evalSpring(stepper.在(5))).toBe(settled);
    expect(stepTimes.length).toBe(0);
    expect(refValue).toBe(evalSpring(build(step).在(3.5)));
  });

  it('留着的丢了，从最近的存档接着推，不从 0 重来', () => {
    const stepTimes: number[] = [];
    const stepper = build(step, [2, 0.6, 0], stepTimes, { keepRecentSteps: 10 });
    stepper.在(5);
    expect(stepTimes.length).toBe(301);
    stepTimes.length = 0;
    const refValue = evalSpring(stepper.在(3.5)); // 存档在第 3 秒（每 60 步一份），再推 30 步
    expect(stepTimes.length).toBe(30);
    stepTimes.length = 0;
    stepper.在(3.6); // 接着刚才的
    expect(stepTimes.length).toBe(6);
    expect(refValue).toBe(evalSpring(build(step).在(3.5)));
  });

  it('不在格上的时刻从前一格推不满一步，不影响格上的结果', () => {
    const stepper = build(step);
    const upperSample = evalSpring(stepper.在(1.5));
    const midSample = evalSpring(stepper.在(1.5 + 1 / 120));
    expect(midSample).not.toBe(upperSample);
    expect(evalSpring(stepper.在(1.5))).toBe(upperSample);
    expect(evalSpring(stepper.在(1.5 + 1 / 60))).toBe(evalSpring(build(step).在(1.5 + 1 / 60)));
  });

  it('同一步里同名调几次只推一次；没出现过的名字原样给输入', () => {
    let steps = 0;
    const stepper = SecondOrderStepper((sec, f) => {
      const a = f(['胸', step(sec), 3, 0.3, 0]);
      const b = f(['胸', step(sec), 3, 0.3, 0]);
      expect(b).toBe(a);
      steps++;
    });
    const f = stepper.在(1.1);
    expect(steps).toBe(67);
    expect(f(['胸', 0, 3, 0.3, 0])).toBe(build(step, [3, 0.3, 0]).在(1.1)(['头发', 0, 3, 0.3, 0]));
    expect(f(['没见过', 42, 1, 1, 0])).toBe(42);
  });

  it('接进 Molang：第一个参数是字符串名字', () => {
    const expr = compile("0.6*ysm.second_order('头发垂直', math.clamp(-3*q.vertical_speed+v.hv,-10,120), 2, 0.6, 0)");
    const inputAt = (sec: number) => ({ query: { vertical_speed: sec >= 1 ? -5 : 0 }, 变量: {} });
    const stepper = SecondOrderStepper((sec, f) => void evaluate(expr, { ...inputAt(sec), functions: { 'ysm.second_order': f } }));
    expect(evaluate(expr, { ...inputAt(0.9), functions: { 'ysm.second_order': stepper.在(0.9) } })).toBe(0);
    const response = evaluate(expr, { ...inputAt(1.3), functions: { 'ysm.second_order': stepper.在(1.3) } });
    expect(response).toBeGreaterThan(0);
    expect(response).not.toBeCloseTo(9, 1);
    expect(evaluate(expr, { ...inputAt(9), functions: { 'ysm.second_order': stepper.在(9) } })).toBeCloseTo(9, 3);
    expect(evaluate(expr, { ...inputAt(1.3), functions: { 'ysm.second_order': secondOrderSteady } })).toBe(9);
  });
});
