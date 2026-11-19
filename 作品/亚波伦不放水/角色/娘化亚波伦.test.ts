// 娘化亚波伦的声明：层、环境、眨眼、头发弹簧、贴图变体。字节在数据根 store（作品资产锁，anim extract 娘化亚波伦模型、娘化亚波伦动画 入的库），vitest 按资产锁读（pipeline/资产/vitest插件.ts）。
import { describe, expect, it } from 'vitest';
import { animationPose } from '@engine/model/基岩实体.tsx';
import type { BedrockBone } from '@engine/model/基岩模型.tsx';
import modelRaw from 'asset:模型/角色/娘化亚波伦';
import { defineAct, GirlYaBoLunCreature, outlineFace, packCreature, stand, staticEnv, type YaBoLunAct } from './娘化亚波伦.tsx';

const modelBones = (modelRaw as unknown as { bones: BedrockBone[] }).bones;

const poseAt = (act: YaBoLunAct, sec: number, unresolved?: Set<string>) => {
  const e = act.env(sec);
  return animationPose(
    {
      file: GirlYaBoLunCreature.animationFiles!,
      layers: act.layers(sec),
      口径: '通用',
      env: { query: { ...staticEnv.query, ...e.query }, external: { ...staticEnv.external, ...e.external }, functions: { 'ysm.second_order': act.secondOrderAt(sec) }, unresolved },
    },
    sec,
  );
};
// 第 1 秒起水平速度从 0 跳到 20
const forwardFlySetup = { 主: () => [{ name: 'fly' }], env: (sec: number) => ({ query: { ground_speed: sec >= 1 ? 20 : 0 } }) };

describe('娘化亚波伦', () => {
  it('动画文件：main 50 段加 extra 8 段', () => {
    const animNames = Object.keys(GirlYaBoLunCreature.animationFiles!);
    expect(animNames.length).toBe(58);
    for (const n of ['idle', 'fly', 'attacked', 'pre_parallel0', 'parallel0', 'extra0', 'extra7']) expect(animNames).toContain(n);
  });

  it('站着、悬停、受击用到的查询和 ysm.* 都给了值', () => {
    const unresolved = new Set<string>();
    for (const clipName of ['idle', 'fly', 'attacked']) poseAt(defineAct({ 主: () => [{ name: clipName }] }), 0.3, unresolved);
    // 剩下的是包自己没赋值的变量（v.hv、v.hg、v.bg 全包没有一处赋值；v.bv 只有 idle、walk 这些赋），按 0 算
    expect([...unresolved].sort()).toEqual(['v.bg', 'v.bv', 'v.hg', 'v.hv']);
  });

  it('D 版眨眼：闭合时眼白不翻面，缩薄的上睫线落约一像素；随后完全睁开', () => {
    const eyelidPose = poseAt(stand, 0.15);
    expect((eyelidPose.LeftEyelid!.scale as number[])[1]).toBe(0);
    expect(eyelidPose.RightEyebrow!.pos![1]).toBeCloseTo(-1.01);
    expect((eyelidPose.RightEyebrow!.scale as number[])[1]).toBeCloseTo(.48);
    expect(poseAt(stand, 1).LeftEyelid!.scale).toEqual([1, 1, 1]);
  });

  it('站着不动：头发的弹簧一直是 0', () => {
    for (const sec of [0, 0.5, 7.3]) expect(poseAt(stand, sec).MLongHair!.rot).toEqual([0, 0, 0]);
  });

  it('前飞：头发从 0 甩过头再停到 20 度，稳态直接到 20；取帧顺序不影响结果', () => {
    const pushPerformance = defineAct(forwardFlySetup);
    const hairRot = (act: YaBoLunAct, sec: number) => poseAt(act, sec).MLongHair!.rot![0]!;
    const laterHair = hairRot(pushPerformance, 4);
    expect(hairRot(pushPerformance, 0.9)).toBe(0);
    const midWalk = hairRot(pushPerformance, 1.1);
    expect(midWalk).toBeGreaterThan(0);
    expect(midWalk).toBeLessThan(20);
    expect(Math.max(...[1.2, 1.3, 1.4, 1.5].map((t) => hairRot(pushPerformance, t)))).toBeGreaterThan(20);
    expect(laterHair).toBeCloseTo(20, 2);
    expect(hairRot(pushPerformance, 4)).toBe(laterHair);
    expect(hairRot(defineAct(forwardFlySetup), 1.1)).toBe(midWalk);
    expect(hairRot(defineAct({ ...forwardFlySetup, springMode: '稳态' }), 1.1)).toBe(20);
  });

  it('贴图变体：面纱、漩涡光环「加」只动那两块 UV', () => {
    const originalTexture = GirlYaBoLunCreature.getModel({}).texture;
    const addVariant = GirlYaBoLunCreature.getModel({ veil: '加', vortexHalo: '加' }).texture;
    const isTransparent = (image: typeof originalTexture, x: number, y: number) => image.px[(y * image.w + x) * 4 + 3] === 0;
    let veilCount = 0;
    let vortexCount = 0;
    for (let y = 0; y < originalTexture.h; y++)
      for (let x = 0; x < originalTexture.w; x++) {
        const i = (y * originalTexture.w + x) * 4;
        const changed = [0, 1, 2, 3].some((c) => originalTexture.px[i + c] !== addVariant.px[i + c]);
        if (!changed) continue;
        expect(isTransparent(originalTexture, x, y)).toBe(true); // default 上这两块本来是空的，没盖掉原有的像素
        if (x >= 218 && x < 241 && y >= 339 && y < 372) veilCount++;
        else if (x >= 192 && x < 256 && y < 64) vortexCount++;
        else throw new Error(`块外的像素变了：${x},${y}`);
      }
    expect(veilCount).toBeGreaterThan(100);
    expect(vortexCount).toBeGreaterThan(100);
  });
  it('原包外观保留蜘蛛腿、头后环，浮块（用户 11-10 定不留）在原包和正片中都隐藏', () => {
    const model = packCreature.getModel({});
    const originalBones = modelBones;
    const currentBone = (boneName: string) => model.bones.find((b) => b.name === boneName)!;
    for (let n = 54; n <= 61; n++) {
      expect(originalBones.find((b) => b.name === `ysmGlowbone${n}`)!.cubes!.length).toBe(7);
      expect(currentBone(`ysmGlowbone${n}`).cubes).toEqual([]);
      expect(GirlYaBoLunCreature.getModel().bones.find(bone => bone.name === `ysmGlowbone${n}`)!.cubes).toEqual([]);
    }
    // c1、c2 是两组蜘蛛腿的根，ysmGlowbone24 是头后大光环
    const subtree = (rootName: string): BedrockBone[] => [originalBones.find((b) => b.name === rootName)!, ...originalBones.filter((b) => b.parent === rootName).flatMap((b) => subtree(b.name))];
    const kept = [...subtree('c1'), ...subtree('c2'), ...subtree('ysmGlowbone24')];
    expect(kept.reduce((n, b) => n + (b.cubes?.length ?? 0), 0)).toBeGreaterThan(20);
    for (const b of kept) expect(currentBone(b.name).cubes).toEqual(b.cubes);
  });

  it('描边片（all_cutout 的面剔除）：缺口环的零厚度片从模型里拿掉，另画的每一面都朝着芯，白边', () => {
    const model = GirlYaBoLunCreature.getModel({});
    const originalBones = modelBones.filter((b) => /^ysmGlowbone17[2-9]$/.test(b.name));
    expect(originalBones.length).toBe(8);
    for (const bone of originalBones) {
      const cubes = model.bones.find((b) => b.name === bone.name)!.cubes!;
      expect(cubes.length).toBe(1);
      expect(cubes[0]!.size.every((v) => v > 0)).toBe(true);
      // 芯的中心（骨骼坐标，X 取负）
      const coreCube = cubes[0]!;
      const center = [-(coreCube.origin[0] + coreCube.size[0] / 2) + bone.pivot[0], coreCube.origin[1] + coreCube.size[1] / 2 - bone.pivot[1], coreCube.origin[2] + coreCube.size[2] / 2 - bone.pivot[2]];
      const outlineFaces = outlineFace(bone, model.texture);
      // 每段四面，两个缺口端头（176、178）多一面
      expect(outlineFaces.length).toBe(bone.name.endsWith('176') || bone.name.endsWith('178') ? 5 : 4);
      for (const f of outlineFaces) {
        expect(f.色).toEqual([255, 255, 255]);
        const [a, b, , d] = f.angle;
        const e1 = [d![0] - a![0], d![1] - a![1], d![2] - a![2]];
        const e2 = [b![0] - a![0], b![1] - a![1], b![2] - a![2]];
        const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
        const toCenter = [center[0]! - a![0], center[1]! - a![1], center[2]! - a![2]];
        expect(n[0]! * toCenter[0]! + n[1]! * toCenter[1]! + n[2]! * toCenter[2]!).toBeGreaterThan(0);
      }
    }
  });
});
