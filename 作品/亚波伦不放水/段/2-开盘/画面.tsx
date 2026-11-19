// 第 2 幕 偷袭的画面（用户 11-11 重排）：走位、她的姿势、盘在 场/1-台地/编排-开盘.ts，慢放的快慢在 场/1-台地/开盘拍.ts，这里换钟、摆镜头。
// 画面的钟是段内片秒，人、盘、烟、火都走世界秒（世界秒(片秒)）：慢放里一起慢下来，镜头照片秒走（绕她转的那一镜在慢放里照常速度转）。
// 用户 11-11「亚波伦被偷袭第一次瞬移走 第二次就迅速拉升 史蒂夫砍不到 飞行的时候伸出法杖 圆环缓缓张开，环绕镜头慢放（这几个动作同时发生）」：
// 第二次冲他从她脚底下冲过去那一下起慢放，她拉升、一甩身伸杖、杖尖张盘、镜头在世界里绕她转 180 度（用户 11-11 看八版「我要环绕 180 度诶」，绕拍.ts），四件事在同一镜里；慢放完她刹在祭坛上空、盘张开、杖指他。
// 拍他都从前方、侧前方（他脑后斜挂着晋升之环，从背后拍挡脸，11-11 看片意见），广角跟着动作，不震屏。镜头都是 Agent 摆的，用户没看过。
import React from 'react';
import type { Cam } from '@engine/core/机位.ts';
import { lerp, smoothstep01 } from '@engine/core/数学.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { definePicture, useSeg } from '@engine/段/段画面.tsx';
import { GirlYaBoLun } from '../../角色/娘化亚波伦.tsx';
import { withCastingHem } from '../../角色/空中施法袍摆.ts';
import { ReactingSteve } from '../../角色/反应史蒂夫.tsx';
import { guiScale, YaBoLunHealthBar } from '../../界面/战斗界面.tsx';
import { WandTipWheel } from '../../界面/杖尖轮盘.tsx';
import { RestRitualPerformance } from '../../特效/安息仪式.tsx';
import { summonPlans } from '../../特效/安息仪式时序.ts';
import { TeleportSmoke } from '../../特效/瞬移烟.tsx';
import { altar } from '../../场/1-台地/布局.ts';
import { pickShot, TerraceCanvas, aspect, followShot, type Shot } from '../../场/1-台地/台地场.tsx';
import { firstDir, secondDir, hoverFirst, beats, localGroundHeight } from '../../场/1-台地/开盘时刻.ts';
import { toWorldSec, toClipSec } from '../../场/1-台地/开盘拍.ts';
import timeline from '../../场/1-台地/时间线.ts';
import { yaBoLunPos, stevePos, steveStateAt, actStart, perform, teleports, act2WheelParams, wheelPlace, cellsPerPixel } from '../../场/1-台地/编排-开盘.ts';
import seg from './段.ts';
import { orbitBeat, orbitRig } from '../../场/1-台地/绕拍.ts';
import soundUrl from './声音地址.生成.ts';

const addVec = (a: readonly number[], b: readonly number[], k = 1): V3 => [a[0]! + b[0]! * k, a[1]! + b[1]! * k, a[2]! + b[2]! * k];
const lerpVec = (a: readonly number[], b: readonly number[], k: number): V3 => [lerp(a[0]!, b[0]!, k), lerp(a[1]!, b[1]!, k), lerp(a[2]!, b[2]!, k)];
/** 段内片秒 → 编排的钟（世界秒） */
const clock = (s: number) => actStart + toWorldSec(s);
const steveChest = (t: number) => addVec(stevePos(t), [0, 0, 1.0]);
const yaBoLunChest = (t: number) => addVec(yaBoLunPos(t), [0, 0, 1.1]);

/** 镜头从片秒 起 到 止，跟拍；摆(镜内片秒, 进度) */
const follow = (name: string, startSec: number, endSec: number, cameraPath: (s: number, k: number) => Cam, stepSec = 0.05): Shot => ({ name: name, start: startSec, cameraRig: followShot(endSec - startSec, (s, k) => cameraPath(startSec + s, k), stepSec) });

// 切点（片秒）：首冲→瞬移后回身→拉升绕拍，末镜直接接齐放。
const cuts = [0, beats.移, orbitBeat.start, orbitBeat.end] as const;
const shotTable: Shot[] = [
  // 2-01 他冲的那条线东边、和人差不多高（16 mm）：她从祭坛一蹬飞出来、刹在他东北边，他蹲下、挥剑冲出去，她冒烟一缩没了，他冲进烟里。
  // 固定地标，只摇不追，保留高速冲过祭坛的位移。
  follow('2-01', cuts[0], cuts[1], (_s, k) => {
    const caster = addVec(hoverFirst, [altar[0], altar[1], altar[2] + 1.1]);
    const fighter = steveChest(actStart);
    const separation = Math.hypot(caster[0] - fighter[0], caster[1] - fighter[1]);
    const pathMid = lerpVec(fighter, caster, 0.52);
    const right: V3 = [firstDir[1], -firstDir[0], 0];
    const pos = addVec(addVec(pathMid, right, 2.5 + 0.63 * separation), [0, 0, 1.7]);
    return { pos, tgt: lerpVec(pathMid, caster, 0.2 * smoothstep01(k)), lens: 16 };
  }),
  // 2-02 两人西边、略高：她从烟里冒出来带着冲势往东南一飘、刹住转向他；他滑停在她北边几格、原地横着打转，转完蹲着一扭身回头、蓄剑，她往下一沉。他在画面左、她在右
  follow('2-02', cuts[1], cuts[2], (s) => {
    const t = clock(s);
    const caster = yaBoLunChest(t), brake = smoothstep01((s - beats.移) / (beats.lookBack[0] - beats.移));
    const entry = steveChest(clock(beats.移)), stop = steveChest(clock(beats.lookBack[0]));
    const fighter = lerpVec(lerpVec(entry, stop, 0.5), stop, brake);
    const m = lerpVec(caster, fighter, 0.5);
    const distance = Math.hypot(caster[0] - fighter[0], caster[1] - fighter[1]);
    const corridor = Math.hypot(entry[0] - stop[0], entry[1] - stop[1]);
    const offset = Math.max(7, 0.79 * distance + 3.5, 0.66 * corridor * (1 - brake) + 7);
    const pos = addVec(m, [-secondDir[1] * offset, secondDir[0] * offset, 2.8]);
    pos[2] = Math.max(pos[2], altar[2] + localGroundHeight(pos[0] - altar[0], pos[1] - altar[1]) + 1.1);
    return { pos, tgt: m, lens: 18 };
  }),
  // 2-03 绕着她转 180 度（绕拍.ts）：她往上一拉，他冲过来从她脚底下过去（这一下起慢放），她一甩身对着他、伸杖、杖尖张盘、拉升到祭坛上空，
  // 镜头在世界里从她右后方逆时针绕到她左前方，四件事同时在这一镜里
  follow('2-03', cuts[2], cuts[3], (s) => orbitRig(s)),
];
/** 给测试查机位不入地、不穿基座（钟：片秒） */
export const actTwoShotTable = shotTable;
if (Math.abs(toClipSec(beats.dashSecondSec) - beats.dashSecondSec) > 1e-9) throw new Error('2-开盘：慢放要在第二次冲之后才起');

export default definePicture(seg, soundUrl, () => {
  const { sec: sec, segment: thisSegment } = useSeg(seg);
  const w = toWorldSec(sec);
  const t = actStart + w;
  const yaBoLun = perform.在(t);
  // 飞的时候两腿一前一后错开（角色/动作/亚波伦演出.ts 的 飞行、升空、升指），腿从袍子里戳出来的地方袍摆让开（同 6-结算舞）；腿收着时不改
  const yaBoLunPose = withCastingHem(yaBoLun.props);
  const { cameraRig } = pickShot(shotTable, sec, thisSegment.sec);
  const disc = act2WheelParams(t);
  const wand = disc && perform.杖(t);
  return (
    <TerraceCanvas ritualStructure cameraRig={cameraRig} ui={<YaBoLunHealthBar width={aspect.width} s={guiScale} healthRatio={1} />}>
      {/* 仪式做完后留在台地上的结构：方案的 总秒 之后就是静态的结构和火 */}
      <group position={altar}>
        <RestRitualPerformance sec={timeline.events.summonDone.sec - timeline.events.placeRing.sec + w} plan={summonPlans.短} />
      </group>
      <GirlYaBoLun {...yaBoLun.props} bonePose={yaBoLunPose} holdWand />
      {disc && wand && <>
        <pointLight position={wand.tip} color="#ffdfc2" intensity={6 * smoothstep01(disc.刻 / 5) * smoothstep01((beats.endSec - w) / 0.18)} distance={3.5} decay={2} />
        <WandTipWheel 杖={wand} {...wheelPlace} params={disc} cellsPerPixel={cellsPerPixel} />
      </>}
      <TeleportSmoke teleports={teleports} sec={t} />
      <ReactingSteve state={steveStateAt(t, w)} />
    </TerraceCanvas>
  );
});
