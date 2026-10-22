// 6-1-8 极光宫殿这一处在一镜到底里要画的东西：宫殿（撞开的洞藏掉）、冰雪女王、冰盾、碎块、冰碴、白烟（按 编排.ts，物理时间 t）。
import React from 'react';
import * as THREE from 'three';
import { png } from '@engine/model/贴图.ts';
import { IceShieldBlock, SnowQueen } from '@库/生物/冰雪女王.tsx';
import { AuroraPalace, AuroraPalace_ATLAS } from '../../../地点/极光宫殿.tsx';
import { LandmarkPlacement, landmarkHideOutsideCore } from '../../../地点/暮色新世界.tsx';
import { BlockDebris, type DebrisData, debrisNearHide } from '@库/特效/方块飞溅.tsx';
import { IceShards } from '../../../特效/冰墙碎裂.tsx';
import { PoofBurst, DeathTopple } from '@库/特效/生物死亡.tsx';
import debrisRaw from 'asset:碎块/镜头/6-1-8/碎块';
import * as choreo from './编排.ts';

const DEBRIS = debrisRaw as unknown as DebrisData;
const ATLAS = png(AuroraPalace_ATLAS);

// 镜头：世界坐标的镜头位置，飞散的碎块离镜头太近就淡出（模型/特效/方块飞溅.tsx 的 近隐）
export const SnowQueenScene: React.FC<{ t: number; camPos?: number[] }> = ({ t, camPos: camPos }) => {
  const show = t > choreo.出场.起 && t < choreo.出场.止;
  const queen = choreo.queen(t);
  const camLocal = camPos && choreo.宫殿框.toLocal(camPos);
  // 撞飞的冰盾离镜头太近就淡出（同碎块的 近隐）：7 块冰盾都从北墙撞开的洞里飞出去（编排.ts 的 冰盾运动），镜头紧跟着扫帚从同一个洞钻出去，
  // 第 799～802 帧一块冰盾贴到镜头前一两米，占掉半个画面
  const shieldFade = (pos: number[]) => {
    if (!camLocal) return 1;
    const dist = Math.hypot(pos[0] - camLocal[0], pos[1] - camLocal[1], pos[2] - camLocal[2]) - 0.87;
    const fade = Math.min(1, Math.max(0, (dist - debrisNearHide.近) / (debrisNearHide.远 + 0.8 - debrisNearHide.近)));
    return fade * fade * (3 - 2 * fade);
  };
  // 宫殿只画核心（宫殿本体，暮色新世界.tsx 极光宫殿那一行），外面的冰川是新世界的：核心外按方块藏（hideBlocks），核心边上补侧面
  return (
    <LandmarkPlacement 名="极光宫殿">
      <AuroraPalace hide={choreo.hideFor(t)} hideBlocks={landmarkHideOutsideCore.极光宫殿} />
      {show && (
        <>
          {queen.alive && (
            <group position={queen.pos}>
              <DeathTopple 向={choreo.击退向} u={queen.倒} knockbackOffset={queen.knockbackOffset}>
                <SnowQueen sec={choreo.QUEEN_CLOCK0 + t} hurt={queen.受伤} opacity={queen.opacity} />
              </DeathTopple>
            </group>
          )}
          {choreo.shields(t).map((sh, i) => (
            <IceShieldBlock key={i} p={sh.p} q={new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...sh.axis).normalize(), sh.angle)} opacity={t > 0 ? shieldFade(sh.p) : 1} />
          ))}
          <PoofBurst center={choreo.DEATH_POS} width={0.7} height={2.4} sec={(t - choreo.T_DEATH) * choreo.白烟倍速} seed={9} />
          <BlockDebris data={DEBRIS} atlas={ATLAS} bursts={choreo.debrisBursts(t)} nearHide={camLocal && { 镜头: camLocal, ...debrisNearHide }} />
          {choreo.iceShards(t).map((s, i) => (
            <IceShards key={i} sec={s.sec} origin={s.origin} dir={s.dir} seed={s.seed} count={s.count} speed={s.speed} />
          ))}
        </>
      )}
    </LandmarkPlacement>
  );
};
