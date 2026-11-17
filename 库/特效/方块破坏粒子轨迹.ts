// 方块破坏粒子的生成和逐帧取样（纯模块，不引 react、three）：照 1.20.1 `ParticleEngine.destroy` + `TerrainParticle`，常数和出处见 方块破坏粒子.tsx 文件头。
// 画（带对数深度的实例化方片）在 方块破坏粒子.tsx，那里原样转出这里的名字。
import type { V3 } from '../../engine/core/坐标.ts';
import { mulberry32 } from '../../engine/core/数学.ts';
import { interpPathPos, type Particle, particleInitVel, particlePath } from './粒子物理.ts';

// 一镜到底近景慢放里的粒子时钟倍速（粒子速度按比例放大，撞击比日常挖方块猛得多）：
// - 战利品箱：同 6-1-5 的药水炸开（倍速 55），慢放下一秒上下散干净，把画面让给飞出来的物品；
// - 墙上被矛管扫到的方块：20。镜头比矛尖晚 0.018 秒才到墙上，这时粒子还有一半没散，镜头从粒子中间钻过去，看得出那一管是崩成粒子的
export const closeupBreakClockScale = { chest: 55, wall: 20 };

export type BreakParticle = { path: V3[]; life: number; half: number; uv: [number, number, number, number]; color: [number, number, number] };

// 一个方块（`center`、`size`，单位格，场景坐标 Z 朝上）崩出来的粒子。`uvRect`：方块粒子贴图在图集里的范围 [u0, v0, u1, v1]（V 从第一行算起）；
// `color`：粒子颜色（sRGB 0～1，原版 0.6，再乘染色）；`density`：每轴几份（原版整格 4）；`outwardVel`：按出生位置额外加的速度
export const spawnBlockBreak = (
  center: V3,
  size: V3,
  uvRect: [number, number, number, number],
  color: [number, number, number],
  seed: number,
  density = 4,
  outwardVel?: (p0: V3, rand: () => number) => V3,
): BreakParticle[] => {
  const rand = mulberry32(seed * 4099 + 17);
  const out: BreakParticle[] = [];
  // 每轴份数：原版是 max(2, ceil(边长 / 0.25))；按 `density`/4 缩
  const divisions = size.map((s) => Math.max(2, Math.ceil((Math.min(1, s) / 0.25) * (density / 4))));
  const [u0, v0, u1, v1] = uvRect;
  for (let i = 0; i < divisions[0]; i++)
    for (let j = 0; j < divisions[1]; j++)
      for (let k = 0; k < divisions[2]; k++) {
        const cellFrac = [(i + 0.5) / divisions[0], (j + 0.5) / divisions[1], (k + 0.5) / divisions[2]];
        const p0: V3 = [center[0] + (cellFrac[0] - 0.5) * size[0], center[1] + (cellFrac[1] - 0.5) * size[1], center[2] + (cellFrac[2] - 0.5) * size[2]];
        // 游戏坐标（y 朝上）：x = 场景 x、y = 场景 z、z = -场景 y
        const [gx, gy, gz] = particleInitVel(rand, cellFrac[0] - 0.5, cellFrac[2] - 0.5, -(cellFrac[1] - 0.5));
        const life = Math.floor(4 / (rand() * 0.9 + 0.1));
        const ex = outwardVel ? outwardVel(p0, rand) : [0, 0, 0];
        const half = (0.1 * (rand() * 0.5 + 0.5) * 2) / 2;
        const uo = rand() * 3;
        const vo = rand() * 3;
        const du = (u1 - u0) / 4;
        const dv = (v1 - v0) / 4;
        out.push({
          path: particlePath(p0, [gx + ex[0], -gz + ex[1], gy + ex[2]], life + 1, { gravity: 1, friction: 0.98 }),
          life,
          half,
          // [左 U0, 上 V0, 右 U1, 下 V1]：游戏里 U0 取 (uo+1)/4、U1 取 uo/4（左右倒过来）
          uv: [u0 + du * (uo + 1), v0 + dv * vo, u0 + du * uo, v0 + dv * (vo + 1)],
          color,
        });
      }
  return out;
};

// 崩开以后 `sec`（粒子时钟）时还活着的粒子，追加到 `out`；`scale`：整体缩放（以 `pivot` 为中心，远景放大用）
export const collectBreakParticles = (ps: BreakParticle[], sec: number, out: Particle[], scale = 1, pivot: V3 = [0, 0, 0]) => {
  if (sec < 0) return;
  const t = sec * 20;
  for (const particle of ps) {
    // 生成后下一刻开始动；寿命到了的那一刻被移除，所以看得到 life + 1 刻
    if (t >= particle.life + 1) continue;
    const pos = interpPathPos(particle.path, t);
    out.push({
      p: scale === 1 ? pos : [pivot[0] + (pos[0] - pivot[0]) * scale, pivot[1] + (pos[1] - pivot[1]) * scale, pivot[2] + (pos[2] - pivot[2]) * scale],
      half: particle.half * scale,
      uv: particle.uv,
      color: particle.color,
    });
  }
};
