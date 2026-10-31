// 临时插桩（渲染优化实验，不合并）：量「可能看见的面」。ANIM_Z=3 时每帧画完真画面以后另画几遍面号图，读回来记下哪些面真的占到了像素：
//   主画面：实心、镂空、实心树叶写深度（镂空照材质的第 0 级透明度丢像素）；花草、水在这层深度上各画一遍（花草不挡 AO 但最后一遍写深度，这里各自单算；水只记最上一层）。
//   投影：三级级联各用自己的相机和分辨率，画背光那几组的背面，不做镂空（three 的深度材质这里没有透明度贴图，树叶按实心投影），和阴影遍的挑法一样。
//   角色、方块网格没画进来，它们挡住的面算看得见：所以这里只会多算不会少算。
// 面号 = gl_VertexID / 4；一个像素 32 位：高 14 位是这一帧的网格号，低 18 位是面号。读回来按「区段键|类」记成每面一个字节，跨帧并起来。
// ANIM_ZS：面号图相对画布的倍数（默认 1）；2 = 每边 2 倍，抵得上 4× 多重采样的采样点（比它密）。最后一帧（ANIM_ZN 帧）写「@桩事件 可见」。
import * as THREE from 'three';
import { blockAtlas, blockAtlasGlsl } from './真实方块图集.ts';
import { 桩, 环境 } from './桩.ts';
import type { VoxelMesh } from './材质.ts';

export type 桩网格 = { k: string; cls: string; mesh: VoxelMesh; shadow: VoxelMesh | null };
export const 桩世界网格 = new Map<string, { gl: THREE.WebGLRenderer; 帧: number; 表: 桩网格[] }>();

const VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uMesh;
attribute vec4 tex;
varying vec4 vId; varying vec2 vBUv; varying vec2 vTex; varying vec3 vW;
void main() {
  uint v = (uint(uMesh) << 18) | uint(gl_VertexID / 4);
  vId = vec4(float(v & 255u), float((v >> 8) & 255u), float((v >> 16) & 255u), float((v >> 24) & 255u)) / 255.0;
  vBUv = uv / 16.0; vTex = tex.xy;
  vW = (modelMatrix * vec4(position, 1.0)).xyz / max(length(modelMatrix[0].xyz) * 64.0, 1e-6);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;
const FS = (cut: boolean) => /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D blockAtlas;
uniform vec2 uOff;
varying vec4 vId; varying vec2 vBUv; varying vec2 vTex; varying vec3 vW;
${blockAtlasGlsl()}
void main() {
  vec2 cBUv = vBUv + dFdx(vBUv) * uOff.x + dFdy(vBUv) * uOff.y;
  vec3 cW = vW + dFdx(vW) * uOff.x + dFdy(vW) * uOff.y;
  ${cut ? `{
    float fl = floor(vTex.x / 4096.0 + 0.001);
    float layer = vTex.x - fl * 4096.0;
    vec2 f = fract(cBUv);
    if (fl > 1.5) {
      vec2 cell = floor(cW.xz);
      float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
      vec2 c = f - 0.5;
      c = h < 0.25 ? c : h < 0.5 ? vec2(-c.y, c.x) : h < 0.75 ? -c : vec2(c.y, -c.x);
      f = clamp(c + 0.5, 0.0, 0.9999);
    }
    if (textureLod(blockAtlas, atlasUv(layer, f), 0.0).a < 0.5) discard;
  }` : ''}
  #include <logdepthbuf_fragment>
  #if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
    if (vIsPerspective != 0.0) gl_FragDepth = log2(vFragDepth + dFdx(vFragDepth) * uOff.x + dFdy(vFragDepth) * uOff.y) * logDepthBufFC * 0.5;
  #endif
  gl_FragColor = vId;
}`;

type 面记 = { n: number; 段: number[]; 主: Uint8Array; 影: Uint8Array };
const 面记们 = new Map<string, 面记>();
const 帧画 = new Set<number>();
let 量过 = 0;
const 总帧 = Number(环境.ANIM_ZN ?? 0);
const 倍数 = Number(环境.ANIM_ZS ?? 1);

let 备 : { mats: Record<string, THREE.ShaderMaterial>; shadowMat: THREE.ShaderMaterial; uMesh: { value: number }; uOff: { value: THREE.Vector2 } } | null = null;
const 备好 = () => {
  if (备) return 备;
  const uMesh = { value: 0 };
  const uOff = { value: new THREE.Vector2(0, 0) };
  const mk = (cut: boolean, side: THREE.Side) => new THREE.ShaderMaterial({ uniforms: { uMesh, uOff, blockAtlas: { value: blockAtlas().original } }, vertexShader: VS, fragmentShader: FS(cut), blending: THREE.NoBlending, side, toneMapped: false });
  const solid = mk(false, THREE.FrontSide);
  const cut = mk(true, THREE.FrontSide);
  备 = { mats: { 实心: solid, 实心树叶: solid, 镂空: cut, 花草: cut, 水: solid }, shadowMat: mk(false, THREE.BackSide), uMesh, uOff };
  return 备;
};

const rts = new Map<string, THREE.WebGLRenderTarget>();
const rtOf = (w: number, h: number) => {
  const k = `${w}x${h}`;
  let rt = rts.get(k);
  if (!rt) {
    rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, samples: 0, generateMipmaps: false });
    rts.set(k, rt);
  }
  return rt;
};

const 记 = (pix: Uint8Array, table: 面记[], key: '主' | '影') => {
  const u = new Uint32Array(pix.buffer, pix.byteOffset, pix.byteLength >> 2);
  let hit = 0;
  for (let p = 0; p < u.length; p++) {
    const v = u[p];
    if (!v) continue;
    const rec = table[(v >>> 18) - 1];
    if (!rec) continue;
    const face = v & 0x3ffff;
    if (face < rec.n && !rec[key][face]) {
      rec[key][face] = 1;
      hit++;
    }
  }
  return hit;
};

export const 量可见 = (gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => {
  const { mats, shadowMat, uMesh, uOff } = 备好();
  // 同一画布可能有几个体素世界：只要这一帧挂着的（拼段上一截的世界早已释放）
  const 这画布 = [...桩世界网格.values()].filter((w) => w.gl === gl);
  const 最新帧 = Math.max(...这画布.map((w) => w.帧), -Infinity);
  const items = 这画布.filter((w) => w.帧 === 最新帧).flatMap((w) => w.表);
  if (!items.length) return;
  const table: 面记[] = [];
  const proxies = new Map<string, THREE.Mesh[]>();
  const shadowProxies: THREE.Mesh[] = [];
  const frameList: [string, number][] = [];
  items.forEach((it, idx) => {
    const k = `${it.k}|${it.cls}`;
    let rec = 面记们.get(k);
    const n = it.mesh.userData.段[it.mesh.userData.段.length - 1];
    if (!rec) 面记们.set(k, (rec = { n, 段: it.mesh.userData.段, 主: new Uint8Array(n), 影: new Uint8Array(n) }));
    table[idx] = rec;
    const proxy = new THREE.Mesh(it.mesh.geometry, [mats[it.cls]]);
    proxy.matrixAutoUpdate = false;
    proxy.matrix.copy(it.mesh.matrix);
    proxy.matrixWorld.copy(it.mesh.matrixWorld);
    proxy.matrixWorldAutoUpdate = false;
    proxy.onBeforeRender = () => { uMesh.value = idx + 1; (mats[it.cls] as THREE.ShaderMaterial).uniformsNeedUpdate = true; };
    if (!proxies.has(it.cls)) proxies.set(it.cls, []);
    proxies.get(it.cls)!.push(proxy);
    // 这一帧画了哪几组（three 的 groups，按索引数）：离线算「按轨迹裁后这一帧画多少面」用
    let mask = 0;
    for (const g of it.mesh.geometry.groups) {
      for (let gi = 0; gi < 11; gi++) {
        const a = it.mesh.userData.段[gi] * 6, b = it.mesh.userData.段[gi + 1] * 6;
        if (b > a && g.start <= a && g.start + g.count >= b) mask |= 1 << gi;
      }
    }
    frameList.push([k, mask]);
    if (it.shadow) {
      const sp = new THREE.Mesh(it.shadow.geometry, [shadowMat]);
      sp.matrixAutoUpdate = false;
      sp.matrix.copy(it.shadow.matrix);
      sp.matrixWorld.copy(it.shadow.matrixWorld); // 体素世界的 group 上面可能有位移，matrix 只是相对它的
      sp.matrixWorldAutoUpdate = false;
      sp.onBeforeRender = () => { uMesh.value = idx + 1; shadowMat.uniformsNeedUpdate = true; };
      shadowProxies.push(sp);
    }
  });
  const prevTarget = gl.getRenderTarget();
  const prevAuto = gl.autoClear;
  const prevColor = new THREE.Color();
  gl.getClearColor(prevColor);
  const prevAlpha = gl.getClearAlpha();
  const prevShadowAuto = gl.shadowMap.autoUpdate;
  gl.shadowMap.autoUpdate = false;
  gl.autoClear = false;
  gl.setClearColor(0x000000, 0);
  const size = gl.getDrawingBufferSize(new THREE.Vector2());
  const w = Math.floor(size.x * 倍数), h = Math.floor(size.y * 倍数);
  const rt = rtOf(w, h);
  const pix = new Uint8Array(w * h * 4);
  gl.setRenderTarget(rt);
  gl.clear(true, true, true);
  const sceneOf = (classes: string[]) => {
    const s = new THREE.Scene();
    s.matrixWorldAutoUpdate = false;
    for (const c of classes) for (const m of proxies.get(c) ?? []) (s.children as THREE.Object3D[]).push(m);
    return s;
  };
  const stat: Record<string, number> = {};
  // 真画面是 4× 多重采样：采样点不在像素中心。这里按标准 4× 的采样点各偏一遍（上下翻转的也来一遍，ANGLE 底下 y 朝向不好断定），连同像素中心共 9 遍；ANIM_ZJ=0 只画中心
  const pe = (camera as THREE.PerspectiveCamera).projectionMatrix.elements;
  const e8 = pe[8], e9 = pe[9];
  const 偏 = 环境.ANIM_ZJ === '0' ? [[0, 0]] : [[0, 0], [-0.125, -0.375], [0.375, -0.125], [-0.375, 0.125], [0.125, 0.375], [-0.125, 0.375], [0.375, 0.125], [-0.375, -0.125], [0.125, -0.375]];
  stat.主新面 = 0;
  const 不透 = sceneOf(['实心', '镂空', '实心树叶']);
  const 花草 = sceneOf(['花草']);
  for (const [dx, dy] of 偏) {
    if (环境.ANIM_ZX !== '0') uOff.value.set(dx * 倍数, dy * 倍数); // 把这一遍的像素中心挪到了采样点；外推回去要往同方向走（画面往反方向挪）
    pe[8] = e8 + (2 * dx) / size.x; // 偏移按画布像素算，和 ANIM_ZS 无关
    pe[9] = e9 + (2 * dy) / size.y;
    gl.clear(true, true, true);
    gl.render(不透, camera);
    gl.readRenderTargetPixels(rt, 0, 0, w, h, pix);
    stat.主新面 += 记(pix, table, '主');
    gl.clear(true, false, false);
    gl.render(花草, camera);
    gl.readRenderTargetPixels(rt, 0, 0, w, h, pix);
    stat.主新面 += 记(pix, table, '主');
  }
  pe[8] = e8;
  pe[9] = e9;
  uOff.value.set(0, 0);
  // 投影：找级联阴影的光
  let cascades: THREE.OrthographicCamera[] = [];
  let 视口: THREE.Vector4[] = [];
  let mapSize = 0;
  let 灯数 = 0;
  scene.traverse((o) => {
    const l = o as THREE.Light;
    if (l.castShadow && l.shadow) {
      灯数++;
      const sh = l.shadow as unknown as { _cameras?: THREE.OrthographicCamera[]; _viewports: THREE.Vector4[]; mapSize: THREE.Vector2 };
      if (sh._cameras) {
        cascades = sh._cameras;
        视口 = sh._viewports;
        mapSize = sh.mapSize.x;
      }
    }
  });
  if (cascades.length && shadowProxies.length) {
    const srt = rtOf(mapSize, mapSize);
    const spix = new Uint8Array(mapSize * mapSize * 4);
    const s = new THREE.Scene();
    s.matrixWorldAutoUpdate = false;
    for (const m of shadowProxies) (s.children as THREE.Object3D[]).push(m);
    for (let ci = 0; ci < cascades.length; ci++) {
      const cam = cascades[ci];
      // 和真的阴影遍同样的像素格：图集里每级四周留了一圈，半径对应的是视口的像素数，不是整张 mapSize
      const vp = 视口[ci];
      srt.viewport.set((vp.x - ci) * mapSize, vp.y * mapSize, vp.z * mapSize, vp.w * mapSize);
      gl.setRenderTarget(srt);
      gl.clear(true, true, true);
      gl.info.autoReset = false;
      gl.info.reset();
      gl.render(s, cam);
      const 调 = gl.info.render.calls, 三 = gl.info.render.triangles;
      gl.info.autoReset = true;
      gl.readRenderTargetPixels(srt, 0, 0, mapSize, mapSize, spix);
      const 新 = 记(spix, table, '影');
      stat.影新面 = (stat.影新面 ?? 0) + 新;
      let 非空 = 0;
      const su = new Uint32Array(spix.buffer);
      for (let q = 0; q < su.length; q += 16) if (su[q]) 非空++;
      (stat as unknown as { 级: unknown[] }).级 = [...((stat as unknown as { 级?: unknown[] }).级 ?? []), { 调, 三, 新, 非空比: 非空 / (su.length / 16), 半径: cam.right, 近: cam.near, 远: cam.far, 位: cam.position.toArray().map((x) => Math.round(x)) }];
    }
  }
  gl.setRenderTarget(prevTarget);
  gl.setClearColor(prevColor, prevAlpha);
  gl.autoClear = prevAuto;
  gl.shadowMap.autoUpdate = prevShadowAuto;
  桩.事件('可见帧', { 网格: frameList, ...stat, 影图: mapSize, 宽: w, 高: h, 灯数, 投影网格: shadowProxies.length });
  量过++;
  if (量过 === 总帧) {
    const 出: Record<string, { 段: number[]; 主: number[]; 影: number[]; 并: number[] }> = {};
    for (const [k, rec] of 面记们) {
      const 主: number[] = [], 影: number[] = [], 并: number[] = [];
      for (let g = 0; g < rec.段.length - 1; g++) {
        let a = 0, b = 0, c = 0;
        for (let f = rec.段[g]; f < rec.段[g + 1]; f++) {
          if (rec.主[f]) a++;
          if (rec.影[f]) b++;
          if (rec.主[f] || rec.影[f]) c++;
        }
        主.push(a);
        影.push(b);
        并.push(c);
      }
      出[k] = { 段: rec.段, 主, 影, 并 };
    }
    桩.事件('可见汇总', 出);
    // 面位图交给缓存服务（离线裁缓存）：主 ∪ 影，一面一位，base64
    if (环境.ANIM_MC_URL) {
      const 位图: Record<string, string> = {};
      for (const [k, rec] of 面记们) {
        const bits = new Uint8Array((rec.n + 7) >> 3);
        for (let f = 0; f < rec.n; f++) if (rec.主[f] || rec.影[f]) bits[f >> 3] |= 1 << (f & 7);
        let s = '';
        for (let i = 0; i < bits.length; i += 8192) s += String.fromCharCode(...bits.subarray(i, i + 8192));
        位图[k] = btoa(s);
      }
      const x = new XMLHttpRequest();
      x.open('POST', `${环境.ANIM_MC_URL}/mask`, false);
      x.send(JSON.stringify(位图));
    }
  }
};
void 帧画;
