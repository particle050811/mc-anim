// 杖指着镜头的机位反算和自检（纯模块，不碰 three）：封面八稿起用（核对/封面草稿），第 4 幕张盘特写也用。用户 11-10 定的几何：盘心就是杖尖、盘面和杖身严格垂直、图标正面朝杖尖指的那一侧；
// 镜头在盘的正面一侧、被杖指着（「为什么要从背后偷窥她？被指着的压迫感更强」），她在盘的背面、脸朝镜头，在画面左上，杖朝右下伸到椭圆的圆心。
// 记 d = 杖尾指向杖尖的单位向量，θ = d 和「盘心指向镜头」的夹角：θ = 0 盘是正圆、她整个在盘后面，θ 越大盘越扁、她越往盘外露。
// 仰拍（用户 11-10 贴了大黑塔终结技的截图：「我想要的构图就是这样的，只不过只有最上方的一个，并且靠得近一点」）：镜头在她下方往上看，她浮在高处俯视镜头、杖朝下指过来，
// 身体近大远小（腿脚近、头远）。仰角、她占画面多高也在自检里。
// 镜头不手调：指杖机位 由（盘心、d、θ、绕 d 的方位角、距离、焦距、盘心落在画面哪）反算；画面自检 把盘心、盘边、杖尾、她的脸投到画面，算出该核对的数。
// 坐标是场景坐标（Z 朝上，单位格），机位约定同 engine/core/机位.ts（不滚转，相机的上是 +z）。
import { ASPECT_HALF_WIDTH, type Cam } from '@engine/core/机位.ts';
import type { V3 } from '@engine/model/parts.tsx';

type Vec = readonly number[];
const radPerDeg = Math.PI / 180;
const addVec = (a: Vec, b: Vec, k = 1): V3 => [a[0]! + b[0]! * k, a[1]! + b[1]! * k, a[2]! + b[2]! * k];
const dot = (a: Vec, b: Vec) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: Vec, b: Vec): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const vecLength = (a: Vec) => Math.hypot(a[0]!, a[1]!, a[2]!);
const normalize = (a: Vec): V3 => addVec([0, 0, 0], a, 1 / vecLength(a));

/** 和 d 垂直的一对基：u = 世界的上投到盘面上（d 竖直时改用北），v = d × u。方位角从 u 起、朝 v 转 */
export const plateBasis = (d: Vec): { u: V3; v: V3 } => {
  const toPlane = (a: Vec) => addVec(a, d, -dot(a, d));
  let u = toPlane([0, 0, 1]);
  if (vecLength(u) < 0.05) u = toPlane([0, 1, 0]);
  u = normalize(u);
  return { u, v: cross(d, u) };
};

export type StaffRigParams = {
  /** 盘心 = 杖尖 */
  心: Vec;
  /** 杖尾指向杖尖的单位向量 = 盘的法线 */
  d: Vec;
  /** d 和「盘心指向镜头」的夹角（度），0～90 之间镜头都在盘的正面一侧 */
  θ: number;
  /** 镜头偏到 d 的哪一侧：绕 d 的方位角（度），0 = 偏向 盘面基 的 u（上），90 = 偏向 v */
  azimuthDeg: number;
  /** 镜头到盘心几格 */
  距: number;
  lens: number;
  /** 盘心落在画面的哪（宽、高的比例，左上角起） */
  discCenterPicture: readonly [number, number];
  aspectRatio: number;
};

/**
 * 反算机位。镜头位置 = 心 + 距·(cosθ·d + sinθ·w)，w = cos方位·u + sin方位·v：到盘心的距离、θ 都是准的。
 * 朝向：不滚转，转到盘心正好落在 盘心画面（只转不挪，θ 不变）。设画面上盘心的方向在镜头坐标里是 (X, Y, 1)（右、上、前），
 * g = 镜头指向盘心的单位向量，仰角 ε 由 g.z·n = Y·cosε + sinε 解，方位角 α 由 g 的水平方位减去 atan2(X, cosε − Y·sinε)
 */
export const staffRig = ({ 心: aimCenter, d, θ, azimuthDeg, 距: distance, lens, discCenterPicture, aspectRatio }: StaffRigParams): Cam => {
  const { u, v } = plateBasis(d);
  const w = addVec(addVec([0, 0, 0], u, Math.cos(azimuthDeg * radPerDeg)), v, Math.sin(azimuthDeg * radPerDeg));
  const pos = addVec(addVec(aimCenter, d, distance * Math.cos(θ * radPerDeg)), w, distance * Math.sin(θ * radPerDeg));
  const g = normalize(addVec(aimCenter, pos, -1));
  const X = ((discCenterPicture[0] - 0.5) * 2 * ASPECT_HALF_WIDTH) / lens;
  const Y = ((0.5 - discCenterPicture[1]) * 2 * ASPECT_HALF_WIDTH) / lens / aspectRatio;
  const n = Math.hypot(1, X, Y);
  const sinRoll = (n * g[2]) / Math.hypot(1, Y);
  if (Math.abs(sinRoll) > 1) throw new Error('指杖机位：镜头几乎竖直看盘心，不滚转摆不出这个盘心画面位置');
  const ε = Math.asin(sinRoll) - Math.atan(Y);
  const α = Math.atan2(g[0], g[1]) - Math.atan2(X, Math.cos(ε) - Y * Math.sin(ε));
  const forward: V3 = [Math.cos(ε) * Math.sin(α), Math.cos(ε) * Math.cos(α), Math.sin(ε)];
  return { pos, tgt: addVec(pos, forward, distance), lens };
};

/** 场景点投到画面：返回宽、高的比例（左上角起）和深度（镜头前方为正，格）。和 engine/core/three换算.ts 的 摆相机 + 投到画面 一个结果（不滚转） */
export const projectToScreen = (cameraRig: Cam, aspectRatio: number, point: Vec): { x: number; y: number; depth: number } => {
  const forward = normalize(addVec(cameraRig.tgt, cameraRig.pos, -1));
  const right = normalize(cross(forward, [0, 0, 1]));
  const up = cross(right, forward);
  const p = addVec(point, cameraRig.pos, -1);
  const depth = dot(p, forward);
  return { x: 0.5 + (dot(p, right) / depth) * (cameraRig.lens / ASPECT_HALF_WIDTH / 2), y: 0.5 - (dot(p, up) / depth) * ((cameraRig.lens * aspectRatio) / ASPECT_HALF_WIDTH / 2), depth };
};

/** 镜头的仰角（度）：视线和水平面的夹角，往上看为正 */
export const cameraElevation = (cameraRig: Pick<Cam, 'pos' | 'tgt'>): number => {
  const v = addVec(cameraRig.tgt, cameraRig.pos, -1);
  return Math.asin(v[2] / vecLength(v)) / radPerDeg;
};

/**
 * 画面上一圈点（椭圆的边，像素比例的坐标：x 朝右、y 朝下）的长轴、短轴：长轴 = 相距最远的两点，短轴 = 垂直长轴方向上的宽。
 * 透视下圆投出来还是椭圆，但它的短轴不一定正好在「盘面里朝镜头偏的那条直径」的投影上，所以照投出来的边实量
 */
export const ellipseAxes = (outline: readonly (readonly [number, number])[]): { longDir: [number, number]; 长: number; minor: number } => {
  let [maxDist, firstIndex, secondIdx] = [-1, 0, 0];
  for (let i = 0; i < outline.length; i++)
    for (let j = i + 1; j < outline.length; j++) {
      const distanceSq = (outline[i]![0] - outline[j]![0]) ** 2 + (outline[i]![1] - outline[j]![1]) ** 2;
      if (distanceSq > maxDist) [maxDist, firstIndex, secondIdx] = [distanceSq, i, j];
    }
  const majorLength = Math.sqrt(maxDist);
  const longDir: [number, number] = [(outline[secondIdx]![0] - outline[firstIndex]![0]) / majorLength, (outline[secondIdx]![1] - outline[firstIndex]![1]) / majorLength];
  const perpProj = outline.map((p) => -p[0] * longDir[1] + p[1] * longDir[0]);
  return { longDir, 长: majorLength, minor: Math.max(...perpProj) - Math.min(...perpProj) };
};

export type SelfCheckInput = {
  cameraRig: Cam;
  aspectRatio: number;
  心: Vec;
  d: Vec;
  /** 盘的外半径（格） */
  radius: number;
  staffTail: Vec;
  /** 她脸的中心 */
  face: Vec;
  /** 她的脸、身子正面朝的方向（单位向量） */
  faceDir: Vec;
  bodyDir: Vec;
  /** 她身体各方盒的角（不算头后光环），量她在画面上占多高 */
  bodyPoints: readonly Vec[];
};

export type SelfCheckNumbers = {
  /** (镜头 − 盘心)·d（格）：> 0 = 镜头在盘的正面一侧，图标不镜像 */
  frontDot: number;
  /** d 和「盘心指向镜头」的夹角（度） */
  θ: number;
  /** 盘心、杖尾、脸在画面上的位置（宽、高的比例） */
  wheelCenter: [number, number];
  staffTail: [number, number];
  face: [number, number];
  /** 镜头仰角（度，视线和水平面的夹角） */
  cameraElevation: number;
  /** d 的竖直分量（负 = 杖朝下指） */
  wandVertical: number;
  /** 镜头比她身体最低的一点低几格 */
  bodyBelowShot: number;
  /** 脸比脚离镜头远几格（沿视线的深度）：正 = 腿脚近、头远，仰拍的近大远小 */
  footNearHeadFar: number;
  /** 她（身体点）在画面上的范围 [左, 上, 右, 下] 和占画面高的几成（出画的部分不算） */
  bodyBox: [number, number, number, number];
  bodyHeightFrac: number;
  /** 盘边四个点：盘面里朝镜头偏的那条直径的两端、和它垂直的那条直径的两端 */
  axisEnds: { shortNear: [number, number]; shortFar: [number, number]; longA: [number, number]; longB: [number, number] };
  /** 杖在画面上的方向（杖尾 → 杖尖）：从水平朝右起、往下为正的角度（度）。0～90 = 指向右下 */
  staffAngleDeg: number;
  /** 椭圆（照投到画面的盘边实量，见 椭圆轴）短轴的方向和杖的方向差几度（0 = 一致，垂直的必然结果；透视下会差一点） */
  shortAxisWandOffset: number;
  /** 椭圆长轴离竖直几度（0 = 正竖着） */
  longAxisTiltDeg: number;
  /** 画面上短轴 / 长轴的长度比（像素） */
  shortLongRatio: number;
  /** 盘在画面上的框高 ÷ 她的框高（都不裁画面）：> 1 = 盘比她大 */
  plateToHerRatio: number;
  /** 盘边一圈在画面上的范围 [左, 上, 右, 下]（宽、高的比例）和落在画面里的那部分占一圈的几成 */
  discBox: [number, number, number, number];
  plateInFrame: number;
  /** 镜头看脸的视线穿不穿过盘（穿过 = 脸隔着盘看）；脸在画面上离盘的边多远（格，盘面上量；正 = 在盘外） */
  faceBehindDisc: boolean;
  faceDistToEdge: number;
  /** 她的正面方向和「她指向镜头」的点积：身、脸各一个 */
  bodyTowardShot: number;
  faceTowardShot: number;
};

export const pictureSelfCheck = ({ cameraRig, aspectRatio, 心: aimCenter, d, radius, staffTail, face, faceDir, bodyDir, bodyPoints }: SelfCheckInput): SelfCheckNumbers => {
  const project = (p: Vec): [number, number] => {
    const q = projectToScreen(cameraRig, aspectRatio, p);
    return [q.x, q.y];
  };
  // 画面上两点连线的像素向量（x 朝右、y 朝下）
  const vecBetween = (a: readonly [number, number], b: readonly [number, number]) => [(b[0] - a[0]) * aspectRatio, b[1] - a[1]] as const;
  const toCamera = addVec(cameraRig.pos, aimCenter, -1);
  const frontDot = dot(toCamera, d);
  // 盘面里朝镜头偏的方向：短轴在这个方向上（θ = 0 时没有偏向，随便取一个）
  const offset = addVec(toCamera, d, -frontDot);
  const w = vecLength(offset) > 1e-9 ? normalize(offset) : plateBasis(d).u;
  const longDir = cross(d, w);
  const axisEnds = { shortNear: project(addVec(aimCenter, w, radius)), shortFar: project(addVec(aimCenter, w, -radius)), longA: project(addVec(aimCenter, longDir, radius)), longB: project(addVec(aimCenter, longDir, -radius)) };
  const [wheelCenter, tail, facePoint] = [project(aimCenter), project(staffTail), project(face)];
  const wandLine = vecBetween(tail, wheelCenter);
  // 两条线的夹角（不分正反，0～90 度）
  const angleBetween = (a: readonly number[], b: readonly number[]) => {
    const c = Math.abs(a[0]! * b[0]! + a[1]! * b[1]!) / (Math.hypot(a[0]!, a[1]!) * Math.hypot(b[0]!, b[1]!));
    return Math.acos(Math.min(1, c)) / radPerDeg;
  };
  let [left, top, right, bottom, insideCount] = [Infinity, Infinity, -Infinity, -Infinity, 0];
  const steps = 360;
  const points: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const [x, y] = project(addVec(addVec(aimCenter, w, radius * Math.cos(a)), longDir, radius * Math.sin(a)));
    [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x), Math.max(bottom, y)];
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) insideCount++;
    points.push([x * aspectRatio, y]);
  }
  const ellipseAxis = ellipseAxes(points);
  const shortAxis = [-ellipseAxis.longDir[1], ellipseAxis.longDir[0]];
  const yaBoLunScreen = bodyPoints.map(project);
  const feet = bodyPoints.reduce((lowest, p) => (p[2]! < lowest[2]! ? p : lowest), bodyPoints[0] ?? face);
  const bodyBox: [number, number, number, number] = [Math.min(...yaBoLunScreen.map((p) => p[0])), Math.min(...yaBoLunScreen.map((p) => p[1])), Math.max(...yaBoLunScreen.map((p) => p[0])), Math.max(...yaBoLunScreen.map((p) => p[1]))];
  // 镜头 → 脸的视线和盘面的交点
  const sightVec = addVec(face, cameraRig.pos, -1);
  const t = dot(addVec(aimCenter, cameraRig.pos, -1), d) / dot(sightVec, d);
  const point = addVec(cameraRig.pos, sightVec, t);
  const centerDist = vecLength(addVec(point, aimCenter, -1));
  const yaBoLunToShotVec = normalize(addVec(cameraRig.pos, face, -1));
  return {
    frontDot,
    θ: Math.acos(Math.max(-1, Math.min(1, frontDot / vecLength(toCamera)))) / radPerDeg,
    wheelCenter,
    staffTail: tail,
    face: facePoint,
    cameraElevation: cameraElevation(cameraRig),
    wandVertical: d[2]!,
    bodyBelowShot: Math.min(...bodyPoints.map((p) => p[2]!)) - cameraRig.pos[2],
    footNearHeadFar: projectToScreen(cameraRig, aspectRatio, face).depth - projectToScreen(cameraRig, aspectRatio, feet).depth,
    bodyBox,
    bodyHeightFrac: Math.max(0, Math.min(1, bodyBox[3]) - Math.max(0, bodyBox[1])),
    axisEnds,
    staffAngleDeg: Math.atan2(wandLine[1], wandLine[0]) / radPerDeg,
    shortAxisWandOffset: angleBetween(wandLine, shortAxis),
    longAxisTiltDeg: angleBetween(ellipseAxis.longDir, [0, 1]),
    shortLongRatio: ellipseAxis.minor / ellipseAxis.长,
    plateToHerRatio: (bottom - top) / (bodyBox[3] - bodyBox[1]),
    discBox: [left, top, right, bottom],
    plateInFrame: insideCount / steps,
    faceBehindDisc: Number.isFinite(t) && t > 0 && t < 1 && centerDist < radius,
    faceDistToEdge: centerDist - radius,
    bodyTowardShot: dot(bodyDir, yaBoLunToShotVec),
    faceTowardShot: dot(faceDir, yaBoLunToShotVec),
  };
};

/** 八稿的标准（用户 11-10 的几条，数是派活时定的）：返回没达标的项，空 = 全过。露脸 = 脸不许隔着盘（θ 小的那案如实挡着，不查） */
export const unmetRequirements = (probe: SelfCheckNumbers, want: { θ: number; faceVisible: boolean }): string[] => {
  const errors: string[] = [];
  const check = (ok: boolean, message: string) => {
    if (!ok) errors.push(message);
  };
  check(probe.frontDot > 0, '镜头不在盘的正面一侧');
  check(Math.abs(probe.θ - want.θ) < 0.5, `θ ${probe.θ.toFixed(1)} 不是 ${want.θ}`);
  check(probe.cameraElevation >= 40, `仰角 ${probe.cameraElevation.toFixed(1)} 不到 40 度`);
  check(probe.wandVertical < -0.3, `杖没明显朝下指（d 的竖直分量 ${probe.wandVertical.toFixed(2)}）`);
  check(probe.bodyBelowShot > 0, `镜头不在她下方（${probe.bodyBelowShot.toFixed(2)} 格）`);
  check(probe.footNearHeadFar > 0.5, `不是腿脚近、头远（脸比脚远 ${probe.footNearHeadFar.toFixed(2)} 格）`);
  check(probe.bodyHeightFrac >= 0.4, `她只占画面高的 ${Math.round(probe.bodyHeightFrac * 100)}%`);
  check(probe.plateToHerRatio > 1, `盘不比她大（${probe.plateToHerRatio.toFixed(2)}）`);
  check(probe.face[0] > 0 && probe.face[0] <= 0.4 && probe.face[1] > 0 && probe.face[1] <= 0.45, `脸 (${probe.face.map((v) => v.toFixed(2))}) 不在左上（横 40%、纵 45% 以内）`);
  check(probe.staffAngleDeg > 10 && probe.staffAngleDeg < 80, `杖在画面上不是朝右下（${probe.staffAngleDeg.toFixed(0)} 度）`);
  check(probe.shortAxisWandOffset < 6, `短轴和杖的方向差 ${probe.shortAxisWandOffset.toFixed(1)} 度`);
  check(probe.wheelCenter[0] >= 0.5 && probe.wheelCenter[0] <= 0.7 && probe.wheelCenter[1] >= 0.5 && probe.wheelCenter[1] <= 0.7, `盘心 (${probe.wheelCenter.map((v) => v.toFixed(2))}) 不在中间偏右下`);
  check(probe.bodyTowardShot > 0.5, `身子没朝镜头（${probe.bodyTowardShot.toFixed(2)}）`);
  check(probe.faceTowardShot > 0.5, `脸没朝镜头（${probe.faceTowardShot.toFixed(2)}）`);
  if (want.faceVisible) check(!probe.faceBehindDisc, `脸隔着盘（离盘边 ${probe.faceDistToEdge.toFixed(2)} 格）`);
  return errors;
};

/** 写进视图说明的那一行数 */
export const describeSelfCheck = (probe: SelfCheckNumbers): string => {
  const fmtPos = (p: readonly number[]) => `${Math.round(p[0]! * 100)}%,${Math.round(p[1]! * 100)}%`;
  return [
    `θ ${probe.θ.toFixed(0)}°、(镜头−盘心)·d ${probe.frontDot.toFixed(2)} 格`,
    `仰角 ${probe.cameraElevation.toFixed(0)}°、镜头比她脚低 ${probe.bodyBelowShot.toFixed(1)} 格、杖竖直分量 ${probe.wandVertical.toFixed(2)}、脸比脚远 ${probe.footNearHeadFar.toFixed(1)} 格、她占画面高 ${Math.round(probe.bodyHeightFrac * 100)}%`,
    `脸 ${fmtPos(probe.face)}、盘心 ${fmtPos(probe.wheelCenter)}`,
    `杖向右下 ${probe.staffAngleDeg.toFixed(0)}°、短轴偏杖 ${probe.shortAxisWandOffset.toFixed(1)}°、短长比 ${probe.shortLongRatio.toFixed(2)}、长轴离竖直 ${probe.longAxisTiltDeg.toFixed(0)}°`,
    `盘在画内 ${Math.round(probe.plateInFrame * 100)}%、盘高是她的 ${probe.plateToHerRatio.toFixed(2)} 倍`,
    `身·镜头 ${probe.bodyTowardShot.toFixed(2)}、脸·镜头 ${probe.faceTowardShot.toFixed(2)}`,
    probe.faceBehindDisc ? `脸隔着盘（离盘边 ${(-probe.faceDistToEdge).toFixed(2)} 格）` : `脸在盘外 ${probe.faceDistToEdge.toFixed(2)} 格`,
  ].join('；');
};
