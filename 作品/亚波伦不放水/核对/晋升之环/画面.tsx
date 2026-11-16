// 晋升之环核对的画面：灰底或暗红底（带雾）、一块地面；环单独并排，或戴在娘化亚波伦、史蒂夫头后。视图表在 视图.ts。
// 画布开抗锯齿：环是顺滑的真几何，不开的话圆的边是锯齿。史蒂夫没做 UV 内收（见 @库/角色/史蒂夫.tsx），开了以后他的轮廓可能冒出贴图相邻格子的颜色，这里只看环，不管。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CheckCamera, CheckCanvas, CheckGround, CheckLabel, NeutralLights, useCheckView, ZUp } from '@engine/段/核对画面.tsx';
import { stevePose } from '@库/角色/史蒂夫.tsx';
import { RingedSteve } from '../../角色/戴环史蒂夫.tsx';
import { GirlYaBoLun, hover, stand } from '../../角色/娘化亚波伦.tsx';
import { AscensionHalo } from '../../特效/晋升之环.tsx';
import { twoPeoplePos, singleView, sideBySide, aspect, views, type View } from './视图.ts';

// 暗红底：背景、雾取封面草稿段的雾色，地面取暗的下界岩色
const baseColors = { 灰: { background: '#5a5e66', ground: '#8a8f98' }, 暗红: { background: '#3a0a07', ground: '#3b1513' } } as const;

const CameraRig: React.FC<{ v: View }> = ({ v }) => {
  const lift = v.pictureMode.type === '戴' ? (v.pictureMode.lift ?? 0) : 0;
  return <CheckCamera eye={[v.眼[0], v.眼[1], v.眼[2] + lift]} target={[v.看[0], v.看[1], v.看[2] + lift]} fov={v.fov} />;
};

const Content: React.FC<{ v: View }> = ({ v }) => {
  if (v.pictureMode.type === '并排') {
    return (
      <>
        {sideBySide.variants.map((variant, i) => (
          // 环坐标（+Y 上、+Z 朝观众）→ 场景（Z 上、观众在南）：绕 X 转 +90 度
          <group key={variant} position={[sideBySide.x[i]!, 0, sideBySide.height]} rotation={[Math.PI / 2, 0, 0]} scale={sideBySide.cellsPerPixel}>
            <AscensionHalo variant={variant} sec={v.ringSec} />
          </group>
        ))}
      </>
    );
  }
  if (v.pictureMode.type === '单看') {
    return (
      <group position={[0, 0, singleView.height]} rotation={[Math.PI / 2, 0, 0]} scale={singleView.cellsPerPixel}>
        <AscensionHalo variant={v.pictureMode.variant} sec={v.ringSec} />
      </group>
    );
  }
  const { who: actor, variant, act, lift = 0 } = v.pictureMode;
  const twoPeople = actor === '两人';
  return (
    <>
      {actor !== '史蒂夫' && (
        <GirlYaBoLun pose={{ loc: [twoPeople ? twoPeoplePos.yaBoLun : 0, 0, twoPeople ? 0.6 : lift], yaw: 180 }} sec={0.5} act={act === '悬停' ? hover : stand} holdWand={twoPeople} headRing={variant} ringSec={v.ringSec} />
      )}
      {actor !== '亚波伦' && <RingedSteve pose={stevePose([twoPeople ? twoPeoplePos.steve : 0, 0, 0], 180)} mcLight={1} ring={variant} ringSec={v.ringSec} />}
    </>
  );
};

const picture: React.FC = () => {
  const v = useCheckView(views);
  const colorSet = baseColors[v.bottomBackground];
  return (
    <AbsoluteFill style={{ background: colorSet.background }}>
      <div style={{ width: aspect.width, height: aspect.height }}>
        <CheckCanvas width={aspect.width} height={aspect.height} background={colorSet.background}>
          {v.bottomBackground === '暗红' && <fog attach="fog" args={[colorSet.background, 30, 140]} />}
          <CameraRig v={v} />
          <ZUp>
            <NeutralLights />
            <CheckGround size={160} color={colorSet.ground} />
            <Content v={v} />
          </ZUp>
        </CheckCanvas>
      </div>
      <CheckLabel title={v.name} note={v.note} />
    </AbsoluteFill>
  );
};

export default picture;
