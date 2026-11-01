import { describe, expect, it } from 'vitest';
import { ShaderMaterial } from 'three';
import { 切换着色宏 } from './着色宏.ts';

describe('着色开关宏', () => {
  it('空字符串宏能关闭，并且只在真正切换时重选程序', () => {
    const 材质 = new ShaderMaterial();
    切换着色宏(材质, 'ATMO', false);
    expect(材质.version).toBe(0);
    切换着色宏(材质, 'ATMO', true);
    expect(材质.defines.ATMO).toBe('');
    expect(材质.version).toBe(1);
    切换着色宏(材质, 'ATMO', true);
    expect(材质.version).toBe(1);
    切换着色宏(材质, 'ATMO', false);
    expect(Object.hasOwn(材质.defines, 'ATMO')).toBe(false);
    expect(材质.version).toBe(2);
    切换着色宏(材质, 'ATMO', false);
    expect(材质.version).toBe(2);
  });

  it('相同最终状态不依赖此前是否启用过大气', () => {
    for (const 路径 of [[false], [true, false], [true, true, true, false], [false, true, false]]) {
      const 材质 = new ShaderMaterial();
      for (const 开启 of 路径) 切换着色宏(材质, 'ATMO', 开启);
      expect(材质.defines).toEqual({});
      切换着色宏(材质, 'ATMO', true);
      expect(材质.defines).toEqual({ ATMO: '' });
    }
  });

  it('值为 0 也算已定义，且不影响别的宏', () => {
    const 材质 = new ShaderMaterial({ defines: { ATMO: 0, OTHER: 1 } });
    切换着色宏(材质, 'ATMO', true);
    expect(材质.version).toBe(0);
    切换着色宏(材质, 'ATMO', false);
    expect(材质.defines).toEqual({ OTHER: 1 });
  });
});
