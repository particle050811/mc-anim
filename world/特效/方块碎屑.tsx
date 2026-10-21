// 方块碎屑：监守者从地里钻出来（和钻回去）时脚下冒的原版方块粒子，照 1.20.1：
// - `Warden.tick`（客户端）：姿态 EMERGING / DIGGING 且动画累计 < 4.5 秒时，每刻放 30 个 BLOCK 粒子，
//   位置 = 脚底 + (U(-0.7,0.7), 0, U(-0.7,0.7))，方块是脚下那格（古城里是幽匿块）。
// - `TerrainParticle`：重力 1.0；颜色 0.6；半边长 0.05~0.1 格；贴图取方块粒子贴图里随机 1/4 见方的小块（左右倒过来：U0 = (uo+1)/4、U1 = uo/4）；
//   寿命 4~40 刻；初速度是 `Particle` 构造函数的随机速度（每分量 ±0.4 归一化到 0.06~0.18 格/刻，竖直再 +0.1）；摩擦 0.98；
//   落地那刻水平速度 ×0.7，下一刻被地面挡住就停住，趴到寿命结束。
// 和游戏不同：地面当作 z = `center[2]` 的水平面；幽匿块贴图是 4 帧动画，这里只用第一帧；
// 每刻个数可用 `perTick` 减（游戏 4.5 秒共 2700 个，近景糊成一片），单个粒子不改。不受光，见 粒子面片.tsx。
import React, { useMemo } from 'react';
import { rng, V3 } from '../../engine/model/parts.tsx';
import { Png, png } from '../../engine/model/贴图.ts';
import sculkPng from 'asset:贴图/特效/方块碎屑';
import { interpPathPos, Particle, particleInitVel, particlePath, particleTexture, ParticleQuads } from './粒子面片.tsx';

export const SCULK_TEX: Png = png(sculkPng);

export const crumbParams = {
  perTick: 30,
  durationSec: 4.5,
  spread: 0.7,
  shade: 0.6,
};

// 方块贴图（可能是竖条动画）只取第一帧
const firstFrame = (t: Png) => {
  if (t.h <= t.w) return { px: t.px, w: t.w, h: t.h };
  return { px: t.px.subarray(0, t.w * t.w * 4), w: t.w, h: t.w };
};

type Crumb = { born: number; life: number; half: number; path: V3[]; uo: number; vo: number };

// `center`：监守者脚底（地面高度）；`sec`：开始钻出以后的秒数（<0 不画）；`tex`：方块贴图（默认幽匿块）；
// `seed`：随机种子；`perTick`：每刻放几个（默认 30）；`durationSec`：放粒子的时长（钻回地里也是同一段代码）
export const BlockCrumbs: React.FC<{ center: V3; sec: number; tex?: Png; seed?: number; perTick?: number; durationSec?: number }> = ({
  center,
  sec,
  tex = SCULK_TEX,
  seed = 1,
  perTick = crumbParams.perTick,
  durationSec = crumbParams.durationSec,
}) => {
  const frame = useMemo(() => firstFrame(tex), [tex]);
  const map = particleTexture(frame.px, frame.w, frame.h, tex);
  const crumbs = useMemo(() => {
    const rand = rng(seed * 7717 + 3);
    const out: Crumb[] = [];
    const ticks = Math.ceil(durationSec * 20);
    for (let k = 0; k < ticks; k++) {
      for (let j = 0; j < perTick; j++) {
        const spawnPos: V3 = [center[0] + (rand() * 1.4 - 0.7), center[1] + (rand() * 1.4 - 0.7), center[2]];
        // 游戏坐标（y 朝上）的速度 → 场景坐标（z 朝上）
        const [gx, gy, gz] = particleInitVel(rand, 0, 0, 0);
        const life = Math.floor(4 / (rand() * 0.9 + 0.1));
        const half = (0.1 * (rand() * 0.5 + 0.5) * 2) / 2;
        const path = particlePath(spawnPos, [gx, -gz, gy], life + 1, { gravity: 1, friction: 0.98, ground: center[2] });
        out.push({ born: k, life, half, path, uo: rand() * 3, vo: rand() * 3 });
      }
    }
    return out;
  }, [center[0], center[1], center[2], seed, perTick, durationSec]);
  if (sec < 0) return null;
  const t = sec * 20;
  const items: Particle[] = [];
  const shade = crumbParams.shade;
  for (const crumb of crumbs) {
    const tau = t - crumb.born;
    // 生成后下一刻开始动；age 到 lifetime 的那一刻被移除，所以能看到 lifetime+1 刻
    if (tau < 0 || tau >= crumb.life + 1) continue;
    items.push({
      p: interpPathPos(crumb.path, tau),
      half: crumb.half,
      // [左 U0, 上 V0, 右 U1, 下 V1]：游戏里 U0 = (uo+1)/4，U1 = uo/4（左右倒过来）
      uv: [(crumb.uo + 1) / 4, crumb.vo / 4, crumb.uo / 4, (crumb.vo + 1) / 4],
      color: [shade, shade, shade],
    });
  }
  return <ParticleQuads tex={map} items={items} />;
};
