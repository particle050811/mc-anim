// 试看「阴影日志」用到时才取：直接 import，不 mock、不重载模块，同一个模块里先关后开都认。
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { trialEnvName } from '../core/试看.ts';
import { CascadedShadow } from './级联阴影.ts';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const update = (shadow: CascadedShadow, splitDist: number) => {
  const light = new THREE.DirectionalLight();
  light.position.set(1, 2, 3);
  light.updateMatrixWorld();
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 2000);
  cam.updateMatrixWorld();
  shadow.camera.far = 1000;
  shadow.splitDist = splitDist;
  shadow.updateMatrices(light, cam);
};

describe('CascadedShadow 的阴影日志', () => {
  it('没开试看不打；开了以后同一个模块接着打', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const shadow = new CascadedShadow();
    update(shadow, 300);
    expect(warn).not.toHaveBeenCalled();
    vi.stubEnv(trialEnvName, JSON.stringify({ '阴影日志': true }));
    update(shadow, 310);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toMatch(/^\[阴影\] \{"切分":310/);
  });
});
