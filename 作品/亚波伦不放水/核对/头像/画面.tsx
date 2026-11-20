// 头像核对的画面：娘化亚波伦（正片同一套模型和贴图）的方形大头照。方案表在 视图.ts。
// 三种背景：下界 = 导入的真下界（提亮那套光，同正片），她悬在熔岩海上空（封面远景的选点）；教堂 = 粉色教堂的跳舞位（同 6-结算舞，教堂自己的灯）；纯底 = 暗红渐变底加中性灯。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CheckCamera, CheckCanvas, NeutralLights, useCheckView, ZUp } from '@engine/段/核对画面.tsx';
import type { V3 } from '@engine/model/parts.tsx';
import { ScreenAo } from '@engine/voxel/屏幕AO.tsx';
import { GirlYaBoLun, hover, stand } from '../../角色/娘化亚波伦.tsx';
import { AntiDark } from '../../角色/防暗.tsx';
import { netherBrighter, netherFarM, RealNether } from '../../地点/真下界.tsx';
import { realNetherPick, realNetherScene } from '../../地点/真下界位置.ts';
import { church, ChurchLighting, PinkChurch } from '../../地点/粉色教堂.tsx';
import { aspect, plans, type AvatarPlan, type Venue } from './视图.ts';

const venues: Record<Venue, { 位: V3; background: string }> = {
  '下界': { 位: realNetherScene(realNetherPick.x, realNetherPick.y, realNetherPick.z), background: netherBrighter.fog.色 },
  '教堂': { 位: church.dancePos, background: '#b4cfff' },
  '纯底': { 位: [0, 0, 0], background: '#2a0a10' },
};

/** 她坐标里的一点 → 场景：绕 Z 转 (yaw − 180) 度，再挪到场地 */
const toScene = (p: V3, 位: V3, yaw: number): V3 => {
  const a = ((yaw - 180) * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return [位[0] + c * p[0] - s * p[1], 位[1] + s * p[0] + c * p[1], 位[2] + p[2]];
};

const picture: React.FC = () => {
  const v: AvatarPlan = useCheckView(plans);
  const venue = venues[v.venue];
  const yaw = v.yaw ?? 180;
  const eye = toScene(v.眼, venue.位, yaw);
  const target = toScene(v.看, venue.位, yaw);
  const far = v.venue === '下界' ? Math.max(1400, netherFarM(netherBrighter) + 200) : 512;
  const actor = <GirlYaBoLun pose={{ loc: [...venue.位], yaw }} sec={v.sec} act={v.act === '悬停' ? hover : stand} holdWand={v.holdWand} bonePose={v.head ? { Head: { rot: [...v.head] } } : undefined} />;
  return (
    <AbsoluteFill style={{ background: v.venue === '纯底' ? 'radial-gradient(circle at 50% 42%, #6a1a22 0%, #2a0a10 55%, #0c0306 100%)' : venue.background }}>
      <CheckCanvas width={aspect.width} height={aspect.height} gl={{ logarithmicDepthBuffer: v.venue === '下界' }}>
        <CheckCamera eye={eye} target={target} fov={v.fov} far={far} />
        {v.venue === '下界' && <ScreenAo />}
        <ZUp>
          {v.venue === '下界' && <RealNether cameraPos={eye} 光={netherBrighter} />}
          {v.keyLight && <directionalLight position={[eye[0] - venue.位[0], eye[1] - venue.位[1], eye[2] - venue.位[2] + 1.5]} color="#fff4ec" intensity={v.keyLight} />}
          {v.venue === '教堂' && (
            <>
              <ChurchLighting />
              <PinkChurch />
            </>
          )}
          {v.venue === '纯底' && <NeutralLights />}
          {v.brighten ? <AntiDark lift={v.brighten}>{actor}</AntiDark> : actor}
        </ZUp>
      </CheckCanvas>
    </AbsoluteFill>
  );
};

export default picture;
