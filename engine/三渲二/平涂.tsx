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
export const MC面明暗 = { 顶: 1.0, 南北: 0.8, 东西: 0.6, 底: 0.5 };
export type 面明暗 = typeof MC面明暗;

/** 发光区最多几个（着色器里的定长数组） */
export const 最多发光区 = 16;

export type 平涂参数 = {
  /** 整体色调（sRGB），乘在所有受光面上；白 = 贴图原色 */
  色调?: string;
  面明暗?: 面明暗;
  /** 盒子 [x0, y0, z0, x1, y1, z1]（平涂这一层的本地坐标，套在 Z 朝上的场景 group 里就是场景坐标）：里面的受光面不乘色调（灯笼、火把这类自发光方块），面明暗照乘。
   *  边界算在里面：不满一格的（灯笼）要收紧到模型本身，给整格的话贴着的墙面也落在盒子边上，跟着亮成一块 */
  发光区?: readonly (readonly number[])[];
  /** true = 留着方块网格顶点色里的平滑 AO（对比用）；默认去掉 */
  AO?: boolean;
};

type 统一量 = {
  flatTint: { value: THREE.Color };
  flatShade: { value: THREE.Vector4 };
  flatToLocal: { value: THREE.Matrix4 };
  flatGlowCount: { value: number };
  flatGlowMin: { value: THREE.Vector3[] };
  flatGlowMax: { value: THREE.Vector3[] };
};

const 新统一量 = (): 统一量 => ({
  flatTint: { value: new THREE.Color(1, 1, 1) },
  flatShade: { value: new THREE.Vector4(1, 1, 1, 1) },
  flatToLocal: { value: new THREE.Matrix4() },
  flatGlowCount: { value: 0 },
  flatGlowMin: { value: Array.from({ length: 最多发光区 }, () => new THREE.Vector3()) },
  flatGlowMax: { value: Array.from({ length: 最多发光区 }, () => new THREE.Vector3()) },
});

// 平：这个网格带 flatColor（去掉 AO 的顶点色，sRGB 数值），用它代替 vColor 的颜色，vColor 只留透明度
const 顶点头 = (平: boolean) => ['varying vec3 vFlatW;', ...(平 ? ['attribute vec3 flatColor;', 'varying vec3 vFlatColor;'] : [])].join('\n');
// 世界坐标：instancing、batching 的矩阵和 project_vertex 里一样乘
const 顶点身 = (平: boolean) =>
  [
    'vec4 flatW = vec4( transformed, 1.0 );',
    '#ifdef USE_BATCHING',
    '\tflatW = batchingMatrix * flatW;',
    '#endif',
    '#ifdef USE_INSTANCING',
    '\tflatW = instanceMatrix * flatW;',
    '#endif',
    'vFlatW = ( modelMatrix * flatW ).xyz;',
    ...(平 ? ['vFlatColor = flatColor;'] : []),
  ].join('\n');
const 片元头 = (平: boolean) =>
  [
    'uniform vec3 flatTint;',
    'uniform vec4 flatShade;',
    'uniform mat4 flatToLocal;',
    'uniform int flatGlowCount;',
    `uniform vec3 flatGlowMin[ ${最多发光区} ];`,
    `uniform vec3 flatGlowMax[ ${最多发光区} ];`,
    'varying vec3 vFlatW;',
    ...(平 ? ['varying vec3 vFlatColor;'] : []),
  ].join('\n');
const 只留透明度 = ['#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )', '\tdiffuseColor.a *= vColor.a;', '#endif'].join('\n');
// three 的世界是 Y 朝上（场景 Z 朝上的 group 转过来），所以 y 是顶底、z 是南北、x 是东西。导数要在分支外面求。
// 游戏在 sRGB 数值上乘顶点色、面明暗、光照，这里把 diffuseColor（线性）换回 sRGB 数值乘完再换回线性，输出时 three 再编码回去，数值和游戏一样
const 片元身 = (平: boolean) =>
  [
    'vec3 flatN = normalize( cross( dFdx( vFlatW ), dFdy( vFlatW ) ) );',
    'vec3 flatA = abs( flatN );',
    'float flatS = ( flatA.y >= flatA.x && flatA.y >= flatA.z ) ? ( flatN.y > 0.0 ? flatShade.x : flatShade.w ) : ( flatA.z >= flatA.x ? flatShade.y : flatShade.z );',
    'vec3 flatL = ( flatToLocal * vec4( vFlatW, 1.0 ) ).xyz;',
    'vec3 flatK = flatTint;',
    `for ( int i = 0; i < ${最多发光区}; i ++ ) {`,
    '\tif ( i >= flatGlowCount ) break;',
    '\tif ( all( greaterThanEqual( flatL, flatGlowMin[ i ] ) ) && all( lessThanEqual( flatL, flatGlowMax[ i ] ) ) ) flatK = vec3( 1.0 );',
    '}',
    'vec3 flatC = sRGBTransferOETF( vec4( diffuseColor.rgb, 1.0 ) ).rgb;',
    ...(平 ? ['flatC *= vFlatColor;'] : []),
    'outgoingLight = sRGBTransferEOTF( vec4( flatC * flatS * flatK, 1.0 ) ).rgb;',
  ].join('\n');

const 补平涂 = (shader: THREE.WebGLProgramParametersWithUniforms, u: 统一量, 平: boolean) => {
  Object.assign(shader.uniforms, u);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${顶点头(平)}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n${顶点身(平)}`);
  let f = shader.fragmentShader;
  if (平) f = f.replace('#include <color_fragment>', 只留透明度);
  // opaque_fragment 前面可能还有别的补丁（水面的菲涅尔），在它们之后盖掉受光结果
  shader.fragmentShader = f.replace('#include <common>', `#include <common>\n${片元头(平)}`).replace('#include <opaque_fragment>', `${片元身(平)}\n#include <opaque_fragment>`);
};

type 有标记 = THREE.Material & {
  isMeshStandardMaterial?: boolean;
  isMeshLambertMaterial?: boolean;
  isMeshPhongMaterial?: boolean;
  isMeshToonMaterial?: boolean;
  isMeshBasicMaterial?: boolean;
};
const 是受光 = (m: 有标记) => !!(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial);
const 能平涂 = (m: 有标记) => 是受光(m) || !!m.isMeshBasicMaterial;

/** 派生出平涂材质（不改 m）；m 要 能平涂 */
const 派生平涂材质 = (m: THREE.Material, u: 统一量, 平: boolean): THREE.Material => {
  const 受光 = 是受光(m as 有标记);
  const d = m.clone();
  d.userData.平涂 = true;
  d.toneMapped = false;
  (d as THREE.MeshBasicMaterial).fog = false;
  if (受光) {
    d.onBeforeCompile = (shader, renderer) => {
      m.onBeforeCompile(shader, renderer);
      补平涂(shader, u, 平);
    };
    d.customProgramCacheKey = () => `${m.customProgramCacheKey()}|平涂${平 ? '|平顶点色' : ''}`;
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
const 平顶点色表 = new WeakMap<THREE.BufferGeometry, boolean>();
const 释放CPU数组 = function (this: THREE.BufferAttribute) {
  (this as unknown as { array: null }).array = null;
};
const 备平顶点色 = (g: THREE.BufferGeometry): boolean => {
  const 有 = 平顶点色表.get(g);
  if (有 !== undefined) return 有;
  const col = g.getAttribute('color') as THREE.BufferAttribute | undefined;
  let ok = false;
  if (g.getAttribute('rect') && col && col.count % 4 === 0) {
    const a = col.array as ArrayLike<number> | null;
    if (a) {
      const n = col.itemSize;
      const out = new Float32Array(col.count * 3);
      for (let q = 0; q < col.count; q += 4) {
        let 亮 = q;
        for (let k = q + 1; k < q + 4; k++) if (Math.max(a[k * n]!, a[k * n + 1]!, a[k * n + 2]!) > Math.max(a[亮 * n]!, a[亮 * n + 1]!, a[亮 * n + 2]!)) 亮 = k;
        const s = [0, 1, 2].map((c) => Math.pow(a[亮 * n + c]!, 1 / 2.2));
        for (let k = q; k < q + 4; k++) out.set(s, k * 3);
      }
      const attr = new THREE.BufferAttribute(out, 3);
      attr.onUpload(释放CPU数组);
      g.setAttribute('flatColor', attr);
      ok = true;
    } else console.warn('平涂：方块网格已经画过、顶点色释放了，AO 去不掉，照原样画');
  }
  平顶点色表.set(g, ok);
  return ok;
};

const 更新统一量 = (u: 统一量, p: 平涂参数, g: THREE.Object3D) => {
  // sRGB 数值原样进着色器（片元里在 sRGB 数值上乘）
  u.flatTint.value.setStyle(p.色调 ?? '#ffffff', THREE.LinearSRGBColorSpace);
  const s = p.面明暗 ?? MC面明暗;
  u.flatShade.value.set(s.顶, s.南北, s.东西, s.底);
  g.updateWorldMatrix(true, false);
  u.flatToLocal.value.copy(g.matrixWorld).invert();
  const 区 = p.发光区 ?? [];
  if (区.length > 最多发光区) throw new Error(`发光区最多 ${最多发光区} 个，给了 ${区.length} 个`);
  u.flatGlowCount.value = 区.length;
  区.forEach((b, i) => {
    u.flatGlowMin.value[i]!.set(Math.min(b[0]!, b[3]!), Math.min(b[1]!, b[4]!), Math.min(b[2]!, b[5]!));
    u.flatGlowMax.value[i]!.set(Math.max(b[0]!, b[3]!), Math.max(b[1]!, b[4]!), Math.max(b[2]!, b[5]!));
  });
};

// 一个原材质派生出的材质（带不带 flatColor 两种）。原材质 dispose 时派生的跟着释放；派生的被主人 dispose（方块网格卸载时 dispose 的是挂着的派生材质）时，
// 原材质也替主人释放。这一帧没用到的原材质（网格离开了子树、或者组件每帧新建材质）把派生的释放掉、不再引用，免得越攒越多
type 记录 = { 原: THREE.Material; 变体: Map<boolean, THREE.Material>; 用到: number; 听原: () => void; 听派生: (e: { target: unknown }) => void };

/** 套住的子树全部平涂。可以嵌套：里层先换，外层见到派生过的就跳过。离开子树的网格、卸载时还挂着的网格换回原材质（网格可能比这一层活得久） */
export const 平涂: React.FC<平涂参数 & { children: React.ReactNode }> = ({ children, ...参数 }) => {
  const ref = useRef<THREE.Group>(null);
  const u = useMemo(新统一量, []);
  // 记录：原材质 → 记录；原：派生材质 → 原材质；网格：上一帧换过的网格
  const 表 = useMemo(() => ({ 记录: new Map<THREE.Material, 记录>(), 原: new Map<THREE.Material, THREE.Material>(), 网格: new Set<THREE.Mesh>(), 帧: 0 }), []);
  const 还原 = (mesh: THREE.Mesh) => {
    const f = (m: THREE.Material) => 表.原.get(m) ?? m;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(f) : f(mesh.material);
  };
  // 连原：派生的被主人 dispose 了，原材质也释放；正在 dispose 的那个（跳过）不再 dispose 一遍
  const 丢 = (r: 记录, 连原: boolean, 跳过?: unknown) => {
    if (表.记录.get(r.原) !== r) return;
    表.记录.delete(r.原);
    r.原.removeEventListener('dispose', r.听原);
    for (const d of r.变体.values()) {
      d.removeEventListener('dispose', r.听派生);
      表.原.delete(d);
      if (d !== 跳过) d.dispose();
    }
    if (连原) r.原.dispose();
  };
  useEffect(
    () => () => {
      for (const mesh of 表.网格) 还原(mesh);
      for (const r of [...表.记录.values()]) 丢(r, false);
      表.网格.clear();
    },
    [表],
  );
  // m 是网格上挂着的：上一帧换上的派生材质先找回原材质，开关 AO 时才能换另一种派生
  const 换 = (m: THREE.Material, 平: boolean) => {
    const 原 = 表.原.get(m) ?? m;
    // 里层平涂派生的、不认识的材质（ShaderMaterial）原样留着
    if (原.userData.平涂 || !能平涂(原 as 有标记)) return m;
    let r = 表.记录.get(原);
    if (!r) {
      const 新: 记录 = { 原, 变体: new Map(), 用到: 表.帧, 听原: () => 丢(新, false), 听派生: (e) => 丢(新, true, e.target) };
      原.addEventListener('dispose', 新.听原);
      表.记录.set(原, 新);
      r = 新;
    }
    r.用到 = 表.帧;
    const 用平 = 平 && 原.vertexColors && 是受光(原 as 有标记);
    let d = r.变体.get(用平);
    if (!d) {
      d = 派生平涂材质(原, u, 用平);
      r.变体.set(用平, d);
      表.原.set(d, 原);
      d.addEventListener('dispose', r.听派生);
    }
    return d;
  };
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    更新统一量(u, 参数, g);
    表.帧++;
    const 这帧 = new Set<THREE.Mesh>();
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // 不管开不开 AO 都先备好：CPU 数组画过一次就没了，之后再关 AO 就来不及
      const 平 = 备平顶点色(mesh.geometry) && !参数.AO;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => 换(m, 平)) : 换(mesh.material, 平);
      这帧.add(mesh);
    });
    for (const mesh of 表.网格) if (!这帧.has(mesh)) 还原(mesh);
    表.网格 = 这帧;
    for (const r of [...表.记录.values()]) if (r.用到 !== 表.帧) 丢(r, false);
  });
  return <group ref={ref}>{children}</group>;
};
