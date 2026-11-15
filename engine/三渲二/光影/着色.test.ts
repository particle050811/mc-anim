import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { newRayUniforms } from './光线影子.ts';
import { newShadingUniforms, patchLit, type RayMode } from './着色.ts';

// 这里只检查受光着色器拼接，不加载离线大气资产；真实像素在 anim still 的对照里验证。
vi.mock('../../light/大气.ts', () => ({ ATMO_FN_GLSL: '', ATMO_PARS_GLSL: '', atmoUniforms: {} }));

const newShader = () => ({
  uniforms: {},
  vertexShader: THREE.ShaderLib.basic.vertexShader,
  fragmentShader: THREE.ShaderLib.basic.fragmentShader,
}) as THREE.WebGLProgramParametersWithUniforms;

describe('光线影子的求交隔离', () => {
  it.each(['罩', '主'] as const)('%s 变体不能把 BVH 求交带回场景材质', (lightMode) => {
    const s = newShader();
    patchLit(s, newShadingUniforms(), newRayUniforms(), lightMode);
    expect(s.fragmentShader).not.toContain('uniform BVH gyBvh');
    expect(s.fragmentShader).not.toContain('gyRtBlocked');
    expect(s.fragmentShader).not.toContain('gyRtCenter(');
    if (lightMode === '主') expect(s.fragmentShader).toContain('texelFetch( gyRtMask, ivec2( gl_FragCoord.xy ), 0 ).r');
    else expect(s.fragmentShader).toContain('gyRtO1 = vec4( gyPdx, flatN.x )');
  });

  it('半透明的直算变体保留原来的 8 点采样', () => {
    const s = newShader();
    patchLit(s, newShadingUniforms(), newRayUniforms(), '直');
    expect(s.fragmentShader).toContain('uniform BVH gyBvh');
    expect(s.fragmentShader).toContain('gyRtLit( gyP + flatN * gyRtBias, flatN, gyPdx, gyPdy )');
  });

  it('不开光线影子时，各模式参数都不改变影子图着色器', () => {
    const legacyShader = newShader();
    const u = newShadingUniforms();
    patchLit(legacyShader, u);
    for (const lightMode of ['直', '罩', '主'] satisfies RayMode[]) {
      const s = newShader();
      patchLit(s, u, undefined, lightMode);
      expect(s.fragmentShader).toBe(legacyShader.fragmentShader);
      expect(s.uniforms).toEqual(legacyShader.uniforms);
    }
    expect(legacyShader.fragmentShader).not.toContain('gyRt');
  });
});
