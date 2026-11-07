// 光线影子（光影参数.影子算法 = '光线'）：受光面每个画面像素朝太阳打一条射线，和挡光的三角形求交（three-mesh-bvh 的 BVH，GLSL 里遍历），
// 影子边由几何决定，放多大都是直的（用户 11-07「这个东西不应该用矢量图去存…像素无限放大」：影子图是位图，边长再大放大了也有台阶）。
// 挡光的三角形 = 影子图那条路画进影子图的同一批：受光网格（含只挡光的组）的全部材质，不写深度的（半透明）不挡、材质不可见的不挡；
// 单面材质只按朝太阳的那面挡（同影子图：正面材质在太阳那边看是背面就被剔掉）；剖掉的不挡光 时镜头近裁剪面前面的不挡。
// 镂空（alphaTest > 0）：打中的点按重心插值 uv、取那张贴图第 0 级的透明度，比材质的阈值（同主画面：贴图 alpha × 不透明度 < alphaTest 就透），透的接着往后找，
// 所以外层头发、树叶的影子边正好落在贴图像素边上。每帧把挡光的三角形换到世界坐标重建一棵 BVH，只看这一帧（乱序、并行出帧结果一样）。
// 不支持：顶点数组上传后释放了的网格（方块网格.tsx、体素世界），合并大面的图集平铺（rect），遇到就报错，这种场景用影子图。
import * as THREE from 'three';
import { BVHShaderGLSL, MeshBVH, MeshBVHUniformStruct, FloatVertexAttributeTexture } from 'three-mesh-bvh';

/** 镂空贴图最多几张（着色器里一张一个采样器；同一张贴图不同阈值共用）；材质项（贴图 × 阈值）最多几个 */
const 最多贴图 = 8;
const 最多项 = 16;
/** 射线起点沿法线往外挪多少（格）：比贴图像素（Faithful 64x 是 1/64 格）、外层皮肤的外扩（1/64 格起）小得多，又远大于世界坐标的浮点误差 */
export const 光线起点偏移 = 1 / 2048;

export const 新光线统一量 = () => ({
  gyBvh: { value: new MeshBVHUniformStruct() },
  /** 每个顶点：u、v（已乘贴图的 uv 变换）、材质项号（0 = 不透明不查贴图）、哪面挡（0 正面、1 背面、2 两面） */
  gyRtAttr: { value: new FloatVertexAttributeTexture() as THREE.Texture },
  /** 材质项：x = 第几张贴图，y = 阈值（贴图 alpha 不到它就透） */
  gyRtEnt: { value: Array.from({ length: 最多项 }, () => new THREE.Vector4()) },
  ...Object.fromEntries(Array.from({ length: 最多贴图 }, (_, i) => [`gyRtTex${i}`, { value: 空图 as THREE.Texture }])),
  /** 剖面（世界坐标，xyz 法线、w 常数，点在负的那边不挡）；gyRtClipOn 0 = 不剖 */
  gyRtClip: { value: new THREE.Vector4() },
  gyRtClipOn: { value: 0 },
  gyRtBias: { value: 光线起点偏移 },
  /** 抗锯齿后的可见度（屏幕图，光影渲染.tsx 的 画罩 先算好），主变体按像素取 */
  gyRtMask: { value: 空图 as THREE.Texture },
});
export type 光线统一量 = ReturnType<typeof 新光线统一量>;

const 空图 = (() => {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
})();

const 取透明度 = Array.from({ length: 最多贴图 }, (_, i) => `${i ? 'else ' : ''}if ( s == ${i} ) return textureLod( gyRtTex${i}, uv, 0.0 ).a;`).join('\n  ');

/** 片元里的声明和求交：gyRtBlocked(起点, 指向太阳) = 中间有没有挡光的（找到一个不透的就停，不找最近的） */
export const 光线头 = /* glsl */ `
${BVHShaderGLSL.common_functions}
${BVHShaderGLSL.bvh_struct_definitions}
${BVHShaderGLSL.bvh_ray_functions}
uniform BVH gyBvh;
uniform sampler2D gyRtAttr;
uniform vec4 gyRtEnt[ ${最多项} ];
${Array.from({ length: 最多贴图 }, (_, i) => `uniform sampler2D gyRtTex${i};`).join('\n')}
uniform vec4 gyRtClip;
uniform float gyRtClipOn;
uniform float gyRtBias;
uniform sampler2D gyRtMask;
float gyRtAlpha( int s, vec2 uv ) {
  ${取透明度}
  return 1.0;
}
bool gyRtBlocked( vec3 o, vec3 d ) {
  int ptr = 0;
  uint stack[ BVH_STACK_DEPTH ];
  stack[ 0 ] = 0u;
  while ( ptr > - 1 && ptr < BVH_STACK_DEPTH ) {
    uint node = stack[ ptr ];
    ptr --;
    float bd;
    if ( ! intersectsBVHNodeBounds( o, d, gyBvh.bvhBounds, node, bd ) ) continue;
    uvec2 info = uTexelFetch1D( gyBvh.bvhContents, node ).xy;
    if ( bool( info.x & 0xffff0000u ) ) {
      uint n = info.x & 0x0000ffffu;
      for ( uint i = info.y, l = info.y + n; i < l; i ++ ) {
        uvec3 ix = uTexelFetch1D( gyBvh.index, i ).xyz;
        vec3 a = texelFetch1D( gyBvh.position, ix.x ).xyz;
        vec3 b = texelFetch1D( gyBvh.position, ix.y ).xyz;
        vec3 c = texelFetch1D( gyBvh.position, ix.z ).xyz;
        vec3 bc, nn;
        float t, side;
        if ( ! intersectsTriangle( o, d, a, b, c, bc, nn, t, side ) || t <= 0.0 ) continue;
        vec4 A = texelFetch1D( gyRtAttr, ix.x );
        // 正面材质：朝太阳的是正面才挡（射线从背后穿出，side < 0）；背面材质反过来
        if ( A.w < 0.5 && side > 0.0 ) continue;
        if ( A.w > 0.5 && A.w < 1.5 && side < 0.0 ) continue;
        if ( gyRtClipOn > 0.5 && dot( gyRtClip.xyz, o + d * t ) + gyRtClip.w < 0.0 ) continue;
        int e = int( A.z + 0.5 );
        if ( e > 0 ) {
          vec2 uv = bc.x * A.xy + bc.y * texelFetch1D( gyRtAttr, ix.y ).xy + bc.z * texelFetch1D( gyRtAttr, ix.z ).xy;
          vec4 E = gyRtEnt[ e ];
          if ( gyRtAlpha( int( E.x + 0.5 ), uv ) < E.y ) continue;
        }
        return true;
      }
    } else {
      ptr ++;
      stack[ ptr ] = node + info.y;
      ptr ++;
      stack[ ptr ] = node + 1u;
    }
  }
  return false;
}
// 抗锯齿：在这个像素盖住的那一小块面上打 16 条（固定的 4×4 抖动格点，帧和帧一样），亮的比例就是 gyLit。
// 先打四角，四条都一样就当整块一样（比一个像素还细的挡光物可能漏，影子边上才补满 16 条，省三四倍）。
// 导数换到面内、长度夹到 1/4 格：物体轮廓上的像素两边是不同的面，导数会很大
vec3 gyRtFoot( vec3 v, vec3 n ) {
  v -= n * dot( v, n );
  float l = length( v );
  return l > 0.25 ? v * ( 0.25 / l ) : v;
}
float gyRtLit( vec3 o, vec3 n, vec3 dx, vec3 dy ) {
  dx = gyRtFoot( dx, n );
  dy = gyRtFoot( dy, n );
  float s = 0.0;
  for ( int i = 0; i < 4; i ++ ) {
    vec2 q = vec2( i & 1, i >> 1 ) * 0.75 - 0.375;
    s += gyRtBlocked( o + dx * q.x + dy * q.y, gySun ) ? 0.0 : 1.0;
  }
  if ( s == 0.0 || s == 4.0 ) return s * 0.25;
  for ( int i = 0; i < 16; i ++ ) {
    int x = i & 3, y = i >> 2;
    if ( ( x == 0 || x == 3 ) && ( y == 0 || y == 3 ) ) continue;
    // 4×4 格里每格按 (x, y) 定的小抖动，避免格点排成直线时和影子边平行
    vec2 q = ( vec2( x, y ) + 0.5 + 0.2 * vec2( fract( float( y ) * 0.618 ) - 0.5, fract( float( x ) * 0.382 ) - 0.5 ) ) * 0.25 - 0.5;
    s += gyRtBlocked( o + dx * q.x + dy * q.y, gySun ) ? 0.0 : 1.0;
  }
  return s / 16.0;
}
// 罩那遍（光影渲染.tsx 的 画罩）：只打中心 1 条
float gyRtCenter( vec3 o ) {
  return gyRtBlocked( o, gySun ) ? 0.0 : 1.0;
}
`;

/** 罩的三张图逐像素是 起点 + 可见度、x 导数 + 法线 x、y 导数 + 法线 y（法线 z 的正负记在可见度上加 2；没画东西的像素全 0） */
const 读罩 = /* glsl */ `
uniform sampler2D gyRtA;
uniform sampler2D gyRtB;
uniform sampler2D gyRtC;
float gyRtVis( float w ) { return w > 1.5 ? w - 2.0 : w; }
`;
const 解罩 = /* glsl */ `
  ivec2 c = ivec2( gl_FragCoord.xy );
  vec4 A = texelFetch( gyRtA, c, 0 ), B = texelFetch( gyRtB, c, 0 ), C = texelFetch( gyRtC, c, 0 );
  vec3 n = vec3( B.w, C.w, ( A.w > 1.5 ? - 1.0 : 1.0 ) * sqrt( max( 0.0, 1.0 - B.w * B.w - C.w * C.w ) ) );
`;
/** 抗锯齿第一遍（全屏、轻）：同一面上的 3×3 邻居都和中心一样就用中心值，深度写 1；有不一样的（影子边上）深度写 0，留给第二遍补。
 *  别的面上的邻居（轮廓外、草叶缝里透出去的）不算：影子边要穿过这个像素，同一面上的邻居一定有一个不一样，不排掉的话轮廓和草丛处处走慢路 */
export const 抗锯齿分片元 = /* glsl */ `
${读罩}
void main() {
${解罩}
  ivec2 m = textureSize( gyRtA, 0 ) - 1;
  float v = gyRtVis( A.w );
  // 离这个面多远算同一面：像素在面上那一块尺寸的 1/4（同一平面上的相邻像素是 0）；tol = 0 是罩里没画东西的像素（背景、不受光的），主画面不取
  float tol = 0.25 * ( length( B.xyz ) + length( C.xyz ) );
  bool same = true;
  for ( int j = - 1; j <= 1; j ++ )
    for ( int i = - 1; i <= 1; i ++ ) {
      vec4 t = texelFetch( gyRtA, clamp( c + ivec2( i, j ), ivec2( 0 ), m ), 0 );
      same = same && ( abs( gyRtVis( t.w ) - v ) < 0.5 || abs( dot( t.xyz - A.xyz, n ) ) > tol );
    }
  gl_FragColor = vec4( v, 0.0, 0.0, 1.0 );
  gl_FragDepth = same || tol == 0.0 ? 1.0 : 0.0;
}
`;
/** 抗锯齿第二遍（全屏，深度比第一遍写的大才画，GPU 在跑着色器之前就把其余像素剔掉）：影子边上的像素打 gyRtLit 的 16 条。
 *  求交单放这一遍：着色器里带着整套求交，哪怕几乎不走也让每个像素慢一截（放主画面材质里实测每帧多 200 多毫秒，和第一遍合成一遍多 70 毫秒） */
export const 抗锯齿补片元 = /* glsl */ `
uniform vec3 gySun;
${光线头}
${读罩}
void main() {
${解罩}
  gl_FragColor = vec4( gyRtLit( A.xyz, n, B.xyz, C.xyz ), 0.0, 0.0, 1.0 );
}
`;

const 面号 = (m: THREE.Material) => (m.side === THREE.DoubleSide ? 2 : m.side === THREE.BackSide ? 1 : 0);

type 段 = { mesh: THREE.Mesh; m: THREE.Material; 起: number; 数: number };

/** 网格的几何能不能拿来求交：CPU 顶点数组还在、不是图集平铺 */
const 查几何 = (mesh: THREE.Mesh) => {
  const g = mesh.geometry;
  const p = g.getAttribute('position') as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  const 名 = `${mesh.name || mesh.type}（${mesh.uuid.slice(0, 8)}）`;
  if (!p || (p as unknown as THREE.GLBufferAttribute).isGLBufferAttribute || !(p as THREE.BufferAttribute).array && !(p as THREE.InterleavedBufferAttribute).data)
    throw new Error(`光线影子：网格 ${名} 没有 CPU 顶点数组（方块网格、体素世界上传后就释放），这一段用影子图`);
  if (g.getAttribute('rect')) throw new Error(`光线影子：网格 ${名} 是图集平铺的合并大面（方块网格），不支持，这一段用影子图`);
  if (g.index && !(g.index.array as ArrayLike<number> | null)) throw new Error(`光线影子：网格 ${名} 的索引数组已释放，这一段用影子图`);
  if ((mesh as THREE.BatchedMesh).isBatchedMesh) throw new Error(`光线影子：网格 ${名} 是 BatchedMesh，不支持`);
};

/** 一个网格按材质分成几段三角形（索引里第几个起、几个），只留会挡光的材质 */
const 分段 = (mesh: THREE.Mesh, 出: 段[]) => {
  const g = mesh.geometry;
  const 总 = g.index ? g.index.count : g.getAttribute('position').count;
  const d0 = Math.max(0, g.drawRange.start), d1 = Math.min(总, g.drawRange.start + g.drawRange.count);
  const 挡 = (m: THREE.Material | undefined): m is THREE.Material => !!m && m.visible && m.depthWrite;
  if (Array.isArray(mesh.material)) {
    for (const gr of g.groups) {
      const m = mesh.material[gr.materialIndex ?? 0];
      const a = Math.max(d0, gr.start), b = Math.min(d1, gr.start + gr.count);
      if (挡(m) && b > a) 出.push({ mesh, m, 起: a, 数: Math.floor((b - a) / 3) * 3 });
    }
  } else if (挡(mesh.material) && d1 > d0) 出.push({ mesh, m: mesh.material, 起: d0, 数: Math.floor((d1 - d0) / 3) * 3 });
};

export type 光线资源 = ReturnType<typeof 新光线资源>;
export const 新光线资源 = () => ({ u: 新光线统一量(), 几何: null as THREE.BufferGeometry | null, 键: '', 三角: 0 });

/** 这一帧挡光输入的指纹：网格、几何（连属性版本）、世界矩阵、实例矩阵、材质里求交用到的值。和上一次建 BVH 时一样就沿用（同样的输入建出同样的树，
 *  结果和重建一字不差，乱序出帧照样一样；屋后远景那片地二十多万个三角形每帧重建要 200 多毫秒）。有骨骼动画的网格不沿用 */
const 输入键 = (段们: readonly 段[]) => {
  const 片: string[] = [];
  for (const { mesh, m, 起, 数 } of 段们) {
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.Mesh).morphTargetInfluences?.length) return null;
    const g = mesh.geometry;
    const 版 = Object.values(g.attributes).map((a) => (a as THREE.BufferAttribute).version ?? 0).join(',');
    const mm = m as THREE.MeshStandardMaterial;
    const map = mm.alphaTest > 0 ? mm.map : null;
    if (map?.matrixAutoUpdate) map.updateMatrix();
    const 实例 = (mesh as THREE.InstancedMesh).isInstancedMesh ? `${(mesh as THREE.InstancedMesh).count}/${(mesh as THREE.InstancedMesh).instanceMatrix.version}` : '';
    片.push(`${mesh.uuid}|${g.uuid}|${g.index?.version ?? -1}|${版}|${起}|${数}|${mesh.matrixWorld.elements.join(',')}|${实例}|${m.uuid}|${mm.alphaTest}|${mm.opacity}|${m.side}|${map ? `${map.uuid}|${map.version}|${map.matrix.elements.join(',')}` : ''}`);
  }
  return 片.join('\n');
};

export const 释放光线 = (r: 光线资源) => {
  r.u.gyBvh.value.dispose();
  r.u.gyRtAttr.value.dispose();
  r.几何?.dispose();
};

const 矩 = new THREE.Matrix4();
const 实例矩 = new THREE.Matrix4();
const 点 = new THREE.Vector3();
const 平 = new THREE.Vector2();
const 三 = new THREE.Matrix3();

/** 挡光的网格（世界矩阵已更新）→ BVH 和材质项进统一量。剖面给了就是 剖掉的不挡光。返回三角形数（0 = 没有挡光的） */
export const 摆光线 = (r: 光线资源, 网格们: readonly THREE.Mesh[], 剖面: THREE.Plane | null) => {
  const 段们: 段[] = [];
  for (const mesh of 网格们) {
    查几何(mesh);
    分段(mesh, 段们);
  }
  const 键 = 输入键(段们);
  if (键 !== null && 键 === r.键) {
    设剖面(r, 剖面);
    return r.三角;
  }
  // 材质项：0 号是不透明；镂空的按（贴图, 阈值）合并，贴图按出现先后占槽
  const 图们: THREE.Texture[] = [];
  const 项们 = new Map<string, number>();
  const u = r.u;
  const 项号 = (m: THREE.Material) => {
    const mm = m as THREE.MeshStandardMaterial;
    if (!(mm.alphaTest > 0) || !mm.map) return 0;
    const 阈 = mm.alphaTest / Math.max(mm.opacity, 1e-6);
    let 槽 = 图们.indexOf(mm.map);
    if (槽 < 0) {
      if (图们.length >= 最多贴图) throw new Error(`光线影子：镂空贴图超过 ${最多贴图} 张`);
      槽 = 图们.push(mm.map) - 1;
    }
    const k = `${槽}|${阈}`;
    let e = 项们.get(k);
    if (e === undefined) {
      e = 项们.size + 1;
      if (e >= 最多项) throw new Error(`光线影子：镂空材质项超过 ${最多项 - 1} 个`);
      项们.set(k, e);
      u.gyRtEnt.value[e]!.set(槽, 阈, 0, 0);
    }
    return e;
  };
  let 三角 = 0;
  for (const s of 段们) 三角 += (s.数 / 3) * ((s.mesh as THREE.InstancedMesh).isInstancedMesh ? (s.mesh as THREE.InstancedMesh).count : 1);
  r.键 = '';
  if (!三角) return 0;
  const pos = new Float32Array(三角 * 9);
  const attr = new Float32Array(三角 * 12);
  let v = 0;
  for (const s of 段们) {
    const { mesh, m } = s;
    const g = mesh.geometry;
    const idx = g.index;
    const uv = g.getAttribute('uv') as THREE.BufferAttribute | undefined;
    const e = 项号(m);
    const map = (m as THREE.MeshStandardMaterial).map;
    if (e && map) {
      if (map.matrixAutoUpdate) map.updateMatrix();
      三.copy(map.matrix);
    }
    const 面 = 面号(m);
    const 实例 = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh) : null;
    const 骨 = (mesh as THREE.SkinnedMesh).isSkinnedMesh;
    // 骨骼矩阵 three 在 gl.render 里才更新，这里先更新，取到的是这一帧的姿势
    if (骨) (mesh as THREE.SkinnedMesh).skeleton.update();
    const p = g.getAttribute('position');
    for (let k = 0; k < (实例 ? 实例.count : 1); k++) {
      矩.copy(mesh.matrixWorld);
      if (实例) 矩.multiply((实例.getMatrixAt(k, 实例矩), 实例矩));
      // 镜像的矩阵把绕向翻过来（three 画的时候跟着翻正反面），换到世界时调换两个顶点，绕向照旧表示正面
      const 翻 = 矩.determinant() < 0;
      for (let t = s.起; t < s.起 + s.数; t += 3) {
        for (let c = 0; c < 3; c++) {
          const 角 = 翻 && c > 0 ? 3 - c : c;
          const i = idx ? idx.getX(t + 角) : t + 角;
          if (骨) mesh.getVertexPosition(i, 点);
          else 点.fromBufferAttribute(p, i);
          点.applyMatrix4(矩);
          pos.set([点.x, 点.y, 点.z], v * 3);
          if (e && uv) {
            平.fromBufferAttribute(uv, i).applyMatrix3(三);
            attr.set([平.x, 平.y, e, 面], v * 4);
          } else attr.set([0, 0, 0, 面], v * 4);
          v++;
        }
      }
    }
  }
  r.几何?.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const 属性 = new THREE.BufferAttribute(attr, 4);
  const 序 = new Uint32Array(三角 * 3);
  for (let i = 0; i < 序.length; i++) 序[i] = i;
  geo.setIndex(new THREE.BufferAttribute(序, 1));
  const bvh = new MeshBVH(geo);
  u.gyBvh.value.updateFrom(bvh);
  (u.gyRtAttr.value as FloatVertexAttributeTexture).updateFrom(属性);
  r.几何 = geo;
  for (let i = 0; i < 最多贴图; i++) (u as unknown as Record<string, { value: THREE.Texture }>)[`gyRtTex${i}`]!.value = 图们[i] ?? 空图;
  设剖面(r, 剖面);
  r.键 = 键 ?? '';
  r.三角 = 三角;
  return 三角;
};

const 设剖面 = (r: 光线资源, 剖面: THREE.Plane | null) => {
  r.u.gyRtClipOn.value = 剖面 ? 1 : 0;
  if (剖面) r.u.gyRtClip.value.set(剖面.normal.x, 剖面.normal.y, 剖面.normal.z, 剖面.constant);
};
