import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { geckoLibController } from '../anim/动画控制器.ts';
import { parseAnimationFile } from '../anim/基岩动画.ts';
import { animationPose, splitByGlow, swapModelMaterial } from './基岩实体.tsx';
import type { BedrockModel } from './基岩模型.tsx';

const blockCube = { origin: [0, 0, 0] as [number, number, number], size: [1, 1, 1] as [number, number, number], uv: [0, 0] as [number, number] };
const bedrockModel: BedrockModel = {
  texW: 16,
  texH: 16,
  texture: { w: 1, h: 1, px: new Uint8Array(4) },
  bones: [
    { name: 'root', pivot: [0, 0, 0], cubes: [blockCube] },
    { name: 'head', parent: 'root', pivot: [0, 8, 0], cubes: [blockCube] },
    { name: 'ysmGlowEye', parent: 'head', pivot: [0, 9, 0], cubes: [blockCube] },
    { name: 'eyeDot', parent: 'ysmGlowEye', pivot: [0, 9, 0], cubes: [blockCube] },
  ],
};

describe('按发光拆分', () => {
  it('主体去掉发光骨骼的方块；发光份只留发光方块和祖先骨骼（不往子骨骼传）', () => {
    const { bodyPart, glowModel } = splitByGlow(bedrockModel);
    expect(bodyPart.bones.map((b) => [b.name, !!b.cubes])).toEqual([['root', true], ['head', true], ['ysmGlowEye', false], ['eyeDot', true]]);
    expect(glowModel!.bones.map((b) => [b.name, !!b.cubes])).toEqual([['root', false], ['head', false], ['ysmGlowEye', true]]);
    expect(splitByGlow(bedrockModel)).toBe(splitByGlow(bedrockModel));
  });

  it('没有发光方块时不拆', () => {
    const isGlow = () => false;
    expect(splitByGlow(bedrockModel, isGlow)).toEqual({ bodyPart: bedrockModel, glowModel: null });
  });
});

describe('动画姿势', () => {
  const animFile = parseAnimationFile({
    animations: {
      走: { loop: true, animation_length: 2, bones: { head: { rotation: { '0': [0, 0, 0], '2': [20, 0, 0] } } } },
      点头: { loop: true, bones: { head: { rotation: [5, 0, 0] } } },
    },
  });

  it('按层顺序取样、混合；各层可以有自己的时钟', () => {
    expect(animationPose({ file: animFile, layers: [{ name: '走' }] }, 1).head!.rot).toEqual([10, 0, 0]);
    expect(animationPose({ file: animFile, layers: [{ name: '走' }, { name: '点头', blendMode: '叠加' }] }, 1).head!.rot).toEqual([15, 0, 0]);
    expect(animationPose({ file: animFile, layers: [{ name: '走', sec: 0.5 }] }, 1).head!.rot).toEqual([5, 0, 0]);
  });

  it('动画名拼错直接报错', () => {
    expect(() => animationPose({ file: animFile, layers: [{ name: '跑' }] }, 0)).toThrow(/没有 跑/);
  });

  it('没给变量表时每帧一张新表：通道里的赋值不报错，后面的层读得到；q.life_time 默认是 秒', () => {
    const script = parseAnimationFile({
      animations: {
        算: { loop: true, bones: { head: { position: ['v.h = 3; return v.h;', 'q.life_time', 0] } } },
        读: { loop: true, bones: { body: { position: ['v.h * 2', 0, 0] } } },
      },
    });
    const pose = animationPose({ file: script, layers: [{ name: '算' }, { name: '读' }] }, 1.5);
    expect(pose.head!.pos).toEqual([3, 1.5, 0]);
    expect(pose.body!.pos).toEqual([6, 0, 0]);
    expect(animationPose({ file: script, layers: [{ name: '算' }], env: { query: { life_time: 9 } } }, 1.5).head!.pos![1]).toBe(9);
  });

  it('通用口径乘 blend_weight，TLM 不读', () => {
    const weighted = parseAnimationFile({
      animations: {
        底: { loop: true, bones: { head: { rotation: [10, 0, 0] } } },
        半: { loop: true, blend_weight: 'v.w', bones: { head: { rotation: [20, 0, 0] } } },
      },
    });
    const env = { 变量: { w: 0.5 } };
    expect(animationPose({ file: weighted, layers: [{ name: '底' }, { name: '半' }], env: env }, 0).head!.rot).toEqual([15, 0, 0]);
    expect(animationPose({ file: weighted, layers: [{ name: '底' }, { name: '半' }], env: env, 口径: 'TLM' }, 0).head!.rot).toEqual([20, 0, 0]);
  });

  it('一层可以是控制器：按它自己的时钟给骨骼，和别的层照常混合', () => {
    const controller = geckoLibController({ name: 'main', transitionTicks: 0, schedule: [{ sec: 0, clip: '点头' }, { sec: 1, clip: '走' }], animations: animFile });
    expect(animationPose({ file: animFile, layers: [{ controller: controller }] }, 0.5).head!.rot).toEqual([5, 0, 0]);
    expect(animationPose({ file: animFile, layers: [{ controller: controller }] }, 2).head!.rot).toEqual([10, 0, 0]);
    expect(animationPose({ file: animFile, layers: [{ controller: controller, sec: 0.2 }, { name: '点头', blendMode: '叠加' }] }, 9).head!.rot).toEqual([10, 0, 0]);
  });
});

describe('换模型材质', () => {
  it('只换这份模型的 mesh，挂载进来的（贴图不同或没有贴图）不动；重复跑结果一样', () => {
    const dummyTexture = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const texturedMaterial = new THREE.MeshStandardMaterial({ map: dummyTexture });
    const itemMaterial = new THREE.MeshStandardMaterial({ map: new THREE.DataTexture(new Uint8Array(4), 1, 1) });
    const solidMaterial = new THREE.MeshBasicMaterial({ color: 'red' });
    const material = new THREE.MeshBasicMaterial({ map: dummyTexture });
    const root = new THREE.Group();
    const [blockMesh, itemMesh, solidMesh] = [texturedMaterial, itemMaterial, solidMaterial].map((m) => new THREE.Mesh(new THREE.BoxGeometry(), m));
    root.add(blockMesh!);
    blockMesh!.add(itemMesh!, solidMesh!);
    swapModelMaterial(root, dummyTexture, () => material);
    swapModelMaterial(root, dummyTexture, () => material);
    expect(blockMesh!.material).toBe(material);
    expect(itemMesh!.material).toBe(itemMaterial);
    expect(solidMesh!.material).toBe(solidMaterial);
    expect(blockMesh!.userData.originalMaterial).toBe(texturedMaterial);
    expect(itemMesh!.userData.originalMaterial).toBeUndefined();
  });
});
