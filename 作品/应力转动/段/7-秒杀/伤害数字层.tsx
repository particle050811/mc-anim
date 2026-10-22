// 7-1-3 监守者拍死五只恼鬼的伤害数字层（同 7-1-5：透明底、和 7-1-3-秒杀 同宽高同帧数同机位，只画数字，由 合成第六章.py 叠上去）。
// 画法、动画、字号照抄汇流来世，见 模型/界面/伤害数字.tsx；这里只定伤害、时机和位置。
// 伤害 450 上下 10%、金色普通字：监守者攻击是原版困难的 10 倍（用户 10-19 定；血量五万是原文 7.md 第 46 行，和攻击不挂钩）。
//   原版（client-1.20.1 字节码核过）：Warden.createAttributes 攻击 30；拍人走 Mob.doHurtTarget，伤害类型 mob_attack（scaling = when_caused_by_living_non_player），
//   难度倍率在 Player.hurt 里乘（困难 × 3/2 = 45）。打恼鬼这种非玩家走 LivingEntity.hurt、不乘，严格照源码是 30 × 10 = 300；用户定一律按困难 45 × 10 = 450 算。
//   汇流来世出的是扣血之前的伤害、不按剩余血量截断，所以恼鬼（14 血）一下就死、数字照样是四百五上下。监守者拍不算暴击。
// 位置：照原版生成在恼鬼碰撞箱顶（脚底 + 0.8）、之后定在世界里不动（恼鬼被拍飞，数字留在挨拍的地方）。
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { DamageNumberLayer, damageNumberAnchor, makePerspectiveCamera, type DamageNumberItem } from '@库/界面/伤害数字.tsx';
import * as play from '../../地点/古城4x/7-1/戏.ts';
import * as choreo from './编排.ts';

const swipeDamages = [437.1, 478.1, 427.3, 461.3, 445.2];
const vexHitboxHeight = 0.8;
// 场景坐标 (x, y, z) Z 朝上 → three.js (x, z, -y)，同 6-4-1/古城画面.tsx
const toThree = ([x, y, z]: number[]) => new THREE.Vector3(x, z, -y);
// 按拍的先后排：第 k 拍打死的是哪一只、死在哪
const hits = play.swingTs.map((s, k) => {
  const deathT = s + 0.1;
  const i = play.vexDeathTs.findIndex((d) => Math.abs(d - deathT) < 1e-6);
  return { T: deathT, damage: swipeDamages[k], anchor: damageNumberAnchor(toThree(play.vexState(i, deathT).p), vexHitboxHeight, 7131 + k) };
});

export const VexSwipeDamageLayer: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = choreo.t于(frame);
  const cam = choreo.camera(frame);
  const camera = makePerspectiveCamera(cam.lens, toThree(cam.pos), toThree(cam.tgt), width, height);
  const numbers: DamageNumberItem[] = hits.map((h) => ({ damage: h.damage, crit: false, anchor: h.anchor, ticks: (t - h.T) * 20 }));
  return <DamageNumberLayer camera={camera} width={width} height={height} numbers={numbers} />;
};
