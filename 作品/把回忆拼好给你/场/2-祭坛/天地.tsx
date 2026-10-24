// 第 3 句祭坛背后的天和地：地是 地形.ts 铺的那片（和第 1 句同一片地），天是三维画布后面的一张 2D 画布。
// 雾照原版 1.20.1（平原白天、渲染距离 12 区块），同第 1 句 场/2-新世界/世界.tsx 的做法（场之间不能互引，照抄；那边改了这里一起改）：
//   地形按水平距离（柱形）从 172.8 格到 192 格 smoothstep 混进雾色；天按天幕（眼睛上方 16 格）那一点的距离（球形）从 0 到 192 混。混色在 sRGB 数值上做。
// 雾补在材质的颜色编码之后（平涂派生材质时先跑原材质的 onBeforeCompile），平涂的明暗在雾前面算好。不画太阳（镜头朝北，白天的太阳在南边天上），云不画（同第 1 句）。
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { 拼搭缓冲, type 方块 } from '@engine/model/方块拼搭.tsx';
import { 做机位相机 } from '@engine/三渲二/机位.tsx';
import { 成片倍数 } from '@engine/三渲二/像素.ts';
import { blockAtlas } from '@engine/voxel/真实方块图集.ts';
import { 祭坛地形方块 } from './地形.ts';
import { 地形雾, 天幕高, 天色, 渲染距离, 雾色 } from './参数.ts';
import type { 机 } from './编排.ts';

const 拆 = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

const 雾统一量 = {
  mcFogStart: { value: 地形雾.起 },
  mcFogEnd: { value: 地形雾.止 },
  mcFogColor: { value: new THREE.Vector3(...拆(雾色)) },
};

/** 给材质补原版的柱形雾：颜色编码（sRGB）之后按到相机的水平距离混雾色 */
const 补雾 = (m: THREE.Material) => {
  m.onBeforeCompile = (shader) => {
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
  m.customProgramCacheKey = () => 'mc柱形雾-祭坛';
  return m;
};

type 类 = '实心' | '镂空';
let 材质们: Record<类, THREE.Material> | null = null;
const 材质 = (c: 类) => {
  if (!材质们) {
    const map = blockAtlas().original;
    const common = { map, vertexColors: true, roughness: 1, metalness: 0 };
    材质们 = {
      实心: 补雾(new THREE.MeshStandardMaterial(common)),
      镂空: 补雾(new THREE.MeshStandardMaterial({ ...common, alphaTest: 0.5, side: THREE.DoubleSide })),
    };
  }
  return 材质们[c];
};

const 建网格 = (方块们: readonly 方块[], 群系: string): THREE.Mesh[] => {
  const 缓冲们 = 拼搭缓冲(方块们, { 群系 });
  const out: THREE.Mesh[] = [];
  for (const c of ['实心', '镂空'] as const) {
    const b = 缓冲们[c];
    if (!b.idx.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    g.setIndex(b.idx);
    const mesh = new THREE.Mesh(g, 材质(c));
    mesh.name = `祭坛地形-${群系}-${c}`;
    mesh.frustumCulled = false;
    out.push(mesh);
  }
  if (缓冲们.半透明.idx.length || 缓冲们.发光.idx.length) throw new Error('祭坛地形里不该有半透明、发光的方块');
  return out;
};

// 一个渲染页面只建一次（几十万个面）
let 网格缓存: THREE.Mesh[] | null = null;
const 地形网格 = () => {
  if (!网格缓存) {
    const 方块们 = 祭坛地形方块();
    网格缓存 = [...建网格(方块们.平原, 'minecraft:plains'), ...建网格(方块们.樱花林, 'minecraft:cherry_grove')];
  }
  return 网格缓存;
};

/** 祭坛四周的地（场景坐标，放在三渲二画布里） */
export const 祭坛地形: React.FC = () => {
  const meshes = useMemo(地形网格, []);
  return (
    <group>
      {meshes.map((m) => (
        <primitive key={m.name} object={m} />
      ))}
    </group>
  );
};

/** 天的一格多大（成片像素）：和全片 像素N 一样 6，天的渐变一格一格地变 */
const 天格 = 6;

/** 仰角 θ（弧度）处的天色：天幕在眼睛上方 天幕高 格，那一点离眼睛 天幕高 / sin θ，球形雾 smoothstep(0, 渲染距离)；地平线以下是雾色 */
const 天色在 = (θ: number): [number, number, number] => {
  const 天 = 拆(天色), 雾 = 拆(雾色);
  if (θ <= 0) return 雾;
  const d = 天幕高 / Math.sin(θ);
  const t = Math.min(1, d / 渲染距离);
  const v = t * t * (3 - 2 * t);
  return 天.map((c, i) => c + (雾[i]! - c) * v) as [number, number, number];
};

/** 透视镜头后面的天：一张成片分辨率的 2D 画布，每 天格 见方一格，按这一格中心的视线仰角取色 */
export const 祭坛天: React.FC<{ 机位: 机; 宽: number; 高: number }> = ({ 机位, 宽, 高 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const 画宽 = 宽 * 成片倍数, 画高 = 高 * 成片倍数;
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const cam = 做机位相机({ 种: '透视', ...机位 }, 宽, 高, 1);
    const nx = Math.ceil(画宽 / 天格), ny = Math.ceil(画高 / 天格);
    const 小 = document.createElement('canvas');
    小.width = nx;
    小.height = ny;
    const sctx = 小.getContext('2d')!;
    const img = sctx.createImageData(nx, ny);
    const v = new THREE.Vector3();
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        v.set((((x + 0.5) * 天格) / 画宽) * 2 - 1, 1 - (((y + 0.5) * 天格) / 画高) * 2, 0.5).unproject(cam).sub(cam.position).normalize();
        const c = 天色在(Math.asin(v.y));
        const o = (y * nx + x) * 4;
        img.data[o] = Math.round(c[0] * 255);
        img.data[o + 1] = Math.round(c[1] * 255);
        img.data[o + 2] = Math.round(c[2] * 255);
        img.data[o + 3] = 255;
      }
    sctx.putImageData(img, 0, 0);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(小, 0, 0, nx * 天格, ny * 天格);
  });
  return <canvas ref={ref} width={画宽} height={画高} style={{ position: 'absolute', left: 0, top: 0, width: 宽, height: 高 }} />;
};
