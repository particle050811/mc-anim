import { describe, expect, it } from 'vitest';
import { ShaderMaterial } from 'three';
import { toggleShaderMacro } from './着色宏.ts';

describe('着色开关宏', () => {
  it('空字符串宏能关闭，并且只在真正切换时重选程序', () => {
    const material = new ShaderMaterial();
    toggleShaderMacro(material, 'ATMO', false);
    expect(material.version).toBe(0);
    toggleShaderMacro(material, 'ATMO', true);
    expect(material.defines.ATMO).toBe('');
    expect(material.version).toBe(1);
    toggleShaderMacro(material, 'ATMO', true);
    expect(material.version).toBe(1);
    toggleShaderMacro(material, 'ATMO', false);
    expect(Object.hasOwn(material.defines, 'ATMO')).toBe(false);
    expect(material.version).toBe(2);
    toggleShaderMacro(material, 'ATMO', false);
    expect(material.version).toBe(2);
  });

  it('相同最终状态不依赖此前是否启用过大气', () => {
    for (const togglePaths of [[false], [true, false], [true, true, true, false], [false, true, false]]) {
      const material = new ShaderMaterial();
      for (const enable of togglePaths) toggleShaderMacro(material, 'ATMO', enable);
      expect(material.defines).toEqual({});
      toggleShaderMacro(material, 'ATMO', true);
      expect(material.defines).toEqual({ ATMO: '' });
    }
  });

  it('值为 0 也算已定义，且不影响别的宏', () => {
    const material = new ShaderMaterial({ defines: { ATMO: 0, OTHER: 1 } });
    toggleShaderMacro(material, 'ATMO', true);
    expect(material.version).toBe(0);
    toggleShaderMacro(material, 'ATMO', false);
    expect(material.defines).toEqual({ OTHER: 1 });
  });
});
