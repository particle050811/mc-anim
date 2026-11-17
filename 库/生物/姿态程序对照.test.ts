// 自动翻译的姿态程序（资产 动作/角色/*，py/anim_py/动作翻译 从 1.20.1 客户端字节码翻的）和 库/生物 里照字节码手抄的版本在大量随机输入上对照。
// 手抄版不改；两边对不上的地方逐条列在「已知差别」里，是手抄版省掉的（翻译版照字节码全做了）。
// 资产字节由 vitest 按资产锁读（pipeline/资产/vitest插件.ts），数据根里没有（公开仓库、没跑 anim extract）时导入就报缺哪个资产。
import { describe, expect, it } from 'vitest';
import type { EntityModelData } from '@engine/model/实体模型.tsx';
import { poseEvaluator, type PoseProgram } from '@engine/anim/姿态程序.ts';
import creeperProgramRaw from 'asset:动作/角色/苦力怕';
import creeperModelRaw from 'asset:模型/角色/苦力怕';
import zombieProgramRaw from 'asset:动作/角色/僵尸';
import zombieModelRaw from 'asset:模型/角色/僵尸';
import { creeperParts } from './苦力怕.tsx';
import { zombieParts } from './僵尸.tsx';

const loadModel = (raw: unknown, modelName: string) => (raw as { models: Record<string, EntityModelData> }).models[modelName]!;

// mulberry32：固定种子，失败能复现
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const trials = 3000;

const creeper = { program: creeperProgramRaw as unknown as PoseProgram, model: loadModel(creeperModelRaw, '苦力怕') };
describe('苦力怕：翻译版 = 库/生物/苦力怕.tsx 手抄版', () => {
  it(`${trials} 组随机输入，头和四条腿的转角差不过 1e-3 弧度（手抄版用 double 和 Math.cos，原版是 float、查 Mth 的 65536 格表，limbSwing 大时差到 2e-4 上下）`, () => {
    const solve = poseEvaluator(creeper.program, creeper.model.root);
    const r = rng(1);
    let maxDiff = 0;
    for (let n = 0; n < trials; n++) {
      const p = { loc: [0, 0, 0] as [number, number, number], limbSwing: r() * 2000, stride: r(), headYaw: r() * 150 - 75, headPitch: r() * 180 - 90 };
      const expectedParts = creeperParts(p);
      // 手抄版的头偏、头仰和原版反号（见 苦力怕.tsx 的 CreeperPose）
      const { partPoses } = solve({ limbSwing: p.limbSwing, limbSwingAmount: p.stride, ageInTicks: r() * 24000, netHeadYaw: -p.headYaw, headPitch: -p.headPitch });
      for (const [partName, handPose] of Object.entries(expectedParts)) {
        for (let i = 0; i < 3; i++) {
          const absDiff = Math.abs(handPose.rot![i] - partPoses[partName].rot[i]);
          maxDiff = Math.max(maxDiff, absDiff);
          if (absDiff > 1e-3) expect.fail(`${partName}.rot[${i}] 差 ${absDiff}，输入 ${JSON.stringify(p)}`);
        }
      }
    }
    expect(maxDiff).toBeGreaterThan(0); // 真比了
    console.log(`苦力怕最大转角差 ${maxDiff}`);
  });
});

const zombie = { program: zombieProgramRaw as unknown as PoseProgram, model: loadModel(zombieModelRaw, '僵尸') };
describe('僵尸：翻译版 = 库/生物/僵尸.tsx 手抄版（不骑乘、不蹲、不游泳、不鞘翅飞，右撇子主手出手）', () => {
  const makeInput = (p: { limbSwing: number; stride: number; headYaw: number; headPitch: number; aggressive: boolean; attackTime: number; sec: number }) => ({
    limbSwing: p.limbSwing,
    limbSwingAmount: p.stride,
    ageInTicks: p.sec * 20,
    netHeadYaw: -p.headYaw,
    headPitch: -p.headPitch,
    'entity.isAggressive()': p.aggressive,
    'model.attackTime': p.attackTime,
    'entity.getMainArm()': 'RIGHT',
    'entity.swingingArm': 'MAIN_HAND',
  });
  const randomPose = (r: () => number, attacking: boolean) => ({
    loc: [0, 0, 0] as [number, number, number],
    limbSwing: r() * 2000,
    stride: r(),
    headYaw: r() * 150 - 75,
    headPitch: r() * 180 - 90,
    aggressive: r() < 0.5,
    attackTime: attacking ? r() : 0,
    sec: r() * 1200,
  });

  it(`${trials} 组随机输入（一半在出手），手抄版写到的转角全对上（差不过 1e-3 弧度）`, () => {
    const solve = poseEvaluator(zombie.program, zombie.model.root);
    const r = rng(2);
    let maxDiff = 0;
    for (let n = 0; n < trials; n++) {
      const p = randomPose(r, n % 2 === 1);
      const expectedParts = zombieParts(p);
      const { partPoses } = solve(makeInput(p));
      for (const [partName, handPose] of Object.entries(expectedParts)) {
        for (let i = 0; i < 3; i++) {
          const absDiff = Math.abs(handPose.rot![i] - partPoses[partName].rot[i]);
          maxDiff = Math.max(maxDiff, absDiff);
          if (absDiff > 1e-3) expect.fail(`${partName}.rot[${i}] 差 ${absDiff}，输入 ${JSON.stringify(p)}`);
        }
      }
    }
    expect(maxDiff).toBeGreaterThan(0);
    console.log(`僵尸最大转角差 ${maxDiff}`);
  });

  it('已知差别：手抄版省掉的部分（翻译版照 HumanoidModel 全做了）', () => {
    const solve = poseEvaluator(zombie.program, zombie.model.root);
    const noAttack = solve(makeInput({ limbSwing: 3, stride: 0.5, headYaw: 10, headPitch: 5, aggressive: true, attackTime: 0, sec: 7 })).partPoses;
    // 不蹲时 1.20.1 的 HumanoidModel 把腿放回 y=12、z=0（老版本是 z=0.1），和模型初始一样
    expect(noAttack.right_leg.offset).toEqual([-1.9, 12, 0]);
    // 不出手时身子、手臂的位置和初始一样
    expect(noAttack.body.rot[1]).toBe(0);
    expect(noAttack.right_arm.offset).toEqual([-5, 2, 0]);
    // 出手时 setupAttackAnimation 让身子扭 sin(√t·2π)·0.2、两臂跟着绕身子挪（手抄版不扭、不挪；手臂转角之后被 animateZombieArms 整个盖掉，所以转角对得上）
    const swingPose = solve(makeInput({ limbSwing: 3, stride: 0.5, headYaw: 10, headPitch: 5, aggressive: true, attackTime: 0.3, sec: 7 })).partPoses;
    const twist = Math.fround(Math.sin(Math.sqrt(0.3) * Math.PI * 2) * 0.2);
    expect(swingPose.body.rot[1]).toBeCloseTo(twist, 3);
    expect(swingPose.right_arm.offset[0]).toBeCloseTo(-Math.cos(twist) * 5, 3);
    expect(swingPose.right_arm.offset[2]).toBeCloseTo(Math.sin(twist) * 5, 3);
  });

  it('翻译版另有手抄版没有的输入：骑乘时两腿抬平', () => {
    const solve = poseEvaluator(zombie.program, zombie.model.root);
    const ride = solve({ ...makeInput({ limbSwing: 0, stride: 0, headYaw: 0, headPitch: 0, aggressive: false, attackTime: 0, sec: 0 }), 'model.riding': true }).partPoses;
    expect(ride.right_leg.rot[0]).toBeCloseTo(-1.4137167, 6);
    expect(ride.right_leg.rot[1]).toBeCloseTo(Math.PI / 10, 6);
  });
});
