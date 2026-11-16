import { describe, expect, it } from 'vitest';
import type { Png } from '@engine/model/贴图.ts';
import { mergeEnv, defineCreature } from './定义生物.ts';

// 一只假的「村民」：2×1 的贴图，群系底图 × 职业层，看合成和缓存
const solidPng = (r: number, a = 255): Png => ({ w: 2, h: 1, px: new Uint8Array([r, 0, 0, a, r, 0, 0, a]) });
const transparentPng = (): Png => ({ w: 2, h: 1, px: new Uint8Array(8) });
const testModel = { texW: 2, texH: 1, bones: [{ name: 'body', pivot: [0, 0, 0], cubes: [{ origin: [0, 0, 0], size: [1, 1, 1], uv: [0, 0] }] }] };
const baseTexByBiome = { 平原: solidPng(10), 沙漠: solidPng(20) };
const professionLayer = { 无业: transparentPng(), 图书管理员: { w: 2, h: 1, px: new Uint8Array([0, 0, 0, 0, 99, 0, 0, 255]) } };

const villager = defineCreature({
  name: '假村民',
  model: testModel,
  variant: { biome: ['平原', '沙漠'], profession: ['无业', '图书管理员'] },
  贴图: (v) => [baseTexByBiome[v.biome], professionLayer[v.profession]],
  animation: {
    file: { animations: { 待机: { loop: true, animation_length: 2, bones: { body: { rotation: { '0': [0, 0, 0], '2': [10, 0, 0] } } } } } },
    defaultLayers: [{ name: '待机' }],
  },
});

describe('定义生物', () => {
  it('变体补默认值、不认识的值报错', () => {
    expect(villager.pickVariant()).toEqual({ biome: '平原', profession: '无业' });
    expect(villager.pickVariant({ profession: '图书管理员' })).toEqual({ biome: '平原', profession: '图书管理员' });
    // @ts-expect-error 类型上就不让写错
    expect(() => villager.pickVariant({ biome: '雪原' })).toThrow(/没有 雪原/);
  });

  it('按变体从下到上合成贴图，同一组合同一个模型对象', () => {
    const m = villager.getModel({ biome: '沙漠', profession: '图书管理员' });
    expect([...m.texture.px]).toEqual([20, 0, 0, 255, 99, 0, 0, 255]);
    expect(m.bones).toBe(testModel.bones);
    expect(villager.getModel({ biome: '沙漠', profession: '图书管理员' })).toBe(m);
    expect(villager.getModel()).not.toBe(m);
  });

  it('动画文件在定义时解析', () => {
    expect(Object.keys(villager.animationFiles!)).toEqual(['待机']);
    expect(villager.displayName).toBe('假村民');
  });

  it('环境按命名空间合并：只给一个模组变量不冲掉定义里的别的', () => {
    const variables = { x: 1 };
    const mergedEnv = mergeEnv({ external: { 'ysm.has_helmet': 1 }, query: { health: 20 } }, { external: { 'ysm.food_level': 5 }, 变量: variables });
    expect(mergedEnv.external).toEqual({ 'ysm.has_helmet': 1, 'ysm.food_level': 5 });
    expect(mergedEnv.query).toEqual({ health: 20 });
    expect(mergedEnv.变量).toBe(variables);
    expect(mergeEnv({ external: { a: 1 } }, { external: { a: 2 } }).external).toEqual({ a: 2 });
  });

  it('模型不是基岩几何时报错', () => {
    expect(() => defineCreature({ name: '坏的', model: {}, 贴图: solidPng(1) })).toThrow(/缺 bones/);
  });
});
