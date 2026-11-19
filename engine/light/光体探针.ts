// 光体的探针：在显卡上给一层的每个格子算光（光体.ts 文件头的做法），画进一张平铺的图（S、V 两张，见 光体着色.ts）。
// 每格（不挡光的）取所在砖的团表，逐团：按距离取级的权重 × 影响半径内的平滑收尾 × 往这格的发光 /（距离² + 软化半径²），
// 再从格心往团心步进占用格判遮挡：近处按这一层的格子、半格一步，越往团去锥越宽、取占用格的粗级（挡光比例），出了这一层的窗口换粗一层的占用格。
// 输出两张：S = 各团来的光（rgb，a = 1 表示「这格是探针」）；V.xyz = Σ 亮度 × 到团心的位移（米），V.w = |Σ 亮度 × 到团心的方向|。
// 存位移不存方向：只有一个光源时，相邻探针的位移线性插值正好是插值点到光源的位移，着色时能从表面那一点（不是半格外的探针）算朝向。
// 一层分几次画（按行切），每次之间让出主线程，免得一次画太久被显卡看门狗掐掉。
import * as THREE from 'three';
import { BRICK, cellOf, LEVEL_D, type LightScheme, type LightSet, type LightWindow } from './光体.ts';

const TEX_W = 4096;
const OCC_MAX = 3;

const vertex = /* glsl */ `
in vec3 position;
void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

const fragment = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler3D;
uniform sampler3D occ0;
uniform sampler3D occ1;
uniform sampler3D occ2;
uniform int occCount;
uniform vec3 occMin[${OCC_MAX}];
uniform vec3 occSize[${OCC_MAX}];
uniform float occCell[${OCC_MAX}];
uniform sampler2D lightTex;
uniform sampler2D brickTex;
uniform sampler2D indexTex;
uniform vec3 recvMin;
uniform float recvCell;
uniform ivec3 recvDims;
uniform ivec3 brickDims;
uniform float minLight;
// 试看方案（光体.ts 的 LightScheme）：0 现状；3 圆影（级 = 发光级 − 距离 ÷ 米每级，p 次方软最大）
uniform int schemeKind;
uniform float metersPerLevel;
uniform float pNorm;
layout( location = 0 ) out vec4 outS;
layout( location = 1 ) out vec4 outV;

vec4 fetchAt( sampler2D t, int i ) { return texelFetch( t, ivec2( i % ${TEX_W}, i / ${TEX_W} ), 0 ); }

// 点 q 处的挡光比例：width 是这里锥的宽（米），取够粗的一级；出了所有窗口当不挡
float occAt( vec3 q, float width ) {
  for ( int j = 0; j < ${OCC_MAX}; j ++ ) {
    if ( j >= occCount ) break;
    vec3 uvw = ( q - occMin[ j ] ) / occSize[ j ];
    if ( any( lessThan( uvw.xy, vec2( 0.0 ) ) ) || any( greaterThan( uvw.xy, vec2( 1.0 ) ) ) ) continue;
    float lod = log2( max( width, occCell[ j ] ) / occCell[ j ] );
    if ( j == 0 ) return textureLod( occ0, uvw, lod ).r;
    if ( j == 1 ) return textureLod( occ1, uvw, lod ).r;
    return textureLod( occ2, uvw, lod ).r;
  }
  return 0.0;
}

// 从 p 往 c（距离 d）走到离团心 r 处，透过的比例
float visibility( vec3 p, vec3 c, float d, float r ) {
  float len = d - r;
  if ( len <= 0.0 ) return 1.0;
  vec3 dir = ( c - p ) / d;
  int n = clamp( int( ceil( 2.0 * len / recvCell ) ), 2, 24 );
  float stepLen = len / float( n );
  float T = 1.0;
  for ( int s = 0; s < 24; s ++ ) {
    if ( s >= n ) break;
    float t = ( float( s ) + 0.5 ) * stepLen;
    float width = max( stepLen, 2.0 * r * t / d );
    T *= 1.0 - min( 1.0, 1.6 * occAt( p + dir * t, width ) );
    if ( T < 0.01 ) return 0.0;
  }
  return T;
}

void main() {
  int x = int( gl_FragCoord.x );
  int row = int( gl_FragCoord.y );
  int z = row / recvDims.y;
  int y = row - z * recvDims.y;
  if ( texelFetch( occ0, ivec3( x, y, z ), 0 ).r > 0.5 ) {
    outS = vec4( 0.0 );
    outV = vec4( 0.0 );
    return;
  }
  vec3 p = recvMin + ( vec3( x, y, z ) + 0.5 ) * recvCell;
  int b = ( ( z / ${BRICK} ) * brickDims.y + y / ${BRICK} ) * brickDims.x + x / ${BRICK};
  vec4 br = fetchAt( brickTex, b );
  int off = int( br.x );
  int cnt = int( br.y );
  vec3 S = vec3( 0.0 );
  vec3 V = vec3( 0.0 );
  vec3 U = vec3( 0.0 );
  float A = 0.0;
  for ( int i = 0; i < cnt; i ++ ) {
    int t = int( fetchAt( indexTex, off + i ).r ) * 4;
    vec4 a = fetchAt( lightTex, t );
    vec4 c = fetchAt( lightTex, t + 1 );
    vec4 dv = fetchAt( lightTex, t + 2 );
    vec4 e = fetchAt( lightTex, t + 3 );
    vec3 toL = a.xyz - p;
    float d = length( toL );
    float u = log2( max( d, 1e-4 ) / ${LEVEL_D.toFixed(4)} );
    int fl = int( c.w );
    float w = ( ( u < a.w && ( fl & 1 ) != 0 ) || ( u > a.w && ( fl & 2 ) != 0 ) ) ? 1.0 : max( 0.0, 1.0 - abs( u - a.w ) );
    if ( w <= 0.0 ) continue;
    if ( schemeKind == 3 ) {
      if ( d >= dv.w ) continue;
      float Lc = max( c.r, max( c.g, c.b ) );
      float xl = Lc - max( 1.0, d - e.w ) / ( 15.0 * metersPerLevel );
      if ( xl <= 0.0 ) continue;
      float vis = visibility( p, a.xyz, d, e.w );
      if ( vis <= 0.0 ) continue;
      float ap = w * pow( xl * vis, pNorm );
      A += ap;
      S += ap * c.rgb / Lc;
      V += ap * toL;
      continue;
    }
    float q = d * d / ( dv.w * dv.w );
    if ( q >= 1.0 ) continue;
    float win = 1.0 - q * q;
    vec3 om = d > 1e-4 ? - toL / d : vec3( 0.0 );
    vec3 J = c.rgb + max( 0.0, dot( dv.xyz, om ) ) * e.rgb;
    vec3 E = J * ( w * win * win / ( d * d + e.w * e.w ) );
    if ( max( E.r, max( E.g, E.b ) ) < minLight * 0.25 ) continue;
    float vis = visibility( p, a.xyz, d, e.w );
    if ( vis <= 0.0 ) continue;
    S += E * vis;
    float el = dot( E, vec3( 0.2126, 0.7152, 0.0722 ) ) * vis;
    V += el * toL;
    U += el * ( d > 1e-4 ? toL / d : vec3( 0.0 ) );
  }
  if ( schemeKind == 3 ) {
    if ( A <= 0.0 ) {
      outS = vec4( 0.0, 0.0, 0.0, 1.0 );
      outV = vec4( 0.0 );
      return;
    }
    float xs = pow( A, 1.0 / pNorm );
    vec3 hue = S / A;
    hue /= max( 1e-5, dot( hue, vec3( 0.2126, 0.7152, 0.0722 ) ) );
    outS = vec4( hue * xs, 1.0 );
    outV = vec4( V / A * xs, xs );
    return;
  }
  outS = vec4( S, 1.0 );
  outV = vec4( V, length( U ) );
}`;

// 试看方案 原版、圆洪水：探针在工人里按洪水填充算好（光体.ts 的 levelField），这里照抄进探针图；来光方向不用
const copyFragment = /* glsl */ `
precision highp float;
uniform sampler2D fieldTex;
layout( location = 0 ) out vec4 outS;
layout( location = 1 ) out vec4 outV;
void main() {
  outS = texelFetch( fieldTex, ivec2( gl_FragCoord.xy ), 0 );
  outV = vec4( 0.0 );
}`;

const floatTexture = (data: Float32Array, perTexel: 1 | 4) => {
  const texels = Math.max(1, data.length / perTexel);
  const h = Math.ceil(texels / TEX_W);
  const padded = new Float32Array(TEX_W * h * perTexel);
  padded.set(data);
  const t = new THREE.DataTexture(padded, TEX_W, h, perTexel === 4 ? THREE.RGBAFormat : THREE.RedFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
};

/** 一层的占用格（R8，带多级纹理：粗级 = 挡光比例） */
export const occupancyTexture = (w: LightWindow, occ: Uint8Array) => {
  const t = new THREE.Data3DTexture(occ, w.W, w.H, w.D);
  t.format = THREE.RedFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
  t.unpackAlignment = 1;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
};

/** 探针图（S、V 两张，半精度、线性过滤），W × H·D */
export const probeTarget = (w: LightWindow) => {
  const rt = new THREE.WebGLRenderTarget(w.W, w.H * w.D, { count: 2, type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });
  for (const t of rt.textures) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return rt;
};

const quad = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  return g;
})();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
// 一次画多少格（再多显卡一次跑太久）
const cellsPerDraw = 1 << 16;

/**
 * 算一层探针，画进 target。occs：占用格，第 0 个是探针这一层，往后是更粗的层。
 */
export const gatherProbes = async (gl: THREE.WebGLRenderer, recv: LightWindow, occs: { w: LightWindow; tex: THREE.Data3DTexture }[], set: LightSet, target: THREE.WebGLRenderTarget, minLight: number, scheme?: LightScheme, field?: Float32Array) => {
  const fieldTex = field ? new THREE.DataTexture(field, recv.W, recv.H * recv.D, THREE.RGBAFormat, THREE.FloatType) : null;
  if (fieldTex) {
    fieldTex.minFilter = fieldTex.magFilter = THREE.NearestFilter;
    fieldTex.generateMipmaps = false;
    fieldTex.needsUpdate = true;
  }
  const lightTex = floatTexture(set.lights, 4);
  const brickTex = floatTexture(set.bricks, 4);
  const indexTex = floatTexture(set.index, 1);
  const pad = <T,>(xs: T[], fill: T) => [...xs, ...Array.from({ length: OCC_MAX - xs.length }, () => fill)];
  const material = fieldTex ? new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vertex, fragmentShader: copyFragment, depthTest: false, depthWrite: false, uniforms: { fieldTex: { value: fieldTex } } }) : new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: vertex,
    fragmentShader: fragment,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      occ0: { value: occs[0]!.tex },
      occ1: { value: (occs[1] ?? occs[0]!).tex },
      occ2: { value: (occs[2] ?? occs[0]!).tex },
      occCount: { value: occs.length },
      occMin: { value: pad(occs.map((o) => new THREE.Vector3(o.w.x0, o.w.y0, o.w.z0)), new THREE.Vector3()) },
      occSize: { value: pad(occs.map((o) => new THREE.Vector3(o.w.W, o.w.H, o.w.D).multiplyScalar(cellOf(o.w))), new THREE.Vector3(1, 1, 1)) },
      occCell: { value: pad(occs.map((o) => cellOf(o.w)), 1) },
      lightTex: { value: lightTex },
      brickTex: { value: brickTex },
      indexTex: { value: indexTex },
      recvMin: { value: new THREE.Vector3(recv.x0, recv.y0, recv.z0) },
      recvCell: { value: cellOf(recv) },
      recvDims: { value: [recv.W, recv.H, recv.D] },
      brickDims: { value: [Math.ceil(recv.W / BRICK), Math.ceil(recv.H / BRICK), Math.ceil(recv.D / BRICK)] },
      minLight: { value: minLight },
      schemeKind: { value: scheme?.kind === '圆影' ? 3 : 0 },
      metersPerLevel: { value: scheme?.metersPerLevel ?? 1 },
      pNorm: { value: scheme?.p ?? 4 },
    },
  });
  const mesh = new THREE.Mesh(quad, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const prevTarget = gl.getRenderTarget();
  const prevAutoClear = gl.autoClear;
  const rows = recv.H * recv.D;
  const rowsPerDraw = Math.max(1, Math.floor(cellsPerDraw / recv.W));
  try {
    for (let r0 = 0; r0 < rows; r0 += rowsPerDraw) {
      target.scissor.set(0, r0, recv.W, Math.min(rowsPerDraw, rows - r0));
      target.scissorTest = true;
      gl.autoClear = false;
      gl.setRenderTarget(target);
      gl.render(scene, camera);
      gl.getContext().flush();
      gl.setRenderTarget(prevTarget);
      gl.autoClear = prevAutoClear;
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    target.scissorTest = false;
    gl.setRenderTarget(prevTarget);
    gl.autoClear = prevAutoClear;
    material.dispose();
    lightTex.dispose();
    brickTex.dispose();
    indexTex.dispose();
    fieldTex?.dispose();
  }
};
