// 第 1 幕 召唤的画面：史蒂夫站在基座外、右键把破碎之环放上祭坛 → 安息仪式（特效/安息仪式.tsx，短方案）里他退开、拔剑，镜头切走时绕到一冲起点 →
// 亚波伦现身：闭着眼低着头，睁眼、抬头、转向他、杖一甩，第 2 幕接他冲上来。走位和她的动作在 场/1-台地/编排-开盘.ts，这里摆镜头。
// 用户 11-10 嫌前面「意义不明的环绕镜头」太多、人物「就像暂停了」：镜头都拍着在动的东西（人、仪式），机位跟着走（跟拍，场/1-台地/台地机位.ts），不绕着空景转；拍他都从前方、侧前方。
// 镜头是 Agent 摆的（1-02 是 11-11 新摆的，用户没看过）。和分镜第二稿不一样：没有「手落在祭坛上」的特写，放环是越过祭坛那一镜里的右键。
import React from 'react';
import { clamp01 } from '@engine/core/数学.ts';
import { definePicture, useSeg } from '@engine/段/段画面.tsx';
import { GirlYaBoLun } from '../../角色/娘化亚波伦.tsx';
import { ReactingSteve } from '../../角色/反应史蒂夫.tsx';
import { guiScale, YaBoLunHealthBar } from '../../界面/战斗界面.tsx';
import { RestRitualPerformance } from '../../特效/安息仪式.tsx';
import { summonPlans, game } from '../../特效/安息仪式时序.ts';
import { altar } from '../../场/1-台地/布局.ts';
import { steveRightHand, steveLook, steveCharge, steveSwingSec, steveMove, steveChargeMove, steveWalk, perform } from '../../场/1-台地/编排-开盘.ts';
import { TerraceCanvas, aspect } from '../../场/1-台地/台地场.tsx';
import seg from './段.ts';
import { clock, summonShotAt } from './机位.ts';
import soundUrl from './声音地址.生成.ts';

const plan = summonPlans.短;
/**
 * 黑暗效果有多暗（0～0.45）。照原版 LightTexture.calculateDarknessScale（1.20.1，javap 读的）：0.45 × max(0, cos(刻 × π × 0.025))，
 * 4 秒一起伏、一半时间不暗。原来一直压着 0.45，七版的 1-03 整段太暗（11-11 看片意见）。相位（玩家的 tickCount）游戏里是随的，
 * 这里取提示后 1 秒最暗（Agent 取的）；游戏里压的是光照图、暗处更暗，这里还是整片盖一层黑
 */
const darkness = (ritualSec: number) => {
  const sincePrompt = ritualSec - plan.提示;
  return sincePrompt < 0 ? 0 : 0.45 * clamp01(sincePrompt / 0.5) * Math.max(0, Math.cos((sincePrompt - 1) * 20 * Math.PI * 0.025));
};

export default definePicture(seg, soundUrl, () => {
  const { sec: sec, events: events } = useSeg(seg);
  const ritualSec = sec - events.placeRing;
  const t = clock(sec);
  const { cameraRig } = summonShotAt(sec);
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
          {hpBarOpacity > 0 && <YaBoLunHealthBar width={aspect.width} s={guiScale} healthRatio={1} opacity={hpBarOpacity} />}
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
