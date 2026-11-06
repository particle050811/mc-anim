// 7-2-1 五万血：原生段（段.ts 写了 时钟: '秒'）。画面（../7-2/画面.tsx；远景只画到镜 Jade 为止，镜 3 背对场子拍不到；镜 Jade 是他的主观，不画他）+ 风矢的伤害数字 + 镜 Jade 的界面层。编排见 编排.ts。
// 声音照 段.ts 的 cue 和 声音地址.生成.ts（anim cues 生成）同一遍出（cue 照基线声音清单转写：本场音效这一段一声也没有，第 1 场的远处声音只留听得见的监守者触角；两句台词）。
// 界面层：Jade 信息框在屏幕顶边正中（模型/界面/Jade.tsx），引线从监守者胸口（投到画面上）竖直往上连到框的下沿。
import React from 'react';
import * as THREE from 'three';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { 定义画面 } from '@engine/段/段画面.tsx';
import { use当前秒 } from '@engine/段/时间.tsx';
import { DamageNumberLayer, makePerspectiveCamera } from '@库/界面/伤害数字.tsx';
import { windArrowHit } from '../../场/7-黑暗监守/7-1-5/伤害数字层.tsx';
import { followArrowHits } from '../../场/7-黑暗监守/7-1-7/伤害数字层.tsx';
import { JadeLeaderLine, JadeTooltip, jadeBoxHeight, jadeLineScalePerWidth, jadeScalePerWidth } from '@库/界面/Jade.tsx';
import { mouthAt } from '../../配音/口型.ts';
import { ScenePicture } from '../../场/7-李樱撤离/7-2/画面.tsx';
import * as choreo from './编排.ts';
import 段 from './段.ts';
import 声音地址 from './声音地址.生成.ts';

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
  const frame = use当前秒() * choreo.FPS;
  return (
    <>
      <ScenePicture sf={choreo.sf(frame)} cam={choreo.camera(frame)} wideShot={frame < choreo.镜Jade止} pov={frame < choreo.镜Jade止} 嘴={mouthAt(choreo.台词, '李樱', frame, choreo.FPS)} />
      <DamageLayer frame={frame} />
      <JadeLayer frame={frame} />
    </>
  );
};
export default 定义画面(段, 声音地址, FiftyKHp);
