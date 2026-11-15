// 安息仪式的画法：结构（方块拼搭 + 会动的灵魂火 + 笼里的图腾）、基座上的祭品、仪式过程（祭品往祭坛喷碎屑、完成的暗红光柱）、
// 过渡实体（法阵和两道环、聚风带、大烟、现身那一下的火焰）。摆法、时刻、出处在 安息仪式时序.ts。都按秒算，自己不取时间。
// 坐标：场景约定（Z 朝上，单位格），放在 rotation [−π/2, 0, 0] 的 group 里；祭坛那一列中心在 (0, 0)，黑曜石底的顶是 z = 0。
// 和游戏不一样的地方（粗做）：
//   聚风带的宽度方向照游戏跟着镜头偏航歪（WindTrailParticle.getCameraRot），取的是 useThree 的相机朝向，前提是演出整体没再转过；游戏里带头那一截因为没更新 xo 会每帧闪回出生点，没照做。
//   灵魂火的烟（BaseFireBlock.animateTick，3 颗 LARGE_SMOKE）出烟率取决于玩家站哪，这里固定按游戏实拍机位（玩家格）算，片里镜头怎么动都不变。
//   祭坛的眼睛（lit 的 composite 模型第二层）画在 方块拼搭 的祭坛上面，自己加了 polygonOffset 防共面；完成光柱的粗细核过源码和实拍是一样的（宽约 0.65～0.9 格），没改。
//   物品碎屑不算碰撞，只在撞进祭坛那一列时停住；灵魂火的面片双面画（游戏里每片只有一面）。
//   暗影精华的 4 帧图标游戏里帧间插值，这里只换帧。
//   没做：祭坛脚边转圈的图腾粒子（goety:totem_effect，没有灵魂时每秒一次、仪式中每刻一次）、祭坛上方每秒两颗幽匿灵魂粒子、仪式没开始时祭坛格里每刻 4 颗火焰（贴图都没取）。
// 待迁移（私有资产）：破碎之环是启示录的（保留所有权益），只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import { useThree } from '@react-three/fiber';
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { clamp01, lerp, rad, mulberry32 } from '@engine/core/数学.ts';
import { BlockModel, type BlockModelData } from '@engine/model/方块模型.tsx';
import { BlockAssembly } from '@engine/model/方块拼搭.tsx';
import { type V3 } from '@engine/model/parts.tsx';
import { ItemSprite, type ItemLayer } from '@engine/model/物品贴图.tsx';
import { png, type Png } from '@engine/model/贴图.ts';
import { GlintItem } from '@库/物品/附魔物品.tsx';
import { type Particle, ParticleQuads, particleTexture } from '@库/特效/粒子面片.tsx';
import { type ParticleSpawn, vanillaParticleAtlas, VanillaParticles } from '@库/特效/原版粒子.tsx';
import grimoireModelData from 'asset:模型/仪式/炼狱魔典';
import grimoirePng from 'asset:贴图/仪式/炼狱魔典';
import altarModelData from 'asset:模型/方块/黑暗祭坛';
import altarEyePng from 'asset:贴图/方块/黑暗祭坛.激活';
import summonCirclePng from 'asset:贴图/仪式/goety/entity/cultist/summon_apostle';
import apostleRingPng from 'asset:贴图/仪式/goety/entity/cultist/summon_apostle_ring';
import gatheringTrailPng from 'asset:贴图/仪式/goety/particle/gathering_trail';
import croneHatPng from 'asset:贴图/仪式/goety/item/crone_hat';
import forbiddenScrollPng from 'asset:贴图/仪式/goety/item/forbidden_scroll';
import fullTotemPng from 'asset:贴图/仪式/goety/item/full_totem';
import heartOfNightPng from 'asset:贴图/仪式/goety/item/heart_of_the_night';
import maleficHelmPng from 'asset:贴图/仪式/goety/item/malefic_helm';
import shadowEssencePng from 'asset:贴图/仪式/goety/item/shadow_essence';
import soulRubyPng from 'asset:贴图/仪式/goety/item/soul_ruby';
import unholyBloodPng from 'asset:贴图/仪式/goety/item/unholy_blood';
import warlockSashPng from 'asset:贴图/仪式/goety/item/warlock_sash';
import soulFire0Png from 'asset:贴图/仪式/minecraft/block/soul_fire_0';
import soulFire1Png from 'asset:贴图/仪式/minecraft/block/soul_fire_1';
import dragonBreathPng from 'asset:贴图/仪式/minecraft/item/dragon_breath';
import netherStarPng from 'asset:贴图/仪式/minecraft/item/nether_star';
import goldenApplePng from 'asset:贴图/法术/minecraft/item/golden_apple';
import brokenRingPng from 'asset:贴图/物品/破碎之环';
import {
  baseCells,
  summonStateAt,
  totemPos,
  game,
  soulFireCells,
  altarCell,
  activatorPos,
  itemSpinPerTick,
  offerings,
  offeringPos,
  altarCenter,
  structureBlocks,
  type SummonPlan,
  type OfferingName,
} from './安息仪式时序.ts';


// ---------- 物品 ----------
/** 竖条动画图标取一帧（暗影精华 16×64，mcmeta 每帧 2 刻） */
const cropFrame = (image: Png, frame: number): Png => ({ w: image.w, h: image.w, px: image.px.subarray(frame * image.w * image.w * 4, (frame + 1) * image.w * image.w * 4) });
const shadowEssenceFrames = (() => {
  let frames: Png[] | undefined;
  return () => (frames ??= [0, 1, 2, 3].map((i) => cropFrame(png(shadowEssencePng), i)));
})();

const flatIcons: Record<Exclude<OfferingName, '炼狱魔典' | '暗影精华'>, { 图: string; enchantGlow?: boolean }> = {
  暗夜之心: { 图: heartOfNightPng },
  龙息: { 图: dragonBreathPng },
  禁忌卷轴: { 图: forbiddenScrollPng },
  // 附魔金苹果、下界之星游戏里带附魔光效（EnchantedGoldenAppleItem、SimpleFoiledItem 的 isFoil）
  附魔金苹果: { 图: goldenApplePng, enchantGlow: true },
  下界之星: { 图: netherStarPng, enchantGlow: true },
  不洁之血: { 图: unholyBloodPng },
  灵魂红宝石: { 图: soulRubyPng },
  邪恶头盔: { 图: maleficHelmPng },
  老巫婆帽: { 图: croneHatPng },
  术士腰带: { 图: warlockSashPng },
};
const layerCache = new Map<string, ItemLayer[]>();
const itemLayers = (imagePath: string): ItemLayer[] => {
  let l = layerCache.get(imagePath);
  if (!l) layerCache.set(imagePath, (l = [{ tex: png(imagePath) }]));
  return l;
};
const shadowLayerCache: ItemLayer[][] = [];

/** 碎屑用的贴图：图标（暗影精华取第一帧，魔典取模型贴图） */
const offeringImage = (name: OfferingName): Png => (name === '炼狱魔典' ? png(grimoirePng) : name === '暗影精华' ? shadowEssenceFrames()[0]! : png(flatIcons[name].图));

/** 平面物品摆成掉落物的样子（item/generated 的 ground：缩到 0.5；往上 2/16 已经算在位置里），物品空间 Y 朝上 → 场景 Z 朝上 */
const GroundItem: React.FC<{ spinDeg: number; 缩放?: number; children: React.ReactNode }> = ({ spinDeg, 缩放: scale = 1, children }) => (
  <group rotation={[0, 0, rad(spinDeg)]} scale={0.5 * scale}>
    <group rotation={[Math.PI / 2, 0, 0]}>{children}</group>
  </group>
);

/**
 * 一件祭品，中心在原点、照基座上的大小（游戏里的掉落物显示，半格大）。秒：转动和附魔光效、暗影精华换帧的钟。
 * 炼狱魔典是立体的合着的书（默认 active = 0 走 infernal_tome_close），别的是平面图标。
 */
export const Offering: React.FC<{ 名: OfferingName; 秒: number; 缩放?: number }> = ({ 名: name, 秒: sec, 缩放: scale = 1 }) => {
  const spinDeg = itemSpinPerTick * sec * 20;
  if (name === '炼狱魔典') {
    // BlockModel 已经是 Z 朝上；模型的 ground 变换和 item/generated 一样（往上 2、缩 0.5）
    return (
      <group rotation={[0, 0, rad(spinDeg)]} scale={0.5 * scale}>
        <BlockModel data={grimoireModelData as unknown as BlockModelData} atlas={png(grimoirePng)} part="书" />
      </group>
    );
  }
  if (name === '暗影精华') {
    const frame = ((Math.floor((sec * 20) / 2) % 4) + 4) % 4; // 秒可以是负的（仪式开始前）
    const l = (shadowLayerCache[frame] ??= [{ tex: shadowEssenceFrames()[frame]! }]);
    return (
      <GroundItem spinDeg={spinDeg} 缩放={scale}>
        <ItemSprite layers={l} />
      </GroundItem>
    );
  }
  const itemDef = flatIcons[name];
  return (
    <GroundItem spinDeg={spinDeg} 缩放={scale}>
      {itemDef.enchantGlow ? <GlintItem layers={itemLayers(itemDef.图)} sec={sec} /> : <ItemSprite layers={itemLayers(itemDef.图)} />}
    </GroundItem>
  );
};

/** 祭坛上的破碎之环、笼里的灵魂图腾：同样的掉落物显示 */
export const BrokenRing: React.FC<{ 秒: number }> = ({ 秒: sec }) => (
  <GroundItem spinDeg={itemSpinPerTick * sec * 20}>
    <ItemSprite layers={itemLayers(brokenRingPng)} />
  </GroundItem>
);
const SoulTotem: React.FC<{ 秒: number }> = ({ 秒: sec }) => (
  <GroundItem spinDeg={itemSpinPerTick * sec * 20}>
    <ItemSprite layers={itemLayers(fullTotemPng)} />
  </GroundItem>
);

// ---------- 灵魂火 ----------
// 照原版 soul_fire 的方块状态（multipart 没有条件，全都画）：template_fire_floor 四片往里斜 22.5 度的面（rescale），加四边各一片贴边的 template_fire_side。
// 贴图 soul_fire_0 / soul_fire_1 是 16×512 的 32 帧竖条，每刻一帧；soul_fire_0 的帧序照 mcmeta 从第 16 帧起。面高 22.4 像素，贴图拉满。
const fireGeometry = (() => {
  let g: [THREE.BufferGeometry, THREE.BufferGeometry] | undefined;
  return () => {
    if (g) return g;
    // 一片：四个角的方块像素坐标（游戏轴 x、y 上、z 南）+ uv（v = 0 是贴图顶）
    type Quad = { 角: [number, number, number][]; flipped: boolean; 图: 0 | 1 };
    const pieces: Quad[] = [];
    const scale = 1 / Math.cos(rad(22.5));
    const rotatePoint = (p: [number, number, number], axis: 'x' | 'z', angleDeg: number): [number, number, number] => {
      const [x, y, z] = [p[0] - 8, p[1] - 8, p[2] - 8];
      const [c, s] = [Math.cos(rad(angleDeg)), Math.sin(rad(angleDeg))];
      // rescale：垂直转轴的两个方向放大 1/cos
      const r: [number, number, number] = axis === 'x' ? [x, (y * c - z * s) * scale, (y * s + z * c) * scale] : [(x * c - y * s) * scale, (x * s + y * c) * scale, z];
      return [r[0] + 8, r[1] + 8, r[2] + 8];
    };
    const verticalSheet = (axis: 'z' | 'x', value: number): [number, number, number][] =>
      axis === 'z' ? [[0, 22.4, value], [16, 22.4, value], [16, 0, value], [0, 0, value]] : [[value, 22.4, 0], [value, 22.4, 16], [value, 0, 16], [value, 0, 0]];
    pieces.push({ 角: verticalSheet('z', 8.8).map((p) => rotatePoint(p, 'x', -22.5)), flipped: false, 图: 0 });
    pieces.push({ 角: verticalSheet('z', 7.2).map((p) => rotatePoint(p, 'x', 22.5)), flipped: false, 图: 0 });
    pieces.push({ 角: verticalSheet('x', 8.8).map((p) => rotatePoint(p, 'z', -22.5)), flipped: false, 图: 0 });
    pieces.push({ 角: verticalSheet('x', 7.2).map((p) => rotatePoint(p, 'z', 22.5)), flipped: false, 图: 0 });
    // 四边：游戏里每边从 side0、side1、side_alt0、side_alt1 里随机挑，这里固定轮着用
    pieces.push({ 角: verticalSheet('z', 0.01), flipped: false, 图: 0 });
    pieces.push({ 角: verticalSheet('z', 15.99), flipped: true, 图: 1 });
    pieces.push({ 角: verticalSheet('x', 0.01), flipped: true, 图: 0 });
    pieces.push({ 角: verticalSheet('x', 15.99), flipped: false, 图: 1 });
    const buildGeometry = (imageIndex: 0 | 1) => {
      const pos: number[] = [];
      const uv: number[] = [];
      const idx: number[] = [];
      for (const quad of pieces.filter((f) => f.图 === imageIndex)) {
        const startVertex = pos.length / 3;
        // 游戏 (x, y, z) → 场景 (x, −z, y)，格的中心在原点、底在 z = 0
        for (const [x, y, z] of quad.角) pos.push(x / 16 - 0.5, -(z / 16 - 0.5), y / 16);
        const [u0, u1] = quad.flipped ? [1, 0] : [0, 1];
        uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
        idx.push(startVertex, startVertex + 1, startVertex + 2, startVertex, startVertex + 2, startVertex + 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      return geo;
    };
    return (g = [buildGeometry(0), buildGeometry(1)]);
  };
})();
const verticalStripTexture = (uri: string) => {
  const image = png(uri);
  const t = new THREE.DataTexture(image.px, image.w, image.h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.repeat.set(1, image.w / image.h);
  t.needsUpdate = true;
  return { t, 帧数: image.h / image.w };
};

/** 一团灵魂火，占一格：格的水平中心在原点，底在 z = 0。不受光（火自己发光） */
export const SoulFire: React.FC<{ 秒: number }> = ({ 秒: sec }) => {
  const soulFireMaterials = useMemo(() => {
    const makeTexture = (uri: string) => {
      const { t, 帧数: frameCount } = verticalStripTexture(uri);
      return { t, 帧数: frameCount, m: new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide }) };
    };
    return [makeTexture(soulFire0Png), makeTexture(soulFire1Png)] as const;
  }, []);
  const tick = Math.floor(sec * 20);
  // soul_fire_0 的 mcmeta 帧序是 16…31、0…15；soul_fire_1 是顺序
  soulFireMaterials[0].t.offset.y = ((tick + 16) % soulFireMaterials[0].帧数) / soulFireMaterials[0].帧数;
  soulFireMaterials[1].t.offset.y = (tick % soulFireMaterials[1].帧数) / soulFireMaterials[1].帧数;
  const [g0, g1] = fireGeometry();
  return (
    <group>
      <mesh geometry={g0} material={soulFireMaterials[0].m} />
      <mesh geometry={g1} material={soulFireMaterials[1].m} />
    </group>
  );
};

// ---------- 祭坛的眼睛 ----------
// dark_altar[lit=true] 的模型是 forge:composite：同一个 template_altar 画两遍，底层贴 dark_altar（方块拼搭已经画了），上面再叠一层贴 dark_altar_activated（两只发绿光的眼睛）。
// 这里只画上面那层：同一个模型，贴图换成 激活 那张（64×64，和底层同样的 uv），略往外偏一点免得和底层共面闪。
const eyeFillMaterial = (m: THREE.MeshStandardMaterial) => {
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -2;
  m.emissiveIntensity = 1; // 眼睛自己发光
};
const AltarEye: React.FC = () => <BlockModel data={altarModelData as unknown as BlockModelData} atlas={png(altarEyePng)} part="祭坛" patch={eyeFillMaterial} />;

// ---------- 结构 ----------
/**
 * 仪式结构：黑曜石底 7×7、哭泣黑曜石 3×3 台、中心诅咒笼（里面转着灵魂图腾）上摞点亮的黑暗祭坛、四个斜角灵魂土上的灵魂火、外圈 12 个基座。
 * 不含祭品和破碎之环。黑曜石底 = false 时不画底下那层（场地自己有地面时用，基座和灵魂土照旧立在 z = 0）。
 */
export const RestRitualStructure: React.FC<{ 秒: number; obsidianBase?: boolean; withSoulFire?: boolean }> = ({ 秒: sec, obsidianBase = true, withSoulFire = true }) => {
  const blocks = useMemo(() => structureBlocks({ obsidianBase }), [obsidianBase]);
  return (
    <group>
      <BlockAssembly blocks={blocks} 原点={originPos} />
      {withSoulFire &&
        soulFireCells.map(([i, j, k]) => (
          <group key={`${i},${j}`} position={[i, j, k]}>
            <SoulFire 秒={sec} />
          </group>
        ))}
      <group position={totemPos}>
        <SoulTotem 秒={sec} />
      </group>
      <group position={[altarCell[0], altarCell[1], altarCell[2] + 0.5]}>
        <AltarEye />
      </group>
    </group>
  );
};
const originPos: V3 = [-0.5, -0.5, 0];

// ---------- 祭品喷向祭坛的碎屑 ----------
// Ritual.update：仪式进行时每刻、每个还有祭品的基座，在基座上方 1.5 格放一颗 ITEM 粒子（BreakingItemParticle），速度 (0.1 × 到祭坛的格数, 0.3, …)。
// BreakingItemParticle：重力 1、摩擦 0.98、半边长 0.1 × (随机 × 0.5 + 0.5)（父类的再除 2）、寿命 4 ÷ (随机 × 0.9 + 0.1) 刻、贴图取图标上随机一块 4×4 像素。
type Debris = { sacrificeIndex: number; 刻: number; 种子: number };
const debrisState = (c: Debris, currentTick: number): Particle | null => {
  const τ = currentTick - c.刻;
  if (τ < 0) return null;
  const rand = mulberry32(c.种子 * 2654435761 + 31);
  const lifetime = Math.floor(4 / (rand() * 0.9 + 0.1));
  const ageTicks = Math.floor(τ);
  if (ageTicks >= lifetime) return null;
  const [gx, gy] = baseCells[c.sacrificeIndex]!;
  // 父类随机速度 × 0.1 + 给的速度
  let x = (rand() * 2 - 1) * 0.4;
  let y = (rand() * 2 - 1) * 0.4;
  let z = (rand() * 2 - 1) * 0.4;
  const speed = (rand() + rand() + 1) * 0.15;
  const vecLength = Math.hypot(x, y, z) || 1;
  let v: V3 = [((x / vecLength) * speed * 0.4) * 0.1 + 0.1 * -gx, ((y / vecLength) * speed * 0.4) * 0.1 + 0.1 * -gy, ((z / vecLength) * speed * 0.4 + 0.1) * 0.1 + 0.3];
  const halfSize = (0.1 * (rand() * 0.5 + 0.5) * 2) / 2;
  const [u, w] = [rand() * 3, rand() * 3];
  let p: V3 = [gx, gy, 1.5];
  let prev = p;
  let stopped = false;
  for (let k = 0; k < ageTicks && !stopped; k++) {
    prev = p;
    v = [v[0], v[1], v[2] - 0.04];
    const nextPos: V3 = [p[0] + v[0], p[1] + v[1], p[2] + v[2]];
    // 撞进祭坛、笼那一列就停在外面
    if (Math.abs(nextPos[0]) < 0.5 && Math.abs(nextPos[1]) < 0.5 && nextPos[2] < 3) {
      stopped = true;
      prev = p;
      break;
    }
    p = nextPos;
    v = [v[0] * 0.98, v[1] * 0.98, v[2] * 0.98];
  }
  const f = stopped ? 1 : τ - ageTicks;
  return { p: [lerp(prev[0], p[0], f), lerp(prev[1], p[1], f), lerp(prev[2], p[2], f)], half: halfSize, uv: [u / 4, w / 4, (u + 1) / 4, (w + 1) / 4], color: [1, 1, 1] };
};

/** 起、止：喷碎屑的时间段（秒）。每件祭品一批（各用自己的图标当贴图） */
const OfferingDebris: React.FC<{ 秒: number; 起: number; 止: number; 种子: number }> = ({ 秒: sec, 起: startSec, 止: endSec, 种子: seed }) => {
  const currentTick = sec * 20;
  const debrisTable = useMemo(() => {
    const perItemDebrisTable: Debris[][] = offerings.map(() => []);
    for (let tick = Math.ceil(startSec * 20); tick < endSec * 20; tick++) for (let sacrificeIndex = 0; sacrificeIndex < offerings.length; sacrificeIndex++) perItemDebrisTable[sacrificeIndex]!.push({ sacrificeIndex, 刻: tick, 种子: seed * 7919 + tick * 13 + sacrificeIndex });
    return perItemDebrisTable;
  }, [startSec, endSec, seed]);
  return (
    <>
      {offerings.map((offering, sacrificeIndex) => {
        const image = offeringImage(offering.名);
        // 魔典的贴图是 256×32 的模型图集，只取左上 32×32 那块里的碎片
        const uScale = offering.名 === '炼狱魔典' ? image.h / image.w : 1;
        const particles = debrisTable[sacrificeIndex]!.map((c) => debrisState(c, currentTick)).filter((s): s is Particle => !!s);
        for (const s of particles) s.uv = [s.uv[0] * uScale, s.uv[1], s.uv[2] * uScale, s.uv[3]];
        return <ParticleQuads key={sacrificeIndex} tex={particleTexture(image.px, image.w, image.h, image)} items={particles} />;
      })}
    </>
  );
};

// ---------- 完成的光柱 ----------
// StretchedGodRayParticle（SabbathRitualType.sendFinishRay，颜色 ChatFormatting.DARK_RED = 0xAA0000）：活 20 刻，四片竖直的面围成方筒，
// 进度 = easeInOutSine(1 − |年龄 − 10| ÷ 10)；高 5 × 进度；半边长从 0.375（后半段 0.45）收到 0.325；底的不透明度 0.5→1，顶是 0；加法混合。
const LightPillar: React.FC<{ ageTick: number }> = ({ ageTick }) => {
  const { geo, mat } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(16 * 3), 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(16 * 4), 4));
    geo.setIndex([0, 1, 2, 3].flatMap((f) => [f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3]));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    return { geo, mat };
  }, []);
  if (ageTick < 0 || ageTick >= game.pillarTicks) return null;
  const halfLifeTicks = game.pillarTicks / 2;
  const progress = -(Math.cos(Math.PI * (1 - Math.abs(ageTick - halfLifeTicks) / halfLifeTicks)) - 1) / 2;
  const d = lerp((ageTick < halfLifeTicks ? 0.75 : 0.9) * 0.5, 0.325, progress);
  const h = 5 * progress;
  const bottomAlpha = lerp(0.5, 1, progress);
  const red = new THREE.Color(0xaa0000);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const col = geo.getAttribute('color') as THREE.BufferAttribute;
  const edges: [number, number, number, number][] = [[-d, -d, -d, d], [-d, -d, d, -d], [d, -d, d, d], [-d, d, d, d]];
  edges.forEach(([x0, y0, x1, y1], f) => {
    const points: [number, number, number, number][] = [[x0, y0, 0, bottomAlpha], [x1, y1, 0, bottomAlpha], [x1, y1, h, 0], [x0, y0, h, 0]];
    points.forEach(([x, y, z, a], k) => {
      pos.setXYZ(f * 4 + k, x, y, z);
      col.setXYZW(f * 4 + k, red.r, red.g, red.b, a);
    });
  });
  pos.needsUpdate = true;
  col.needsUpdate = true;
  return <mesh geometry={geo} material={mat} frustumCulled={false} />;
};

// ---------- 过渡实体：法阵和两道环 ----------
// SummonApostleRenderer：三张水平的方片（entityCutoutNoCull、满亮度），半边长 = 法阵半边。地面那张 summon_apostle.png 转 90 + 年龄 度；
// 两张 summon_apostle_ring.png 升到 2、4 格高，各转 90 − 年龄 ÷ 2、90 + 年龄 ÷ 2 度（年龄按刻）。
const squareGeometry = (() => {
  let g: THREE.BufferGeometry | undefined;
  return () => {
    if (g) return g;
    g = new THREE.BufferGeometry();
    // 游戏 (x, z) = (−1, −1) 对 uv (0, 0)；场景 y = −z
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 1, 0, -1, -1, 0, 1, -1, 0, 1, 1, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1, 1, 0], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return g;
  };
})();
const flatTexture = (uri: string) => {
  const image = png(uri);
  const t = new THREE.DataTexture(image.px, image.w, image.h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
};
/** 过渡实体的法阵和两道环，原点 = 实体的位置。年龄刻：真实时间的刻；半边、环高由 召唤状态在 给 */
export const SummonCircle: React.FC<{ ageTick: number; 半边: number; ringHeight: readonly [number, number] }> = ({ ageTick, 半边: halfSide, ringHeight }) => {
  const [circleMaterial, ringMaterial] = useMemo(() => [summonCirclePng, apostleRingPng].map((u) => new THREE.MeshBasicMaterial({ map: flatTexture(u), alphaTest: 0.1, side: THREE.DoubleSide })), []);
  if (halfSide <= 0) return null;
  const g = squareGeometry();
  return (
    <group>
      <mesh geometry={g} material={circleMaterial} position={[0, 0, 0.001]} rotation={[0, 0, rad(90 + ageTick)]} scale={halfSide} />
      <mesh geometry={g} material={ringMaterial} position={[0, 0, ringHeight[0]]} rotation={[0, 0, rad(90 - ageTick / 2)]} scale={halfSide} />
      <mesh geometry={g} material={ringMaterial} position={[0, 0, ringHeight[1]]} rotation={[0, 0, rad(90 + ageTick / 2)]} scale={halfSide} />
    </group>
  );
};

// ---------- 过渡实体：聚风带 ----------
// SummonApostle.tick：每 lerpInt(进度, 8, 2) 刻放一条，采样数 lerpInt(进度, 8, 15)、带宽 lerp(进度, 0.3, 0.9)、活 90 刻，三分之一暗红（0xAA0000）、其余黑；
// 出生在实体四周 ±(2～5) 格、实体顶的高度。WindGatherParticle：每刻偏航 += ±(0.15～0.25) 弧度，半径 −= 初始半径 ÷ 20 × (0.8～1.2)，最小 0.75～0.95；
// 高度 = (sin(年龄 × 0.2) + 1) × 0.5 × 实体高；最后（采样数 − 1）刻停住让尾巴收拢。带子沿最近「采样数」刻的位置拉，贴图 gathering_trail.png 的 u 从头到尾。
type GatherWind = { spawnTick: number; 采样: number; 宽: number; isRed: boolean; dx: number; dz: number; yawSpeed: number; radiusDecayRatio: number; minRadius: number };
const gatherLifetime = 90;
const gatherWindPos = (c: GatherWind, ageTicks: number): V3 => {
  // 岁：已经走了几刻（整数）。游戏里先走一步再记轨迹，头一次记的时候把整条历史都填成走完第一步的位置，
  // 出生点不进带子（出生用 atan2(dx, dz)、之后用 cos/sin，不是一对，连上会拉出一条横穿法阵的直带）
  const r0 = Math.hypot(c.dx, c.dz);
  const clampedAge = Math.min(Math.max(ageTicks, 1), gatherLifetime - (c.采样 - 1));
  const yaw = Math.atan2(c.dx, c.dz) + c.yawSpeed * clampedAge;
  const radius = Math.max(c.minRadius, r0 - (r0 / 20) * c.radiusDecayRatio * clampedAge);
  // 游戏：x = r cos(偏航)、z = r sin(偏航)；场景 y = −z
  return [radius * Math.cos(yaw), -radius * Math.sin(yaw), (Math.sin((clampedAge - 1) * 0.2) + 1) * 0.5 * game.entityHeight];
};
const layoutGatherWind = (progressTickAt: (realTick: number) => number, endTick: number, seed: number): GatherWind[] => {
  const rand = mulberry32(seed * 48271 + 7);
  const windTable: GatherWind[] = [];
  for (let tick = 1; tick <= endTick; tick++) {
    const progress = clamp01(progressTickAt(tick) / game.transitionTicks);
    const interval = 8 + Math.floor(progress * -6);
    if (tick % interval !== 0) continue;
    windTable.push({
      spawnTick: tick,
      采样: 8 + Math.floor(progress * 7),
      宽: lerp(0.3, 0.9, progress),
      dx: (rand() * 3 + 2) * (rand() < 0.5 ? 1 : -1),
      dz: (rand() * 3 + 2) * (rand() < 0.5 ? 1 : -1),
      isRed: Math.floor(rand() * 3) === 0,
      yawSpeed: (rand() < 0.5 ? 1 : -1) * (0.15 + rand() * 0.1),
      radiusDecayRatio: 0.8 + rand() * 0.4,
      minRadius: 0.75 + rand() * 0.2,
    });
  }
  return windTable;
};

const GatherWindBands: React.FC<{ 表: GatherWind[]; realTick: number }> = ({ 表: windTable, realTick }) => {
  // 带子的「宽度方向」：游戏里 (0, 宽 ÷ 2, 0) 绕 z 轴转 −偏航（WindTrailParticle.getCameraRot），在游戏的 x-y 平面（y 朝上）里歪：偏航 180（朝北）时竖直、偏航 90 时横躺。
  // 这里的 three 世界轴和游戏一致（场景 Z 朝上放在 rotation [−π/2, 0, 0] 的 group 里），所以直接拿相机朝向算；
  // 前提：演出整体没有再转过（游戏偏航 0 = 朝场景 −y）。
  const camera = useThree((st) => st.camera);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const heading = -Math.atan2(-forward.x, forward.z);
  const [tiltX, tiltZ] = [Math.sin(heading), Math.cos(heading)];
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: flatTexture(gatheringTrailPng), vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }), []);
  const geo = useMemo(() => {
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const red = new THREE.Color(0xaa0000);
    for (const c of windTable) {
      const τ = realTick - c.spawnTick;
      if (τ < 1 || τ >= gatherLifetime) continue;
      const ageTicks = Math.floor(τ);
      const f = τ - ageTicks;
      // 第 k 个采样点 = k 刻前的位置（刻间插值）
      const pointAt = (k: number): V3 => {
        const [a, b] = [gatherWindPos(c, ageTicks - k), gatherWindPos(c, ageTicks - k + 1)];
        return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
      };
      const [r, g, b] = c.isRed ? [red.r, red.g, red.b] : [0, 0, 0];
      let cursor = pointAt(0);
      for (let k = 0; k < c.采样; k++) {
        const nextPoint = pointAt(k + 1);
        const [u1, u2] = [k / c.采样, (k + 1) / c.采样];
        const startVertex = pos.length / 3;
        const [hx, hz] = [(tiltX * c.宽) / 2, (tiltZ * c.宽) / 2];
        pos.push(cursor[0] - hx, cursor[1], cursor[2] - hz, nextPoint[0] - hx, nextPoint[1], nextPoint[2] - hz, nextPoint[0] + hx, nextPoint[1], nextPoint[2] + hz, cursor[0] + hx, cursor[1], cursor[2] + hz);
        uv.push(u1, 1, u2, 1, u2, 0, u1, 0);
        for (let q = 0; q < 4; q++) col.push(r, g, b);
        idx.push(startVertex, startVertex + 1, startVertex + 2, startVertex, startVertex + 2, startVertex + 3);
        cursor = nextPoint;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    return geo;
  }, [windTable, realTick, tiltX, tiltZ]);
  React.useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={mat} frustumCulled={false} />;
};

// ---------- 大烟 ----------
// LARGE_SMOKE = LargeSmokeParticle：SmokeParticle 放大 2.5 倍（半边长 0.1 × (随机 × 0.5 + 0.5) × 2 × 0.75 × 2.5，寿命 8 ÷ (随机 × 0.8 + 0.2) × 2.5 刻），
// 灰度 随机 × 0.3，重力 −0.1（往上飘）、摩擦 0.96，贴图 generic_7 → generic_0。库里的 smoke 是小号的，这里照同一套算法写大号。
type SmokePuff = { 刻: number; p: V3; 种子: number };
const smokeState = (c: SmokePuff, currentTick: number): Particle | null => {
  const τ = currentTick - c.刻;
  if (τ < 0) return null;
  const rand = mulberry32(c.种子 * 2654435761 + 53);
  let x = (rand() * 2 - 1) * 0.4;
  let y = (rand() * 2 - 1) * 0.4;
  let z = (rand() * 2 - 1) * 0.4;
  const speed = (rand() + rand() + 1) * 0.15;
  const vecLength = Math.hypot(x, y, z) || 1;
  let v: V3 = [(x / vecLength) * speed * 0.4 * 0.1, (y / vecLength) * speed * 0.4 * 0.1, ((z / vecLength) * speed * 0.4 + 0.1) * 0.1];
  const grayShade = rand() * 0.3;
  const halfSize = 0.1 * (rand() * 0.5 + 0.5) * 2 * 0.75 * 2.5;
  const lifetime = Math.max(1, Math.floor(Math.floor(8 / (rand() * 0.8 + 0.2)) * 2.5));
  const ageTicks = Math.floor(τ);
  if (ageTicks >= lifetime) return null;
  let p = c.p;
  let prev = p;
  for (let k = 0; k < ageTicks; k++) {
    prev = p;
    v = [v[0], v[1], v[2] + 0.04 * 0.1];
    p = [p[0] + v[0], p[1] + v[1], p[2] + v[2]];
    v = [v[0] * 0.96, v[1] * 0.96, v[2] * 0.96];
  }
  const f = τ - ageTicks;
  const frame = 7 - Math.min(7, Math.floor((ageTicks * 7) / lifetime));
  return { p: [lerp(prev[0], p[0], f), lerp(prev[1], p[1], f), lerp(prev[2], p[2], f)], half: halfSize, uv: vanillaParticleAtlas.uv[`generic_${frame}`]!, color: [grayShade, grayShade, grayShade] };
};

// 灵魂火自己的烟：原版 BaseFireBlock.animateTick（客户端每刻在玩家四周随机抽方块调用，抽法 = 三个轴各「两个 0～14 的随机整数之差」，每刻 667 次），
// 下面是实心方块（灵魂土）时放 3 颗 LARGE_SMOKE，位置 = 火格内水平随机、高 0.5～1.0。所以每团火的出烟率取决于玩家站在哪，离得近就多：
// 这里把玩家放在游戏实拍的机位（对照报告 1110-1330：方块 (4, 103, 4)，折到场景格 (4, −4, 3)），灵魂火是一直烧着的，仪式前、中、过渡、现身后都在冒。
const playerCell: V3 = [4, -4, 3];
const flameSmokeRate = (flamePos: readonly [number, number, number]): number => {
  const falloff = (d: number) => (15 - Math.abs(d)) / 225;
  const [dx, dy, dz] = [flamePos[0] - playerCell[0], flamePos[1] - playerCell[1], flamePos[2] - playerCell[2]];
  return 667 * falloff(dx) * falloff(dy) * falloff(dz);
};
const soulFireSmokeTable = (startTick: number, endTick: number, seed: number): SmokePuff[] => {
  const smokeTable: SmokePuff[] = [];
  for (const [fi, flameCell] of soulFireCells.entries()) {
    const chance = flameSmokeRate(flameCell);
    for (let tick = startTick; tick <= endTick; tick++) {
      const rand = mulberry32(seed * 1000003 + (tick + 1000) * 31 + fi * 7 + 5);
      if (rand() >= chance) continue; // 率 < 1：一刻最多被抽中一次
      for (let n = 0; n < 3; n++) smokeTable.push({ 刻: tick, p: [flameCell[0] + rand() - 0.5, flameCell[1] + rand() - 0.5, flameCell[2] + 0.5 + rand() * 0.5], 种子: seed * 4001 + tick * 17 + fi * 3 + n });
    }
  }
  return smokeTable;
};
const BigSmokes: React.FC<{ 表: SmokePuff[]; currentTick: number }> = ({ 表: smokeTable, currentTick }) => {
  const particles = smokeTable.map((c) => smokeState(c, currentTick)).filter((s): s is Particle => !!s);
  return <ParticleQuads tex={vanillaParticleAtlas.tex} items={particles} />;
};

// ---------- 整段演出 ----------
export type RestRitualPerformanceProps = {
  /** 从放下破碎之环算起的秒（负的 = 还没开始：结构和祭品都在，祭坛上没有环） */
  秒: number;
  plan: SummonPlan;
  种子?: number;
  obsidianBase?: boolean;
  /** 亚波伦：现身那一刻起画在 现身位置（安息仪式时序.ts），不给不画 */
  children?: React.ReactNode;
};

/**
 * 整段召唤：结构 + 祭品 + 仪式过程 + 过渡 + 现身。场景坐标，祭坛那一列在 (0, 0)。
 * 声音不在这里放（召唤声音(方案) 给段.ts 排）；黑暗效果、动作栏提示「世界凝视着你....」是屏幕层的东西，也不在这里（时刻 = 方案.提示）。
 */
export const RestRitualPerformance: React.FC<RestRitualPerformanceProps> = ({ 秒: sec, plan, 种子: seed = 1, obsidianBase, children }) => {
  const s = summonStateAt(sec, plan);
  const finishTick = plan.完成 * 20;
  const appearTick = plan.appear * 20;
  const transitionTotalTicks = appearTick - finishTick;
  const { gatherWindTable, smokeTable, flameSpawns } = useMemo(() => {
    const rand = mulberry32(seed * 69621 + 3);
    const progressTickAt = (realTick: number) => {
      const progressSec = plan.完成 + realTick / 20;
      // 和 过渡进度刻 同一个映射（这里不引函数是为了让表只跟方案的四个时刻走）
      if (progressSec <= plan.提示) return ((progressSec - plan.完成) / (plan.提示 - plan.完成)) * game.hintTicks;
      if (progressSec <= plan.whisperSec) return game.hintTicks + ((progressSec - plan.提示) / (plan.whisperSec - plan.提示)) * (game.whisperTicks - game.hintTicks);
      return Math.min(game.transitionTicks, game.whisperTicks + ((progressSec - plan.whisperSec) / (plan.appear - plan.whisperSec)) * (game.transitionTicks - game.whisperTicks));
    };
    const gatherWindTable = layoutGatherWind(progressTickAt, Math.floor(transitionTotalTicks), seed);
    // 完成那一刻祭坛中心一颗（SummonRitual.finish）；低语之后每刻一颗，落在实体碰撞箱里（水平 ±1、高 0～0.5）
    const smokeTable: SmokePuff[] = [{ 刻: finishTick, p: altarCenter, 种子: seed * 31 }];
    for (let tick = Math.ceil(plan.whisperSec * 20); tick <= appearTick; tick++) {
      smokeTable.push({ 刻: tick, p: [altarCenter[0] + (rand() * 2 - 1), altarCenter[1] + (rand() * 2 - 1), altarCenter[2] + rand() * game.entityHeight], 种子: seed * 977 + tick });
    }
    // 灵魂火的烟：从仪式开始前 15 秒（烟最长活 5 秒，到放环时已是稳态）到整段结束
    smokeTable.push(...soulFireSmokeTable(-300, Math.ceil(plan.总秒 * 20), seed));
    // 现身：200 颗 FLAME，从实体脚边 0.3 格高炸开。速度 = (cos × f2, 0.01 + 随机 × 0.5, sin × f2) × 0.5，f2 = 随机 × 4（格/刻）
    const flameSpawns: ParticleSpawn[] = Array.from({ length: 200 }, (_, k) => {
      const f2 = rand() * 4;
      const f1 = rand() * Math.PI * 2;
      const [d1, d2, d3] = [Math.cos(f1) * f2, 0.01 + rand() * 0.5, Math.sin(f1) * f2];
      return { 种: 'flame' as const, 刻: appearTick, p: [altarCenter[0] + d1 * 0.1, altarCenter[1] - d3 * 0.1, altarCenter[2] + 0.3] as V3, v: [d1 * 0.5, -d3 * 0.5, d2 * 0.5] as V3, 种子: seed * 131 + k };
    });
    return { gatherWindTable, smokeTable, flameSpawns };
  }, [plan.完成, plan.提示, plan.whisperSec, plan.appear, plan.总秒, seed, finishTick, appearTick, transitionTotalTicks]);

  const currentTick = sec * 20;
  const unsacrificed = 1 - s.offeringAlpha;
  return (
    <group>
      <RestRitualStructure 秒={sec} obsidianBase={obsidianBase} />
      {s.offeringAlpha > 0 &&
        offerings.map((offering, i) => {
          const p = offeringPos(i);
          const pos: V3 = [lerp(p[0], activatorPos[0], unsacrificed), lerp(p[1], activatorPos[1], unsacrificed), lerp(p[2], activatorPos[2], unsacrificed) + Math.sin(unsacrificed * Math.PI) * 0.8];
          return (
            <group key={offering.名} position={pos}>
              <Offering 名={offering.名} 秒={sec} 缩放={s.offeringAlpha} />
            </group>
          );
        })}
      {s.hasActivator && (
        <group position={activatorPos}>
          <BrokenRing 秒={sec} />
        </group>
      )}
      {sec >= 0 && <OfferingDebris 秒={sec} 起={0} 止={Math.min(plan.offeringVanishSec, plan.完成)} 种子={seed} />}
      <group position={altarCenter}>
        <LightPillar ageTick={currentTick - finishTick} />
        <SummonCircle ageTick={s.transitionRealTick} 半边={s.circleHalf} ringHeight={s.ringHeight} />
        {sec >= plan.完成 && <GatherWindBands 表={gatherWindTable} realTick={currentTick - finishTick} />}
      </group>
      <BigSmokes 表={smokeTable} currentTick={currentTick} />
      <VanillaParticles spawns={flameSpawns} 秒={sec} />
      {s.yaBoLunPresent && children}
    </group>
  );
};
