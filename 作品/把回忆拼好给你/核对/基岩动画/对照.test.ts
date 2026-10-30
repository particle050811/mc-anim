// 对照：TLM 1.5.3 jar 里原样的 winefox_magical.main.animation.json 跑 engine/anim/基岩动画.ts（TLM 口径），
// 和库里照它手抄的魔法酒狐动作逐骨骼比（容差 1e-6）：坐姿、坐船、隐藏、法杖和环、摘帽耳朵、眨眼、表情、尾巴（弹簧稳态）。
// 动画、模型字节在数据根 store（资产 动画/角色/魔法酒狐、模型/角色/魔法酒狐，anim extract 魔法酒狐动画 导出）；没有就整组跳过。
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { 字节路径, 读资产锁 } from '../../../../pipeline/资产/资产锁.ts';
import { 取样动画, 取样骨骼, 播放到, 推进, 开始播放, 混合层, 解析动画文件, type 骨骼姿势, type 骨骼表, type 播放状态 } from '@engine/anim/基岩动画.ts';
import { magicalWineFoxBlink, magicalWineFoxBlinkBones, magicalWineFoxFace, magicalWineFoxTail } from '@库/角色/魔法酒狐动作.ts';
import { magicalWineFoxBoatBones } from '@库/角色/魔法酒狐坐船.ts';
import { magicalWineFoxBreath } from '@库/角色/魔法酒狐新动作.ts';
import { 尾巴稳态变量 } from './尾巴稳态.ts';

// 魔法酒狐.tsx 顶上 import 了模型和贴图资产（打包时由 webpack 内联），测试里换成 store 里的字节
const 读字节 = (id: string): Buffer | undefined => {
  const e = 读资产锁()[id];
  const f = e && 字节路径(e);
  return f && fs.existsSync(f) ? fs.readFileSync(f) : undefined;
};
vi.mock('asset:模型/角色/魔法酒狐', () => ({ default: JSON.parse(读字节('模型/角色/魔法酒狐')?.toString('utf8') ?? '{"texW":1,"texH":1,"bones":[]}') }));
vi.mock('asset:贴图/角色/魔法酒狐/百花', () => ({
  // 没有字节时给一张 1×1 透明 PNG，模块能加载就行（这组测试会跳过）
  default: `data:image/png;base64,${(读字节('贴图/角色/魔法酒狐/百花') ?? Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==', 'base64')).toString('base64')}`,
}));

const 动画字节 = 读字节('动画/角色/魔法酒狐');
const 模型字节 = 读字节('模型/角色/魔法酒狐');
const 容差 = 1e-6;

type 差 = string;
const 三 = (x: number | number[]): number[] => (typeof x === 'number' ? [x, x, x] : x);
// 一边没给这个通道时按原位算（手抄版不抄 position: [0, 0, 0] 这种原位值）
const 比向量 = (位置: string, 手: number[] | number | undefined, 播: number[] | number | undefined, 出: 差[], 原位 = 0) => {
  if (手 === undefined && 播 === undefined) return;
  手 ??= 原位;
  播 ??= 原位;
  const [a, b] = [三(手), 三(播)];
  if (a.some((x, i) => !(Math.abs(x - b[i]!) <= 容差))) 出.push(`${位置}：手抄 ${JSON.stringify(a)}，播放器 ${JSON.stringify(b)}`);
};
const 藏着 = (p: 骨骼姿势 | undefined) => p?.scale !== undefined && 三(p.scale).every((x) => x === 0);
const 比姿势 = (位置: string, 手: 骨骼姿势 | undefined, 播: 骨骼姿势 | undefined, 出: 差[]) => {
  比向量(`${位置}.scale`, 手?.scale, 播?.scale, 出, 1);
  if (藏着(手) && 藏着(播)) return; // 两边都缩成 0 看不见，转角、位置不用比（parallel5 还在转藏着的法阵）
  比向量(`${位置}.rot`, 手?.rot, 播?.rot, 出);
  比向量(`${位置}.pos`, 手?.pos, 播?.pos, 出);
};
const 是原位 = (p: 骨骼姿势) =>
  (!p.rot || p.rot.every((x) => x === 0)) && (!p.pos || p.pos.every((x) => x === 0)) && (p.scale === undefined || 三(p.scale).every((x) => x === 1));

// 采样时间：每帧（24 fps）30 秒，加一组不和关键帧对齐的
const 时刻们 = [...Array.from({ length: 24 * 30 + 1 }, (_, i) => i / 24), ...Array.from({ length: 400 }, (_, i) => i * 0.0731 + 0.003)];

describe.skipIf(!动画字节 || !模型字节)('魔法酒狐：播放器 × 手抄版', async () => {
  const 动画们 = 解析动画文件(JSON.parse(动画字节!.toString('utf8')));
  const 模型骨骼 = new Set((JSON.parse(模型字节!.toString('utf8')) as { bones: { name: string }[] }).bones.map((b) => b.name));
  const 帧 = (名: string, 秒: number, 外部: Record<string, number> = {}, 变量: Record<string, number | string> = {}) =>
    取样动画(动画们[名]!, 秒, { 环境: { 外部, 变量 } }).骨骼;
  const { magicalWineFoxSitBones, magicalWineFoxHidden, magicalWineFoxStaffBones, magicalWineFoxHatOffBones } = await import('@库/角色/魔法酒狐.tsx');

  /** 常量姿势表：手抄的每根骨骼逐通道相等；播放器多出来的只能是模型里没有的骨骼，或原位值（转 0、移 0、缩放 1） */
  const 比整表 = (名: string, 手: Readonly<骨骼表>, 播: 骨骼表) => {
    const 出: 差[] = [];
    for (const [骨, p] of Object.entries(手)) 比姿势(`${名}/${骨}`, p, 播[骨], 出);
    for (const [骨, p] of Object.entries(播)) {
      if (骨 in 手 || !模型骨骼.has(骨) || 是原位(p)) continue;
      出.push(`${名}/${骨}：播放器有、手抄没有 ${JSON.stringify(p)}`);
    }
    return 出;
  };

  it('坐姿 sit', () => {
    for (const t of [0, 1.5, 7]) expect(比整表('sit', magicalWineFoxSitBones, 帧('sit', t))).toEqual([]);
  });

  it('坐船 boat', () => {
    for (const t of [0, 2.25]) expect(比整表('boat', magicalWineFoxBoatBones, 帧('boat', t))).toEqual([]);
  });

  it('平时藏着的骨骼（pre_parallel0、1、3，戴头盔）', () => {
    const 头盔 = { 'ysm.has_helmet': 1 };
    const 合 = 混合层(['pre_parallel0', 'pre_parallel1', 'pre_parallel3'].map((n) => ({ 骨骼: 帧(n, 0.5, 头盔) })));
    const 藏 = Object.entries(合).filter(([骨, p]) => 模型骨骼.has(骨) && p.scale !== undefined && 三(p.scale).every((x) => x === 0)).map(([骨]) => 骨);
    expect(藏.sort()).toEqual(Object.keys(magicalWineFoxHidden).sort());
    expect(合.witchcap!.scale).toEqual([1, 1, 1]);
    expect(合.mofazhang2!.scale).toEqual([1, 1, 1]); // v.roaming.B 没有，按 0 算，显示
  });

  it('法杖浮动（pre_parallel1）、三个环（parallel5）', () => {
    const 出: 差[] = [];
    for (const t of 时刻们) {
      const 手 = magicalWineFoxStaffBones(t, '站');
      比姿势(`${t}/mofazhang2`, 手.mofazhang2, { pos: 帧('pre_parallel1', t).mofazhang2!.pos }, 出);
      const 环 = 帧('parallel5', t);
      for (const 骨 of ['ysmGlowquan10', 'ysmGlowquan12', 'ysmGlowquan14']) 比姿势(`${t}/${骨}`, 手[骨], 环[骨], 出);
    }
    expect(出).toEqual([]);
  });

  it('坐着时整套合成：TLM 控制器顺序 pre_parallel → main(sit) → parallel_，和组件的覆盖顺序一致', () => {
    const 出: 差[] = [];
    const 头盔 = { 'ysm.has_helmet': 1 };
    for (const t of 时刻们.filter((_, i) => i % 7 === 0)) {
      const 合 = 混合层([
        ...['pre_parallel0', 'pre_parallel1', 'pre_parallel3'].map((n) => ({ 骨骼: 帧(n, t, 头盔) })),
        { 骨骼: 帧('sit', t) },
        { 骨骼: 帧('parallel5', t), 模式: '叠加' as const },
      ]);
      const 手: 骨骼表 = { ...magicalWineFoxHidden, ...magicalWineFoxSitBones, ...magicalWineFoxStaffBones(t, '坐') };
      for (const [骨, p] of Object.entries(手)) 比姿势(`${t}/${骨}`, p, 合[骨], 出);
    }
    expect(出).toEqual([]);
  });

  it('摘了头盔：帽子藏、耳朵露，耳朵每 4 秒抖一下（pre_parallel0）', () => {
    const 出: 差[] = [];
    for (const t of 时刻们) {
      const 播 = 帧('pre_parallel0', t, { 'ysm.has_helmet': 0 });
      const 手 = magicalWineFoxHatOffBones(t);
      比姿势(`${t}/witchcap`, 手.witchcap, 播.witchcap, 出);
      expect(播.Ear!.scale).toEqual([1, 1, 1]);
      for (const 骨 of ['Left_ear', 'Right_ear']) 比姿势(`${t}/${骨}`, 手[骨], 播[骨], 出);
    }
    expect(出).toEqual([]);
  });

  it('眨眼（pre_parallel3，catmullrom）：手抄版把冲过头的部分夹在 [0, 1]', () => {
    const 出: 差[] = [];
    for (const t of 时刻们) {
      const 播 = 帧('pre_parallel3', t);
      const 眼皮 = 播.RightEyelid!.scale as number[];
      expect(播.LeftEyelid!.scale).toEqual(眼皮);
      // 眉毛关键帧正好是 −1.5 ×（1 − 眼皮），catmullrom 是仿射的，所以曲线上处处成立
      比向量(`${t}/眉毛=−1.5(1−眼皮)`, [0, -1.5 * (1 - 眼皮[1]!), 0], 播.RightEyebrow!.pos, 出);
      const 夹 = (x: number) => Math.min(1, Math.max(0, x));
      const 闭 = magicalWineFoxBlink(t);
      比向量(`${t}/眨眼`, [闭], [1 - 夹(眼皮[1]!)], 出);
      const 手 = magicalWineFoxBlinkBones(闭);
      比姿势(`${t}/RightEyelid`, 手.RightEyelid, { scale: [眼皮[0]!, 夹(眼皮[1]!), 眼皮[2]!] }, 出);
      比姿势(`${t}/LeftEyebrow`, 手.LeftEyebrow, { pos: [0, Math.max(-1.5, Math.min(0, 播.LeftEyebrow!.pos![1]!)), 0] }, 出);
    }
    expect(出).toEqual([]);
  });

  it('表情：微笑 sit、大笑 jump、惊讶 attacked、难过 idle 饿的分支', () => {
    const 出: 差[] = [];
    const 比 = (表情: Parameters<typeof magicalWineFoxFace>[0], 播: 骨骼表) => {
      for (const [骨, p] of Object.entries(magicalWineFoxFace(表情))) 比姿势(`${表情}/${骨}`, p, 播[骨] ?? { pos: [0, 0, 0] }, 出);
    };
    比('微笑', 帧('sit', 0));
    比('大笑', { ...帧('jump', 0.1), weixiao: { pos: [0, 0, 0] } }); // jump 没碰 weixiao；组件里表情层把它盖回 0
    比('惊讶', { ...帧('attacked', 0.1), weixiao: { pos: [0, 0, 0] } });
    比('难过', 帧('idle', 0.1, { 'ysm.food_level': 5 }));
    expect(出).toEqual([]);
    // 坑：kongju 的条件是 0.8+food_level<=6（+ 先算），food_level 正好 6 时嘴不推出来、眉毛照样耷拉
    const 饿6 = 帧('idle', 0.1, { 'ysm.food_level': 6 });
    expect(饿6.kongju!.pos).toEqual([0, 0, 0]);
    expect(饿6.EyeBrow!.pos).toEqual([0, -0.6, 0]);
  });

  it('站着的呼吸 UpBody（idle，线性）', () => {
    const 出: 差[] = [];
    for (const t of 时刻们) 比姿势(`${t}/UpBody`, magicalWineFoxBreath(t).UpBody, { rot: 帧('idle', t).UpBody!.rot }, 出);
    expect(出).toEqual([]);
  });

  // 尾巴：pre_parallel2 的目标是 molang2 里的正弦（变量 v.s、v.f 由 molang3 给），parallel3 的时间线给弹簧常数，parallel4 每步推 0.01 秒。
  // 手抄版用弹簧稳态解；这里从文件里求出常数和目标（尾巴稳态.ts），按稳态代回 pre_parallel2 的 Tail 表达式，再和手抄版比
  const 尾巴稳态 = (秒: number) => 取样骨骼(动画们.pre_parallel2!, 秒, { 环境: { 变量: 尾巴稳态变量(动画们, 秒) } });

  it('尾巴（pre_parallel2 + parallel3 + parallel4）：弹簧稳态和手抄版一致', () => {
    const 出: 差[] = [];
    for (const t of 时刻们.filter((_, i) => i % 5 === 0)) {
      const 播 = 尾巴稳态(t);
      for (const [骨, p] of Object.entries(magicalWineFoxTail(t, '站'))) 比姿势(`${t}/${骨}`, p, 播[骨], 出);
    }
    expect(出).toEqual([]);
  });

  it('尾巴：真按时间线一步步推弹簧（每步 0.01 秒），20 秒后贴近稳态（时间线、变量跨帧保留能跑通）', () => {
    const 变量: Record<string, number | string> = {};
    const 环境 = { 变量 };
    播放到(动画们.parallel3!, 0.5, 0.01, { 环境 });
    let 态: 播放状态 = 开始播放;
    let 骨骼: 骨骼表 = {};
    const 步数 = 2000;
    for (let i = 0; i <= 步数; i++) {
      骨骼 = 取样骨骼(动画们.pre_parallel2!, i * 0.01, { 环境 });
      态 = 推进(动画们.parallel4!, 态, 0.01, { 环境 });
    }
    const 稳 = 尾巴稳态(步数 * 0.01);
    for (const 骨 of ['Tail', 'Tail3', 'Tail5']) {
      const [a, b] = [骨骼[骨]!.rot!, 稳[骨]!.rot!];
      // 显式欧拉每步 0.01 秒（固有频率 2 Hz，一步 0.126 弧度），和解析稳态差不到 1°（Tail5 幅度约 25°）
      for (let j = 0; j < 3; j++) expect(Math.abs(a[j]! - b[j]!)).toBeLessThan(1);
    }
  });
});
