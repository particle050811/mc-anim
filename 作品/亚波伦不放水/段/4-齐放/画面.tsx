// 第 4 幕（轰炸）的画面：编排在 场/1-台地/编排-齐放.ts，这里摆镜头和界面（血条；用户 11-10 定不出法术名签和计数）。
// 两镜，按戏剪不按时间拍（用户 11-11「这个画面未必要按时间推进」）：
//   侧：侧面全景，她在左、他在右，她按住不放地连放、往后下方一冲，弹一串串飞过去、结界飞到他身上罩严；
//   第一人称一直到他死（用户 11-11「第一人称镜头直到死亡，一镜到底不就好了，加个侧写镜头干嘛？」，八版后面那一镜「挨炸」删了）：
//     他的眼睛（原版视角 70 度、右手断曜流光、原版 bobHurt 的受伤晃动），法术一发发朝镜头砸过来，她从画面一侧横着冲到另一侧；
//     索命劈中时晋升之环照原版不死图腾的样子从屏幕中间翻出来（库/界面/物品激活.tsx），身上冒金绿的图腾粒子；
//     她从他头顶一侧冲到他跟前上方，卫射照满打死他（幕末，切第 5 幕死亡界面）。
// 镜头照用户 11-10 说的：每个镜头里都有人在做动作，机位跟着动作走，1～3 秒一切。台地上留着仪式结构（祭坛、四角灵魂火），同第 2 幕。
// 机位、第一人称里的手和图腾都是 Agent 摆的，用户没看过。没做：猩红雨、伤害数字、第一人称的物品栏和血条（全片第一人称都没画 HUD，只留 boss 血条）。声音在 段.ts。
import React from 'react';
import * as THREE from 'three';
import { AbsoluteFill } from 'remotion';
import { deg, lerp as mix, rad, smoothstep01 as unitSmoothStep } from '@engine/core/数学.ts';
import { rigSpline, type Cam, type SplineKey } from '@engine/core/机位.ts';
import { png } from '@engine/model/贴图.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { definePicture, useSeg } from '@engine/段/段画面.tsx';
import { FirstPersonCanvas, FirstPersonHand, handTimeline, viewAngles } from '@库/角色/第一人称.tsx';
import { ItemActivate } from '@库/界面/物品激活.tsx';
import { GirlYaBoLun } from '../../角色/娘化亚波伦.tsx';
import { ReactingSteve } from '../../角色/反应史蒂夫.tsx';
import { ascensionHaloIcon } from '../../角色/史蒂夫掉落.tsx';
import { BattleUi } from '../../界面/战斗界面.tsx';
import { WandTipWheel } from '../../界面/杖尖轮盘.tsx';
import { Valettein, valetteinDisplay } from '../../物品/断曜流光.tsx';
import { defaultAppearance } from '../../物品/装备外观.ts';
import { RestRitualPerformance } from '../../特效/安息仪式.tsx';
import { summonPlans } from '../../特效/安息仪式时序.ts';
import { RevelationCagePerformance } from '../../特效/炼狱结界演出.tsx';
import { TotemParticles, totemParticleTable } from '../../特效/图腾粒子.tsx';
import { altar } from '../../场/1-台地/布局.ts';
import { CastLaunches } from '../../场/1-台地/出手.tsx';
import { nearFadeContext } from '../../法术/演出/零件/面片.tsx';
import { pickShot, TerraceCanvas, aspect, type Shot } from '../../场/1-台地/台地场.tsx';
import timeline from '../../场/1-台地/时间线.ts';
import { cellsPerPixel, wheelPlace } from '../../场/1-台地/编排-开盘.ts';
import { castHits, swingTimes, steveClock, steveBackToWorld, hurtTilt, gazeSlowSec } from '../../场/1-台地/齐放拍.ts';
import type { Launch } from '../../场/1-台地/出手表.ts';
import { yaBoLunPos, castTable, sceneCtx, steveStateAt, steveFoot, totemSec, actStart, throwSec, perform, secAt, cageSetup, wheelParams, cameraStart } from '../../场/1-台地/编排-齐放.ts';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';

const addVec = (a: readonly number[], b: readonly number[], k = 1): V3 => [a[0]! + b[0]! * k, a[1]! + b[1]! * k, a[2]! + b[2]! * k];
const mixVec = (a: readonly number[], b: readonly number[], u: number): V3 => [mix(a[0]!, b[0]!, u), mix(a[1]!, b[1]!, u), mix(a[2]!, b[2]!, u)];
const atHeight = (z: number): V3 => [0, 0, z];
const S = steveFoot;
const uiScale = 2;
/** 她在幕内第 s 秒的脚底、胸口 */
const yaBoLunAt = (s: number) => yaBoLunPos(secAt(s));
const chestAt = (s: number) => addVec(yaBoLunAt(s), atHeight(1.1));
/** 水平单位向量 a → b；侧 = 它往右转 90 度 */
const dirBetween = (a: readonly number[], b: readonly number[]): V3 => {
  const [x, y] = [b[0]! - a[0]!, b[1]! - a[1]!];
  const vecLength = Math.hypot(x, y) || 1;
  return [x / vecLength, y / vecLength, 0];
};
const perpendicular = (v: V3): V3 => [v[1], -v[0], 0];
const keyframe = (s: number, pos: V3, tgt: V3, lens: number): SplineKey => [s, { pos, tgt, lens }];
const linspace = (startSec: number, end: number, n: number) => Array.from({ length: n + 1 }, (_, i) => startSec + ((end - startSec) * i) / n);
/** 跟拍：从 起 到 止 每 步 秒放一个关键机位（她一下冲 0.3～0.55 秒、峰值 24～29 格/秒，关键隔得稀样条就跟不上） */
const follow = (startSec: number, end: number, cameraRig: (s: number) => [V3, V3, number], stepSec = 0.1): SplineKey[] =>
  linspace(startSec, end, Math.max(1, Math.ceil((end - startSec) / stepSec - 1e-9))).map((s) => keyframe(s, ...cameraRig(s)));
const makeShot = (name: string, startSec: number, keyframes: readonly SplineKey[]): Shot => ({ 名: name, 起: startSec, cameraRig: (_u, shotSec): Cam => rigSpline(keyframes, startSec + shotSec) });

// ── 第一人称：眼睛跟着他（挨打往后让、被结界拽回），视线慢 0.1 秒跟着她（玩家拿鼠标追着她）；原版视角 70 度 ──
/** 原版默认 fov 70（竖直）的焦距，同第 5 幕 */
const firstPersonLensMm = 14.46;
const firstPersonEye = (actSec: number) => addVec(steveStateAt(secAt(actSec)).位置, atHeight(1.62));
const firstPersonLook = (actSec: number) => addVec(yaBoLunAt(steveBackToWorld(steveClock(actSec)) - gazeSlowSec), atHeight(1.3));
/** bobHurt 在视图空间的转轴（齐放拍.ts 的 受伤们 开头）：视图空间 x 右、y 上、−z 往前 */
const hurtAxis = (yawDeg: number) => new THREE.Vector3(Math.sin(rad(yawDeg)), 0, -Math.cos(rad(yawDeg)));
const upAxis = new THREE.Vector3(0, 0, 1);
/** 第一人称机位：原版投影前先乘 R（bobHurt），世界里的相机就转 R⁻¹；换成看点 + 绕视线的 roll（engine/core/机位.ts 的约定：lookAt 以后 rotateZ(+roll)） */
const firstPersonRig = (actSec: number): Cam => {
  const eye = firstPersonEye(actSec);
  const lookAt = firstPersonLook(actSec);
  const { tiltDeg, dirDeg: yawDeg } = hurtTilt(actSec);
  if (tiltDeg === 0) return { pos: eye, tgt: lookAt, lens: firstPersonLensMm };
  const forward = new THREE.Vector3(lookAt[0] - eye[0], lookAt[1] - eye[1], lookAt[2] - eye[2]);
  const vecLength = forward.length();
  forward.normalize();
  const right = forward.clone().cross(upAxis).normalize();
  // 视图空间（x 右、y 上、z 往后）→ 场景，再右乘 R⁻¹
  const m = new THREE.Matrix4().makeBasis(right, right.clone().cross(forward), forward.clone().negate()).multiply(new THREE.Matrix4().makeRotationAxis(hurtAxis(yawDeg), rad(-tiltDeg)));
  const newForward = new THREE.Vector3(0, 0, -1).applyMatrix4(m);
  const newUp = new THREE.Vector3(0, 1, 0).applyMatrix4(m);
  const rightVec = newForward.clone().cross(upAxis).normalize();
  const roll = deg(Math.atan2(-newUp.dot(rightVec), newUp.dot(rightVec.clone().cross(newForward))));
  return { pos: eye, tgt: addVec(eye, [newForward.x, newForward.y, newForward.z], vecLength), lens: firstPersonLensMm, roll };
};
/** 右手：断曜流光照原版 ItemInHandRenderer 挥、挥完按攻击冷却升回来（剑攻速 1.6：12.5 刻）。挥剑的刻照他的局部钟（索命那 16 帧定住） */
const handScript = { start: '剑', swings: swingTimes.map((c) => Math.round(c * 20)), cooldown: 12.5 } as const;
/** 晋升之环的屏幕动画往哪一角飞（原版 random.nextFloat() × 2 − 1，这里取定）：右上 */
const ringOffset = [0.55, -0.7] as const;
const ringLayers = [{ tex: png(ascensionHaloIcon) }];

/** 镜头表（幕内秒） */
const shotTable: readonly Shot[] = [
  // 侧：机位在两人连线的右侧（她在画面左上、他在右下）、离连线中点 22 → 20 格（她高 12 格、离他水平 10 格，20 毫米下两人连血条都框得下），
  // 镜头跟着两人中点慢慢往他那边推
  makeShot('侧', cameraStart.side, follow(cameraStart.side, cameraStart.firstPerson, (s) => {
    const u = unitSmoothStep(s / cameraStart.firstPerson);
    const centerPos = mixVec(yaBoLunAt(s), S, mix(0.5, 0.56, u));
    const right = dirBetween(yaBoLunAt(0), S);
    return [addVec(addVec(addVec(centerPos, perpendicular(right), mix(22, 20, u)), right, mix(-1, 1, u)), atHeight(mix(-1.5, -0.8, u))), addVec(centerPos, atHeight(mix(0.8, 0.4, u))), 20];
  }, 0.25)),
  { 名: '第一人称', 起: cameraStart.firstPerson, cameraRig: (_u, shotSec) => firstPersonRig(cameraStart.firstPerson + shotSec) },
];
const totemTable = totemParticleTable(S, 1, { ground: S[2] });

/** 按镜头清场（Agent 取的）：第一人称镜头就在他眼睛里，打到他身上的那一刻就不画了（他身上炸开的、长出来的会把镜头整个糊住），
 *  当刻就到的（闪电、音爆这种）只留 0.2 秒 */
const withEnd = (cast: Launch, endSec: number): Launch => ({ ...cast, 止: Math.min(cast.止 ?? Infinity, endSec) });
const firstPersonTable = castTable.map((cast, i) => withEnd(cast, castHits[i] ?? cast.秒 + 0.2));
const throwsByShot: Record<string, readonly Launch[]> = { 侧: castTable, 第一人称: firstPersonTable };

const SceneFirstPersonHand: React.FC<{ actSec: number }> = ({ actSec }) => {
  const handState = handTimeline(steveClock(actSec) * 20, handScript);
  const eye = firstPersonEye(actSec);
  const { tiltDeg, dirDeg: yawDeg } = hurtTilt(actSec);
  const handRot = new THREE.Quaternion().setFromAxisAngle(hurtAxis(yawDeg), rad(tiltDeg));
  return (
    <FirstPersonCanvas width={aspect.宽} height={aspect.高} view={viewAngles(eye, firstPersonLook(actSec))}>
      {/* 原版 renderItemInHand 画手之前也调一遍 bobHurt：手跟着视角一起歪 */}
      <group quaternion={handRot}>
        <FirstPersonHand held={<Valettein glintSec={actSec} />} display={valetteinDisplay[defaultAppearance].firstperson_righthand} swing={handState.swing} equip={handState.equip} />
      </group>
    </FirstPersonCanvas>
  );
};

export default definePicture(seg, soundUrl, () => {
  const { 秒: sec, 段: thisSegment } = useSeg(seg);
  const t = actStart + sec;
  const yaBoLunState = perform.在(t);
  const { shot, cameraRig } = pickShot(shotTable, sec, thisSegment.秒);
  const isFirstPerson = shot.名 === '第一人称';
  return (
    <TerraceCanvas
      ritualStructure
      cameraRig={cameraRig}
      ui={
        <>
          {isFirstPerson && (
            <AbsoluteFill>
              <SceneFirstPersonHand actSec={sec} />
              <ItemActivate 宽={aspect.宽} 高={aspect.高} s={uiScale} 秒={t - totemSec} offset={ringOffset} items={ringLayers} />
            </AbsoluteFill>
          )}
          <BattleUi 宽={aspect.宽} 高={aspect.高} s={uiScale} healthBar={{ healthRatio: 1 }} />
        </>
      }
    >
      <nearFadeContext.Provider value={isFirstPerson ? [1.5, 3.5] : [1, 3]}>
        {/* 仪式做完后留在台地上的结构和四角灵魂火，同第 2 幕；仪式的钟走编排的钟（第 2 幕慢放过，比片秒慢），火和第 2 幕末接上 */}
        <group position={altar}>
          <RestRitualPerformance 秒={t + timeline.事件.yaBoLunAppears.秒 - timeline.事件.placeRing.秒} plan={summonPlans.短} />
        </group>
        <GirlYaBoLun {...yaBoLunState.props} holdWand />
        <WandTipWheel 杖={perform.杖(t)} {...wheelPlace} params={wheelParams(t)} cellsPerPixel={cellsPerPixel} />
        <RevelationCagePerformance 秒={t - throwSec} settings={cageSetup} />
        <CastLaunches 表={throwsByShot[shot.名]!} 秒={t} sceneCtx={sceneCtx} />
        <TotemParticles 表={totemTable} 秒={t - totemSec} />
        {/* 第一人称镜头就在他眼睛里，不画他自己 */}
        {!isFirstPerson && <ReactingSteve 状态={steveStateAt(t)} />}
      </nearFadeContext.Provider>
    </TerraceCanvas>
  );
});
