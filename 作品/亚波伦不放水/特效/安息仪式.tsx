// 安息仪式的画法：结构（方块拼搭 + 会动的灵魂火 + 笼里的图腾）、基座上的祭品、仪式过程（祭品往祭坛喷碎屑、完成的暗红光柱）、
// 过渡实体（法阵和两道环、聚风带、大烟、现身那一下的火焰）。摆法、时刻、出处在 安息仪式时序.ts。都按秒算，自己不取时间。
// 坐标：场景约定（Z 朝上，单位格），放在 rotation [−π/2, 0, 0] 的 group 里；祭坛那一列中心在 (0, 0)，黑曜石底的顶是 z = 0。
// 和游戏不一样的地方（粗做）：
//   聚风带的宽度方向游戏里跟着镜头偏航歪（WindTrailParticle.getCameraRot），这里一律竖着；游戏里带头那一截因为没更新 xo 会每帧闪回出生点，没照做。
//   物品碎屑不算碰撞，只在撞进祭坛那一列时停住；灵魂火的面片双面画（游戏里每片只有一面）。
//   暗影精华的 4 帧图标游戏里帧间插值，这里只换帧。
//   没做：祭坛脚边转圈的图腾粒子（goety:totem_effect）、每秒两颗幽匿灵魂粒子（贴图都没取）。
// 待迁移（私有资产）：破碎之环是启示录的（保留所有权益），只能私有；公开版怎么办（缺了报错还是换占位）等用户定
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { clamp01, lerp as 混, rad as 弧 } from '@engine/core/数学.ts';
import { BlockModel, type BlockModelData } from '@engine/model/方块模型.tsx';
import { 方块拼搭 } from '@engine/model/方块拼搭.tsx';
import { rng, type V3 } from '@engine/model/parts.tsx';
import { ItemSprite, type ItemLayer } from '@engine/model/物品贴图.tsx';
import { png, type Png } from '@engine/model/贴图.ts';
import { GlintItem } from '@库/物品/附魔物品.tsx';
import { type Particle, ParticleQuads, particleTexture } from '@库/特效/粒子面片.tsx';
import { type ParticleSpawn, vanillaParticleAtlas, VanillaParticles } from '@库/特效/原版粒子.tsx';
import 魔典数据 from 'asset:模型/仪式/炼狱魔典';
import 魔典图 from 'asset:贴图/仪式/炼狱魔典';
import 法阵图 from 'asset:贴图/仪式/goety/entity/cultist/summon_apostle';
import 环图 from 'asset:贴图/仪式/goety/entity/cultist/summon_apostle_ring';
import 聚风图 from 'asset:贴图/仪式/goety/particle/gathering_trail';
import 老巫婆帽图 from 'asset:贴图/仪式/goety/item/crone_hat';
import 禁忌卷轴图 from 'asset:贴图/仪式/goety/item/forbidden_scroll';
import 图腾图 from 'asset:贴图/仪式/goety/item/full_totem';
import 暗夜之心图 from 'asset:贴图/仪式/goety/item/heart_of_the_night';
import 邪恶头盔图 from 'asset:贴图/仪式/goety/item/malefic_helm';
import 暗影精华图 from 'asset:贴图/仪式/goety/item/shadow_essence';
import 灵魂红宝石图 from 'asset:贴图/仪式/goety/item/soul_ruby';
import 不洁之血图 from 'asset:贴图/仪式/goety/item/unholy_blood';
import 术士腰带图 from 'asset:贴图/仪式/goety/item/warlock_sash';
import 灵魂火图0 from 'asset:贴图/仪式/minecraft/block/soul_fire_0';
import 灵魂火图1 from 'asset:贴图/仪式/minecraft/block/soul_fire_1';
import 龙息图 from 'asset:贴图/仪式/minecraft/item/dragon_breath';
import 下界之星图 from 'asset:贴图/仪式/minecraft/item/nether_star';
import 金苹果图 from 'asset:贴图/法术/minecraft/item/golden_apple';
import 破碎之环图 from 'asset:贴图/物品/破碎之环';
import {
  基座格,
  召唤状态在,
  图腾位置,
  游戏,
  灵魂火格,
  激活物位置,
  物品转速度每刻,
  祭品们,
  祭品位置,
  祭坛中心,
  结构方块,
  type 召唤方案,
  type 祭品名,
} from './安息仪式时序.ts';


// ---------- 物品 ----------
/** 竖条动画图标取一帧（暗影精华 16×64，mcmeta 每帧 2 刻） */
const 取帧 = (图: Png, 帧: number): Png => ({ w: 图.w, h: 图.w, px: 图.px.subarray(帧 * 图.w * 图.w * 4, (帧 + 1) * 图.w * 图.w * 4) });
const 暗影精华帧 = (() => {
  let 帧们: Png[] | undefined;
  return () => (帧们 ??= [0, 1, 2, 3].map((i) => 取帧(png(暗影精华图), i)));
})();

const 平面图标: Record<Exclude<祭品名, '炼狱魔典' | '暗影精华'>, { 图: string; 附魔光效?: boolean }> = {
  暗夜之心: { 图: 暗夜之心图 },
  龙息: { 图: 龙息图 },
  禁忌卷轴: { 图: 禁忌卷轴图 },
  // 附魔金苹果、下界之星游戏里带附魔光效（EnchantedGoldenAppleItem、SimpleFoiledItem 的 isFoil）
  附魔金苹果: { 图: 金苹果图, 附魔光效: true },
  下界之星: { 图: 下界之星图, 附魔光效: true },
  不洁之血: { 图: 不洁之血图 },
  灵魂红宝石: { 图: 灵魂红宝石图 },
  邪恶头盔: { 图: 邪恶头盔图 },
  老巫婆帽: { 图: 老巫婆帽图 },
  术士腰带: { 图: 术士腰带图 },
};
const 层缓存 = new Map<string, ItemLayer[]>();
const 层 = (图: string): ItemLayer[] => {
  let l = 层缓存.get(图);
  if (!l) 层缓存.set(图, (l = [{ tex: png(图) }]));
  return l;
};
const 暗影层缓存: ItemLayer[][] = [];

/** 碎屑用的贴图：图标（暗影精华取第一帧，魔典取模型贴图） */
const 祭品图 = (名: 祭品名): Png => (名 === '炼狱魔典' ? png(魔典图) : 名 === '暗影精华' ? 暗影精华帧()[0]! : png(平面图标[名].图));

/** 平面物品摆成掉落物的样子（item/generated 的 ground：缩到 0.5；往上 2/16 已经算在位置里），物品空间 Y 朝上 → 场景 Z 朝上 */
const 地面物品: React.FC<{ 转度: number; 缩放?: number; children: React.ReactNode }> = ({ 转度, 缩放 = 1, children }) => (
  <group rotation={[0, 0, 弧(转度)]} scale={0.5 * 缩放}>
    <group rotation={[Math.PI / 2, 0, 0]}>{children}</group>
  </group>
);

/**
 * 一件祭品，中心在原点、照基座上的大小（游戏里的掉落物显示，半格大）。秒：转动和附魔光效、暗影精华换帧的钟。
 * 炼狱魔典是立体的合着的书（默认 active = 0 走 infernal_tome_close），别的是平面图标。
 */
export const 祭品: React.FC<{ 名: 祭品名; 秒: number; 缩放?: number }> = ({ 名, 秒, 缩放 = 1 }) => {
  const 转度 = 物品转速度每刻 * 秒 * 20;
  if (名 === '炼狱魔典') {
    // BlockModel 已经是 Z 朝上；模型的 ground 变换和 item/generated 一样（往上 2、缩 0.5）
    return (
      <group rotation={[0, 0, 弧(转度)]} scale={0.5 * 缩放}>
        <BlockModel data={魔典数据 as unknown as BlockModelData} atlas={png(魔典图)} part="书" />
      </group>
    );
  }
  if (名 === '暗影精华') {
    const 帧 = ((Math.floor((秒 * 20) / 2) % 4) + 4) % 4; // 秒可以是负的（仪式开始前）
    const l = (暗影层缓存[帧] ??= [{ tex: 暗影精华帧()[帧]! }]);
    return (
      <地面物品 转度={转度} 缩放={缩放}>
        <ItemSprite layers={l} />
      </地面物品>
    );
  }
  const 定 = 平面图标[名];
  return (
    <地面物品 转度={转度} 缩放={缩放}>
      {定.附魔光效 ? <GlintItem layers={层(定.图)} sec={秒} /> : <ItemSprite layers={层(定.图)} />}
    </地面物品>
  );
};

/** 祭坛上的破碎之环、笼里的灵魂图腾：同样的掉落物显示 */
export const 破碎之环: React.FC<{ 秒: number }> = ({ 秒 }) => (
  <地面物品 转度={物品转速度每刻 * 秒 * 20}>
    <ItemSprite layers={层(破碎之环图)} />
  </地面物品>
);
const 灵魂图腾: React.FC<{ 秒: number }> = ({ 秒 }) => (
  <地面物品 转度={物品转速度每刻 * 秒 * 20}>
    <ItemSprite layers={层(图腾图)} />
  </地面物品>
);

// ---------- 灵魂火 ----------
// 照原版 soul_fire 的方块状态（multipart 没有条件，全都画）：template_fire_floor 四片往里斜 22.5 度的面（rescale），加四边各一片贴边的 template_fire_side。
// 贴图 soul_fire_0 / soul_fire_1 是 16×512 的 32 帧竖条，每刻一帧；soul_fire_0 的帧序照 mcmeta 从第 16 帧起。面高 22.4 像素，贴图拉满。
const 火几何 = (() => {
  let g: [THREE.BufferGeometry, THREE.BufferGeometry] | undefined;
  return () => {
    if (g) return g;
    // 一片：四个角的方块像素坐标（游戏轴 x、y 上、z 南）+ uv（v = 0 是贴图顶）
    type 片 = { 角: [number, number, number][]; 反: boolean; 图: 0 | 1 };
    const 片们: 片[] = [];
    const 比 = 1 / Math.cos(弧(22.5));
    const 斜 = (p: [number, number, number], 轴: 'x' | 'z', 度: number): [number, number, number] => {
      const [x, y, z] = [p[0] - 8, p[1] - 8, p[2] - 8];
      const [c, s] = [Math.cos(弧(度)), Math.sin(弧(度))];
      // rescale：垂直转轴的两个方向放大 1/cos
      const r: [number, number, number] = 轴 === 'x' ? [x, (y * c - z * s) * 比, (y * s + z * c) * 比] : [(x * c - y * s) * 比, (x * s + y * c) * 比, z];
      return [r[0] + 8, r[1] + 8, r[2] + 8];
    };
    const 竖片 = (定: 'z' | 'x', 值: number): [number, number, number][] =>
      定 === 'z' ? [[0, 22.4, 值], [16, 22.4, 值], [16, 0, 值], [0, 0, 值]] : [[值, 22.4, 0], [值, 22.4, 16], [值, 0, 16], [值, 0, 0]];
    片们.push({ 角: 竖片('z', 8.8).map((p) => 斜(p, 'x', -22.5)), 反: false, 图: 0 });
    片们.push({ 角: 竖片('z', 7.2).map((p) => 斜(p, 'x', 22.5)), 反: false, 图: 0 });
    片们.push({ 角: 竖片('x', 8.8).map((p) => 斜(p, 'z', -22.5)), 反: false, 图: 0 });
    片们.push({ 角: 竖片('x', 7.2).map((p) => 斜(p, 'z', 22.5)), 反: false, 图: 0 });
    // 四边：游戏里每边从 side0、side1、side_alt0、side_alt1 里随机挑，这里固定轮着用
    片们.push({ 角: 竖片('z', 0.01), 反: false, 图: 0 });
    片们.push({ 角: 竖片('z', 15.99), 反: true, 图: 1 });
    片们.push({ 角: 竖片('x', 0.01), 反: true, 图: 0 });
    片们.push({ 角: 竖片('x', 15.99), 反: false, 图: 1 });
    const 建 = (图: 0 | 1) => {
      const pos: number[] = [];
      const uv: number[] = [];
      const idx: number[] = [];
      for (const 片 of 片们.filter((f) => f.图 === 图)) {
        const 起 = pos.length / 3;
        // 游戏 (x, y, z) → 场景 (x, −z, y)，格的中心在原点、底在 z = 0
        for (const [x, y, z] of 片.角) pos.push(x / 16 - 0.5, -(z / 16 - 0.5), y / 16);
        const [u0, u1] = 片.反 ? [1, 0] : [0, 1];
        uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
        idx.push(起, 起 + 1, 起 + 2, 起, 起 + 2, 起 + 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      return geo;
    };
    return (g = [建(0), 建(1)]);
  };
})();
const 竖条贴图 = (uri: string) => {
  const 图 = png(uri);
  const t = new THREE.DataTexture(图.px, 图.w, 图.h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.repeat.set(1, 图.w / 图.h);
  t.needsUpdate = true;
  return { t, 帧数: 图.h / 图.w };
};

/** 一团灵魂火，占一格：格的水平中心在原点，底在 z = 0。不受光（火自己发光） */
export const 灵魂火: React.FC<{ 秒: number }> = ({ 秒 }) => {
  const 料 = useMemo(() => {
    const 做 = (uri: string) => {
      const { t, 帧数 } = 竖条贴图(uri);
      return { t, 帧数, m: new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide }) };
    };
    return [做(灵魂火图0), 做(灵魂火图1)] as const;
  }, []);
  const 刻 = Math.floor(秒 * 20);
  // soul_fire_0 的 mcmeta 帧序是 16…31、0…15；soul_fire_1 是顺序
  料[0].t.offset.y = ((刻 + 16) % 料[0].帧数) / 料[0].帧数;
  料[1].t.offset.y = (刻 % 料[1].帧数) / 料[1].帧数;
  const [g0, g1] = 火几何();
  return (
    <group>
      <mesh geometry={g0} material={料[0].m} />
      <mesh geometry={g1} material={料[1].m} />
    </group>
  );
};

// ---------- 结构 ----------
/**
 * 仪式结构：黑曜石底 7×7、哭泣黑曜石 3×3 台、中心诅咒笼（里面转着灵魂图腾）上摞点亮的黑暗祭坛、四个斜角灵魂土上的灵魂火、外圈 12 个基座。
 * 不含祭品和破碎之环。黑曜石底 = false 时不画底下那层（场地自己有地面时用，基座和灵魂土照旧立在 z = 0）。
 */
export const 安息仪式结构: React.FC<{ 秒: number; 黑曜石底?: boolean; 灵魂火在?: boolean }> = ({ 秒, 黑曜石底 = true, 灵魂火在 = true }) => {
  const 方块们 = useMemo(() => 结构方块({ 黑曜石底 }), [黑曜石底]);
  return (
    <group>
      <方块拼搭 方块们={方块们} 原点={原点} />
      {灵魂火在 &&
        灵魂火格.map(([i, j, k]) => (
          <group key={`${i},${j}`} position={[i, j, k]}>
            <灵魂火 秒={秒} />
          </group>
        ))}
      <group position={图腾位置}>
        <灵魂图腾 秒={秒} />
      </group>
    </group>
  );
};
const 原点: V3 = [-0.5, -0.5, 0];

// ---------- 祭品喷向祭坛的碎屑 ----------
// Ritual.update：仪式进行时每刻、每个还有祭品的基座，在基座上方 1.5 格放一颗 ITEM 粒子（BreakingItemParticle），速度 (0.1 × 到祭坛的格数, 0.3, …)。
// BreakingItemParticle：重力 1、摩擦 0.98、半边长 0.1 × (随机 × 0.5 + 0.5)（父类的再除 2）、寿命 4 ÷ (随机 × 0.9 + 0.1) 刻、贴图取图标上随机一块 4×4 像素。
type 碎屑 = { 件: number; 刻: number; 种子: number };
const 碎屑状态 = (c: 碎屑, 当前刻: number): Particle | null => {
  const τ = 当前刻 - c.刻;
  if (τ < 0) return null;
  const rand = rng(c.种子 * 2654435761 + 31);
  const 寿命 = Math.floor(4 / (rand() * 0.9 + 0.1));
  const 岁 = Math.floor(τ);
  if (岁 >= 寿命) return null;
  const [gx, gy] = 基座格[c.件]!;
  // 父类随机速度 × 0.1 + 给的速度
  let x = (rand() * 2 - 1) * 0.4;
  let y = (rand() * 2 - 1) * 0.4;
  let z = (rand() * 2 - 1) * 0.4;
  const 速 = (rand() + rand() + 1) * 0.15;
  const 长 = Math.hypot(x, y, z) || 1;
  let v: V3 = [((x / 长) * 速 * 0.4) * 0.1 + 0.1 * -gx, ((y / 长) * 速 * 0.4) * 0.1 + 0.1 * -gy, ((z / 长) * 速 * 0.4 + 0.1) * 0.1 + 0.3];
  const 半 = (0.1 * (rand() * 0.5 + 0.5) * 2) / 2;
  const [u, w] = [rand() * 3, rand() * 3];
  let p: V3 = [gx, gy, 1.5];
  let 前 = p;
  let 停 = false;
  for (let k = 0; k < 岁 && !停; k++) {
    前 = p;
    v = [v[0], v[1], v[2] - 0.04];
    const 下: V3 = [p[0] + v[0], p[1] + v[1], p[2] + v[2]];
    // 撞进祭坛、笼那一列就停在外面
    if (Math.abs(下[0]) < 0.5 && Math.abs(下[1]) < 0.5 && 下[2] < 3) {
      停 = true;
      前 = p;
      break;
    }
    p = 下;
    v = [v[0] * 0.98, v[1] * 0.98, v[2] * 0.98];
  }
  const f = 停 ? 1 : τ - 岁;
  return { p: [混(前[0], p[0], f), 混(前[1], p[1], f), 混(前[2], p[2], f)], half: 半, uv: [u / 4, w / 4, (u + 1) / 4, (w + 1) / 4], color: [1, 1, 1] };
};

/** 起、止：喷碎屑的时间段（秒）。每件祭品一批（各用自己的图标当贴图） */
const 祭品碎屑: React.FC<{ 秒: number; 起: number; 止: number; 种子: number }> = ({ 秒, 起, 止, 种子 }) => {
  const 当前刻 = 秒 * 20;
  const 表 = useMemo(() => {
    const 表: 碎屑[][] = 祭品们.map(() => []);
    for (let 刻 = Math.ceil(起 * 20); 刻 < 止 * 20; 刻++) for (let 件 = 0; 件 < 祭品们.length; 件++) 表[件]!.push({ 件, 刻, 种子: 种子 * 7919 + 刻 * 13 + 件 });
    return 表;
  }, [起, 止, 种子]);
  return (
    <>
      {祭品们.map((定, 件) => {
        const 图 = 祭品图(定.名);
        // 魔典的贴图是 256×32 的模型图集，只取左上 32×32 那块里的碎片
        const 横 = 定.名 === '炼狱魔典' ? 图.h / 图.w : 1;
        const 粒 = 表[件]!.map((c) => 碎屑状态(c, 当前刻)).filter((s): s is Particle => !!s);
        for (const s of 粒) s.uv = [s.uv[0] * 横, s.uv[1], s.uv[2] * 横, s.uv[3]];
        return <ParticleQuads key={件} tex={particleTexture(图.px, 图.w, 图.h, 图)} items={粒} />;
      })}
    </>
  );
};

// ---------- 完成的光柱 ----------
// StretchedGodRayParticle（SabbathRitualType.sendFinishRay，颜色 ChatFormatting.DARK_RED = 0xAA0000）：活 20 刻，四片竖直的面围成方筒，
// 进度 = easeInOutSine(1 − |年龄 − 10| ÷ 10)；高 5 × 进度；半边长从 0.375（后半段 0.45）收到 0.325；底的不透明度 0.5→1，顶是 0；加法混合。
const 光柱: React.FC<{ 年龄刻: number }> = ({ 年龄刻 }) => {
  const { geo, mat } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(16 * 3), 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(16 * 4), 4));
    geo.setIndex([0, 1, 2, 3].flatMap((f) => [f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3]));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    return { geo, mat };
  }, []);
  if (年龄刻 < 0 || 年龄刻 >= 游戏.光柱刻) return null;
  const 半寿 = 游戏.光柱刻 / 2;
  const 进度 = -(Math.cos(Math.PI * (1 - Math.abs(年龄刻 - 半寿) / 半寿)) - 1) / 2;
  const d = 混((年龄刻 < 半寿 ? 0.75 : 0.9) * 0.5, 0.325, 进度);
  const h = 5 * 进度;
  const 底 = 混(0.5, 1, 进度);
  const 红 = new THREE.Color(0xaa0000);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const col = geo.getAttribute('color') as THREE.BufferAttribute;
  const 边: [number, number, number, number][] = [[-d, -d, -d, d], [-d, -d, d, -d], [d, -d, d, d], [-d, d, d, d]];
  边.forEach(([x0, y0, x1, y1], f) => {
    const 角: [number, number, number, number][] = [[x0, y0, 0, 底], [x1, y1, 0, 底], [x1, y1, h, 0], [x0, y0, h, 0]];
    角.forEach(([x, y, z, a], k) => {
      pos.setXYZ(f * 4 + k, x, y, z);
      col.setXYZW(f * 4 + k, 红.r, 红.g, 红.b, a);
    });
  });
  pos.needsUpdate = true;
  col.needsUpdate = true;
  return <mesh geometry={geo} material={mat} frustumCulled={false} />;
};

// ---------- 过渡实体：法阵和两道环 ----------
// SummonApostleRenderer：三张水平的方片（entityCutoutNoCull、满亮度），半边长 = 法阵半边。地面那张 summon_apostle.png 转 90 + 年龄 度；
// 两张 summon_apostle_ring.png 升到 2、4 格高，各转 90 − 年龄 ÷ 2、90 + 年龄 ÷ 2 度（年龄按刻）。
const 方片几何 = (() => {
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
const 平贴图 = (uri: string) => {
  const 图 = png(uri);
  const t = new THREE.DataTexture(图.px, 图.w, 图.h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
};
/** 过渡实体的法阵和两道环，原点 = 实体的位置。年龄刻：真实时间的刻；半边、环高由 召唤状态在 给 */
export const 召唤法阵: React.FC<{ 年龄刻: number; 半边: number; 环高: readonly [number, number] }> = ({ 年龄刻, 半边, 环高 }) => {
  const [阵料, 环料] = useMemo(() => [法阵图, 环图].map((u) => new THREE.MeshBasicMaterial({ map: 平贴图(u), alphaTest: 0.1, side: THREE.DoubleSide })), []);
  if (半边 <= 0) return null;
  const g = 方片几何();
  return (
    <group>
      <mesh geometry={g} material={阵料} position={[0, 0, 0.001]} rotation={[0, 0, 弧(90 + 年龄刻)]} scale={半边} />
      <mesh geometry={g} material={环料} position={[0, 0, 环高[0]]} rotation={[0, 0, 弧(90 - 年龄刻 / 2)]} scale={半边} />
      <mesh geometry={g} material={环料} position={[0, 0, 环高[1]]} rotation={[0, 0, 弧(90 + 年龄刻 / 2)]} scale={半边} />
    </group>
  );
};

// ---------- 过渡实体：聚风带 ----------
// SummonApostle.tick：每 lerpInt(进度, 8, 2) 刻放一条，采样数 lerpInt(进度, 8, 15)、带宽 lerp(进度, 0.3, 0.9)、活 90 刻，三分之一暗红（0xAA0000）、其余黑；
// 出生在实体四周 ±(2～5) 格、实体顶的高度。WindGatherParticle：每刻偏航 += ±(0.15～0.25) 弧度，半径 −= 初始半径 ÷ 20 × (0.8～1.2)，最小 0.75～0.95；
// 高度 = (sin(年龄 × 0.2) + 1) × 0.5 × 实体高；最后（采样数 − 1）刻停住让尾巴收拢。带子沿最近「采样数」刻的位置拉，贴图 gathering_trail.png 的 u 从头到尾。
type 聚风 = { 生刻: number; 采样: number; 宽: number; 红: boolean; dx: number; dz: number; 偏航速: number; 半径速比: number; 最小半径: number };
const 聚风寿命 = 90;
const 聚风位置 = (c: 聚风, 岁: number): V3 => {
  // 岁：已经走了几刻（整数）。游戏里先走一步再记轨迹，头一次记的时候把整条历史都填成走完第一步的位置，
  // 出生点不进带子（出生用 atan2(dx, dz)、之后用 cos/sin，不是一对，连上会拉出一条横穿法阵的直带）
  const r0 = Math.hypot(c.dx, c.dz);
  const 走 = Math.min(Math.max(岁, 1), 聚风寿命 - (c.采样 - 1));
  const 偏航 = Math.atan2(c.dx, c.dz) + c.偏航速 * 走;
  const 半径 = Math.max(c.最小半径, r0 - (r0 / 20) * c.半径速比 * 走);
  // 游戏：x = r cos(偏航)、z = r sin(偏航)；场景 y = −z
  return [半径 * Math.cos(偏航), -半径 * Math.sin(偏航), (Math.sin((走 - 1) * 0.2) + 1) * 0.5 * 游戏.实体高];
};
const 排聚风 = (进度刻在: (真实刻: number) => number, 止刻: number, 种子: number): 聚风[] => {
  const rand = rng(种子 * 48271 + 7);
  const 表: 聚风[] = [];
  for (let 刻 = 1; 刻 <= 止刻; 刻++) {
    const 进度 = clamp01(进度刻在(刻) / 游戏.过渡刻);
    const 间隔 = 8 + Math.floor(进度 * -6);
    if (刻 % 间隔 !== 0) continue;
    表.push({
      生刻: 刻,
      采样: 8 + Math.floor(进度 * 7),
      宽: 混(0.3, 0.9, 进度),
      dx: (rand() * 3 + 2) * (rand() < 0.5 ? 1 : -1),
      dz: (rand() * 3 + 2) * (rand() < 0.5 ? 1 : -1),
      红: Math.floor(rand() * 3) === 0,
      偏航速: (rand() < 0.5 ? 1 : -1) * (0.15 + rand() * 0.1),
      半径速比: 0.8 + rand() * 0.4,
      最小半径: 0.75 + rand() * 0.2,
    });
  }
  return 表;
};

const 聚风带们: React.FC<{ 表: 聚风[]; 真实刻: number }> = ({ 表, 真实刻 }) => {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: 平贴图(聚风图), vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }), []);
  const geo = useMemo(() => {
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const 红 = new THREE.Color(0xaa0000);
    for (const c of 表) {
      const τ = 真实刻 - c.生刻;
      if (τ < 1 || τ >= 聚风寿命) continue;
      const 岁 = Math.floor(τ);
      const f = τ - 岁;
      // 第 k 个采样点 = k 刻前的位置（刻间插值）
      const 点 = (k: number): V3 => {
        const [a, b] = [聚风位置(c, 岁 - k), 聚风位置(c, 岁 - k + 1)];
        return [混(a[0], b[0], f), 混(a[1], b[1], f), 混(a[2], b[2], f)];
      };
      const [r, g, b] = c.红 ? [红.r, 红.g, 红.b] : [0, 0, 0];
      let 从 = 点(0);
      for (let k = 0; k < c.采样; k++) {
        const 到 = 点(k + 1);
        const [u1, u2] = [k / c.采样, (k + 1) / c.采样];
        const 起 = pos.length / 3;
        pos.push(从[0], 从[1], 从[2] - c.宽 / 2, 到[0], 到[1], 到[2] - c.宽 / 2, 到[0], 到[1], 到[2] + c.宽 / 2, 从[0], 从[1], 从[2] + c.宽 / 2);
        uv.push(u1, 1, u2, 1, u2, 0, u1, 0);
        for (let q = 0; q < 4; q++) col.push(r, g, b);
        idx.push(起, 起 + 1, 起 + 2, 起, 起 + 2, 起 + 3);
        从 = 到;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    return geo;
  }, [表, 真实刻]);
  React.useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={mat} frustumCulled={false} />;
};

// ---------- 大烟 ----------
// LARGE_SMOKE = LargeSmokeParticle：SmokeParticle 放大 2.5 倍（半边长 0.1 × (随机 × 0.5 + 0.5) × 2 × 0.75 × 2.5，寿命 8 ÷ (随机 × 0.8 + 0.2) × 2.5 刻），
// 灰度 随机 × 0.3，重力 −0.1（往上飘）、摩擦 0.96，贴图 generic_7 → generic_0。库里的 smoke 是小号的，这里照同一套算法写大号。
type 烟 = { 刻: number; p: V3; 种子: number };
const 烟状态 = (c: 烟, 当前刻: number): Particle | null => {
  const τ = 当前刻 - c.刻;
  if (τ < 0) return null;
  const rand = rng(c.种子 * 2654435761 + 53);
  let x = (rand() * 2 - 1) * 0.4;
  let y = (rand() * 2 - 1) * 0.4;
  let z = (rand() * 2 - 1) * 0.4;
  const 速 = (rand() + rand() + 1) * 0.15;
  const 长 = Math.hypot(x, y, z) || 1;
  let v: V3 = [(x / 长) * 速 * 0.4 * 0.1, (y / 长) * 速 * 0.4 * 0.1, ((z / 长) * 速 * 0.4 + 0.1) * 0.1];
  const 灰 = rand() * 0.3;
  const 半 = 0.1 * (rand() * 0.5 + 0.5) * 2 * 0.75 * 2.5;
  const 寿命 = Math.max(1, Math.floor(Math.floor(8 / (rand() * 0.8 + 0.2)) * 2.5));
  const 岁 = Math.floor(τ);
  if (岁 >= 寿命) return null;
  let p = c.p;
  let 前 = p;
  for (let k = 0; k < 岁; k++) {
    前 = p;
    v = [v[0], v[1], v[2] + 0.04 * 0.1];
    p = [p[0] + v[0], p[1] + v[1], p[2] + v[2]];
    v = [v[0] * 0.96, v[1] * 0.96, v[2] * 0.96];
  }
  const f = τ - 岁;
  const 帧 = 7 - Math.min(7, Math.floor((岁 * 7) / 寿命));
  return { p: [混(前[0], p[0], f), 混(前[1], p[1], f), 混(前[2], p[2], f)], half: 半, uv: vanillaParticleAtlas.uv[`generic_${帧}`]!, color: [灰, 灰, 灰] };
};
const 大烟们: React.FC<{ 表: 烟[]; 当前刻: number }> = ({ 表, 当前刻 }) => {
  const 粒 = 表.map((c) => 烟状态(c, 当前刻)).filter((s): s is Particle => !!s);
  return <ParticleQuads tex={vanillaParticleAtlas.tex} items={粒} />;
};

// ---------- 整段演出 ----------
export type 安息仪式演出属性 = {
  /** 从放下破碎之环算起的秒（负的 = 还没开始：结构和祭品都在，祭坛上没有环） */
  秒: number;
  方案: 召唤方案;
  种子?: number;
  黑曜石底?: boolean;
  /** 亚波伦：现身那一刻起画在 现身位置（安息仪式时序.ts），不给不画 */
  children?: React.ReactNode;
};

/**
 * 整段召唤：结构 + 祭品 + 仪式过程 + 过渡 + 现身。场景坐标，祭坛那一列在 (0, 0)。
 * 声音不在这里放（召唤声音(方案) 给段.ts 排）；黑暗效果、动作栏提示「世界凝视着你....」是屏幕层的东西，也不在这里（时刻 = 方案.提示）。
 */
export const 安息仪式演出: React.FC<安息仪式演出属性> = ({ 秒, 方案, 种子 = 1, 黑曜石底, children }) => {
  const s = 召唤状态在(秒, 方案);
  const 完成刻 = 方案.完成 * 20;
  const 现身刻 = 方案.现身 * 20;
  const 过渡总刻 = 现身刻 - 完成刻;
  const { 聚风表, 烟表, 火焰 } = useMemo(() => {
    const rand = rng(种子 * 69621 + 3);
    const 进度刻在 = (真实刻: number) => {
      const 片秒 = 方案.完成 + 真实刻 / 20;
      // 和 过渡进度刻 同一个映射（这里不引函数是为了让表只跟方案的四个时刻走）
      if (片秒 <= 方案.提示) return ((片秒 - 方案.完成) / (方案.提示 - 方案.完成)) * 游戏.提示刻;
      if (片秒 <= 方案.低语) return 游戏.提示刻 + ((片秒 - 方案.提示) / (方案.低语 - 方案.提示)) * (游戏.低语刻 - 游戏.提示刻);
      return Math.min(游戏.过渡刻, 游戏.低语刻 + ((片秒 - 方案.低语) / (方案.现身 - 方案.低语)) * (游戏.过渡刻 - 游戏.低语刻));
    };
    const 聚风表 = 排聚风(进度刻在, Math.floor(过渡总刻), 种子);
    // 完成那一刻祭坛中心一颗（SummonRitual.finish）；低语之后每刻一颗，落在实体碰撞箱里（水平 ±1、高 0～0.5）
    const 烟表: 烟[] = [{ 刻: 完成刻, p: 祭坛中心, 种子: 种子 * 31 }];
    for (let 刻 = Math.ceil(方案.低语 * 20); 刻 <= 现身刻; 刻++) {
      烟表.push({ 刻, p: [祭坛中心[0] + (rand() * 2 - 1), 祭坛中心[1] + (rand() * 2 - 1), 祭坛中心[2] + rand() * 游戏.实体高], 种子: 种子 * 977 + 刻 });
    }
    // 现身：200 颗 FLAME，从实体脚边 0.3 格高炸开。速度 = (cos × f2, 0.01 + 随机 × 0.5, sin × f2) × 0.5，f2 = 随机 × 4（格/刻）
    const 火焰: ParticleSpawn[] = Array.from({ length: 200 }, (_, k) => {
      const f2 = rand() * 4;
      const f1 = rand() * Math.PI * 2;
      const [d1, d2, d3] = [Math.cos(f1) * f2, 0.01 + rand() * 0.5, Math.sin(f1) * f2];
      return { 种: 'flame' as const, 刻: 现身刻, p: [祭坛中心[0] + d1 * 0.1, 祭坛中心[1] - d3 * 0.1, 祭坛中心[2] + 0.3] as V3, v: [d1 * 0.5, -d3 * 0.5, d2 * 0.5] as V3, 种子: 种子 * 131 + k };
    });
    return { 聚风表, 烟表, 火焰 };
  }, [方案.完成, 方案.提示, 方案.低语, 方案.现身, 种子, 完成刻, 现身刻, 过渡总刻]);

  const 当前刻 = 秒 * 20;
  const 飞 = 1 - s.祭品在;
  return (
    <group>
      <安息仪式结构 秒={秒} 黑曜石底={黑曜石底} />
      {s.祭品在 > 0 &&
        祭品们.map((定, i) => {
          const p = 祭品位置(i);
          const 位: V3 = [混(p[0], 激活物位置[0], 飞), 混(p[1], 激活物位置[1], 飞), 混(p[2], 激活物位置[2], 飞) + Math.sin(飞 * Math.PI) * 0.8];
          return (
            <group key={定.名} position={位}>
              <祭品 名={定.名} 秒={秒} 缩放={s.祭品在} />
            </group>
          );
        })}
      {s.有激活物 && (
        <group position={激活物位置}>
          <破碎之环 秒={秒} />
        </group>
      )}
      {秒 >= 0 && <祭品碎屑 秒={秒} 起={0} 止={Math.min(方案.祭品消失, 方案.完成)} 种子={种子} />}
      <group position={祭坛中心}>
        <光柱 年龄刻={当前刻 - 完成刻} />
        <召唤法阵 年龄刻={s.过渡真实刻} 半边={s.法阵半边} 环高={s.环高} />
        {秒 >= 方案.完成 && <聚风带们 表={聚风表} 真实刻={当前刻 - 完成刻} />}
      </group>
      <大烟们 表={烟表} 当前刻={当前刻} />
      <VanillaParticles spawns={火焰} 秒={秒} />
      {s.亚波伦在 && children}
    </group>
  );
};
