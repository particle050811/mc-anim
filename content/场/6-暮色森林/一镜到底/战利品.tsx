// 战利品（用户 10-02）：每个被冲刺击杀的怪物，在死亡位置生成战利品箱子，被外包动力钻头虚影的长矛打爆，物品被吸到主角身上
// （6-2-1 桌上的炽热的血、雪怪首领毛皮是这里拿到的）。时序：矛尖碰到 boss 的那一刻 boss 死、变半透明（BOSS死时透明度，各段 编排.ts），
// 箱子同一刻冒在它身体正中（穿刺线 `身[].centerAlong`），矛尖再往前钻 0.7 米打碎；路线、速度、穿刺表都不改。
// 箱子用暮色森林自己的木箱，不是 Lootr 的（各 boss 用哪种见 物品/箱子.tsx），像原版破坏方块那样崩成小方片消散（不碎成木板）。
// 重点是掉出来的物品：往四周、前、上迸出，再像原版拾取那样被吸向李樱，追上后缩小消失。boss 原本的死亡效果照旧（各段 戏.tsx）。
// 六处：巫妖、九头蛇、暮初恶魂、雪怪首领、冰雪女王、两个巨人（巨人不是 boss，不出箱子，东西掉在矛尖那个高度、李樱顺手收走）。
// 动力钻头虚影（原文第 4 章）只在冲刺击杀时出现：撞上第一样东西前一瞬亮起，穿出去后收掉，包在矛头外面绕矛的轴转。
// 时间一律是物理时间（各段 编排.ts 的 t，贯穿 = 0）；慢放只缩时钟，碎片、物品的速度不改。
import React from 'react';
import * as THREE from 'three';
import type { V3 } from '../../../../engine/model/parts.tsx';
import { toScene } from '../../../../world/角色/骑扫帚.tsx';
import { TIP_LOCAL } from '../../../../world/角色/骑扫帚持矛.tsx';
import { SPEAR } from '../../../../world/物品/下界合金长矛.tsx';
import { DRILL, MechanicalDrillHead, SPEAR_FIT } from '../../../../world/物品/动力钻头.tsx';
import type { DropName } from '../../../../world/物品/掉落物.tsx';
import { TWILIGHT_CHEST_TEX, type TwilightChestWood } from '../../../../world/物品/箱子.tsx';
import { LootChestBurst } from '../../../../world/特效/战利品箱碎裂.tsx';
import { closeupBreakClockScale } from '../../../../world/特效/方块破坏粒子.tsx';
import { ItemPickup, burstItems, type BurstParams } from '../../../../world/特效/物品拾取.tsx';
import * as route from './路线.ts';

const ss = (x: number) => {
  const clamped = Math.min(1, Math.max(0, x));
  return clamped * clamped * (3 - 2 * clamped);
};

// ---------- 掉什么 ----------
// 按暮色森林 4.3.2508 jar 的 loot_tables/entities/*.json，每处挑几件有代表性的（物品图见 模型/物品/掉落物.tsx）。箱子打碎时原版按格子一堆一堆掉，所以同种东西可以有好几件。
// - 巫妖：附魔金装备 2～4 件、末影珍珠 1～4、骨头 5～9、奖杯（权杖不出：用户 10-07 不要权杖被带走）；九头蛇：肉排 5～35、炽热的血液 7～10（6-2-1 要用）、奖杯；
// - 暮初恶魂：砷铅铁矿石、炽热之泪、奖杯；雪怪首领：毛皮 6（6-2-1 要用）、冰霜炸弹 6、奖杯；冰雪女王：三发弓、浮冰、雪球、奖杯；
// - 巨人矿工：巨人镐；武装巨人：巨人剑（都要求被玩家杀死）。奖杯是带专门渲染器的头颅方块，不做。
// 箱子摆在哪：近景（巫妖、冰雪女王；巨人没有箱子但也按它定掉东西的时刻、位置）给 `身` = 穿刺线 `身[]` 的第几个（冒在 boss 身体正中）；
// 远景原速，冒出到打碎在一帧以内，只看得到崩开的粒子，粒子不能埋在 boss 身子里，所以给 `chestCenterAlong`（a，米）摆在 boss 身前
type ChestSpec = { 身?: number; chestCenterAlong?: number; 物品: DropName[]; seed: number };
// 箱子：用哪种暮色木箱（暮色 jar 里各 boss 的 remove()，见 物品/箱子.tsx）；null = 没有箱子，掉落物在它死的那一刻掉在矛尖高度、原地不动，李樱飞过去时顺手收走（见 `pickupRange`）
const lootTable: Record<route.Boss名, { 远景: boolean; 箱子: TwilightChestWood | null; 箱: ChestSpec[]; burstOverride?: Partial<BurstParams> }> = {
  // 游戏里巫妖是暮色橡木箱、林冠木箱随机二选一，挑暮色橡木（锁扣是单独的一块，近景看得清）
  巫妖: { 远景: false, 箱子: '暮色橡木', 箱: [{ 身: 0, 物品: ['金胸甲', '金剑', '末影珍珠', '末影珍珠', '骨头', '骨头', '骨头'], seed: 1 }] },
  // 矛尖对准身子正中，身子半宽约 2 格
  九头蛇: { 远景: true, 箱子: '红树木', 箱: [{ chestCenterAlong: -2.2, 物品: ['炽热的血', '炽热的血', '炽热的血', '九头蛇肉排', '九头蛇肉排', '九头蛇肉排'], seed: 2 }] },
  // 身子是 12.5 格见方的方块，矛尖在 -6.25 处碰到它迎着扫帚的那一面（直航以后由北偏东往南偏西穿，碰的是北偏东那一面）
  暮初恶魂: { 远景: true, 箱子: '暗木', 箱: [{ chestCenterAlong: -6.6, 物品: ['砷铅铁矿石', '砷铅铁矿石', '砷铅铁矿石', '砷铅铁矿石', '炽热之泪', '炽热之泪'], seed: 3 }] },
  // 碰撞箱 3.8 格宽，矛从上往下斜着扎进胸口
  雪怪首领: { 远景: true, 箱子: '林冠木', 箱: [{ chestCenterAlong: -1.4, 物品: ['雪怪首领毛皮', '雪怪首领毛皮', '雪怪首领毛皮', '冰霜炸弹', '冰霜炸弹', '冰霜炸弹'], seed: 4 }] },
  冰雪女王: { 远景: false, 箱子: '暮色橡木', 箱: [{ 身: 0, 物品: ['三发弓', '浮冰', '浮冰', '雪球', '雪球', '雪球'], seed: 5 }] },
  // 两个巨人一前一后（相距 3.6 格，见 6-1-8b/编排.ts）。巨人不是 boss，不出箱子（用户 10-02）：矛尖碰到它、它死的那一刻，巨人镐/巨人剑掉在矛尖那个高度，
  // 原地不动（用户 10-07：改成玩家同一高度掉落、顺便拾取，不用给掉落物设定超高吸取速度）；李樱胸口飞到它跟前 1 米时开始收、过去半米收完
  巨人: {
    远景: false,
    箱子: null,
    burstOverride: { forwardSpeed: [0, 0], spreadSpeed: [0, 0], upSpeed: [0, 0] },
    箱: [
      { 身: 0, 物品: ['巨人镐'], seed: 6 },
      { 身: 1, 物品: ['巨人剑'], seed: 7 },
    ],
  },
};

// ---------- 节奏 ----------
// 箱子冒出来那一下 0.4 毫秒，打掉时原地崩成原版方块破坏粒子（见 模型/特效/战利品箱碎裂.tsx）：
// - 近景：矛尖碰到 boss 时冒在它身上，往前钻 `nearChestTravel` 米时打掉：2.2 毫秒，慢放 100 倍约 5 帧（巨人慢放 80 倍）看得到钻头钻穿箱子；
// - 远景：矛尖离箱子正面 0.1 米时冒出，钻过中心 0.1 米时打掉，原速下一帧以内，只看得到崩开的粒子。
// 粒子按原版速度、寿命，近景时钟按 `closeupBreakClockScale` 加快（同 6-1-5 药水炸开），慢放下一秒上下散干净，远景原速。
// 物品迸出速度两边一样：往前 0.85～1.05 倍矛速、往四周 30～60 米/秒、往上 250～380 米/秒（见 模型/特效/物品拾取.tsx）。吸的节奏按镜头分：
// 近景（巫妖、冰雪女王、巨人）在慢放里演：物品先跟着矛尖往前往上蹦过 boss 和两人头顶，4～5.5 毫秒后开始吸，9～11.5 毫秒吸完，落在时钟恢复前后；
// 远景（九头蛇、暮初恶魂、雪怪首领）原速，照这个节奏一帧都不到，所以按原版拾取节奏（3 刻 = 0.15 秒）放长：先迸出去 0.06～0.1 秒，再 0.25～0.35 秒内追上已飞出近百米的李樱。
const halfChest = 7 / 16; // 箱子半边长、中心高度
const nearChestTravel = 0.7; // 近景：箱子冒出来以后矛尖再走多远打掉（米）
const burstOverride = (suckStart: [number, number], suckEnd: [number, number]): BurstParams => ({ forwardSpeed: [0.85 * 320, 1.05 * 320], spreadSpeed: [30, 60], upSpeed: [250, 380], 起吸: suckStart, 吸完: suckEnd });
const nearSuck = burstOverride([0.004, 0.0055], [0.009, 0.0115]);
const farSuck = burstOverride([0.06, 0.1], [0.25, 0.35]);
// 远景里离镜头远：箱子、物品按离镜头距离放大一点（20 米外开始，最多 1.8、2.2 倍），看得出有东西被吸过去
const farScale = { start: 20, chest: 1.8, item: 2.2 };
// 吸到李樱身上的哪一点（扫帚本地坐标：他坐在前座 y 0.35，上身前倾，胸口约在这里）
const liYingChest: V3 = [0, 0.6, 0.55];
// 顺手捡（没有箱子的那几件）：矛尖在李樱胸口前面多少米（扫帚本地 y 是往前），胸口离掉落物还有 起 米时开始收、过去 止 米收完
const tipToChest = TIP_LOCAL[1] - liYingChest[1];
const pickupRange = { start: 1, end: 0.5 };

const ORDER = Object.keys(route.穿刺表) as route.Boss名[];
// 胸口走到掉落物（矛尖曾在 a = 心 处）跟前 起 米、过去 止 米的时刻（打碎 = 矛尖到 碎 的那一刻起算，物理秒）
const pickupTiming = (centerAlong: number, breakAlong: number, speed: number): Pick<BurstParams, '起吸' | '吸完'> => {
  const reachT = (centerAlong + tipToChest - breakAlong) / speed;
  return { 起吸: [reachT - pickupRange.start / speed, reachT - pickupRange.start / speed], 吸完: [reachT + pickupRange.end / speed, reachT + pickupRange.end / speed] };
};
// 贴图 null = 没有箱子（t碎 = 死的那一刻，物品从 中心 掉出来）
export type 箱况 = { 名: route.Boss名; 远景: boolean; 贴图: (typeof TWILIGHT_CHEST_TEX)[TwilightChestWood] | null; 中心: V3; 朝向: number; t碎: number; 冒出: number; 件: ReturnType<typeof burstItems>; seed: number };
export const lootChests: 箱况[] = ORDER.flatMap((bossName) => {
  const pierce = route.穿刺表[bossName];
  const cfg = lootTable[bossName];
  return cfg.箱.map((spec) => {
    // 心：箱子中心；冒、碎：矛尖走到哪里时冒出来、打掉（a，米）
    const body = spec.身 === undefined ? undefined : pierce.身?.[spec.身];
    if (spec.身 !== undefined && !body) throw new Error(`${bossName} 的穿刺线没有 身[${spec.身}]`);
    const noChest = cfg.箱子 === null;
    if (noChest && !body) throw new Error(`${bossName} 没有箱子，要给 身`);
    const centerAlong = body ? body.心 : spec.chestCenterAlong!;
    const popAlong = body ? body.触 : centerAlong - halfChest - 0.1;
    const breakAlong = noChest ? body!.触 : body ? body.触 + nearChestTravel : centerAlong + 0.1;
    const tip = pierce.矛尖(centerAlong);
    const center: V3 = tip;
    const tipBefore = pierce.矛尖(centerAlong - 0.5);
    const tipAfter = pierce.矛尖(centerAlong + 0.5);
    const dir = new THREE.Vector3(tipAfter[0] - tipBefore[0], tipAfter[1] - tipBefore[1], tipAfter[2] - tipBefore[2]).normalize();
    const breakT = breakAlong / pierce.V;
    const popT = popAlong / pierce.V;
    return {
      名: bossName,
      远景: cfg.远景,
      贴图: cfg.箱子 === null ? null : TWILIGHT_CHEST_TEX[cfg.箱子],
      中心: center,
      朝向: pierce.朝向,
      t碎: breakT,
      冒出: breakT - popT,
      件: burstItems(spec.物品, center, [dir.x, dir.y, dir.z], { ...(cfg.远景 ? farSuck : nearSuck), ...cfg.burstOverride, ...(noChest ? pickupTiming(centerAlong, breakAlong, pierce.V) : {}) }, spec.seed),
      seed: spec.seed,
    };
  });
});
// 一镜到底的各段核对用：每个箱子打碎（没有箱子的：掉东西）那一刻的全局帧
export const chestBreakFrames = lootChests.map((c) => ({ 名: c.名, 帧: route.帧(route.贯穿时刻[c.名] + c.t碎) }));

// 战利品层：这一帧所有在场的箱子和物品（世界坐标）。T：物理时间；扫帚：这一帧扫帚本地 → 场景的矩阵；镜头：镜头位置
export const LootLayer: React.FC<{ T: number; broom: THREE.Matrix4; camPos: number[] }> = ({ T: physT, broom: broom, camPos: camPos }) => {
  const target = toScene(broom, liYingChest);
  const camDist = (p: number[]) => Math.hypot(p[0] - camPos[0], p[1] - camPos[1], p[2] - camPos[2]);
  const nodes: React.ReactNode[] = [];
  lootChests.forEach((chest, i) => {
    const τ = physT - route.贯穿时刻[chest.名] - chest.t碎;
    if (τ < -chest.冒出 || τ > 2.2) return;
    const chestScale = chest.远景 ? Math.min(farScale.chest, Math.max(1, camDist(chest.中心) / farScale.start)) : 1;
    // 箱子只按朝向转（立着），正面朝着冲过来的扫帚
    if (chest.贴图 && τ < (chest.远景 ? 2.1 : 2.1 / closeupBreakClockScale.chest))
      nodes.push(
        <group key={`箱${i}`} position={chest.中心} rotation={[0, 0, (chest.朝向 * Math.PI) / 180]}>
          <group position={[0, 0, -halfChest]}>
            <LootChestBurst secSinceBreak={τ} popLeadSec={chest.冒出} particleClockScale={chest.远景 ? 1 : closeupBreakClockScale.chest} scale={chestScale} seed={chest.seed} texture={chest.贴图} />
          </group>
        </group>,
      );
    if (τ >= 0)
      nodes.push(
        <ItemPickup
          key={`物${i}`}
          items={chest.件}
          τ={τ}
          target={target}
          camPos={camPos}
          scale={chest.远景 ? (p) => Math.min(farScale.item, Math.max(1, camDist(p) / farScale.start)) : undefined}
          glow={chest.远景 ? 0.7 : 0.35}
        />,
      );
  });
  return <>{nodes}</>;
};

// ---------- 动力钻头虚影 ----------
// 每处冲刺：矛尖离撞上的第一样东西（穿刺线的 `撞`）还有 8 米时亮足（之前 6 帧淡入），穿出（`出`）后再 10 米开始收、8 帧收完。
// 淡入淡出按画面帧算（显示上的亮起收掉），转速按物理时间（每秒 50 圈，慢放 100 倍时半秒一圈）
const drillWindows = ORDER.map((bossName) => {
  const pierce = route.穿刺表[bossName];
  const T0 = route.贯穿时刻[bossName];
  return { on: route.帧(T0 + (pierce.撞 - 8) / pierce.V), off: route.帧(T0 + (pierce.出 + 10) / pierce.V) };
});
export const drillGhost = (F: number) => Math.max(0, ...drillWindows.map((w) => 0.6 * ss((F - (w.on - 6)) / 6) * (1 - ss((F - w.off) / 8))));
export const drillSpin = (T: number) => T * 2 * Math.PI * 50;
// 包在矛头外面：钻尖比矛尖前 0.06 格，放大 1.1 倍（刃半径 0.34 格，整个包住 0.3 格宽、0.7 格长的矛头）
const drillSleeveScale = SPEAR_FIT.scale;
// 挂在李樱右手上、和 SpearInHand 同一个坐标系里（握持点为原点、矛尖朝 +Z、单位是玩家模型的像素，所以先乘 16）
export const SpearDrill: React.FC<{ opacity: number; spin: number }> = ({ opacity, spin }) => (
  <group scale={16}>
    <group position={[0, 0, SPEAR.tip + 0.06 - DRILL.tip * drillSleeveScale]} rotation={[0, 0, spin]} scale={drillSleeveScale}>
      <MechanicalDrillHead ghost opacity={opacity} />
    </group>
  </group>
);
