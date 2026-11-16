// 史蒂夫关节核对的画面：灰底、一块地面、一盏环境光加一盏平行光（同 核对/史蒂夫装备）。视图表在 视图.ts。
// 画布不开抗锯齿：史蒂夫的贴图没做 UV 内收（见 库/角色/史蒂夫.tsx）。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CheckCamera, CheckCanvas, CheckGround, CheckLabel, checkGrey, NeutralLights, ZUp } from '@engine/段/核对画面.tsx';
import { useCurrentSec } from '@engine/段/时间.tsx';
import { stevePose } from '@库/角色/史蒂夫.tsx';
import { ReactingSteve } from '../../角色/反应史蒂夫.tsx';
import { squatLegAngle } from '../../角色/史蒂夫关节.ts';
import { EquippedSteve } from '../../角色/史蒂夫装备.tsx';
import { aspect, viewAt, type Person } from './视图.ts';

const DrawPerson: React.FC<{ 人: Person }> = ({ 人: person }) => {
  if ('state' in person) return <ReactingSteve state={person.state} equipment={person.equipment} />;
  const holdSword = person.equipment?.剑 !== false;
  const legPitch = squatLegAngle(person.knee);
  const pose = { ...stevePose(person.位, 180, { sec: 0, holdR: holdSword }), elbowR: person.elbow, elbowL: person.elbow, kneeR: person.knee, kneeL: person.knee, legR: legPitch + (person.stride ?? 0), legL: legPitch - (person.stride ?? 0), ground: 1 };
  return <EquippedSteve pose={pose} sec={0.5} equipment={person.equipment} hurt={person.hurt} />;
};

const picture: React.FC = () => {
  const { v, τ } = viewAt(useCurrentSec());
  return (
    <AbsoluteFill style={{ background: checkGrey.background }}>
      <CheckCanvas width={aspect.width} height={aspect.height} background={checkGrey.background} antialias={false}>
        <CheckCamera eye={v.眼} target={v.看} fov={v.fov} />
        <ZUp>
          <NeutralLights />
          <CheckGround size={24} />
          {v.people(τ).map((person, i) => (
            <DrawPerson key={i} 人={person} />
          ))}
        </ZUp>
      </CheckCanvas>
      <CheckLabel title={v.name} note={v.note} />
    </AbsoluteFill>
  );
};

export default picture;
