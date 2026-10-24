// 平涂：套在场景外面，里面的网格不再受灯光（05-画风 原则 2）。受光材质（Standard、Lambert、Phong、Toon）换成派生材质：
// 颜色 = 材质色 × 贴图 × 顶点色 × MC 面明暗 × 色调；不画阴影、高光、雾，不过色调映射，贴图颜色和游戏里一样。
// MeshBasicMaterial 当成不受光的（魔法酒狐 ysmGlow 骨骼、方块网格里自发光的传送门、力场），只关色调映射和雾，照旧满亮、不乘面明暗和色调。
// 别的材质（ShaderMaterial、线、点）原样不动。不改原材质：派生材质另起一份，原来的 onBeforeCompile（方块网格的图集平铺采样、受伤变红）先跑、再补这里的。
// 顶点色：方块网格的顶点色是 染色 × 环境光遮蔽，导出时朝向明暗恒为 1（sourcing/mod MeshAction 的 NoShade），所以面明暗在这里乘，不会算两遍。
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

// 世界坐标：instancing、batching 的矩阵和 project_vertex 里一样乘
const 顶点头 = 'varying vec3 vFlatW;';
const 顶点身 = [
  'vec4 flatW = vec4( transformed, 1.0 );',
  '#ifdef USE_BATCHING',
  '\tflatW = batchingMatrix * flatW;',
  '#endif',
  '#ifdef USE_INSTANCING',
  '\tflatW = instanceMatrix * flatW;',
  '#endif',
  'vFlatW = ( modelMatrix * flatW ).xyz;',
].join('\n');
const 片元头 = [
  'uniform vec3 flatTint;',
  'uniform vec4 flatShade;',
  'uniform mat4 flatToLocal;',
  'uniform int flatGlowCount;',
  `uniform vec3 flatGlowMin[ ${最多发光区} ];`,
  `uniform vec3 flatGlowMax[ ${最多发光区} ];`,
  'varying vec3 vFlatW;',
].join('\n');
// three 的世界是 Y 朝上（场景 Z 朝上的 group 转过来），所以 y 是顶底、z 是南北、x 是东西。导数要在分支外面求
const 片元身 = [
  'vec3 flatN = normalize( cross( dFdx( vFlatW ), dFdy( vFlatW ) ) );',
  'vec3 flatA = abs( flatN );',
  'float flatS = ( flatA.y >= flatA.x && flatA.y >= flatA.z ) ? ( flatN.y > 0.0 ? flatShade.x : flatShade.w ) : ( flatA.z >= flatA.x ? flatShade.y : flatShade.z );',
  'vec3 flatL = ( flatToLocal * vec4( vFlatW, 1.0 ) ).xyz;',
  'vec3 flatK = flatTint;',
  `for ( int i = 0; i < ${最多发光区}; i ++ ) {`,
  '\tif ( i >= flatGlowCount ) break;',
  '\tif ( all( greaterThanEqual( flatL, flatGlowMin[ i ] ) ) && all( lessThanEqual( flatL, flatGlowMax[ i ] ) ) ) flatK = vec3( 1.0 );',
  '}',
  'outgoingLight = diffuseColor.rgb * flatS * flatK;',
].join('\n');

const 补平涂 = (shader: THREE.WebGLProgramParametersWithUniforms, u: 统一量) => {
  Object.assign(shader.uniforms, u);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${顶点头}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n${顶点身}`);
  // opaque_fragment 前面可能还有别的补丁（水面的菲涅尔），在它们之后盖掉受光结果
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${片元头}`)
    .replace('#include <opaque_fragment>', `${片元身}\n#include <opaque_fragment>`);
};

type 有标记 = THREE.Material & {
  isMeshStandardMaterial?: boolean;
  isMeshLambertMaterial?: boolean;
  isMeshPhongMaterial?: boolean;
  isMeshToonMaterial?: boolean;
  isMeshBasicMaterial?: boolean;
};
const 是受光 = (m: 有标记) => !!(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial);

/** 派生出平涂材质（不改 m）；不认识的材质、已经派生过的原样返回 */
const 派生平涂材质 = (m: THREE.Material, u: 统一量): THREE.Material => {
  const mm = m as 有标记;
  if (m.userData.平涂) return m;
  const 受光 = 是受光(mm);
  if (!受光 && !mm.isMeshBasicMaterial) return m;
  const d = m.clone();
  d.userData.平涂 = true;
  d.toneMapped = false;
  (d as THREE.MeshBasicMaterial).fog = false;
  if (受光) {
    d.onBeforeCompile = (shader, renderer) => {
      m.onBeforeCompile(shader, renderer);
      补平涂(shader, u);
    };
    d.customProgramCacheKey = () => `${m.customProgramCacheKey()}|平涂`;
  } else {
    d.onBeforeCompile = m.onBeforeCompile;
    d.customProgramCacheKey = () => m.customProgramCacheKey();
  }
  return d;
};

const 线性 = (v: number) => Math.pow(v, 2.2);

const 更新统一量 = (u: 统一量, p: 平涂参数, g: THREE.Object3D) => {
  u.flatTint.value.set(p.色调 ?? '#ffffff');
  const s = p.面明暗 ?? MC面明暗;
  // 游戏在 sRGB 数值上乘明暗，three 在线性空间乘，所以换成线性（顶点色同样按 2.2 换，见 方块网格.tsx 的 LIN）
  u.flatShade.value.set(线性(s.顶), 线性(s.南北), 线性(s.东西), 线性(s.底));
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

/** 套住的子树全部平涂。可以嵌套：里层先换，外层见到派生过的就跳过。卸载时把还挂着的网格换回原材质（网格可能比这一层活得久） */
export const 平涂: React.FC<平涂参数 & { children: React.ReactNode }> = ({ children, ...参数 }) => {
  const ref = useRef<THREE.Group>(null);
  const u = useMemo(新统一量, []);
  // 派生：原材质 → 派生材质；原：派生材质 → 原材质；网格：上一帧换过的网格
  const 表 = useMemo(
    () => ({ 派生: new WeakMap<THREE.Material, THREE.Material>(), 原: new Map<THREE.Material, THREE.Material>(), 网格: new Set<THREE.Mesh>() }),
    [],
  );
  useEffect(
    () => () => {
      const 还原 = (m: THREE.Material) => 表.原.get(m) ?? m;
      for (const mesh of 表.网格) mesh.material = Array.isArray(mesh.material) ? mesh.material.map(还原) : 还原(mesh.material);
      for (const d of 表.原.keys()) d.dispose();
      表.原.clear();
      表.网格.clear();
    },
    [表],
  );
  const 换 = (m: THREE.Material) => {
    let d = 表.派生.get(m);
    if (!d) {
      d = 派生平涂材质(m, u);
      表.派生.set(m, d);
      if (d !== m) 表.原.set(d, m);
    }
    return d;
  };
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    更新统一量(u, 参数, g);
    表.网格.clear();
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(换) : 换(mesh.material);
      表.网格.add(mesh);
    });
  });
  return <group ref={ref}>{children}</group>;
};
