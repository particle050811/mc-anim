import { describe, expect, it } from 'vitest';
import {
  TLM控制器模式, 默认口径, 动画时间, 动画长度, 动画权重, 取样动画, 取样通道, 取样骨骼, 口径数值, 播放到, 混合层, 解析动画文件,
} from './基岩动画.ts';

const 文件 = {
  format_version: '1.8.0',
  animations: {
    常量: { loop: true, bones: { a: { rotation: [10, 20, 30], scale: 0.5, position: ['q.anim_time * 2', 0, 0] } } },
    线性: {
      loop: true,
      animation_length: 2,
      bones: { a: { rotation: { '0.0': [0, 0, 0], '1.0': [10, 0, 0], '2.0': [0, 0, 0] } } },
    },
    跳变: {
      bones: { a: { position: { '0.0': [0, 0, 0], '1.0': { pre: [1, 1, 1], post: [5, 5, 5] }, '2.0': [5, 5, 5] } } },
    },
    曲线: {
      loop: 'hold_on_last_frame',
      bones: {
        a: {
          scale: {
            '0.0': { vector: [1, 1, 1], easing: 'catmullrom' },
            '1.0': { vector: [0, 0, 0], easing: 'catmullrom' },
            '2.0': { vector: [0, 0, 0], easing: 'catmullrom' },
            '3.0': { vector: [1, 1, 1], easing: 'catmullrom' },
          },
        },
      },
    },
    缓动: {
      animation_length: 1,
      bones: { a: { position: { '0': [0, 0, 0], '1': { vector: [4, 0, 0], easing: 'easeInQuad' } } } },
    },
    时间线: {
      loop: true,
      animation_length: 0.5,
      timeline: { '0.0': 'v.n = (v.n ?? 0) + 1;', '0.25': ['v.m = 7;'] },
      bones: {},
    },
    快放: { loop: true, animation_length: 10, anim_time_update: 'q.anim_time + q.delta_time * 2', bones: {} },
    权重: { blend_weight: 'v.w', bones: {} },
  },
};
const A = 解析动画文件(文件);
const TLM = { 口径: 'TLM' } as const;
const 轨 = (名: string, ch: 'rotation' | 'position' | 'scale') => A[名]!.骨骼.a![ch]!;

describe('解析', () => {
  it('常量写法、Molang 烘焙', () => {
    expect(A.常量!.骨骼.a!.rotation!).toHaveLength(1);
    expect(A.常量!.骨骼.a!.scale![0]!.前).toEqual([0.5, 0.5, 0.5]);
    expect(typeof A.常量!.骨骼.a!.position![0]!.前[0]).toBe('object');
    expect(A.跳变!.骨骼.a!.position![1]!.前).toEqual([1, 1, 1]);
    expect(A.跳变!.骨骼.a!.position![1]!.后).toEqual([5, 5, 5]);
    expect(A.曲线!.循环).toBe('hold');
    expect(A.缓动!.骨骼.a!.position![1]!.缓动).toEqual({ 名: 'easeInQuad', 参数: undefined });
  });

  it('长度：写了照写的；TLM 没写取倒数第二个关键帧，通用取最后一个；只有 0 秒帧是无限长', () => {
    expect(默认口径).toBe('通用');
    expect(动画长度(A.跳变!)).toBe(2);
    expect(动画长度(A.线性!)).toBe(2);
    expect(动画长度(A.跳变!, 'TLM')).toBe(1);
    expect(动画长度(A.跳变!, '通用')).toBe(2);
    expect(动画长度(A.常量!)).toBe(Infinity);
  });
});

describe('取样（TLM 口径）', () => {
  it('常量和 q.anim_time', () => {
    const r = 取样动画(A.常量!, 3, TLM).骨骼.a!;
    expect(r.rot).toEqual([10, 20, 30]);
    expect(r.pos).toEqual([6, 0, 0]);
  });

  it('线性、循环取余', () => {
    expect(取样动画(A.线性!, 0.5, TLM).骨骼.a!.rot).toEqual([5, 0, 0]);
    expect(取样动画(A.线性!, 2.5, TLM).骨骼.a!.rot).toEqual([5, 0, 0]);
    expect(取样动画(A.线性!, 1.5, TLM).骨骼.a!.rot).toEqual([5, 0, 0]);
  });

  it('pre/post：段终点取 pre，过了关键帧取 post', () => {
    const k = 轨('跳变', 'position');
    expect(取样通道(k, 0.5, {}, 'TLM')).toEqual([0.5, 0.5, 0.5]);
    expect(取样通道(k, 1, {}, 'TLM')).toEqual([5, 5, 5]);
    expect(取样通道(k, 0.999995, {}, 'TLM')).toEqual([5, 5, 5]); // TLM 段内进度 > 0.99999 就取 post
    expect(取样通道(k, 0.999995, {}, '通用')[0]).toBeCloseTo(0.999995, 9);
  });

  it('catmullrom 冲过头、超出末帧取最后的 post', () => {
    const k = 轨('曲线', 'scale');
    expect(取样通道(k, 1.5, {}, 'TLM')[0]).toBeCloseTo(-0.125, 12);
    expect(取样通道(k, 9, {}, 'TLM')).toEqual([1, 1, 1]);
  });

  it('once 和 TLM 的 hold 到头都停；通用的 hold 停在末帧', () => {
    expect(动画时间(A.跳变!, 1.2, 'TLM')).toEqual({ 时: 1, 停止: true });
    expect(取样动画(A.跳变!, 1.2, TLM).骨骼).toEqual({});
    expect(动画时间(A.曲线!, 5, 'TLM').停止).toBe(true);
    expect(动画时间(A.曲线!, 5, '通用')).toEqual({ 时: 3, 停止: false });
  });
});

describe('取样（通用口径）', () => {
  it('缓动只在通用口径起作用', () => {
    expect(取样通道(轨('缓动', 'position'), 0.5, {}, '通用')[0]).toBe(1);
    expect(取样通道(轨('缓动', 'position'), 0.5, {}, 'TLM')[0]).toBe(2);
  });

  it('step、bezier', () => {
    const B = 解析动画文件({
      animations: {
        x: {
          bones: {
            a: {
              rotation: { '0': { post: [0, 0, 0], lerp_mode: 'step' }, '1': [8, 8, 8] },
              position: {
                '0': { post: [0, 0, 0], lerp_mode: 'bezier', bezier_right_time: [0.5, 0.5, 0.5] },
                '1': { post: [1, 1, 1], lerp_mode: 'bezier', bezier_left_time: [-0.5, -0.5, -0.5] },
              },
            },
          },
        },
      },
    });
    const 轨们 = B.x!.骨骼.a!;
    expect(取样通道(轨们.rotation!, 0.9, {}, '通用')).toEqual([0, 0, 0]);
    expect(取样通道(轨们.position!, 0.5, {}, '通用')[0]).toBeCloseTo(0.5, 9);
    expect(取样通道(轨们.position!, 0.1, {}, '通用')[0]).toBeLessThan(0.1);
  });
});

describe('逐步推进', () => {
  it('时间线：开头执行一次，每次绕回 0 再执行', () => {
    const 变量: Record<string, number | string> = {};
    const 态 = 播放到(A.时间线!, 1.2, 0.1, { 环境: { 变量 } });
    expect(态.时).toBeCloseTo(0.2, 9);
    expect(变量.n).toBe(3); // 0、0.5、1.0
    expect(变量.m).toBe(7);
  });

  it('anim_time_update 改动画时间的走法', () => {
    expect(播放到(A.快放!, 1, 0.25).时).toBeCloseTo(2, 12);
  });
});

describe('多层混合', () => {
  const 下 = { a: { rot: [10, 0, 0], pos: [1, 0, 0] }, b: { scale: [2, 2, 2] } };
  const 上 = { a: { rot: [5, 0, 0], pos: [3, 0, 0] } };

  it('TLM：覆盖层只取自己，parallel_ 层取所有层转角的和；位置一律覆盖', () => {
    expect(TLM控制器模式('parallel_3_controller')).toBe('叠加');
    expect(TLM控制器模式('pre_parallel_3_controller')).toBe('覆盖');
    expect(混合层([{ 骨骼: 下 }, { 骨骼: 上 }], 'TLM')).toEqual({ a: { rot: [5, 0, 0], pos: [3, 0, 0] }, b: { scale: [2, 2, 2] } });
    expect(混合层([{ 骨骼: 下 }, { 骨骼: 上 }, { 骨骼: { a: { rot: [1, 0, 0] } }, 模式: '叠加' }], 'TLM').a!.rot).toEqual([16, 0, 0]);
    // 通用：叠加层只加在下面那层的结果上
    expect(混合层([{ 骨骼: 下 }, { 骨骼: 上 }, { 骨骼: { a: { rot: [1, 0, 0] } }, 模式: '叠加' }]).a!.rot).toEqual([6, 0, 0]);
  });

  it('通用：覆盖按权重插值，叠加按权重相加、缩放相乘', () => {
    const r = 混合层([{ 骨骼: 下 }, { 骨骼: 上, 权重: 0.5 }], '通用');
    expect(r.a!.rot).toEqual([7.5, 0, 0]);
    expect(r.a!.pos).toEqual([2, 0, 0]);
    const s = 混合层([{ 骨骼: 下 }, { 骨骼: { a: { rot: [4, 0, 0] }, b: { scale: 0.5 } }, 模式: '叠加', 权重: 0.5 }], '通用');
    expect(s.a!.rot).toEqual([12, 0, 0]);
    expect(s.b!.scale).toEqual([1.5, 1.5, 1.5]);
  });

  it('blend_weight 按环境求值', () => {
    expect(动画权重(A.权重!, { 变量: { w: 0.25 } })).toBe(0.25);
    expect(动画权重(A.线性!)).toBe(1);
  });
});

describe('口径的 Molang 精度', () => {
  it('TLM 按 float（mocha），通用按 double（GeckoLib 4），环境写了 数值 听环境的', () => {
    const 文件 = { animations: { a: { loop: true, bones: { b: { position: ['0.1 + 0.2 + q.anim_time', 0, 0] } } } } };
    const f = Math.fround;
    expect(口径数值('TLM')).toBe('float');
    expect(取样骨骼(解析动画文件(文件, 'TLM').a!, 0, { 口径: 'TLM' }).b!.pos![0]).toBe(f(f(f(0.1) + f(0.2)) + 0));
    expect(取样骨骼(解析动画文件(文件).a!, 0).b!.pos![0]).toBe(0.1 + 0.2);
    expect(取样骨骼(解析动画文件(文件).a!, 0, { 环境: { 数值: 'float' } }).b!.pos![0]).toBe(f(f(0.1) + f(0.2)));
  });
});
