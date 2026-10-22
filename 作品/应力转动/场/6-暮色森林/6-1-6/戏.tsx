// 6-1-6 九头蛇巢穴这一处在一镜到底里要画的东西：九头蛇、死亡特效、扫帚贯穿以后贴地飞出去卷起的土（按 编排.ts，物理时间 t）。
// 巢穴不画迁移的网格，用新世界自己生成的那座（用户 2026-10-06「就按照新世界的来」，见 暮色新世界.tsx 九头蛇巢穴那一行），由 暮色地形 画。
import React from 'react';
import type { V3 } from '@engine/model/parts.tsx';
import { Hydra, HYDRA, hydraParts } from '@库/生物/九头蛇.tsx';
import { LandmarkPlacement } from '../../../地点/暮色新世界.tsx';
import { ExplosionBurst, PoofBurst } from '@库/特效/生物死亡.tsx';
import { Debris } from '@库/特效/烟尘.tsx';
import * as choreo from './编排.ts';

// t：贯穿后的物理秒数；broom：扫帚在世界里的位置
export const HydraScene: React.FC<{ t: number; broom: V3 }> = ({ t, broom }) => {
  const heads = choreo.hydraHeads(t, broom);
  const parts = hydraParts({ heads }, t + 30);
  const headW = (i: number) => choreo.hydraToLocal([parts[i].pos[0], parts[i].pos[1], parts[i].pos[2] + HYDRA.partLift]);
  const body = choreo.hydraToLocal([0, 3.2, 2.4]);
  const show = t > choreo.出场.起 && t < choreo.出场.止;
  return (
    <LandmarkPlacement 名="九头蛇巢穴">
      {show && (
        <>
          {t < choreo.DEATH.gone && (
            <group position={choreo.HYDRA_AT} rotation={[0, 0, choreo.HYDRA_YAW]}>
              <Hydra sec={t + 30} pose={{ heads }} hurt={choreo.hydraHurt(t)} />
            </group>
          )}
          {/* 身子、三个头先后炸开：暮色森林的 boss 死亡用的是原版爆炸粒子 + 生物消失的白烟 */}
          <ExplosionBurst center={body} width={4} sec={t - choreo.DEATH.body} seed={61} />
          <PoofBurst center={body} width={3} height={5} sec={t - choreo.DEATH.body} seed={62} />
          {choreo.DEATH.heads.map((g, i) => (
            <React.Fragment key={i}>
              <ExplosionBurst center={headW(i)} width={2} sec={t - g} seed={70 + i} />
              <PoofBurst center={headW(i)} width={1.5} height={2} sec={t - g} seed={80 + i} />
            </React.Fragment>
          ))}
          <Debris sec={t - 0.08} origin={[choreo.PIERCE[0] + choreo.DIR[0] * 6, choreo.PIERCE[1] + choreo.DIR[1] * 6, choreo.FLOOR]} seed={63} colors={['#4a2416', '#5c2c18', '#2f160c', '#6e3a1e']} count={22} speed={7} />
          {/* 钻穿土丘：撞进洞的东侧壁、从土丘东坡钻出来时各喷一把石块和土（侧壁里是石头、煤矿，外面是草皮和土） */}
          <Debris sec={t - choreo.侧壁时刻(choreo.侧壁.进)} origin={choreo.侧壁点(choreo.侧壁.进)} seed={64} colors={['#7a7a7a', '#5e5e5e', '#8a8a8a', '#3a3a3a']} count={26} speed={9} />
          <Debris sec={t - choreo.侧壁时刻(choreo.侧壁.出)} origin={choreo.侧壁点(choreo.侧壁.出)} seed={65} colors={['#7a7a7a', '#6b4a2e', '#4f7a2a', '#5e5e5e']} count={34} speed={12} />
        </>
      )}
    </LandmarkPlacement>
  );
};
