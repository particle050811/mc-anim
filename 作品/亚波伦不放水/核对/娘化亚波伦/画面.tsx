// 娘化亚波伦核对的画面：灰底、一块地面、一盏环境光加一盏平行光，角色站在原点面朝南。视图表在 视图.ts。
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CheckCamera, CheckCanvas, CheckGround, CheckLabel, checkGrey, NeutralLights, useCheckView, ZUp } from '@engine/段/核对画面.tsx';
import { rightHandCenter, GirlYaBoLun, defineAct, hover, raisedPose, stand, type YaBoLunAct } from '../../角色/娘化亚波伦.tsx';
import { ItemDisplay } from '@engine/model/物品贴图.tsx';
import { NetherWand, netherWandDisplay } from '../../物品/下界魔杖.tsx';
import { aspect, views, type View } from './视图.ts';

// 受击：attacked 是整身的动作，顶掉 idle 播一遍（YSM 里受伤时主动画怎么让位没核实，这里当成整段换）
const hurt = defineAct({ 主: (sec) => [{ name: 'attacked', sec: sec }] });
// 前飞：悬停 1 秒后水平速度跳到 20（YSM wiki：飞行时 ground_speed 是 20），看头发的弹簧
const flyForward = defineAct({ 主: () => [{ name: 'fly' }], env: (sec) => ({ query: { ground_speed: sec >= 1 ? 20 : 0 } }), wandHoldPose: raisedPose.飞 });
const performances: Record<View['act'], YaBoLunAct> = { 站立: stand, 悬停: hover, 受击: hurt, 前飞: flyForward };

const CameraRig: React.FC<{ v: View }> = ({ v }) => {
  const lift = v.lift ?? 0;
  // 手部特写：手心和画角色用同一份 pose、表演、秒 算（已经带离地）
  const rightPalm = v.lookRightHand && rightHandCenter({ pose: { loc: [0, 0, lift], yaw: 180 }, sec: v.sec, act: performances[v.act] });
  const eye = rightPalm ? [rightPalm[0] + v.lookRightHand![0], rightPalm[1] + v.lookRightHand![1], rightPalm[2] + v.lookRightHand![2]] : [v.眼[0], v.眼[1], v.眼[2] + lift];
  const lookAt = rightPalm ?? [v.看[0], v.看[1], v.看[2] + lift];
  return <CheckCamera eye={[eye[0]!, eye[1]!, eye[2]!]} target={[lookAt[0]!, lookAt[1]!, lookAt[2]!]} fov={v.fov} />;
};

const picture: React.FC = () => {
  const v = useCheckView(views);
  return (
    <AbsoluteFill style={{ background: checkGrey.background }}>
      <CheckCanvas width={aspect.width} height={aspect.height} background={checkGrey.background}>
        <CameraRig v={v} />
        <ZUp>
          <NeutralLights />
          <CheckGround size={12} />
          {v.onlyWand ? (
            // 物品空间 Y 朝上，场景 Z 朝上：绕 X 转 +90 度立起来
            <group position={[0, 0, 1.5]} rotation={[Math.PI / 2, 0, 0]} scale={2}>
              <ItemDisplay t={netherWandDisplay.gui}>
                <NetherWand />
              </ItemDisplay>
            </group>
          ) : (
            <GirlYaBoLun pose={{ loc: [0, 0, v.lift ?? 0], yaw: 180 }} sec={v.sec} act={performances[v.act]} variant={v.variant} holdWand={v.holdWand} />
          )}
        </ZUp>
      </CheckCanvas>
      <CheckLabel title={v.name} note={v.note} />
    </AbsoluteFill>
  );
};

export default picture;
