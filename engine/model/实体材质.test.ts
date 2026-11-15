import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { vanillaEntityShade, entityMaterial, entityMaterialCacheCount, holdEntityTexture, setEntityMaterialCacheLimit, releaseEntityMaterial } from './实体材质.ts';

describe('实体材质', () => {
  const dummyTexture = new THREE.DataTexture(new Uint8Array(4), 1, 1);

  it('按选项分材质种类，同选项同一个对象', () => {
    expect(entityMaterial(dummyTexture)).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(entityMaterial(dummyTexture)).toBe(entityMaterial(dummyTexture, { lighting: '场景' }));
    expect(entityMaterial(dummyTexture, { glow: true })).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect((entityMaterial(dummyTexture, { glow: true }) as THREE.MeshBasicMaterial).toneMapped).toBe(false);
    expect(entityMaterial(dummyTexture, { lighting: 1 })).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(entityMaterial(dummyTexture, { lighting: 1 })).not.toBe(entityMaterial(dummyTexture, { lighting: 0.5 }));
    expect(entityMaterial(dummyTexture, { hurt: 1 })).not.toBe(entityMaterial(dummyTexture));
  });

  it('镂空、半透明的默认值', () => {
    expect(entityMaterial(dummyTexture).alphaTest).toBe(0.5);
    expect(entityMaterial(dummyTexture, { lighting: 1 }).alphaTest).toBe(0.1);
    const halfOpacityMaterial = entityMaterial(dummyTexture, { opacity: 0.5 });
    expect([halfOpacityMaterial.transparent, halfOpacityMaterial.depthWrite, halfOpacityMaterial.opacity]).toEqual([true, false, 0.5]);
  });

  it('原版实体光照：顶面满亮、底面 0.4、竖直面约 0.74', () => {
    expect(vanillaEntityShade([0, 1, 0])).toBe(1);
    expect(vanillaEntityShade([0, -1, 0])).toBeCloseTo(0.4, 12);
    expect(vanillaEntityShade([0, 0, -1])).toBeCloseTo(0.4 + (0.6 * 0.7) / Math.hypot(0.2, 1, 0.7), 12);
    expect(vanillaEntityShade([0, 0, -1])).toBeCloseTo(0.74, 2);
  });

  it('释放：最后一个持有者放手时丢掉这张贴图的材质并 dispose，别的贴图不动', () => {
    const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const secondTexture = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const releaseFirst = holdEntityTexture(texture);
    const releaseSecond = holdEntityTexture(texture);
    const m = entityMaterial(texture, { hurt: 1 });
    const n = entityMaterial(secondTexture);
    let disposedCount = 0;
    m.addEventListener('dispose', () => disposedCount++);
    releaseFirst();
    releaseFirst(); // 重复放手不算数
    expect(entityMaterial(texture, { hurt: 1 })).toBe(m);
    releaseSecond();
    expect(disposedCount).toBe(1);
    expect(entityMaterial(texture, { hurt: 1 })).not.toBe(m);
    expect(entityMaterial(secondTexture)).toBe(n);
    releaseEntityMaterial(texture);
    releaseEntityMaterial(secondTexture);
  });

  it('LRU：超过上限丢最久没用的，取过的往后排', () => {
    const blankTexture = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    releaseEntityMaterial(dummyTexture);
    const origCount = entityMaterialCacheCount();
    setEntityMaterialCacheLimit(origCount + 3);
    const a = entityMaterial(blankTexture, { hurt: 0.1 });
    const b = entityMaterial(blankTexture, { hurt: 0.2 });
    entityMaterial(blankTexture, { hurt: 0.3 });
    expect(entityMaterial(blankTexture, { hurt: 0.1 })).toBe(a); // a 挪到最后
    entityMaterial(blankTexture, { hurt: 0.4 }); // 超了，丢最久没用的 b
    expect(entityMaterialCacheCount()).toBe(origCount + 3);
    expect(entityMaterial(blankTexture, { hurt: 0.1 })).toBe(a);
    expect(entityMaterial(blankTexture, { hurt: 0.2 })).not.toBe(b);
    setEntityMaterialCacheLimit(512);
    releaseEntityMaterial(blankTexture);
  });
});
