// 望远（anim still --望远，docs/望远.md）：照原镜头的位置、朝向和投影，只把原帧里的一个矩形用整张画布原生渲出来，
// 像素是真的多出来，不是渲完再放大（用户 11-15 定做，看远处细节用）。
// 只在 --望远 的包里：pipeline/渲/望远.ts 打包时把本文件加进入口，正式段的闭包里没有它，不进指纹；别的文件一个字不改，靠这里接管。
// 做法：镜头平时还是原整帧的投影，只在 R3F 画一帧的那一段（useFrame + 出图）换成「原投影 × 裁剪」。
// - 组件渲染时读投影的（体素世界挑区段、分级）拿到的是原整帧：画哪些区段、每块用哪一级和原帧一样；
// - 画的时候读投影的（屏幕 AO、云、反推世界坐标）拿到的是望远的，和画出来的像素对得上；
// - 画的时候要按原整帧算的，在下面逐个接管：阴影级联、屏幕 AO 的屏幕半径上限、点的大小、着色器里按屏幕像素求的导数。
// 做不到的偏差见 docs/望远.md。
import '../段/设置.ts';
import { _roots, addAfterEffect, addEffect } from '@react-three/fiber';
import * as THREE from 'three';
import { CascadedShadow } from '../light/级联阴影.ts';
import { LevelParams } from './渲染级别.ts';

/** pipeline/渲/望远.ts 里同一个名字。左、上、占：矩形左上角和宽占原帧的比例（高按原帧宽高比）；细一级、真值见下面 装 的末尾 */
const envName = 'REMOTION_ANIM_TELE';
type TeleConfig = { left: number; 上: number; widthRatio: number; fineLevel?: boolean; 真值?: boolean };
const readConfig = (): TeleConfig | null => {
  const v = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[envName];
  return v ? (JSON.parse(v) as TeleConfig) : null;
};

/** 原帧 NDC 里的矩形 → 整个 NDC：x' = x / 占 − 心x / 占（y 同）；左乘在投影上，透视、正交、反向深度都一样用 */
export const cropMatrix = (c: Pick<TeleConfig, 'left' | '上' | 'widthRatio'>) => {
  const zoom = 1 / c.widthRatio;
  const centerX = 2 * c.left + c.widthRatio - 1;
  const centerY = 1 - 2 * c.上 - c.widthRatio;
  return new THREE.Matrix4().set(zoom, 0, 0, -centerX * zoom, 0, zoom, 0, -centerY * zoom, 0, 0, 1, 0, 0, 0, 0, 1);
};

type CameraState = { projection: THREE.Matrix4; fullInverse: THREE.Matrix4; wrapped: boolean };

const applyConfig = (config: TeleConfig) => {
  const zoom = 1 / config.widthRatio;
  const clipMatrix = cropMatrix(config);
  const camStates = new WeakMap<THREE.Camera, CameraState>();
  let inFrame = false;

  const applyCamState = (cam: THREE.Camera, st: CameraState) => {
    st.projection.copy(cam.projectionMatrix);
    st.fullInverse.copy(cam.projectionMatrixInverse);
    cam.projectionMatrix.premultiply(clipMatrix);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    st.wrapped = true;
  };
  const uninstall = (cam: THREE.Camera, st: CameraState) => {
    if (!st.wrapped) return;
    cam.projectionMatrix.copy(st.projection);
    cam.projectionMatrixInverse.copy(st.fullInverse);
    st.wrapped = false;
  };
  const takeOver = (cam: THREE.Camera) => {
    let st = camStates.get(cam);
    if (st) return st;
    const nextState = (st = { projection: new THREE.Matrix4(), fullInverse: new THREE.Matrix4(), wrapped: false });
    camStates.set(cam, nextState);
    // 有的镜头组件在 useFrame 里重算投影：帧内重算完再套一次，不然这一帧画出来是整帧
    const c = cam as THREE.PerspectiveCamera;
    const originalUpdateProjection = c.updateProjectionMatrix;
    if (typeof originalUpdateProjection === 'function')
      c.updateProjectionMatrix = function (this: THREE.PerspectiveCamera) {
        originalUpdateProjection.call(this);
        nextState.wrapped = false;
        if (inFrame) applyCamState(this, nextState);
      };
    return nextState;
  };

  // 铺满整个画面、没被 CSS 挪动缩放的画布才望远；别的（画中画、界面里的小画布）和 2D 叠层、字幕一起藏掉
  const isFullFrame = (canvas: HTMLCanvasElement) => {
    const r = canvas.getBoundingClientRect();
    return Math.abs(r.left) < 0.5 && Math.abs(r.top) < 0.5 && Math.abs(r.width - window.innerWidth) < 0.5 && Math.abs(r.height - window.innerHeight) < 0.5;
  };
  const mainCameras = () => {
    const mainCameras: THREE.Camera[] = [];
    for (const [canvas, root] of _roots) {
      if (!(canvas instanceof HTMLCanvasElement)) continue;
      const isTele = isFullFrame(canvas);
      canvas.toggleAttribute('data-anim-tele', isTele);
      if (isTele) mainCameras.push(root.store.getState().camera);
    }
    return mainCameras;
  };
  addEffect(() => {
    // 上一帧中途抛错的话 after 没跑，先复原
    for (const cam of mainCameras()) {
      const st = takeOver(cam);
      uninstall(cam, st);
      applyCamState(cam, st);
    }
    inFrame = true;
  });
  addAfterEffect(() => {
    inFrame = false;
    for (const root of _roots.values()) {
      const cam = root.store.getState().camera;
      const st = camStates.get(cam);
      if (st) uninstall(cam, st);
    }
  });

  // 2D 叠层、字幕、不望远的画布：藏掉。望远画布的祖先留着（纯色背景还对；垫在后面的图片、渐变不会跟着放大，见 docs/望远.md）
  const style = document.createElement('style');
  style.textContent = 'body *:not(:has(canvas[data-anim-tele])):not(canvas[data-anim-tele]) { visibility: hidden !important; }';
  document.head.appendChild(style);

  // 阴影级联按镜头视锥拟合：给它原整帧的视锥，级联的范围、像素格和原帧一样
  const originalUpdateMatrices = CascadedShadow.prototype.updateMatrices;
  CascadedShadow.prototype.updateMatrices = function (this: CascadedShadow, light: THREE.Light, view?: THREE.Camera) {
    const st = view && camStates.get(view);
    if (!view || !st?.wrapped) return originalUpdateMatrices.call(this, light, view);
    const savedProjInverse = view.projectionMatrixInverse;
    view.projectionMatrixInverse = st.fullInverse;
    try {
      return originalUpdateMatrices.call(this, light, view);
    } finally {
      view.projectionMatrixInverse = savedProjInverse;
    }
  };

  // 着色器源码都过 shaderSource，在这里改三样，不用逐个材质改（1 倍时不动，和平时的包出的图逐像素一样）：
  // - 屏幕 AO 的采样半径上限按占屏幕的比例写死在着色器里（engine/voxel/屏幕AO.tsx 的 SSAO_MAX_RADIUS_SCREEN）：望远后同样的比例只有原帧的 1/倍，乘回去。
  // - 点（星星、粒子）的 gl_PointSize 是屏幕像素，和投影无关：把 main 改名包一层，最后乘上倍数，才和原帧一样大。
  // - 片元里按屏幕像素求的导数（dFdx、dFdy、fwidth）：望远后一个像素只有原帧的 1/倍，乘回去，凡是按「一格在画面上占几个像素」定的
  //   （体素地形的台阶并色、贴图取哪一级、按导数定的边宽）都和原帧一样。宏展开时自己的名字不再展开，里面的 dFdx 还是内建函数；
  //   归一化的用法（平直着色的法线）乘了也不变。
  //   真值：不乘。远处简化照望远后的像素算，看到的是原帧每个像素里本来有什么（缩回去 = 原帧超采样），查「原帧这样简化对不对」用
  if (zoom !== 1) {
    const scaleStr = zoom.toFixed(6);
    const derivMacros = config.真值 ? '' : ['dFdx', 'dFdy', 'fwidth'].map((f) => `#define ${f}(v) (${f}(v) * ${scaleStr})\n`).join('');
    const insertAfterVersion = (sourceText: string, insert: string) => {
      const n = /^\s*#version[^\n]*\n/.exec(sourceText)?.[0].length ?? 0;
      return sourceText.slice(0, n) + insert + sourceText.slice(n);
    };
    for (const glContextType of [WebGL2RenderingContext, WebGLRenderingContext]) {
      const originalShaderSource = glContextType.prototype.shaderSource;
      glContextType.prototype.shaderSource = function (this: WebGL2RenderingContext, shader: WebGLShader, source: string) {
        const isFragment = this.getShaderParameter(shader, this.SHADER_TYPE) === this.FRAGMENT_SHADER;
        if (isFragment) {
          source = source.replace(/(#define SSAO_MAX_RADIUS_SCREEN )([0-9.]+)/, (_, prefix: string, value: string) => `${prefix}${(Number(value) * zoom).toFixed(6)}`);
          if (derivMacros && /\b(dFdx|dFdy|fwidth)\s*\(/.test(source)) source = insertAfterVersion(source, derivMacros);
        } else if (/\bgl_PointSize\b/.test(source)) source = `${insertAfterVersion(source, '#define main animTeleMain\n')}\n#undef main\nvoid main() { animTeleMain(); gl_PointSize *= ${scaleStr}; }\n`;
        return originalShaderSource.call(this, shader, source);
      };
    }
  }

  // 远处强制用更细的一级：细分门槛减半，同一处的区段比原帧细一级（已经是最细的不变）。看「几何更细会怎样」用，出来的不是原帧那块的放大
  if (config.fineLevel) for (const levelParams of new Set(Object.values(LevelParams))) levelParams.pixel *= 0.5;
};

const config = readConfig();
if (config) applyConfig(config);
