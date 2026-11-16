// 史蒂夫反应核对的画面：灰底、一块地面、一盏环境光加一盏平行光（同 核对/史蒂夫装备），史蒂夫站在原点面朝南。视图表在 视图.ts。
// 画布不开抗锯齿：史蒂夫的贴图没做 UV 内收（见 库/角色/史蒂夫.tsx）。
import React, { useMemo } from 'react';
import { AbsoluteFill } from 'remotion';
import { CheckCamera, CheckCanvas, CheckGround, CheckLabel, checkGrey, NeutralLights, useCheckView, ZUp } from '@engine/段/核对画面.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import { Arrow } from '@库/物品/箭.tsx';
import { deathPoof, VanillaParticles } from '@库/特效/原版粒子.tsx';
import { ReactingSteve } from '../../角色/反应史蒂夫.tsx';
import { arrowLaunchPoint, arrowFlight } from '../../角色/史蒂夫反应.ts';
import { steveDrops, steveDropCount, DeathDrop, deathDropTrack } from '../../角色/史蒂夫掉落.tsx';
import { TotemParticles, totemParticleTable } from '../../特效/图腾粒子.tsx';
import { aspect, views, type View } from './视图.ts';

const originPos: V3 = [0, 0, 0];

const SceneView: React.FC<{ v: View }> = ({ v }) => {
  const totemTable = useMemo(() => totemParticleTable(originPos, 1, { ground: 0 }), []);
  const trajectory = useMemo(() => deathDropTrack(originPos, steveDropCount, 3), []);
  const whiteSmoke = useMemo(() => deathPoof(originPos, 0.6, 1.8, 0, 5), []);
  const sinceDeath = v.state.afterDeathSec;
  const arrow = v.arrowSec === undefined || !v.state.看 ? null : arrowFlight(arrowLaunchPoint(originPos), [v.state.看[0], v.state.看[1], v.state.看[2] - arrowLaunchPoint(originPos)[2]], 1, v.arrowSec);
  return (
    <>
      <ReactingSteve state={{ 位置: originPos, facing: 180, ...v.state }} />
      {arrow && <Arrow p={arrow.p} dir={arrow.dir} />}
      {v.totemSec !== undefined && <TotemParticles 表={totemTable} sec={v.totemSec} />}
      {sinceDeath !== undefined && (
        <>
          <DeathDrop trajectory={trajectory} drops={steveDrops(sinceDeath)} sec={sinceDeath} />
          <VanillaParticles spawns={whiteSmoke} sec={sinceDeath} />
        </>
      )}
    </>
  );
};

const picture: React.FC = () => {
  const v = useCheckView(views);
  return (
    <AbsoluteFill style={{ background: checkGrey.background }}>
      <CheckCanvas width={aspect.width} height={aspect.height} background={checkGrey.background} antialias={false}>
        <CheckCamera eye={v.眼} target={v.看} fov={v.fov} />
        <ZUp>
          <NeutralLights />
          <CheckGround size={16} />
          <SceneView v={v} />
        </ZUp>
      </CheckCanvas>
      <CheckLabel title={v.name} note={v.note} />
    </AbsoluteFill>
  );
};

export default picture;
