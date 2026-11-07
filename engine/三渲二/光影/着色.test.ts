import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { 新光线统一量 } from './光线影子.ts';
import { 新光影统一量, 补受光, type 光线模式 } from './着色.ts';

// 这里只检查受光着色器拼接，不加载离线大气资产；真实像素在 anim still 的对照里验证。
vi.mock('../../light/大气.ts', () => ({ ATMO_FN_GLSL: '', ATMO_PARS_GLSL: '', atmoUniforms: {} }));

const 新着色器 = () => ({
  uniforms: {},
  vertexShader: THREE.ShaderLib.basic.vertexShader,
  fragmentShader: THREE.ShaderLib.basic.fragmentShader,
}) as THREE.WebGLProgramParametersWithUniforms;

describe('光线影子的求交隔离', () => {
  it.each(['罩', '主'] as const)('%s 变体不能把 BVH 求交带回场景材质', (模式) => {
    const s = 新着色器();
    补受光(s, 新光影统一量(), 新光线统一量(), 模式);
    expect(s.fragmentShader).not.toContain('uniform BVH gyBvh');
    expect(s.fragmentShader).not.toContain('gyRtBlocked');
    expect(s.fragmentShader).not.toContain('gyRtCenter(');
    if (模式 === '主') expect(s.fragmentShader).toContain('texelFetch( gyRtMask, ivec2( gl_FragCoord.xy ), 0 ).r');
    else expect(s.fragmentShader).toContain('gyRtO1 = vec4( gyPdx, flatN.x )');
  });

  it('半透明的直算变体保留原来的 8 点采样', () => {
    const s = 新着色器();
    补受光(s, 新光影统一量(), 新光线统一量(), '直');
    expect(s.fragmentShader).toContain('uniform BVH gyBvh');
    expect(s.fragmentShader).toContain('gyRtLit( gyP + flatN * gyRtBias, flatN, gyPdx, gyPdy )');
  });

  it('不开光线影子时，各模式参数都不改变影子图着色器', () => {
    const 旧路 = 新着色器();
    const u = 新光影统一量();
    补受光(旧路, u);
    for (const 模式 of ['直', '罩', '主'] satisfies 光线模式[]) {
      const s = 新着色器();
      补受光(s, u, undefined, 模式);
      expect(s.fragmentShader).toBe(旧路.fragmentShader);
      expect(s.uniforms).toEqual(旧路.uniforms);
    }
    expect(旧路.fragmentShader).not.toContain('gyRt');
  });
});
