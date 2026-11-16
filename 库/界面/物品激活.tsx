// 原版第一人称「物品激活」动画：不死图腾救命时屏幕中间翻出来的那个图腾（1.20.1 GameRenderer.displayItemActivation / renderItemActivationAnimation，javap 核过常数）。
// 触发时 itemActivationTicks = 40、偏移 offX、offY 各取 random.nextFloat() × 2 − 1；之后每刻减一，减到 0 不画。每帧：
//   f = (40 − ticks + partialTick) / 40，f3 = 10.25 f⁵ − 24.95 f⁴ + 25.5 f³ − 13.8 f² + 4 f，f4 = f3·π；
//   平移到 (W/2 + offX·(W/4)·|sin 2f4|, H/2 + offY·(H/4)·|sin 2f4|, −50)（W、H 是界面缩放后的宽高，W/4 整除），缩放 (f7, −f7, f7)，f7 = 50 + 175 sin f4，
//   绕 Y 转 900·|sin f4| 度、绕 X、绕 Z 各转 6 cos 8f 度，再按物品模型的 FIXED 显示变换画、满亮度。所以它从一角飞进来、在正中放大翻转、最后缩回去从那一角飞走。
// 画在世界和手之上、界面（血条、聊天栏、各种屏幕）之下（GameRenderer.render 里在 gui.render 之前）。
// 不完全照原版的：物品的灯光（原版 Lighting.setupFor3DItems 两盏固定方向光）按方向估的，正面朝着镜头时是满亮、转过去变暗，和原版大体一样。
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import React from 'react';
import * as THREE from 'three';
import { ItemDisplay, ItemSprite, type ItemLayer, type ItemTransform } from '../../engine/model/物品贴图.tsx';
import { rad } from '../../engine/core/数学.ts';

/** 动画多少刻（itemActivationTicks 的初值） */
export const itemActivateTicks = 40;

/** 动画进行到 秒（触发后几秒）时物品在界面坐标里的摆法：位置（界面像素，y 朝下）、边长 f7、三个转角（度）。秒 不在 [0, 2) 里返回 null */
export const itemActivateParams = (sec: number, offset: readonly [number, number], uiWidth: number, uiHeight: number) => {
  const f = (sec * 20) / itemActivateTicks;
  if (f < 0 || f >= 1) return null;
  const [f1, f2] = [f * f, f * f * f];
  const f3 = 10.25 * f2 * f1 - 24.95 * f1 * f1 + 25.5 * f2 - 13.8 * f1 + 4 * f;
  const f4 = f3 * Math.PI;
  const pulse = Math.abs(Math.sin(f4 * 2));
  return {
    x: uiWidth / 2 + offset[0] * Math.trunc(uiWidth / 4) * pulse,
    y: uiHeight / 2 + offset[1] * Math.trunc(uiHeight / 4) * pulse,
    scale: 50 + 175 * Math.sin(f4),
    rotateY: 900 * Math.abs(Math.sin(f4)),
    rotateXZ: 6 * Math.cos(f * 8),
  };
};

/** item/generated 的 fixed 显示变换（client 1.20.1 item/generated.json） */
const FIXED: ItemTransform = { rotation: [0, 180, 0], scale: [1, 1, 1] };

const UiCamera: React.FC<{ uiWidth: number; uiHeight: number }> = ({ uiWidth, uiHeight }) => {
  const { camera, gl } = useThree();
  gl.toneMapping = THREE.NoToneMapping;
  const cam = camera as THREE.OrthographicCamera;
  // 界面坐标：x 朝右、y 朝下（top = 0、bottom = 界高），镜头在 z = 1000 朝 −Z。manual：不让 R3F 按画布大小改回以中心为原点的视锥
  Object.assign(cam, { left: 0, right: uiWidth, top: 0, bottom: uiHeight, near: 1, far: 2000, zoom: 1, manual: true });
  cam.position.set(0, 0, 1000);
  cam.rotation.set(0, 0, 0);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

/** 两盏灯：Lighting.setupFor3DItems 的两个方向（换到界面坐标，y 朝下）各 0.6，加 0.4 的环境光 */
const lights = [new THREE.Vector3(-0.275, -0.212, 1.188).normalize(), new THREE.Vector3(-0.266, -1.202, 0.119).normalize()];

/** 叠在画面上的物品激活动画。宽、高：画面像素；s：界面缩放；秒：触发后几秒；偏：offX、offY（−1～1）；物品：平面物品的贴图层（item/generated） */
export const ItemActivate: React.FC<{ width: number; height: number; s: number; sec: number; offset: readonly [number, number]; items: ItemLayer[] }> = ({ width: width, height: height, s, sec: sec, offset, items }) => {
  const [uiWidth, uiHeight] = [Math.ceil(width / s), Math.ceil(height / s)];
  const activeParams = itemActivateParams(sec, offset, uiWidth, uiHeight);
  if (!activeParams) return null;
  return (
    <ThreeCanvas orthographic width={width} height={height} gl={{ antialias: true, alpha: true }} style={{ position: 'absolute', left: 0, top: 0 }}>
      <UiCamera uiWidth={uiWidth} uiHeight={uiHeight} />
      <ambientLight intensity={0.4 * Math.PI} />
      {lights.map((d, i) => (
        <directionalLight key={i} position={d.toArray()} intensity={0.6 * Math.PI} />
      ))}
      <group position={[activeParams.x, activeParams.y, -50]} scale={[activeParams.scale, -activeParams.scale, activeParams.scale]}>
        <group rotation={[0, rad(activeParams.rotateY), 0]}>
          <group rotation={[rad(activeParams.rotateXZ), 0, 0]}>
            <group rotation={[0, 0, rad(activeParams.rotateXZ)]}>
              <ItemDisplay t={FIXED}>
                <ItemSprite layers={items} emissive={0} shadow={false} />
              </ItemDisplay>
            </group>
          </group>
        </group>
      </group>
    </ThreeCanvas>
  );
};
