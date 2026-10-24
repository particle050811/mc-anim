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
import { 成片倍数 } from './像素.ts';

export type 朝向 = '北' | '南' | '东' | '西';

export type 正交机位参数 = {
  种: '正交';
  /** 画面中心对准的点（场景坐标）；实际会吸附到像素网格，最多挪半个画布像素 */
  看: V3;
  /** 镜头朝哪边看 */
  朝: 朝向;
  /** 一个贴图像素在成片上几个像素（整数，取偶数） */
  N: number;
  /** 顶面一个贴图像素在成片上几个像素高（整数，0～N）：0 = 纯侧面看不到顶面 */
  顶面?: number;
  /** 剖面：看点往镜头方向多远开始画（格），不给 = 不剖 */
  剖?: number;
  /** 看点往里画多远（格） */
  深?: number;
};

export type 透视机位参数 = {
  种: '透视';
  眼: V3;
  看: V3;
  /** 竖直视角（度），原版默认 70 */
  视角?: number;
  近?: number;
  远?: number;
};

export type 机位参数 = 正交机位参数 | 透视机位参数;

const toThree = ([x, y, z]: V3) => new THREE.Vector3(x, z, -y);

// 镜头朝向（three 世界坐标）：北 = 场景 +y = three −z
const 前方: Record<朝向, THREE.Vector3> = {
  北: new THREE.Vector3(0, 0, -1),
  南: new THREE.Vector3(0, 0, 1),
  东: new THREE.Vector3(1, 0, 0),
  西: new THREE.Vector3(-1, 0, 0),
};
const 上方 = new THREE.Vector3(0, 1, 0);

/** 相机离看点多远（格）；正交投影里只影响裁剪面，不影响画面 */
const 机距 = 128;

export type 正交取景 = {
  位置: THREE.Vector3;
  看点: THREE.Vector3;
  /** 视体半宽、半高（格） */
  半宽: number;
  半高: number;
  近: number;
  远: number;
  /** 斜投影系数：往里每格画面上升多少格 */
  斜: number;
};

/** 算正交像素机位的取景。页面宽高是画布的 CSS 尺寸（取偶数），dpr 是画布像素对 CSS 像素的倍数 */
export const 算正交取景 = (p: 正交机位参数, 页面宽: number, 页面高: number, dpr: number): 正交取景 => {
  if (!Number.isInteger(p.N) || p.N <= 0) throw new Error(`正交机位的 N 要是正整数：${p.N}`);
  const 顶面 = p.顶面 ?? 0;
  if (!Number.isInteger(顶面) || 顶面 < 0 || 顶面 > p.N) throw new Error(`正交机位的 顶面 要是 0～N 的整数：${顶面}`);
  const 每格 = 16 * p.N; // 成片像素 / 格
  const 网格 = 成片倍数 / (dpr * 每格); // 一个画布像素是多少格
  const 斜 = 顶面 / p.N;
  const F = 前方[p.朝];
  const R = new THREE.Vector3().crossVectors(F, 上方);
  const B = F.clone().negate();
  // 画面坐标只取决于看点：横 = t·R，竖 = t·上 − 斜·(t·B)；两个都吸附到画布像素网格上
  const t = toThree(p.看);
  const a = t.dot(R);
  const b = t.y - 斜 * t.dot(B);
  const 吸 = (v: number) => Math.round(v / 网格) * 网格;
  t.addScaledVector(R, 吸(a) - a).addScaledVector(上方, 吸(b) - b);
  return {
    位置: t.clone().addScaledVector(B, 机距),
    看点: t,
    半宽: (页面宽 * 成片倍数) / (2 * 每格),
    半高: (页面高 * 成片倍数) / (2 * 每格),
    近: p.剖 === undefined ? 0.1 : Math.max(0.1, 机距 - p.剖),
    远: 机距 + (p.深 ?? 256),
    斜,
  };
};

type 可手动 = { manual?: boolean };

/** 照取景设好正交相机：标准正交投影再乘一个斜切（相机空间 y' = y − 斜·(z + 机距)，看点所在的那一层不切） */
export const 设正交相机 = (cam: THREE.OrthographicCamera, q: 正交取景) => {
  (cam as THREE.OrthographicCamera & 可手动).manual = true;
  cam.position.copy(q.位置);
  cam.up.copy(上方);
  cam.lookAt(q.看点);
  Object.assign(cam, { left: -q.半宽, right: q.半宽, top: q.半高, bottom: -q.半高, near: q.近, far: q.远, zoom: 1 });
  cam.updateProjectionMatrix();
  if (q.斜) {
    const 切 = new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, -q.斜, -q.斜 * 机距, 0, 0, 1, 0, 0, 0, 0, 1);
    cam.projectionMatrix.multiply(切);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }
  cam.updateMatrixWorld();
};

export const 设透视相机 = (cam: THREE.PerspectiveCamera, p: 透视机位参数, 宽高比: number) => {
  (cam as THREE.PerspectiveCamera & 可手动).manual = true;
  cam.fov = p.视角 ?? 70;
  cam.aspect = 宽高比;
  cam.near = p.近 ?? 0.05;
  cam.far = p.远 ?? 512;
  cam.position.copy(toThree(p.眼));
  cam.up.copy(上方);
  cam.lookAt(toThree(p.看));
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
};

/** 按参数设当前相机（相机种类要对得上） */
export const 机位: React.FC<{ 参数: 机位参数 }> = ({ 参数 }) => {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  if (参数.种 === '正交') {
    if (!(camera as THREE.OrthographicCamera).isOrthographicCamera) throw new Error('正交像素机位要正交相机：ThreeCanvas 传 orthographic，或用 三渲二画布');
    设正交相机(camera as THREE.OrthographicCamera, 算正交取景(参数, size.width, size.height, dpr));
  } else {
    if (!(camera as THREE.PerspectiveCamera).isPerspectiveCamera) throw new Error('透视机位要透视相机');
    设透视相机(camera as THREE.PerspectiveCamera, 参数, size.width / size.height);
  }
  return null;
};

export const 正交像素机位: React.FC<Omit<正交机位参数, '种'>> = (p) => <机位 参数={{ 种: '正交', ...p }} />;
export const 透视机位: React.FC<Omit<透视机位参数, '种'>> = (p) => <机位 参数={{ 种: '透视', ...p }} />;

/** 新建一个和参数种类对得上的相机（给 ThreeCanvas 的 camera） */
export const 新相机 = (种: 机位参数['种']): THREE.OrthographicCamera | THREE.PerspectiveCamera => {
  const cam = 种 === '正交' ? new THREE.OrthographicCamera() : new THREE.PerspectiveCamera();
  (cam as typeof cam & 可手动).manual = true;
  return cam;
};
