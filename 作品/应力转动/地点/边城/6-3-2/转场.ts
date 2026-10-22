// 6-3-2 思索 → 6-3-3 俯冲的转场（用户 10-19：思索完了放大思索界面里的李樱，背景淡掉换回游戏里的天空，丝滑接上下落锤击，不再演从扫帚上跳下来）。
// 演示整个演完、关界面（`cues.close`）：标题、按钮、说明框 0.5 秒淡掉，淡完镜头往砸到底的李樱推，推完是 6-3-2 末帧 = 6-3-3 首帧（全局帧 0），
// 之后 `淡出帧数` 帧里思索的底色、场景板连同里面的李樱一起淡掉，底下是同一刻真的俯冲（6-3-3/俯冲.tsx 把思索层叠在上面）。推完才淡，不叠在一起（用户 10-19：界面淡出 → 放大李樱 → 换回天空）。
// 对得上：思索里的李樱是下坠里那个李樱绕竖直轴转 ψ 摆进场景板（编排.ts 的 `figureRef`），全局帧 0 起姿势、虚影、金光都取同一物理时刻；
// 下坠的镜头就是思索镜头相对他的髋的位置、视线转回 −ψ，焦距相同，所以两边的他在画面上同一处、同一个姿势。推完以后镜头相对髋不动，一直跟到切城墙。
// 镜头：整段用很远很窄的透视代替原版的正交（`restDistance` 外，和正交差不到千分之二）。推近时看见的高度、视角按对数插到终点（焦距 28），
// 他的髋在画面上的位置从静止时那一点直线挪到终点那一点（直接插看点的话，看见的高度和看点一起缩，他一直贴在画面上沿，像在推场景板）。
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { ponderScreen } from '@库/界面/思索界面.tsx';
import type { Cam } from '../6-3-下坠/编排/机位.ts';
import type { PonderPerspective } from '@库/界面/思索场景.tsx';
import { liYing } from '../6-3-下坠/编排/李樱.ts';
import { FPS, 段表, 刻, 物理时间 } from '../6-3-下坠/时间线.ts';
import { cues, figureAt, figureRef, sceneCenter, pixelsPerBlock, viewRotation, toGame, toScene } from './编排.ts';
import { uiOpen } from './台词.ts';

const ss = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const logLerp = (a: number, b: number, k: number) => Math.exp(lerp(Math.log(a), Math.log(b), k));

export const 淡出帧数 = 10;
// 全局帧 → 思索场景时间（6-3-3 开头几帧接着 6-3-2 往下算）
export const sceneTime = (G: number) => (G - 段表['6-3-2'].起) / FPS - uiOpen;
export const tMatch = sceneTime(0);
// 思索层的不透明度：全局帧 0 起淡掉
export const ponderLayerOpacity = (G: number) => 1 - ss(G / 淡出帧数);
// 下坠的风声从推近开始（全局帧，负的）起，随推近渐强，淡到天空时到足（6-3-下坠/声音.tsx；用户 10-19：转场里不要一段没声音）
export const 风起帧 = Math.round((cues.close[1] - tMatch) * FPS);
export const windFadeIn = (G: number) => ss((G - 风起帧) / (淡出帧数 - 风起帧));
// 全局帧 0 以后思索里的李樱按下坠的物理时间摆（之前停在 `刻`.俯冲起 的架势上）
export const transitionW = (t: number) => (t >= tMatch ? 刻.俯冲起 + (t - tMatch) : undefined);

// 焦距 → 竖直视角（度），同 lib/飞行镜头.tsx 的 FlightRig（36 毫米宽的底片、16:9）
const aspect = ponderScreen.W / ponderScreen.H;
const fovOf = (lens: number) => (2 * Math.atan(18 / lens / aspect) * 180) / Math.PI;
const lensOf = (fov: number) => 18 / Math.tan((fov * Math.PI) / 360) / aspect;
const restDistance = 3000;
const restHeight = ponderScreen.H / (pixelsPerBlock / ponderScreen.s); // 正交时画面高看见几格
const endLens = 28;
const endHeight = 4.5; // 推完时画面高看见几米：他连锤约 3 米，占画面三分之二
const endHipNdc = [0, 0.35]; // 推完时髋在画面上的位置（−1～1）：头朝下，髋在上，人连锤居中
const viewInv = viewRotation.clone().invert();
const back = new THREE.Vector3(0, 0, 1).applyQuaternion(viewInv); // 看点 → 镜头（游戏坐标）
const right = new THREE.Vector3(1, 0, 0).applyQuaternion(viewInv);
const up = new THREE.Vector3(0, 1, 0).applyQuaternion(viewInv);
let HIP: { pos: THREE.Vector3; restNdc: [number, number] } | null = null;
const hipRef = () => {
  if (HIP) return HIP;
  const pos = new THREE.Vector3(...toGame(figureAt(tMatch, 刻.俯冲起).hip));
  const rel = pos.clone().sub(new THREE.Vector3(...sceneCenter));
  HIP = { pos, restNdc: [rel.dot(right) / (restHeight * aspect / 2), rel.dot(up) / (restHeight / 2)] };
  return HIP;
};
export type PonderCam = PonderPerspective & { target: V3 };
// 思索的镜头（游戏坐标）：界面淡完以前停在远处（等于正交），之后推近
export const ponderCamAt = (t: number): PonderCam => {
  const k = ss((t - cues.close[1]) / (tMatch - cues.close[1]));
  const hip = hipRef();
  const height = logLerp(restHeight, endHeight, k);
  // 看点放在过髋、垂直于视线的平面上，髋就正好落在 ndc 处；k = 0 时和场景中心只差沿视线的一段（远处的窄视角看不出）
  const ndcX = lerp(hip.restNdc[0], endHipNdc[0], k);
  const ndcY = lerp(hip.restNdc[1], endHipNdc[1], k);
  const target = hip.pos.clone().addScaledVector(right, (-ndcX * height * aspect) / 2).addScaledVector(up, (-ndcY * height) / 2);
  const fov = logLerp((2 * Math.atan(restHeight / 2 / restDistance) * 180) / Math.PI, fovOf(endLens), k);
  const dist = height / 2 / Math.tan((fov * Math.PI) / 360);
  const pos = target.clone().addScaledVector(back, dist);
  return { pos: [pos.x, pos.y, pos.z], target: [target.x, target.y, target.z], fov, near: Math.max(0.05, dist - 40), far: dist + 40 };
};

// 6-3-3 俯冲的镜头（下坠的场景坐标）：思索镜头相对思索里李樱髋的位置转回 −ψ，挂到真李樱的髋上
export const diveCam = (G: number): Cam => {
  const cam = ponderCamAt(sceneTime(G));
  const hipPonder = figureAt(tMatch, 刻.俯冲起).hip;
  const hipReal = liYing(物理时间(G)).hip;
  const unRotate = figureRef().psi.clone().invert();
  const rel = (p: V3): V3 => {
    const v = new THREE.Vector3(...toScene(p)).sub(new THREE.Vector3(...hipPonder)).applyMatrix4(unRotate);
    return [hipReal[0] + v.x, hipReal[1] + v.y, hipReal[2] + v.z];
  };
  return { pos: rel(cam.pos), tgt: rel(cam.target), lens: lensOf(cam.fov) };
};

// 思索里画金光用的镜头（场景坐标的位置、按焦距的变焦，同 6-3-下坠/画面.tsx 给 LiYingGoldGlow 的 cam、zoom）：光团、光尾的「远处放大」只看 距离 ÷ 变焦，远处的窄视角和近处的 40 毫米一样大
export const glowCamAt = (t: number) => {
  const cam = ponderCamAt(t);
  return { pos: toScene(cam.pos), zoom: Math.max(1, lensOf(cam.fov) / 40) };
};
