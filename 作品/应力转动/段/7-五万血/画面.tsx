// 7-2-1 五万血：画面（../7-2/画面.tsx；远景只画到镜 Jade 为止，镜 3 背对场子拍不到；镜 Jade 是他的主观，不画他）+ 风矢的伤害数字 + 镜 Jade 的界面层。编排见 编排.ts。
// 声音照 段.ts 的 cue 和 声音地址.生成.ts（anim cues 生成）同一遍出（cue 照基线声音清单转写：本场音效这一段一声也没有，第 1 场的远处声音只留听得见的监守者触角；两句台词）。
// 界面层：Jade 信息框在屏幕顶边正中（模型/界面/Jade.tsx），引线从监守者胸口（投到画面上）竖直往上连到框的下沿。
import React from 'react';
import * as THREE from 'three';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { definePicture } from '@engine/段/段画面.tsx';
import { useCurrentSec } from '@engine/段/时间.tsx';
import { DamageNumberLayer, makePerspectiveCamera } from '@库/界面/伤害数字.tsx';
import { windArrowHit } from '../../场/7-黑暗监守/7-1-5/伤害数字层.tsx';
import { followArrowHits } from '../../场/7-黑暗监守/7-1-7/伤害数字层.tsx';
import { JadeLeaderLine, JadeTooltip, jadeBoxHeight, jadeLineScalePerWidth, jadeScalePerWidth } from '@库/界面/Jade.tsx';
import { mouthAt } from '../../配音/口型.ts';
import { ScenePicture } from '../../场/7-李樱撤离/7-2/画面.tsx';
import * as choreo from './编排.ts';
import seg from './段.ts';
import soundUrl from './声音地址.生成.ts';
import { sceneToThree } from '@engine/core/three换算.ts';

// 场景坐标 (x, y, z) Z 朝上 → three.js (x, z, -y)，同 6-4-1/古城画面.tsx
// 风矢打中它冒出的伤害数字（汇流来世，定在世界里），和 7-1-5、7-1-7 同样的数、同样的位置；只在看得到场子的镜头里画
const hitsSeen = [{ T: windArrowHit.t, damage: windArrowHit.damage, crit: windArrowHit.crit, anchor: windArrowHit.anchor }, ...followArrowHits];
const DamageLayer: React.FC<{ sec: number }> = ({ sec }) => {
  const { width, height } = useVideoConfig();
  if (sec >= choreo.jadeShotEnd) return null;
  const t = choreo.wideTime(sec);
  const cam = choreo.camera(sec);
  const camera = makePerspectiveCamera(cam.lens, sceneToThree(cam.pos), sceneToThree(cam.tgt), width, height);
  return <DamageNumberLayer camera={camera} width={width} height={height} numbers={hitsSeen.map((h) => ({ damage: h.damage, crit: h.crit, anchor: h.anchor, ticks: (t - h.T) * 20 }))} />;
};

const JadeLayer: React.FC<{ sec: number }> = ({ sec }) => {
  const { width, height } = useVideoConfig();
  const ui = choreo.jade(sec);
  if (!ui) return null;
  const cam = choreo.camera(sec);
  const ndc = sceneToThree(ui.points).project(makePerspectiveCamera(cam.lens, sceneToThree(cam.pos), sceneToThree(cam.tgt), width, height));
  const from: [number, number] = [((ndc.x + 1) / 2) * width, ((1 - ndc.y) / 2) * height];
  const s = jadeScalePerWidth * width;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <JadeLeaderLine from={from} toY={jadeBoxHeight * s} s={jadeLineScalePerWidth * width} progress={ui.lineScale} />
      <JadeTooltip entity={{ name: '监守者', health: choreo.wardenHealthAt(sec).now, maxHealth: choreo.wardenHealthAt(sec).max, mod: 'Minecraft' }} s={s} cx={width / 2} visibility={ui.box} />
    </AbsoluteFill>
  );
};

export const FiftyKHp: React.FC = () => {
  const sec = useCurrentSec();
  return (
    <>
      <ScenePicture s={choreo.sceneSec(sec)} cam={choreo.camera(sec)} wideShot={sec < choreo.jadeShotEnd} pov={sec < choreo.jadeShotEnd} mouth={mouthAt(choreo.mouthCues, '李樱', sec, 1)} />
      <DamageLayer sec={sec} />
      <JadeLayer sec={sec} />
    </>
  );
};
export default definePicture(seg, soundUrl, FiftyKHp);
