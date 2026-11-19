import React from 'react';
import { useCurrentSec } from '@engine/段/时间.tsx';
import { smoothstep01 } from '@engine/core/数学.ts';
import { GirlYaBoLun } from '../../角色/娘化亚波伦.tsx';
import { withCastingHem } from '../../角色/空中施法袍摆.ts';
import { ReactingSteve } from '../../角色/反应史蒂夫.tsx';
import { YaBoLunHealthBar } from '../../界面/战斗界面.tsx';
import { WandTipWheel } from '../../界面/杖尖轮盘.tsx';
import { staffTipPlatePose } from '../../界面/杖尖盘位姿.ts';
import { RestRitualPerformance } from '../../特效/安息仪式.tsx';
import { summonPlans } from '../../特效/安息仪式时序.ts';
import { altar } from '../../场/1-台地/布局.ts';
import { actDur, beats, toWorldSec } from '../../场/1-台地/开盘拍.ts';
import { orbitRig, releaseRig } from '../../场/1-台地/绕拍.ts';
import { actStart, act2WheelParams, perform, wheelPlace, cellsPerPixel, steveStateAt } from '../../场/1-台地/编排-开盘.ts';
import { wheelParams, secAt, perform as releasePerformance } from '../../场/1-台地/编排-齐放.ts';
import { TerraceCanvas, aspect } from '../../场/1-台地/台地场.tsx';
import timeline from '../../场/1-台地/时间线.ts';
import { chestToDiscPx, replayStartSec, reviewCamera, turnSample } from './选角.ts';

export default function CastTurnReview() {
  const sec = useCurrentSec();
  const { beforePeakSec, orbitOffsetDeg } = turnSample(sec);
  const clipSec = actDur - beforePeakSec;
  const worldSec = beforePeakSec === 0 ? beats.endSec : toWorldSec(clipSec);
  const atPeak = beforePeakSec === 0;
  const time = atPeak ? secAt(0) : actStart + worldSec;
  const performance = atPeak ? releasePerformance : perform;
  const actor = performance.在(time).props;
  const staff = performance.杖(time);
  const wheel = atPeak ? wheelParams(time) : act2WheelParams(time);
  const { rig, measuredDeg } = reviewCamera(atPeak ? releaseRig(0) : orbitRig(clipSec), actor.pose.loc, orbitOffsetDeg);
  const gapPx = chestToDiscPx(rig, actor.pose.loc, staffTipPlatePose(staff, wheelPlace).心, aspect);
  return (
    <TerraceCanvas ritualStructure cameraRig={rig} ui={<>
      <YaBoLunHealthBar width={aspect.width} s={2} healthRatio={1} />
      <div style={{ position: 'absolute', top: 22, right: 24, width: 186, padding: '12px 16px 11px', boxSizing: 'border-box', border: '1px solid #9f8575', borderRadius: 8, background: 'rgba(24,18,25,.91)', color: '#fff4e0', fontFamily: 'sans-serif' }}>
        <div style={{ fontSize: 15, color: '#edcfb2' }}>机位偏角 · {sec >= replayStartSec ? '原速试演' : atPeak ? '同帧选角' : '原片机位'}</div>
        <div style={{ font: 'bold 39px monospace', lineHeight: 1.18, fontVariantNumeric: 'tabular-nums' }}>{measuredDeg.toFixed(1)}°</div>
        <div style={{ fontSize: 15, color: '#ece2d8', fontVariantNumeric: 'tabular-nums' }}>胸口 ↔ 盘心　{Math.round(gapPx)} px</div>
        <div style={{ height: 3, marginTop: 5, background: '#57484a' }}><div style={{ height: '100%', width: `${100 * Math.abs(measuredDeg) / 30}%`, background: '#f5bb71' }} /></div>
      </div>
    </>}>
      <group position={altar}><RestRitualPerformance sec={timeline.events.summonDone.sec - timeline.events.placeMedal.sec + worldSec} plan={summonPlans.短} /></group>
      <GirlYaBoLun {...actor} bonePose={withCastingHem(actor)} holdWand />
      {wheel && <>
        {beforePeakSec > 0 && <pointLight position={staff.tip} color="#ffdfc2" intensity={6 * smoothstep01(wheel.刻 / 5) * smoothstep01((beats.endSec - worldSec) / 0.18)} distance={3.5} decay={2} />}
        <WandTipWheel 杖={staff} {...wheelPlace} params={wheel} cellsPerPixel={cellsPerPixel} />
      </>}
      <ReactingSteve state={steveStateAt(time, worldSec)} />
    </TerraceCanvas>
  );
}
