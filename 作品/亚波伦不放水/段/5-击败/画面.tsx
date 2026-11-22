import React, { useMemo } from 'react';
import { png } from '@engine/model/贴图.ts';
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
import { TerraceCanvas, aspect } from '../../场/1-台地/台地场.tsx';
import timeline from '../../场/1-台地/时间线.ts';
import { totemSec } from '../../场/1-台地/编排-齐放.ts';
import { steveFoot, deathMsgTemplate, afterDeathSec, defeatedSteveAt, inGameUi, performAt } from '../../场/1-台地/编排-击败.ts';
import { cursorMove, cursorAt, actStart, dropSeed } from '../../场/1-台地/击败拍.ts';
import seg from './段.ts';
import { actFiveShotAt } from './机位.ts';
import soundUrl from './声音地址.生成.ts';
import { cageTailAt, remainingVolley, tailSceneCtx } from './余术.ts';
import widgetsPng from 'asset:贴图/法术/minecraft/gui/widgets';

const S = steveFoot;
const totemTable = totemParticleTable(S, 1, { ground: S[2] });
/** 死亡消息：凶手是她的显示名（名字 + 称号，同血条） */
const deathMsg = { template: deathMsgTemplate, killer: `${yaBoLunName} ${yaBoLunTitle}` };
const deathText = deathMsgTemplate.replace('%1$s', 'Steve').replace('%2$s', deathMsg.killer);

export default definePicture(seg, soundUrl, () => {
  const { sec: sec } = useSeg(seg);
  const t = actStart + sec;
  const yaBoLun = performAt(t);
  const sinceDeath = afterDeathSec(t);
  const volley = useMemo(remainingVolley, []);
  const cage = cageTailAt(t);
  const trajectory = useMemo(() => deathDropTrack(S, steveDropCount, dropSeed), []);
  const whiteSmoke = useMemo(() => deathPoof(S, 0.6, 1.8, 0, 5), []);
  const { shot, shotSec, cameraRig } = actFiveShotAt(sec);
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
        <RestRitualPerformance sec={t + timeline.events.yaBoLunAppears.sec - timeline.events.placeRing.sec} plan={summonPlans.短} />
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
