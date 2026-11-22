// 封面草稿每个方案的人和机位（不渲染，纯函数）：画面.tsx 照它摆人、摆镜头，地形视图.ts 拿机位给加载计划，两边同一份。
// 杖尖由骨骼正解算（角色/娘化亚波伦.tsx 的 holdWandPose），所以引到那个 .tsx；加载计划打包时连它一起打（pipeline/验收/打包加载.ts）。
import type * as THREE from 'three';
import { type Cam, sightDir } from '@engine/core/机位.ts';
import { placeCamera } from '@engine/core/three换算.ts';
import type { TerrainCanvasView } from '@engine/voxel/地形视图.ts';
import { hover, holdWandPose, stand } from '../../角色/娘化亚波伦.tsx';
import { netherBrighter, realNetherView } from '../../地点/真下界视图.ts';
import { staffRig } from '../../界面/指杖机位.ts';
import type { Plan } from './视图.ts';

/**
 * 斜着看盘的机位（视图.ts 的 斜看盘）：杖的方向 d 在镜头坐标里要等于 sinθ·(cosφ·右 − sinφ·上) + cosθ·前（cosθ = 扁，φ = 斜），镜头不滚转。
 * 设镜头朝向的方位角 α（从北往东）、仰角 ε，h = d 的水平分量投到镜头朝向上的长度：(h, d.z) 转 −ε 得 (cosθ, −sinθ·sinφ)，解出 h、ε，再由 h 解 α（取杖指向画面右边的那个解）
 */
const diagLookRig = (d: readonly number[], aimCenter: readonly number[], settings: NonNullable<Plan['obliqueWheel']>, lens: number, aspectRatio: number): Cam => {
  const θ = Math.acos(settings.flatten);
  const upComp = -Math.sin(θ) * Math.sin((settings.angleDeg * Math.PI) / 180);
  const h2 = settings.flatten ** 2 + upComp ** 2 - d[2]! ** 2;
  const horizLen = Math.hypot(d[0]!, d[1]!);
  if (h2 < 0 || Math.sqrt(h2) > horizLen) throw new Error('封面草稿：杖这么陡，摆不出要的 扁、斜（镜头不滚转）');
  const h = Math.sqrt(h2);
  const ε = Math.atan2(d[2]!, h) - Math.atan2(upComp, settings.flatten);
  const α = Math.atan2(d[0]!, d[1]!) - Math.acos(h / horizLen);
  const forward = [Math.cos(ε) * Math.sin(α), Math.cos(ε) * Math.cos(α), Math.sin(ε)];
  const right = [Math.cos(α), -Math.sin(α), 0];
  const up = [-Math.sin(ε) * Math.sin(α), -Math.sin(ε) * Math.cos(α), Math.cos(ε)];
  // 圆心那个深度上画面的宽、高（格）：把镜头横着、竖着挪，圆心就落到 盘心 给的位置
  const width = (2 * settings.dist * 18) / lens;
  const [shiftRight, shiftUp] = [-(settings.wheelCenter[0] - 0.5) * width, (settings.wheelCenter[1] - 0.5) * (width / aspectRatio)];
  const pos = [0, 1, 2].map((i) => aimCenter[i]! - forward[i]! * settings.dist + right[i]! * shiftRight + up[i]! * shiftUp) as [number, number, number];
  return { pos, tgt: [pos[0] + forward[0]!, pos[1] + forward[1]!, pos[2] + forward[2]!], lens };
};

/** 方案 v 在宽高比 aspectRatio 的画面里：她的属性、杖、机位 */
export const coverPose = (v: Plan, aspectRatio: number) => {
  const yaBoLun = v.yaBoLun;
  const yaBoLunProps = { pose: { loc: [...yaBoLun.位], yaw: yaBoLun.yaw ?? 180 }, sec: 1.4, act: yaBoLun.act === '悬停' ? hover : stand, bonePose: yaBoLun.bonePose };
  // 杖尖在哪、朝哪：和画她用同一份属性算
  // 杖握在手里是六稿起的挂法；五稿及以前的旧案照旧握法画，画面不动
  const newGrip = !!v.obliqueWheel || !!v.pointWand;
  const gripOffset = v.pointWand?.gripOffset;
  const staff = holdWandPose({ ...yaBoLunProps, gripOffset, oldGrip: !newGrip });
  // 盘心居中的方案：镜头朝向不变（手臂的角度是照这个朝向搜的），整个平移到光轴穿过圆心（杖尖再沿杖身伸出 离尖）
  const cameraRig = ((): Cam => {
    const aimCenter = [0, 1, 2].map((i) => staff.tip[i]! + staff.axis[i]! * (v.wheel.placement.tipOffset ?? 0));
    if (v.obliqueWheel) return diagLookRig(staff.axis, aimCenter, v.obliqueWheel, v.cameraRig.lens, aspectRatio);
    if (v.pointWand?.lookMid) {
      // 扫角度用：镜头位置照 θ 反算，但对准盘心和她胸口的中点，哪个角度她和盘都在画里
      const camPos = staffRig({ 心: aimCenter, d: staff.axis, θ: v.pointWand.θ, azimuthDeg: v.pointWand.azimuthDeg, dist: v.pointWand.dist, lens: v.cameraRig.lens, discCenterPicture: [0.5, 0.5], aspectRatio }).pos;
      const chest = [v.yaBoLun.位[0], v.yaBoLun.位[1], v.yaBoLun.位[2] + 1];
      return { pos: camPos, tgt: [0, 1, 2].map((i) => (aimCenter[i]! + chest[i]!) / 2) as [number, number, number], lens: v.cameraRig.lens };
    }
    if (v.pointWand) return staffRig({ 心: aimCenter, d: staff.axis, θ: v.pointWand.θ, azimuthDeg: v.pointWand.azimuthDeg, dist: v.pointWand.dist, lens: v.cameraRig.lens, discCenterPicture: v.pointWand.wheelCenter, aspectRatio });
    if (!v.wheelCentered) return v.cameraRig;
    const viewDir = sightDir(v.cameraRig);
    const depth = [0, 1, 2].reduce((sum, i) => sum + (aimCenter[i]! - v.cameraRig.pos[i]!) * viewDir[i]!, 0);
    const moveVec = [0, 1, 2].map((i) => aimCenter[i]! - v.cameraRig.pos[i]! - viewDir[i]! * depth);
    const shiftPoint = (p: readonly number[]) => [p[0]! + moveVec[0]!, p[1]! + moveVec[1]!, p[2]! + moveVec[2]!] as [number, number, number];
    return { ...v.cameraRig, pos: shiftPoint(v.cameraRig.pos), tgt: shiftPoint(v.cameraRig.tgt) };
  })();
  return { yaBoLunProps, newGrip, gripOffset, staff, cameraRig };
};

/** 远景（真下界）方案的远裁面，别的用 placeCamera 的默认 */
export const coverCameraFar = (v: Plan) => (v.farView ? 1400 : undefined);
export const placeCoverCamera = (camera: THREE.PerspectiveCamera, cameraRig: Cam, aspectRatio: number, far: number | undefined) => placeCamera(camera, cameraRig, aspectRatio, far ? { far } : {});
/** 远景方案挂真下界，别的是画面里自己垒的假地形 */
export const coverTerrain = (v: Plan, cameraRig: Cam): TerrainCanvasView[] =>
  v.farView ? [realNetherView(cameraRig.pos, netherBrighter, (camera, aspectRatio) => placeCoverCamera(camera, cameraRig, aspectRatio, coverCameraFar(v)))] : [];
