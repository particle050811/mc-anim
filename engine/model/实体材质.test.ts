import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { 原版实体明暗, 实体材质, 实体材质缓存数, 持有实体贴图, 设实体材质缓存上限, 释放实体材质 } from './实体材质.ts';

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

  it('释放：最后一个持有者放手时丢掉这张贴图的材质并 dispose，别的贴图不动', () => {
    const 甲 = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const 乙 = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const 放1 = 持有实体贴图(甲);
    const 放2 = 持有实体贴图(甲);
    const m = 实体材质(甲, { 受伤: 1 });
    const n = 实体材质(乙);
    let 释放了 = 0;
    m.addEventListener('dispose', () => 释放了++);
    放1();
    放1(); // 重复放手不算数
    expect(实体材质(甲, { 受伤: 1 })).toBe(m);
    放2();
    expect(释放了).toBe(1);
    expect(实体材质(甲, { 受伤: 1 })).not.toBe(m);
    expect(实体材质(乙)).toBe(n);
    释放实体材质(甲);
    释放实体材质(乙);
  });

  it('LRU：超过上限丢最久没用的，取过的往后排', () => {
    const 丙 = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    释放实体材质(图);
    const 原数 = 实体材质缓存数();
    设实体材质缓存上限(原数 + 3);
    const a = 实体材质(丙, { 受伤: 0.1 });
    const b = 实体材质(丙, { 受伤: 0.2 });
    实体材质(丙, { 受伤: 0.3 });
    expect(实体材质(丙, { 受伤: 0.1 })).toBe(a); // a 挪到最后
    实体材质(丙, { 受伤: 0.4 }); // 超了，丢最久没用的 b
    expect(实体材质缓存数()).toBe(原数 + 3);
    expect(实体材质(丙, { 受伤: 0.1 })).toBe(a);
    expect(实体材质(丙, { 受伤: 0.2 })).not.toBe(b);
    设实体材质缓存上限(512);
    释放实体材质(丙);
  });
});
