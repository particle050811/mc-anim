// 三渲二的机位。坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格），进 three 换成 Y 朝上；场景内容放在 rotation [−π/2, 0, 0] 的 group 里就是同一套坐标。
// 正交像素机位：一个贴图像素 = 成片（2560×1440）上整数 N 个像素，看点吸附到画布像素网格，平移时方块的像素边不闪。只朝东南西北四个正方向看（斜着看贴图像素就不是整数了）。
//   俯角用斜投影做：正面（朝镜头的面）不变形、像素照样是 N，顶面压扁成每个贴图像素 顶面 个像素高（越靠里的东西在画面上越高），所以顶面也是整数像素。
//   剖：近裁剪面放在看点前面 剖 格，前面的东西都不画（剖面镜头切掉朝镜头那面墙）。
// 透视机位：眼、看点、竖直视角，和 作品/把回忆拼好给你/地点/机位.tsx 的第一人称机位一样，只是不碰色调映射（平涂不过色调映射）。
// 两个组件都改 useThree 的当前相机，每次渲染照参数重设；R3F 不会再动它（camera.manual）。正交机位要求画布的相机是 OrthographicCamera（三渲二画布 自己建；单用时给 ThreeCanvas 传 orthographic）。
import { useThree } from '@react-three/fiber';
import type React from 'react';
import * as THREE from 'three';
import type { V3 } from '../model/parts.tsx';
import { filmScale } from './像素.ts';
import { sceneToThree } from '../core/three换算.ts';

export type Facing = '北' | '南' | '东' | '西';

export type OrthoRigParams = {
  种: '正交';
  /** 画面中心对准的点（场景坐标）；实际会吸附到像素网格，最多挪半个画布像素 */
  看: V3;
  /** 镜头朝哪边看 */
  facing: Facing;
  /** 一个贴图像素在成片上几个像素（正偶数：预览级不放大时一个贴图像素 N/2 个像素，奇数就落到半像素上） */
  N: number;
  /** 推拉中：N 可以带小数（取偶数时一跳放大一成多，60 fps 里一顿一顿的）。贴图像素宽窄差 1 像素，动着看不出来；停住时别给 */
  dolly?: boolean;
  /** 顶面一个贴图像素在成片上几个像素高（0～N 的偶数，道理同 N）：0 = 纯侧面看不到顶面 */
  topDepth?: number;
  /** 剖面：看点往镜头方向多远开始画（格），不给 = 不剖 */
  section?: number;
  /** 看点往里画多远（格） */
  depth?: number;
};

export type PerspectiveRigParams = {
  种: '透视';
  眼: V3;
  看: V3;
  /** 竖直视角（度），原版默认 70 */
  fov?: number;
  near?: number;
  farPlane?: number;
  /** 不给 = 画布宽 ÷ 画布高 */
  aspectRatio?: number;
};

export type CameraRigParams = OrthoRigParams | PerspectiveRigParams;
// 镜头朝向（three 世界坐标）：北 = 场景 +y = three −z
const facingVecs: Record<Facing, THREE.Vector3> = {
  北: new THREE.Vector3(0, 0, -1),
  南: new THREE.Vector3(0, 0, 1),
  东: new THREE.Vector3(1, 0, 0),
  西: new THREE.Vector3(-1, 0, 0),
};
const worldUp = new THREE.Vector3(0, 1, 0);

/** 相机离看点多远（格）；正交投影里只影响裁剪面，不影响画面 */
const rigDistance = 128;

export type OrthoFraming = {
  位置: THREE.Vector3;
  lookPoint: THREE.Vector3;
  /** 视体半宽、半高（格） */
  半宽: number;
  halfHeight: number;
  near: number;
  farPlane: number;
  /** 斜投影系数：往里每格画面上升多少格 */
  oblique: number;
};

const isEven = (v: number) => Number.isInteger(v) && v % 2 === 0;

/** 算正交像素机位的取景。页面宽高是画布的 CSS 尺寸，dpr 是画布像素对 CSS 像素的倍数。
 *  N、顶面、页面宽高都要偶数：预览级（dpr 1）一个画布像素是两个成片像素，奇数会让贴图像素的边、画面中心落在半像素上 */
export const computeOrthoFraming = (p: OrthoRigParams, pageWidth: number, pageHeight: number, dpr: number): OrthoFraming => {
  if (p.N <= 0 || (!p.dolly && !isEven(p.N))) throw new Error(`正交机位的 N 要是正偶数：${p.N}`);
  const topDepth = p.topDepth ?? 0;
  if (!isEven(topDepth) || topDepth < 0 || topDepth > p.N) throw new Error(`正交机位的 顶面 要是 0～N 的偶数：${topDepth}`);
  if (!isEven(pageWidth) || !isEven(pageHeight)) throw new Error(`正交机位的画布宽高要是偶数（CSS 像素）：${pageWidth}×${pageHeight}`);
  const pxPerCell = 16 * p.N; // 成片像素 / 格
  const cellsPerPx = filmScale / (dpr * pxPerCell); // 一个画布像素是多少格
  const oblique = topDepth / p.N;
  const F = facingVecs[p.facing];
  const R = new THREE.Vector3().crossVectors(F, worldUp);
  const B = F.clone().negate();
  // 画面坐标只取决于看点：横 = t·R，竖 = t·上 − 斜·(t·B)；两个都吸附到画布像素网格上
  const t = sceneToThree(p.看);
  const a = t.dot(R);
  const b = t.y - oblique * t.dot(B);
  const snap = (v: number) => Math.round(v / cellsPerPx) * cellsPerPx;
  t.addScaledVector(R, snap(a) - a).addScaledVector(worldUp, snap(b) - b);
  return {
    位置: t.clone().addScaledVector(B, rigDistance),
    lookPoint: t,
    半宽: (pageWidth * filmScale) / (2 * pxPerCell),
    halfHeight: (pageHeight * filmScale) / (2 * pxPerCell),
    near: p.section === undefined ? 0.1 : Math.max(0.1, rigDistance - p.section),
    farPlane: rigDistance + (p.depth ?? 256),
    oblique,
  };
};

type ManualCapable = { manual?: boolean };

/** 照取景设好正交相机：标准正交投影再乘一个斜切（相机空间 y' = y − 斜·(z + 机距)，看点所在的那一层不切） */
export const setOrthoCamera = (cam: THREE.OrthographicCamera, q: OrthoFraming) => {
  (cam as THREE.OrthographicCamera & ManualCapable).manual = true;
  cam.position.copy(q.位置);
  cam.up.copy(worldUp);
  cam.lookAt(q.lookPoint);
  Object.assign(cam, { left: -q.半宽, right: q.半宽, top: q.halfHeight, bottom: -q.halfHeight, near: q.near, far: q.farPlane, zoom: 1 });
  cam.updateProjectionMatrix();
  if (q.oblique) {
    const shear = new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, -q.oblique, -q.oblique * rigDistance, 0, 0, 1, 0, 0, 0, 0, 1);
    cam.projectionMatrix.multiply(shear);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }
  cam.updateMatrixWorld();
};

export const setPerspCamera = (cam: THREE.PerspectiveCamera, p: PerspectiveRigParams, aspectRatio: number) => {
  (cam as THREE.PerspectiveCamera & ManualCapable).manual = true;
  cam.fov = p.fov ?? 70;
  cam.aspect = aspectRatio;
  cam.near = p.near ?? 0.05;
  cam.far = p.farPlane ?? 512;
  cam.position.copy(sceneToThree(p.眼));
  cam.up.copy(worldUp);
  cam.lookAt(sceneToThree(p.看));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
};

/** 按参数设当前相机（相机种类要对得上） */
export const CameraRig: React.FC<{ 参数: CameraRigParams }> = ({ 参数: params }) => {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  if (params.种 === '正交') {
    if (!(camera as THREE.OrthographicCamera).isOrthographicCamera) throw new Error('正交像素机位要正交相机：ThreeCanvas 传 orthographic，或用 三渲二画布');
    setOrthoCamera(camera as THREE.OrthographicCamera, computeOrthoFraming(params, size.width, size.height, dpr));
  } else {
    if (!(camera as THREE.PerspectiveCamera).isPerspectiveCamera) throw new Error('透视机位要透视相机');
    setPerspCamera(camera as THREE.PerspectiveCamera, params, params.aspectRatio ?? size.width / size.height);
  }
  return null;
};
/** 在画布外面另建一台和画布里一样的相机，给 2D 叠层用 库/界面/投影.ts 的 投影到页面 算头顶气泡这类的位置（场景坐标先过 Z朝上转three）。
 *  宽高、dpr 要和画布一样（三渲二画布 的 dpr 是 canvasDpr(1)），正交的吸附才对得上 */
export const makeRigCamera = (p: CameraRigParams, width: number, height: number, dpr: number): THREE.OrthographicCamera | THREE.PerspectiveCamera => {
  if (p.种 === '正交') {
    const cam = new THREE.OrthographicCamera();
    setOrthoCamera(cam, computeOrthoFraming(p, width, height, dpr));
    return cam;
  }
  const cam = new THREE.PerspectiveCamera();
  setPerspCamera(cam, p, p.aspectRatio ?? width / height);
  return cam;
};

/** 新建一个和参数种类对得上的相机（给 ThreeCanvas 的 camera） */
export const newCamera = (cameraKind: CameraRigParams['种']): THREE.OrthographicCamera | THREE.PerspectiveCamera => {
  const cam = cameraKind === '正交' ? new THREE.OrthographicCamera() : new THREE.PerspectiveCamera();
  (cam as typeof cam & ManualCapable).manual = true;
  return cam;
};
