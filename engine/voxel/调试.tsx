// 体素世界的调试工具（用户 11-17 要：不在整帧上划线、找屏幕像素定位，一律按世界坐标）：都走试看参数（engine/core/试看.ts），still、film 试看模式都认，没设时画面、着色器源码都不变。
// 坐标默认是游戏坐标（F3 里的 x y z，经体素来源的 `toScene` 换成场景坐标）；某一项写 `场景: true` 就按场景坐标（Z 朝上）读。用法和例子见 docs/地形调试.md。
//   标记      [{名, 位: [x, y, z] 或 [x, z]（贴地）, 色?, 光柱?}]：画面上画点、名字和离镜头的距离（照地图模组的路标，总在最前面）；光柱从这一点竖直往上打一道光
//   区域      [{名, 点: [[x, z], …], 色?}]：世界里的多边形，地形上描边、内部淡淡染色
//   区域遮罩  true：出遮罩图，地形在区域里的像素写成区域的颜色、区域外写纯黑，不过 AO、雾、云影（只在遮罩里取平均，见 docs/地形调试.md）
//   按级着色  true 或 0～1 的不透明度：每个区段按它的级别（一格 1、2、4… 米）叠一种颜色，交界一眼看得出
//   世界网格  间距（米）：地形上按游戏坐标每隔这么多米画一道线（x 白、z 青，每 5 道粗一倍），配 标记 读出画面上一处的坐标
//   调试镜头  {位, 看}：只挪画面用的镜头；挑区段、定级别还照段里这一帧的镜头（冻结在这一帧），可以挪到交界正上方往下看、从侧面看各级怎么铺
//   加载视点  {位, 远?}：挑区段、定级别改按这一点算（四周都建，不按视锥剔，远默认同体素世界的 远），镜头不动
//   切级日志  true：每帧一行进终端：镜头离地多高、各级离镜头多远、看过去的俯角，和上一帧比哪些区段换了级（按世界坐标查切级跳变、量俯角用）
//   分级色调  {定级, 定级框, 真几何, 阴影, AO, 并色}：一小块地定成某一级、逐项关掉着色，量各级色调差；键的意思在 分级色调.ts
// 场景坐标照引擎约定：three 世界 = (x, z, −y)（engine/core/three换算.ts），画布外面套的那层旋转不能改。
// 体素世界（世界.tsx）只接一处：每次渲染调 `useTerrainDebug`，拿回要挂的标记、包了一层的 pickSections（加载视点、切级日志、定级、真几何）和几个开关；着色器那几项由 材质.ts、屏幕AO.tsx 来问。
import { addAfterEffect, addEffect } from '@react-three/fiber';
import React, { useMemo } from 'react';
import { Internals } from 'remotion';
import * as THREE from 'three';
import { trialParams } from '../core/试看.ts';
import { sceneToGame } from '../core/坐标.ts';
import { sceneToThree } from '../core/three换算.ts';
import { forceLevel, gradeTrial, type LevelBox } from './分级色调.ts';
import type { VoxelSource } from './生成.ts';
import { pickSections, sectionBounds, sectionKey, type PickSectionsParams, type SectionId } from './区段.ts';
import { makeFrustumTest } from './视锥.ts';

type Pos = number[];
type Marker = { 名: string; 位: Pos; 色?: string; '光柱'?: boolean | number; '场景'?: boolean };
type Region = { 名: string; '点': Pos[]; 色?: string; '场景'?: boolean };
type DebugCamera = { 位: Pos; 看: Pos; '场景'?: boolean };
type LoadView = { 位: Pos; 远?: number; '场景'?: boolean };

const markersParam = () => trialParams<Marker[]>('标记');
const regionsParam = () => trialParams<Region[]>('区域');
const maskOn = () => trialParams<boolean>('区域遮罩') === true;
const levelMaskOn = () => trialParams<boolean>('级别遮罩') === true;
const materialMaskOn = () => trialParams<boolean>('材质遮罩') === true;
// 材质遮罩的颜色：树叶（第 0 级的镂空、粗级的实心树叶）绿，实心（地面、原木、石头）棕，花草黄，水蓝
const materialMaskColors: Record<string, string> = { 镂空: 'vec3(0.0, 1.0, 0.0)', 实心树叶: 'vec3(0.0, 1.0, 0.0)', 实心: 'vec3(0.5, 0.25, 0.0)', 花草: 'vec3(1.0, 1.0, 0.0)', 水: 'vec3(0.0, 0.0, 1.0)' };
const levelTint = () => {
  const v = trialParams<boolean | number>('按级着色');
  return v === true ? 0.45 : typeof v === 'number' ? v : 0;
};
const gridParam = () => trialParams<number>('世界网格') ?? 0;
const debugCameraParam = () => trialParams<DebugCamera>('调试镜头');
const loadViewParam = () => trialParams<LoadView>('加载视点');
const pickLogOn = () => trialParams<boolean>('切级日志') === true;

// 默认的几种颜色（标记、区域没给 色 时轮着用）；按级着色：第 0～10 级，更粗的用最后一色
const defaultColors = ['#ff3b3b', '#2f8bff', '#ffd400', '#00d68f', '#ff7a00', '#c04bff', '#00e5ff', '#ff4fd8'];
const levelColors = ['#ff3030', '#ff9a1f', '#ffe81f', '#3fdc4a', '#1fd6ff', '#4a6bff', '#d24aff', '#ff4fb0', '#ffffff', '#8a8a8a', '#3a3a3a'];
const srgb = (css: string) => {
  const c = new THREE.Color();
  c.setStyle(css, THREE.SRGBColorSpace);
  return c.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
};
const colorOf = (css: string | undefined, i: number) => css ?? defaultColors[i % defaultColors.length]!;

// 游戏坐标 → 场景坐标：[x, y, z] 三个都给；[x, z] 两个给的是水平位置（y 由调用方补）
const toScene = (source: VoxelSource, p: Pos, isScene?: boolean): number[] | null => {
  if (isScene) return p.length === 3 ? p : [p[0]!, p[1]!, NaN];
  if (!source.toScene) {
    console.warn('[地形调试] 这个体素来源没给 toScene，游戏坐标换不成场景坐标；改写 场景: true 用场景坐标');
    return null;
  }
  if (p.length === 3) return source.toScene(p);
  const s = source.toScene([p[0]!, 0, p[1]!]);
  return [s[0], s[1], NaN];
};
const probe = { z: 0, crown: 0 };
const groundZ = (source: VoxelSource, x: number, y: number) => {
  source.采样(x, y, probe);
  return probe.z + probe.crown;
};

// ---------- 着色器：区域、区域遮罩、按级着色（体素材质 onBeforeCompile 里调，材质.ts） ----------
const maxRegions = 8;
const maxPoints = 64;
export const debugShaderOn = () => !!regionsParam()?.length || levelTint() > 0 || gridParam() > 0 || levelMaskOn() || materialMaskOn();
const uniforms = {
  uDbgPts: { value: Array.from({ length: maxPoints }, () => new THREE.Vector2()) },
  uDbgStart: { value: new Array<number>(maxRegions + 1).fill(0) },
  uDbgRegions: { value: 0 },
  uDbgColor: { value: Array.from({ length: maxRegions }, () => new THREE.Vector3()) },
  uDbgGameOff: { value: new THREE.Vector2() }, // 场景 (x, y) → 游戏 (x, z)：x 游戏 = x 场景 − 偏.x，z 游戏 = 偏.y − y 场景
};
const levelPalette = levelColors.map((c) => {
  const { r, g, b } = srgb(c);
  return `vec3(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)})`;
});
const levelColorGlsl = `int lv = int(clamp(floor(log2(max(vDbgCell, 1e-3)) + 0.5), 0.0, ${levelColors.length - 1}.0));
      vec3 lc = ${levelPalette.map((c, i) => (i < levelPalette.length - 1 ? `lv == ${i} ? ${c} : ` : c)).join('')};`;
const debugFrag = (mask: boolean, tint: number, materialClass: string) =>
  materialMaskOn()
    ? `
  gl_FragColor = vec4(${materialMaskColors[materialClass] ?? 'vec3(1.0, 0.0, 1.0)'}, 1.0);`
    : levelMaskOn()
    ? `
  {
      ${levelColorGlsl}
      gl_FragColor = vec4(lc, 1.0);
  }`
    : `
  {
    vec2 sp = vec2(vDbgWorld.x, -vDbgWorld.z);
    float edge = 1e9;
    vec3 edgeColor = vec3(0.0);
    int hit = -1;
    for (int r = 0; r < ${maxRegions}; r++) {
      if (r >= uDbgRegions) break;
      int s = uDbgStart[r], e = uDbgStart[r + 1];
      bool inside = false;
      for (int i = 0; i < ${maxPoints}; i++) {
        int k = s + i;
        if (k >= e) break;
        int k2 = k + 1 == e ? s : k + 1;
        vec2 a = uDbgPts[k], b = uDbgPts[k2];
        if ((a.y > sp.y) != (b.y > sp.y) && sp.x < (b.x - a.x) * (sp.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
        vec2 ab = b - a;
        float t = clamp(dot(sp - a, ab) / max(dot(ab, ab), 1e-9), 0.0, 1.0);
        float d = length(sp - a - ab * t);
        if (d < edge) { edge = d; edgeColor = uDbgColor[r]; }
      }
      if (inside && hit < 0) hit = r;
    }
    ${
      mask
        ? 'gl_FragColor = vec4(hit >= 0 ? uDbgColor[hit] : vec3(0.0), 1.0);'
        : `${tint > 0 ? `{
      ${levelColorGlsl}
      gl_FragColor.rgb = mix(gl_FragColor.rgb, lc, ${tint.toFixed(3)});
    }` : ''}
    if (hit >= 0) gl_FragColor.rgb = mix(gl_FragColor.rgb, uDbgColor[hit], 0.15);
    float px = max(max(fwidth(sp.x), fwidth(sp.y)), 1e-4);
    if (edge < 2.5 * px) gl_FragColor.rgb = edgeColor;${gridParam() > 0 ? `
    {
      vec2 g = vec2(sp.x - uDbgGameOff.x, uDbgGameOff.y - sp.y) / ${gridParam().toFixed(3)};
      vec2 gd = abs(fract(g + 0.5) - 0.5) * ${gridParam().toFixed(3)};
      vec2 major = step(abs(fract(g / 5.0 + 0.5) - 0.5) * 5.0, vec2(0.5));
      // 线距在画面上不到 6 个像素就只画粗的，粗的也不到 6 个像素就不画（远处密成一片）
      float lineGap = ${gridParam().toFixed(3)} / px;
      vec2 on = vec2(lineGap >= 6.0 ? 1.0 : major.x * step(6.0, lineGap * 5.0), lineGap >= 6.0 ? 1.0 : major.y * step(6.0, lineGap * 5.0));
      if (on.x > 0.5 && gd.x < (1.2 + 1.2 * major.x) * px) gl_FragColor.rgb = vec3(1.0);
      else if (on.y > 0.5 && gd.y < (1.2 + 1.2 * major.y) * px) gl_FragColor.rgb = vec3(0.0, 0.9, 1.0);
    }` : ''}`
    }
  }`;
export const patchDebugShader = (sh: THREE.WebGLProgramParametersWithUniforms, materialClass: string) => {
  Object.assign(sh.uniforms, uniforms);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vDbgWorld; varying float vDbgCell;')
    // 一格几米：同 材质.ts 算 vW 时除的那个数（批绘制时缩放在 uSec.w 里）
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vDbgWorld = (modelMatrix * vec4(transformed, 1.0)).xyz; vDbgCell = length(modelMatrix[0].xyz) * uSec.w * 64.0;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vDbgWorld; varying float vDbgCell;\nuniform vec2 uDbgPts[${maxPoints}]; uniform int uDbgStart[${maxRegions + 1}]; uniform int uDbgRegions; uniform vec3 uDbgColor[${maxRegions}]; uniform vec2 uDbgGameOff;`)
    .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${debugFrag(maskOn(), levelTint(), materialClass)}`);
};
// 屏幕 AO 第 2 遍要不要整个跳过（遮罩图不能被 AO、雾、云影改了颜色，屏幕AO.tsx）
export const aoSkippedForMask = () => (maskOn() && !!regionsParam()?.length) || levelMaskOn() || materialMaskOn();

// 区域换成场景坐标写进 uniform（各体素世界共用；同一帧只该有一个体素来源在用区域）
const loadRegions = (source: VoxelSource) => {
  const regions = regionsParam() ?? [];
  let n = 0;
  let r = 0;
  for (const [i, region] of regions.entries()) {
    if (r >= maxRegions) break;
    const pts = region['点'].map((p) => toScene(source, p, region['场景'])).filter((p): p is number[] => !!p);
    if (pts.length < 3 || n + pts.length > maxPoints) continue;
    uniforms.uDbgStart.value[r] = n;
    for (const p of pts) uniforms.uDbgPts.value[n++]!.set(p[0]!, p[1]!);
    const { r: cr, g, b } = srgb(colorOf(region.色, i));
    uniforms.uDbgColor.value[r]!.set(cr, g, b);
    r++;
  }
  uniforms.uDbgStart.value[r] = n;
  uniforms.uDbgRegions.value = r;
  const s0 = source.toScene?.([0, 0, 0]);
  if (s0) uniforms.uDbgGameOff.value.set(s0[0]!, s0[1]!);
};
// 场景坐标 → 游戏坐标，打日志用：toScene 是 gameToScene 加原点，原点从 toScene(0, 0, 0) = (−ox, oz, −oy) 反推
const gameOrigin = (source: VoxelSource): [number, number, number] | null => {
  const s0 = source.toScene?.([0, 0, 0]);
  return s0 ? [-s0[0]!, -s0[2]!, s0[1]!] : null;
};
let lastCameraLog = '';

// ---------- 切级日志：这一帧挑了哪些区段，和上一帧比谁换了级 ----------
// 每帧一行（挑的区段没变不重打）。镜头：游戏坐标；离地：镜头比正下方地物顶高几米；界：第 L−1、L 级的交界离镜头多远（米，门槛换出来的）；
// 级：每一级 [块数, 最近, 最远（米，同 pickSections 的算法）, 最近那块的俯角, 最远那块的俯角（度，镜头看区段中心地物顶，水平 = 0）]；
// 换：和上一帧比新画的（+）、不画了的（−），写成 级|游戏x0|游戏z0|边长（区段西北角）。只打视野里的（就是 pickSections 挑出来的）。
// 镜头位置、门槛、每像素张角取自挑出这份名单的那次参数（加载视点 开着就是那一点）
// 每个体素来源各记一份（一段里可以挂几个体素世界）；同一帧画面重画几次只打第一次
const lastPicks = new WeakMap<VoxelSource, { keys: Set<string>; text: string }>();
let debugFrame = -1;
const logPick = (source: VoxelSource, list: SectionId[], params: PickSectionsParams) => {
  const o = gameOrigin(source);
  const [cx, cy, cz] = params.camPos as [number, number, number];
  const { featureTop } = params;
  // 同 pickSections 的细分条件反过来：细一级的一格正好到门槛时离镜头多远
  const boundaryM = (level: number) => 2 ** (level - 1) / (params.pixelAngle * params.splitPixels);
  const levels = new Map<number, { n: number; near: number; far: number; nearDeg: number; farDeg: number }>();
  for (const q of list) {
    const [x0, y0, size] = sectionBounds(q);
    const top = featureTop(x0 + size / 2, y0 + size / 2);
    const dxy = Math.hypot(Math.max(x0 - cx, 0, cx - x0 - size), Math.max(y0 - cy, 0, cy - y0 - size));
    const dist = Math.max(1, Math.hypot(dxy, Math.max(0, cz - top)));
    const deg = (Math.atan2(cz - top, Math.hypot(x0 + size / 2 - cx, y0 + size / 2 - cy)) * 180) / Math.PI;
    const e = levels.get(q.L) ?? { n: 0, near: Infinity, far: -Infinity, nearDeg: 0, farDeg: 0 };
    e.n++;
    if (dist < e.near) (e.near = dist), (e.nearDeg = deg);
    if (dist > e.far) (e.far = dist), (e.farDeg = deg);
    levels.set(q.L, e);
  }
  const keys = new Set(list.map(sectionKey));
  const name = (k: string) => {
    const [L, i, j] = k.split('|').map(Number) as [number, number, number];
    const [x0, y0, size] = sectionBounds({ L, i, j });
    // 游戏 x = 场景 x + ox，游戏 z = oz − 场景 y：区段的西北角（游戏 z 最小）是场景 y 最大那一边
    return o ? `${L}|${x0 + o[0]}|${o[2] - (y0 + size)}|${size}` : `${L}|场景${x0}|${y0}|${size}`;
  };
  const last = lastPicks.get(source);
  const game = o ? sceneToGame([cx, cy, cz], o).map((v) => +v.toFixed(1)) : null;
  const text = JSON.stringify({
    '帧': debugFrame,
    '镜头': game,
    '离地': +(cz - featureTop(cx, cy)).toFixed(1),
    '界': Object.fromEntries([1, 2, 3, 4, 5, 6].map((L) => [L, Math.round(boundaryM(L))])),
    '级': Object.fromEntries([...levels.entries()].sort((a, b) => a[0] - b[0]).map(([L, e]) => [L, [e.n, Math.round(e.near), Math.round(e.far), +e.nearDeg.toFixed(1), +e.farDeg.toFixed(1)]])),
  });
  if (last?.text === text) return;
  const changed = last ? [...[...keys].filter((k) => !last.keys.has(k)).map((k) => `+${name(k)}`), ...[...last.keys].filter((k) => !keys.has(k)).map((k) => `-${name(k)}`)] : [];
  lastPicks.set(source, { keys, text });
  // 用 warn：still、film 只把浏览器的 warn、error 打到终端
  console.warn(`[地形调试] 切级 ${text.slice(0, -1)},"换":${JSON.stringify(changed)}}`);
};

// ---------- 调试镜头：只在 R3F 画一帧的那一段换成调试机位，画完换回（同 engine/段/望远.ts 的做法），挑区段时读到的还是段里的镜头 ----------
type CameraSwap = { camera: THREE.Camera; pos: THREE.Vector3; target: THREE.Vector3 };
let swap: CameraSwap | null = null;
let swapped: { camera: THREE.Camera; pos: THREE.Vector3; quat: THREE.Quaternion; up: THREE.Vector3 } | null = null;
if (debugCameraParam()) {
  addEffect(() => {
    if (!swap || swapped) return;
    const { camera: cam } = swap;
    swapped = { camera: cam, pos: cam.position.clone(), quat: cam.quaternion.clone(), up: cam.up.clone() };
    cam.position.copy(swap.pos);
    // 正上往下看时视线和「上」平行，改拿场景北（−z）当上
    const dir = swap.target.clone().sub(swap.pos).normalize();
    cam.up.set(0, 1, 0);
    if (Math.abs(dir.y) > 0.999) cam.up.set(0, 0, -1);
    cam.lookAt(swap.target);
    cam.updateMatrixWorld();
  });
  addAfterEffect(() => {
    if (!swapped) return;
    const { camera: cam, pos, quat, up } = swapped;
    cam.position.copy(pos);
    cam.quaternion.copy(quat);
    cam.up.copy(up);
    cam.updateMatrixWorld();
    swapped = null;
  });
}

// ---------- 标记：屏幕上固定像素大小的点、名字牌、光柱，不做深度比较（总在最前面），不投影 ----------
const quadGeometry = (corners: number[]) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Array(12).fill(0), 3));
  g.setAttribute('corner', new THREE.Float32BufferAttribute(corners, 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
  return g;
};
// 像素大小按 720 高的页面写，乘「这次画的目标高 ÷ 720」（4K 成片 3 倍）
const pixelScale = (renderer: THREE.WebGLRenderer, size: THREE.Vector2) => {
  const target = renderer.getRenderTarget();
  if (target) size.set(target.width, target.height);
  else renderer.getDrawingBufferSize(size);
  return size.y / 720;
};
const billboardVS = `
attribute vec2 corner;
uniform vec3 uAnchor; uniform vec2 uSizePx; uniform vec2 uOffsetPx; uniform vec2 uViewport;
varying vec2 vUv;
void main() {
  vUv = corner * 0.5 + 0.5;
  vec4 c = projectionMatrix * viewMatrix * vec4(uAnchor, 1.0);
  if (c.w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  c.xy += (corner * uSizePx * 0.5 + uOffsetPx) / uViewport * 2.0 * c.w;
  c.z = 0.0;
  gl_Position = c;
}`;
const beamVS = `
attribute vec2 corner;
uniform vec3 uAnchor; uniform float uHeight; uniform float uWidthPx; uniform vec2 uViewport;
varying vec2 vUv;
void main() {
  vUv = corner * 0.5 + 0.5;
  vec4 b = viewMatrix * vec4(uAnchor, 1.0);
  vec4 t = viewMatrix * vec4(uAnchor + vec3(0.0, uHeight, 0.0), 1.0);
  if (b.z > -0.1) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  if (t.z > -0.1) t = mix(b, t, (b.z + 0.1) / (b.z - t.z));
  vec4 cb = projectionMatrix * b, ct = projectionMatrix * t;
  vec2 d = (ct.xy / ct.w - cb.xy / cb.w) * uViewport;
  vec2 n = length(d) > 1e-6 ? normalize(vec2(-d.y, d.x)) : vec2(1.0, 0.0);
  vec4 c = corner.y > 0.0 ? ct : cb;
  c.xy += n * corner.x * uWidthPx * 0.5 / uViewport * 2.0 * c.w;
  c.z = 0.0;
  gl_Position = c;
}`;
const corners = [-1, -1, 1, -1, 1, 1, -1, 1];
const newMaterial = (vertexShader: string, fragmentShader: string, extra: Record<string, THREE.IUniform>) =>
  new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { uAnchor: { value: new THREE.Vector3() }, uViewport: { value: new THREE.Vector2(1, 1) }, ...extra },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide, // 光柱在屏幕上往哪边展开随视角变，正反面都画
  });
type MarkerItem = { name: string; scenePos: number[]; color: string; beam: number };
const labelFont = (h: number) => `bold ${h}px "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", sans-serif`;
const formatDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 1 : 2)} km` : `${Math.round(m)} m`);
const buildMarker = (item: MarkerItem) => {
  const group = new THREE.Group();
  const anchor = sceneToThree(item.scenePos);
  const { r, g, b } = srgb(item.color);
  const col = `vec3(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)})`;
  const objects: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; size?: [number, number]; offset?: [number, number]; width?: number }[] = [];
  const add = (mat: THREE.ShaderMaterial, order: number, extra: Omit<(typeof objects)[number], 'mesh' | 'mat'>) => {
    mat.uniforms.uAnchor!.value.copy(anchor);
    const mesh = new THREE.Mesh(quadGeometry(corners), mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1e6 + order;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    objects.push({ mesh, mat, ...extra });
    return mesh;
  };
  if (item.beam > 0)
    add(newMaterial(beamVS, `varying vec2 vUv; void main() { float a = (1.0 - abs(vUv.x * 2.0 - 1.0)) * mix(0.85, 0.15, vUv.y); gl_FragColor = vec4(${col}, a); }`, { uHeight: { value: item.beam }, uWidthPx: { value: 6 } }), 0, { width: 6 });
  // 点：带黑边的实心圆
  add(newMaterial(billboardVS, `varying vec2 vUv; void main() { float d = length(vUv * 2.0 - 1.0); if (d > 1.0) discard; gl_FragColor = vec4(d > 0.62 ? vec3(0.0) : ${col}, 1.0); }`, { uSizePx: { value: new THREE.Vector2() }, uOffsetPx: { value: new THREE.Vector2() } }), 1, { size: [14, 14], offset: [0, 0] });
  // 名字牌：名字 + 离镜头的距离，画进一张 canvas 贴图，距离变了才重画
  const canvas = document.createElement('canvas');
  const ctx2d = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  const labelMat = newMaterial(billboardVS, 'uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, vUv); }', { map: { value: texture }, uSizePx: { value: new THREE.Vector2() }, uOffsetPx: { value: new THREE.Vector2() } });
  const label = { size: [0, 0] as [number, number], offset: [0, 0] as [number, number] };
  const labelMesh = add(labelMat, 2, label);
  let lastText = '';
  const fontPx = 64;
  const drawLabel = (text: string) => {
    ctx2d.font = labelFont(fontPx);
    const w = Math.ceil(ctx2d.measureText(text).width) + fontPx * 0.8;
    const h = Math.ceil(fontPx * 1.4);
    canvas.width = w;
    canvas.height = h;
    ctx2d.font = labelFont(fontPx);
    ctx2d.fillStyle = 'rgba(0,0,0,0.6)';
    ctx2d.fillRect(0, 0, w, h);
    ctx2d.fillStyle = item.color;
    ctx2d.fillRect(0, 0, fontPx * 0.18, h);
    ctx2d.fillStyle = '#ffffff';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText(text, fontPx * 0.45, h / 2);
    texture.needsUpdate = true;
    // 字高 18 页面像素，牌子在点的右上方
    const k = 18 / fontPx;
    // 原地改：objects 里存的是这两个数组的引用
    label.size[0] = w * k * 0.75;
    label.size[1] = h * k * 0.75;
    label.offset[0] = label.size[0] / 2 + 10;
    label.offset[1] = label.size[1] / 2 + 6;
  };
  const viewport = new THREE.Vector2();
  const camPos = new THREE.Vector3();
  for (const o of objects)
    o.mesh.onBeforeRender = (renderer, _scene, camera) => {
      const k = pixelScale(renderer, viewport);
      if (o.mesh === labelMesh) {
        camPos.setFromMatrixPosition(camera.matrixWorld);
        const text = `${item.name} ${formatDistance(camPos.distanceTo(anchor))}`;
        if (text !== lastText) drawLabel((lastText = text));
      }
      o.mat.uniforms.uViewport!.value.copy(viewport);
      if (o.size) o.mat.uniforms.uSizePx!.value.set(o.size[0] * k, o.size[1] * k);
      if (o.offset) o.mat.uniforms.uOffsetPx!.value.set(o.offset[0] * k, o.offset[1] * k);
      if (o.width) o.mat.uniforms.uWidthPx!.value = o.width * k;
    };
  return group;
};

// ---------- 挑区段过这一层：加载视点、切级日志，分级色调 的 定级、真几何 ----------
// 体素世界这一帧每次挑区段（含替后几帧预取的）都走返回的函数；这几项都没开时返回的就是 区段.ts 的 pickSections 本身。
// pickedWith：名单 → 挑出它的那次参数，切级日志 照它算距离和俯角
const pickedWith = new WeakMap<SectionId[], PickSectionsParams>();
// 真几何：望远（engine/段/望远.ts）把裁剪矩阵、倍数挂在 globalThis 上；没开、这一页不是望远时返回 undefined
const teleView = () => (gradeTrial()['真几何'] ? (globalThis as { __animTele?: { crop: THREE.Matrix4; zoom: number } }).__animTele : undefined);
const debugPick = (source: VoxelSource): typeof pickSections => {
  const loadView = loadViewScene(source);
  const forced = forcedLevelScene(source);
  const logOn = pickLogOn();
  if (!loadView && !forced && !logOn && !gradeTrial()['真几何']) return pickSections;
  const far = loadViewParam()?.远;
  return (params) => {
    const tele = teleView();
    let used: PickSectionsParams = tele ? { ...params, pixelAngle: params.pixelAngle / tele.zoom } : params;
    if (loadView) used = { ...used, camPos: loadView, farM: far ?? params.farM, inView: () => true };
    const picked = pickSections(used);
    const list = forced ? forceLevel(picked, forced.level, forced.boxes) : picked;
    if (logOn) pickedWith.set(list, used);
    return list;
  };
};
// 定级的框换成场景坐标的水平范围（没开返回 null）：定级框 每个框两个对角，没给就拿各个 区域 的外接框
const forcedLevelScene = (source: VoxelSource): { level: number; boxes: LevelBox[] } | null => {
  const grade = gradeTrial();
  const level = grade['定级'];
  if (level === undefined) return null;
  const groups = grade['定级框']?.map((corners) => ({ corners: corners as Pos[], isScene: grade['场景'] })) ?? regionsParam()?.map((r) => ({ corners: r['点'], isScene: r['场景'] })) ?? [];
  const boxes = groups.flatMap(({ corners, isScene }): LevelBox[] => {
    const pts = corners.map((p) => toScene(source, p, isScene)).filter((p): p is number[] => !!p);
    if (!pts.length) return [];
    const xs = pts.map((p) => p[0]!), ys = pts.map((p) => p[1]!);
    return [[Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]];
  });
  if (!boxes.length) {
    console.warn('[分级色调] 定级 要配 定级框 或 区域，这次不定级');
    return null;
  }
  return { level, boxes };
};
// 加载视点换成场景坐标（没开返回 null）
const loadViewScene = (source: VoxelSource): number[] | null => {
  const v = loadViewParam();
  if (!v) return null;
  const p = toScene(source, v.位, v['场景']);
  if (!p) return null;
  if (Number.isNaN(p[2])) p[2] = groundZ(source, p[0]!, p[1]!) + 2;
  return p;
};

// ---------- 体素世界里挂的调试：没开任何一项时什么都不做 ----------
const terrainDebugOn = () => levelMaskOn() || materialMaskOn() || pickLogOn() || !!(markersParam()?.length || regionsParam()?.length || debugCameraParam() || levelTint() > 0 || gridParam() > 0 || loadViewParam());
export type TerrainDebug = {
  /** 要挂进场景的标记（没有是空数组），交给 TerrainMarkers */
  markers: THREE.Group[];
  /** 这一帧挑区段都走它（上面「挑区段过这一层」） */
  pickSections: typeof pickSections;
  /** 切级日志：给这一帧要画的那份名单（上面那个函数返回的原数组）；没开什么都不做 */
  logPick: (list: SectionId[]) => void;
  /** 调试镜头、加载视点 开着：画面不是从挑区段的位置看的，各朝向的面都要画 */
  allFacing: boolean;
  /** 分级色调 的 真几何：望远后的视野判断，替掉照原整帧镜头建的那个；没开是 undefined。视锥.ts 的判断函数共用一个视锥，拿了它就别再照镜头另建 */
  inView?: ReturnType<typeof makeFrustumTest>;
  /** 分级色调 的 阴影 false：地形不投影 */
  noShadow: boolean;
};
// 每次渲染调：区域写进 uniform、调试镜头换成场景坐标登记
export const useTerrainDebug = (source: VoxelSource, camera: THREE.Camera): TerrainDebug => {
  // 整段的帧号（不是所在 Sequence 里的）：切级日志 用。Remotion 外面（没有时间轴）拿到 0
  debugFrame = Internals.Timeline.useTimelinePosition();
  const markers = useMemo(() => {
    const list = markersParam() ?? [];
    const out: MarkerItem[] = [];
    for (const [i, m] of list.entries()) {
      const p = toScene(source, m.位, m['场景']);
      if (!p) continue;
      if (Number.isNaN(p[2])) p[2] = groundZ(source, p[0]!, p[1]!);
      out.push({ name: m.名, scenePos: p, color: colorOf(m.色, i), beam: m['光柱'] === true ? 1500 : typeof m['光柱'] === 'number' ? m['光柱'] : 0 });
    }
    return out.map(buildMarker);
  }, [source]);
  useMemo(() => loadRegions(source), [source]);
  const pick = useMemo(() => debugPick(source), [source]);
  if (terrainDebugOn()) {
    // 段里这一帧镜头的游戏坐标进浏览器日志（still、film 的输出里看得到），定标记、调试镜头的位置用
    const e = camera.matrixWorld.elements;
    const o = gameOrigin(source);
    const game = o && sceneToGame([e[12]!, -e[14]!, e[13]!], o);
    const ahead = o && sceneToGame([e[12]! - e[8]! * 100, -(e[14]! - e[10]! * 100), e[13]! - e[9]! * 100], o);
    const text = game && ahead ? `[地形调试] 镜头 游戏坐标 ${game.map((v) => v.toFixed(1)).join(' ')}，前方 100 米 ${ahead.map((v) => v.toFixed(1)).join(' ')}` : '';
    // 用 warn：still、film 只把浏览器的 warn、error 打到终端
    if (text && text !== lastCameraLog) console.warn((lastCameraLog = text));
  }
  const tele = teleView();
  const cam = debugCameraParam();
  if (cam) {
    const p = toScene(source, cam.位, cam['场景']), t = toScene(source, cam.看, cam['场景']);
    if (p && t) {
      if (Number.isNaN(p[2])) p[2] = groundZ(source, p[0]!, p[1]!);
      if (Number.isNaN(t[2])) t[2] = groundZ(source, t[0]!, t[1]!);
      swap = { camera, pos: sceneToThree(p), target: sceneToThree(t) };
    }
  }
  return {
    markers,
    pickSections: pick,
    logPick: (list) => {
      const params = pickedWith.get(list);
      if (params) logPick(source, list, params);
    },
    allFacing: !!cam || !!loadViewParam(),
    ...(tele ? { inView: makeFrustumTest({ projectionMatrix: tele.crop.clone().multiply(camera.projectionMatrix), matrixWorldInverse: camera.matrixWorldInverse } as THREE.Camera) } : {}),
    noShadow: gradeTrial()['阴影'] === false,
  };
};

export const TerrainMarkers: React.FC<{ markers: THREE.Group[] }> = ({ markers }) => {
  // 标记挂在画布外面套的旋转（场景 Z 朝上）里面也照 three 世界坐标画：着色器用的是 viewMatrix，不乘 modelMatrix
  return (
    <>
      {markers.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
};
