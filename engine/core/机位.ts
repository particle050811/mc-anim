// 透视机位的正本（10-30 整体优化方案 0.6）：Cam 类型、焦距和视角换算、机位插值。新代码一律从这里 import；
// 旧代码里的 `type Cam`、lerpCam、aimCamera 一类副本原样不动，登记在 docs/副本表.tsv。三渲二的正交像素机位在 engine/三渲二/机位.tsx。
// 纯模块（只有类型 import，不碰 three）：段.ts、时间线.ts 和它们引的编排也能用。把 three 相机摆到机位上（aimCamera 的正本 摆相机）、投到画面在 three换算.ts。
//
// 约定（照应力转动各镜头的 Rig，例如 作品/应力转动/地点/古城4x/6-4-1/古城画面.tsx 的 aimCamera）：
// - pos、tgt 是场景坐标（Z 朝上，见 坐标.ts）；相机的上方是场景 +z（three +Y）。
// - lens 是焦距（毫米），按 36 mm 宽的横向画幅换算：水平视角 = 2·atan(18 / lens)，three 要的竖直视角再按宽高比折。
// - roll（度）在 lookAt 之后绕视线转：cam.rotateZ(+roll)，正 = 相机逆时针转、画面里的东西顺时针转。
//   副本差别：作品/应力转动/地点/飞行镜头.tsx 是 rotateZ(−roll)；现有镜头的 roll 只填过 0 和 180，两种写法画出来一样。
// 把回忆拼好给你的透视机位写成 { 眼, 看, 视角（竖直，度） }（engine/三渲二/机位.tsx 的 透视机位参数），用 转透视参数 / 从透视参数 换。
import type { V3 } from '../model/parts.tsx';
import type { PerspectiveRigParams } from '../三渲二/机位.tsx';
import { gameToScene, gameFacingToScene, type Origin } from './坐标.ts';
import { clamp01, hermite, lerp, lerpV, rad } from './数学.ts';

export type Cam = { pos: V3; tgt: V3; lens: number; roll?: number };

/** 横向画幅一半的宽（毫米）：36 mm 全画幅 */
export const ASPECT_HALF_WIDTH = 18;

/** 焦距（毫米）→ three 的竖直视角（度） */
export const lensToFov = (lens: number, aspectRatio: number) => (2 * Math.atan(ASPECT_HALF_WIDTH / lens / aspectRatio) * 180) / Math.PI;

/** 竖直视角（度）→ 焦距（毫米）。原版游戏的 fov 设置就是竖直视角（默认 70） */
export const fovToLens = (fov: number, aspectRatio: number) => ASPECT_HALF_WIDTH / aspectRatio / Math.tan(rad(fov) / 2);

/** 视线方向（单位向量，场景坐标） */
export const sightDir = (c: Pick<Cam, 'pos' | 'tgt'>): V3 => {
  const d = [c.tgt[0] - c.pos[0], c.tgt[1] - c.pos[1], c.tgt[2] - c.pos[2]];
  const n = Math.hypot(d[0]!, d[1]!, d[2]!) || 1;
  return [d[0]! / n, d[1]! / n, d[2]! / n];
};

/**
 * 两个单位向量之间球面插值：沿大圆匀角速从 a 转到 b，k 不夹。和 6-3-8 的 slerpDir（three 的 Quaternion.setFromUnitVectors + slerp）
 * 末位舍入以内一样；正好反向时同 three 取一根和 a 垂直的轴转（|ax| > |az| 取 (−ay, ax, 0)，否则 (0, −az, ay)）。
 */
export const slerpDir = (a: readonly number[], b: readonly number[], k: number): V3 => {
  const [ax, ay, az] = [a[0]!, a[1]!, a[2]!];
  const [bx, by, bz] = [b[0]!, b[1]!, b[2]!];
  const dot = ax * bx + ay * by + az * bz;
  if (dot + 1 < Number.EPSILON) {
    const [nx, ny, nz] = Math.abs(ax) > Math.abs(az) ? [-ay, ax, 0] : [0, -az, ay];
    const nLength = Math.hypot(nx, ny, nz);
    const [ux, uy, uz] = [nx / nLength, ny / nLength, nz / nLength];
    // 绕和 a 垂直的单位轴 u 转 kπ：a·cos + (u × a)·sin
    const [c, s] = [Math.cos(k * Math.PI), Math.sin(k * Math.PI)];
    return [ax * c + (uy * az - uz * ay) * s, ay * c + (uz * ax - ux * az) * s, az * c + (ux * ay - uy * ax) * s];
  }
  const crossLen = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
  const slerpAngle = Math.atan2(crossLen, dot);
  if (crossLen < 1e-9) {
    // 几乎同向：线性插再归一
    const v = [ax + (bx - ax) * k, ay + (by - ay) * k, az + (bz - az) * k];
    const vecLength = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
    return [v[0]! / vecLength, v[1]! / vecLength, v[2]! / vecLength];
  }
  const [wa, wb] = [Math.sin((1 - k) * slerpAngle) / crossLen, Math.sin(k * slerpAngle) / crossLen];
  return [ax * wa + bx * wb, ay * wa + by * wb, az * wa + bz * wb];
};

export type InterpRigOptions = {
  /** 线性（默认）：pos、tgt 各自线性插；球面：pos 线性插，视线方向球面插，看点距离线性插 */
  rotInterp?: '线性' | '球面';
  /** 线性（默认）；对数：在 log(lens) 上线性插，推拉镜头时画面放大的速度均匀 */
  lensMode?: '线性' | '对数';
};

/**
 * 两个机位之间插值，k 不夹。roll 两头都没给就不带；给了一头，另一头当 0。
 * 副本差别：7-起疑、7-4-3 的 lerpCam 直接拿 a.roll（两头 roll 一样时和这里相同），7-又一只、6-4-3 的不带 roll；
 * 6-3-8 的 camLerp 是「球面 + 对数」，看点固定放在视线 100 格处（只影响 tgt 的数值，lookAt 出来的朝向一样）；
 * 把回忆 2-新世界 的 插机位 插的是 { 眼, 看, 视角 }，等于这里的线性插（视角线性）。
 */
export const lerpRig = (a: Cam, b: Cam, k: number, options: InterpRigOptions = {}): Cam => {
  const pos = lerpV(a.pos, b.pos, k) as V3;
  let tgt: V3;
  if (options.rotInterp === '球面') {
    const distance = lerp(Math.hypot(...a.tgt.map((v, i) => v - a.pos[i]!)), Math.hypot(...b.tgt.map((v, i) => v - b.pos[i]!)), k);
    const d = slerpDir(sightDir(a), sightDir(b), k);
    tgt = [pos[0] + d[0] * distance, pos[1] + d[1] * distance, pos[2] + d[2] * distance];
  } else tgt = lerpV(a.tgt, b.tgt, k) as V3;
  const lens = options.lensMode === '对数' ? Math.exp(lerp(Math.log(a.lens), Math.log(b.lens), k)) : lerp(a.lens, b.lens, k);
  const c: Cam = { pos, tgt, lens };
  if (a.roll !== undefined || b.roll !== undefined) c.roll = lerp(a.roll ?? 0, b.roll ?? 0, k);
  return c;
};

/** 一串关键机位按帧插值：帧在两个关键机位之间时，进度先过 缓动（默认不缓，线性）再插；两头之外停在端点 */
export const rigTrack = (keyframes: readonly (readonly [帧: number, 机位: Cam])[], frame: number, ease: (t: number) => number = (t) => t, options?: InterpRigOptions): Cam => {
  if (!keyframes.length) throw new Error('机位轨至少要一个关键机位');
  if (frame <= keyframes[0]![0]) return keyframes[0]![1];
  for (let i = 0; i < keyframes.length - 1; i++) {
    const [f0, a] = keyframes[i]!;
    const [f1, b] = keyframes[i + 1]!;
    if (frame < f1) return lerpRig(a, b, ease(clamp01((frame - f0) / (f1 - f0))), options);
  }
  return keyframes[keyframes.length - 1]![1];
};

/** 近、远裁剪面（格）。three换算.ts 的 摆相机 默认 0.05、900（古城画面的 Rig） */
export type PlaceCameraOptions = { near?: number; far?: number };

/** Cam → 三渲二的透视机位参数（竖直视角按宽高比换；roll 那边没有，给了非 0 的 roll 就报错） */
export const toPerspectiveParams = (c: Cam, aspectRatio: number, options: PlaceCameraOptions = {}): PerspectiveRigParams => {
  if (c.roll && c.roll % 360 !== 0) throw new Error(`三渲二的透视机位不支持 roll：${c.roll}`);
  return { 种: '透视', 眼: c.pos, 看: c.tgt, fov: lensToFov(c.lens, aspectRatio), near: options.near, farPlane: options.far };
};

/** 三渲二的透视机位参数 → Cam（视角不给按原版默认 70） */
export const fromPerspectiveParams = (p: Pick<PerspectiveRigParams, '眼' | '看' | 'fov'>, aspectRatio: number): Cam => ({ pos: p.眼, tgt: p.看, lens: fovToLens(p.fov ?? 70, aspectRatio) });

/** 游戏里的机位（眼睛的游戏坐标、yaw、pitch、竖直视角）→ Cam：看点放在视线 看距 格处。取材时 mcai 记下的游戏视角用这个换 */
export const fromGameRig = (g: { 眼: readonly number[]; yaw: number; pitch: number; fov?: number }, o: Origin, aspectRatio: number, lookDist = 10): Cam => {
  const pos = gameToScene(g.眼, o);
  const d = gameFacingToScene(g.yaw, g.pitch);
  return { pos, tgt: [pos[0] + d[0] * lookDist, pos[1] + d[1] * lookDist, pos[2] + d[2] * lookDist], lens: fovToLens(g.fov ?? 70, aspectRatio) };
};

/** 样条关键点：秒（或帧，单位自定，递增）和那一刻的机位 */
export type SplineKey = readonly [时刻: number, 机位: Cam];
export type RigSplineOptions = {
  /** 两头的速度：带速（默认）= 照相邻一段的平均速度进出，镜头切进来时已经在动；停 = 速度为 0（从静止起、收到静止） */
  头?: '带速' | '停';
  endMode?: '带速' | '停';
};

/**
 * 一串关键机位连成一条速度连续的轨（三次埃尔米特，切线照不等间隔的 Catmull-Rom 取：前后两段平均速度按段长加权）。
 * pos、tgt、log(lens) 各分量各自插；过每个关键点，关键点处不停顿（机位轨 是分段插，每个关键点速度都断一下）。两头之外停在端点。
 * 关键点排得太密又来回折会过冲，摆的时候让相邻几点大致顺着一个方向。
 */
export const rigSpline = (keyframes: readonly SplineKey[], time: number, options: RigSplineOptions = {}): Cam => {
  const n = keyframes.length;
  if (!n) throw new Error('机位样条至少要一个关键机位');
  if (n === 1 || time <= keyframes[0]![0]) return keyframes[0]![1];
  if (time >= keyframes[n - 1]![0]) return keyframes[n - 1]![1];
  let i = 0;
  while (i + 2 < n && time >= keyframes[i + 1]![0]) i++;
  const camVector = (c: Cam): number[] => [...c.pos, ...c.tgt, Math.log(c.lens), c.roll ?? 0];
  const [t0, t1] = [keyframes[i]![0], keyframes[i + 1]![0]];
  const h = t1 - t0;
  const [p0, p1] = [camVector(keyframes[i]![1]), camVector(keyframes[i + 1]![1])];
  // 关键点 k 处的速度（每单位时刻）
  const speedAt = (k: number): number[] => {
    const current = camVector(keyframes[k]![1]);
    const prev = k > 0 ? camVector(keyframes[k - 1]![1]) : null;
    const nextValue = k < n - 1 ? camVector(keyframes[k + 1]![1]) : null;
    if (!prev) return options.头 === '停' ? current.map(() => 0) : current.map((v, j) => (nextValue![j]! - v) / (keyframes[1]![0] - keyframes[0]![0]));
    if (!nextValue) return options.endMode === '停' ? current.map(() => 0) : current.map((v, j) => (v - prev[j]!) / (keyframes[k]![0] - keyframes[k - 1]![0]));
    const [ha, hb] = [keyframes[k]![0] - keyframes[k - 1]![0], keyframes[k + 1]![0] - keyframes[k]![0]];
    return current.map((v, j) => (((v - prev[j]!) / ha) * hb + ((nextValue[j]! - v) / hb) * ha) / (ha + hb));
  };
  const [m0, m1] = [speedAt(i), speedAt(i + 1)];
  const s = (time - t0) / h;
  const v = p0.map((a, j) => hermite(a, m0[j]! * h, p1[j]!, m1[j]! * h, s));
  const c: Cam = { pos: [v[0]!, v[1]!, v[2]!], tgt: [v[3]!, v[4]!, v[5]!], lens: Math.exp(v[6]!) };
  if (keyframes.some(([, k]) => k.roll !== undefined)) c.roll = v[7]!;
  return c;
};
