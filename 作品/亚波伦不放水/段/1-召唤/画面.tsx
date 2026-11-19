// 第 1 幕 召唤的画面：史蒂夫站在基座外、右键把破碎之环放上祭坛 → 安息仪式（特效/安息仪式.tsx，短方案）里他退开、拔剑、紧张地挪步 →
// 亚波伦现身：闭着眼低着头，睁眼、抬头、转向他、杖一甩，第 2 幕接他冲上来。走位和她的动作在 场/1-台地/编排-开盘.ts，这里摆镜头。
// 用户 11-10 嫌前面「意义不明的环绕镜头」太多、人物「就像暂停了」：镜头都拍着在动的东西（人、仪式），机位跟着走（跟拍，场/1-台地/台地场.tsx），不绕着空景转；拍他都从前方、侧前方。
// 镜头是 Agent 摆的（1-02 是 11-11 新摆的，用户没看过）。和分镜第二稿不一样：没有「手落在祭坛上」的特写，放环是越过祭坛那一镜里的右键。
import React from 'react';
import type { Cam } from '@engine/core/机位.ts';
import { clamp01, lerp, smoothstep01 } from '@engine/core/数学.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { definePicture, useSeg } from '@engine/段/段画面.tsx';
import { GirlYaBoLun } from '../../角色/娘化亚波伦.tsx';
import { ReactingSteve } from '../../角色/反应史蒂夫.tsx';
import { YaBoLunHealthBar } from '../../界面/战斗界面.tsx';
import { RestRitualPerformance } from '../../特效/安息仪式.tsx';
import { summonPlans, game } from '../../特效/安息仪式时序.ts';
import { altar } from '../../场/1-台地/布局.ts';
import { yaBoLunHead, stevePos, steveRightHand, steveLook, steveCharge, steveSwingSec, steveMove, steveChargeMove, steveWalk, perform, afterAppear as choreoClock } from '../../场/1-台地/编排-开盘.ts';
import timeline from '../../场/1-台地/时间线.ts';
import { pickShot, TerraceCanvas, aspect, followShot, type Shot } from '../../场/1-台地/台地场.tsx';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';

const plan = summonPlans.短;
const addVec = (a: readonly number[], b: readonly number[], k = 1): V3 => [a[0]! + b[0]! * k, a[1]! + b[1]! * k, a[2]! + b[2]! * k];
const fromAltar = (x: number, y: number, z: number): V3 => addVec(altar, [x, y, z]);
/** 段内秒 → 编排的钟（现身后几秒） */
const clock = (segSec: number) => choreoClock(timeline.events.开始.sec + segSec);
const segSecAt = (choreoSec: number) => choreoSec - clock(0);
/** 场时间线的事件 → 段内秒（段从 开始 起） */
const eventSec = { placeRing: timeline.events.placeRing.sec - timeline.events.开始.sec };
const chestAt = (t: number) => addVec(stevePos(t), [0, 0, 1.2]);
/**
 * 黑暗效果有多暗（0～0.45）。照原版 LightTexture.calculateDarknessScale（1.20.1，javap 读的）：0.45 × max(0, cos(刻 × π × 0.025))，
 * 4 秒一起伏、一半时间不暗。原来一直压着 0.45，七版的 1-03 整段太暗（11-11 看片意见）。相位（玩家的 tickCount）游戏里是随的，
 * 这里取提示后 1 秒最暗（Agent 取的）；游戏里压的是光照图、暗处更暗，这里还是整片盖一层黑
 */
const darkness = (ritualSec: number) => {
  const sincePrompt = ritualSec - plan.提示;
  return sincePrompt < 0 ? 0 : 0.45 * clamp01(sincePrompt / 0.5) * Math.max(0, Math.cos((sincePrompt - 1) * 20 * Math.PI * 0.025));
};

/** 从 pos 看 a、b 两点：视线取两个方向的加权平均（w 偏向 a），远近差得多时也能把两样都框住 */
const lookBetween = (pos: V3, a: readonly number[], b: readonly number[], w: number): V3 => {
  const lookDir = (q: readonly number[]) => {
    const d = addVec(q, pos, -1);
    const n = Math.hypot(...d);
    return d.map((v) => v / n);
  };
  return addVec(pos, addVec(lookDir(a).map((v) => v * w), lookDir(b), 1 - w));
};
const altarTop = fromAltar(0, 0, 2.4);

// 机位都在他前方、侧前方：他脑后斜挂着晋升之环（1 格的方片），从背后拍，环挡掉一大块、人又是一团金色，看不见脸和手（11-11 看片意见）
// 用户 11-11 看七版：「1-2s 走过去的镜头是多余的」——删了他走上来那一镜（1-01），开头就是越过祭坛看他放环；
// 「5-8 召唤出亚伯伦 为什么要给史蒂夫特写？」——召唤那几秒（原 1-03 他正面跟拍）换成拍祭坛上的仪式和她出现，他不在画面里。其余照七版
const shotTable: Shot[] = (() => {
  const cuts = { 三: eventSec.placeRing + 3.3, 四: segSecAt(0.35), 五: segSecAt(0.95), end: segSecAt(choreoClock(timeline.events.summonDone.sec)) };
  return [
    // 1-01 祭坛东北边、越过祭坛往南看他（七版的 1-02，往前接到开头）：他右键把环放上祭坛，祭品消失、光柱起来都在前景，他在后面正对着镜头往后退，光柱起来一缩、拔剑；镜头慢慢往前压
    { name: '1-01', start: 0, cameraRig: followShot(cuts.三, (s, k) => {
      const t = clock(s);
      const pos = fromAltar(lerp(2.2, 1.9, k), lerp(4.8, 4.4, k), lerp(3.6, 3.3, k));
      return { pos, tgt: lookBetween(pos, altarTop, chestAt(t), 0.3), lens: 30 };
    }) },
    // 1-02 祭坛正东、两团灵魂火中间，略高过祭坛往里推：黑暗、低语、大烟里仪式收尾，火焰炸开、她在祭坛上出现（他在镜头右后方，不进画面）
    { name: '1-02', start: cuts.三, cameraRig: followShot(cuts.四 - cuts.三, (_s, k): Cam => {
      const u = smoothstep01(k);
      return { pos: fromAltar(lerp(6.2, 4.4, u), lerp(-1.2, -0.8, u), lerp(2.9, 3.2, u)), tgt: fromAltar(0, 0, lerp(3.0, 3.5, u)), lens: lerp(28, 32, u) };
    }) },
    // 1-03 她的脸：低着头闭着眼，睁眼、开始抬头；镜头从她面前往脸上推（11-11 提速：0.95 秒就切走，抬头、转身、甩杖都在 1-04 里）
    { name: '1-03', start: cuts.四, cameraRig: followShot(cuts.五 - cuts.四, (_s, k): Cam => ({ pos: fromAltar(lerp(2.5, 1.85, smoothstep01(k)), lerp(-0.65, -0.45, k), lerp(3.85, 4.0, k)), tgt: fromAltar(0, 0, lerp(3.85, 4.0, smoothstep01(k))), lens: lerp(30, 38, smoothstep01(k)) })) },
    // 1-04 越过她右肩看他：她抬头、转过身来对着他、杖一甩；他在远处压低身子，第 2 幕接她飞出来
    { name: '1-04', start: cuts.五, cameraRig: followShot(cuts.end - cuts.五, (s, k): Cam => {
      const t = clock(cuts.五 + s);
      const head = yaBoLunHead(t), chest = chestAt(t);
      const angle = Math.atan2(chest[1] - head[1], chest[0] - head[0]);
      const ahead = Math.cos(angle), across = Math.sin(angle);
      const pos = addVec(head, [-3.8 * ahead - 2.4 * across, -3.8 * across + 2.4 * ahead, lerp(1.1, 0.8, k)]);
      return { pos, tgt: lookBetween(pos, head, chest, lerp(0.55, 0.4, k)), lens: lerp(24, 27, k) };
    }) },
  ];
})();

export const summonShots = shotTable;

export default definePicture(seg, soundUrl, () => {
  const { sec: sec, events: events, segment: thisSegment } = useSeg(seg);
  const ritualSec = sec - events.placeRing;
  const t = clock(sec);
  const { cameraRig } = pickShot(shotTable, sec, thisSegment.sec);
  const hint = ritualSec >= plan.提示 && t < 0;
  const hpBarOpacity = clamp01((t - 2.2) / 0.6);
  return (
    <TerraceCanvas
      ritualStructure
      cameraRig={cameraRig}
      ui={
        <>
          {/* 黑暗效果（游戏里提示那一刻给 32 格内的玩家上「黑暗」）：一起一伏地压暗，到现身 */}
          <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: darkness(ritualSec) * (1 - clamp01(t / 0.3)) }} />
          {hint && (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: aspect.height * 0.2, textAlign: 'center', color: '#FF5555', fontFamily: 'Minecraft, monospace', fontSize: 26, textShadow: '2px 2px 0 #3F1515' }}>{game.hintText}</div>
          )}
          {hpBarOpacity > 0 && <YaBoLunHealthBar width={aspect.width} s={2} healthRatio={1} opacity={hpBarOpacity} />}
        </>
      }
    >
      <group position={altar}>
        <RestRitualPerformance sec={ritualSec} plan={plan} />
      </group>
      {t >= 0 && <GirlYaBoLun {...perform.在(t).props} holdWand />}
      <ReactingSteve state={{ ...steveWalk.在(t), 看: steveLook(t), sec: sec, rightHand: steveRightHand(t), leftHand: '空', swingSec: steveSwingSec(t), move: steveMove(t), chargeMove: steveChargeMove(t), charge: steveCharge(t) }} />
    </TerraceCanvas>
  );
});
