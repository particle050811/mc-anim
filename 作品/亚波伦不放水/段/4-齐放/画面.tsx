// 第 4 幕（轰炸）的画面：编排在 场/1-台地/编排-齐放.ts，这里摆镜头和界面（血条；用户 11-10 定不出法术名签和计数）。
// 两镜，按戏剪不按时间拍（用户 11-11「这个画面未必要按时间推进」）：
//   侧：侧面全景，她在左、他在右，她按住不放地连放、往后下方一冲，弹一串串飞过去、结界飞到他身上罩严；
//   第一人称一直到他死（用户 11-11「第一人称镜头直到死亡，一镜到底不就好了，加个侧写镜头干嘛？」，八版后面那一镜「挨炸」删了）：
//     他的眼睛（原版视角 70 度、右手断曜流光、原版 bobHurt 的受伤晃动），法术一发发朝镜头砸过来，她从画面一侧横着冲到另一侧；
//     索命劈中时晋升之环照原版不死图腾的样子从屏幕中间翻出来（库/界面/物品激活.tsx），身上冒金绿的图腾粒子；
//     他转向一块空地，闪电抢先劈在落脚处；回头看见卫射，屈膝，切第 5 幕侧拍倒下。
// 镜头照用户 11-10 说的：每个镜头里都有人在做动作，机位跟着动作走，1～3 秒一切。台地上留着仪式结构（祭坛、四角灵魂火），同第 2 幕。
// 机位、第一人称里的手和图腾都是 Agent 摆的，用户没看过。没做：猩红雨、伤害数字、第一人称的物品栏和血条（全片第一人称都没画 HUD，只留 boss 血条）。声音在 段.ts。
import React from 'react';
import * as THREE from 'three';
import { AbsoluteFill } from 'remotion';
import { rad } from '@engine/core/数学.ts';
import { png } from '@engine/model/贴图.ts';
import { definePicture, useSeg } from '@engine/段/段画面.tsx';
import { FirstPersonCanvas, FirstPersonHand, viewAngles } from '@库/角色/第一人称.tsx';
import { ItemActivate } from '@库/界面/物品激活.tsx';
import { GirlYaBoLun } from '../../角色/娘化亚波伦.tsx';
import { withCastingHem } from '../../角色/空中施法袍摆.ts';
import { ReactingSteve } from '../../角色/反应史蒂夫.tsx';
import { ascensionHaloIcon } from '../../角色/史蒂夫掉落.tsx';
import { BattleUi, guiScale } from '../../界面/战斗界面.tsx';
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
import { TerraceCanvas, aspect } from '../../场/1-台地/台地场.tsx';
import timeline from '../../场/1-台地/时间线.ts';
import { cellsPerPixel, wheelPlace } from '../../场/1-台地/编排-开盘.ts';
import { castHits, escapeMotion, hurtTilt } from '../../场/1-台地/齐放拍.ts';
import { firstPersonCast } from './受击视角.ts';
import type { Launch } from '../../场/1-台地/出手表.ts';
import { castTable, sceneCtx, steveStateAt, steveViewAt, steveFoot, totemSec, actStart, throwSec, perform, secAt, cageSetup, wheelParams } from '../../场/1-台地/编排-齐放.ts';
import seg from './段.ts';
import { hurtAxis, volleyShotAt } from './机位.ts';
import soundUrl from './声音地址.生成.ts';

const S = steveFoot;
/** 晋升之环的屏幕动画往哪一角飞（原版 random.nextFloat() × 2 − 1，这里取定）：右上 */
const ringOffset = [0.55, -0.7] as const;
const ringLayers = [{ tex: png(ascensionHaloIcon) }];
const totemTable = totemParticleTable(S, 1, { ground: S[2] });

const firstPersonTable = castTable.map((cast, index) => firstPersonCast(cast, castHits[index]));
const throwsByShot: Record<string, readonly Launch[]> = { '离杖': castTable, 侧: castTable, 第一人称: firstPersonTable };

const SceneFirstPersonHand: React.FC<{ actSec: number }> = ({ actSec }) => {
  const { step, turn, flinch, buckle } = escapeMotion(actSec);
  const { eye, look } = steveViewAt(secAt(actSec));
  const { tiltDeg, dirDeg: yawDeg } = hurtTilt(actSec);
  const handRot = new THREE.Quaternion().setFromAxisAngle(hurtAxis(yawDeg), rad(tiltDeg));
  return (
    <FirstPersonCanvas width={aspect.width} height={aspect.height} view={viewAngles(eye, look)}>
      {/* 原版 renderItemInHand 画手之前也调一遍 bobHurt：手跟着视角一起歪 */}
      <group quaternion={handRot}>
        <group rotation={[rad(-8 * step + 10 * flinch), rad(8 * turn), rad(-7 * turn + 8 * flinch)]}>
          <FirstPersonHand held={<Valettein glintSec={actSec} />} display={valetteinDisplay[defaultAppearance].firstperson_righthand} swing={0} equip={0.24 + 0.38 * turn + 0.18 * step + 0.36 * buckle} />
        </group>
      </group>
    </FirstPersonCanvas>
  );
};

export default definePicture(seg, soundUrl, () => {
  const { sec: sec } = useSeg(seg);
  const t = actStart + sec;
  const yaBoLunState = perform.在(t);
  const wheel = wheelParams(t);
  const { shot, cameraRig } = volleyShotAt(sec);
  const isFirstPerson = shot.name === '第一人称';
  return (
    <TerraceCanvas
      ritualStructure
      cameraRig={cameraRig}
      ui={
        <>
          {isFirstPerson && (
            <AbsoluteFill>
              <SceneFirstPersonHand actSec={sec} />
              <ItemActivate width={aspect.width} height={aspect.height} s={guiScale} sec={t - totemSec} offset={ringOffset} items={ringLayers} />
            </AbsoluteFill>
          )}
          <BattleUi width={aspect.width} height={aspect.height} s={guiScale} healthBar={{ healthRatio: 1 }} />
        </>
      }
    >
      <nearFadeContext.Provider value={isFirstPerson ? [1.5, 3.5] : [1, 3]}>
        {/* 仪式做完后留在台地上的结构和四角灵魂火，同第 2 幕；仪式的钟走编排的钟（第 2 幕慢放过，比片秒慢），火和第 2 幕末接上 */}
        <group position={altar}>
          <RestRitualPerformance sec={t + timeline.events.yaBoLunAppears.sec - timeline.events.placeRing.sec} plan={summonPlans.短} />
        </group>
        <GirlYaBoLun {...yaBoLunState.props} bonePose={withCastingHem(yaBoLunState.props)} holdWand />
        {wheel && <WandTipWheel 杖={perform.杖(t)} {...wheelPlace} params={wheel} cellsPerPixel={cellsPerPixel} />}
        <RevelationCagePerformance sec={t - throwSec} settings={cageSetup} />
        <CastLaunches 表={throwsByShot[shot.name]!} sec={t} sceneCtx={sceneCtx} />
        <TotemParticles 表={totemTable} sec={t - totemSec} />
        {/* 第一人称镜头就在他眼睛里，不画他自己 */}
        {!isFirstPerson && <ReactingSteve state={steveStateAt(t)} />}
      </nearFadeContext.Provider>
    </TerraceCanvas>
  );
});
