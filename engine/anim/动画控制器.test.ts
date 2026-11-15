import { describe, expect, it } from 'vitest';
import { geckoLibController, bedrockController, lerpPose, parseControllerFile, transitionWeight } from './动画控制器.ts';
import { animProgress, sampleAnim, parseAnimationFile } from './基岩动画.ts';

// 基岩版文档（Animation Controllers / Entity Animation 文档）里羊的例子，原样
const sheepControllerFile = {
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
const animations = parseAnimationFile({
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
    stand: { loop: true, bones: { body: { position: [0, 2, 0] } } },
    sit: { loop: true, bones: { body: { position: [0, -4, 0], rotation: [0, 0, 10] } } },
    wave: {
      animation_length: 1,
      bones: { arm: { rotation: { '0.0': [-30, 0, 0], '1.0': [-90, 0, 0] } } },
    },
    turnAround: { loop: true, bones: { body: { rotation: [0, 170, 0] } } },
    turnAroundReverse: { loop: true, bones: { body: { rotation: [0, -170, 0] } } },
    setVar: { loop: true, bones: { body: { position: ['v.height', 0, 0] } } },
    delay: {
      loop: true,
      animation_length: 1,
      start_delay: 0.5,
      loop_delay: 0.25,
      bones: { a: { position: { '0.0': [0, 0, 0], '1.0': [8, 0, 0] } } },
    },
    randomDelay: {
      loop: true,
      animation_length: 1,
      loop_delay: 'v.loops = (v.loops ?? 0) + 1; return v.loops;',
      bones: { a: { position: { '0.0': [0, 0, 0], '1.0': [8, 0, 0] } } },
    },
  },
});
const nameTable = { walk: 'animation.sheep.walk', grazing: 'animation.sheep.grazing' };

describe('基岩版控制器', () => {
  const controller = parseControllerFile(sheepControllerFile)['controller.animation.sheep.move']!;

  it('解析：初始状态默认 default，动画带 Molang 权重，转移按顺序', () => {
    expect(controller.initialState).toBe('default');
    expect(controller.states.default!.animations[0]!.名).toBe('walk');
    expect(typeof controller.states.default!.animations[0]!.weight).toBe('object');
    expect(controller.states.default!.transitions.map((t) => t.到)).toEqual(['grazing']);
    expect(controller.states.grazing!.transition).toBe(0);
    expect(() => parseControllerFile({ animation_controllers: { c: { states: { default: { transitions: [{ missingState: '1' }] } } } } })).toThrow(/不存在/);
  });

  // 第 1 秒开始吃草（只给一步），吃完 2 秒自己回 default
  const envAt = (sec: number) => ({ query: { modified_move_speed: 0.5, is_grazing: sec >= 1 && sec < 1.05 ? 1 : 0 } });
  const sheep = bedrockController(controller, { animations, nameTable, 环境: envAt });

  it('状态按条件转、all_animations_finished 播完回去', () => {
    expect(sheep.stepAt(0.95).状态).toBe('default');
    expect(sheep.stepAt(1).状态).toBe('grazing');
    expect(sheep.stepAt(1).enteredAt).toBe(1);
    expect(sheep.stepAt(2.9).状态).toBe('grazing');
    expect(sheep.stepAt(3).状态).toBe('default');
  });

  it('姿势：default 里 walk 按 modified_move_speed 加权叠加；状态动画从进入时刻开播', () => {
    expect(sheep.poseAt(0.5).leg!.rot![0]).toBeCloseTo(20, 9); // 40 × 0.5
    expect(sheep.poseAt(2).head!.rot![0]).toBeCloseTo(30, 9); // 进入 1 秒后，低头一半
    expect(sheep.poseAt(2).leg).toBeUndefined();
    // 回到 default 后 walk 从 0 开始
    expect(sheep.poseAt(3.25).leg!.rot![0]).toBeCloseTo(10, 9);
  });

  it('结果只看时间，和取帧顺序无关', () => {
    const secondCtrl = bedrockController(controller, { animations, nameTable, 环境: envAt });
    const actualPose = secondCtrl.poseAt(3.25);
    const first = secondCtrl.poseAt(2);
    expect(actualPose).toEqual(sheep.poseAt(3.25));
    expect(first).toEqual(sheep.poseAt(2));
  });

  it('blend_transition：离开的状态淡出，旧状态的动画接着播', () => {
    const c = parseControllerFile({
      animation_controllers: {
        c: {
          initial_state: '坐',
          states: {
            sit: { animations: ['坐'], transitions: [{ stand: 'q.life_time >= 1' }], blend_transition: 0.5, on_exit: 'v.stood = 1;' },
            stand: { animations: ['站', '设变量'], on_entry: ['v.height = 3;'] },
          },
        },
      },
    }).c!;
    const p = bedrockController(c, { animations, 环境: (sec) => ({ query: { life_time: sec } }) });
    expect(p.poseAt(0.5).body).toEqual({ pos: [0, -4, 0], rot: [0, 0, 10] });
    // 1.25 秒：旧（坐）权重 0.5，新（站 + 设变量）0.5
    const bodyPose = p.poseAt(1.25).body!;
    expect(bodyPose.pos).toEqual([1.5, -1, 0]);
    expect(bodyPose.rot).toEqual([0, 0, 5]);
    expect(p.poseAt(1.5).body).toEqual({ pos: [3, 2, 0] }); // 淡出完，旧状态的 rot 不再给
    expect(p.stepAt(2).变量).toEqual({ stood: 1, height: 3 });
    expect(p.stepAt(0.5).变量).toEqual({});
  });

  it('blend_via_shortest_path：170° → −170° 走 180° 那边', () => {
    const runCase = (shortest: boolean) =>
      bedrockController(
        parseControllerFile({
          animation_controllers: {
            c: {
              states: {
                default: { animations: ['转身'], transitions: [{ b: 'q.life_time >= 1' }], blend_transition: 1, blend_via_shortest_path: shortest },
                b: { animations: ['反转身'] },
              },
            },
          },
        }).c!,
        { animations, 环境: (sec) => ({ query: { life_time: sec } }) },
      ).poseAt(1.5).body!.rot![1];
    expect(runCase(false)).toBeCloseTo(0, 9);
    expect(Math.abs(runCase(true)!)).toBeCloseTo(180, 9);
  });

  it('blend_transition 写成曲线', () => {
    const curve = [
      { 时: 0, weight: 1 },
      { 时: 0.2, weight: 0.8 },
      { 时: 0.4, weight: 0 },
    ];
    expect(transitionWeight(curve, 0.1)).toBeCloseTo(0.9, 12);
    expect(transitionWeight(curve, 0.3)).toBeCloseTo(0.4, 12);
    expect(transitionWeight(curve, 1)).toBe(0);
    expect(transitionWeight(0.5, 0.25)).toBe(0.5);
    expect(transitionWeight(0, 0)).toBe(0);
    const c = parseControllerFile({ animation_controllers: { c: { states: { default: { blend_transition: { '0.0': 1, '0.4': 0 } } } } } }).c!;
    expect(c.states.default!.transition).toEqual([
      { 时: 0, weight: 1 },
      { 时: 0.4, weight: 0 },
    ]);
  });

  it('名字错了在建播放器时就报错', () => {
    expect(() => bedrockController(controller, { animations })).toThrow(/找不到动画 walk/);
  });
});

describe('start_delay、loop_delay', () => {
  const a = animations.延迟!;
  it('开播前不给骨骼，每遍之间停在末帧', () => {
    expect(animProgress(a, 0.3)).toEqual({ 时: 0, stopped: false, 等待: true });
    expect(sampleAnim(a, 0.3).skeleton).toEqual({});
    expect(animProgress(a, 1).时).toBeCloseTo(0.5, 12);
    expect(animProgress(a, 1.6).时).toBe(1); // 1.5～1.75 是 loop_delay
    expect(animProgress(a, 1.8).时).toBeCloseTo(0.05, 12);
    expect(sampleAnim(a, 1).skeleton.a!.pos![0]).toBeCloseTo(4, 12);
  });
  it('TLM 口径不读延迟', () => {
    expect(animProgress(a, 0.3, { 口径: 'TLM' }).时).toBeCloseTo(0.3, 12);
  });
  it('loop_delay 是 Molang 时每遍末求一次', () => {
    const b = animations.randomDelay!;
    const variables = {};
    // 第 1 遍 [0,1)、等 1、第 2 遍 [2,3)、等 2、第 3 遍 [5,6)
    expect(animProgress(b, 1.5, { 环境: { 变量: variables } }).时).toBe(1);
    expect(animProgress(b, 2.5, { 环境: { 变量: {} } }).时).toBeCloseTo(0.5, 12);
    expect(animProgress(b, 4, { 环境: { 变量: {} } }).时).toBe(1);
    expect(animProgress(b, 5.25, { 环境: { 变量: {} } }).时).toBeCloseTo(0.25, 12);
  });
});

describe('GeckoLib 控制器（transitionLength）', () => {
  it('开头从原位过渡到第一段动画的第 0 刻，过渡完从 0 开播', () => {
    const c = geckoLibController({ 名: 'main', transitionTicks: 10, schedule: [{ 秒: 0, clip: '挥手' }], animations });
    expect(c.poseAt(0).arm!.rot).toEqual([0, 0, 0]);
    expect(c.poseAt(0.25).arm!.rot![0]).toBeCloseTo(-15, 12); // 0 → −30 的一半
    expect(c.poseAt(0.5).arm!.rot![0]).toBeCloseTo(-30, 12); // 开播，第 0 刻
    expect(c.poseAt(1).arm!.rot![0]).toBeCloseTo(-60, 12);
    // 播完一遍（once）队列空了：停，不给骨骼
    expect(c.poseAt(1.6)).toEqual({});
  });

  it('播到一半换动画：从切换那一刻的姿势插过去，只插新动画有的骨骼、通道', () => {
    const c = geckoLibController({
      名: 'main',
      transitionTicks: 4,
      schedule: [
        { 秒: 0, clip: [{ 名: '挥手', 循环: 'loop' }] },
        { 秒: 0.7, clip: '坐' },
      ],
      animations,
    });
    // 0.7 秒时挥手播了 0.5 秒 → −60
    const midBlendPose = c.poseAt(0.8); // 过渡 0.2 秒的一半
    expect(midBlendPose.arm).toBeUndefined(); // 坐 不碰 arm
    expect(midBlendPose.body!.pos![1]).toBeCloseTo(-2, 12);
    expect(midBlendPose.body!.rot![2]).toBeCloseTo(5, 12);
    expect(c.poseAt(0.95).body!.pos).toEqual([0, -4, 0]);
  });

  it('过渡被打断：从过渡中的姿势再插', () => {
    const c = geckoLibController({ 名: 'm', transitionTicks: 20, schedule: [{ 秒: 0, clip: '坐' }, { 秒: 0.5, clip: '站' }], animations });
    // 0.5 秒时 body.pos 在 0 → −4 的一半（−2），再插到 +2
    expect(c.poseAt(0.5).body!.pos).toEqual([0, -2, 0]);
    expect(c.poseAt(1).body!.pos![1]).toBeCloseTo(0, 12);
    expect(c.poseAt(1.5).body!.pos).toEqual([0, 2, 0]);
  });

  it('队列：once 播完过渡到下一段；几遍、hold、等刻；一样的 RawAnimation 不重播；null 停', () => {
    const c = geckoLibController({
      名: 'm',
      transitionTicks: 0,
      schedule: [
        { 秒: 0, clip: [{ 名: '挥手', 循环: 2 }, { waitTicks: 10 }, { 名: '挥手', 循环: 'hold' }] },
        { 秒: 1, clip: [{ 名: '挥手', 循环: 2 }, { waitTicks: 10 }, { 名: '挥手', 循环: 'hold' }] },
        { 秒: 10, clip: null },
      ],
      animations,
    });
    expect(c.poseAt(1.5).arm!.rot![0]).toBeCloseTo(-60, 12); // 第二遍一半，没因为第 1 秒的同一个请求重播
    expect(c.poseAt(2.2)).toEqual({}); // 等 0.5 秒
    expect(c.poseAt(3).arm!.rot![0]).toBeCloseTo(-60, 12);
    expect(c.poseAt(9).arm!.rot![0]).toBeCloseTo(-90, 12); // hold 停在末帧
    expect(c.poseAt(10)).toEqual({});
  });

  it('几遍、等刻有过渡时同 GeckoLib 4：每遍之间过渡（thenPlayXTimes 是 n 段），等刻前也过渡', () => {
    const c = geckoLibController({
      名: 'm',
      transitionTicks: 10,
      schedule: [{ 秒: 0, clip: [{ 名: '挥手', 循环: 2 }, { waitTicks: 10 }, { 名: '挥手' }] }],
      animations,
    });
    // [0, 0.5) 过渡、[0.5, 1.5) 第 1 遍、[1.5, 2) 从末帧 −90 插回第 0 刻 −30、[2, 3) 第 2 遍
    expect(c.poseAt(1.75).arm!.rot![0]).toBeCloseTo(-60, 12);
    expect(c.poseAt(2.5).arm!.rot![0]).toBeCloseTo(-60, 12);
    // [3, 3.5) 过渡到等待（没骨骼）、[3.5, 4) 等 10 刻，再 [4, 4.5) 从原位过渡
    expect(c.poseAt(3.2)).toEqual({});
    expect(c.poseAt(3.7)).toEqual({});
    expect(c.poseAt(4.25).arm!.rot![0]).toBeCloseTo(-15, 12);
    // 0 遍不播
    expect(geckoLibController({ 名: 'm', transitionTicks: 0, schedule: [{ 秒: 0, clip: [{ 名: '挥手', 循环: 0 }] }], animations }).poseAt(0.5)).toEqual({});
  });

  it('速度：过渡和播放一起快', () => {
    const c = geckoLibController({ 名: 'm', transitionTicks: 10, 速度: 2, schedule: [{ 秒: 0, clip: '挥手' }], animations });
    expect(c.poseAt(0.125).arm!.rot![0]).toBeCloseTo(-15, 12);
    expect(c.poseAt(0.5).arm!.rot![0]).toBeCloseTo(-60, 12);
  });
});

describe('插姿势', () => {
  it('缺的通道按原位', () => {
    expect(lerpPose({ a: { scale: 0 } }, { a: { rot: [10, 0, 0] } }, 0.5)).toEqual({ a: { rot: [5, 0, 0], scale: [0.5, 0.5, 0.5] } });
  });
});
