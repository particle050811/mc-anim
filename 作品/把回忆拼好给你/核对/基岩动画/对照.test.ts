// 对照：TLM 1.5.3 jar 里原样的 winefox_magical.main.animation.json 跑 engine/anim/基岩动画.ts（TLM 口径），
// 和库里照它手抄的魔法酒狐动作逐骨骼比（容差 1e-6，尾巴 1e-3 度：TLM 的 Molang 是 float）：坐姿、坐船、隐藏、法杖和环、摘帽耳朵、眨眼、表情、尾巴（弹簧稳态）。
// 动画、模型字节在数据根 store（资产 动画/角色/魔法酒狐、模型/角色/魔法酒狐，anim extract 魔法酒狐动画 导出）；没有就整组跳过。
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { bytesPath, readAssetLock } from '../../../../pipeline/资产/资产锁.ts';
import { sampleAnim, sampleSkeleton, playTo, advance, initialPlayState, blendLayers, parseAnimationFile, type SkeletonPose, type SkeletonTable, type PlayState } from '@engine/anim/基岩动画.ts';
import { magicalWineFoxBlink, magicalWineFoxBlinkBones, magicalWineFoxFace, magicalWineFoxTail } from '@库/角色/魔法酒狐动作.ts';
import { magicalWineFoxBoatBones } from '@库/角色/魔法酒狐坐船.ts';
import { magicalWineFoxBreath } from '@库/角色/魔法酒狐新动作.ts';
import { fps } from '../../分镜.ts';
import { tailSteadyVars } from './尾巴稳态.ts';

// 魔法酒狐.tsx 顶上 import 了模型和贴图资产（打包时由 webpack 内联），测试里换成 store 里的字节
const readBytes = (id: string): Buffer | undefined => {
  const e = readAssetLock()[id];
  const f = e && bytesPath(e);
  return f && fs.existsSync(f) ? fs.readFileSync(f) : undefined;
};
vi.mock('asset:模型/角色/魔法酒狐', () => ({ default: JSON.parse(readBytes('模型/角色/魔法酒狐')?.toString('utf8') ?? '{"texW":1,"texH":1,"bones":[]}') }));
vi.mock('asset:贴图/角色/魔法酒狐/百花', () => ({
  // 没有字节时给一张 1×1 透明 PNG，模块能加载就行（这组测试会跳过）
  default: `data:image/png;base64,${(readBytes('贴图/角色/魔法酒狐/百花') ?? Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==', 'base64')).toString('base64')}`,
}));

const animBytes = readBytes('动画/角色/魔法酒狐');
const modelBytes = readBytes('模型/角色/魔法酒狐');
const DEFAULT_TOLERANCE = 1e-6;
// 尾巴的 Molang 连算很多步、中间有几千度的角，TLM 口径按 mocha 的 float 算（engine/anim/Molang.ts），和手抄版（double）差到 1e-4 度量级
const tailTolerance = 1e-3;

type DiffMessage = string;
const toVec3 = (x: number | number[]): number[] => (typeof x === 'number' ? [x, x, x] : x);
// 一边没给这个通道时按原位算（手抄版不抄 position: [0, 0, 0] 这种原位值）
const compareVec = (posLabel: string, manual: number[] | number | undefined, played: number[] | number | undefined, diffs: DiffMessage[], restValue = 0, tolerance = DEFAULT_TOLERANCE) => {
  if (manual === undefined && played === undefined) return;
  manual ??= restValue;
  played ??= restValue;
  const [a, b] = [toVec3(manual), toVec3(played)];
  if (a.some((x, i) => !(Math.abs(x - b[i]!) <= tolerance))) diffs.push(`${posLabel}：手抄 ${JSON.stringify(a)}，播放器 ${JSON.stringify(b)}`);
};
const isHidden = (p: SkeletonPose | undefined) => p?.scale !== undefined && toVec3(p.scale).every((x) => x === 0);
const comparePose = (posLabel: string, manual: SkeletonPose | undefined, played: SkeletonPose | undefined, diffs: DiffMessage[], tolerance = DEFAULT_TOLERANCE) => {
  compareVec(`${posLabel}.scale`, manual?.scale, played?.scale, diffs, 1, tolerance);
  if (isHidden(manual) && isHidden(played)) return; // 两边都缩成 0 看不见，转角、位置不用比（parallel5 还在转藏着的法阵）
  compareVec(`${posLabel}.rot`, manual?.rot, played?.rot, diffs, 0, tolerance);
  compareVec(`${posLabel}.pos`, manual?.pos, played?.pos, diffs, 0, tolerance);
};
const isRestPose = (p: SkeletonPose) =>
  (!p.rot || p.rot.every((x) => x === 0)) && (!p.pos || p.pos.every((x) => x === 0)) && (p.scale === undefined || toVec3(p.scale).every((x) => x === 1));

// 采样时间：本作品每帧（分镜.ts 的 fps）30 秒，加一组不和关键帧对齐的
const times = [...Array.from({ length: fps * 30 + 1 }, (_, i) => i / fps), ...Array.from({ length: 400 }, (_, i) => i * 0.0731 + 0.003)];

describe.skipIf(!animBytes || !modelBytes)('魔法酒狐：播放器 × 手抄版', async () => {
  const animations = parseAnimationFile(JSON.parse(animBytes!.toString('utf8')), 'TLM');
  const modelSkeleton = new Set((JSON.parse(modelBytes!.toString('utf8')) as { bones: { name: string }[] }).bones.map((b) => b.name));
  const frameAt = (animName: string, sec: number, external: Record<string, number> = {}, variables: Record<string, number | string> = {}) =>
    sampleAnim(animations[animName]!, sec, { env: { external, 变量: variables }, 口径: 'TLM' }).skeleton;
  const { magicalWineFoxSitBones, magicalWineFoxHidden, magicalWineFoxStaffBones, magicalWineFoxHatOffBones } = await import('@库/角色/魔法酒狐.tsx');

  /** 常量姿势表：手抄的每根骨骼逐通道相等；播放器多出来的只能是模型里没有的骨骼，或原位值（转 0、移 0、缩放 1） */
  const compareTable = (name: string, manual: Readonly<SkeletonTable>, played: SkeletonTable) => {
    const diffs: DiffMessage[] = [];
    for (const [boneName, p] of Object.entries(manual)) comparePose(`${name}/${boneName}`, p, played[boneName], diffs);
    for (const [boneName, p] of Object.entries(played)) {
      if (boneName in manual || !modelSkeleton.has(boneName) || isRestPose(p)) continue;
      diffs.push(`${name}/${boneName}：播放器有、手抄没有 ${JSON.stringify(p)}`);
    }
    return diffs;
  };

  it('坐姿 sit', () => {
    for (const t of [0, 1.5, 7]) expect(compareTable('sit', magicalWineFoxSitBones, frameAt('sit', t))).toEqual([]);
  });

  it('坐船 boat', () => {
    for (const t of [0, 2.25]) expect(compareTable('boat', magicalWineFoxBoatBones, frameAt('boat', t))).toEqual([]);
  });

  it('平时藏着的骨骼（pre_parallel0、1、3，戴头盔）', () => {
    const helmet = { 'ysm.has_helmet': 1 };
    const combined = blendLayers(['pre_parallel0', 'pre_parallel1', 'pre_parallel3'].map((n) => ({ skeleton: frameAt(n, 0.5, helmet) })), 'TLM');
    const hiddenBones = Object.entries(combined).filter(([boneName, p]) => modelSkeleton.has(boneName) && p.scale !== undefined && toVec3(p.scale).every((x) => x === 0)).map(([boneName]) => boneName);
    expect(hiddenBones.sort()).toEqual(Object.keys(magicalWineFoxHidden).sort());
    expect(combined.witchcap!.scale).toEqual([1, 1, 1]);
    expect(combined.mofazhang2!.scale).toEqual([1, 1, 1]); // v.roaming.B 没有，按 0 算，显示
  });

  it('法杖浮动（pre_parallel1）、三个环（parallel5）', () => {
    const diffs: DiffMessage[] = [];
    for (const t of times) {
      const staffHand = magicalWineFoxStaffBones(t, '站');
      comparePose(`${t}/mofazhang2`, staffHand.mofazhang2, { pos: frameAt('pre_parallel1', t).mofazhang2!.pos }, diffs);
      const parallelPose = frameAt('parallel5', t);
      for (const boneName of ['ysmGlowquan10', 'ysmGlowquan12', 'ysmGlowquan14']) comparePose(`${t}/${boneName}`, staffHand[boneName], parallelPose[boneName], diffs);
    }
    expect(diffs).toEqual([]);
  });

  it('坐着时整套合成：TLM 控制器顺序 pre_parallel → main(sit) → parallel_，和组件的覆盖顺序一致', () => {
    const diffs: DiffMessage[] = [];
    const helmet = { 'ysm.has_helmet': 1 };
    for (const t of times.filter((_, i) => i % 7 === 0)) {
      const combined = blendLayers([
        ...['pre_parallel0', 'pre_parallel1', 'pre_parallel3'].map((n) => ({ skeleton: frameAt(n, t, helmet) })),
        { skeleton: frameAt('sit', t) },
        { skeleton: frameAt('parallel5', t), blendMode: '叠加' as const },
      ], 'TLM');
      const poseBones: SkeletonTable = { ...magicalWineFoxHidden, ...magicalWineFoxSitBones, ...magicalWineFoxStaffBones(t, '坐') };
      for (const [boneName, p] of Object.entries(poseBones)) comparePose(`${t}/${boneName}`, p, combined[boneName], diffs);
    }
    expect(diffs).toEqual([]);
  });

  it('摘了头盔：帽子藏、耳朵露，耳朵每 4 秒抖一下（pre_parallel0）', () => {
    const diffs: DiffMessage[] = [];
    for (const t of times) {
      const played = frameAt('pre_parallel0', t, { 'ysm.has_helmet': 0 });
      const hatOffBones = magicalWineFoxHatOffBones(t);
      comparePose(`${t}/witchcap`, hatOffBones.witchcap, played.witchcap, diffs);
      expect(played.Ear!.scale).toEqual([1, 1, 1]);
      for (const boneName of ['Left_ear', 'Right_ear']) comparePose(`${t}/${boneName}`, hatOffBones[boneName], played[boneName], diffs);
    }
    expect(diffs).toEqual([]);
  });

  it('眨眼（pre_parallel3，catmullrom）：手抄版把冲过头的部分夹在 [0, 1]', () => {
    const diffs: DiffMessage[] = [];
    for (const t of times) {
      const played = frameAt('pre_parallel3', t);
      const eyelid = played.RightEyelid!.scale as number[];
      expect(played.LeftEyelid!.scale).toEqual(eyelid);
      // 眉毛关键帧正好是 −1.5 ×（1 − 眼皮），catmullrom 是仿射的，所以曲线上处处成立
      compareVec(`${t}/眉毛=−1.5(1−眼皮)`, [0, -1.5 * (1 - eyelid[1]!), 0], played.RightEyebrow!.pos, diffs);
      const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
      const blink = magicalWineFoxBlink(t);
      compareVec(`${t}/眨眼`, [blink], [1 - clamp01(eyelid[1]!)], diffs);
      const blinkBones = magicalWineFoxBlinkBones(blink);
      comparePose(`${t}/RightEyelid`, blinkBones.RightEyelid, { scale: [eyelid[0]!, clamp01(eyelid[1]!), eyelid[2]!] }, diffs);
      comparePose(`${t}/LeftEyebrow`, blinkBones.LeftEyebrow, { pos: [0, Math.max(-1.5, Math.min(0, played.LeftEyebrow!.pos![1]!)), 0] }, diffs);
    }
    expect(diffs).toEqual([]);
  });

  it('表情：微笑 sit、大笑 jump、惊讶 attacked、难过 idle 饿的分支', () => {
    const diffs: DiffMessage[] = [];
    const compareFace = (expression: Parameters<typeof magicalWineFoxFace>[0], played: SkeletonTable) => {
      for (const [boneName, p] of Object.entries(magicalWineFoxFace(expression))) comparePose(`${expression}/${boneName}`, p, played[boneName] ?? { pos: [0, 0, 0] }, diffs);
    };
    compareFace('微笑', frameAt('sit', 0));
    compareFace('大笑', { ...frameAt('jump', 0.1), weixiao: { pos: [0, 0, 0] } }); // jump 没碰 weixiao；组件里表情层把它盖回 0
    compareFace('惊讶', { ...frameAt('attacked', 0.1), weixiao: { pos: [0, 0, 0] } });
    compareFace('难过', frameAt('idle', 0.1, { 'ysm.food_level': 5 }));
    expect(diffs).toEqual([]);
    // 坑：kongju 的条件是 0.8+food_level<=6（+ 先算），food_level 正好 6 时嘴不推出来、眉毛照样耷拉
    const foodLevel6 = frameAt('idle', 0.1, { 'ysm.food_level': 6 });
    expect(foodLevel6.kongju!.pos).toEqual([0, 0, 0]);
    expect(foodLevel6.EyeBrow!.pos).toEqual([0, Math.fround(-0.6), 0]); // 值是 Molang 三元式，按 float 算
  });

  it('站着的呼吸 UpBody（idle，线性）', () => {
    const diffs: DiffMessage[] = [];
    for (const t of times) comparePose(`${t}/UpBody`, magicalWineFoxBreath(t).UpBody, { rot: frameAt('idle', t).UpBody!.rot }, diffs);
    expect(diffs).toEqual([]);
  });

  // 尾巴：pre_parallel2 的目标是 molang2 里的正弦（变量 v.s、v.f 由 molang3 给），parallel3 的时间线给弹簧常数，parallel4 每步推 0.01 秒。
  // 手抄版用弹簧稳态解；这里从文件里求出常数和目标（尾巴稳态.ts），按稳态代回 pre_parallel2 的 Tail 表达式，再和手抄版比
  const tailSteadyState = (sec: number) => sampleSkeleton(animations.pre_parallel2!, sec, { env: { 变量: tailSteadyVars(animations, sec) }, 口径: 'TLM' });

  it('尾巴（pre_parallel2 + parallel3 + parallel4）：弹簧稳态和手抄版一致', () => {
    const diffs: DiffMessage[] = [];
    for (const t of times.filter((_, i) => i % 5 === 0)) {
      const played = tailSteadyState(t);
      for (const [boneName, p] of Object.entries(magicalWineFoxTail(t, '站'))) comparePose(`${t}/${boneName}`, p, played[boneName], diffs, tailTolerance);
    }
    expect(diffs).toEqual([]);
  });

  it('尾巴：真按时间线一步步推弹簧（每步 0.01 秒），20 秒后贴近稳态（时间线、变量跨帧保留能跑通）', () => {
    const variables: Record<string, number | string> = {};
    const options = { env: { 变量: variables }, 口径: 'TLM' } as const;
    playTo(animations.parallel3!, 0.5, 0.01, options);
    let playState: PlayState = initialPlayState;
    let skeleton: SkeletonTable = {};
    const stepCount = 2000;
    for (let i = 0; i <= stepCount; i++) {
      skeleton = sampleSkeleton(animations.pre_parallel2!, i * 0.01, options);
      playState = advance(animations.parallel4!, playState, 0.01, options);
    }
    const steadyTail = tailSteadyState(stepCount * 0.01);
    for (const boneName of ['Tail', 'Tail3', 'Tail5']) {
      const [a, b] = [skeleton[boneName]!.rot!, steadyTail[boneName]!.rot!];
      // 显式欧拉每步 0.01 秒（固有频率 2 Hz，一步 0.126 弧度），和解析稳态差不到 1°（Tail5 幅度约 25°）
      for (let j = 0; j < 3; j++) expect(Math.abs(a[j]! - b[j]!)).toBeLessThan(1);
    }
  });
});
