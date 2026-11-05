// 光影层：放进三渲二画布接管渲染（useFrame 优先级 1，在平涂换完材质之后），一帧四步，都只看这一帧（不跨帧累积，乱序、并行出帧结果一样）：
// 1. 太阳的影子图（光照 关了不画，下面第 2 步也不换受光的变体）：正交机从太阳那边看，只画受光的平涂网格（发光方片、粒子、天这些不挡光）和只挡光的组（剖掉的墙），深度进影子图（剖掉的不挡光 时镜头近裁剪面前面的不画）。影子图一个纹素 1/32 格（像素阴影；不按像素时 1/256 格，不够大才放粗），
//    框按纹素吸附，镜头动的时候影子边不游；
// 2. 主画面画进离屏图（半精度浮点，同画布存 sRGB 编码后的值）：受光的平涂材质换成补了光影的变体（着色.ts），标了水的换成补了波纹反光的变体，画完换回来；
// 3. 泛光：只画粒子的泛光源（被主画面挡住的丢掉）；取亮部（加上泛光源）缩一半，再缩五次，每层横竖各糊一遍；
// 4. 云（光影选项.云 开着时）：主画面的深度换成对数深度，交给云组件（engine/light/云/画云.ts）画进一张离屏图；
// 5. 合成到画布：调色、叠在天（天的样式是 Photon平滑 时）和云上、叠泛光；不画天时透明度照原样（画布后面的 2D 天、远景照常透出来）。
// 描边：开光影时不描（本作品全片不描边，规矩 不描边）。
// 天、云、光照是三个能单独开关的组件（用户 11-04 定）：天 = engine/light/天/Photon天.ts，云 = engine/light/云/。应力转动用的 engine/light/大气.ts、大气/云.ts 不动。
import { useFrame, useThree } from '@react-three/fiber';
import React, { useEffect, useMemo } from 'react';
import { cancelRender, continueRender, delayRender, useCurrentFrame, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import sunPng from 'asset:贴图/场景/天空/sun';
import { 场景到three } from '../../core/three换算.ts';
import { atmoUniforms, atmosphere } from '../../light/大气.ts';
import { Photon天, 备天色图 } from '../../light/天/Photon天.ts';
import { 画云 as 画云层, 预编云 } from '../../light/云/画云.ts';
import { png } from '../../model/贴图.ts';
import { 全屏顶点, 合成片元, 取亮片元, 对数深度片元, 新光影统一量, 是粒子材质, 最多粒子光, 最多补光, 糊片元, 缩片元, 补受光, 补水面, 补粒子源, type 光影统一量 } from './着色.ts';
import { 光影画云, 取光影参数, type 光影选项, type 时段, type 时段光, type 补光 } from './预设.ts';

/** 影子图边长（纹素） */
const 影子图边 = 4096;
/** 透视镜头的影子只算到这么远（格） */
const 透视影距 = 80;
/** Photon 天的空气雾算到多远（米）：同 engine/light/环境.ts 主世界画法不给时的地形远端 */
const 天远 = 40000;
/** 原版太阳：贴图 32×32 里本体是正中 8×8（第 12～19 格），本体离镜头 100 格、半边 7.5 格（同 作品/把回忆拼好给你/场/2-海上/天.tsx 的 2D 天）。
 *  材质包的高清太阳是原版的 k 倍（Faithful 32x 是 64×64，本体 16×16 在第 24～39 格），本体起、本体边都乘 k（用户 11-03 看了 2-日落划船 的高清太阳定「高清版对」，不退回原版粗格子） */
const 本体起 = 12;
const 本体边 = 8;
const 太阳距 = 100;
const 太阳半边 = 7.5;

const 平涂受光 = (m: THREE.Material) => !!m.userData.平涂 && m.customProgramCacheKey().includes('|平涂');

/** 场景没说时段时按平涂色调猜：暗 = 夜，偏红 = 日落 */
export const 猜时段 = (色调: string | undefined): 时段 => {
  const c = new THREE.Color().setStyle(色调 ?? '#ffffff', THREE.LinearSRGBColorSpace);
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (l < 0.55) return '夜';
  if (c.r > c.b * 1.25) return '日落';
  return '白天';
};

type 变体 = { 光: THREE.Material };
const 变体表 = new WeakMap<THREE.Material, 变体 | null>();

const 取变体 = (m: THREE.Material, u: 光影统一量): THREE.Material | null => {
  let e = 变体表.get(m);
  if (e === undefined) {
    e = null;
    const 种 = 平涂受光(m) ? '' : 是粒子材质(m) ? '粒子' : (m as THREE.MeshBasicMaterial).isMeshBasicMaterial ? '水' : null;
    if (种 !== null) {
      const v = m.clone();
      // 粒子的 uniform 每帧在原材质上改（贴图），变体和它共用同一份；粒子的变体只用来画泛光源。叠在一起的取最亮的（同画面里看得到的那一个），
      // 不加起来：加起来密的一团（照片里缩小的烟花）会叠成一大团白
      if (种 === '粒子')
        Object.assign(v, { uniforms: (m as THREE.ShaderMaterial).uniforms, blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, depthTest: false, depthWrite: false, transparent: true });
      v.userData.光影 = true;
      v.onBeforeCompile = (shader, renderer) => {
        m.onBeforeCompile(shader, renderer);
        if (种 === '') 补受光(shader, u);
        else if (种 === '粒子') 补粒子源(shader, u);
        else 补水面(shader, u);
      };
      v.customProgramCacheKey = () => `${m.customProgramCacheKey()}|光影${种}`;
      m.addEventListener('dispose', () => v.dispose());
      e = { 光: v };
    }
    变体表.set(m, e);
  }
  return e?.光 ?? null;
};

/** 水面材质：基础色材质里只有着色器认得的（海面）才换；不认得的换上去也只是原样，但多编一份程序，所以先按缓存键筛一下 */
const 像水 = (m: THREE.Material) => (m as THREE.MeshBasicMaterial).isMeshBasicMaterial && /海面|水面/.test(m.customProgramCacheKey());

type 资源 = ReturnType<typeof 建资源>;

const 新全屏 = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) => {
  const 材质 = new THREE.ShaderMaterial({ uniforms, vertexShader: 全屏顶点, fragmentShader, depthTest: false, depthWrite: false, toneMapped: false });
  const 片 = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), 材质);
  片.frustumCulled = false;
  const 场 = new THREE.Scene();
  场.add(片);
  return { 材质, 片, 场 };
};

const 建资源 = () => {
  const u = 新光影统一量();
  const 影 = new THREE.WebGLRenderTarget(影子图边, 影子图边, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    depthTexture: new THREE.DepthTexture(影子图边, 影子图边, THREE.UnsignedIntType),
  });
  const 影机 = new THREE.OrthographicCamera();
  const 浮点 = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false } as const;
  const 主 = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
  });
  // 主画面照画布那样存 sRGB 编码后的值（混色也在 sRGB 上做，同画布）。坑：three 画进离屏图一律输出线性（r186 WebGLPrograms 的 outputColorSpace），
  // 只有标成 XR 的离屏图才按它贴图的色彩空间输出；场景里有接在 colorspace_fragment 后面、按 sRGB 数值混的补丁（原版柱形雾），输出线性时雾色会发白
  主.texture.colorSpace = THREE.SRGBColorSpace;
  (主 as unknown as { isXRRenderTarget: boolean }).isXRRenderTarget = true;
  // 云：对数深度（浮点，一像素一值）、云画好的图（画面值、预乘）
  const 深 = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
  const 云 = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  const 对数深 = 新全屏(对数深度片元, { tDepth: { value: null }, cNear: { value: 0.1 }, cFar: { value: 1000 } });
  // 泛光六层：1/2 到 1/64，每层一对（糊的时候来回倒）；后两层只在 泛光.宽 大于 0 时有分量（烟花那种大光晕）
  const 层 = Array.from({ length: 6 }, () => [new THREE.WebGLRenderTarget(1, 1, 浮点), new THREE.WebGLRenderTarget(1, 1, 浮点)] as const);
  const 粒源 = new THREE.WebGLRenderTarget(1, 1, 浮点);
  const 取亮 = 新全屏(取亮片元, { tSrc: { value: null }, tAdd: { value: null }, addK: { value: 0 }, texel: { value: new THREE.Vector2() }, threshold: { value: 1 }, knee: { value: 0.2 } });
  const 缩 = 新全屏(缩片元, { tSrc: { value: null }, texel: { value: new THREE.Vector2() } });
  const 糊 = 新全屏(糊片元, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });
  const 合 = 新全屏(合成片元, {
    tColor: { value: null },
    tB0: { value: null },
    tB1: { value: null },
    tB2: { value: null },
    tB3: { value: null },
    tB4: { value: null },
    tB5: { value: null },
    bw: { value: [0, 0, 0, 0, 0, 0] },
    bloom: { value: 0 },
    sat: { value: 1 },
    con: { value: 1 },
    darkTint: { value: new THREE.Color() },
    lightTint: { value: new THREE.Color() },
    split: { value: 0 },
    ...atmoUniforms,
    atmoSky: { value: null },
    skyOn: { value: 0 },
    cloudOn: { value: 0 },
    tCloud: { value: null },
    uInvProj: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() },
    sunOn: { value: 0 },
    tSun: { value: null },
    sunMin: { value: new THREE.Vector2() },
    sunN: { value: 1 },
    sunBody: { value: 本体边 },
    haloCol: { value: new THREE.Color() },
    zenCol: { value: new THREE.Color() },
    zenK: { value: 0 },
    zenH: { value: 0.6 },
    glowCell: { value: 0 },
    denseK: { value: 0 },
    glowOff: { value: new THREE.Vector2() },
    res: { value: new THREE.Vector2(1, 1) },
  });
  return { u, 影, 影机, 主, 深, 云, 对数深, 层, 粒源, 取亮, 缩, 糊, 合, 屏机: new THREE.OrthographicCamera(), 尺寸: new THREE.Vector2(), 清色: new THREE.Color(), 剖面: new THREE.Plane(), 太阳图: 建太阳图() };
};

/** 太阳本体（原版 8×8，材质包高清的 8k×8k）进一张小图（第 0 行 = 最下面一行，texelFetch 按画布坐标取）；边 = 本体几个贴图像素；
 *  光圈色 = 本体正上方紧挨着的那一格（同 2D 天 的光圈），画面值。
 *  坑：高清贴图要按 k 倍的格子取；按原版 32×32 的格子取，取到的是本体外面那圈快黑的光晕，太阳整个看不见 */
const 建太阳图 = () => {
  const t = png(sunPng);
  const k = Math.max(1, Math.round(t.w / 32));
  const 边 = 本体边 * k;
  const 起 = 本体起 * k;
  const px = new Uint8Array(边 * 边 * 4);
  for (let y = 0; y < 边; y++)
    for (let x = 0; x < 边; x++) {
      const o = ((起 + 边 - 1 - y) * t.w + 起 + x) * 4;
      px.set(t.px.subarray(o, o + 4), (y * 边 + x) * 4);
    }
  const 图 = new THREE.DataTexture(px, 边, 边, THREE.RGBAFormat);
  图.minFilter = 图.magFilter = THREE.NearestFilter;
  图.needsUpdate = true;
  const 晕 = ((起 - 1) * t.w + 16 * k) * 4;
  return { 图, 边, 晕: new THREE.Color(t.px[晕]! / 255, t.px[晕 + 1]! / 255, t.px[晕 + 2]! / 255) };
};

const 释放 = (r: 资源) => {
  r.影.depthTexture?.dispose();
  r.影.dispose();
  r.主.depthTexture?.dispose();
  r.主.dispose();
  r.深.dispose();
  r.粒源.dispose();
  r.云.dispose();
  r.太阳图.图.dispose();
  for (const [a, b] of r.层) {
    a.dispose();
    b.dispose();
  }
  for (const x of [r.取亮, r.缩, r.糊, r.合, r.对数深]) {
    x.材质.dispose();
    x.片.geometry.dispose();
  }
};

const sRGB乘数 = (c: THREE.Color, hex: string, 强 = 1) => c.setStyle(hex, THREE.LinearSRGBColorSpace).multiplyScalar(强);

/** 太阳方向（three 世界，指向太阳）：场景给了用场景的，不然按时段的仰角、方位跟着镜头摆（给了 太阳参照朝向 就跟它，不跟这一帧的镜头） */
const 太阳方向 = (选: 光影选项, 光: 时段光, camera: THREE.Camera, out: THREE.Vector3) => {
  if (选.太阳) return out.copy(场景到three(选.太阳)).normalize();
  const f = new THREE.Vector3();
  if (选.太阳参照朝向) f.copy(场景到three(选.太阳参照朝向));
  else camera.getWorldDirection(f);
  f.y = 0;
  if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
  f.normalize();
  // 从镜头那边照过去：太阳在镜头背后，方位往右偏
  const 方 = Math.PI + (光.太阳方位 * Math.PI) / 180;
  const 仰 = (光.太阳仰角 * Math.PI) / 180;
  const h = f.applyAxisAngle(new THREE.Vector3(0, 1, 0), -方);
  return out.set(h.x * Math.cos(仰), Math.sin(仰), h.z * Math.cos(仰)).normalize();
};

/** 镜头的近裁剪面（世界坐标，镜头看得见的那一边为正）：剖面镜头的近裁剪面放在看点前面 剖 格（机位.tsx） */
const 近裁剪面 = (camera: THREE.Camera, out: THREE.Plane) => {
  const f = camera.getWorldDirection(new THREE.Vector3());
  const p = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(f, (camera as THREE.OrthographicCamera).near);
  return out.setFromNormalAndCoplanarPoint(f, p);
};

const 角点 = (camera: THREE.Camera): THREE.Vector3[] => {
  const 透视 = (camera as THREE.PerspectiveCamera).isPerspectiveCamera;
  const 点们: THREE.Vector3[] = [];
  for (const x of [-1, 1])
    for (const y of [-1, 1]) {
      const 近 = new THREE.Vector3(x, y, -1).applyMatrix4(camera.projectionMatrixInverse).applyMatrix4(camera.matrixWorld);
      const 远 = new THREE.Vector3(x, y, 1).applyMatrix4(camera.projectionMatrixInverse).applyMatrix4(camera.matrixWorld);
      if (透视) {
        const d = 远.clone().sub(近);
        const 长 = d.length();
        if (长 > 透视影距) 远.copy(近).addScaledVector(d, 透视影距 / 长);
      }
      点们.push(近, 远);
    }
  return 点们;
};

/** 摆影子机：受光网格的包围盒和镜头视体（在太阳的视角下）取交，纹素吸附。没有要画影子的东西返回 false */
const 摆影子机 = (r: 资源, scene: THREE.Scene, camera: THREE.Camera, L: THREE.Vector3, 受光网格: THREE.Mesh[], 起纹素: number) => {
  const 上 = Math.abs(L.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const 视 = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), L.clone().negate(), 上);
  const 逆 = 视.clone().invert();
  // 用包围球：方块网格的 CPU 数组上传后就释放，包围盒事后算不出；包围球第一次画（视锥裁剪）之前就算好了
  const 场盒 = new THREE.Box3();
  const 球 = new THREE.Sphere();
  for (const m of 受光网格) {
    const 原球 = (m as THREE.Mesh & { boundingSphere?: THREE.Sphere | null }).boundingSphere ?? 包围球(m.geometry);
    if (!原球) continue;
    球.copy(原球).applyMatrix4(m.matrixWorld).applyMatrix4(逆);
    场盒.expandByPoint(球.center.clone().addScalar(-球.radius)).expandByPoint(球.center.clone().addScalar(球.radius));
  }
  if (场盒.isEmpty()) return false;
  const 视盒 = new THREE.Box3();
  for (const q of 角点(camera)) 视盒.expandByPoint(q.applyMatrix4(逆));
  const x0 = Math.max(场盒.min.x, 视盒.min.x), x1 = Math.min(场盒.max.x, 视盒.max.x);
  const y0 = Math.max(场盒.min.y, 视盒.min.y), y1 = Math.min(场盒.max.y, 视盒.max.y);
  if (x0 >= x1 || y0 >= y1) return false;
  // 纹素：起纹素起，框装不下就翻倍
  let 纹素 = 起纹素;
  while (Math.max(x1 - x0, y1 - y0) + 2 > 影子图边 * 纹素) 纹素 *= 2;
  const 半 = (影子图边 * 纹素) / 2;
  const 吸 = (v: number) => Math.round(v / 纹素) * 纹素;
  const cx = 吸((x0 + x1) / 2), cy = 吸((y0 + y1) / 2);
  const 机 = r.影机;
  机.matrixAutoUpdate = false;
  机.matrix.copy(视);
  机.matrixWorld.copy(视);
  机.matrixWorldInverse.copy(逆);
  // 光的视空间里 z 越大越靠太阳；正交机看 −z，near/far 是到 −z 方向的距离
  Object.assign(机, { left: cx - 半, right: cx + 半, bottom: cy - 半, top: cy + 半, near: -场盒.max.z - 1, far: -场盒.min.z + 1 });
  机.updateProjectionMatrix();
  r.u.gyShadowMat.value.multiplyMatrices(机.projectionMatrix, 逆);
  r.u.gyShadowBias.value = Math.max(0.03, 纹素 * 1.5);
  return true;
};

const 包围球 = (g: THREE.BufferGeometry): THREE.Sphere | null => {
  if (!g.boundingSphere) {
    try {
      g.computeBoundingSphere();
    } catch {
      return null;
    }
  }
  return g.boundingSphere;
};

/** 只挡光（./只挡光.tsx）组里的网格 */
const 在挡光组 = (o: THREE.Object3D) => {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.userData.只挡光) return true;
  return false;
};

const 收受光网格 = (scene: THREE.Scene) => {
  const 受光: THREE.Mesh[] = [];
  const 别的: THREE.Object3D[] = [];
  scene.traverseVisible((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      const ms = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (ms.some(平涂受光) || 在挡光组(mesh)) 受光.push(mesh);
      else 别的.push(o);
    } else if ((o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite) 别的.push(o);
  });
  return { 受光, 别的 };
};

/** 泛光六层叠回去的权重：窄（泛光.宽 = 0）只用前四层，宽（= 1）往粗的层挪 */
const 窄权 = [0.4, 0.3, 0.2, 0.1, 0, 0];
const 宽权 = [0.1, 0.12, 0.16, 0.2, 0.22, 0.2];

/** 看得见的粒子面片（单一材质） */
const 收粒子 = (scene: THREE.Scene) => {
  const 们: THREE.Mesh[] = [];
  scene.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !Array.isArray(m.material) && 是粒子材质(m.material)) 们.push(m);
  });
  return 们;
};

/** 粒子照亮的光源：粒子按 并格 格见方的格子并成团（颜色 × 不透明度加起来、位置按亮度平均），取最亮的几团。
 *  一团的颜色 = 平均颜色 × 强 × √(粒子数 / 满团)，封到 满团 个粒子：火花多的一团亮一些，但不按个数线性翻上去 */
const 并格 = 6;
const 满团 = 60;
/** 补光进统一量：方向光的方向、点光的位置换到 three 世界；'镜头' 取镜头朝向反过来、往上抬 20°。要在日光、阴影摆好之后调（受光减影子 要用） */
const 摆补光 = (u: 光影统一量, 们: readonly 补光[], camera: THREE.Camera) => {
  if (们.length > 最多补光) throw new Error(`补光最多 ${最多补光} 盏，给了 ${们.length} 盏`);
  u.gyFillN.value = 们.length;
  们.forEach((b, i) => {
    const p = u.gyFillPos.value[i];
    if (b.位置) {
      p.copy(场景到three(b.位置));
      u.gyFillR.value[i] = b.半径 ?? 8;
    } else {
      if (b.方向 === '镜头' || !b.方向) {
        camera.getWorldDirection(p).negate();
        const 抬 = (20 * Math.PI) / 180;
        p.y = Math.max(p.y, 0);
        const h = Math.hypot(p.x, p.z) || 1;
        p.set((p.x / h) * Math.cos(抬), Math.sin(抬), (p.z / h) * Math.cos(抬));
      } else p.copy(场景到three(b.方向));
      p.normalize();
      u.gyFillR.value[i] = 0;
    }
    u.gyFillSh.value[i] = b.只补影子里 ? 1 : 0;
    const c = u.gyFillCol.value[i];
    if (b.色 === '受光减影子') {
      c.copy(u.gySunCol.value).sub(u.gyShadeCol.value).multiplyScalar(b.强);
      c.setRGB(Math.max(c.r, 0), Math.max(c.g, 0), Math.max(c.b, 0));
    } else sRGB乘数(c, b.色, b.强);
  });
};

const 摆粒子光 = (u: 光影统一量, 们: THREE.Mesh[], 半径: number, 强: number) => {
  const 团 = new Map<string, { p: THREE.Vector3; c: THREE.Color; w: number; n: number }>();
  const v = new THREE.Vector3();
  for (const m of 们) {
    const g = m.geometry as THREE.InstancedBufferGeometry;
    const pc = g.getAttribute('iCenter') as THREE.BufferAttribute | undefined;
    const cc = g.getAttribute('iColor') as THREE.BufferAttribute | undefined;
    if (!pc || !cc) continue;
    for (let i = 0; i < g.instanceCount; i++) {
      const a = cc.getW(i);
      if (a <= 0) continue;
      v.fromBufferAttribute(pc, i).applyMatrix4(m.matrixWorld);
      const k = `${Math.floor(v.x / 并格)},${Math.floor(v.y / 并格)},${Math.floor(v.z / 并格)}`;
      const e = 团.get(k) ?? 团.set(k, { p: new THREE.Vector3(), c: new THREE.Color(0, 0, 0), w: 0, n: 0 }).get(k)!;
      const r = cc.getX(i) * a, gg = cc.getY(i) * a, b = cc.getZ(i) * a;
      const l = r * 0.2126 + gg * 0.7152 + b * 0.0722 + 1e-4;
      e.p.addScaledVector(v, l);
      e.w += l;
      e.c.r += r;
      e.c.g += gg;
      e.c.b += b;
      e.n += a;
    }
  }
  const 排 = [...团.values()].sort((x, y) => y.w - x.w).slice(0, 最多粒子光);
  u.gyFlashN.value = 排.length;
  u.gyFlashR.value = 半径;
  排.forEach((e, i) => {
    u.gyFlashPos.value[i]!.copy(e.p).divideScalar(e.w);
    u.gyFlashCol.value[i]!.copy(e.c).multiplyScalar((强 / e.n) * Math.sqrt(Math.min(e.n, 满团) / 满团));
  });
};

/** 像素格光晕的格子（画布像素）和格线起点：正交镜头取 1/16 格在屏幕上的大小、格线对上世界原点；透视镜头按 6 个成片像素 */
const 光晕格 = (camera: THREE.Camera, w: number, h: number, 成片宽: number, out: THREE.Vector2) => {
  const o = camera as THREE.OrthographicCamera;
  if (!o.isOrthographicCamera) {
    out.set(0, 0);
    return Math.max(1, Math.round((6 * w) / 成片宽));
  }
  const n = ((h / ((o.top - o.bottom) / o.zoom)) / 16);
  const p = new THREE.Vector3(0, 0, 0).project(camera);
  out.set((((p.x + 1) / 2) * w) % n, (((p.y + 1) / 2) * h) % n);
  return n;
};

const 设尺寸 = (rt: THREE.WebGLRenderTarget, w: number, h: number) => {
  if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
};

export type 光影渲染属性 = {
  /** 已经合上场景给的事实（预设.ts 的 合光影） */
  选项: 光影选项;
  /** 平涂色调：没给时段时拿它猜 */
  色调?: string;
};

export const 光影渲染: React.FC<光影渲染属性> = ({ 选项, 色调 }) => {
  // 水面波纹的时间取画面秒数（每帧单独算）
  const { fps, width: 成片宽 } = useVideoConfig();
  const 秒 = useCurrentFrame() / fps;
  const r = useMemo(建资源, []);
  useEffect(() => () => 释放(r), [r]);
  // 云的着色器（按配置拼的一大段）趁取素材的时候并行先编（用户 11-04 定 A4），编完才放行截图；不然头一帧画的时候才同步编
  const gl = useThree((s) => s.gl);
  const 云键 = 光影画云(选项) && 选项.云 ? JSON.stringify(选项.云) : '';
  useEffect(() => {
    if (!云键 || !选项.云) return;
    const 手 = delayRender('云的着色器');
    预编云(gl, 选项.云, 选项.云.海平面 ?? 0).then(() => continueRender(手), (e) => cancelRender(e));
  }, [gl, 云键]);
  useFrame(({ gl, scene, camera }) => {
    // 世界矩阵 three 在 gl.render 里才更新，下面摆影子机、摆粒子光先要用：不先更新就拿上一次画的（刚挂上的网格还是单位阵），
    // 同一帧单独渲和接在别的帧后面渲出来不一样（2-截图下线 第 163 帧逐像素对不上查出来的）
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    // GPU 天色图换了太阳要先画好：水面（第 2 步）、云、合成都取它
    备天色图(gl);
    const 参 = 取光影参数(选项.预设);
    const 段 = 选项.时段 ?? 猜时段(色调);
    const 光 = 参[段];
    const u = r.u;
    太阳方向(选项, 光, camera, u.gySun.value);
    // 基准亮度：受光、影子、灯、粒子照的光一起乘（发光区不乘），不给是 1
    const 基 = 选项.基准亮度 ?? 1;
    sRGB乘数(u.gySunCol.value, 光.日光, 光.日光强 * 基);
    sRGB乘数(u.gyShadeCol.value, 光.阴影, 光.阴影强 * 基);
    if (选项.光强 !== undefined) u.gySunCol.value.lerp(u.gyShadeCol.value, 1 - 选项.光强);
    u.gyDirK.value = 光.朝向;
    u.gyFaceK.value = 光.面明暗;
    u.gyGlowK.value = 光.发光强;
    u.gyLampR.value = 光.灯照.半径;
    sRGB乘数(u.gyLampCol.value, 光.灯照.色, 光.灯照.强 * 基);
    u.gyPixel.value = 参.像素阴影 ? 1 : 0;
    u.gyTime.value = 秒;
    const 改水 = 选项.水 === '平滑波纹' || 选项.水 === '像素波纹';
    u.gyWaterPix.value = 选项.水 === '像素波纹' ? 1 : 0;
    sRGB乘数(u.gyZenith.value, 选项.水天顶 ?? 光.水.天顶);
    u.gyRefl.value = 光.水.反射;
    sRGB乘数(u.gyGlintCol.value, 光.水.碎光色, 光.水.碎光强);
    sRGB乘数(u.gyWaterBody.value, 光.水.水体);
    u.gyReflMin.value = 光.水.近反射;
    const 透视 = (camera as THREE.PerspectiveCamera).isPerspectiveCamera;
    const 画天 = 选项.天 === 'Photon平滑' && 透视 && atmosphere.sky !== null;
    const 画云 = 画天 && 光影画云(选项) && atmosphere.clouds !== null;
    const 光照 = 选项.光照 !== false;
    u.gyAtmoOn.value = 画天 ? 1 : 0;
    u.gyAtmoSky.value = atmosphere.sky;
    const 顶 = 选项.天顶;
    sRGB乘数(u.gyZenCol.value, 顶?.色 ?? '#000000');
    u.gyZenK.value = 顶 ? 顶.拉 : 0;
    u.gyZenH.value = Math.sin(((顶?.高 ?? 38) * Math.PI) / 180);
    const 粒子们 = 光.粒子晕 > 0 || 选项.粒子照亮 ? 收粒子(scene) : [];
    u.gyFlashN.value = 0;
    if (选项.粒子照亮 && 光.粒子照.强 > 0) 摆粒子光(u, 粒子们, 光.粒子照.半径, 光.粒子照.强 * 基);
    摆补光(u, 选项.补光 ?? [], camera);

    const 背景 = scene.background;
    const 清透明 = gl.getClearAlpha();
    gl.getClearColor(r.清色);
    gl.setClearColor(0x000000, 0);

    // 1. 影子图：只挡光的组（平时藏着）只在这一步露出来
    const 挡光组: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (o.userData.只挡光) 挡光组.push(o);
    });
    for (const o of 挡光组) o.visible = true;
    const { 受光, 别的 } = 收受光网格(scene);
    u.gyShadowOn.value = 0;
    if (光照 && 受光.length && 摆影子机(r, scene, camera, u.gySun.value, 受光, 参.像素阴影 ? 1 / 32 : 1 / 256)) {
      const 藏 = 别的.filter((o) => o.visible);
      for (const o of 藏) o.visible = false;
      scene.background = null;
      gl.setRenderTarget(r.影);
      gl.clear(true, true, true);
      const 原裁 = gl.clippingPlanes;
      if (选项.剖掉的不挡光) gl.clippingPlanes = [近裁剪面(camera, r.剖面)];
      gl.render(scene, r.影机);
      gl.clippingPlanes = 原裁;
      scene.background = 背景;
      for (const o of 藏) o.visible = true;
      u.gyShadowMap.value = r.影.depthTexture;
      u.gyShadowOn.value = 1;
    }
    for (const o of 挡光组) o.visible = false;

    // 2. 主画面
    const [w, h] = gl.getDrawingBufferSize(r.尺寸).toArray();
    设尺寸(r.主, w, h);
    const 还原: (() => void)[] = [];
    const 换 = (m: THREE.Material) => ((光照 && 平涂受光(m)) || (改水 && 像水(m)) ? (取变体(m, u) ?? m) : m);
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const 原 = mesh.material;
      const 新 = Array.isArray(原) ? 原.map(换) : 换(原);
      if (新 === 原 || (Array.isArray(新) && 新.every((m, i) => m === (原 as THREE.Material[])[i]))) return;
      mesh.material = 新;
      还原.push(() => (mesh.material = 原));
    });
    gl.setRenderTarget(r.主);
    gl.clear(true, true, true);
    gl.render(scene, camera);
    还原.forEach((f) => f());

    // 3. 泛光
    if (光.粒子晕 > 0 && 粒子们.length) {
      设尺寸(r.粒源, w, h);
      u.gyDepth.value = r.主.depthTexture;
      const 藏: THREE.Object3D[] = [];
      scene.traverseVisible((o) => {
        if (o !== scene && !粒子们.includes(o as THREE.Mesh) && ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite)) 藏.push(o);
      });
      for (const o of 藏) o.visible = false;
      const 原材: THREE.Material[] = 粒子们.map((m) => m.material as THREE.Material);
      粒子们.forEach((m, i) => (m.material = 取变体(原材[i]!, u) ?? 原材[i]!));
      scene.background = null;
      gl.setRenderTarget(r.粒源);
      gl.clear(true, true, true);
      gl.render(scene, camera);
      scene.background = 背景;
      粒子们.forEach((m, i) => (m.material = 原材[i]!));
      for (const o of 藏) o.visible = true;
    }
    const 自动清 = gl.autoClear;
    gl.autoClear = false;
    const 画 = (x: { 场: THREE.Scene }, 到: THREE.WebGLRenderTarget | null) => {
      gl.setRenderTarget(到);
      gl.render(x.场, r.屏机);
    };
    let 源: THREE.Texture = r.主.texture;
    let sw = w, sh = h;
    r.层.forEach(([a, b], i) => {
      const lw = Math.max(1, Math.round(w / 2 ** (i + 1))), lh = Math.max(1, Math.round(h / 2 ** (i + 1)));
      设尺寸(a, lw, lh);
      设尺寸(b, lw, lh);
      const 用 = i === 0 ? r.取亮 : r.缩;
      用.材质.uniforms.tSrc!.value = 源;
      (用.材质.uniforms.texel!.value as THREE.Vector2).set(0.5 / sw, 0.5 / sh);
      if (i === 0) {
        用.材质.uniforms.threshold!.value = 光.泛光.阈;
        用.材质.uniforms.knee!.value = 光.泛光.软;
        用.材质.uniforms.tAdd!.value = r.粒源.texture;
        用.材质.uniforms.addK!.value = 粒子们.length ? 光.粒子晕 : 0;
      }
      画(用, a);
      r.糊.材质.uniforms.tSrc!.value = a.texture;
      (r.糊.材质.uniforms.dir!.value as THREE.Vector2).set(1 / lw, 0);
      画(r.糊, b);
      r.糊.材质.uniforms.tSrc!.value = b.texture;
      (r.糊.材质.uniforms.dir!.value as THREE.Vector2).set(0, 1 / lh);
      画(r.糊, a);
      源 = a.texture;
      sw = lw;
      sh = lh;
    });

    // 太阳摆在哪先算好：云要连太阳本体那一块一起算（合成按它上面云的不透明度压暗太阳）
    const cu = r.合.材质.uniforms;
    if (画天) 摆太阳(cu, camera, 选项.太阳, w, h, r.太阳图);

    // 4. 云
    if (画云 && 选项.云) {
      const 机 = camera as THREE.PerspectiveCamera;
      设尺寸(r.深, w, h);
      设尺寸(r.云, w, h);
      const du = r.对数深.材质.uniforms;
      du.tDepth!.value = r.主.depthTexture;
      du.cNear!.value = 机.near;
      du.cFar!.value = 机.far;
      画(r.对数深, r.深);
      gl.setRenderTarget(r.云);
      gl.clear(true, true, true);
      const n = cu.sunN!.value as number, b = cu.sunBody!.value as number, m = cu.sunMin!.value as THREE.Vector2;
      画云层({
        gl,
        camera: 机,
        深度: r.深.texture,
        主画面: r.主.texture,
        宽: w,
        高: h,
        目标: r.云,
        配置: 选项.云,
        场: 选项.云场 ?? {},
        海平面: 选项.云.海平面 ?? 0,
        秒,
        太阳框: cu.sunOn!.value ? [m.x, m.y, n * b, n * b] : null,
      });
      gl.autoClear = false;
    }

    // 5. 合成
    cu.skyOn!.value = 画天 ? 1 : 0;
    cu.cloudOn!.value = 画云 ? 1 : 0;
    cu.tCloud!.value = r.云.texture;
    cu.atmoSky!.value = atmosphere.sky;
    if (画天) {
      (cu.uInvProj!.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
      (cu.uCamWorld!.value as THREE.Matrix4).copy(camera.matrixWorld);
      (cu.uCamPos!.value as THREE.Vector3).setFromMatrixPosition(camera.matrixWorld);
    }
    cu.tColor!.value = r.主.texture;
    r.层.forEach(([a], i) => (cu[`tB${i}`]!.value = a.texture));
    cu.bloom!.value = 光.泛光.强;
    const 宽 = 光.泛光.宽 ?? 0;
    cu.bw!.value = 窄权.map((a, i) => a + (宽权[i]! - a) * 宽);
    cu.sat!.value = 参.调色.饱和;
    cu.con!.value = 参.调色.对比;
    sRGB乘数(cu.darkTint!.value as THREE.Color, 参.调色.暗色);
    sRGB乘数(cu.lightTint!.value as THREE.Color, 参.调色.亮色);
    cu.split!.value = 参.调色.分离;
    (cu.zenCol!.value as THREE.Color).copy(u.gyZenCol.value);
    cu.zenK!.value = u.gyZenK.value;
    cu.zenH!.value = u.gyZenH.value;
    (cu.res!.value as THREE.Vector2).set(w, h);
    cu.denseK!.value = 选项.压密光晕 ?? 0;
    cu.glowCell!.value = 选项.光晕 === '像素格' ? 光晕格(camera, w, h, 成片宽, cu.glowOff!.value as THREE.Vector2) : 0;
    gl.setClearColor(r.清色, 清透明);
    gl.setRenderTarget(null);
    gl.clear(true, true, true);
    gl.render(r.合.场, r.屏机);
    gl.autoClear = 自动清;
  }, 1);
  if (选项.天 !== 'Photon平滑' || !选项.太阳) return null;
  return <Photon天 sun={[...选项.太阳] as [number, number, number]} far={天远} 算法={选项.天算法 ?? 'GPU'} />;
};

/** 原版方形太阳在画布上的位置：同 2D 天（作品/把回忆拼好给你/场/2-海上/编排.ts 的 太阳屏幕），本体边长 = 上下沿（沿太阳走的方向各偏半边）投影的距离，
 *  一个贴图像素（高清贴图按高清像素）取整成几个画布像素，左下角取整；屏幕上横平竖直 */
const 摆太阳 = (cu: Record<string, THREE.IUniform>, camera: THREE.Camera, 太阳: 光影选项['太阳'], w: number, h: number, 图: { 图: THREE.Texture; 边: number; 晕: THREE.Color }) => {
  cu.sunOn!.value = 0;
  if (!太阳) return;
  const d = new THREE.Vector3(...太阳).normalize();
  const 沿 = new THREE.Vector3(0, 1, 0).cross(d).normalize();
  const 眼 = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const 投 = (v: THREE.Vector3) => {
    const p = 场景到three([v.x, v.y, v.z]).add(眼).project(camera);
    return p.z < 1 ? new THREE.Vector2(((p.x + 1) / 2) * w, ((p.y + 1) / 2) * h) : null;
  };
  const c = 投(d.clone().multiplyScalar(太阳距));
  const 上 = 投(d.clone().multiplyScalar(太阳距).addScaledVector(沿, 太阳半边));
  const 下 = 投(d.clone().multiplyScalar(太阳距).addScaledVector(沿, -太阳半边));
  if (!c || !上 || !下) return;
  const 边 = 图.边;
  const n = Math.max(1, Math.round(上.distanceTo(下) / 边));
  // 2D 天按左上角取整（y 朝下），这里换成左下角
  const x0 = Math.round(c.x - (边 / 2) * n);
  const y0上 = Math.round(h - c.y - (边 / 2) * n);
  (cu.sunMin!.value as THREE.Vector2).set(x0, h - y0上 - 边 * n);
  cu.sunN!.value = n;
  cu.sunBody!.value = 边;
  cu.tSun!.value = 图.图;
  (cu.haloCol!.value as THREE.Color).copy(图.晕);
  cu.sunOn!.value = 1;
};
