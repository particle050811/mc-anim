// 6-1-5 巫妖怪塔这一处在一镜到底里要画的东西，按 编排.ts（物理时间 t）。
// 扫帚和两个人由 一镜到底/画面.tsx 统一画；这里给它李樱左手的鼓风机、左臂这几样改动（骑手改动）。
import React from 'react';
import type { V3 } from '../../../../engine/model/parts.tsx';
import { png } from '../../../../engine/model/贴图.ts';
import { handAim, RideLiYing } from '../../../../world/角色/骑扫帚.tsx';
import { Lich, LICH, lichShieldMatrix } from '../../../../world/生物/巫妖.tsx';
import { HEALING_COLOR, ThrownSplashPotion } from '../../../../world/物品/喷溅药水.tsx';
import { EncasedFan } from '../../../../world/物品/鼓风机.tsx';
import { LichTower, LichTower_ATLAS } from '../../../../world/地点/巫妖怪塔.tsx';
import { LandmarkPlacement } from '../../../../world/地点/暮色新世界.tsx';
import { BlockDebris, DebrisData, debrisNearHide } from '../../../../world/特效/方块飞溅.tsx';
import { ShieldShatter } from '../../../../world/特效/护盾碎裂.tsx';
import { PotionSplash } from '../../../../world/特效/药水炸开.tsx';
import { PoofBurst, DeathTopple } from '../../../../world/特效/生物死亡.tsx';
import debrisRaw from 'asset:碎块/镜头/6-1-5/碎块';
import * as choreo from './编排.ts';

const DEBRIS = debrisRaw as unknown as DebrisData;
const ATLAS = png(LichTower_ATLAS);

const Wind: React.FC<{ t: number; opacity: number }> = ({ t, opacity }) => {
  if (opacity <= 0) return null;
  const fanFront = choreo.FAN_FRONT;
  const lines = Array.from({ length: 16 }, (_, i) => {
    const ph = ((t * 220 + i * 0.37) % 1 + 1) % 1;
    const angle = (i * 2.399) % (Math.PI * 2);
    const radius = (0.05 + 0.13 * ((i * 0.618) % 1)) * (1 + ph * 1.5);
    const local = [fanFront[0] + Math.cos(angle) * radius, fanFront[1] + 0.45 + ph * 7, fanFront[2] + Math.sin(angle) * radius];
    return { p: choreo.broomToLocal(t, local), o: opacity * (1 - ph) * 0.9 };
  });
  return (
    <>
      {lines.map((l, i) => (
        <mesh key={i} position={l.p}>
          <boxGeometry args={[0.035, 0.9, 0.035]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={l.o} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
};

export const lichRiderTweak = (t: number, base: RideLiYing): RideLiYing => {
  const fan = choreo.fan(t);
  const arm = choreo.leftArm(t);
  return {
    ...base,
    poseOverride: (restPose) => {
      const pose = typeof base.poseOverride === 'function' ? base.poseOverride(restPose) : { ...restPose, ...(base.poseOverride ?? {}) };
      return { ...pose, ...arm };
    },
    leftHand:
      fan.opacity > 0
        ? (pose) => (
            <group quaternion={handAim(pose, [0, 1, 0], 'L')}>
              {/* 握持点坐标系是玩家模型的像素（整体 0.9375 倍），换成格要乘 16 / 0.9375 */}
              <group scale={16 / 0.9375}>
                {/* 鼓风机的出风口（本地 +Y）对着前方（握持点的 +Z），大小、位置见 编排.ts 的 FAN_SIZE、FAN_AT */}
                <group position={[0, 0, choreo.FAN_AT]} rotation={[Math.PI / 2, 0, 0]} scale={choreo.FAN_SIZE}>
                  <EncasedFan spin={fan.spin} thickBlades opacity={fan.opacity} />
                </group>
              </group>
            </group>
          )
        : undefined,
  };
};

// 塔和塔里的一切（塔本地坐标里画，整组按 暮色新世界.tsx 的地标表摆到世界里：网格逆时针转了 90°）。t：贯穿后的物理秒数；fx：特效时钟。
// 镜头：世界坐标的镜头位置，飞散的碎块离镜头太近就淡出（模型/特效/方块飞溅.tsx 的 近隐）
export const LichScene: React.FC<{ t: number; camPos?: number[] }> = ({ t, camPos: camPos }) => {
  const fx = (dt: number) => dt * choreo.特效倍速;
  const lich = choreo.lichState(t);
  const bursts = choreo.debrisBursts(t);
  return (
    <LandmarkPlacement 名="巫妖怪塔">
      <LichTower hide={choreo.hideFor(t)} />
      {t > choreo.出场.起 && t < choreo.出场.止 && (
        <>
          <Wind t={t} opacity={choreo.fan(t).opacity} />
          {/* 巫妖：侧着身子对着来向站，反应不过来、一动不动；矛尖一碰到就变红、变半透明（战利品箱冒在它身上），朝矛的方向倒下，随即化成白烟 */}
          {lich.alive && (
            <group position={lich.pos}>
              <DeathTopple 向={choreo.前向} u={lich.倒} knockbackOffset={lich.knockbackOffset}>
                <group rotation={[0, 0, (choreo.LICH_YAW * Math.PI) / 180]}>
                  <Lich 秒={choreo.lichClock(t)} shieldCount={choreo.shieldCount(t)} 受伤={lich.hurt} opacity={lich.opacity} />
                </group>
              </DeathTopple>
            </group>
          )}
          <PoofBurst center={choreo.LICH_DEATH_POS} width={0.6} height={2} sec={(t - choreo.T_DEATH) * choreo.药水特效倍速} seed={5} />
          <group position={choreo.LICH_AT} rotation={[0, 0, (choreo.LICH_YAW * Math.PI) / 180]}>
            {choreo.SHIELD_PLAN.map((p, i) => (
              <group key={i} matrix={lichShieldMatrix(p.clock, p.shield, p.n)} matrixAutoUpdate={false}>
                <ShieldShatter sec={fx(t - p.tau)} seed={20 + i} push={p.push} speed={9} />
              </group>
            ))}
          </group>
          {choreo.SHIELD_PLAN.map((p, i) => (
            <PotionSplash key={i} at={[choreo.砸点(i)[0], choreo.砸点(i)[1], p.center[2] - 0.3]} sec={(t - p.tau) * choreo.药水特效倍速} seed={40 + i} color={HEALING_COLOR} count={8} />
          ))}
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const potionState = choreo.potion(i, t);
            if (!potionState) return null;
            return (
              <group key={i} position={potionState.p} rotation={[Math.PI / 2, 0, -Math.PI / 2, 'ZXY']}>
                <group rotation={[0, 0, potionState.spin]}>
                  <ThrownSplashPotion />
                </group>
              </group>
            );
          })}
          <BlockDebris data={DEBRIS} atlas={ATLAS} bursts={bursts} nearHide={camPos && { 镜头: choreo.塔框.toLocal(camPos), ...debrisNearHide }} />
        </>
      )}
    </LandmarkPlacement>
  );
};
export const LICH_SIZE = LICH;
export type { V3 };
