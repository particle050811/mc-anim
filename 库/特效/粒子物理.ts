// 原版粒子的物理和插值（纯模块，不引 react、three）：构造函数的随机速度、Particle.tick 逐刻走、两刻之间插值，和画面平行方片的数据形状。
// 画的部分（实例化方片、贴图）在 粒子面片.tsx，那里原样转出这里的名字，老代码照旧从那里引。
import type { V3 } from '../../engine/core/坐标.ts';

export type Particle = {
  p: V3; // 方片中心（场景坐标）
  half: number; // 半边长（游戏的 quadSize）
  uv: [number, number, number, number]; // [U0, V0, U1, V1]：画面左、上、右、下对应的贴图坐标（0~1，V 从贴图第一行算起）
  color: [number, number, number]; // 粒子颜色（游戏里的 rCol gCol bCol，sRGB 数值 0~1）
  alpha?: number;
};

/**
 * particlePath 的 opt 用这个造，同一页面里有好几处调用、gravity 有整数有小数时尤其要用。
 * 坑：渲染用的 chrome-headless-shell 开着 V8 的 DCHECK，字面量 { gravity: 1, … } 和 { gravity: 0.5, … } 共用隐藏类，整数换成小数时隐藏类被作废，
 * 字面量的样板对象跟着迁移会撞上检查，页面进程直接崩（亚波伦不放水 第 4 幕：方块屑和暴击星同在一帧）。类构造没有样板对象。
 */
export class ParticlePhysics {
  readonly gravity: number;
  readonly friction: number;
  readonly ground: number | undefined;
  constructor(gravity: number, friction: number, ground?: number) {
    this.gravity = gravity;
    this.friction = friction;
    this.ground = ground;
  }
}

// 粒子的物理（Particle.tick，1.20.1）：每刻先 yd -= 0.04×重力，再移动，再三个分量都 ×摩擦；
// `hasPhysics` 时碰到方块：竖直方向被挡住、这一刻几乎没动（< 1e-5）就整个停住，之后不再动；落地那一刻水平速度再 ×0.7。
// 只处理一个水平地面（z = ground），不处理墙。
// 返回每刻结束时的位置（第 0 项是出生位置），长度 ticks + 1。坐标：场景（z 朝上）。
export const particlePath = (p0: V3, v0: V3, ticks: number, opt: { gravity: number; friction: number; ground?: number }): V3[] => {
  const out: V3[] = [[...p0] as V3];
  let [x, y, z] = p0;
  let [vx, vy, vz] = v0;
  let stopped = false;
  for (let k = 0; k < ticks; k++) {
    if (!stopped) {
      vz -= 0.04 * opt.gravity;
      let dz = vz;
      const want = vz;
      if (opt.ground !== undefined && z + dz < opt.ground) dz = opt.ground - z;
      x += vx;
      y += vy;
      z += dz;
      if (Math.abs(want) >= 1e-5 && Math.abs(dz) < 1e-5) stopped = true;
      const onGround = want !== dz && want < 0;
      vx *= opt.friction;
      vy *= opt.friction;
      vz *= opt.friction;
      if (onGround) {
        vx *= 0.7;
        vy *= 0.7;
      }
    }
    out.push([x, y, z]);
  }
  return out;
};

// 游戏在两刻之间按 partialTicks 插值 xo → x，所以画出来的位置比物理晚一刻
export const interpPathPos = (path: V3[], tau: number): V3 => {
  const k = Math.floor(tau);
  const frac = tau - k;
  const prevPos = path[Math.max(0, Math.min(path.length - 1, k - 1))]!;
  const curPos = path[Math.max(0, Math.min(path.length - 1, k))]!;
  return [prevPos[0] + (curPos[0] - prevPos[0]) * frac, prevPos[1] + (curPos[1] - prevPos[1]) * frac, prevPos[2] + (curPos[2] - prevPos[2]) * frac];
};

// Particle 构造函数里的随机速度（1.20.1）：每个分量先加 (random×2-1)×0.4，再归一化到 (random+random+1)×0.15×0.4，竖直再加 0.1。
// 输入输出都是游戏坐标（y 朝上）
export const particleInitVel = (rand: () => number, xd: number, yd: number, zd: number): [number, number, number] => {
  let x = xd + (rand() * 2 - 1) * 0.4;
  let y = yd + (rand() * 2 - 1) * 0.4;
  let z = zd + (rand() * 2 - 1) * 0.4;
  const speed = (rand() + rand() + 1) * 0.15;
  const len = Math.hypot(x, y, z) || 1;
  x = (x / len) * speed * 0.4;
  y = (y / len) * speed * 0.4 + 0.1;
  z = (z / len) * speed * 0.4;
  return [x, y, z];
};
