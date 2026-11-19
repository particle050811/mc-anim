import React, { useMemo } from 'react';
import { rigSpline, type Cam, type SplineKey } from '@engine/core/机位.ts';
import { lerp, lerpV } from '@engine/core/数学.ts';
import { png } from '@engine/model/贴图.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { definePicture, useSeg } from '@engine/段/段画面.tsx';
import { DeathScreen, deathButtonDelayTicks, deathButtonAt, uiSize, type DeathButtonState } from '@库/界面/死亡界面.tsx';
import { deathPoof, VanillaParticles } from '@库/特效/原版粒子.tsx';
import { GirlYaBoLun } from '../../角色/娘化亚波伦.tsx';
import { withCastingHem } from '../../角色/空中施法袍摆.ts';
import { ReactingSteve } from '../../角色/反应史蒂夫.tsx';
import { steveDrops, steveDropCount, DeathDrop, deathDropTrack } from '../../角色/史蒂夫掉落.tsx';
import { yaBoLunName, yaBoLunTitle, BattleUi, guiScale } from '../../界面/战斗界面.tsx';
import { RestRitualPerformance } from '../../特效/安息仪式.tsx';
import { summonPlans } from '../../特效/安息仪式时序.ts';
import { RevelationCageGlow } from '../../特效/炼狱结界辉线.tsx';
import { TotemParticles, totemParticleTable } from '../../特效/图腾粒子.tsx';
import { nearFadeContext } from '../../法术/演出/零件/面片.tsx';
import { CastLaunches } from '../../场/1-台地/出手.tsx';
import { altar } from '../../场/1-台地/布局.ts';
import { pickShot, TerraceCanvas, aspect, type Shot } from '../../场/1-台地/台地场.tsx';
import timeline from '../../场/1-台地/时间线.ts';
import { totemSec } from '../../场/1-台地/编排-齐放.ts';
import { steveEye, steveFoot, deathMsgTemplate, afterDeathSec, defeatedSteveAt, inGameUi, performAt } from '../../场/1-台地/编排-击败.ts';
import { yaBoLunPos, towardYaBoLun, dashTo, cursorMove, cursorAt, actStart, shotStart, dropSeed, landSec } from '../../场/1-台地/击败拍.ts';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { cageTailAt, remainingVolley, tailSceneCtx } from './余术.ts';
import widgetsPng from 'asset:贴图/法术/minecraft/gui/widgets';

const addVec = (a: readonly number[], b: readonly number[], k = 1): V3 => [a[0]! + b[0]! * k, a[1]! + b[1]! * k, a[2]! + b[2]! * k];
const atHeight = (z: number): V3 => [0, 0, z];
const S = steveFoot;
const totemTable = totemParticleTable(S, 1, { ground: S[2] });
/** 死亡消息：凶手是她的显示名（名字 + 称号，同血条） */
const deathMsg = { template: deathMsgTemplate, killer: `${yaBoLunName} ${yaBoLunTitle}` };
const deathText = deathMsgTemplate.replace('%1$s', 'Steve').replace('%2$s', deathMsg.killer);
/** 水平单位向量 a → b */
const dirBetween = (a: readonly number[], b: readonly number[]): V3 => {
  const [x, y] = [b[0]! - a[0]!, b[1]! - a[1]!];
  const vecLength = Math.hypot(x, y) || 1;
  return [x / vecLength, y / vecLength, 0];
};

const sideKey = (sec: number, degrees: number, radius: number, height: number, aim: number): SplineKey => {
  const angle = degrees * Math.PI / 180;
  const [east, north] = towardYaBoLun;
  const side: V3 = [east * Math.cos(angle) - north * Math.sin(angle), east * Math.sin(angle) + north * Math.cos(angle), 0];
  return [sec, {
    pos: addVec(addVec(S, side, radius), atHeight(height)),
    tgt: lerpV(addVec(S, atHeight(0.8)), addVec(dashTo, atHeight(1)), aim),
    lens: 18,
  }];
};
const sideKeys = [sideKey(0, 80, 8.6, 1.6, 0.55), sideKey(1, 84, 9.4, 2.2, 0.6), sideKey(shotStart.deathScreen, 88, 10.2, 2.8, 0.62)];
const deathCamera: Cam = {
  pos: steveEye,
  tgt: addVec(yaBoLunPos(actStart + (shotStart.deathScreen + shotStart.landing) / 2), atHeight(-0.6)),
  lens: 14.46,
  roll: -(40 - 8000 / 220),
};
const shotTable: Shot[] = [
  { name: '5-01', start: shotStart.fall, cameraRig: (_progress, shotSec) => rigSpline(sideKeys, shotSec) },
  { name: '5-02', start: shotStart.deathScreen, cameraRig: () => deathCamera },
  {
    name: '5-03',
    start: shotStart.landing,
    cameraRig: (k, s) => {
      const t = actStart + shotStart.landing + s;
      const yaBoLun = yaBoLunPos(t);
      const forward = dirBetween(yaBoLun, S);
      const leftDir: V3 = [-forward[1], forward[0], 0];
      const landTime = landSec - (actStart + shotStart.landing);
      const nearProgress = Math.min(1, s / landTime);
      const mixT = Math.max(0, Math.min(1, (s - landTime) / 0.8));
      const eyeHeight = lerp(lerp(0.3, 0.9, nearProgress), 1.6, mixT);
      return {
        pos: addVec(addVec(addVec(yaBoLun, forward, lerp(lerp(2.5, 1.9, nearProgress), 2.2, mixT)), leftDir, lerp(lerp(-4.6, -3.6, nearProgress), -4.2, mixT)), atHeight(eyeHeight)),
        tgt: addVec(addVec(yaBoLun, forward, lerp(0, 0.4, mixT)), atHeight(lerp(1.7, 1.25, mixT))),
        lens: lerp(20, 22, k),
      };
    },
  },
];
export const actFiveShotTable = shotTable;

export default definePicture(seg, soundUrl, () => {
  const { sec: sec, segment: thisSegment } = useSeg(seg);
  const t = actStart + sec;
  const yaBoLun = performAt(t);
  const sinceDeath = afterDeathSec(t);
  const volley = useMemo(remainingVolley, []);
  const cage = cageTailAt(t);
  const trajectory = useMemo(() => deathDropTrack(S, steveDropCount, dropSeed), []);
  const whiteSmoke = useMemo(() => deathPoof(S, 0.6, 1.8, 0, 5), []);
  const { shot, shotSec, cameraRig } = pickShot(shotTable, sec, thisSegment.sec);
  // 死亡界面：切进 5-02 时打开，20 刻后按钮才能按；光标在「重生」上是指着，点下去以后不能按
  const uiDims = uiSize(aspect.width, aspect.height, guiScale);
  const cursor = cursorAt(shotSec);
  const respawnButtonState: DeathButtonState = shotSec * 20 < deathButtonDelayTicks || shotSec >= cursorMove.points ? '不能按' : deathButtonAt(0, cursor[0], cursor[1], uiDims.width, uiDims.height) ? '指着' : '平常';
  const titleButtonState: DeathButtonState = shotSec * 20 < deathButtonDelayTicks ? '不能按' : deathButtonAt(1, cursor[0], cursor[1], uiDims.width, uiDims.height) ? '指着' : '平常';
  // 他：死了不再挣，倒下 1 秒后人没了（反应史蒂夫 照 死后秒 自己藏）
  const steveState = defeatedSteveAt(t);
  return (
    <TerraceCanvas
      ritualStructure
      cameraRig={cameraRig}
      ui={
        <>
          {shot.name !== '5-03' && <BattleUi width={aspect.width} height={aspect.height} s={guiScale} healthBar={{ healthRatio: 1 }} />}
          {inGameUi && shot.name === '5-02' && <DeathScreen width={aspect.width} height={aspect.height} s={guiScale} buttonImg={png(widgetsPng)} deathCause={deathText} respawnButtonState={respawnButtonState} titleButtonState={titleButtonState} cursor={cursor} />}
        </>
      }
    >
      {/* 仪式做完后留在台地上的结构和四角灵魂火，同第 2 幕；仪式的钟走编排的钟，同第 4 幕 */}
      <group position={altar}>
        <RestRitualPerformance sec={t + timeline.events.yaBoLunAppears.sec - timeline.events.placeMedal.sec} plan={summonPlans.短} />
      </group>
      <GirlYaBoLun {...yaBoLun.props} bonePose={yaBoLun.transition.从 === '指向' || yaBoLun.transition.dest === '指向' ? withCastingHem(yaBoLun.props) : yaBoLun.props.bonePose} holdWand />
      <nearFadeContext.Provider value={shot.name === '5-02' ? [1.5, 3.5] : [1, 3]}>
        <CastLaunches 表={volley} sec={t} sceneCtx={tailSceneCtx} />
      </nearFadeContext.Provider>
      {cage.opacity > 0 && <group position={cage.center}><RevelationCageGlow sec={cage.spinSec} radiusFactor={cage.radiusFactor} opacity={cage.opacity} /></group>}
      <TotemParticles 表={totemTable} sec={t - totemSec} />
      <ReactingSteve state={steveState} />
      <DeathDrop trajectory={trajectory} drops={steveDrops(sinceDeath)} sec={sinceDeath} />
      {shot.name === '5-01' && <VanillaParticles spawns={whiteSmoke} sec={sinceDeath} />}
    </TerraceCanvas>
  );
});
