// 第 3 句祭坛召唤用到的模组模型和物品：车万女仆祭坛整座、御币（拿在手里那个立体的），柱顶的六样原版材料。都是 jar 里的原样（取材配方 女仆祭坛、祭坛材料）。
// 坐标照场景约定（Z 朝上，单位格）。几何的依据（TLM 1.5.3 反汇编）：
// - TileEntityAltarRenderer：一个方块实体画整座 altar.json（转 180° 摆正，正面朝南），柱顶的材料各自在柱顶格上 (0.5, 1.25 + 浮动, 0.5)、绕竖轴转、按 GROUND 显示变换画；
// - 御币拿在手里：models/item/hakurei_gohei_in_hand.json，第三人称显示变换只有平移 [0, 2.75, 1.25]。
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { BedrockModel } from '@engine/model/基岩模型.tsx';
import { BedrockModelView } from '@engine/model/基岩模型.tsx';
import { BlockModel, type BlockModelData } from '@engine/model/方块模型.tsx';
import { DISPLAY, ItemDisplay, ItemSprite, type ItemLayer, type ItemTransform, itemMesh } from '@engine/model/物品贴图.tsx';
import { png } from '@engine/model/贴图.ts';
import type { FloatState } from './编排.ts';
import altarData from 'asset:模型/场景/女仆祭坛';
import altarTexture from 'asset:贴图/场景/女仆祭坛';
import goheiData from 'asset:模型/物品/御币';
import goheiTexture from 'asset:贴图/物品/御币';
import diamondPng from 'asset:贴图/物品/钻石';
import goldIngotPng from 'asset:贴图/物品/祭坛材料/金锭';
import redstonePng from 'asset:贴图/物品/祭坛材料/红石';
import lapisPng from 'asset:贴图/物品/祭坛材料/青金石';
import ironIngotPng from 'asset:贴图/物品/祭坛材料/铁锭';
import coalPng from 'asset:贴图/物品/祭坛材料/煤炭';
import { rad } from '@engine/core/数学.ts';

const altarModel = { ...(altarData as unknown as object), texture: png(altarTexture) } as unknown as BedrockModel;
const goheiModel = goheiData as unknown as BlockModelData;
const goheiAtlas = png(goheiTexture);

/** 柱顶材料的物品图（参数.ts 的 柱顶材料 的 名） */
export const materialLayers: Readonly<Record<string, ItemLayer[]>> = {
  钻石: [{ tex: png(diamondPng) }],
  金锭: [{ tex: png(goldIngotPng) }],
  红石: [{ tex: png(redstonePng) }],
  青金石: [{ tex: png(lapisPng) }],
  铁锭: [{ tex: png(ironIngotPng) }],
  煤炭: [{ tex: png(coalPng) }],
};

/** 整座祭坛：模型原点就是圈心地面（六根柱子围着它），altar.json 的正面（鸟居那边是背面）在场景里朝南 */
export const MaidAltar: React.FC = () => <BedrockModelView model={altarModel} />;

// 物品空间（Y 朝上、正面 +Z）→ 场景（Z 朝上、南 = −Y）
const itemSceneRotation: [number, number, number] = [Math.PI / 2, 0, 0];

/** 白剪影：合成那一下材料整个变白（演绎）。不受光（ShaderMaterial 平涂不碰） */
const whiteSilhouetteMaterial = (tex: THREE.Texture, color: string) =>
  new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, color: { value: new THREE.Color(color) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D map; uniform vec3 color; varying vec2 vUv; void main() { if (texture2D(map, vUv).a < 0.5) discard; gl_FragColor = vec4(color, 1.0); }',
    side: THREE.DoubleSide,
    toneMapped: false,
  });

const WhiteItem: React.FC<{ layers: ItemLayer[]; 色: string }> = ({ layers, 色: color }) => {
  const { g, tex } = itemMesh(layers);
  const mat = useMemo(() => whiteSilhouetteMaterial(tex, color), [tex, color]);
  return <mesh geometry={g} material={mat} />;
};

/** 柱顶一样材料（物、亮两样；化成光以后归 光.tsx 画）。亮色 = 变白那一下的颜色 */
export const PillarTopItem: React.FC<{ floatState: Extract<FloatState, { kind: '物' | '亮' }>; brightColor: string }> = ({ floatState, brightColor }) => {
  const layers = materialLayers[floatState.名]!;
  return (
    <group position={floatState.p} rotation={[0, 0, rad(floatState.转)]}>
      <group rotation={itemSceneRotation}>
        <ItemDisplay t={DISPLAY.generated.ground}>{floatState.kind === '物' ? <ItemSprite layers={layers} /> : <WhiteItem layers={layers} 色={brightColor} />}</ItemDisplay>
      </group>
    </group>
  );
};

/** 御币拿在手里时的显示变换（hakurei_gohei_in_hand.json 的 thirdperson_righthand） */
export const goheiDisplay: ItemTransform = { translation: [0, 2.75, 1.25] };
/** 御币，物品空间（中心在原点、Y 朝上、正面 +Z，同 ItemSprite），给 HeldItem 当 children。方块模型是 Z 朝上、北 = +Y，绕 X 转 −90° 换回物品空间 */
export const Gohei: React.FC = () => (
  <group rotation={[-Math.PI / 2, 0, 0]}>
    <BlockModel data={goheiModel} atlas={goheiAtlas} part="御币" />
  </group>
);
