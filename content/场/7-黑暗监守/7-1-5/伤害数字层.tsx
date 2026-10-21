// 7-1-5 风矢钉进监守者后背那一刻冒出的伤害数字层（同 6-1-2：透明底、和 7-1-5-风矢 同宽高同帧数同机位，只画数字，由 合成第六章.py 叠上去）。
// 画法、动画、字号照抄汇流来世，见 模型/界面/伤害数字.tsx；这里只定伤害、时机和位置。
// 伤害取 ../7-1/戏/伤害.ts 的 `wardenHits`（1527）。风矢 1500 上下的依据：原文 4.md 第 45 行「其实际攻击伤害至少能杀死三只原版的监守者」，原版 Warden.createAttributes 血量 500 × 3 = 1500，
//   用户 10-18 定比 1500 多一点、不要整数；这个世界的监守者五万血（7.md 第 46 行），打不死。
// 深红暴击：黄叛拉满弓（BowItem.releaseUsing 满弦 setCritArrow），汇流来世正好把满弦暴击箭标成暴击。
// 位置（用户 10-18 要各机位都看得到）：照原版生成在目标碰撞箱顶、之后定在世界里不动（监守者这时站在东墙脚不动）。
//   高度从碰撞箱顶（2.9）降到中箭处往上 0.6（2.2）：镜 2 机位在它身后高 4.4，2.9 起飘 0.95 格会出画面上沿；2.2 起，字底正好在箭上面、不盖住箭。
//   随机偏移照 `damageNumberAnchor`（种子固定）。
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { DamageNumberLayer, damageNumberAnchor, makePerspectiveCamera } from '../../../../world/界面/伤害数字.tsx';
import * as play from '../../../../world/地点/古城4x/7-1/戏.ts';
import * as choreo from './编排.ts';

const hit = play.wardenHits.find((h) => h.箭 === play.windArrowShot)!;
const anchorAboveHit = 0.6;
const hitHeight = play.windArrowShot.落[2] - play.wardenState(play.windArrowShot.中).p[2];
// 场景坐标 (x, y, z) Z 朝上 → three.js (x, z, -y)，同 6-4-1/古城画面.tsx
const toThree = ([x, y, z]: number[]) => new THREE.Vector3(x, z, -y);
const anchor = damageNumberAnchor(toThree(play.wardenState(play.windArrowShot.中).p), hitHeight + anchorAboveHit, 715);
export const windArrowHit = { ...hit, anchor }; // 7-2-1 李樱远望时看到的是同一个数字、同一个位置

export const WindArrowDamageLayer: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = choreo.t于(frame);
  const cam = choreo.camera(frame);
  const camera = makePerspectiveCamera(cam.lens, toThree(cam.pos), toThree(cam.tgt), width, height);
  const ticks = (t - play.windArrowShot.中) * 20;
  return <DamageNumberLayer camera={camera} width={width} height={height} numbers={[{ damage: hit.damage, crit: hit.crit, anchor, ticks }]} />;
};
