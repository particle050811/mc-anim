// 新世界：透视三渲二（平涂、不抗锯齿、不描边：全片不描边，用户 10-24 定）画 地形.ts 铺出来的平原和樱花林，后面一张 2D 画布画天和星星。
// 雾照原版 1.20.1（平原、渲染距离 12 区块）：地形按水平距离（柱形）从 172.8 格到 192 格 smoothstep 混进雾色；天按天幕（眼睛上方 16 格）那一点的距离（球形）
//   从 0 到 192 混，所以只有地平线上方几度是雾色，往上很快就是天色。混色在 sRGB 数值上做（同原版着色器）。天、雾的颜色按原版天亮程度从夜里的颜色插到白天的。
// 雾是自己补在材质上的（不用 three 的 fog）：平涂派生材质时先跑原材质的 onBeforeCompile，所以补在颜色编码之后，平涂的明暗、色调都在雾前面算好。
// 不画太阳月亮：原版太阳月亮走正东、头顶、正西那一圈，镜头一直朝北，它们离画面边还差三十几度。云先不画。
// 剖面附近的列（地形.ts 的 剖面列）不进大网格，按坑态、撤了几排另建网格（每个状态建一次）。
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { assembleBuffers, type PlacedBlock } from '@engine/model/方块拼搭.tsx';
import { makeRigCamera } from '@engine/三渲二/机位.tsx';
import { ToonCanvas } from '@engine/三渲二/画布.tsx';
import { filmScale } from '@engine/三渲二/像素.ts';
import { blockAtlas } from '@engine/voxel/真实方块图集.ts';
import { Steve, type StevePose } from '@库/角色/史蒂夫.tsx';
import { skyBrightness } from '../../地点/天体.ts';
import { sectionColumn, crossSectionBlocks, stripBlocks, NewWorldBlocks, type PitState } from './地形.ts';
import { sectionOrigin, terrainFog, skyDomeHeight, skyColor, nightSky, starField, renderDistance, fogColor, type CameraRigFrame } from './参数.ts';
import { starBrightness, starList, starDirAt } from './星.ts';

type RgbColor = [number, number, number];
const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as RgbColor;
const mix = (a: RgbColor, b: RgbColor, k: number) => a.map((v, i) => v + (b[i]! - v) * k) as RgbColor;

/** 第 刻 刻的地形雾色、地平线上的天色：夜里的地平色往白天的雾色插 */
const fogColorAt = (tick: number) => mix(hexToRgb(nightSky.horizon), hexToRgb(fogColor), skyBrightness(tick));

// ---------- 地形的雾 ----------

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
  m.customProgramCacheKey = () => 'mc柱形雾';
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

const buildMeshes = (blocks: readonly PlacedBlock[], biome: string, name: string): THREE.Mesh[] => {
  if (!blocks.length) return [];
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
    mesh.name = `新世界-${name}-${biome}-${c}`;
    mesh.frustumCulled = false;
    out.push(mesh);
  }
  if (buffers.半透明.idx.length || buffers.发光.idx.length) throw new Error('新世界里不该有半透明、发光的方块');
  return out;
};

// 一个渲染页面只建一次（几十万个面，建一次一两秒）；剖面那两截按状态各建一次
let bigMeshCache: THREE.Mesh[] | null = null;
const buildBigTerrainMesh = () => {
  if (!bigMeshCache) {
    const biomeBlocks = NewWorldBlocks();
    const keep = (b: PlacedBlock) => sectionColumn(b.位[0], b.位[1]) === null;
    bigMeshCache = [...buildMeshes(biomeBlocks.plains.filter(keep), 'minecraft:plains', '大'), ...buildMeshes(biomeBlocks.cherryGrove.filter(keep), 'minecraft:cherry_grove', '大')];
  }
  return bigMeshCache;
};
const sectionMeshes = new Map<string, THREE.Mesh[]>();
const cachedByState = (stateName: string, tiles: () => PlacedBlock[]) => {
  let m = sectionMeshes.get(stateName);
  if (!m) {
    m = buildMeshes(tiles(), 'minecraft:plains', stateName);
    sectionMeshes.set(stateName, m);
  }
  return m;
};

const Terrain: React.FC<{ pit: PitState; peeled: number }> = ({ pit, peeled }) => {
  const bigTerrainMeshes = useMemo(buildBigTerrainMesh, []);
  const meshes = [...bigTerrainMeshes, ...cachedByState(`剖${pit.dugCount}${pit.dirtCovered ? '顶' : ''}`, () => crossSectionBlocks(pit)), ...cachedByState(`剥${peeled}`, () => stripBlocks(peeled))];
  return (
    <group>
      {meshes.map((m) => (
        <primitive key={m.name} object={m} />
      ))}
    </group>
  );
};

// ---------- 天 ----------

/** 天的一格多大（成片像素）：和全片 像素N 一样 6，天的渐变一格一格地变，不是平滑的；一颗星至少 星.画格 格见方（参数.ts） */
const skyCellPx = 6;

/** 仰角 θ（弧度）处的天色：原版天幕在眼睛上方 天幕高 格，那一点离眼睛 天幕高 / sin θ，球形雾 smoothstep(0, 渲染距离)；地平线以下是雾色。
 *  亮 = 天亮程度（地点/天体.ts），天、雾的颜色从夜里的往白天的插 */
export const skyColorAt = (θ: number, bright = 1): RgbColor => {
  const sky = mix(hexToRgb(nightSky.topColor), hexToRgb(skyColor), bright), fog = mix(hexToRgb(nightSky.horizon), hexToRgb(fogColor), bright);
  if (θ <= 0) return fog;
  const d = skyDomeHeight / Math.sin(θ);
  const t = Math.min(1, d / renderDistance);
  return mix(sky, fog, t * t * (3 - 2 * t));
};

/** 透视镜头后面的天：一张成片分辨率的 2D 画布，每 天格 见方一格，按这一格中心的视线仰角取色；再把地平线以上的星星加上去（原版 SRC_ALPHA、ONE：加 星亮²，这里乘 星.亮倍；不吃雾） */
const PerspectiveSky: React.FC<{ cameraRig: CameraRigFrame; 刻: number; 宽: number; 高: number }> = ({ cameraRig, 刻: tick, 宽: width, 高: height }) => {
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
    const bright = skyBrightness(tick);
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        v.set((((x + 0.5) * skyCellPx) / drawWidth) * 2 - 1, 1 - (((y + 0.5) * skyCellPx) / drawHeight) * 2, 0.5).unproject(cam).sub(cam.position).normalize();
        const c = skyColorAt(Math.asin(v.y), bright);
        const o = (y * nx + x) * 4;
        img.data[o] = Math.round(c[0] * 255);
        img.data[o + 1] = Math.round(c[1] * 255);
        img.data[o + 2] = Math.round(c[2] * 255);
        img.data[o + 3] = 255;
      }
    const addLight = Math.min(255, Math.round(starBrightness(tick) ** 2 * starField.brightnessMult * 255));
    if (addLight > 0) {
      const forward = cam.getWorldDirection(new THREE.Vector3());
      const pixelsPerRad = drawHeight / 2 / Math.tan((cameraRig.fov * Math.PI) / 360);
      for (const s of starList) {
        const [x, y, z] = starDirAt(s, tick);
        if (z <= 0) continue;
        v.set(x, z, -y);
        if (v.dot(forward) <= 0) continue;
        v.add(cam.position).project(cam);
        const n = Math.max(starField.starCellPx, Math.round(((2 * s.半边) / starField.距离) * pixelsPerRad / skyCellPx));
        const cx = Math.round((((v.x + 1) / 2) * drawWidth) / skyCellPx - n / 2), cy = Math.round((((1 - v.y) / 2) * drawHeight) / skyCellPx - n / 2);
        for (let dy = 0; dy < n; dy++)
          for (let dx = 0; dx < n; dx++) {
            const gx = cx + dx, gy = cy + dy;
            if (gx < 0 || gy < 0 || gx >= nx || gy >= ny) continue;
            const o = (gy * nx + gx) * 4;
            for (let c = 0; c < 3; c++) img.data[o + c] = Math.min(255, img.data[o + c]! + addLight);
          }
      }
    }
    sctx.putImageData(img, 0, 0);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, nx * skyCellPx, ny * skyCellPx);
  });
  return <canvas ref={ref} width={drawWidth} height={drawHeight} style={{ position: 'absolute', left: 0, top: 0, width: width, height: height }} />;
};

// ---------- 整个世界 ----------

export type NewWorldParams = {
  cameraRig: CameraRigFrame;
  /** 你（史蒂夫）的姿势；null = 不画（2-第一晚 自己在 children 里画） */
  你: StevePose | null;
  /** 平涂色调（照调子） */
  tint: string;
  /** 游戏刻（地点/天体.ts）：天色、雾色、星星 */
  刻: number;
  /** 剖面：坑挖到哪一步、坑和镜头之间撤了几排（地形.ts） */
  section: { pit: PitState; peeled: number };
  宽: number;
  高: number;
  /** 剖面里的东西（裂纹、掉落物、粒子……）：原点在 剖面原点（坑那一格南面的中点），x 东、y 北、z 上 */
  children?: React.ReactNode;
};

/** 铺满画面的新世界（天 + 地形 + 你），放在 position 不是 static 的容器里，自己贴左上角；整片后期、聊天栏、歌词由段套 */
export const NewWorld: React.FC<NewWorldParams> = ({ cameraRig, 你: you, tint, 刻: tick, section, 宽: width, 高: height, children }) => {
  fogUniforms.mcFogColor.value.set(...fogColorAt(tick));
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: width, height: height, overflow: 'hidden' }}>
      <PerspectiveSky cameraRig={cameraRig} 刻={tick} 宽={width} 高={height} />
      <ToonCanvas 宽={width} 高={height} cameraRig={{ 种: '透视', ...cameraRig, farPlane: 640 }} tint={tint} style={{ position: 'absolute', left: 0, top: 0 }}>
        <Terrain pit={section.pit} peeled={section.peeled} />
        {you && <Steve pose={you} />}
        {children && <group position={[...sectionOrigin]}>{children}</group>}
      </ToonCanvas>
    </div>
  );
};
