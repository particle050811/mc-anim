// 第 5 幕 击败的画面：编排在 场/1-台地/编排-击败.ts，这里摆镜头和界面。
// 用户 11-11 看完七版：东西撒一地那一镜（七版 5-01）单拍没意义，「死后亚伯伦 环绕的镜头 我觉得做得挺好 不改」，东西「就在死亡界面撒一地」。
// 所以一镜到底：七版 5-03 的机位原样（贴着她：盘一圈圈收回杖尖、杖收到身侧，她一下俯冲落到那堆东西跟前，落地滑一小段站住低头看），
// 原版死亡界面（库/界面/死亡界面.tsx）从第一帧盖着，光标移到「重生」上点下去；他一死就倒下、化烟，东西从他身上照原版死亡掉落撒出去，落在她脚边；
// 聊天栏（在死亡界面底下）同时出死亡消息。死亡界面、撒落、聊天栏摆进这一镜是 Agent 做的，用户没看过；开关是 场/1-台地/编排-击败.ts 的 游戏界面。
// 台地上留着仪式结构（祭坛、四角灵魂火），同第 2 幕。没做：经验球、地上留的火冰酸、猩红雨，只留 boss 血条。
// 点「重生」以后不演重生，幕末硬切第 6 幕教堂（分镜 5-02 下的说明）。
import React, { useMemo } from 'react';
import { lerp as mix } from '@engine/core/数学.ts';
import { png } from '@engine/model/贴图.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { definePicture, useSeg } from '@engine/段/段画面.tsx';
import { ChatOverlay } from '@库/界面/聊天栏.tsx';
import { DeathScreen, deathButtonDelayTicks, deathButtonAt, uiSize, type DeathButtonState } from '@库/界面/死亡界面.tsx';
import { deathPoof, VanillaParticles } from '@库/特效/原版粒子.tsx';
import { GirlYaBoLun } from '../../角色/娘化亚波伦.tsx';
import { ReactingSteve } from '../../角色/反应史蒂夫.tsx';
import { steveDrops, steveDropCount, DeathDrop, deathDropTrack } from '../../角色/史蒂夫掉落.tsx';
import { yaBoLunName, yaBoLunTitle, BattleUi, deathMessageLine } from '../../界面/战斗界面.tsx';
import { WandTipWheel } from '../../界面/杖尖轮盘.tsx';
import { RestRitualPerformance } from '../../特效/安息仪式.tsx';
import { summonPlans } from '../../特效/安息仪式时序.ts';
import { altar } from '../../场/1-台地/布局.ts';
import { pickShot, TerraceCanvas, aspect, followShot, type Shot } from '../../场/1-台地/台地场.tsx';
import timeline from '../../场/1-台地/时间线.ts';
import { cellsPerPixel, wheelPlace } from '../../场/1-台地/编排-开盘.ts';
import { steveStateAt } from '../../场/1-台地/编排-齐放.ts';
import { yaBoLunPos, cursorMove, cursorAt, steveFoot, actStart, actDur, dropSeed, deathMsgTemplate, afterDeathSec, inGameUi, perform, landSec, wheelParams } from '../../场/1-台地/编排-击败.ts';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import widgetsPng from 'asset:贴图/法术/minecraft/gui/widgets';

const addVec = (a: readonly number[], b: readonly number[], k = 1): V3 => [a[0]! + b[0]! * k, a[1]! + b[1]! * k, a[2]! + b[2]! * k];
const atHeight = (z: number): V3 => [0, 0, z];
const S = steveFoot;
const uiScale = 2;
/** 死亡消息：凶手是她的显示名（名字 + 称号，同血条） */
const deathMsg = { template: deathMsgTemplate, killer: `${yaBoLunName} ${yaBoLunTitle}` };
const deathText = deathMsgTemplate.replace('%1$s', 'Steve').replace('%2$s', deathMsg.killer);
/** 水平单位向量 a → b */
const dirBetween = (a: readonly number[], b: readonly number[]): V3 => {
  const [x, y] = [b[0]! - a[0]!, b[1]! - a[1]!];
  const vecLength = Math.hypot(x, y) || 1;
  return [x / vecLength, y / vecLength, 0];
};

const shotTable: Shot[] = [
  // 七版 5-03，一个数不改（用户 11-11「不改」）：镜头在她左前方（杖在右手，从右边拍杖头会挡脸），开头比她低一点、离得远些把盘框进来；
  // 她俯冲 0.25 秒落地，镜头每 0.1 秒一个关键跟着往下（高度晚她 0.06 秒，看得出在落），一路推近；落地后跟着她滑停，最后略往下看她低头看的那堆东西。
  {
    名: '5-03',
    起: 0,
    cameraRig: followShot(
      actDur,
      (s, k) => {
        const t = actStart + s;
        const yaBoLun = yaBoLunPos(t);
        const lagPos = yaBoLunPos(t - 0.06);
        const forward = dirBetween(yaBoLun, S);
        const leftDir: V3 = [-forward[1], forward[0], 0];
        const landTime = landSec - actStart;
        const nearProgress = Math.min(1, s / landTime);
        const mixT = Math.max(0, Math.min(1, (s - landTime) / 0.8));
        const eyeHeight = mix(mix(0.3, 0.9, nearProgress), 1.6, mixT);
        return {
          pos: addVec(addVec(addVec([yaBoLun[0], yaBoLun[1], lagPos[2]], forward, mix(mix(3.4, 3.0, nearProgress), 3.8, mixT)), leftDir, mix(mix(4.2, 2.6, nearProgress), 2.9, mixT)), atHeight(eyeHeight)),
          tgt: addVec(addVec(yaBoLun, forward, mix(0, 0.4, mixT)), atHeight(mix(1.7, 1.25, mixT))),
          lens: mix(20, 22, k),
        };
      },
      0.1,
    ),
  },
];

export default definePicture(seg, soundUrl, () => {
  const { 秒: sec, 段: thisSegment } = useSeg(seg);
  const t = actStart + sec;
  const yaBoLun = perform.在(t);
  const params = wheelParams(t);
  const sinceDeath = afterDeathSec(t);
  const trajectory = useMemo(() => deathDropTrack(S, steveDropCount, dropSeed), []);
  const whiteSmoke = useMemo(() => deathPoof(S, 0.6, 1.8, 0, 5), []);
  const { cameraRig } = pickShot(shotTable, sec, thisSegment.秒);
  // 死亡界面：他一死就打开，20 刻后按钮才能按；光标在「重生」上是指着，点下去以后不能按
  const uiDims = uiSize(aspect.宽, aspect.高, uiScale);
  const cursor = cursorAt(sec);
  const respawnButtonState: DeathButtonState = sec * 20 < deathButtonDelayTicks || sec >= cursorMove.点 ? '不能按' : deathButtonAt(0, cursor[0], cursor[1], uiDims.宽, uiDims.高) ? '指着' : '平常';
  const titleButtonState: DeathButtonState = sec * 20 < deathButtonDelayTicks ? '不能按' : deathButtonAt(1, cursor[0], cursor[1], uiDims.宽, uiDims.高) ? '指着' : '平常';
  // 死亡消息和死亡界面同一刻出（原版死的那一刻发系统消息）
  const chatLines = inGameUi ? [deathMessageLine(0, deathMsg)] : [];
  // 他：死了不再挣，倒下 1 秒后人没了（反应史蒂夫 照 死后秒 自己藏）
  const steveState = { ...steveStateAt(t), struggle: 0 };
  return (
    <TerraceCanvas
      ritualStructure
      cameraRig={cameraRig}
      ui={
        <>
          <BattleUi 宽={aspect.宽} 高={aspect.高} s={uiScale} healthBar={{ healthRatio: 1 }}>
            {chatLines.length > 0 && <ChatOverlay lines={chatLines} 刻={sec * 20} s={uiScale} />}
          </BattleUi>
          {inGameUi && <DeathScreen 宽={aspect.宽} 高={aspect.高} s={uiScale} buttonImg={png(widgetsPng)} deathCause={deathText} respawnButtonState={respawnButtonState} titleButtonState={titleButtonState} cursor={cursor} />}
        </>
      }
    >
      {/* 仪式做完后留在台地上的结构和四角灵魂火，同第 2 幕；仪式的钟走编排的钟，同第 4 幕 */}
      <group position={altar}>
        <RestRitualPerformance 秒={t + timeline.事件.yaBoLunAppears.秒 - timeline.事件.placeRing.秒} plan={summonPlans.短} />
      </group>
      <GirlYaBoLun {...yaBoLun.props} holdWand />
      {params && <WandTipWheel 杖={perform.杖(t)} {...wheelPlace} params={params} cellsPerPixel={cellsPerPixel} />}
      <ReactingSteve 状态={steveState} />
      <DeathDrop trajectory={trajectory} drops={steveDrops(sinceDeath)} 秒={sinceDeath} />
      <VanillaParticles spawns={whiteSmoke} 秒={sinceDeath} />
    </TerraceCanvas>
  );
});
