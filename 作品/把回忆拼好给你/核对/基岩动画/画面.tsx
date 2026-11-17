// 基岩动画核对的画面：左半手抄版、右半播放器版，各一张画布、同一个机位、同一个 秒，两只都站在原点，像素可以直接相减。
// 不放在同一张画布里左右排开：透视下两边看到的侧面不一样，法杖、尾巴这种在身后的东西会错开，看着像动作不同。
// 播放器版的尾巴：单帧拿不到前面帧积分出来的弹簧，变量表用稳态解填（尾巴稳态.ts），和手抄版同一个做法。
// 标了 控制器 的视图左右换成两种控制器（控制器示例.ts）。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { standPose } from '@库/角色/骨架.tsx';
import { MagicalWineFox } from '@库/角色/魔法酒狐.tsx';
import { aspect } from '../../分镜/时间.ts';
import { FirstPersonRig } from '../../地点/机位.tsx';
import { geckoLibSitToStand, bedrockSitToStand, controllerLayers } from './控制器示例.ts';
import { tailSteadyVars } from './尾巴稳态.ts';
import { views, type View } from './视图.ts';
import { MagicalWineFoxPlayer } from './魔法酒狐播放器版.ts';
import { CheckCanvas, CheckLabel, checkGrey, NeutralLights, useCheckView, ZUp } from '@engine/段/核对画面.tsx';

const pose = { ...standPose([0, 0, 0]), yaw: 180 };

const HalfPanel: React.FC<{ v: View; title: string; children: React.ReactNode }> = ({ v, title: title, children }) => (
  <div style={{ position: 'relative', width: aspect.width / 2, height: aspect.height }}>
    <CheckCanvas width={aspect.width / 2} height={aspect.height} background={checkGrey.background}>
      <FirstPersonRig 眼={v.眼} 看={v.看} fov={v.fov} />
      <ZUp>
        <NeutralLights />
        <mesh position={[0, 0, -0.05]}>
          <boxGeometry args={[9, 9, 0.1]} />
          <meshStandardMaterial color="#b8945f" />
        </mesh>
        {children}
      </ZUp>
    </CheckCanvas>
    <div style={{ position: 'absolute', left: 16, bottom: 12, color: '#ffffff', fontFamily: 'sans-serif', fontSize: 18, textShadow: '0 1px 3px #000' }}>{title}</div>
  </div>
);

const picture: React.FC = () => {
  const v = useCheckView(views);
  const variables = tailSteadyVars(MagicalWineFoxPlayer.animationFiles!, v.sec);
  return (
    <AbsoluteFill style={{ background: '#5a5e66', flexDirection: 'row' }}>
      {v.useController ? (
        <>
          <HalfPanel v={v} title="GeckoLib 控制器：sit → idle，过渡 10 刻">
            <MagicalWineFoxPlayer pose={pose} sec={v.sec} env={{ 变量: variables }} layers={controllerLayers(geckoLibSitToStand)} />
          </HalfPanel>
          <HalfPanel v={v} title="基岩版控制器：sit → idle，blend_transition 0.5 秒">
            <MagicalWineFoxPlayer pose={pose} sec={v.sec} env={{ 变量: variables }} layers={controllerLayers(bedrockSitToStand)} />
          </HalfPanel>
        </>
      ) : (
        <>
          <HalfPanel v={v} title="手抄版（库/角色/魔法酒狐.tsx）">
            <MagicalWineFox pose={pose} sec={v.sec} />
          </HalfPanel>
          <HalfPanel v={v} title="播放器版（定义生物 + 原版动画文件）">
            <MagicalWineFoxPlayer pose={pose} sec={v.sec} env={{ 变量: variables }} />
          </HalfPanel>
        </>
      )}
      <CheckLabel title={v.name} note={v.note} />
    </AbsoluteFill>
  );
};

export default picture;
