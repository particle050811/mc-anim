// 7-2-1 五万血的 Composition：画面（../7-2/画面.tsx；远景只画到镜 Jade 为止，镜 3 背对场子拍不到；镜 Jade 是他的主观，不画他）+ 风矢的伤害数字 + 镜 Jade 的界面层 + 声音。编排见 编排.ts。
// 界面层：Jade 信息框在屏幕顶边正中（模型/界面/Jade.tsx），引线从监守者胸口（投到画面上）竖直往上连到框的下沿。
import React from 'react';
import * as THREE from 'three';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { DamageNumberLayer, makePerspectiveCamera } from '../../../world/界面/伤害数字.tsx';
import { windArrowHit } from '../../场/7-黑暗监守/7-1-5/伤害数字层.tsx';
import { followArrowHits } from '../../场/7-黑暗监守/7-1-7/伤害数字层.tsx';
import { JadeLeaderLine, JadeTooltip, jadeBoxHeight, jadeLineScalePerWidth, jadeScalePerWidth } from '../../../world/界面/Jade.tsx';
import { mouthAt } from '../../../world/配音/口型.ts';
import { ScenePicture } from '../../场/7-李樱撤离/7-2/画面.tsx';
import * as choreo from './编排.ts';
import { FiftyKHpSound } from './声音.tsx';

export const fiftyKHpFrameCount = choreo.帧数;

// 场景坐标 (x, y, z) Z 朝上 → three.js (x, z, -y)，同 6-4-1/古城画面.tsx
const toThree = ([x, y, z]: number[]) => new THREE.Vector3(x, z, -y);

// 风矢打中它冒出的伤害数字（汇流来世，定在世界里），和 7-1-5、7-1-7 同样的数、同样的位置；只在看得到场子的镜头里画
const hitsSeen = [{ T: windArrowHit.t, damage: windArrowHit.damage, crit: windArrowHit.crit, anchor: windArrowHit.anchor }, ...followArrowHits];
const DamageLayer: React.FC<{ frame: number }> = ({ frame }) => {
  const { width, height } = useVideoConfig();
  if (frame >= choreo.镜Jade止) return null;
  const t = choreo.远景t(frame);
  const cam = choreo.camera(frame);
  const camera = makePerspectiveCamera(cam.lens, toThree(cam.pos), toThree(cam.tgt), width, height);
  return <DamageNumberLayer camera={camera} width={width} height={height} numbers={hitsSeen.map((h) => ({ damage: h.damage, crit: h.crit, anchor: h.anchor, ticks: (t - h.T) * 20 }))} />;
};

const JadeLayer: React.FC<{ frame: number }> = ({ frame }) => {
  const { width, height } = useVideoConfig();
  const ui = choreo.jade(frame);
  if (!ui) return null;
  const cam = choreo.camera(frame);
  const ndc = toThree(ui.点).project(makePerspectiveCamera(cam.lens, toThree(cam.pos), toThree(cam.tgt), width, height));
  const from: [number, number] = [((ndc.x + 1) / 2) * width, ((1 - ndc.y) / 2) * height];
  const s = jadeScalePerWidth * width;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <JadeLeaderLine from={from} toY={jadeBoxHeight * s} s={jadeLineScalePerWidth * width} progress={ui.线} />
      <JadeTooltip entity={{ name: '监守者', health: choreo.监守者血(frame).now, maxHealth: choreo.监守者血(frame).max, mod: 'Minecraft' }} s={s} cx={width / 2} visibility={ui.框} />
    </AbsoluteFill>
  );
};

export const FiftyKHp: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      <ScenePicture sf={choreo.sf(frame)} cam={choreo.camera(frame)} wideShot={frame < choreo.镜Jade止} pov={frame < choreo.镜Jade止} 嘴={mouthAt(choreo.台词, '李樱', frame, choreo.FPS)} />
      <DamageLayer frame={frame} />
      <JadeLayer frame={frame} />
      <FiftyKHpSound />
    </>
  );
};
export default FiftyKHp;
