// 7-1-7 黄叛两支风矢钉上监守者的伤害数字层（同 7-1-5：透明底、和 7-1-7-骏马 同宽高同帧数同机位，只画数字，由 合成第六章.py 叠上去）。
// 画法、动画、字号照抄汇流来世，见 模型/界面/伤害数字.tsx；这里只定伤害、时机和位置。
// 伤害取 ../7-1/戏/伤害.ts 的 `wardenHits`：黄叛每一箭都开鼓风机（用户 10-19 定），这两支也是风矢，1503.6、1461.2，满弦暴击深红字（同 7-1-5）。
// 血账（用户 10-19 定）：50000 − 1527（7-1-5）− 1503.6 − 1461.2（本段）= 45508.2；再减 7-3 的三炮一箭就是 7-4-1 开头剩的血（../7-4-1/戏.ts 的 `hpAtStart`）。
// 护盾不是生物，挨拍不出数字。
// 位置：监守者这时站在盾前不动，照原版生成在它碰撞箱顶（2.9）、之后定在世界里不动。
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { DamageNumberLayer, damageNumberAnchor, makePerspectiveCamera, type DamageNumberItem } from '../../../../world/界面/伤害数字.tsx';
import * as play from '../../../../world/地点/古城4x/7-1/戏.ts';
import * as choreo from './编排.ts';

const wardenHitboxHeight = 2.9;
// 场景坐标 (x, y, z) Z 朝上 → three.js (x, z, -y)，同 6-4-1/古城画面.tsx
const toThree = ([x, y, z]: number[]) => new THREE.Vector3(x, z, -y);
const hits = play.huangFollowArrows.map((a, k) => {
  const hit = play.wardenHits.find((h) => h.箭 === a)!;
  return { T: hit.t, damage: hit.damage, crit: hit.crit, anchor: damageNumberAnchor(toThree(play.wardenState(hit.t).p), wardenHitboxHeight, 7171 + k) };
});
export const followArrowHits = hits; // 7-2-1 李樱远望时看到的是同样的数字、同样的位置

export const FollowArrowDamageLayer: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = choreo.t于(frame);
  const cam = choreo.camera(frame);
  const camera = makePerspectiveCamera(cam.lens, toThree(cam.pos), toThree(cam.tgt), width, height);
  const numbers: DamageNumberItem[] = hits.map((h) => ({ damage: h.damage, crit: h.crit, anchor: h.anchor, ticks: (t - h.T) * 20 }));
  return <DamageNumberLayer camera={camera} width={width} height={height} numbers={numbers} />;
};
