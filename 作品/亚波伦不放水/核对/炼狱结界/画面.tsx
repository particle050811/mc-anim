// 炼狱结界核对的画面：灰底（或暗红底带雾，视图的 底）、一块地面，史蒂夫站在原点，演出视图里亚波伦悬在西边空中。视图表在 视图.ts。
// 画布不开抗锯齿：史蒂夫没做 UV 内收（见 @库/角色/史蒂夫.tsx），游戏里的线也没有抗锯齿。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Steve, stevePose } from '@库/角色/史蒂夫.tsx';
import { RevelationCageWire } from '@库/特效/炼狱结界.tsx';
import { revelationCageOpacity } from '@库/特效/炼狱结界线.ts';
import { GirlYaBoLun, hover } from '../../角色/娘化亚波伦.tsx';
import { RevelationCageGlow } from '../../特效/炼狱结界辉线.tsx';
import { RevelationCagePerformance } from '../../特效/炼狱结界演出.tsx';
import { cagePerformanceStateAt } from '../../特效/炼狱结界演出状态.ts';
import { sideBySideCenters, yaBoLunPos, performanceSettings, aspect, views, type View } from './视图.ts';
import { CheckCamera, CheckCanvas, CheckGround, CheckLabel, NeutralLights, useCheckView, ZUp } from '@engine/段/核对画面.tsx';

// 暗红底：背景、雾取封面草稿段的雾色和雾距，地面取暗的下界岩色
const baseColors = { 灰: { background: '#5a5e66', ground: '#8a8f98' }, 暗红: { background: '#3a0a07', ground: '#3b1513' } } as const;

const Ground: React.FC<{ 色?: string }> = ({ 色: color = baseColors.灰.ground }) => (
  <CheckGround size={160} color={color} />
);

const Content: React.FC<{ v: View }> = ({ v }) => {
  if (v.pictureMode.type === '原版') {
    return (
      <>
        {v.pictureMode.ground && <Ground />}
        <Steve pose={stevePose([0, 0, 0], 180)} mcLight={1} />
        <group position={[0, 0, 0.9]}>
          <RevelationCageWire sec={v.pictureMode.spinSec} opacity={v.pictureMode.ageTicks === undefined ? 1 : revelationCageOpacity(v.pictureMode.ageTicks)} />
        </group>
      </>
    );
  }
  const groundColor = baseColors[v.bottomBackground ?? '灰'].ground;
  if (v.pictureMode.type === '并排') {
    const spinSec = v.pictureMode.spinSec;
    return (
      <>
        <Ground 色={groundColor} />
        {sideBySideCenters.map((c, i) => (
          <React.Fragment key={i}>
            <Steve pose={stevePose([c[0], c[1], 0], 180)} mcLight={1} />
            <group position={c}>{i === 0 ? <RevelationCageWire sec={spinSec} /> : <RevelationCageGlow sec={spinSec} />}</group>
          </React.Fragment>
        ))}
      </>
    );
  }
  const s = cagePerformanceStateAt(v.pictureMode.sec, performanceSettings);
  return (
    <>
      <Ground 色={groundColor} />
      {/* 史蒂夫面朝西看着亚波伦（yaw 正 = 往左转，0 朝 +Y） */}
      <Steve pose={stevePose([0, 0, 0], 90)} mcLight={1} hurt={s.fireIntensity > 0.6 ? 1 : 0} />
      <GirlYaBoLun pose={{ loc: yaBoLunPos, yaw: -90 }} sec={v.pictureMode.sec % 3} act={hover} />
      <RevelationCagePerformance sec={v.pictureMode.sec} settings={performanceSettings} />
    </>
  );
};

const picture: React.FC = () => {
  const v = useCheckView(views);
  const s = v.pictureMode.type === '演出' ? cagePerformanceStateAt(v.pictureMode.sec, performanceSettings) : undefined;
  const background = baseColors[v.bottomBackground ?? '灰'].background;
  return (
    <AbsoluteFill style={{ background: background }}>
      <CheckCanvas width={aspect.width} height={aspect.height} background={background} antialias={false}>
        {v.bottomBackground === '暗红' && <fog attach="fog" args={[background, 16, 70]} />}
        <CheckCamera eye={v.眼} target={v.看} fov={v.fov} />
        <ZUp>
          <NeutralLights />
          <Content v={v} />
        </ZUp>
      </CheckCanvas>
      <CheckLabel title={v.name} note={v.note}>
        {s && (
          <div style={{ fontSize: 16 }}>
            演出第 {v.pictureMode.type === '演出' ? v.pictureMode.sec.toFixed(2) : ''} 秒　阶段 {s.stage}　半径系数 {s.radiusFactor.toFixed(2)}（顶点离中心 {s.circumRadius.toFixed(2)} 格）　透明度 {s.opacity.toFixed(2)}
          </div>
        )}
      </CheckLabel>
    </AbsoluteFill>
  );
};

export default picture;
