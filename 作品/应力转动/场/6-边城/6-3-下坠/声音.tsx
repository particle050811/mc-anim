// 6-3 下坠（6-3-3 ～ 6-3-6）的声音：排在时间线.ts 的全局帧上，每段放自己那一截，上一段没放完的接着响进下一段（同 6-4-3/声音.tsx）。
// 没有配乐（一个视频只用一首歌，6-3-1 里渐弱完），只有原版 / 机械动力音效和一句台词。参数照 1.20.1 和机械动力 6.0.8（javap 核对），落点从命名时刻推，不写帧号。
// - 跃出以前没有声音：原版切换手持物品和起跳不出声，高空也没风声。脚底鼓风机虚影和嗡鸣已删（用户 10-10）。跃出、翻身藏在思索后面（时间线.ts），画面从 6-3-3 俯冲起。
// - 被风推着下冲（推力来源不画，风声留着，用户 10-10 定）：机械动力 `AirCurrent.enableClientPlayerSound` 放 `AirCurrentSound`（item.elytra.flying，循环、relative）：
//   音高 = clamp(速度（格/刻）× 0.5, 0.5, 2)，音量每刻加 0.05，上限 = clamp(转速 / 128 × 0.4, 0.01, 0.4)，256 rpm → 0.4。推力从 `tickSec.flipDone` 开始，砸地那刻没了。
//   Remotion 一个 Sequence 里音高只能是常数，所以按 0.5 一档切段、相邻段交叉淡化一帧半；上了画面的俯冲都在 80 米/秒以上，实际只有音高 2 一段。
//   推力开的那刻在 6-3-3 首帧以前（没上画面），音量按推力开了多久往上加；风声从思索推近开始淡入，淡到天空时到足（6-3-2/转场.ts 的 `windFadeIn`），
//   推近那截（6-3-2 末尾，负帧）由 6-3-2 放（思索.tsx），音高、音量按全局帧 0 那一刻（思索里的他摆的就是这一刻），听者按全局帧 0 的镜头（推近推到的就是那里）。
//   relative 的声音游戏里贴着玩家耳朵；参考视频的听者是镜头，所以风声放在李樱身上（髋），按镜头离他的远近衰减（16 格听不见）。慢放里循环声按画面时间原速放（src/音效/慢放.ts）。
//   从推近到砸地是同一条循环、不重新起头（用户 10-20：「呼啸的声音不连续……听起来很突兀」），城墙上听见的呼啸也并在这条里，只换包络（`windEnvelope`）。
// - 卫兵的望远镜（`SpyglassItem`：举起 SPYGLASS_USE，volume 1、pitch 1）：听见呼啸回头、看见金光后各自举起（编排.ts 的 `guardRaiseSec`）。位置是右眼。
//   城墙这边的声音只到 6-3-4 末帧（之后硬切回李樱、物理时间往回跳，见 时间线.ts），拖进 6-3-5 的余音淡掉。
// - 城墙上听见的呼啸：见 `城墙听见呼啸`（偏离游戏的距离衰减，有开关）。
// - 「ロードローラーだッ！」（台词 6-3-5-李樱-RoadRoller，src/配音/，语气照 DIO 原音）：原速，文件末尾落在 6-3-5 末帧，整句在 6-3-5 里（用户 10-19：台词说完接近砸地）。
//   开头 0.86 秒是蓄力的气声，「だッ」在锤砸地前 5 帧收住；举锤的动作照这几个字排（编排/李樱.ts 的 `STRIKE`）。台词不跟镜头远近走。
// - 砸地（6-3-6 第 `hitSec` 帧）：项目定的「锤砸地用 entity.player.big_fall 加方块破坏声」：`LivingEntity.causeFallDamage` 的摔落声（> 4 点 → entity.player.big_fall，volume 1、pitch 1，位置是李樱）
//   + `playBlockFallSound`（脚下方块 fall 声，volume × 0.5、pitch × 0.75：石半砖 → block.stone.fall，待导出）。
// - 一路碾碎方块（`LevelRenderer.levelEvent` 2001：volume (soundType.volume + 1) / 2、pitch soundType.pitch × 0.8 → 这里都是 volume 1、pitch 0.8，位置是方块中心）：每格在锤底碰到顶面那刻碎（填块.tsx 的 `breakSecAt`）。
//   方块 → 声音见下面的表（石类 → block.stone.break；深板岩、皓蓝石 → block.deepslate.break；幽匿块 → block.sculk.break；砂砾、方解石、凝灰岩还没导出，见 `pendingExport`）。
//   同一刻（1/20 秒）、同一种声音只放一声，位置取这一刻碎掉那些格子的中心，不叠几十层。
// - 落进古城（`liYingShaft().landSec`）：同砸地，加落点那格（游戏 (-710, -51, 240)）深板岩的 block.deepslate.fall，再叠灾变的 cataclysm:heavy_smash（偏离游戏，用户 10-18 要这下更响）。翻身站起没有脚步声：`Entity.move` 只按水平位移攒步数。
// 待导出：游戏音效.json 里还没有的事件，表里没有就先不放（不报错），导出以后自动响。
// 响度分档（混音.ts）：砸地、落进古城那下「重」（落进古城的摔落声 −12，见下），其余（一路碾碎、风声、望远镜）都是「中」（用户 10-18）。
import { 例外 } from '@engine/core/例外.ts';
import React from 'react';
import { useVideoConfig } from 'remotion';
import { rng, type V3 } from '@engine/model/parts.tsx';
import { GameSoundTrack, LoopSound } from '@engine/audio/游戏音效.tsx';
import sfxTableJson from 'asset:数据/音效/游戏音效';
import { acrossCut, distanceFeel, tierLoudness } from '@engine/audio/混音.ts';
import { scheduleToScreen, type StoryEvent, type 时间线 as 慢放时间线 } from '@engine/audio/慢放.ts';
import { LineTrack } from '../../../配音/台词轨.tsx';
import * as choreo from '../../../地点/边城/6-3-下坠/编排.ts';
import * as timeline from '../../../地点/边城/6-3-下坠/时间线.ts';
import { fillCells } from '../../../地点/边城/6-3-下坠/填块.tsx';
import { ss } from '../../../地点/边城/6-3-下坠/编排/工具.ts';
import { windFadeIn, 风起帧 } from '../../../地点/边城/6-3-2/转场.ts';

const tickSec = 1 / 20;
const FPS = timeline.FPS;
const hasEvent = (event: string) => event in (sfxTableJson as unknown as Record<string, unknown>);
export const pendingExport = ['block.stone.fall', 'block.deepslate.fall', 'block.gravel.break', 'block.calcite.break', 'block.tuff.break'].filter((e) => !hasEvent(e));

// ---------- 物理时间 ↔ 全局帧（给 慢放.ts 用） ----------
// 6-3-4 → 6-3-5 物理时间往回跳（时间线.ts），两边各排各的：城墙这边（6-3-4 末帧以前，有子弹时间）和李樱那边（6-3-5 起，原速）
const lastFrame = timeline.段表['6-3-6'].止;
const wallEnd = timeline.段表['6-3-4'].止 + 1; // 城墙这边的声音放到这一帧为止
const fracFrame = (physSec: number) => timeline.全局帧(physSec);
const wallFrame = (physSec: number) => timeline.全局帧(physSec, true);
const wallTimeline: 慢放时间线 = { FPS, 总帧数: wallEnd, 帧小数: wallFrame, 剧情时间: timeline.物理时间, 时钟: (w) => timeline.时钟(wallFrame(w)) };
const diveTimeline: 慢放时间线 = { FPS, 总帧数: lastFrame + 1, 帧小数: (w) => timeline.全局帧(w, false), 剧情时间: timeline.物理时间, 时钟: () => 1 };

// ---------- 方块 → 破坏 / 摔落声 ----------
const breakSound: Record<string, string> = {
  'minecraft:smooth_stone_slab': 'block.stone.break',
  'minecraft:stone': 'block.stone.break',
  'minecraft:granite': 'block.stone.break',
  'minecraft:andesite': 'block.stone.break',
  'minecraft:diorite': 'block.stone.break',
  'minecraft:coal_ore': 'block.stone.break',
  'minecraft:copper_ore': 'block.stone.break',
  'minecraft:gold_ore': 'block.stone.break',
  'minecraft:redstone_ore': 'block.stone.break',
  'minecraft:deepslate': 'block.deepslate.break',
  'minecraft:deepslate_copper_ore': 'block.deepslate.break',
  'minecraft:deepslate_gold_ore': 'block.deepslate.break',
  'create:asurine': 'block.deepslate.break',
  'minecraft:sculk': 'block.sculk.break',
  'minecraft:dirt': 'block.gravel.break',
  'minecraft:gravel': 'block.gravel.break',
  'minecraft:calcite': 'block.calcite.break',
  'minecraft:tuff': 'block.tuff.break',
  // 古城4x 的竖井（地表一截是台地的赤陶）：赤陶、锌矿石（机械动力照金矿石的属性）、冰火的银矿石都是 STONE
  'minecraft:terracotta': 'block.stone.break',
  'minecraft:orange_terracotta': 'block.stone.break',
  'minecraft:yellow_terracotta': 'block.stone.break',
  'minecraft:red_terracotta': 'block.stone.break',
  'create:zinc_ore': 'block.stone.break',
  'iceandfire:silver_ore': 'block.stone.break',
};

// ---------- 剧情事件（物理时间） ----------
// 一路碾碎的 44 声（1.5 秒里同时十几二十声叠着响）每声按「中」（用户 10-18：原来每声 −32 也归中）
const crushLoudness = tierLoudness.中;
let eventCache: { 城墙: StoryEvent[]; 李樱: StoryEvent[] } | null = null;
const storyEvents = () => {
  if (eventCache) return eventCache;
  const rand = rng(6303);
  const out: StoryEvent[] = [];
  const liYingHip = (w: number) => choreo.liYing(w).hip;
  // 卫兵的望远镜（瞭望时收着，看见金光才举起来）：每人举镜那一刻一声 use，位置是他的右眼（镜筒）；6-3-4 末帧以后才举的不放（那时镜头在李樱那边）。
  // 随机数另开一条（6304），r 照旧先取三个：后面砸地、碎方块挑哪个文件和以前一样
  const eye = (i: number, w: number): V3 => choreo.guardEye(i, wallFrame(w)).pos;
  const wallEvents: StoryEvent[] = [];
  rand();
  rand();
  const scopeRand = rng(6304);
  choreo.guardPositions.forEach((_, i) => {
    // 声音放在看得见抬手的时候（用户 10-18）：举镜是 smoothstep，过了 1/4 才抬起一成半
    const raiseSec = choreo.guardRaiseSec(i) + 0.25 * choreo.raiseDuration;
    const pick = scopeRand();
    if (raiseSec < timeline.墙末物理时间()) wallEvents.push({ 名: `${i}号举望远镜`, 事件: 'item.spyglass.use', T: raiseSec, 位置: eye(i, raiseSec), 音量: 1, 音高: 1, 选: pick, 止帧: wallEnd });
  });
  rand(); // 原来 4 号放下望远镜那一声（6-3-4 改成在镜中硬切，删了）的随机数，照样空取
  // 砸地
  const imp = timeline.撞击时刻();
  out.push({ 名: '砸地', 事件: 'entity.player.big_fall', 档: '重', T: imp, 位置: liYingHip(imp), 音量: 1, 音高: 1, 选: rand() });
  out.push({ 名: '砸地·石半砖', 事件: 'block.stone.fall', T: imp, 位置: choreo.shaftCellCenter(), 音量: 0.5, 音高: 0.75, 选: rand() });
  // 一路碾碎：同一刻（1/20 秒）、同一种声音一声，位置取这些格子的中心
  const shaftCenter = choreo.shaftCellCenter();
  const groups = new Map<string, { 事件: string; T: number; 和: V3; n: number }>();
  for (const x of fillCells()) {
    if (!Number.isFinite(x.碎)) continue;
    const event = breakSound[x.方块];
    if (!event) throw new Error(`6-3-下坠/声音.tsx：${x.方块} 没写破坏声`);
    const k = `${Math.floor((x.碎 - imp) / tickSec + 1e-9)}|${event}`;
    const group = groups.get(k) ?? { 事件: event, T: x.碎, 和: [0, 0, 0] as V3, n: 0 };
    group.T = Math.min(group.T, x.碎);
    group.和 = [group.和[0] + shaftCenter[0] + x.dx, group.和[1] + shaftCenter[1] + x.dy, group.和[2] + (x.底z + x.顶z) / 2];
    group.n++;
    groups.set(k, group);
  }
  [...groups.values()]
    .sort((a, b) => a.T - b.T)
    .forEach((g, i) => out.push({ 名: `碎${i}·${g.事件.split('.')[1]}×${g.n}`, 事件: g.事件, 响度: crushLoudness, T: g.T, 位置: [g.和[0] / g.n, g.和[1] / g.n, g.和[2] / g.n], 音量: 1, 音高: 0.8, 选: rand() }));
  // 落进古城，锤砸在古城地面上（落点那格是深板岩）。用户 10-18 嫌这下砸地声小：叠一声灾变的 heavy_smash（「重」，震地特效也照灾变，碎块.tsx），摔落声从「中」提到 −12；
  // 摔落声不给「重」：它文件峰值 −0.2 dBFS，按「重」要再加 1.8 dB，和 heavy_smash 叠着顶到 0 dBFS 削波。深板岩照旧「中」（按「重」要加 6～13 dB，也削波）
  const shaft = choreo.liYingShaft();
  const landPos: V3 = [shaftCenter[0], shaftCenter[1], choreo.ancientCityFloorZ];
  out.push({ 名: '落地', 事件: 'entity.player.big_fall', 响度: 例外('音效分档', -12, { 段: '6-举锤砸穿', 原因: '用户 10-18 嫌砸地小' }), T: shaft.落地, 位置: liYingHip(shaft.落地), 音量: 1, 音高: 1, 选: rand() });
  out.push({ 名: '落地·深板岩', 事件: 'block.deepslate.fall', T: shaft.落地, 位置: landPos, 音量: 0.5, 音高: 0.75, 选: rand() });
  out.push({ 名: '落地·重砸', 事件: 'cataclysm:heavy_smash', 档: '重', T: shaft.落地, 位置: landPos, 音量: 1, 音高: 1, 选: rand() });
  eventCache = { 城墙: wallEvents.filter((e) => hasEvent(e.事件)), 李樱: out.filter((e) => hasEvent(e.事件)) };
  return eventCache;
};
// 排到全局帧上：落在慢放里的按画面时间原速放（src/音效/慢放.ts）
let soundCache: ReturnType<typeof scheduleToScreen> | null = null;
export const sounds = () => (soundCache ??= [...scheduleToScreen(storyEvents().城墙, wallTimeline), ...scheduleToScreen(storyEvents().李樱, diveTimeline)]);

// ---------- 听者 ----------
const camPos = (g: number) => choreo.camPose(Math.min(Math.max(Math.round(g), 0), lastFrame)).pos;
// 风声挂在李樱身上，按镜头离他多远算（`windEnvelope`）。负帧（思索推近）按全局帧 0 算
const relToLiYing = (globalFrame: number): V3 => {
  const cam = camPos(globalFrame);
  const hip = choreo.liYing(timeline.物理时间(Math.max(0, globalFrame))).hip;
  return [cam[0] - hip[0], cam[1] - hip[1], cam[2] - hip[2]];
};
const impactFrame = fracFrame(timeline.撞击时刻());

// ---------- 风声（AirCurrentSound） ----------
const windStart = 风起帧;
// 负帧的 物理时间 是 6-3-2 自己的（还在扫帚上）；推近时风声停在全局帧 0 那一刻（思索里的他摆的就是这一刻的架势），不往回倒推到跃出以前（会从 0.5 一路换挡、换一次重新起一次头）
const windPhys = (globalFrame: number) => (globalFrame < 0 ? timeline.刻.俯冲起 : timeline.物理时间(globalFrame));
const windVolumeCap = Math.min(0.4, Math.max(0.01, (timeline.鼓风机.rpm / 128) * 0.4));
const ticksPerFrame = 1 / tickSec / FPS; // 画面一帧几刻
// 音量每刻加 0.05：按推力开了多久（物理时间）算
const windRamp = (physSec: number) => Math.min(windVolumeCap, 0.01 + 0.05 * Math.max(0, physSec - timeline.鼓风机.开) / tickSec);
const windVolume = (globalFrame: number) => {
  if (globalFrame <= impactFrame) return windRamp(windPhys(globalFrame)) * windFadeIn(globalFrame);
  const atImpact = windRamp(timeline.撞击时刻());
  return Math.max(0, atImpact - 0.05 * (globalFrame - impactFrame) * ticksPerFrame);
};
const windEnd = impactFrame + (windVolumeCap / 0.05) / ticksPerFrame + 1;
const windPitch = (globalFrame: number) => {
  const physSec = windPhys(globalFrame);
  const speed = Math.hypot(...timeline.李樱下落(physSec).v) / 20; // 格/刻
  return Math.min(2, Math.max(0.5, speed * 0.5));
};
// 风声是下冲这几段唯一的底（没有配乐），分「中」档（用户 10-18）：照游戏算的只有 −45 LUFS。分档后远近只剩一点，所以 16 格外听不见另乘进包络（12～16 格淡掉），
// 不然切到城墙远景（离他几百米）也照样响
const inEarshot = (globalFrame: number) => {
  const d = Math.hypot(...relToLiYing(globalFrame));
  return Math.min(1, Math.max(0, (16 - d) / 4));
};
// 按 0.5 一档切段（整帧），相邻两段交叉淡化 交叉 帧
const crossfade = 1.5;
type WindSlice = { start: number; end: number; pitch: number };
const windSlices: WindSlice[] = (() => {
  const out: WindSlice[] = [];
  const g0 = windStart;
  for (let frame = g0; frame <= Math.ceil(windEnd); frame++) {
    const pitch = Math.round(windPitch(Math.min(frame + 0.5, impactFrame)) * 2) / 2;
    const last = out[out.length - 1];
    if (last && last.pitch === pitch) last.end = frame + 1;
    else out.push({ start: frame, end: frame + 1, pitch: pitch });
  }
  return out;
})();
const sliceWeight = (i: number, globalFrame: number) => {
  const slice = windSlices[i];
  const fadeIn = i === 0 ? 1 : Math.min(1, Math.max(0, (globalFrame - (slice.start - crossfade / 2)) / crossfade));
  const fadeOut = i === windSlices.length - 1 ? 1 : Math.min(1, Math.max(0, (slice.end + crossfade / 2 - globalFrame) / crossfade));
  return fadeIn * fadeOut;
};

// ---------- 城墙上听见的呼啸 ----------
// 用户 10-13 定：卫兵是循着李樱下坠的呼啸声回头的，观众也得听见。上面挂在李樱身上的风声 16 格外听不见，镜头在城墙时他还在几百米高。
// 所以 6-3-4 这几拍不按距离衰减，另给一条包络（相对贴着他时的满音量）：切城墙那一刻接着响、只是远了（`atCut`），随他靠近变响，进望远镜时到满，和 6-3-5 贴着他的接上。
// 用户 10-20 嫌呼啸不连续（原来切城墙后静 8 帧、察觉前才从无到有）：和贴着他的风声是同一条循环，不断、不重新起头。
// 为让参考视频听得出因果而偏离游戏（同 混音.ts 的 主要动作下限），想全按游戏就把 `城墙听见呼啸` 改成 false。
export const wallHearsWhoosh = true;
const G5 = timeline.段表['6-3-5'].起;
const farWhoosh = { cut: timeline.城防.切墙, inScope: timeline.城防.镜中, atCut: 0.6 };
const farWhooshVolume = (globalFrame: number) =>
  globalFrame < farWhoosh.cut || globalFrame >= G5 ? 0 : farWhoosh.atCut + (1 - farWhoosh.atCut) * ss((globalFrame - farWhoosh.cut) / (farWhoosh.inScope - farWhoosh.cut));
// 一条风声的包络（相对 `中` 档）：城墙那几拍用上面的，其余贴着他按游戏的音量、16 格外听不见、再乘一点远近（同 游戏音效.tsx 分档的 `distanceFeel`）
const nearWind = (globalFrame: number) =>
  (windVolume(globalFrame) / windVolumeCap) * inEarshot(globalFrame) * distanceFeel(Math.hypot(...relToLiYing(globalFrame)));
const wallWind = (globalFrame: number) => (wallHearsWhoosh ? farWhooshVolume(globalFrame) : nearWind(globalFrame));
// 切城墙从贴着他换到远远听见，原来在切点一下小 3.7 dB（用户 10-20：「两段之间的音频没有平滑过渡」）：切点前后重叠交叉（混音.ts 的 `acrossCut`），
// 重叠到切后 0.5 秒为止，早于察觉（切后 1 秒），卫兵听见变响回头不受影响
const intoWall = acrossCut(nearWind, wallWind, farWhoosh.cut);
const windEnvelope = (globalFrame: number) => (globalFrame < G5 ? intoWall(globalFrame) : nearWind(globalFrame));

// 台词：6-3-5 原速，文件末尾落在 6-3-5 末帧（= 6-3-6 首帧，砸地前 `撞击段内帧` 帧），举锤的动作照它排（编排/李樱.ts 的 `shoutLine`）
const RoadRoller = choreo.shoutLine;

// 核对用（同步表、包络对照）：各声的全局帧
export const fallSoundTable = () => ({
  sounds: sounds().map((s) => ({ 名: s.名, 事件: s.事件, 帧: s.帧 })),
  wind: { start: windStart, 止: windEnd, 段: windSlices },
  farWhoosh: wallHearsWhoosh ? { 起: farWhoosh.cut, 止: G5 } : null,
  RoadRoller,
  待导出: pendingExport,
});

export const FallSound: React.FC<{ segment: timeline.段名 }> = ({ segment: segment }) => {
  const { durationInFrames } = useVideoConfig();
  const startFrame = timeline.段表[segment].起;
  const lineSegFrame = RoadRoller.帧 - startFrame;
  return (
    <>
      <GameSoundTrack sounds={sounds()} listener={camPos} startFrame={startFrame} frameCount={timeline.段帧数(segment)} />
      {windSlices.map((s, i) => (
        <LoopSound
          key={i}
          name={`风·音高${s.pitch}`}
          event="item.elytra.flying"
          beginFrame={i === 0 ? s.start : s.start - crossfade / 2 - 0.5}
          endFrame={i === windSlices.length - 1 ? s.end : s.end + crossfade / 2 + 0.5}
          startFrame={startFrame}
          pitch={s.pitch}
          tier="中"
          envelope={(g) => windEnvelope(g) * sliceWeight(i, g)}
        />
      ))}
      {lineSegFrame >= 0 && lineSegFrame < durationInFrames && <LineTrack 句们={[{ id: RoadRoller.id, 帧: lineSegFrame }]} />}
    </>
  );
};
