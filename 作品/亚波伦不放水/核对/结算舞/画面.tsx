// 结算舞核对的画面：前半灰底加一块地面（同 核对-娘化亚波伦 的灯），后半粉色教堂跳舞位；机位见 视图.ts。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CheckCamera, CheckCanvas, CheckGround, NeutralLights, ZUp } from '@engine/段/核对画面.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import { useCurrentSec } from '@engine/段/时间.tsx';
import { church, ChurchLighting, PinkChurch } from '../../地点/粉色教堂.tsx';
import { noodleDancePose, noodleDanceEnv } from '../../角色/动作/忘情牛肉面.ts';
import { GirlYaBoLun, defineAct } from '../../角色/娘化亚波伦.tsx';
import { chapelRig, halfSec, front, aspect } from './视图.ts';

// idle 垫底（呼吸、眨眼、浮块自转照旧），舞的姿势盖在上面；头发、胸部的弹簧吃舞里的转身和起落速度
const dance = defineAct({ 主: () => [{ name: 'idle' }], env: noodleDanceEnv });

const baseColor = '#5a5e66';
const skyColor = '#b4cfff';
const addVec = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

const CameraRig: React.FC<{ 眼: V3; 看: V3; fov: number }> = ({ 眼: eye, 看: lookAt, fov }) => <CheckCamera eye={eye} target={lookAt} fov={fov} far={512} />;

const picture: React.FC = () => {
  const segSec = useCurrentSec();
  const inChapel = segSec >= halfSec;
  const sec = inChapel ? segSec - halfSec : segSec;
  const bonePose = noodleDancePose(sec);
  const bgColor = inChapel ? skyColor : baseColor;
  return (
    <AbsoluteFill style={{ background: bgColor }}>
      <CheckCanvas width={aspect.width} height={aspect.height} background={bgColor}>
        {inChapel ? (
          <CameraRig 眼={addVec(church.dancePos, chapelRig.eyeOffset)} 看={addVec(church.dancePos, chapelRig.lookOffset)} fov={chapelRig.fov} />
        ) : (
          <CameraRig {...front} />
        )}
        <ZUp>
          {inChapel ? (
            <>
              <ChurchLighting />
              <PinkChurch />
            </>
          ) : (
            <>
              <NeutralLights />
              <CheckGround size={12} />
            </>
          )}
          <GirlYaBoLun pose={{ loc: inChapel ? church.dancePos : [0, 0, 0], yaw: 180 }} sec={sec} act={dance} bonePose={bonePose} />
        </ZUp>
      </CheckCanvas>
      <div style={{ position: 'absolute', left: 16, top: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 26, textShadow: '0 1px 3px #000' }}>
        忘情牛肉面 {sec.toFixed(2)} 秒{inChapel ? '（教堂跳舞位）' : ''}
      </div>
    </AbsoluteFill>
  );
};

export default picture;
