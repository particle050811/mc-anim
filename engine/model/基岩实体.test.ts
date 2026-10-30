import { describe, expect, it } from 'vitest';
import { 解析动画文件 } from '../anim/基岩动画.ts';
import { 动画姿势, 按发光拆分 } from './基岩实体.tsx';
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
});
