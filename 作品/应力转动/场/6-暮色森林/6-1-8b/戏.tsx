// 6-1-8b 云中小屋这一处在一镜到底里要画的东西：云岛和小屋（撞开的洞藏掉）、两个巨人、碎块、白烟（按 编排.ts，物理时间 t）。
import React from 'react';
import { png } from '@engine/model/贴图.ts';
import { Giant, GIANT } from '@库/角色/巨人.tsx';
import { CloudCottage, CloudCottage_ATLAS } from '../../../地点/云中小屋.tsx';
import { BlockDebris, type DebrisData, debrisNearHide } from '@库/特效/方块飞溅.tsx';
import { PoofBurst, DeathTopple } from '@库/特效/生物死亡.tsx';
import debrisRaw from 'asset:碎块/镜头/6-1-8b/碎块';
import * as choreo from './编排.ts';

// 南北两面墙洞里靠镜头那一半（穿刺线右手边，偏东）的碎块不画：镜头在屋子东边侧着看（剖面），这一半碎块飞进屋里正好挡在扫帚和镜头之间，
// 扫帚、长矛、两个巨人被串起来全看不清（用户 2026-10-02 要求巨人这里改侧视角就是为了看清楚）。当成被撞碎、冲散了，
// 和东墙做成剖面是同一个道理；墙洞左手边的碎块照常往前偏左飞，在扫帚后面当背景。外圈（ring）照常原地画。
// 哪一半按离穿刺线的横向距离分（线斜 15°，不能再按 x 分）
const DEBRIS: DebrisData = (() => {
  const raw = debrisRaw as unknown as DebrisData;
  return { ...raw, cells: raw.cells.filter((c) => c.ring || c.box === choreo.碎块组.剖面 || choreo.右偏(c.p) < 0.6) };
})();
const ATLAS = png(CloudCottage_ATLAS);

// 镜头：世界坐标的镜头位置，飞散的碎块离镜头太近就淡出（模型/特效/方块飞溅.tsx 的 近隐；镜头在屋外侧视，一般碰不到）
export const GiantScene: React.FC<{ t: number; camPos?: number[] }> = ({ t, camPos: camPos }) => {
  const show = t > choreo.出场.起 && t < choreo.出场.止;
  return (
    <group position={choreo.小屋原点}>
      <CloudCottage hide={choreo.hideFor(t)} />
      {show && (
        <>
          {choreo.GIANTS.map((giantDef, i) => {
            const state = choreo.giant(i, t);
            return state.alive ? (
              <group key={i} position={state.pos}>
                <DeathTopple 向={choreo.击退向} u={state.倒} knockbackOffset={state.knockbackOffset}>
                  <group rotation={[0, 0, choreo.GIANT_YAW]}>
                    <Giant sec={t + 40 + i * 3} kind={giantDef.种类} hurt={state.受伤} opacity={state.opacity} />
                  </group>
                </DeathTopple>
              </group>
            ) : null;
          })}
          {choreo.GIANTS.map((_, i) => (
            <PoofBurst key={i} center={choreo.deathPos(i)} width={GIANT.hitbox[0] / 2} height={GIANT.height} sec={(t - choreo.T_DEATH[i]) * choreo.特效倍速} seed={120 + i} />
          ))}
          <BlockDebris data={DEBRIS} atlas={ATLAS} bursts={choreo.debrisBursts(t)} nearHide={camPos && { 镜头: camPos.map((x, i) => x - choreo.小屋原点[i]), ...debrisNearHide }} />
        </>
      )}
    </group>
  );
};
