import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { 原版实体明暗, 实体材质 } from './实体材质.ts';

describe('实体材质', () => {
  const 图 = new THREE.DataTexture(new Uint8Array(4), 1, 1);

  it('按选项分材质种类，同选项同一个对象', () => {
    expect(实体材质(图)).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(实体材质(图)).toBe(实体材质(图, { 光照: '场景' }));
    expect(实体材质(图, { 发光: true })).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect((实体材质(图, { 发光: true }) as THREE.MeshBasicMaterial).toneMapped).toBe(false);
    expect(实体材质(图, { 光照: 1 })).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(实体材质(图, { 光照: 1 })).not.toBe(实体材质(图, { 光照: 0.5 }));
    expect(实体材质(图, { 受伤: 1 })).not.toBe(实体材质(图));
  });

  it('镂空、半透明的默认值', () => {
    expect(实体材质(图).alphaTest).toBe(0.5);
    expect(实体材质(图, { 光照: 1 }).alphaTest).toBe(0.1);
    const 半 = 实体材质(图, { 透明度: 0.5 });
    expect([半.transparent, 半.depthWrite, 半.opacity]).toEqual([true, false, 0.5]);
  });

  it('原版实体光照：顶面满亮、底面 0.4、竖直面约 0.74', () => {
    expect(原版实体明暗([0, 1, 0])).toBe(1);
    expect(原版实体明暗([0, -1, 0])).toBeCloseTo(0.4, 12);
    expect(原版实体明暗([0, 0, -1])).toBeCloseTo(0.4 + (0.6 * 0.7) / Math.hypot(0.2, 1, 0.7), 12);
    expect(原版实体明暗([0, 0, -1])).toBeCloseTo(0.74, 2);
  });
});
