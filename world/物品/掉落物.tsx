// 掉落物：第 1 场一镜到底里，被长矛冲刺击杀的六处 boss 的战利品箱打碎后飞出来的物品（用户 10-02）。
// 挑哪几件按暮色森林 4.3.2508 jar 的 loot_tables/entities/*.json（见 镜头/一镜到底/战利品.tsx 的表），中文名取 jar 里 zh_cn.json。贴图照抄 jar（npm run 取材 -- 掉落物）：
//   暮色森林：hydra_chop、carminite、fiery_tears、ice_bomb、triple_bow；原版 1.20.1：ender_pearl、bone、golden_chestplate、golden_sword、snowball、block/packed_ice；
//   巨人镐、巨人剑（twilightforest:giant_pickaxe / giant_sword）的物品模型直接用原版石镐、石剑的贴图，只是显示变换放大（giant_tool_base）；
//   车万女仆 1.5.3：扫帚（touhou_little_maid:broom，item/generated、贴图 item/broom.png；6-1-9 收扫帚时扫帚变成它被吸进李樱身体里）；
//   炽热的血、雪怪首领毛皮直接读 物品/战利品.tsx 的那两张贴图（npm run 取材 -- 战利品贴图）。
// 大小按掉在地上（ground）的显示变换：item/generated 0.5 → 半格大的一张；giant_tool_base 的 ground 2.5 → 2.5 格；方块物品（浮冰）block/block 的 ground 0.25 → 四分之一格小方块。
// 坐标：中心在原点，单位格；贴图正面朝 +Z、上 = +Y（物品空间）。
import React from 'react';
import { ItemSprite } from '../../engine/model/物品贴图.tsx';
import { png } from '../../engine/model/贴图.ts';
import { entityTexture } from '../../engine/model/贴图方盒.tsx';
import bloodTex from 'asset:贴图/物品/炽热的血';
import furTex from 'asset:贴图/物品/雪怪首领毛皮';
import hydraChopPng from 'asset:贴图/物品/掉落物/九头蛇肉排';
import carminitePng from 'asset:贴图/物品/掉落物/砷铅铁矿石';
import fieryTearsPng from 'asset:贴图/物品/掉落物/炽热之泪';
import iceBombPng from 'asset:贴图/物品/掉落物/冰霜炸弹';
import tripleBowPng from 'asset:贴图/物品/掉落物/三发弓';
import enderPearlPng from 'asset:贴图/物品/掉落物/末影珍珠';
import bonePng from 'asset:贴图/物品/掉落物/骨头';
import goldChestplatePng from 'asset:贴图/物品/掉落物/金胸甲';
import goldSwordPng from 'asset:贴图/物品/掉落物/金剑';
import snowballPng from 'asset:贴图/物品/掉落物/雪球';
import packedIcePng from 'asset:贴图/物品/掉落物/浮冰';
import giantPickaxePng from 'asset:贴图/物品/掉落物/巨人镐';
import giantSwordPng from 'asset:贴图/物品/掉落物/巨人剑';
import broomPng from 'asset:贴图/物品/掉落物/扫帚';

type ItemDef = { tex: string; 大小: number; 方块?: boolean };
const itemTable = {
  炽热的血: { tex: bloodTex, 大小: 0.5 },
  雪怪首领毛皮: { tex: furTex, 大小: 0.5 },
  九头蛇肉排: { tex: hydraChopPng, 大小: 0.5 },
  砷铅铁矿石: { tex: carminitePng, 大小: 0.5 },
  炽热之泪: { tex: fieryTearsPng, 大小: 0.5 },
  冰霜炸弹: { tex: iceBombPng, 大小: 0.5 },
  三发弓: { tex: tripleBowPng, 大小: 0.5 },
  末影珍珠: { tex: enderPearlPng, 大小: 0.5 },
  骨头: { tex: bonePng, 大小: 0.5 },
  金胸甲: { tex: goldChestplatePng, 大小: 0.5 },
  金剑: { tex: goldSwordPng, 大小: 0.5 },
  雪球: { tex: snowballPng, 大小: 0.5 },
  浮冰: { tex: packedIcePng, 大小: 0.25, 方块: true },
  巨人镐: { tex: giantPickaxePng, 大小: 2.5 },
  巨人剑: { tex: giantSwordPng, 大小: 2.5 },
  扫帚: { tex: broomPng, 大小: 0.5 },
} satisfies Record<string, ItemDef>;
export type DropName = keyof typeof itemTable;
export const dropSize = (name: DropName) => itemTable[name].大小;

const layersCache = new Map<string, { tex: ReturnType<typeof png> }[]>();
const layersOf = (name: DropName) => {
  let layers = layersCache.get(name);
  if (!layers) layersCache.set(name, (layers = [{ tex: png(itemTable[name].tex) }]));
  return layers;
};

// 方块物品：六面同一张贴图的小方块
const BlockItem: React.FC<{ name: DropName; size: number; glow: number }> = ({ name: name, size, glow: glow }) => {
  const map = entityTexture(png(itemTable[name].tex));
  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[size, size, size]} />
      <meshStandardMaterial map={map} roughness={0.6} emissive="#ffffff" emissiveMap={map} emissiveIntensity={glow} />
    </mesh>
  );
};

// 掉在地上那么大的一件（拾取前的物品实体）。亮：自发光打底（暗处、远处看得清一点）
export const DropItem: React.FC<{ name: DropName; glow?: number }> = ({ name: name, glow: glow = 0.3 }) => {
  const it: ItemDef = itemTable[name];
  if (it.方块) return <BlockItem name={name} size={it.大小} glow={glow} />;
  return (
    <group scale={it.大小}>
      <ItemSprite layers={layersOf(name)} emissive={glow} />
    </group>
  );
};
