import { describe, expect, it } from 'vitest';
import { GeckoLib控制器, 基岩控制器, 插姿势, 解析控制器文件, 过渡权重 } from './动画控制器.ts';
import { 动画进度, 取样动画, 解析动画文件 } from './基岩动画.ts';

// 基岩版文档（Animation Controllers / Entity Animation 文档）里羊的例子，原样
const 羊控制器文件 = {
  format_version: '1.10.0',
  animation_controllers: {
    'controller.animation.sheep.move': {
      states: {
        default: {
          animations: [{ walk: 'query.modified_move_speed' }],
          transitions: [{ grazing: 'query.is_grazing' }],
        },
        grazing: {
          animations: ['grazing'],
          transitions: [{ default: 'query.all_animations_finished' }],
        },
      },
    },
  },
};
// 自己造的动画：walk 让 leg 转 0→40→0（1 秒一遍），grazing 让 head 低头 0→60（2 秒，播一遍）
const 动画们 = 解析动画文件({
  format_version: '1.8.0',
  animations: {
    'animation.sheep.walk': {
      loop: true,
      animation_length: 1,
      bones: { leg: { rotation: { '0.0': [0, 0, 0], '0.5': [40, 0, 0], '1.0': [0, 0, 0] } } },
    },
    'animation.sheep.grazing': {
      animation_length: 2,
      bones: { head: { rotation: { '0.0': [0, 0, 0], '2.0': [60, 0, 0] } } },
    },
    站: { loop: true, bones: { body: { position: [0, 2, 0] } } },
    坐: { loop: true, bones: { body: { position: [0, -4, 0], rotation: [0, 0, 10] } } },
    挥手: {
      animation_length: 1,
      bones: { arm: { rotation: { '0.0': [-30, 0, 0], '1.0': [-90, 0, 0] } } },
    },
    转身: { loop: true, bones: { body: { rotation: [0, 170, 0] } } },
    反转身: { loop: true, bones: { body: { rotation: [0, -170, 0] } } },
    设变量: { loop: true, bones: { body: { position: ['v.height', 0, 0] } } },
    延迟: {
      loop: true,
      animation_length: 1,
      start_delay: 0.5,
      loop_delay: 0.25,
      bones: { a: { position: { '0.0': [0, 0, 0], '1.0': [8, 0, 0] } } },
    },
    随机延迟: {
      loop: true,
      animation_length: 1,
      loop_delay: 'v.loops = (v.loops ?? 0) + 1; return v.loops;',
      bones: { a: { position: { '0.0': [0, 0, 0], '1.0': [8, 0, 0] } } },
    },
  },
});
const 名表 = { walk: 'animation.sheep.walk', grazing: 'animation.sheep.grazing' };

describe('基岩版控制器', () => {
  const 控 = 解析控制器文件(羊控制器文件)['controller.animation.sheep.move']!;

  it('解析：初始状态默认 default，动画带 Molang 权重，转移按顺序', () => {
    expect(控.初始).toBe('default');
    expect(控.状态们.default!.动画们[0]!.名).toBe('walk');
    expect(typeof 控.状态们.default!.动画们[0]!.权重).toBe('object');
    expect(控.状态们.default!.转移们.map((t) => t.到)).toEqual(['grazing']);
    expect(控.状态们.grazing!.过渡).toBe(0);
    expect(() => 解析控制器文件({ animation_controllers: { c: { states: { default: { transitions: [{ 没有: '1' }] } } } } })).toThrow(/不存在/);
  });

  // 第 1 秒开始吃草（只给一步），吃完 2 秒自己回 default
  const 环境 = (秒: number) => ({ 查询: { modified_move_speed: 0.5, is_grazing: 秒 >= 1 && 秒 < 1.05 ? 1 : 0 } });
  const 羊 = 基岩控制器(控, { 动画们, 名表, 环境 });

  it('状态按条件转、all_animations_finished 播完回去', () => {
    expect(羊.步于(0.95).状态).toBe('default');
    expect(羊.步于(1).状态).toBe('grazing');
    expect(羊.步于(1).进入).toBe(1);
    expect(羊.步于(2.9).状态).toBe('grazing');
    expect(羊.步于(3).状态).toBe('default');
  });

  it('姿势：default 里 walk 按 modified_move_speed 加权叠加；状态动画从进入时刻开播', () => {
    expect(羊.姿势(0.5).leg!.rot![0]).toBeCloseTo(20, 9); // 40 × 0.5
    expect(羊.姿势(2).head!.rot![0]).toBeCloseTo(30, 9); // 进入 1 秒后，低头一半
    expect(羊.姿势(2).leg).toBeUndefined();
    // 回到 default 后 walk 从 0 开始
    expect(羊.姿势(3.25).leg!.rot![0]).toBeCloseTo(10, 9);
  });

  it('结果只看时间，和取帧顺序无关', () => {
    const 乙 = 基岩控制器(控, { 动画们, 名表, 环境 });
    const 后 = 乙.姿势(3.25);
    const 前 = 乙.姿势(2);
    expect(后).toEqual(羊.姿势(3.25));
    expect(前).toEqual(羊.姿势(2));
  });

  it('blend_transition：离开的状态淡出，旧状态的动画接着播', () => {
    const c = 解析控制器文件({
      animation_controllers: {
        c: {
          initial_state: '坐',
          states: {
            坐: { animations: ['坐'], transitions: [{ 站: 'q.life_time >= 1' }], blend_transition: 0.5, on_exit: 'v.stood = 1;' },
            站: { animations: ['站', '设变量'], on_entry: ['v.height = 3;'] },
          },
        },
      },
    }).c!;
    const p = 基岩控制器(c, { 动画们, 环境: (秒) => ({ 查询: { life_time: 秒 } }) });
    expect(p.姿势(0.5).body).toEqual({ pos: [0, -4, 0], rot: [0, 0, 10] });
    // 1.25 秒：旧（坐）权重 0.5，新（站 + 设变量）0.5
    const 中 = p.姿势(1.25).body!;
    expect(中.pos).toEqual([1.5, -1, 0]);
    expect(中.rot).toEqual([0, 0, 5]);
    expect(p.姿势(1.5).body).toEqual({ pos: [3, 2, 0] }); // 淡出完，旧状态的 rot 不再给
    expect(p.步于(2).变量).toEqual({ stood: 1, height: 3 });
    expect(p.步于(0.5).变量).toEqual({});
  });

  it('blend_via_shortest_path：170° → −170° 走 180° 那边', () => {
    const 做 = (最短: boolean) =>
      基岩控制器(
        解析控制器文件({
          animation_controllers: {
            c: {
              states: {
                default: { animations: ['转身'], transitions: [{ b: 'q.life_time >= 1' }], blend_transition: 1, blend_via_shortest_path: 最短 },
                b: { animations: ['反转身'] },
              },
            },
          },
        }).c!,
        { 动画们, 环境: (秒) => ({ 查询: { life_time: 秒 } }) },
      ).姿势(1.5).body!.rot![1];
    expect(做(false)).toBeCloseTo(0, 9);
    expect(Math.abs(做(true)!)).toBeCloseTo(180, 9);
  });

  it('blend_transition 写成曲线', () => {
    const 曲线 = [
      { 时: 0, 权: 1 },
      { 时: 0.2, 权: 0.8 },
      { 时: 0.4, 权: 0 },
    ];
    expect(过渡权重(曲线, 0.1)).toBeCloseTo(0.9, 12);
    expect(过渡权重(曲线, 0.3)).toBeCloseTo(0.4, 12);
    expect(过渡权重(曲线, 1)).toBe(0);
    expect(过渡权重(0.5, 0.25)).toBe(0.5);
    expect(过渡权重(0, 0)).toBe(0);
    const c = 解析控制器文件({ animation_controllers: { c: { states: { default: { blend_transition: { '0.0': 1, '0.4': 0 } } } } } }).c!;
    expect(c.状态们.default!.过渡).toEqual([
      { 时: 0, 权: 1 },
      { 时: 0.4, 权: 0 },
    ]);
  });

  it('名字错了在建播放器时就报错', () => {
    expect(() => 基岩控制器(控, { 动画们 })).toThrow(/找不到动画 walk/);
  });
});

describe('start_delay、loop_delay', () => {
  const a = 动画们.延迟!;
  it('开播前不给骨骼，每遍之间停在末帧', () => {
    expect(动画进度(a, 0.3)).toEqual({ 时: 0, 停止: false, 等待: true });
    expect(取样动画(a, 0.3).骨骼).toEqual({});
    expect(动画进度(a, 1).时).toBeCloseTo(0.5, 12);
    expect(动画进度(a, 1.6).时).toBe(1); // 1.5～1.75 是 loop_delay
    expect(动画进度(a, 1.8).时).toBeCloseTo(0.05, 12);
    expect(取样动画(a, 1).骨骼.a!.pos![0]).toBeCloseTo(4, 12);
  });
  it('TLM 口径不读延迟', () => {
    expect(动画进度(a, 0.3, { 口径: 'TLM' }).时).toBeCloseTo(0.3, 12);
  });
  it('loop_delay 是 Molang 时每遍末求一次', () => {
    const b = 动画们.随机延迟!;
    const 变量 = {};
    // 第 1 遍 [0,1)、等 1、第 2 遍 [2,3)、等 2、第 3 遍 [5,6)
    expect(动画进度(b, 1.5, { 环境: { 变量 } }).时).toBe(1);
    expect(动画进度(b, 2.5, { 环境: { 变量: {} } }).时).toBeCloseTo(0.5, 12);
    expect(动画进度(b, 4, { 环境: { 变量: {} } }).时).toBe(1);
    expect(动画进度(b, 5.25, { 环境: { 变量: {} } }).时).toBeCloseTo(0.25, 12);
  });
});

describe('GeckoLib 控制器（transitionLength）', () => {
  it('开头从原位过渡到第一段动画的第 0 刻，过渡完从 0 开播', () => {
    const c = GeckoLib控制器({ 名: 'main', 过渡刻: 10, 安排: [{ 秒: 0, 播: '挥手' }], 动画们 });
    expect(c.姿势(0).arm!.rot).toEqual([0, 0, 0]);
    expect(c.姿势(0.25).arm!.rot![0]).toBeCloseTo(-15, 12); // 0 → −30 的一半
    expect(c.姿势(0.5).arm!.rot![0]).toBeCloseTo(-30, 12); // 开播，第 0 刻
    expect(c.姿势(1).arm!.rot![0]).toBeCloseTo(-60, 12);
    // 播完一遍（once）队列空了：停，不给骨骼
    expect(c.姿势(1.6)).toEqual({});
  });

  it('播到一半换动画：从切换那一刻的姿势插过去，只插新动画有的骨骼、通道', () => {
    const c = GeckoLib控制器({
      名: 'main',
      过渡刻: 4,
      安排: [
        { 秒: 0, 播: [{ 名: '挥手', 循环: 'loop' }] },
        { 秒: 0.7, 播: '坐' },
      ],
      动画们,
    });
    // 0.7 秒时挥手播了 0.5 秒 → −60
    const 中 = c.姿势(0.8); // 过渡 0.2 秒的一半
    expect(中.arm).toBeUndefined(); // 坐 不碰 arm
    expect(中.body!.pos![1]).toBeCloseTo(-2, 12);
    expect(中.body!.rot![2]).toBeCloseTo(5, 12);
    expect(c.姿势(0.95).body!.pos).toEqual([0, -4, 0]);
  });

  it('过渡被打断：从过渡中的姿势再插', () => {
    const c = GeckoLib控制器({ 名: 'm', 过渡刻: 20, 安排: [{ 秒: 0, 播: '坐' }, { 秒: 0.5, 播: '站' }], 动画们 });
    // 0.5 秒时 body.pos 在 0 → −4 的一半（−2），再插到 +2
    expect(c.姿势(0.5).body!.pos).toEqual([0, -2, 0]);
    expect(c.姿势(1).body!.pos![1]).toBeCloseTo(0, 12);
    expect(c.姿势(1.5).body!.pos).toEqual([0, 2, 0]);
  });

  it('队列：once 播完过渡到下一段；几遍、hold、等刻；一样的 RawAnimation 不重播；null 停', () => {
    const c = GeckoLib控制器({
      名: 'm',
      过渡刻: 0,
      安排: [
        { 秒: 0, 播: [{ 名: '挥手', 循环: 2 }, { 等刻: 10 }, { 名: '挥手', 循环: 'hold' }] },
        { 秒: 1, 播: [{ 名: '挥手', 循环: 2 }, { 等刻: 10 }, { 名: '挥手', 循环: 'hold' }] },
        { 秒: 10, 播: null },
      ],
      动画们,
    });
    expect(c.姿势(1.5).arm!.rot![0]).toBeCloseTo(-60, 12); // 第二遍一半，没因为第 1 秒的同一个请求重播
    expect(c.姿势(2.2)).toEqual({}); // 等 0.5 秒
    expect(c.姿势(3).arm!.rot![0]).toBeCloseTo(-60, 12);
    expect(c.姿势(9).arm!.rot![0]).toBeCloseTo(-90, 12); // hold 停在末帧
    expect(c.姿势(10)).toEqual({});
  });

  it('速度：过渡和播放一起快', () => {
    const c = GeckoLib控制器({ 名: 'm', 过渡刻: 10, 速度: 2, 安排: [{ 秒: 0, 播: '挥手' }], 动画们 });
    expect(c.姿势(0.125).arm!.rot![0]).toBeCloseTo(-15, 12);
    expect(c.姿势(0.5).arm!.rot![0]).toBeCloseTo(-60, 12);
  });
});

describe('插姿势', () => {
  it('缺的通道按原位', () => {
    expect(插姿势({ a: { scale: 0 } }, { a: { rot: [10, 0, 0] } }, 0.5)).toEqual({ a: { rot: [5, 0, 0], scale: [0.5, 0.5, 0.5] } });
  });
});
