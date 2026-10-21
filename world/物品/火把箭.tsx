// 夸克（Quark-4.0-462）的火把箭（torch_arrow）：飞行中的火把、落地变成的火把、两种火把冒的粒子（物品贴图 npm run 取材 -- 杂项物品，火把模型 npm run 取材 -- 火把）。
// 改编（用户 10-15 定）：飞行中、钉在生物身上都画一支原版火把（minecraft:block/torch），火头朝前，不画 Quark `TorchArrowRenderer` 的箭。
// 出处（game/缓存/mods/Quark-4.0-462.jar 反汇编，`TorchArrow`）：
// - 飞行中冒火（`TorchArrow.tick`，没插地、出生超过 2 刻）：每刻 6 个 flame，第 i 个在上一刻到这一刻路径的 i/6 处 + (随机−0.5)×0.1，速度 = (随机−0.5)×0.03 − 箭速×0.08（往后甩）。
// - 打中方块（`onHitBlock`）：命中面不是底面、外面那格是空气或可替换（草、雪层），就在那格放一个**原版火把方块**（顶面 → torch 立着；侧面 → wall_torch，朝向 = 命中面），箭消失。
//   打中生物：点燃 1 秒，伤害照原版箭。
// - 物品：quark:item/torch_arrow（item/generated，16×16）。
// - 火把方块（原版 `TorchBlock` / `WallTorchBlock`）：模型 minecraft:block/torch，亮度 14；`animateTick` 在 (方块中心, 高 0.7)（墙上火把再往墙那边挪 0.27、高 0.92）各放 1 个 smoke 和 1 个 flame，速度 0。
//   `animateTick` 不是每刻都调：`ClientLevel.animateTick` 每刻在玩家周围随机抽方块（半径 16 抽 667 次、半径 32 抽 667 次），所以每刻冒烟概率取决于离玩家多远，见 `torchTickChance`()（脚下附近约 0.18，离 8 格约 0.05）。
// 坐标：场景坐标（Z 朝上），单位格；时间：刻。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { rng, type V3 } from '../../engine/model/parts.tsx';
import { BlockModel, type BlockModelData } from '../../engine/model/方块模型.tsx';
import { DISPLAY, ItemDisplay, ItemSprite } from '../../engine/model/物品贴图.tsx';
import { png } from '../../engine/model/贴图.ts';
import type { ParticleSpawn } from '../特效/原版粒子.tsx';
import itemPng from 'asset:贴图/物品/杂项物品/火把箭';
import torchRaw from 'asset:模型/物品/火把';
import torchAtlas from 'asset:贴图/物品/火把';

const TORCH = torchRaw as unknown as BlockModelData;

// ---- 飞行 / 钉着的火把 ----
// 火把模型（方块中心为原点）杆子沿 +Z，从 -0.5 到火头顶 0.125；转到 +Z 朝飞行方向，火头顶对齐箭实体的箭尖（前方 0.225 格，照 物品/箭.tsx）
const TORCH_TOP = 0.125;
const ARROW_TIP = 0.225;
// p：箭实体位置，dir：飞行方向（火头朝这边）
export const TorchArrow: React.FC<{ p: V3; dir: V3 }> = ({ p: position, dir }) => {
  const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...dir).normalize()), [dir[0], dir[1], dir[2]]);
  return (
    <group position={position} quaternion={quat}>
      <group position={[0, 0, ARROW_TIP - TORCH_TOP]}>
        <BlockModel data={TORCH} atlas={png(torchAtlas)} part="火把" />
      </group>
    </group>
  );
};

// 飞行中冒的火：路径(刻) 给第 k 刻末的箭位置（场景），t0、t1 刻（t0 = 射出那一刻；出生 2 刻以后才冒）
export const torchArrowFlames = (pathAt: (tick: number) => V3, t0: number, t1: number, seed: number): ParticleSpawn[] => {
  const rand = rng(seed * 4099 + 7);
  const out: ParticleSpawn[] = [];
  for (let k = Math.ceil(t0) + 3; k <= t1; k++) {
    const prevPos = pathAt(k - 1);
    const currPos = pathAt(k);
    const delta: V3 = [currPos[0] - prevPos[0], currPos[1] - prevPos[1], currPos[2] - prevPos[2]];
    for (let i = 0; i < 6; i++) {
      const pos: V3 = [currPos[0] - (delta[0] * i) / 6 + (rand() - 0.5) * 0.1, currPos[1] - (delta[1] * i) / 6 + (rand() - 0.5) * 0.1, currPos[2] - (delta[2] * i) / 6 + (rand() - 0.5) * 0.1];
      const vel: V3 = [(rand() - 0.5) * 0.03 - delta[0] * 0.08, (rand() - 0.5) * 0.03 - delta[1] * 0.08, (rand() - 0.5) * 0.03 - delta[2] * 0.08];
      out.push({ 种: 'flame', 刻: k, p: pos, v: vel, 种子: seed * 7 + k * 6 + i });
    }
  }
  return out;
};

// ---- 火把方块 ----
// cell：火把所在那一格的最小角（整数格，场景坐标；即打中的那一格外面那格）；墙上：命中面朝哪（场景方向，水平单位向量），不给 = 立着
// 光：给了就在火焰处放一盏点光（亮度 14 的方块光照，半径约 14 格；原版是方块光照图，不是实时光，这里近似）
export const TorchBlock: React.FC<{ cell: V3; 墙上?: V3; 光?: number }> = ({ cell, 墙上: wallFacing, 光: light }) => {
  const atlas = png(torchAtlas);
  // 墙上火把的模型是 facing=north（贴在南边的墙上、朝北）：游戏北 = 场景 +Y，绕 Z 转到 墙上 方向
  const yaw = wallFacing ? Math.atan2(-wallFacing[0], wallFacing[1]) : 0;
  const flamePos = torchFlamePos(cell, wallFacing);
  return (
    <group>
      <group position={[cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5]} rotation={[0, 0, yaw]}>
        <BlockModel data={TORCH} atlas={atlas} part={wallFacing ? '墙上火把' : '火把'} />
      </group>
      {light ? <pointLight position={flamePos} color="#ffd9a0" intensity={light} distance={14.5} decay={1} /> : null}
    </group>
  );
};

// 火焰（冒烟和火的那一点）：TorchBlock.animateTick (0.5, 0.7, 0.5)；WallTorchBlock 再往 facing.getOpposite()（朝墙）挪 0.27、高 0.92（0.7 + 0.22）
export const torchFlamePos = (cell: V3, wallFacing?: V3): V3 =>
  wallFacing
    ? [cell[0] + 0.5 - wallFacing[0] * 0.27, cell[1] + 0.5 - wallFacing[1] * 0.27, cell[2] + 0.92]
    : [cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.7];

// 一个火把每刻被 animateTick 抽到的概率（d = 火把相对玩家的格子偏移，场景坐标）
export const torchTickChance = (offset: V3) => {
  const pickChance = (R: number) => offset.reduce((s, x) => s * Math.max(0, R - Math.abs(Math.round(x))) / (R * R), 1);
  return 667 * pickChance(16) + 667 * pickChance(32);
};

// 火把冒的烟和火：t0～t1 刻，每刻按 概率 抽一次
export const torchParticles = (flamePos: V3, chance: number, t0: number, t1: number, seed: number): ParticleSpawn[] => {
  const rand = rng(seed * 5153 + 9);
  const out: ParticleSpawn[] = [];
  for (let k = Math.ceil(t0); k <= t1; k++) {
    if (rand() >= chance) continue;
    out.push({ 种: 'smoke', 刻: k, p: flamePos, 种子: seed * 17 + k * 2 });
    out.push({ 种: 'flame', 刻: k, p: flamePos, 种子: seed * 17 + k * 2 + 1 });
  }
  return out;
};

// 物品（拿在手上、地上的掉落物用）：item/generated，物品空间（贴图正面 +Z、中心在原点、1 = 1 格）
export const TorchArrowItem: React.FC<{ display?: 'ground' | 'thirdperson_righthand' }> = ({ display }) => {
  const sprite = <ItemSprite layers={[{ tex: png(itemPng) }]} />;
  return display ? <ItemDisplay t={DISPLAY.generated[display]}>{sprite}</ItemDisplay> : sprite;
};
