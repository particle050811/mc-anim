// 7-3 三段的伤害数字层（同 7-1-5：透明底、和本段画面同宽高同帧数同机位，只画数字，由 合成第六章.py 叠上去）。
// 画法、动画、字号照抄汇流来世，见 模型/界面/伤害数字.tsx；这里只定伤害、时机和位置。
// 伤害（用户 10-18 定，数值在 戏.ts）：
//   黄叛的箭是鼓风机加速的风矢（7.md 第 33 行），和 7-1-5 那支同量级，1500 上下 10%，满弦暴击、深红字。第 1 场打在它身上的见 ../7-1/戏/伤害.ts。
//   苦力怕迫击炮是高阶法术，比铁魔法满级原版（10 级 × 0.5 = 10.5）大得多；原文「那点微末的伤害对监守者来说根本不值一提」（7.md 第 56 行），
//   这个世界的监守者一万血以上（8.md 第 54 行），取 300 上下 10%（一发不到它血的 3%），金色普通字。炮正中胸口，不按离炸点远近打折。
//   7-3-3 音波打中刘心忠：监守者攻击是原版困难的 10 倍（用户 10-19 定），150 上下 10%，金色普通字（音爆无视护甲、护盾，不打折）。
//     原版（client-1.20.1 字节码核过）：SonicBoom.tick 打 10 点，伤害类型 sonic_boom 的 scaling = always，刘心忠是玩家、走 Player.hurt，困难 × 3/2 = 15，× 10 = 150。
// 位置：同 7-1-5，跟拍监守者的机位里定在原地的数字会被甩出画面，锚点跟着监守者走。炮的从碰撞箱顶（2.9）起飘；
//   箭和第三炮只隔 0.26 秒，从箭钉处往上 0.2 起飘，不和还在飘的炮数字叠在一起。
//   刘心忠那个照原版生成在他碰撞箱顶（眼睛 + 0.18）、定在世界里不动（他被冲得横滑 2.6 米，数字留在挨打的地方）。
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { DamageNumberLayer, damageNumberAnchor, makePerspectiveCamera, type DamageNumberItem } from '../../../../world/界面/伤害数字.tsx';
import type { Cam } from '../../../../world/地点/古城4x/6-4-1/古城画面.tsx';
import * as play from '../../../../world/地点/古城4x/7-3/戏.ts';
import * as timeline from '../../../../world/地点/古城4x/7-3/时间线.ts';
import * as K731 from '../7-3-1/编排.ts';
import * as K732 from '../7-3-2/编排.ts';
import * as K733 from '../7-3-3/编排.ts';

const { mortarDamages, arrowDamage, sonicBoomDamage } = play;
const hitboxHeight = 2.9;
const hits = [
  ...play.mortars.map((m, i) => ({ T: m.中T, damage: mortarDamages[i], crit: false, height: hitboxHeight, seed: 7331 + i })),
  ...play.huangArrows.map((a, i) => ({ T: a.中, damage: arrowDamage, crit: true, height: a.钉[2] - play.wardenState(a.中).p[2] + 0.2, seed: 7341 + i })),
];
// 场景坐标 (x, y, z) Z 朝上 → three.js (x, z, -y)，同 6-4-1/古城画面.tsx
const toThree = ([x, y, z]: number[]) => new THREE.Vector3(x, z, -y);
const liuEyeAtHit = play.liuEye(timeline.hitT);
const liuHit = { T: timeline.hitT, damage: sonicBoomDamage, anchor: damageNumberAnchor(toThree([liuEyeAtHit[0], liuEyeAtHit[1], liuEyeAtHit[2] - 1.62]), 1.8, 7351) };

const makeLayer = (T于: (frame: number) => number, camera: (frame: number) => Cam): React.FC => () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const T = T于(frame);
  const cam = camera(frame);
  const cam3 = makePerspectiveCamera(cam.lens, toThree(cam.pos), toThree(cam.tgt), width, height);
  const feet = toThree(play.wardenState(T).p);
  const numbers: DamageNumberItem[] = [
    ...hits.map((h) => ({ damage: h.damage, crit: h.crit, anchor: damageNumberAnchor(feet, h.height, h.seed), ticks: (T - h.T) * 20 })),
    { damage: liuHit.damage, crit: false, anchor: liuHit.anchor, ticks: (T - liuHit.T) * 20 },
  ];
  return <DamageNumberLayer camera={cam3} width={width} height={height} numbers={numbers} />;
};
export const DamageLayer731 = makeLayer(K731.T于, K731.camera);
export const DamageLayer732 = makeLayer(K732.T于, K732.camera);
export const DamageLayer733 = makeLayer(K733.T于, K733.camera);
