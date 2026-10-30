import { describe, expect, it } from 'vitest';
import { 编译, 求值, 烘焙, type Molang环境 } from './Molang.ts';

const 算 = (源: string, 环境: Molang环境 = {}) => 求值(编译(源), 环境);

describe('Molang', () => {
  it('四则、优先级、一元', () => {
    expect(算('1+2*3')).toBe(7);
    expect(算('(1+2)*3')).toBe(9);
    expect(算('-2*3')).toBe(-6);
    expect(算('10-4-3')).toBe(3);
    expect(算('8/4/2')).toBe(1);
    expect(算('.5+1.')).toBe(1.5);
  });

  it('比较、逻辑、三元按 mocha 的优先级：+ 先于 <=，<= 先于 ?:', () => {
    expect(算('0.8+ysm.food_level<=6?-0.9:0', { 外部: { 'ysm.food_level': 6 } })).toBe(0);
    expect(算('0.8+ysm.food_level<=6?-0.9:0', { 外部: { 'ysm.food_level': 5 } })).toBe(-0.9);
    expect(算('1 < 2 && 2 < 1 || 1')).toBe(1);
    expect(算('!ysm.has_helmet', { 外部: { 'ysm.has_helmet': 1 } })).toBe(0);
    expect(算('1 ? 2 : 0 ? 3 : 4')).toBe(2);
    expect(算('0 ? 2 : 0 ? 3 : 4')).toBe(4);
    expect(算('0 ? 5')).toBe(0); // 二元条件不成立得 0
    expect(算('v.roaming.B == 0?1:0', { 变量: {} })).toBe(1);
  });

  it('math 用角度制', () => {
    expect(算('math.sin(90)')).toBeCloseTo(1, 12);
    expect(算('math.cos(180)')).toBeCloseTo(-1, 12);
    expect(算('math.atan2(1, 1)')).toBeCloseTo(45, 12);
    expect(算('math.clamp(5, 0, 1)')).toBe(1);
    expect(算('math.lerp(0, 10, 0.25)')).toBe(2.5);
    expect(算('math.pow(2, 10)')).toBe(1024);
    expect(算('math.pi')).toBe(Math.PI);
    expect(算('math.min_angle(270)')).toBe(-90);
    expect(算('math.hermite_blend(0.5)')).toBe(0.5);
  });

  it('查询、变量、命名空间别名、大小写不分', () => {
    const 变量: Record<string, number | string> = {};
    const 环境: Molang环境 = { 查询: { anim_time: 2, position_delta: (i) => [1, 2, 3][i] ?? 0 }, 变量 };
    expect(算('query.anim_time * 2', 环境)).toBe(4);
    expect(算('Q.Anim_Time', 环境)).toBe(2);
    expect(算('q.position_delta(1)', 环境)).toBe(2);
    expect(算('v.A = 3; variable.b = v.a + 1; return v.B * 2;', 环境)).toBe(8);
    expect(变量).toEqual({ a: 3, b: 4 });
  });

  it('多句没有 return 得 0，字符串语句当注释', () => {
    const 变量: Record<string, number | string> = {};
    expect(算("'说明';v.x=1;", { 变量 })).toBe(0);
    expect(变量.x).toBe(1);
    expect(算('t.k = 2; return t.k * t.k;')).toBe(4);
  });

  it('没给的名字得 0 并记下来', () => {
    const 未知 = new Set<string>();
    expect(算('q.health / q.max_health + ysm.head_yaw', { 未知 })).toBe(0); // 除数是 0 得 0（mocha）
    expect([...未知].sort()).toEqual(['q.health', 'q.max_health', 'ysm.head_yaw']);
  });

  it('烘焙：常量算成数，带名字的留式子', () => {
    expect(烘焙('-0.5*2+math.sin(30)')).toBeCloseTo(-0.5, 12);
    expect(烘焙(3)).toBe(3);
    const 式 = 烘焙('q.anim_time*2');
    expect(typeof 式).toBe('object');
    expect(烘焙('math.random(0, 1)')).not.toBeTypeOf('number');
  });

  it('不支持的写法在编译时就报错', () => {
    expect(() => 编译('loop(3, {v.x = 1;})')).toThrow(/不支持/);
    expect(() => 编译('1 +')).toThrow();
    expect(() => 编译('1 2')).toThrow(/多余|这里要/);
  });
});
