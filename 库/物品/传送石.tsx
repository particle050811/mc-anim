// Waystones 的传送石（waystones:warp_stone，「传送石」）：物品模型、使用时手边和身边的粒子、传送的粒子和声音（npm run 取材 -- 杂项物品）。
// jar：game/缓存/waystones/waystones-forge-1.20.1-14.1.21.jar（Modrinth 下的 1.20.1 Forge 版；All Rights Reserved，只解包读资源和字节码，不装进游戏）。出处：WarpStoneItem、PlayerWaystoneManager.doTeleport、TeleportEffectMessage（javap）。
// - 物品：models/item/warp_stone.json，parent item/handheld，layer0 = waystones:item/warp_stone（16×16 的紫色宝石）。拿在手上用 handheld 的第三人称变换。
//   isFoil：玩家能用（冷却好了）时为真——平时带附魔光效。
//   手上的大小不照 handheld 的 0.85，缩到 generated 的 0.55（和古卷一样大；用户 10-18：传送石拿在手里太大），握的角度、位置照旧。
// - 使用（WarpStoneItem）：按住右键，UseAnim.BOW（拉弓的举手姿势），用时 warpStoneUseTime 默认 32 刻（1.6 秒）；开始时放 block.portal.trigger（音量 0.1、音高 2）。
//   onUseTick（客户端）每 5 刻放一批粒子，n = max(4, 进度×48)，进度 = 已用刻/32：
//     · 手边 min(4, n) 个 reverse_portal：位置 = 脚底 + 手偏移 + (±0.25, 0～1, ±0.25)，速度 (0, 0.05, 0)；
//       手偏移 = (∓0.3, 1, 0.52)（主手是右手时 −0.3）先 yRot(−朝向)、再 zRot(俯仰)（照字节码，Vec3.zRot 用的是俯仰角）；
//     · 进度 ≥ 0.25：n 个 crimson_spore，脚底 + (±0.75, 0～1, ±0.75)，速度 (0, 随机×0.5, 0)（这种粒子的构造会自己加随机速度）；
//     · 进度 ≥ 0.5：n 个 reverse_portal，同一范围，速度 (0, 随机, 0)；
//     · 进度 ≥ 0.75：n/3 个 witch，脚底 + (±0.75, 0.5～1.5, ±0.75)，速度 (0, 随机, 0)；
//   最后一刻（剩 1 刻）再放 n 个 reverse_portal，脚底 + (±0.75, 1～2, ±0.75)，速度 (0, 随机, 0)。
//   用完（finishUsingItem）打开选传送点的界面（这里不画），选了才传送。
// - 传送（doTeleport）：起点和终点各放 block.portal.travel（音量 0.1、音高 1）；起点和终点各发一次 TeleportEffectMessage：
//   在**方块坐标**（脚底所在那一格的最小角，不是人的正中）放 128 个 portal：位置 = 角 + (±1.5, 0～3, ±1.5)，速度 = (±1, −随机, ±1)。
//   人是瞬间移走的，没有渐隐。
// 坐标：场景坐标（Z 朝上），单位格；时间：刻（1 秒 20 刻）。
import React from 'react';
import { rng, type V3 } from '../../engine/model/parts.tsx';
import { DISPLAY } from '../../engine/model/物品贴图.tsx';
import { png } from '../../engine/model/贴图.ts';
import type { ParticleSpawn } from '../特效/原版粒子.tsx';
import { GlintItem, HeldItem } from './附魔物品.tsx';
import warpStonePng from 'asset:贴图/物品/杂项物品/传送石';

export const WARP = { holdTicks: 32, 传送粒子: 128 };
// UseAnim.BOW 时原版 HumanoidModel 的手臂（BOW_AND_ARROW，右手用）：两臂 xRot = −90° + 头仰，右 yRot = −0.1 + 头偏（弧度）、左 yRot = 0.1 + 头偏 + 0.4
export const BOW_ARMS = { xRot: -90, rightYRot: (-0.1 * 180) / Math.PI, leftYRot: (0.5 * 180) / Math.PI };

export const WarpStone: React.FC<{ sec: number; charged?: boolean }> = ({ sec: sec, charged = true }) => <GlintItem layers={[{ tex: png(warpStonePng) }]} sec={sec} glint={charged} />;
const heldTransform = { ...DISPLAY.handheld.thirdperson_righthand, scale: [0.55, 0.55, 0.55] as [number, number, number] };
export const HeldWarpStone: React.FC<{ sec: number; left?: boolean; charged?: boolean }> = ({ sec: sec, left = false, charged }) => (
  <HeldItem t={heldTransform} left={left}>
    <WarpStone sec={sec} charged={charged} />
  </HeldItem>
);

// 场景方向 → 原版朝向（度）
const facingAngles = (dir: V3) => {
  const [gx, gy, gz] = [dir[0], dir[2], -dir[1]];
  return { yaw: (Math.atan2(-gx, gz) * 180) / Math.PI, pitch: (-Math.atan2(gy, Math.hypot(gx, gz)) * 180) / Math.PI };
};
const g2s = (g: V3): V3 => [g[0], -g[2], g[1]];

// 按住使用时的粒子：脚底(刻) 给人的脚底（场景），视线 = 看的方向；t0 = 开始使用的那一刻；主手右手（默认）
export const warpStoneUseParticles = (feetAt: (tick: number) => V3, lookDir: V3, t0: number, seed: number, durationTicks = WARP.holdTicks): ParticleSpawn[] => {
  const rand = rng(seed * 3571 + 13);
  const out: ParticleSpawn[] = [];
  const { yaw, pitch } = facingAngles(lookDir);
  const DEG = Math.PI / 180;
  // 手偏移（游戏坐标）：Vec3(-0.3, 1, 0.52).yRot(-yaw).zRot(pitch)
  let [hx, hy, hz] = [-0.3, 1, 0.52];
  const yawRad = -yaw * DEG;
  [hx, hz] = [hx * Math.cos(yawRad) + hz * Math.sin(yawRad), hz * Math.cos(yawRad) - hx * Math.sin(yawRad)];
  const pitchRad = pitch * DEG;
  [hx, hy] = [hx * Math.cos(pitchRad) + hy * Math.sin(pitchRad), hy * Math.cos(pitchRad) - hx * Math.sin(pitchRad)];
  let id = 0;
  const add = (kind: ParticleSpawn['种'], tick: number, gp: V3, gv: V3) => {
    const feetPos = feetAt(tick);
    const offset = g2s(gp);
    out.push({ 种: kind, 刻: tick, p: [feetPos[0] + offset[0], feetPos[1] + offset[1], feetPos[2] + offset[2]], v: g2s(gv), 种子: seed * 1009 + id++ });
  };
  for (let used = 1; used <= durationTicks; used++) {
    const remaining = durationTicks - used + 1; // onUseTick 的 count（剩余刻）
    const k = t0 + used;
    const prog = (durationTicks - remaining) / durationTicks;
    const count = Math.max(4, Math.floor(prog * 48));
    if (remaining % 5 === 0) {
      for (let i = 0; i < Math.min(4, count); i++) add('reverse_portal', k, [hx + (rand() - 0.5) * 0.5, hy + rand(), hz + (rand() - 0.5) * 0.5], [0, 0.05, 0]);
      if (prog >= 0.25) for (let i = 0; i < count; i++) add('crimson_spore', k, [(rand() - 0.5) * 1.5, rand(), (rand() - 0.5) * 1.5], [0, rand() * 0.5, 0]);
      if (prog >= 0.5) for (let i = 0; i < count; i++) add('reverse_portal', k, [(rand() - 0.5) * 1.5, rand(), (rand() - 0.5) * 1.5], [0, rand(), 0]);
      if (prog >= 0.75) for (let i = 0; i < Math.floor(count / 3); i++) add('witch', k, [(rand() - 0.5) * 1.5, 0.5 + rand(), (rand() - 0.5) * 1.5], [0, rand(), 0]);
    }
    if (remaining === 1) for (let i = 0; i < count; i++) add('reverse_portal', k, [(rand() - 0.5) * 1.5, rand() + 1, (rand() - 0.5) * 1.5], [0, rand(), 0]);
  }
  return out;
};

// 传送那一刻的 128 个 portal：脚底（场景）→ 所在方块的最小角（游戏的 BlockPos）
export const teleportParticles = (feet: V3, tick: number, seed: number): ParticleSpawn[] => {
  const rand = rng(seed * 2851 + 3);
  const blockCorner: V3 = [Math.floor(feet[0]), Math.floor(feet[2]), Math.floor(-feet[1])];
  return Array.from({ length: WARP.传送粒子 }, (_, i) => {
    const gp: V3 = [blockCorner[0] + (rand() - 0.5) * 3, blockCorner[1] + rand() * 3, blockCorner[2] + (rand() - 0.5) * 3];
    const gv: V3 = [(rand() - 0.5) * 2, -rand(), (rand() - 0.5) * 2];
    return { 种: 'portal' as const, 刻: tick, p: g2s(gp), v: g2s(gv), 种子: seed * 7001 + i };
  });
};
