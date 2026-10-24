// 第 6、7 句的天和雾：透视镜头后面一张 2D 画布画天（同 场/2-新世界/世界.tsx 的 透视天：成片分辨率、每 天格 见方一格、按视线仰角取原版天色和球形雾），
// 加上云洞：视线在云底那一层落到的那一格云散完了，画晴天的天色（演绎：雨天的天色是整片一起变的，这里让蓝天只从散开的云格里露出来，见 编排.ts 的 天晴在）。
// 地形、云的雾照原版柱形雾（同 新世界 的 补雾：颜色编码之后按到相机的水平距离 smoothstep 混雾色），雾色每帧跟着天气变（统一量是共用的，画之前改）。
import React, { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { 做机位相机 } from '@engine/三渲二/机位.tsx';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import type { 机位 } from './编排.ts';
import * as 参 from './参数.ts';
import { 地形雾, 天在, 混, type RGB } from './天气.ts';

// ---------- 雾 ----------
const 雾统一量 = {
  mcFogStart: { value: 地形雾.起 },
  mcFogEnd: { value: 地形雾.止 },
  mcFogColor: { value: new THREE.Vector3(1, 1, 1) },
};
/** 这一帧的雾色（sRGB 数值）：画之前设 */
export const 设雾色 = (c: RGB) => 雾统一量.mcFogColor.value.set(c[0], c[1], c[2]);

/** 给材质补原版的柱形雾：颜色编码（sRGB）之后按到相机的水平距离混雾色（three 世界 Y 朝上，水平是 xz） */
export const 补雾 = <M extends THREE.Material>(m: M): M => {
  const 原 = m.onBeforeCompile.bind(m);
  m.onBeforeCompile = (shader, renderer) => {
    原(shader, renderer);
    Object.assign(shader.uniforms, 雾统一量);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMcFogW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvMcFogW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMcFogW;\nuniform float mcFogStart;\nuniform float mcFogEnd;\nuniform vec3 mcFogColor;')
      .replace(
        '#include <colorspace_fragment>',
        [
          '#include <colorspace_fragment>',
          'float mcFogD = length( vMcFogW.xz - cameraPosition.xz );',
          'float mcFogV = mcFogD <= mcFogStart ? 0.0 : ( mcFogD < mcFogEnd ? smoothstep( mcFogStart, mcFogEnd, mcFogD ) : 1.0 );',
          'gl_FragColor.rgb = mix( gl_FragColor.rgb, mcFogColor, mcFogV );',
        ].join('\n'),
      );
  };
  m.customProgramCacheKey = () => 'mc柱形雾';
  return m;
};

// ---------- 天 ----------
export type 天参数 = {
  机位: 机位;
  宽: number;
  高: number;
  /** 洞外的天、雾；洞里的天、雾 */
  天: RGB;
  雾: RGB;
  晴天: RGB;
  晴雾: RGB;
  /** 云底那一层 (x, y) 处透出多少晴天（0～1，编排.ts 的 天晴在）；null = 没洞 */
  晴在: ((x: number, y: number) => number) | null;
};

/** 透视镜头后面的天：一张成片分辨率的 2D 画布，每 天格 见方一格，按这一格中心的视线取色 */
export const 透视天: React.FC<天参数> = ({ 机位, 宽, 高, 天, 雾, 晴天, 晴雾, 晴在 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const 画宽 = 宽 * 成片倍数, 画高 = 高 * 成片倍数;
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const cam = 做机位相机(机位, 宽, 高, 1);
    const nx = Math.ceil(画宽 / 参.天格), ny = Math.ceil(画高 / 参.天格);
    const 小 = document.createElement('canvas');
    小.width = nx;
    小.height = ny;
    const sctx = 小.getContext('2d')!;
    const img = sctx.createImageData(nx, ny);
    const v = new THREE.Vector3();
    const 云高 = 参.云底高 - 机位.眼[2];
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        v.set((((x + 0.5) * 参.天格) / 画宽) * 2 - 1, 1 - (((y + 0.5) * 参.天格) / 画高) * 2, 0.5).unproject(cam).sub(cam.position).normalize();
        // three 世界 (x, y, z) = 场景 (x, z, −y)
        let 晴 = 0;
        if (晴在 && v.y > 0) {
          const t = 云高 / v.y;
          晴 = 晴在(机位.眼[0] + t * v.x, 机位.眼[1] - t * v.z);
        }
        const 仰 = Math.asin(v.y);
        const c = 晴 >= 1 ? 天在(仰, 晴天, 晴雾) : 晴 <= 0 ? 天在(仰, 天, 雾) : 混(天在(仰, 天, 雾), 天在(仰, 晴天, 晴雾), 晴);
        const o = (y * nx + x) * 4;
        img.data[o] = Math.round(c[0] * 255);
        img.data[o + 1] = Math.round(c[1] * 255);
        img.data[o + 2] = Math.round(c[2] * 255);
        img.data[o + 3] = 255;
      }
    sctx.putImageData(img, 0, 0);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(小, 0, 0, nx * 参.天格, ny * 参.天格);
  });
  return <canvas ref={ref} width={画宽} height={画高} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高 }} />;
};
