// Ultra-Water（npm 依赖 gelatin-game-engine，锁在 GitHub 提交上，MIT）的 FFT 海洋模拟没带类型，这里只声明用到的
declare module 'gelatin-game-engine/src/water/OceanSim.js' {
  import type * as THREE from 'three';
  export const N: number;
  export const CASCADE_LENGTHS: number[];
  export type OceanParams = Record<string, number>;
  export const defaultOceanParams: () => OceanParams;
  export class OceanSim {
    constructor(renderer: THREE.WebGLRenderer, params?: OceanParams);
    params: OceanParams;
    time: number;
    dirty: boolean;
    lengths: number[];
    slope: THREE.Texture[];
    displacement: THREE.Texture[];
    update(dt: number): void;
  }
}
