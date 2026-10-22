// 黄叛弓前的鼓风机虚影和它吹出的风道（6-4-3a 风矢同款：模型/物品/鼓风机.tsx 的 EncasedFan ghost、模型/特效/气流.tsx 的 散花风道），第 1 场、第 3 场共用。
// 每支箭一个：位置、朝向、显隐由各场的戏给（7-1/戏/黄叛.ts 的 fansAt、7-3/戏.ts 的 fansAt），风开多大（转速、快放）跟着那一箭。
import React from 'react';
import * as THREE from 'three';
import type { V3 } from '@engine/model/parts.tsx';
import { EncasedFan } from '@库/物品/鼓风机.tsx';
import { 散花风道, AirFlowQuads, ductLength } from '@库/特效/气流.tsx';

export type 弓前风扇 = {
  显: number; // 0～1
  dir: V3; // 风向（= 箭的方向）
  心: V3;
  口: V3; // 出风口
  边长: number;
  转起: number; // 开始转的场时刻
  风停: number; // 不再出新风的场时刻
  转速: number; // rpm（风道长度照 ductLength 按边长缩）
  快放: number;
  种子: number;
};
const fanQuat = (d: V3) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(d[0], d[1], d[2]));

export const BowFans: React.FC<{ t: number; fans: 弓前风扇[] }> = ({ t, fans }) => {
  const airflow = fans.flatMap((fan) =>
    散花风道({
      种子: fan.种子,
      时刻: t,
      边长: fan.边长,
      风口: fan.口,
      方向: fan.dir,
      转速: fan.转速,
      最大距离: ductLength(fan.转速) * fan.边长,
      快放: fan.快放,
      出生距离: [0, 0.5 * fan.边长],
      起: fan.转起 + 0.05,
      止: fan.风停,
    }),
  );
  return (
    <>
      {fans.map((fan) => (
        <group key={fan.种子} position={fan.心} quaternion={fanQuat(fan.dir)} scale={fan.边长}>
          <EncasedFan spin={(t - fan.转起) * 24 * 30 * (fan.转速 / 256)} thickBlades ghost opacity={0.55 * fan.显} />
        </group>
      ))}
      {airflow.length > 0 && <AirFlowQuads items={airflow} />}
    </>
  );
};
