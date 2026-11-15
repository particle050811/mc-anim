import { describe, expect, it } from 'vitest';
import {
  tlmControllerMode, defaultProfile, animTime, animLength, animWeight, sampleAnim, sampleChannel, sampleSkeleton, profilePrecision, playTo, blendLayers, parseAnimationFile,
} from './基岩动画.ts';

const animFile = {
  format_version: '1.8.0',
  animations: {
    constant: { loop: true, bones: { a: { rotation: [10, 20, 30], scale: 0.5, position: ['q.anim_time * 2', 0, 0] } } },
    linear: {
      loop: true,
      animation_length: 2,
      bones: { a: { rotation: { '0.0': [0, 0, 0], '1.0': [10, 0, 0], '2.0': [0, 0, 0] } } },
    },
    jump: {
      bones: { a: { position: { '0.0': [0, 0, 0], '1.0': { pre: [1, 1, 1], post: [5, 5, 5] }, '2.0': [5, 5, 5] } } },
    },
    curve: {
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
    easing: {
      animation_length: 1,
      bones: { a: { position: { '0': [0, 0, 0], '1': { vector: [4, 0, 0], easing: 'easeInQuad' } } } },
    },
    timeline: {
      loop: true,
      animation_length: 0.5,
      timeline: { '0.0': 'v.n = (v.n ?? 0) + 1;', '0.25': ['v.m = 7;'] },
      bones: {},
    },
    fastForward: { loop: true, animation_length: 10, anim_time_update: 'q.anim_time + q.delta_time * 2', bones: {} },
    weight: { blend_weight: 'v.w', bones: {} },
  },
};
const A = parseAnimationFile(animFile);
const TLM = { 口径: 'TLM' } as const;
const trackOf = (animName: string, ch: 'rotation' | 'position' | 'scale') => A[animName]!.skeleton.a![ch]!;

describe('解析', () => {
  it('常量写法、Molang 烘焙', () => {
    expect(A.常量!.skeleton.a!.rotation!).toHaveLength(1);
    expect(A.常量!.skeleton.a!.scale![0]!.前).toEqual([0.5, 0.5, 0.5]);
    expect(typeof A.常量!.skeleton.a!.position![0]!.前[0]).toBe('object');
    expect(A.jump!.skeleton.a!.position![1]!.前).toEqual([1, 1, 1]);
    expect(A.jump!.skeleton.a!.position![1]!.后).toEqual([5, 5, 5]);
    expect(A.曲线!.循环).toBe('hold');
    expect(A.缓动!.skeleton.a!.position![1]!.easing).toEqual({ 名: 'easeInQuad', 参数: undefined });
  });

  it('长度：写了照写的；TLM 没写取倒数第二个关键帧，通用取最后一个；只有 0 秒帧是无限长', () => {
    expect(defaultProfile).toBe('通用');
    expect(animLength(A.jump!)).toBe(2);
    expect(animLength(A.线性!)).toBe(2);
    expect(animLength(A.jump!, 'TLM')).toBe(1);
    expect(animLength(A.jump!, '通用')).toBe(2);
    expect(animLength(A.常量!)).toBe(Infinity);
  });
});

describe('取样（TLM 口径）', () => {
  it('常量和 q.anim_time', () => {
    const r = sampleAnim(A.常量!, 3, TLM).skeleton.a!;
    expect(r.rot).toEqual([10, 20, 30]);
    expect(r.pos).toEqual([6, 0, 0]);
  });

  it('线性、循环取余', () => {
    expect(sampleAnim(A.线性!, 0.5, TLM).skeleton.a!.rot).toEqual([5, 0, 0]);
    expect(sampleAnim(A.线性!, 2.5, TLM).skeleton.a!.rot).toEqual([5, 0, 0]);
    expect(sampleAnim(A.线性!, 1.5, TLM).skeleton.a!.rot).toEqual([5, 0, 0]);
  });

  it('pre/post：段终点取 pre，过了关键帧取 post', () => {
    const k = trackOf('跳变', 'position');
    expect(sampleChannel(k, 0.5, {}, 'TLM')).toEqual([0.5, 0.5, 0.5]);
    expect(sampleChannel(k, 1, {}, 'TLM')).toEqual([5, 5, 5]);
    expect(sampleChannel(k, 0.999995, {}, 'TLM')).toEqual([5, 5, 5]); // TLM 段内进度 > 0.99999 就取 post
    expect(sampleChannel(k, 0.999995, {}, '通用')[0]).toBeCloseTo(0.999995, 9);
  });

  it('catmullrom 冲过头、超出末帧取最后的 post', () => {
    const k = trackOf('曲线', 'scale');
    expect(sampleChannel(k, 1.5, {}, 'TLM')[0]).toBeCloseTo(-0.125, 12);
    expect(sampleChannel(k, 9, {}, 'TLM')).toEqual([1, 1, 1]);
  });

  it('once 和 TLM 的 hold 到头都停；通用的 hold 停在末帧', () => {
    expect(animTime(A.jump!, 1.2, 'TLM')).toEqual({ 时: 1, stopped: true });
    expect(sampleAnim(A.jump!, 1.2, TLM).skeleton).toEqual({});
    expect(animTime(A.曲线!, 5, 'TLM').stopped).toBe(true);
    expect(animTime(A.曲线!, 5, '通用')).toEqual({ 时: 3, stopped: false });
  });
});

describe('取样（通用口径）', () => {
  it('缓动只在通用口径起作用', () => {
    expect(sampleChannel(trackOf('缓动', 'position'), 0.5, {}, '通用')[0]).toBe(1);
    expect(sampleChannel(trackOf('缓动', 'position'), 0.5, {}, 'TLM')[0]).toBe(2);
  });

  it('step、bezier', () => {
    const B = parseAnimationFile({
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
    const tracks = B.x!.skeleton.a!;
    expect(sampleChannel(tracks.rotation!, 0.9, {}, '通用')).toEqual([0, 0, 0]);
    expect(sampleChannel(tracks.position!, 0.5, {}, '通用')[0]).toBeCloseTo(0.5, 9);
    expect(sampleChannel(tracks.position!, 0.1, {}, '通用')[0]).toBeLessThan(0.1);
  });
});

describe('逐步推进', () => {
  it('时间线：开头执行一次，每次绕回 0 再执行', () => {
    const variables: Record<string, number | string> = {};
    const playState = playTo(A.时间线!, 1.2, 0.1, { 环境: { 变量: variables } });
    expect(playState.时).toBeCloseTo(0.2, 9);
    expect(variables.n).toBe(3); // 0、0.5、1.0
    expect(variables.m).toBe(7);
  });

  it('anim_time_update 改动画时间的走法', () => {
    expect(playTo(A.fastForward!, 1, 0.25).时).toBeCloseTo(2, 12);
  });
});

describe('多层混合', () => {
  const lowerBones = { a: { rot: [10, 0, 0], pos: [1, 0, 0] }, b: { scale: [2, 2, 2] } };
  const upperLayer = { a: { rot: [5, 0, 0], pos: [3, 0, 0] } };

  it('TLM：覆盖层只取自己，parallel_ 层取所有层转角的和；位置一律覆盖', () => {
    expect(tlmControllerMode('parallel_3_controller')).toBe('叠加');
    expect(tlmControllerMode('pre_parallel_3_controller')).toBe('覆盖');
    expect(blendLayers([{ skeleton: lowerBones }, { skeleton: upperLayer }], 'TLM')).toEqual({ a: { rot: [5, 0, 0], pos: [3, 0, 0] }, b: { scale: [2, 2, 2] } });
    expect(blendLayers([{ skeleton: lowerBones }, { skeleton: upperLayer }, { skeleton: { a: { rot: [1, 0, 0] } }, blendMode: '叠加' }], 'TLM').a!.rot).toEqual([16, 0, 0]);
    // 通用：叠加层只加在下面那层的结果上
    expect(blendLayers([{ skeleton: lowerBones }, { skeleton: upperLayer }, { skeleton: { a: { rot: [1, 0, 0] } }, blendMode: '叠加' }]).a!.rot).toEqual([6, 0, 0]);
  });

  it('通用：覆盖按权重插值，叠加按权重相加、缩放相乘', () => {
    const r = blendLayers([{ skeleton: lowerBones }, { skeleton: upperLayer, weight: 0.5 }], '通用');
    expect(r.a!.rot).toEqual([7.5, 0, 0]);
    expect(r.a!.pos).toEqual([2, 0, 0]);
    const s = blendLayers([{ skeleton: lowerBones }, { skeleton: { a: { rot: [4, 0, 0] }, b: { scale: 0.5 } }, blendMode: '叠加', weight: 0.5 }], '通用');
    expect(s.a!.rot).toEqual([12, 0, 0]);
    expect(s.b!.scale).toEqual([1.5, 1.5, 1.5]);
  });

  it('blend_weight 按环境求值', () => {
    expect(animWeight(A.权重!, { 变量: { w: 0.25 } })).toBe(0.25);
    expect(animWeight(A.线性!)).toBe(1);
  });
});

describe('口径的 Molang 精度', () => {
  it('TLM 按 float（mocha），通用按 double（GeckoLib 4），环境写了 数值 听环境的', () => {
    const animFile = { animations: { a: { loop: true, bones: { b: { position: ['0.1 + 0.2 + q.anim_time', 0, 0] } } } } };
    const f = Math.fround;
    expect(profilePrecision('TLM')).toBe('float');
    expect(sampleSkeleton(parseAnimationFile(animFile, 'TLM').a!, 0, { 口径: 'TLM' }).b!.pos![0]).toBe(f(f(f(0.1) + f(0.2)) + 0));
    expect(sampleSkeleton(parseAnimationFile(animFile).a!, 0).b!.pos![0]).toBe(0.1 + 0.2);
    expect(sampleSkeleton(parseAnimationFile(animFile).a!, 0, { 环境: { precision: 'float' } }).b!.pos![0]).toBe(f(f(0.1) + f(0.2)));
  });
});
