import { describe, expect, it } from 'vitest';
import { compile, evaluate, bake, type MolangEnv } from './Molang.ts';

const calc = (sourceText: string, env: MolangEnv = {}) => evaluate(compile(sourceText), env);

describe('Molang', () => {
  it('四则、优先级、一元', () => {
    expect(calc('1+2*3')).toBe(7);
    expect(calc('(1+2)*3')).toBe(9);
    expect(calc('-2*3')).toBe(-6);
    expect(calc('10-4-3')).toBe(3);
    expect(calc('8/4/2')).toBe(1);
    expect(calc('.5+1.')).toBe(1.5);
  });

  it('比较、逻辑、三元按 mocha 的优先级：+ 先于 <=，<= 先于 ?:', () => {
    expect(calc('0.8+ysm.food_level<=6?-0.9:0', { external: { 'ysm.food_level': 6 } })).toBe(0);
    expect(calc('0.8+ysm.food_level<=6?-0.9:0', { external: { 'ysm.food_level': 5 } })).toBe(-0.9);
    expect(calc('1 < 2 && 2 < 1 || 1')).toBe(1);
    expect(calc('!ysm.has_helmet', { external: { 'ysm.has_helmet': 1 } })).toBe(0);
    expect(calc('1 ? 2 : 0 ? 3 : 4')).toBe(2);
    expect(calc('0 ? 2 : 0 ? 3 : 4')).toBe(4);
    expect(calc('0 ? 5')).toBe(0); // 二元条件不成立得 0
    expect(calc('v.roaming.B == 0?1:0', { 变量: {} })).toBe(1);
  });

  it('math 用角度制', () => {
    expect(calc('math.sin(90)')).toBeCloseTo(1, 12);
    expect(calc('math.cos(180)')).toBeCloseTo(-1, 12);
    expect(calc('math.atan2(1, 1)')).toBeCloseTo(45, 12);
    expect(calc('math.clamp(5, 0, 1)')).toBe(1);
    expect(calc('math.lerp(0, 10, 0.25)')).toBe(2.5);
    expect(calc('math.pow(2, 10)')).toBe(1024);
    expect(calc('math.pi')).toBe(Math.PI);
    expect(calc('math.min_angle(270)')).toBe(-90);
    expect(calc('math.hermite_blend(0.5)')).toBe(0.5);
  });

  it('查询、变量、命名空间别名、大小写不分', () => {
    const variables: Record<string, number | string> = {};
    const env: MolangEnv = { query: { anim_time: 2, position_delta: (i) => [1, 2, 3][i] ?? 0 }, 变量: variables };
    expect(calc('query.anim_time * 2', env)).toBe(4);
    expect(calc('Q.Anim_Time', env)).toBe(2);
    expect(calc('q.position_delta(1)', env)).toBe(2);
    expect(calc('v.A = 3; variable.b = v.a + 1; return v.B * 2;', env)).toBe(8);
    expect(variables).toEqual({ a: 3, b: 4 });
  });

  it('多句没有 return 得 0，字符串语句当注释', () => {
    const variables: Record<string, number | string> = {};
    expect(calc("'说明';v.x=1;", { 变量: variables })).toBe(0);
    expect(variables.x).toBe(1);
    expect(calc('t.k = 2; return t.k * t.k;')).toBe(4);
  });

  it('没给的名字得 0 并记下来', () => {
    const unresolved = new Set<string>();
    expect(calc('q.health / q.max_health + ysm.head_yaw', { unresolved })).toBe(0); // 除数是 0 得 0（mocha）
    expect([...unresolved].sort()).toEqual(['q.health', 'q.max_health', 'ysm.head_yaw']);
  });

  it('烘焙：常量算成数，带名字的留式子', () => {
    expect(bake('-0.5*2+math.sin(30)')).toBeCloseTo(-0.5, 12);
    expect(bake(3)).toBe(3);
    const expr = bake('q.anim_time*2');
    expect(typeof expr).toBe('object');
    expect(bake('math.random(0, 1)')).not.toBeTypeOf('number');
  });

  it('不支持的写法在编译时就报错', () => {
    expect(() => compile('loop(3, {v.x = 1;})')).toThrow(/不支持/);
    expect(() => compile('1 +')).toThrow();
    expect(() => compile('1 2')).toThrow(/多余|这里要/);
  });

  it('数值精度：float 每步舍入到 32 位（mocha、基岩版），默认 double（GeckoLib 4 的 mclib）', () => {
    const expr = compile('0.1 + 0.2');
    expect(evaluate(expr)).toBe(0.1 + 0.2);
    const f = Math.fround;
    expect(evaluate(expr, { precision: 'float' })).toBe(f(f(0.1) + f(0.2)));
    expect(evaluate(expr, { precision: 'float' })).not.toBe(0.1 + 0.2);
    // 读到的查询、变量、函数结果也舍入
    expect(evaluate(compile('q.x * 3'), { precision: 'float', query: { x: 0.1 } })).toBe(f(f(0.1) * 3));
    expect(evaluate(compile('math.sin(30)'), { precision: 'float' })).toBe(f(Math.sin(Math.PI / 6)));
    // 比较在 float 上做：0.1 + 0.2 == 0.3 在 float 里成立，double 里不成立
    expect(evaluate(compile('0.1 + 0.2 == 0.3'), { precision: 'float' })).toBe(1);
    expect(evaluate(compile('0.1 + 0.2 == 0.3'))).toBe(0);
    expect(bake('0.1 + 0.2', 'float')).toBe(f(f(0.1) + f(0.2)));
  });
});
