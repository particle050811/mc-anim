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
const 环境名 = 'REMOTION_ANIM_TELE';
type 配置 = { 左: number; 上: number; 占: number; 细一级?: boolean; 真值?: boolean };
const 读配置 = (): 配置 | null => {
  const v = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[环境名];
  return v ? (JSON.parse(v) as 配置) : null;
};

/** 原帧 NDC 里的矩形 → 整个 NDC：x' = x / 占 − 心x / 占（y 同）；左乘在投影上，透视、正交、反向深度都一样用 */
export const 裁剪矩阵 = (c: Pick<配置, '左' | '上' | '占'>) => {
  const 倍 = 1 / c.占;
  const 心x = 2 * c.左 + c.占 - 1;
  const 心y = 1 - 2 * c.上 - c.占;
  return new THREE.Matrix4().set(倍, 0, 0, -心x * 倍, 0, 倍, 0, -心y * 倍, 0, 0, 1, 0, 0, 0, 0, 1);
};

type 镜头状态 = { 整: THREE.Matrix4; 整逆: THREE.Matrix4; 套着: boolean };

const 装 = (配: 配置) => {
  const 倍 = 1 / 配.占;
  const 裁 = 裁剪矩阵(配);
  const 状态 = new WeakMap<THREE.Camera, 镜头状态>();
  let 帧内 = false;

  const 套 = (cam: THREE.Camera, st: 镜头状态) => {
    st.整.copy(cam.projectionMatrix);
    st.整逆.copy(cam.projectionMatrixInverse);
    cam.projectionMatrix.premultiply(裁);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    st.套着 = true;
  };
  const 卸 = (cam: THREE.Camera, st: 镜头状态) => {
    if (!st.套着) return;
    cam.projectionMatrix.copy(st.整);
    cam.projectionMatrixInverse.copy(st.整逆);
    st.套着 = false;
  };
  const 接管 = (cam: THREE.Camera) => {
    let st = 状态.get(cam);
    if (st) return st;
    const 新 = (st = { 整: new THREE.Matrix4(), 整逆: new THREE.Matrix4(), 套着: false });
    状态.set(cam, 新);
    // 有的镜头组件在 useFrame 里重算投影：帧内重算完再套一次，不然这一帧画出来是整帧
    const c = cam as THREE.PerspectiveCamera;
    const 原 = c.updateProjectionMatrix;
    if (typeof 原 === 'function')
      c.updateProjectionMatrix = function (this: THREE.PerspectiveCamera) {
        原.call(this);
        新.套着 = false;
        if (帧内) 套(this, 新);
      };
    return 新;
  };

  // 铺满整个画面、没被 CSS 挪动缩放的画布才望远；别的（画中画、界面里的小画布）和 2D 叠层、字幕一起藏掉
  const 整幅 = (canvas: HTMLCanvasElement) => {
    const r = canvas.getBoundingClientRect();
    return Math.abs(r.left) < 0.5 && Math.abs(r.top) < 0.5 && Math.abs(r.width - window.innerWidth) < 0.5 && Math.abs(r.height - window.innerHeight) < 0.5;
  };
  const 主镜头们 = () => {
    const 出: THREE.Camera[] = [];
    for (const [canvas, root] of _roots) {
      if (!(canvas instanceof HTMLCanvasElement)) continue;
      const 是 = 整幅(canvas);
      canvas.toggleAttribute('data-anim-tele', 是);
      if (是) 出.push(root.store.getState().camera);
    }
    return 出;
  };
  addEffect(() => {
    // 上一帧中途抛错的话 after 没跑，先复原
    for (const cam of 主镜头们()) {
      const st = 接管(cam);
      卸(cam, st);
      套(cam, st);
    }
    帧内 = true;
  });
  addAfterEffect(() => {
    帧内 = false;
    for (const root of _roots.values()) {
      const cam = root.store.getState().camera;
      const st = 状态.get(cam);
      if (st) 卸(cam, st);
    }
  });

  // 2D 叠层、字幕、不望远的画布：藏掉。望远画布的祖先留着（纯色背景还对；垫在后面的图片、渐变不会跟着放大，见 docs/望远.md）
  const style = document.createElement('style');
  style.textContent = 'body *:not(:has(canvas[data-anim-tele])):not(canvas[data-anim-tele]) { visibility: hidden !important; }';
  document.head.appendChild(style);

  // 阴影级联按镜头视锥拟合：给它原整帧的视锥，级联的范围、像素格和原帧一样
  const 原更新 = CascadedShadow.prototype.updateMatrices;
  CascadedShadow.prototype.updateMatrices = function (this: CascadedShadow, light: THREE.Light, view?: THREE.Camera) {
    const st = view && 状态.get(view);
    if (!view || !st?.套着) return 原更新.call(this, light, view);
    const 望 = view.projectionMatrixInverse;
    view.projectionMatrixInverse = st.整逆;
    try {
      return 原更新.call(this, light, view);
    } finally {
      view.projectionMatrixInverse = 望;
    }
  };

  // 着色器源码都过 shaderSource，在这里改三样，不用逐个材质改（1 倍时不动，和平时的包出的图逐像素一样）：
  // - 屏幕 AO 的采样半径上限按占屏幕的比例写死在着色器里（engine/voxel/屏幕AO.tsx 的 SSAO_MAX_RADIUS_SCREEN）：望远后同样的比例只有原帧的 1/倍，乘回去。
  // - 点（星星、粒子）的 gl_PointSize 是屏幕像素，和投影无关：把 main 改名包一层，最后乘上倍数，才和原帧一样大。
  // - 片元里按屏幕像素求的导数（dFdx、dFdy、fwidth）：望远后一个像素只有原帧的 1/倍，乘回去，凡是按「一格在画面上占几个像素」定的
  //   （体素地形的台阶并色、贴图取哪一级、按导数定的边宽）都和原帧一样。宏展开时自己的名字不再展开，里面的 dFdx 还是内建函数；
  //   归一化的用法（平直着色的法线）乘了也不变。
  //   真值：不乘。远处简化照望远后的像素算，看到的是原帧每个像素里本来有什么（缩回去 = 原帧超采样），查「原帧这样简化对不对」用
  if (倍 !== 1) {
    const 倍字 = 倍.toFixed(6);
    const 导数宏 = 配.真值 ? '' : ['dFdx', 'dFdy', 'fwidth'].map((f) => `#define ${f}(v) (${f}(v) * ${倍字})\n`).join('');
    const 版本行后 = (源: string, 加: string) => {
      const n = /^\s*#version[^\n]*\n/.exec(源)?.[0].length ?? 0;
      return 源.slice(0, n) + 加 + 源.slice(n);
    };
    for (const 类 of [WebGL2RenderingContext, WebGLRenderingContext]) {
      const 原 = 类.prototype.shaderSource;
      类.prototype.shaderSource = function (this: WebGL2RenderingContext, shader: WebGLShader, source: string) {
        const 片元 = this.getShaderParameter(shader, this.SHADER_TYPE) === this.FRAGMENT_SHADER;
        if (片元) {
          source = source.replace(/(#define SSAO_MAX_RADIUS_SCREEN )([0-9.]+)/, (_, 头: string, 值: string) => `${头}${(Number(值) * 倍).toFixed(6)}`);
          if (导数宏 && /\b(dFdx|dFdy|fwidth)\s*\(/.test(source)) source = 版本行后(source, 导数宏);
        } else if (/\bgl_PointSize\b/.test(source)) source = `${版本行后(source, '#define main animTeleMain\n')}\n#undef main\nvoid main() { animTeleMain(); gl_PointSize *= ${倍字}; }\n`;
        return 原.call(this, shader, source);
      };
    }
  }

  // 远处强制用更细的一级：细分门槛减半，同一处的区段比原帧细一级（已经是最细的不变）。看「几何更细会怎样」用，出来的不是原帧那块的放大
  if (配.细一级) for (const 级 of new Set(Object.values(LevelParams))) 级.像素 *= 0.5;
};

const 配 = 读配置();
if (配) 装(配);
