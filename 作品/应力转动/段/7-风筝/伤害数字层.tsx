// 7-4-1 风筝的伤害数字层（同 7-3：透明底、和本段画面同宽高同帧数同机位，只画数字，由 合成第六章.py 叠上去）。画法见 模型/界面/伤害数字.tsx，伤害、时机在 戏.ts 的 `hits`。
// 伤害（用户 10-18 定，同 7-3）：苦力怕迫击炮 300 上下 10%、金色普通字；风矢 1500 上下 10%、满弦暴击深红字（各一个种子排好，不按远近打折）。
// 血账：进本段时剩的血由 7-1 的血账减 7-3 那几下算出（戏.ts 的 `hpAtStart`），本段每一下都出数字（用户 10-19：算进血里的每一下都要看得到），最后一箭打穿；
//   每一下都落在某个镜头那一截里（编排.ts 载入时查）。位置同 7-3：锚点跟着它走；炮从碰撞箱顶（2.9）起飘，箭从箭钉处往上 0.2 起飘。
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { DamageNumberLayer, damageNumberAnchor, makePerspectiveCamera, type DamageNumberItem } from '@库/界面/伤害数字.tsx';
import * as play from '../../场/7-收场/7-4-1/戏.ts';
import * as choreo from '../../场/7-收场/7-4-1/编排.ts';

const hitboxHeight = 2.9;
// 场景坐标 (x, y, z) Z 朝上 → three.js (x, z, -y)，同 6-4-1/古城画面.tsx
const toThree = ([x, y, z]: number[]) => new THREE.Vector3(x, z, -y);
// 每一下：在哪个镜头里出
const shown = play.hits.map((h, n) => {
  const height = h.kind === '炮' ? hitboxHeight : play.arrows[h.i].钉[2] - play.wardenState(h.T).p[2] + 0.2;
  const shot = Array.from({ length: choreo.shotCount }, (_, i) => i + 1).find((k) => choreo.frameInShot(k, h.T) !== undefined)!;
  return { ...h, height, shot, seed: 7451 + n };
});

export const DamageLayer741: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const T = choreo.storyT(frame);
  const k = choreo.shotIndex(frame);
  const cam = choreo.camera(frame);
  const cam3 = makePerspectiveCamera(cam.lens, toThree(cam.pos), toThree(cam.tgt), width, height);
  const feet = toThree(play.wardenState(T).p);
  const numbers: DamageNumberItem[] = shown
    .filter((h) => h.shot === k)
    .map((h) => ({ damage: h.damage, crit: h.crit, anchor: damageNumberAnchor(feet, h.height, h.seed), ticks: (T - h.T) * 20 }));
  return <DamageNumberLayer camera={cam3} width={width} height={height} numbers={numbers} />;
};
export const shownHits = shown;
