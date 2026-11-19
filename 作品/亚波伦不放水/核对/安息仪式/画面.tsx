// 安息仪式核对的画面：暗红底（下界的雾色）、一块下界岩色的地，结构摆在原点。视图表在 视图.ts。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { GirlYaBoLun } from '../../角色/娘化亚波伦.tsx';
import { RestRitualPerformance, RestRitualStructure, Offering } from '../../特效/安息仪式.tsx';
import { summonStateAt, appearPos, offerings, offeringPos, transitionProgressTick } from '../../特效/安息仪式时序.ts';
import { aspect, views, type View } from './视图.ts';
import { CheckCamera, CheckCanvas, CheckLabel, useCheckView, ZUp } from '@engine/段/核对画面.tsx';

const background = '#3a0a07';
const Ground: React.FC = () => (
  <mesh position={[0, 0, -0.06]}>
    <boxGeometry args={[160, 160, 0.1]} />
    <meshStandardMaterial color="#5a2422" />
  </mesh>
);

// 核对里静止的视图也让火和物品停在一个固定的时刻
const stillSec = 0.4;

const Content: React.FC<{ v: View }> = ({ v }) => {
  if (v.pictureMode.type === '陈列') {
    return (
      <>
        {offerings.map((offering, i) => (
          <group key={offering.name} position={[((i % 6) - 2.5) * 1.5, 0, i < 6 ? 2.4 : 0.8]} scale={2}>
            <Offering name={offering.name} sec={0} />
          </group>
        ))}
      </>
    );
  }
  if (v.pictureMode.type === '结构') {
    return (
      <>
        <Ground />
        <RestRitualStructure sec={stillSec} />
        {offerings.map((offering, i) => (
          <group key={offering.name} position={offeringPos(i)}>
            <Offering name={offering.name} sec={stillSec} />
          </group>
        ))}
      </>
    );
  }
  return (
    <>
      <Ground />
      <RestRitualPerformance sec={v.pictureMode.sec} plan={v.pictureMode.plan}>
        <GirlYaBoLun pose={{ loc: [...appearPos], yaw: 180 }} sec={v.pictureMode.sec - v.pictureMode.plan.appear} />
      </RestRitualPerformance>
    </>
  );
};

const picture: React.FC = () => {
  const v = useCheckView(views);
  const s = v.pictureMode.type === '演出' ? summonStateAt(v.pictureMode.sec, v.pictureMode.plan) : undefined;
  return (
    <AbsoluteFill style={{ background: background }}>
      <CheckCanvas width={aspect.width} height={aspect.height} background={background} antialias={false}>
        <CheckCamera eye={v.眼} target={v.看} fov={v.fov} />
        <ZUp>
          <ambientLight intensity={0.6 * Math.PI} />
          <directionalLight position={[3, -4, 6]} intensity={0.5 * Math.PI} />
          <Content v={v} />
        </ZUp>
      </CheckCanvas>
      <CheckLabel title={v.name} note={v.note}>
        {s && v.pictureMode.type === '演出' && (
          <div style={{ fontSize: 16 }}>
            第 {v.pictureMode.sec.toFixed(2)} 秒（共 {v.pictureMode.plan.totalSec} 秒）　阶段 {s.stage}　祭品 {s.offeringAlpha.toFixed(2)}　相当于游戏过渡第 {transitionProgressTick(v.pictureMode.sec, v.pictureMode.plan).toFixed(0)} 刻　法阵半边 {s.circleHalf.toFixed(2)}
          </div>
        )}
      </CheckLabel>
    </AbsoluteFill>
  );
};

export default picture;
