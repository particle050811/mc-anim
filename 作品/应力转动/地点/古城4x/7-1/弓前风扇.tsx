// 黄叛弓前的鼓风机虚影和它吹出的风道（6-4-3a 风矢同款：模型/物品/鼓风机.tsx 的 EncasedFan ghost、模型/特效/气流.tsx 的 散花风道），第 1 场、第 3 场共用。
// 每支箭一个：位置、朝向、显隐由各场的戏给（7-1/戏/黄叛.ts 的 fansAt、7-3/戏.ts 的 fansAt），风开多大（转速、快放）跟着那一箭。
import React from 'react';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { EncasedFan } from '@库/物品/鼓风机.tsx';
import { scatterDuct, AirFlowQuads, ductLength } from '@库/特效/气流.tsx';

export type BowWindFan = {
  visibility: number; // 0～1
  dir: V3; // 风向（= 箭的方向）
  心: V3;
  mouth: V3; // 出风口
  sideLength: number;
  spinStart: number; // 开始转的场时刻
  windStop: number; // 不再出新风的场时刻
  rotSpeedRpm: number; // rpm（风道长度照 ductLength 按边长缩）
  fastForward: number;
  种子: number;
};
const fanQuat = (d: V3) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(d[0], d[1], d[2]));

export const BowFans: React.FC<{ t: number; fans: BowWindFan[] }> = ({ t, fans }) => {
  const airflow = fans.flatMap((fan) =>
    scatterDuct({
      种子: fan.种子,
      storyTime: t,
      sideLength: fan.sideLength,
      outlet: fan.mouth,
      windDir: fan.dir,
      rotSpeedRpm: fan.rotSpeedRpm,
      maxDist: ductLength(fan.rotSpeedRpm) * fan.sideLength,
      fastForward: fan.fastForward,
      spawnDist: [0, 0.5 * fan.sideLength],
      起: fan.spinStart + 0.05,
      止: fan.windStop,
    }),
  );
  return (
    <>
      {fans.map((fan) => (
        <group key={fan.种子} position={fan.心} quaternion={fanQuat(fan.dir)} scale={fan.sideLength}>
          <EncasedFan spin={(t - fan.spinStart) * 24 * 30 * (fan.rotSpeedRpm / 256)} thickBlades ghost opacity={0.55 * fan.visibility} />
        </group>
      ))}
      {airflow.length > 0 && <AirFlowQuads items={airflow} />}
    </>
  );
};
