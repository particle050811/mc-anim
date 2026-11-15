// 第 6、7 句的天和雾：透视镜头后面一张 2D 画布画天（同 场/2-新世界/世界.tsx 的 透视天：成片分辨率、每 天格 见方一格、按视线仰角取原版天色和球形雾），
// 加上云洞：视线在云底那一层落到的那一格云散完了，画晴天的天色（演绎：雨天的天色是整片一起变的，这里让蓝天只从散开的云格里露出来，见 编排.ts 的 天晴在）。
// 地形、云的雾照原版柱形雾（同 新世界 的 补雾：颜色编码之后按到相机的水平距离 smoothstep 混雾色），雾色每帧跟着天气变（统一量是共用的，画之前改）。
import React, { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { makeRigCamera } from '@engine/三渲二/机位.tsx';
import { filmScale } from '@engine/三渲二/像素.ts';
import type { CameraRig } from './编排.ts';
import * as params from './参数.ts';
import { terrainFog, skyAt, type RGB } from './天气.ts';
import { lerpV } from '@engine/core/数学.ts';

// ---------- 雾 ----------
const fogUniforms = {
  mcFogStart: { value: terrainFog.起 },
  mcFogEnd: { value: terrainFog.止 },
  mcFogColor: { value: new THREE.Vector3(1, 1, 1) },
};
/** 这一帧的雾色（sRGB 数值）：画之前设 */
export const setFogColor = (c: RGB) => fogUniforms.mcFogColor.value.set(c[0], c[1], c[2]);

/** 给材质补原版的柱形雾：颜色编码（sRGB）之后按到相机的水平距离混雾色（three 世界 Y 朝上，水平是 xz） */
export const applyFog = <M extends THREE.Material>(m: M): M => {
  const prevOnBeforeCompile = m.onBeforeCompile.bind(m);
  m.onBeforeCompile = (shader, renderer) => {
    prevOnBeforeCompile(shader, renderer);
    Object.assign(shader.uniforms, fogUniforms);
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
export type SkyParams = {
  cameraRig: CameraRig;
  宽: number;
  高: number;
  /** 洞外的天、雾；洞里的天、雾 */
  天: RGB;
  fog: RGB;
  clearSky: RGB;
  clearFog: RGB;
  /** 云底那一层 (x, y) 处透出多少晴天（0～1，编排.ts 的 天晴在）；null = 没洞 */
  clearAt: ((x: number, y: number) => number) | null;
};

/** 透视镜头后面的天：一张成片分辨率的 2D 画布，每 天格 见方一格，按这一格中心的视线取色 */
export const PerspectiveSky: React.FC<SkyParams> = ({ cameraRig, 宽: width, 高: height, 天: skyRgb, fog, clearSky, clearFog, clearAt }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawWidth = width * filmScale, drawHeight = height * filmScale;
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const cam = makeRigCamera(cameraRig, width, height, 1);
    const nx = Math.ceil(drawWidth / params.skyCellPx), ny = Math.ceil(drawHeight / params.skyCellPx);
    const small = document.createElement('canvas');
    small.width = nx;
    small.height = ny;
    const sctx = small.getContext('2d')!;
    const img = sctx.createImageData(nx, ny);
    const v = new THREE.Vector3();
    const cloudHeight = params.cloudBottomHeight - cameraRig.眼[2];
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        v.set((((x + 0.5) * params.skyCellPx) / drawWidth) * 2 - 1, 1 - (((y + 0.5) * params.skyCellPx) / drawHeight) * 2, 0.5).unproject(cam).sub(cam.position).normalize();
        // three 世界 (x, y, z) = 场景 (x, z, −y)
        let clearAmount = 0;
        if (clearAt && v.y > 0) {
          const t = cloudHeight / v.y;
          clearAmount = clearAt(cameraRig.眼[0] + t * v.x, cameraRig.眼[1] - t * v.z);
        }
        const elevation = Math.asin(v.y);
        const c = clearAmount >= 1 ? skyAt(elevation, clearSky, clearFog) : clearAmount <= 0 ? skyAt(elevation, skyRgb, fog) : lerpV(skyAt(elevation, skyRgb, fog), skyAt(elevation, clearSky, clearFog), clearAmount);
        const o = (y * nx + x) * 4;
        img.data[o] = Math.round(c[0] * 255);
        img.data[o + 1] = Math.round(c[1] * 255);
        img.data[o + 2] = Math.round(c[2] * 255);
        img.data[o + 3] = 255;
      }
    sctx.putImageData(img, 0, 0);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, nx * params.skyCellPx, ny * params.skyCellPx);
  });
  return <canvas ref={ref} width={drawWidth} height={drawHeight} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }} />;
};
