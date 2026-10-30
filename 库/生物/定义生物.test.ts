import { describe, expect, it } from 'vitest';
import type { Png } from '@engine/model/贴图.ts';
import { 定义生物 } from './定义生物.ts';

// 一只假的「村民」：2×1 的贴图，群系底图 × 职业层，看合成和缓存
const 纯色 = (r: number, a = 255): Png => ({ w: 2, h: 1, px: new Uint8Array([r, 0, 0, a, r, 0, 0, a]) });
const 透明 = (): Png => ({ w: 2, h: 1, px: new Uint8Array(8) });
const 几何 = { texW: 2, texH: 1, bones: [{ name: 'body', pivot: [0, 0, 0], cubes: [{ origin: [0, 0, 0], size: [1, 1, 1], uv: [0, 0] }] }] };
const 底图 = { 平原: 纯色(10), 沙漠: 纯色(20) };
const 职业层 = { 无业: 透明(), 图书管理员: { w: 2, h: 1, px: new Uint8Array([0, 0, 0, 0, 99, 0, 0, 255]) } };

const 村民 = 定义生物({
  名: '假村民',
  模型: 几何,
  变体: { 群系: ['平原', '沙漠'], 职业: ['无业', '图书管理员'] },
  贴图: (v) => [底图[v.群系], 职业层[v.职业]],
  动画: {
    文件: { animations: { 待机: { loop: true, animation_length: 2, bones: { body: { rotation: { '0': [0, 0, 0], '2': [10, 0, 0] } } } } } },
    默认层们: [{ 名: '待机' }],
  },
});

describe('定义生物', () => {
  it('变体补默认值、不认识的值报错', () => {
    expect(村民.选变体()).toEqual({ 群系: '平原', 职业: '无业' });
    expect(村民.选变体({ 职业: '图书管理员' })).toEqual({ 群系: '平原', 职业: '图书管理员' });
    // @ts-expect-error 类型上就不让写错
    expect(() => 村民.选变体({ 群系: '雪原' })).toThrow(/没有 雪原/);
  });

  it('按变体从下到上合成贴图，同一组合同一个模型对象', () => {
    const m = 村民.取模型({ 群系: '沙漠', 职业: '图书管理员' });
    expect([...m.texture.px]).toEqual([20, 0, 0, 255, 99, 0, 0, 255]);
    expect(m.bones).toBe(几何.bones);
    expect(村民.取模型({ 群系: '沙漠', 职业: '图书管理员' })).toBe(m);
    expect(村民.取模型()).not.toBe(m);
  });

  it('动画文件在定义时解析', () => {
    expect(Object.keys(村民.动画文件!)).toEqual(['待机']);
    expect(村民.displayName).toBe('假村民');
  });

  it('模型不是基岩几何时报错', () => {
    expect(() => 定义生物({ 名: '坏的', 模型: {}, 贴图: 纯色(1) })).toThrow(/缺 bones/);
  });
});
