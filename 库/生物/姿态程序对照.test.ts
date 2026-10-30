// 自动翻译的姿态程序（资产 动作/角色/*，py/anim_py/动作翻译 从 1.20.1 客户端字节码翻的）和 库/生物 里照字节码手抄的版本在大量随机输入上对照。
// 手抄版不改；两边对不上的地方逐条列在「已知差别」里，是手抄版省掉的（翻译版照字节码全做了）。
// 数据根里没有这些资产（公开仓库、没跑 anim extract）时整组跳过。
import { describe, expect, it, vi } from 'vitest';
import type { EntityModelData } from '@engine/model/实体模型.tsx';
import { 姿态求值器, type 姿态程序 } from '@engine/anim/姿态程序.ts';

const 资 = vi.hoisted(() => {
  const 一像素 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const 读 = async (id: string): Promise<unknown> => {
    const fs = await import('node:fs');
    const { 读资产锁, 字节路径 } = await import('../../pipeline/资产/资产锁.ts');
    const e = 读资产锁()[id];
    if (!e || !fs.existsSync(字节路径(e))) return undefined;
    return JSON.parse(fs.readFileSync(字节路径(e), 'utf8'));
  };
  return { 一像素, 读 };
});
// asset: 只在打包时有：模型从数据根读，贴图换成 1×1（这里只比姿态）
vi.mock('asset:模型/角色/苦力怕', async () => ({ default: (await 资.读('模型/角色/苦力怕')) ?? { models: {} } }));
vi.mock('asset:贴图/角色/苦力怕', () => ({ default: 资.一像素 }));
vi.mock('asset:模型/角色/僵尸', async () => ({ default: (await 资.读('模型/角色/僵尸')) ?? { models: {} } }));
vi.mock('asset:贴图/角色/僵尸', () => ({ default: 资.一像素 }));

const { creeperParts } = await import('./苦力怕.tsx');
const { zombieParts } = await import('./僵尸.tsx');

const 模型 = async (id: string, 名: string) => ((await 资.读(id)) as { models: Record<string, EntityModelData> } | undefined)?.models[名];
const 程序 = async (id: string) => (await 资.读(id)) as 姿态程序 | undefined;

// mulberry32：固定种子，失败能复现
const 随机 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const 次数 = 3000;

const 苦力怕 = { 程序: await 程序('动作/角色/苦力怕'), 模型: await 模型('模型/角色/苦力怕', '苦力怕') };
describe.skipIf(!苦力怕.程序 || !苦力怕.模型)('苦力怕：翻译版 = 库/生物/苦力怕.tsx 手抄版', () => {
  it(`${次数} 组随机输入，头和四条腿的转角差不过 1e-3 弧度（手抄版用 double 和 Math.cos，原版是 float、查 Mth 的 65536 格表，limbSwing 大时差到 2e-4 上下）`, () => {
    const 求 = 姿态求值器(苦力怕.程序!, 苦力怕.模型!.root);
    const r = 随机(1);
    let 最大差 = 0;
    for (let n = 0; n < 次数; n++) {
      const p = { loc: [0, 0, 0] as [number, number, number], limbSwing: r() * 2000, stride: r(), headYaw: r() * 150 - 75, headPitch: r() * 180 - 90 };
      const 手 = creeperParts(p);
      // 手抄版的头偏、头仰和原版反号（见 苦力怕.tsx 的 CreeperPose）
      const { 姿态 } = 求({ limbSwing: p.limbSwing, limbSwingAmount: p.stride, ageInTicks: r() * 24000, netHeadYaw: -p.headYaw, headPitch: -p.headPitch });
      for (const [部件, 手姿] of Object.entries(手)) {
        for (let i = 0; i < 3; i++) {
          const 差 = Math.abs(手姿.rot![i] - 姿态[部件].rot[i]);
          最大差 = Math.max(最大差, 差);
          if (差 > 1e-3) expect.fail(`${部件}.rot[${i}] 差 ${差}，输入 ${JSON.stringify(p)}`);
        }
      }
    }
    expect(最大差).toBeGreaterThan(0); // 真比了
    console.log(`苦力怕最大转角差 ${最大差}`);
  });
});

const 僵尸 = { 程序: await 程序('动作/角色/僵尸'), 模型: await 模型('模型/角色/僵尸', '僵尸') };
describe.skipIf(!僵尸.程序 || !僵尸.模型)('僵尸：翻译版 = 库/生物/僵尸.tsx 手抄版（不骑乘、不蹲、不游泳、不鞘翅飞，右撇子主手出手）', () => {
  const 输入 = (p: { limbSwing: number; stride: number; headYaw: number; headPitch: number; aggressive: boolean; attackTime: number; sec: number }) => ({
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
  const 随机姿 = (r: () => number, 出手: boolean) => ({
    loc: [0, 0, 0] as [number, number, number],
    limbSwing: r() * 2000,
    stride: r(),
    headYaw: r() * 150 - 75,
    headPitch: r() * 180 - 90,
    aggressive: r() < 0.5,
    attackTime: 出手 ? r() : 0,
    sec: r() * 1200,
  });

  it(`${次数} 组随机输入（一半在出手），手抄版写到的转角全对上（差不过 1e-3 弧度）`, () => {
    const 求 = 姿态求值器(僵尸.程序!, 僵尸.模型!.root);
    const r = 随机(2);
    let 最大差 = 0;
    for (let n = 0; n < 次数; n++) {
      const p = 随机姿(r, n % 2 === 1);
      const 手 = zombieParts(p);
      const { 姿态 } = 求(输入(p));
      for (const [部件, 手姿] of Object.entries(手)) {
        for (let i = 0; i < 3; i++) {
          const 差 = Math.abs(手姿.rot![i] - 姿态[部件].rot[i]);
          最大差 = Math.max(最大差, 差);
          if (差 > 1e-3) expect.fail(`${部件}.rot[${i}] 差 ${差}，输入 ${JSON.stringify(p)}`);
        }
      }
    }
    expect(最大差).toBeGreaterThan(0);
    console.log(`僵尸最大转角差 ${最大差}`);
  });

  it('已知差别：手抄版省掉的部分（翻译版照 HumanoidModel 全做了）', () => {
    const 求 = 姿态求值器(僵尸.程序!, 僵尸.模型!.root);
    const 不出手 = 求(输入({ limbSwing: 3, stride: 0.5, headYaw: 10, headPitch: 5, aggressive: true, attackTime: 0, sec: 7 })).姿态;
    // 不蹲时 1.20.1 的 HumanoidModel 把腿放回 y=12、z=0（老版本是 z=0.1），和模型初始一样
    expect(不出手.right_leg.offset).toEqual([-1.9, 12, 0]);
    // 不出手时身子、手臂的位置和初始一样
    expect(不出手.body.rot[1]).toBe(0);
    expect(不出手.right_arm.offset).toEqual([-5, 2, 0]);
    // 出手时 setupAttackAnimation 让身子扭 sin(√t·2π)·0.2、两臂跟着绕身子挪（手抄版不扭、不挪；手臂转角之后被 animateZombieArms 整个盖掉，所以转角对得上）
    const 出手 = 求(输入({ limbSwing: 3, stride: 0.5, headYaw: 10, headPitch: 5, aggressive: true, attackTime: 0.3, sec: 7 })).姿态;
    const 扭 = Math.fround(Math.sin(Math.sqrt(0.3) * Math.PI * 2) * 0.2);
    expect(出手.body.rot[1]).toBeCloseTo(扭, 3);
    expect(出手.right_arm.offset[0]).toBeCloseTo(-Math.cos(扭) * 5, 3);
    expect(出手.right_arm.offset[2]).toBeCloseTo(Math.sin(扭) * 5, 3);
  });

  it('翻译版另有手抄版没有的输入：骑乘时两腿抬平', () => {
    const 求 = 姿态求值器(僵尸.程序!, 僵尸.模型!.root);
    const 骑 = 求({ ...输入({ limbSwing: 0, stride: 0, headYaw: 0, headPitch: 0, aggressive: false, attackTime: 0, sec: 0 }), 'model.riding': true }).姿态;
    expect(骑.right_leg.rot[0]).toBeCloseTo(-1.4137167, 6);
    expect(骑.right_leg.rot[1]).toBeCloseTo(Math.PI / 10, 6);
  });
});
