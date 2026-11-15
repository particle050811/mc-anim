// 第 3 句祭坛背后的天和地：地是 地形.ts 铺的那片（和第 1 句同一片地），天是三维画布后面的一张 2D 画布。
// 雾照原版 1.20.1（平原白天、渲染距离 12 区块），同第 1 句 场/2-新世界/世界.tsx 的做法（场之间不能互引，照抄；那边改了这里一起改）：
//   地形按水平距离（柱形）从 172.8 格到 192 格 smoothstep 混进雾色；天按天幕（眼睛上方 16 格）那一点的距离（球形）从 0 到 192 混。混色在 sRGB 数值上做。
// 雾补在材质的颜色编码之后（平涂派生材质时先跑原材质的 onBeforeCompile），平涂的明暗在雾前面算好。不画太阳（镜头朝北，白天的太阳在南边天上），云不画（同第 1 句）。
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { assembleBuffers, type PlacedBlock } from '@engine/model/方块拼搭.tsx';
import { makeRigCamera } from '@engine/三渲二/机位.tsx';
import { filmScale } from '@engine/三渲二/像素.ts';
import { blockAtlas } from '@engine/voxel/真实方块图集.ts';
import { AltarTerrainBlocks } from './地形.ts';
import { terrainFog, skyDomeHeight, skyColor, renderDistance, fogColor } from './参数.ts';
import type { CameraRig } from './编排.ts';

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

const fogUniforms = {
  mcFogStart: { value: terrainFog.起 },
  mcFogEnd: { value: terrainFog.止 },
  mcFogColor: { value: new THREE.Vector3(...hexToRgb(fogColor)) },
};

/** 给材质补原版的柱形雾：颜色编码（sRGB）之后按到相机的水平距离混雾色 */
const applyFog = (m: THREE.Material) => {
  m.onBeforeCompile = (shader) => {
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
  m.customProgramCacheKey = () => 'mc柱形雾-祭坛';
  return m;
};

type MatKind = '实心' | '镂空';
let materials: Record<MatKind, THREE.Material> | null = null;
const makeMaterial = (c: MatKind) => {
  if (!materials) {
    const map = blockAtlas().original;
    const common = { map, vertexColors: true, roughness: 1, metalness: 0 };
    materials = {
      实心: applyFog(new THREE.MeshStandardMaterial(common)),
      镂空: applyFog(new THREE.MeshStandardMaterial({ ...common, alphaTest: 0.5, side: THREE.DoubleSide })),
    };
  }
  return materials[c];
};

const buildMeshes = (blocks: readonly PlacedBlock[], biome: string): THREE.Mesh[] => {
  const buffers = assembleBuffers(blocks, { 群系: biome });
  const out: THREE.Mesh[] = [];
  for (const c of ['实心', '镂空'] as const) {
    const b = buffers[c];
    if (!b.idx.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    g.setIndex(b.idx);
    const mesh = new THREE.Mesh(g, makeMaterial(c));
    mesh.name = `祭坛地形-${biome}-${c}`;
    mesh.frustumCulled = false;
    out.push(mesh);
  }
  if (buffers.半透明.idx.length || buffers.发光.idx.length) throw new Error('祭坛地形里不该有半透明、发光的方块');
  return out;
};

// 一个渲染页面只建一次（几十万个面）
let meshCache: THREE.Mesh[] | null = null;
const terrainMesh = () => {
  if (!meshCache) {
    const biomeBlocks = AltarTerrainBlocks();
    meshCache = [...buildMeshes(biomeBlocks.plains, 'minecraft:plains'), ...buildMeshes(biomeBlocks.cherryGrove, 'minecraft:cherry_grove')];
  }
  return meshCache;
};

/** 祭坛四周的地（场景坐标，放在三渲二画布里） */
export const AltarTerrain: React.FC = () => {
  const meshes = useMemo(terrainMesh, []);
  return (
    <group>
      {meshes.map((m) => (
        <primitive key={m.name} object={m} />
      ))}
    </group>
  );
};

/** 天的一格多大（成片像素）：和全片 像素N 一样 6，天的渐变一格一格地变 */
const skyCellPx = 6;

/** 仰角 θ（弧度）处的天色：天幕在眼睛上方 天幕高 格，那一点离眼睛 天幕高 / sin θ，球形雾 smoothstep(0, 渲染距离)；地平线以下是雾色 */
const skyColorAt = (θ: number): [number, number, number] => {
  const skyRgb = hexToRgb(skyColor), fog = hexToRgb(fogColor);
  if (θ <= 0) return fog;
  const d = skyDomeHeight / Math.sin(θ);
  const t = Math.min(1, d / renderDistance);
  const v = t * t * (3 - 2 * t);
  return skyRgb.map((c, i) => c + (fog[i]! - c) * v) as [number, number, number];
};

/** 透视镜头后面的天：一张成片分辨率的 2D 画布，每 天格 见方一格，按这一格中心的视线仰角取色 */
export const AltarSky: React.FC<{ cameraRig: CameraRig; 宽: number; 高: number }> = ({ cameraRig, 宽: width, 高: height }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawWidth = width * filmScale, drawHeight = height * filmScale;
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const cam = makeRigCamera({ 种: '透视', ...cameraRig }, width, height, 1);
    const nx = Math.ceil(drawWidth / skyCellPx), ny = Math.ceil(drawHeight / skyCellPx);
    const small = document.createElement('canvas');
    small.width = nx;
    small.height = ny;
    const sctx = small.getContext('2d')!;
    const img = sctx.createImageData(nx, ny);
    const v = new THREE.Vector3();
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        v.set((((x + 0.5) * skyCellPx) / drawWidth) * 2 - 1, 1 - (((y + 0.5) * skyCellPx) / drawHeight) * 2, 0.5).unproject(cam).sub(cam.position).normalize();
        const c = skyColorAt(Math.asin(v.y));
        const o = (y * nx + x) * 4;
        img.data[o] = Math.round(c[0] * 255);
        img.data[o + 1] = Math.round(c[1] * 255);
        img.data[o + 2] = Math.round(c[2] * 255);
        img.data[o + 3] = 255;
      }
    sctx.putImageData(img, 0, 0);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, nx * skyCellPx, ny * skyCellPx);
  });
  return <canvas ref={ref} width={drawWidth} height={drawHeight} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }} />;
};
