import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { 解析动画文件 } from '../anim/基岩动画.ts';
import { 动画姿势, 按发光拆分, 换模型材质 } from './基岩实体.tsx';
import type { BedrockModel } from './基岩模型.tsx';

const 方块 = { origin: [0, 0, 0] as [number, number, number], size: [1, 1, 1] as [number, number, number], uv: [0, 0] as [number, number] };
const 模型: BedrockModel = {
  texW: 16,
  texH: 16,
  texture: { w: 1, h: 1, px: new Uint8Array(4) },
  bones: [
    { name: 'root', pivot: [0, 0, 0], cubes: [方块] },
    { name: 'head', parent: 'root', pivot: [0, 8, 0], cubes: [方块] },
    { name: 'ysmGlowEye', parent: 'head', pivot: [0, 9, 0], cubes: [方块] },
    { name: 'eyeDot', parent: 'ysmGlowEye', pivot: [0, 9, 0], cubes: [方块] },
  ],
};

describe('按发光拆分', () => {
  it('主体去掉发光骨骼的方块；发光份只留发光方块和祖先骨骼（不往子骨骼传）', () => {
    const { 主体, 发光 } = 按发光拆分(模型);
    expect(主体.bones.map((b) => [b.name, !!b.cubes])).toEqual([['root', true], ['head', true], ['ysmGlowEye', false], ['eyeDot', true]]);
    expect(发光!.bones.map((b) => [b.name, !!b.cubes])).toEqual([['root', false], ['head', false], ['ysmGlowEye', true]]);
    expect(按发光拆分(模型)).toBe(按发光拆分(模型));
  });

  it('没有发光方块时不拆', () => {
    const 判断 = () => false;
    expect(按发光拆分(模型, 判断)).toEqual({ 主体: 模型, 发光: null });
  });
});

describe('动画姿势', () => {
  const 文件 = 解析动画文件({
    animations: {
      走: { loop: true, animation_length: 2, bones: { head: { rotation: { '0': [0, 0, 0], '2': [20, 0, 0] } } } },
      点头: { loop: true, bones: { head: { rotation: [5, 0, 0] } } },
    },
  });

  it('按层顺序取样、混合；各层可以有自己的时钟', () => {
    expect(动画姿势({ 文件, 层们: [{ 名: '走' }] }, 1).head!.rot).toEqual([10, 0, 0]);
    expect(动画姿势({ 文件, 层们: [{ 名: '走' }, { 名: '点头', 模式: '叠加' }] }, 1).head!.rot).toEqual([15, 0, 0]);
    expect(动画姿势({ 文件, 层们: [{ 名: '走', 秒: 0.5 }] }, 1).head!.rot).toEqual([5, 0, 0]);
  });

  it('动画名拼错直接报错', () => {
    expect(() => 动画姿势({ 文件, 层们: [{ 名: '跑' }] }, 0)).toThrow(/没有 跑/);
  });

  it('没给变量表时每帧一张新表：通道里的赋值不报错，后面的层读得到；q.life_time 默认是 秒', () => {
    const 脚本 = 解析动画文件({
      animations: {
        算: { loop: true, bones: { head: { position: ['v.h = 3; return v.h;', 'q.life_time', 0] } } },
        读: { loop: true, bones: { body: { position: ['v.h * 2', 0, 0] } } },
      },
    });
    const 出 = 动画姿势({ 文件: 脚本, 层们: [{ 名: '算' }, { 名: '读' }] }, 1.5);
    expect(出.head!.pos).toEqual([3, 1.5, 0]);
    expect(出.body!.pos).toEqual([6, 0, 0]);
    expect(动画姿势({ 文件: 脚本, 层们: [{ 名: '算' }], 环境: { 查询: { life_time: 9 } } }, 1.5).head!.pos![1]).toBe(9);
  });

  it('通用口径乘 blend_weight，TLM 不读', () => {
    const 带权 = 解析动画文件({
      animations: {
        底: { loop: true, bones: { head: { rotation: [10, 0, 0] } } },
        半: { loop: true, blend_weight: 'v.w', bones: { head: { rotation: [20, 0, 0] } } },
      },
    });
    const 环境 = { 变量: { w: 0.5 } };
    expect(动画姿势({ 文件: 带权, 层们: [{ 名: '底' }, { 名: '半' }], 环境 }, 0).head!.rot).toEqual([15, 0, 0]);
    expect(动画姿势({ 文件: 带权, 层们: [{ 名: '底' }, { 名: '半' }], 环境, 口径: 'TLM' }, 0).head!.rot).toEqual([20, 0, 0]);
  });
});

describe('换模型材质', () => {
  it('只换这份模型的 mesh，挂载进来的（贴图不同或没有贴图）不动；重复跑结果一样', () => {
    const 图 = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const 原 = new THREE.MeshStandardMaterial({ map: 图 });
    const 物品材质 = new THREE.MeshStandardMaterial({ map: new THREE.DataTexture(new Uint8Array(4), 1, 1) });
    const 纯色材质 = new THREE.MeshBasicMaterial({ color: 'red' });
    const 新 = new THREE.MeshBasicMaterial({ map: 图 });
    const 根 = new THREE.Group();
    const [方块, 物品, 纯色] = [原, 物品材质, 纯色材质].map((m) => new THREE.Mesh(new THREE.BoxGeometry(), m));
    根.add(方块!);
    方块!.add(物品!, 纯色!);
    换模型材质(根, 图, () => 新);
    换模型材质(根, 图, () => 新);
    expect(方块!.material).toBe(新);
    expect(物品!.material).toBe(物品材质);
    expect(纯色!.material).toBe(纯色材质);
    expect(方块!.userData.原材质).toBe(原);
    expect(物品!.userData.原材质).toBeUndefined();
  });
});
