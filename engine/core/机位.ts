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
import type { 透视机位参数 } from '../三渲二/机位.tsx';
import { 游戏到场景, 游戏朝向到场景, type 原点 } from './坐标.ts';
import { clamp01, lerp, lerpV, rad } from './数学.ts';

export type Cam = { pos: V3; tgt: V3; lens: number; roll?: number };

/** 横向画幅一半的宽（毫米）：36 mm 全画幅 */
export const 画幅半宽 = 18;

/** 焦距（毫米）→ three 的竖直视角（度） */
export const 焦距到视角 = (lens: number, 宽高比: number) => (2 * Math.atan(画幅半宽 / lens / 宽高比) * 180) / Math.PI;

/** 竖直视角（度）→ 焦距（毫米）。原版游戏的 fov 设置就是竖直视角（默认 70） */
export const 视角到焦距 = (视角: number, 宽高比: number) => 画幅半宽 / 宽高比 / Math.tan(rad(视角) / 2);

/** 视线方向（单位向量，场景坐标） */
export const 视线 = (c: Pick<Cam, 'pos' | 'tgt'>): V3 => {
  const d = [c.tgt[0] - c.pos[0], c.tgt[1] - c.pos[1], c.tgt[2] - c.pos[2]];
  const n = Math.hypot(d[0]!, d[1]!, d[2]!) || 1;
  return [d[0]! / n, d[1]! / n, d[2]! / n];
};

/**
 * 两个单位向量之间球面插值：沿大圆匀角速从 a 转到 b，k 不夹。和 6-3-8 的 slerpDir（three 的 Quaternion.setFromUnitVectors + slerp）
 * 末位舍入以内一样；正好反向时同 three 取一根和 a 垂直的轴转（|ax| > |az| 取 (−ay, ax, 0)，否则 (0, −az, ay)）。
 */
export const 球面插方向 = (a: readonly number[], b: readonly number[], k: number): V3 => {
  const [ax, ay, az] = [a[0]!, a[1]!, a[2]!];
  const [bx, by, bz] = [b[0]!, b[1]!, b[2]!];
  const 余 = ax * bx + ay * by + az * bz;
  if (余 + 1 < Number.EPSILON) {
    const [nx, ny, nz] = Math.abs(ax) > Math.abs(az) ? [-ay, ax, 0] : [0, -az, ay];
    const n长 = Math.hypot(nx, ny, nz);
    const [ux, uy, uz] = [nx / n长, ny / n长, nz / n长];
    // 绕和 a 垂直的单位轴 u 转 kπ：a·cos + (u × a)·sin
    const [c, s] = [Math.cos(k * Math.PI), Math.sin(k * Math.PI)];
    return [ax * c + (uy * az - uz * ay) * s, ay * c + (uz * ax - ux * az) * s, az * c + (ux * ay - uy * ax) * s];
  }
  const 正 = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
  const 角 = Math.atan2(正, 余);
  if (正 < 1e-9) {
    // 几乎同向：线性插再归一
    const v = [ax + (bx - ax) * k, ay + (by - ay) * k, az + (bz - az) * k];
    const 长 = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
    return [v[0]! / 长, v[1]! / 长, v[2]! / 长];
  }
  const [wa, wb] = [Math.sin((1 - k) * 角) / 正, Math.sin(k * 角) / 正];
  return [ax * wa + bx * wb, ay * wa + by * wb, az * wa + bz * wb];
};

export type 插机位选项 = {
  /** 线性（默认）：pos、tgt 各自线性插；球面：pos 线性插，视线方向球面插，看点距离线性插 */
  转向?: '线性' | '球面';
  /** 线性（默认）；对数：在 log(lens) 上线性插，推拉镜头时画面放大的速度均匀 */
  焦距?: '线性' | '对数';
};

/**
 * 两个机位之间插值，k 不夹。roll 两头都没给就不带；给了一头，另一头当 0。
 * 副本差别：7-起疑、7-4-3 的 lerpCam 直接拿 a.roll（两头 roll 一样时和这里相同），7-又一只、6-4-3 的不带 roll；
 * 6-3-8 的 camLerp 是「球面 + 对数」，看点固定放在视线 100 格处（只影响 tgt 的数值，lookAt 出来的朝向一样）；
 * 把回忆 2-新世界 的 插机位 插的是 { 眼, 看, 视角 }，等于这里的线性插（视角线性）。
 */
export const 插机位 = (a: Cam, b: Cam, k: number, 选项: 插机位选项 = {}): Cam => {
  const pos = lerpV(a.pos, b.pos, k) as V3;
  let tgt: V3;
  if (选项.转向 === '球面') {
    const 距 = lerp(Math.hypot(...a.tgt.map((v, i) => v - a.pos[i]!)), Math.hypot(...b.tgt.map((v, i) => v - b.pos[i]!)), k);
    const d = 球面插方向(视线(a), 视线(b), k);
    tgt = [pos[0] + d[0] * 距, pos[1] + d[1] * 距, pos[2] + d[2] * 距];
  } else tgt = lerpV(a.tgt, b.tgt, k) as V3;
  const lens = 选项.焦距 === '对数' ? Math.exp(lerp(Math.log(a.lens), Math.log(b.lens), k)) : lerp(a.lens, b.lens, k);
  const c: Cam = { pos, tgt, lens };
  if (a.roll !== undefined || b.roll !== undefined) c.roll = lerp(a.roll ?? 0, b.roll ?? 0, k);
  return c;
};

/** 一串关键机位按帧插值：帧在两个关键机位之间时，进度先过 缓动（默认不缓，线性）再插；两头之外停在端点 */
export const 机位轨 = (关键: readonly (readonly [帧: number, 机位: Cam])[], 帧: number, 缓动: (t: number) => number = (t) => t, 选项?: 插机位选项): Cam => {
  if (!关键.length) throw new Error('机位轨至少要一个关键机位');
  if (帧 <= 关键[0]![0]) return 关键[0]![1];
  for (let i = 0; i < 关键.length - 1; i++) {
    const [f0, a] = 关键[i]!;
    const [f1, b] = 关键[i + 1]!;
    if (帧 < f1) return 插机位(a, b, 缓动(clamp01((帧 - f0) / (f1 - f0))), 选项);
  }
  return 关键[关键.length - 1]![1];
};

/** 近、远裁剪面（格）。three换算.ts 的 摆相机 默认 0.05、900（古城画面的 Rig） */
export type 摆相机选项 = { 近?: number; 远?: number };

/** Cam → 三渲二的透视机位参数（竖直视角按宽高比换；roll 那边没有，给了非 0 的 roll 就报错） */
export const 转透视参数 = (c: Cam, 宽高比: number, 选项: 摆相机选项 = {}): 透视机位参数 => {
  if (c.roll && c.roll % 360 !== 0) throw new Error(`三渲二的透视机位不支持 roll：${c.roll}`);
  return { 种: '透视', 眼: c.pos, 看: c.tgt, 视角: 焦距到视角(c.lens, 宽高比), 近: 选项.近, 远: 选项.远 };
};

/** 三渲二的透视机位参数 → Cam（视角不给按原版默认 70） */
export const 从透视参数 = (p: Pick<透视机位参数, '眼' | '看' | '视角'>, 宽高比: number): Cam => ({ pos: p.眼, tgt: p.看, lens: 视角到焦距(p.视角 ?? 70, 宽高比) });

/** 游戏里的机位（眼睛的游戏坐标、yaw、pitch、竖直视角）→ Cam：看点放在视线 看距 格处。取材时 mcai 记下的游戏视角用这个换 */
export const 从游戏机位 = (g: { 眼: readonly number[]; yaw: number; pitch: number; 视角?: number }, o: 原点, 宽高比: number, 看距 = 10): Cam => {
  const pos = 游戏到场景(g.眼, o);
  const d = 游戏朝向到场景(g.yaw, g.pitch);
  return { pos, tgt: [pos[0] + d[0] * 看距, pos[1] + d[1] * 看距, pos[2] + d[2] * 看距], lens: 视角到焦距(g.视角 ?? 70, 宽高比) };
};
