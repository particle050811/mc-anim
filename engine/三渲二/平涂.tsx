// 平涂：套在场景外面，里面的网格不再受灯光（05-画风 原则 2）。受光材质（Standard、Lambert、Phong、Toon）换成派生材质：
// 颜色 = 材质色 × 贴图 × 顶点色 × MC 面明暗 × 色调，在 sRGB 数值上乘（同游戏）；不画阴影、高光、AO、雾，不过色调映射，贴图颜色和游戏里一样。
// MeshBasicMaterial 当成不受光的（魔法酒狐 ysmGlow 骨骼、方块网格里自发光的传送门、力场），只关色调映射和雾，照旧满亮、不乘面明暗和色调。
// 别的材质（ShaderMaterial、线、点）原样不动。不改原材质：派生材质另起一份，原来的 onBeforeCompile（方块网格的图集平铺采样、受伤变红）先跑、再补这里的。
// 顶点色：方块网格的顶点色是 染色 × 环境光遮蔽（平滑光照，按顶点插值，一个贴图像素里也在变），导出时朝向明暗恒为 1（sourcing/mod MeshAction 的 NoShade），
//   所以面明暗在这里乘，不会算两遍。AO 默认去掉：一个面四个顶点取最亮的那个的颜色整面用（见 备平顶点色）。
// 面明暗按世界法线（片元里用世界坐标的导数现算，不靠法线属性，双面的片取朝镜头那面）：哪个轴分量最大就算哪个面，转了角度的实体面过 45° 跳一档，只有四档、不出渐变。
// 每帧渲染前（useFrame）遍历子树换一次材质：方块网格取回来以后才挂上去、魔法酒狐的发光层每次提交都换回原材质，所以不能只在挂载时换一次。
import { useFrame } from '@react-three/fiber';
import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

/** MC 方块的朝向明暗（ClientLevel.getShade，sRGB 数值上乘） */
export const mcFaceShade = { top: 1.0, northSouth: 0.8, eastWest: 0.6, bottom: 0.5 };
export type FaceShade = typeof mcFaceShade;

/** 发光区最多几个（着色器里的定长数组） */
export const maxGlowRegions = 16;

export type FlatPaintParams = {
  /** 整体色调（sRGB），乘在所有受光面上；白 = 贴图原色 */
  tint?: string;
  faceShade?: FaceShade;
  /** 盒子 [x0, y0, z0, x1, y1, z1]（平涂这一层的本地坐标，套在 Z 朝上的场景 group 里就是场景坐标）：里面的受光面不乘色调（灯笼、火把这类自发光方块），面明暗照乘。
   *  边界算在里面：不满一格的（灯笼）要收紧到模型本身，给整格的话贴着的墙面也落在盒子边上，跟着亮成一块 */
  glowRegions?: readonly (readonly number[])[];
  /** true = 留着方块网格顶点色里的平滑 AO（对比用）；默认去掉 */
  AO?: boolean;
};

type UniformSet = {
  flatTint: { value: THREE.Color };
  flatShade: { value: THREE.Vector4 };
  flatToLocal: { value: THREE.Matrix4 };
  flatGlowCount: { value: number };
  flatGlowMin: { value: THREE.Vector3[] };
  flatGlowMax: { value: THREE.Vector3[] };
};

const newUniformSet = (): UniformSet => ({
  flatTint: { value: new THREE.Color(1, 1, 1) },
  flatShade: { value: new THREE.Vector4(1, 1, 1, 1) },
  flatToLocal: { value: new THREE.Matrix4() },
  flatGlowCount: { value: 0 },
  flatGlowMin: { value: Array.from({ length: maxGlowRegions }, () => new THREE.Vector3()) },
  flatGlowMax: { value: Array.from({ length: maxGlowRegions }, () => new THREE.Vector3()) },
});

// 平：这个网格带 flatColor（去掉 AO 的顶点色，sRGB 数值），用它代替 vColor 的颜色，vColor 只留透明度
const vertexHead = (useFlatColor: boolean) => ['varying vec3 vFlatW;', ...(useFlatColor ? ['attribute vec3 flatColor;', 'varying vec3 vFlatColor;'] : [])].join('\n');
// 世界坐标：instancing、batching 的矩阵和 project_vertex 里一样乘
const vertBody = (useFlatColor: boolean) =>
  [
    'vec4 flatW = vec4( transformed, 1.0 );',
    '#ifdef USE_BATCHING',
    '\tflatW = batchingMatrix * flatW;',
    '#endif',
    '#ifdef USE_INSTANCING',
    '\tflatW = instanceMatrix * flatW;',
    '#endif',
    'vFlatW = ( modelMatrix * flatW ).xyz;',
    ...(useFlatColor ? ['vFlatColor = flatColor;'] : []),
  ].join('\n');
const fragmentHead = (useFlatColor: boolean) =>
  [
    'uniform vec3 flatTint;',
    'uniform vec4 flatShade;',
    'uniform mat4 flatToLocal;',
    'uniform int flatGlowCount;',
    `uniform vec3 flatGlowMin[ ${maxGlowRegions} ];`,
    `uniform vec3 flatGlowMax[ ${maxGlowRegions} ];`,
    'varying vec3 vFlatW;',
    ...(useFlatColor ? ['varying vec3 vFlatColor;'] : []),
  ].join('\n');
const keepAlphaOnly = ['#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )', '\tdiffuseColor.a *= vColor.a;', '#endif'].join('\n');
// three 的世界是 Y 朝上（场景 Z 朝上的 group 转过来），所以 y 是顶底、z 是南北、x 是东西。导数要在分支外面求。
// 游戏在 sRGB 数值上乘顶点色、面明暗、光照，这里把 diffuseColor（线性）换回 sRGB 数值乘完再换回线性，输出时 three 再编码回去，数值和游戏一样
const fragBody = (useFlatColor: boolean) =>
  [
    'vec3 flatN = normalize( cross( dFdx( vFlatW ), dFdy( vFlatW ) ) );',
    'vec3 flatA = abs( flatN );',
    'float flatS = ( flatA.y >= flatA.x && flatA.y >= flatA.z ) ? ( flatN.y > 0.0 ? flatShade.x : flatShade.w ) : ( flatA.z >= flatA.x ? flatShade.y : flatShade.z );',
    'vec3 flatL = ( flatToLocal * vec4( vFlatW, 1.0 ) ).xyz;',
    'vec3 flatK = flatTint;',
    `for ( int i = 0; i < ${maxGlowRegions}; i ++ ) {`,
    '\tif ( i >= flatGlowCount ) break;',
    '\tif ( all( greaterThanEqual( flatL, flatGlowMin[ i ] ) ) && all( lessThanEqual( flatL, flatGlowMax[ i ] ) ) ) flatK = vec3( 1.0 );',
    '}',
    'vec3 flatC = sRGBTransferOETF( vec4( diffuseColor.rgb, 1.0 ) ).rgb;',
    ...(useFlatColor ? ['flatC *= vFlatColor;'] : []),
    'outgoingLight = sRGBTransferEOTF( vec4( flatC * flatS * flatK, 1.0 ) ).rgb;',
  ].join('\n');

const patchFlatShade = (shader: THREE.WebGLProgramParametersWithUniforms, u: UniformSet, useFlatColor: boolean) => {
  Object.assign(shader.uniforms, u);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${vertexHead(useFlatColor)}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n${vertBody(useFlatColor)}`);
  let f = shader.fragmentShader;
  if (useFlatColor) f = f.replace('#include <color_fragment>', keepAlphaOnly);
  // opaque_fragment 前面可能还有别的补丁（水面的菲涅尔），在它们之后盖掉受光结果
  shader.fragmentShader = f.replace('#include <common>', `#include <common>\n${fragmentHead(useFlatColor)}`).replace('#include <opaque_fragment>', `${fragBody(useFlatColor)}\n#include <opaque_fragment>`);
};

type MarkedMaterial = THREE.Material & {
  isMeshStandardMaterial?: boolean;
  isMeshLambertMaterial?: boolean;
  isMeshPhongMaterial?: boolean;
  isMeshToonMaterial?: boolean;
  isMeshBasicMaterial?: boolean;
};
const isLit = (m: MarkedMaterial) => !!(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial);
const canFlatShade = (m: MarkedMaterial) => isLit(m) || !!m.isMeshBasicMaterial;

/** 派生出平涂材质（不改 m）；m 要 能平涂 */
const deriveFlatMaterial = (m: THREE.Material, u: UniformSet, useFlatColor: boolean): THREE.Material => {
  const lit = isLit(m as MarkedMaterial);
  const d = m.clone();
  d.userData.平涂 = true;
  d.toneMapped = false;
  (d as THREE.MeshBasicMaterial).fog = false;
  if (lit) {
    d.onBeforeCompile = (shader, renderer) => {
      m.onBeforeCompile(shader, renderer);
      patchFlatShade(shader, u, useFlatColor);
    };
    d.customProgramCacheKey = () => `${m.customProgramCacheKey()}|平涂${useFlatColor ? '|平顶点色' : ''}`;
  } else {
    d.onBeforeCompile = m.onBeforeCompile;
    d.customProgramCacheKey = () => m.customProgramCacheKey();
  }
  return d;
};

// 方块网格的几何（带 rect 属性，四个顶点一个面，见 engine/voxel/方块网格.tsx）去掉 AO：同一面的四个顶点色都是 染色 × 各自的遮蔽，
// 取最亮的那个顶点（多半没遮挡，就是染色本身）整面用，存成 sRGB 数值（方块网格的 color 是 sRGB 数值的 2.2 次方）。
// 四个角都被挡的面（一格宽的缝底）整面压暗一档，还是平的。方块网格的 CPU 数组上传后就释放，所以要赶在第一次画之前算（平涂的 useFrame 在渲染前跑）；
// 已经画过的几何算不出，照原样带 AO 画，并打一次警告
const flatVertexColorMap = new WeakMap<THREE.BufferGeometry, boolean>();
const releaseCpuArray = function (this: THREE.BufferAttribute) {
  (this as unknown as { array: null }).array = null;
};
const prepFlatVertexColor = (g: THREE.BufferGeometry): boolean => {
  const cached = flatVertexColorMap.get(g);
  if (cached !== undefined) return cached;
  const col = g.getAttribute('color') as THREE.BufferAttribute | undefined;
  let ok = false;
  if (g.getAttribute('rect') && col && col.count % 4 === 0) {
    const a = col.array as ArrayLike<number> | null;
    if (a) {
      const n = col.itemSize;
      const out = new Float32Array(col.count * 3);
      for (let q = 0; q < col.count; q += 4) {
        let brightestIndex = q;
        for (let k = q + 1; k < q + 4; k++) if (Math.max(a[k * n]!, a[k * n + 1]!, a[k * n + 2]!) > Math.max(a[brightestIndex * n]!, a[brightestIndex * n + 1]!, a[brightestIndex * n + 2]!)) brightestIndex = k;
        const s = [0, 1, 2].map((c) => Math.pow(a[brightestIndex * n + c]!, 1 / 2.2));
        for (let k = q; k < q + 4; k++) out.set(s, k * 3);
      }
      const attr = new THREE.BufferAttribute(out, 3);
      attr.onUpload(releaseCpuArray);
      g.setAttribute('flatColor', attr);
      ok = true;
    } else console.warn('平涂：方块网格已经画过、顶点色释放了，AO 去不掉，照原样画');
  }
  flatVertexColorMap.set(g, ok);
  return ok;
};

const updateUniformSet = (u: UniformSet, p: FlatPaintParams, g: THREE.Object3D) => {
  // sRGB 数值原样进着色器（片元里在 sRGB 数值上乘）
  u.flatTint.value.setStyle(p.tint ?? '#ffffff', THREE.LinearSRGBColorSpace);
  const s = p.faceShade ?? mcFaceShade;
  u.flatShade.value.set(s.top, s.northSouth, s.eastWest, s.bottom);
  g.updateWorldMatrix(true, false);
  u.flatToLocal.value.copy(g.matrixWorld).invert();
  const glowZones = p.glowRegions ?? [];
  if (glowZones.length > maxGlowRegions) throw new Error(`发光区最多 ${maxGlowRegions} 个，给了 ${glowZones.length} 个`);
  u.flatGlowCount.value = glowZones.length;
  glowZones.forEach((b, i) => {
    u.flatGlowMin.value[i]!.set(Math.min(b[0]!, b[3]!), Math.min(b[1]!, b[4]!), Math.min(b[2]!, b[5]!));
    u.flatGlowMax.value[i]!.set(Math.max(b[0]!, b[3]!), Math.max(b[1]!, b[4]!), Math.max(b[2]!, b[5]!));
  });
};

// 一个原材质派生出的材质（带不带 flatColor 两种）。原材质 dispose 时派生的跟着释放；派生的被主人 dispose（方块网格卸载时 dispose 的是挂着的派生材质）时，
// 原材质也替主人释放。这一帧没用到的原材质（网格离开了子树、或者组件每帧新建材质）把派生的释放掉、不再引用，免得越攒越多
type PaintRecord = { 原: THREE.Material; variants: Map<boolean, THREE.Material>; lastUsedFrame: number; onOriginalDispose: () => void; onDerive: (e: { target: unknown }) => void };

/** 套住的子树全部平涂。可以嵌套：里层先换，外层见到派生过的就跳过。离开子树的网格、卸载时还挂着的网格换回原材质（网格可能比这一层活得久） */
export const FlatShade: React.FC<FlatPaintParams & { children: React.ReactNode }> = ({ children, ...params }) => {
  const ref = useRef<THREE.Group>(null);
  const u = useMemo(newUniformSet, []);
  // 记录：原材质 → 记录；原：派生材质 → 原材质；网格：上一帧换过的网格
  const flatTable = useMemo(() => ({ records: new Map<THREE.Material, PaintRecord>(), 原: new Map<THREE.Material, THREE.Material>(), grid: new Set<THREE.Mesh>(), frame: 0 }), []);
  const restore = (mesh: THREE.Mesh) => {
    const f = (m: THREE.Material) => flatTable.原.get(m) ?? m;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(f) : f(mesh.material);
  };
  // 连原：派生的被主人 dispose 了，原材质也释放；正在 dispose 的那个（跳过）不再 dispose 一遍
  const dropRecord = (r: PaintRecord, disposeOriginal: boolean, keep?: unknown) => {
    if (flatTable.records.get(r.原) !== r) return;
    flatTable.records.delete(r.原);
    r.原.removeEventListener('dispose', r.onOriginalDispose);
    for (const d of r.variants.values()) {
      d.removeEventListener('dispose', r.onDerive);
      flatTable.原.delete(d);
      if (d !== keep) d.dispose();
    }
    if (disposeOriginal) r.原.dispose();
  };
  useEffect(
    () => () => {
      for (const mesh of flatTable.grid) restore(mesh);
      for (const r of [...flatTable.records.values()]) dropRecord(r, false);
      flatTable.grid.clear();
    },
    [flatTable],
  );
  // m 是网格上挂着的：上一帧换上的派生材质先找回原材质，开关 AO 时才能换另一种派生
  const toFlatMaterial = (m: THREE.Material, useFlatColor: boolean) => {
    const originalMaterial = flatTable.原.get(m) ?? m;
    // 里层平涂派生的、不认识的材质（ShaderMaterial）原样留着
    if (originalMaterial.userData.平涂 || !canFlatShade(originalMaterial as MarkedMaterial)) return m;
    let r = flatTable.records.get(originalMaterial);
    if (!r) {
      const record: PaintRecord = { 原: originalMaterial, variants: new Map(), lastUsedFrame: flatTable.frame, onOriginalDispose: () => dropRecord(record, false), onDerive: (e) => dropRecord(record, true, e.target) };
      originalMaterial.addEventListener('dispose', record.onOriginalDispose);
      flatTable.records.set(originalMaterial, record);
      r = record;
    }
    r.lastUsedFrame = flatTable.frame;
    const useFlat = useFlatColor && originalMaterial.vertexColors && isLit(originalMaterial as MarkedMaterial);
    let d = r.variants.get(useFlat);
    if (!d) {
      d = deriveFlatMaterial(originalMaterial, u, useFlat);
      r.variants.set(useFlat, d);
      flatTable.原.set(d, originalMaterial);
      d.addEventListener('dispose', r.onDerive);
    }
    return d;
  };
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    updateUniformSet(u, params, g);
    flatTable.frame++;
    const thisFrame = new Set<THREE.Mesh>();
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // 不管开不开 AO 都先备好：CPU 数组画过一次就没了，之后再关 AO 就来不及
      const useFlatColor = prepFlatVertexColor(mesh.geometry) && !params.AO;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => toFlatMaterial(m, useFlatColor)) : toFlatMaterial(mesh.material, useFlatColor);
      thisFrame.add(mesh);
    });
    for (const mesh of flatTable.grid) if (!thisFrame.has(mesh)) restore(mesh);
    flatTable.grid = thisFrame;
    for (const r of [...flatTable.records.values()]) if (r.lastUsedFrame !== flatTable.frame) dropRecord(r, false);
  });
  return <group ref={ref}>{children}</group>;
};
