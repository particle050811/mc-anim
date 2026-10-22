// 手里的东西：两件战利品拿起放下、结构指南针拿起来平托着走到九胡面前，和指南针的指针。
import * as THREE from 'three';
import { sample, type Key } from '@engine/anim/anim.ts';
import * as K624 from '../../6-2-4/编排.ts';
import { handAt, lerp3, ss } from '../动作.ts';
import { FPS, lastFrame, cues } from './时间线.ts';
import { LY_H, LOOT_FACE, COMPASS_ON_TABLE, CP_END, LOOT_GRIP, COMPASS_GRIP, lootTable, sub, add } from './站位.ts';
import { liying } from './李樱.ts';

// ---------- 桌上的东西 ----------
export type ItemState = { pos: number[]; quat: THREE.Quaternion; onTable: boolean };
const qStand = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.atan2(LOOT_FACE[0], -LOOT_FACE[1]))).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
// 拿起：抓的那一刻物品还在原处，0.3 秒内跟到手上；放下反过来
const carried = (globalFrame: number, hand: 'R' | 'L', table: number[], grip: number[], tUp: number, tDown: number) => {
  const t = globalFrame / FPS;
  if (t <= tUp || t >= tDown) return { pos: table, onTable: true };
  const pose = liying(globalFrame);
  const handPos = add(handAt(pose, hand, LY_H), grip);
  const up = sub(table, add(handAt(liying(tUp * FPS), hand, LY_H), grip));
  const down = sub(table, add(handAt(liying(tDown * FPS), hand, LY_H), grip));
  const offset = add(up.map((v) => v * (1 - ss((t - tUp) / 0.3))), down.map((v) => v * ss((t - (tDown - 0.3)) / 0.3)));
  return { pos: add(handPos, offset), onTable: false };
};
export const blood = (G: number): ItemState => ({ ...carried(G, 'L', lootTable('炽热的血'), LOOT_GRIP, cues.grab, cues.putDone), quat: qStand });
export const fur = (G: number): ItemState => ({ ...carried(G, 'R', lootTable('雪怪首领毛皮'), LOOT_GRIP, cues.grab, cues.putDone), quat: qStand });

// 结构指南针：一直平放、平托（贴图上方朝北、正面朝上）：桌上 → 抓起来平托在手里 → 走过去托到九胡面前（6-2-4 首帧的摆法）。
// 用户 10-18 定：平托，竖着举太诡异。
const qFlat = new THREE.Quaternion();
export const compass = (globalFrame: number): ItemState => {
  if (globalFrame >= lastFrame) return { pos: CP_END.pos, quat: qFlat, onTable: false };
  const t = globalFrame / FPS;
  if (t <= cues.grabCompass) return { pos: COMPASS_ON_TABLE, quat: qFlat, onTable: true };
  // 走起来以后身子会转，握持偏移跟着身子转（6-2-4 的 `gripAt`），转向九胡时换成 6-2-4 的握法；起步那一刻身子朝北，和前面接得上
  if (t >= cues.walk[0]) {
    const k = ss((t - cues.handOver[0]) / (cues.handOver[1] - cues.handOver[0]));
    // 换握法的途中托高 3 厘米、两头收回 0：直线插过去的话，前臂从斜举换成平端的半路会从表壳底下戳进来 1 厘米多
    const grip = lerp3(COMPASS_GRIP, K624.COMPASS_GRIP, k);
    grip[2] += 0.03 * Math.sin(Math.PI * k);
    return { pos: K624.gripAt(liying(globalFrame), grip), quat: qFlat, onTable: false };
  }
  const handPos = add(handAt(liying(globalFrame), 'R', LY_H), COMPASS_GRIP);
  const off = sub(COMPASS_ON_TABLE, add(handAt(liying(cues.grabCompass * FPS), 'R', LY_H), COMPASS_GRIP));
  return { pos: add(handPos, off.map((v) => v * (1 - ss((t - cues.grabCompass) / 0.3)))), quat: qFlat, onTable: false };
};
// 指针（度，绕表盘法线，0 = 贴图上方；平放时贴图上方朝北，正 = 从上往下看逆时针）：
// 在桌上时乱指（偏南），拿起来先晃一晃，再转半圈停在 0（朝北，朝着屋子北边的镜头），停稳以后一直是 0（6-2-4 接着用 0）。
// 房间摆到基地小岛上以后不再跟着 6-2-5 转，6-2-4 扫帚离地时自己转到出发朝向，和指针不一定同一个方向；「转半圈、指向镜头这边」是这一段的戏（场景描述这么写），没跟着改
export const needle = (globalFrame: number): number => {
  const t = globalFrame / FPS;
  const a0 = 160;
  if (t < cues.grabCompass) return a0;
  const wob = 24 * Math.sin(2 * Math.PI * 2.3 * (t - cues.grabCompass)) * (1 - ss((t - cues.grabCompass) / (cues.needleTurn - cues.grabCompass + 0.2)));
  const turn = sample([[cues.needleTurn, 0], [cues.needleTurn + 0.8, a0 + 14], [cues.needleTurn + 1.05, a0 - 5], [cues.needleStop, a0]] as Key[], t);
  return a0 + wob * (t < cues.needleTurn + 0.2 ? 1 : 0) - turn;
};
