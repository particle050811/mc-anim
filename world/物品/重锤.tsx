// 重锤：原版 Minecraft 1.21 的 minecraft:mace（试炼密室的重锤），项目游戏是 1.20.1，没有这件物品。
// 来源：用户 2026-10-06 给的基岩版资源包「3d重锤.mcpack」（「二创 3D重锤」2.5.0，转载，原作者和许可不明）。
//   现在只是参考视频的素材；以后要开源这个仓库，得先核对原作者和许可，核对不了就不能带上 重锤.模型.json / .png。
// 几何 重锤.模型.json 照抄包里的 models/entity/mace.geo.json（geometry.mace，骨骼、cube 数值不动，只包了一层 `source`），
//   贴图 重锤.模型.png 是包里的 textures/entity/mace.png（32×32）。用 lib/基岩模型.tsx 画，贴图最近邻采样。
//   模型是 4 个方块沿 item2 骨骼的 Y 排成一根轴（轴在文件坐标 x = -0.5、z = -0.20711）：
//   柄尾 2 见方（y -2.29～-0.29）、锤柄 1 见方（-0.29～4.71）、锤头 5 见方（4.71～9.71）、顶钮 1.2 见方（9.61～10.81）。
//   贴图一个像素是半个单位，锤头四个侧面同一张：浅钢色的框、中间画成凹进去的深色窗口（几何是平的）。
// 大小：照资源包在游戏里第三人称手持的样子。attachable 的 animation.mace_wield 只动 rightitem 骨骼：缩放 1.5（转和移很小，不带）。
//   rightitem 绑在玩家模型的 rightItem 骨骼上，单位是玩家模型的像素，所以模型一个单位 = 玩家 1.5 像素：
//   全长 13.1 × 1.5 = 19.7 像素，锤头 7.5 像素见方，和原版重锤手持差不多大。挂到骨架手上乘 16 再跟玩家整体 0.9375 缩放（`MaceInHand`），李樱 1.875 格高时整把约 1.15 米。
// 握持点和朝向（6-3 各段、6-3-2 思索直接换上，不改调用）：
// - 原点是握持点：游戏里握在 rightitem 原点，沿柄 y = 0，紧贴柄尾上沿往上 0.29 个单位。原点离柄轴还偏 0.5、0.2 个单位（基岩版手上挂点的位置），
//   我们的握持点就在拳头中心，所以把柄轴挪到原点上，锤头中心正好在 +Z 轴上（`MACE.head`、压路机虚影都按这条轴算）。
// - 锤头沿 +Z，四个侧面正对 ±X、±Y（不绕柄转 45°）。游戏里 item1（绕 Z -90°）、item2（绕 X 90°）把柄转到手臂前方；
//   这里保留这两根骨骼的转动，再整体绕 X 转 90° 把柄转到 +Z，±X 仍是手臂左右，和游戏一样从侧面看是锤头侧面正对着人。wield 的 2.4° 斜没带，指向由调用方的 `bladeInHand` 定。
// 镜头里李樱双手握柄、锤头顺着手臂往外伸（下锤击），挂到骨架手上时用 骨架.tsx 的 `bladeInHand` 指方向。
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BedrockModel, BedrockModelView } from '../../engine/model/基岩模型.tsx';
import { entityTexture } from '../../engine/model/贴图方盒.tsx';
import { png } from '../../engine/model/贴图.ts';
import raw资产 from 'asset:模型/物品/重锤';
import tex from 'asset:贴图/物品/重锤';
const raw = raw资产 as unknown as any; // 迁移：类型待补

const MODEL = { ...raw, texture: png(tex) } as unknown as BedrockModel;

const MODEL_SCALE = 1.5; // mace_wield 给 rightitem 的缩放：模型一个单位 = 玩家 1.5 像素
const HANDLE_AXIS: [number, number] = [-0.5, -0.20711]; // 柄轴在 item2 文件坐标里的 x、z
const HEAD_CENTER_Y = 4.70711 + 5 / 2; // 锤头中心沿柄的位置（item2 的 y，握持点为 0）
const TIP_Y = 9.60711 + 1.2; // 顶钮最远处
export const MACE_POMMEL_END = -2.29289 * (MODEL_SCALE / 16); // 柄尾最远处（格，握持点为 0，负的）

export const MACE = {
  head: (HEAD_CENTER_Y * MODEL_SCALE) / 16, // 握持点到锤头中心（格，沿锤柄方向）
  tip: (TIP_Y * MODEL_SCALE) / 16, // 握持点到顶钮最远处
};

// 握持点坐标系（Z 沿锤柄）里柄轴的偏移：item2 的 (x, z) 经 item1、item2 的转动和 `BedrockModelView` 的换轴、再绕 X 转 90°，落在 (z, -x)，挪回原点就是平移 (-z, x)（单位 × 缩放）
const AXIS_OFFSET = new THREE.Vector3(-HANDLE_AXIS[1], HANDLE_AXIS[0], 0).multiplyScalar(MODEL_SCALE / 16);

// 握持点在原点，锤头沿 +Z，单位格。`emissive`：自发光打底（默认 0.25，背光面不至于黑成一块）；`opacity`：整体淡出。
// `glow`（0～1）：锤头被金光裹着时（6-3 下落锤击，锤击金光.tsx）自己也亮成暖金色：贴图 × 暖金 × 发光 × 1.6 加到自发光，
// 只加在锤头（含顶钮；着色器按模型 y ≥ 4.71 分开），锤柄、柄尾不加。
// 为什么加（用户 10-10「像是镂空了」）：几何、贴图、UV 和资源包一致，是光效把它画成了空壳：
// - 光尾第一节的半透明长方体比锤头还粗、罩住一半锤头，像只剩亮框的盒子（光尾现为朝镜头的柔边带子，见 锤击金光.tsx）；
// - 6-3-4 望远镜仰拍端面背光，只剩天光和 0.25 自发光；锤头里的金色点光源让六个面法线都背着它，接不到光；
// - 贴图是「浅色细框 + 深色凹槽」，暗时只剩细框，深色窗口和顶钮读成了洞。
// 材质照 `BedrockModelView` 的（镂空、双面、粗糙 0.9），每把锤一份，换到它画出来的网格上。
const HEAD_START_Y = 4.70711; // 锤头沿柄的起点（item2 的 y）
const WARM_GOLD = new THREE.Color('#ffc870');
export const Mace: React.FC<{ opacity?: number; emissive?: number; glow?: number }> = ({ opacity = 1, emissive = 0.25, glow = 0 }) => {
  const ref = useRef<THREE.Group>(null);
  const heat = useMemo(() => ({ value: new THREE.Color(0, 0, 0) }), []);
  const mat = useMemo(() => {
    const map = entityTexture(MODEL.texture);
    const material = new THREE.MeshStandardMaterial({
      map,
      emissiveMap: map,
      emissive: '#ffffff',
      emissiveIntensity: emissive,
      roughness: 0.9,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 1,
    });
    material.onBeforeCompile = (sh) => {
      sh.uniforms.uHeat = heat;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vAxisY;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAxisY = position.y;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uHeat;\nvarying float vAxisY;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += uHeat * emissiveColor.rgb * smoothstep(${(HEAD_START_Y - 0.25).toFixed(3)}, ${(HEAD_START_Y + 0.02).toFixed(3)}, vAxisY);`);
    };
    material.customProgramCacheKey = () => 'mace-heat';
    return material;
  }, [opacity, emissive, heat]);
  // 在 ThreeCanvas 出这一帧之前换（它在 useEffect 里出帧，layout effect 先跑）；淡出时不投影，同别的物品
  useLayoutEffect(() => {
    heat.value.copy(WARM_GOLD).multiplyScalar(1.6 * glow);
    ref.current?.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.material = mat;
      obj.castShadow = opacity >= 1;
    });
  }, [mat, opacity, heat, glow]);
  return (
    <group ref={ref} rotation={[Math.PI / 2, 0, 0]} position={AXIS_OFFSET}>
      <BedrockModelView model={MODEL} scale={MODEL_SCALE / 16} />
    </group>
  );
};

// 挂到骨架手上（握持点坐标系单位是 MC 像素，要乘 16；玩家模型整体 0.9375 倍，锤也跟着缩）：
// <group quaternion={bladeInHand(姿态, 角度)}><MaceInHand /></group>；锤头上要叠东西（压路机虚影）放进 `头部`，原点在锤头中心
// 发光：见 `Mace`（6-3 下坠传金光强度）
export const MaceInHand: React.FC<{ headSlot?: React.ReactNode; opacity?: number; glow?: number }> = ({ headSlot, opacity, glow }) => (
  <group scale={16}>
    <Mace opacity={opacity} glow={glow} />
    {headSlot && <group position={[0, 0, MACE.head]}>{headSlot}</group>}
  </group>
);
