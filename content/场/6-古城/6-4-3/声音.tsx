// 6-4-3 挡箭三段的声音：只有原版音效（src/音效/），按 编排.ts 的声音链（挥刀的破空声 → 振动 → 感测体触须 → 尖啸体）落在画面的那一刻。
// 三段是一条全局时间线（时间线.ts）上的三个窗口，声音也排在全局帧上，每段放自己那一截：上一段没放完的接着响进下一段。
// 各声音的规则（照 1.20.1，javap 核对）：
// - 感测体激活（`SculkSensorBlock.activate`）：block.sculk_sensor.clicking，volume 1.0、pitch 0.8 + r × 0.2，位置是方块中心，增益 0.73，16 格听不见；
//   收到振动的感测体各响一次。冷却完（激活后 30 刻 ACTIVE + 10 刻 COOLDOWN）放 clicking_stop（增益 0.62），触须停止快抖就是这一下。
// - 尖啸（`LevelRenderer.levelEvent` 3007）：一次触发只放一声 block.sculk_shrieker.shriek（volume 2.0、pitch 0.6 + r × 0.4，位置是方块顶面中心 y + 0.5），
//   同一刻放 10 个声波环（每隔 5 刻一个），是「一声尖啸、10 个环」，不是一个环一声。增益 1、27.2 格听不见。
// - 黄叛「贼子，拿命来！」（台词，src/配音/）：用户 10-12 在剪映里挪到放箭那一刻（放箭前 18 帧开口，见 `shoutLine`）；黄叛在 370 米外，
//   喊声照实际要 1.08 秒才传到李樱，台词照样放给观众听（不做距离衰减，见 台词轨.tsx）；前半句压在李樱翻箱子的镜头上，跨段的话下一段接着放剩下的（帧是负的）。
// - 箱子盖落下（听到「哄」松手，G.转身起）：关箱声（模型/物品/箱子.tsx 的 chestSound）。
// - 风扇虚影的嗡鸣：机械动力运动方块的声景（KINETIC = entity.minecart.inside，实例音量 0.25，满转 256 rpm 时音高 1），跟着风扇显出、淡掉；
//   `SoundScape.getVolume` 还要乘 2(1 − 距离/16) 和 clamp(同组方块数/150, 0.025, 0.1)，近处总共约 −38 dB，基本听不见，所以分档（「中」）。
// - 「哄」和风场（`AirCurrentSound` = item.elytra.flying）：音高 clamp(速度 × 0.5, 0.5, 2)，风道里的风几千米每秒 → 2；音量从 0.01 起每刻淡入 0.05，
//   上限 clamp(转速 / 128 × 0.4, 0.01, 0.4)；从「哄」放到风扇停。
// - 放箭：entity.arrow.shoot（`BowItem.releaseUsing`，满弓 volume 1、pitch 1 / (1.2 + r × 0.4) + 0.5），位置是黄叛。
// - 拔刀：夜幕刀光挥刀带的 efn:whoosh_light_1；刀挥到正前方后第 2 刻拔刀剑的斩击放 item.trident.throw（volume 0.8、pitch 0.625 + r × 0.1）；
//   刀刃扫过箭的「叮」= efn:parry（volume 0.5、pitch 1）。拔刀剑和原版都不发这些对应的振动，振动链只从挥刀那一刻算。
// - 击穿方块：箭一路往上打穿到地面（几何.ts 的 `一路击穿`），每块被箭尖碰到那一刻按原版破坏方块的声音（levelEvent 2001：pitch 0.8，按方块挑，见 `breakSound`）；
//   没有箭扎进方块的声音（用户 10-18：箭是破坏方块的）。洞顶掉下来那一块（幽匿块）落地（几何同 编排.ts 的 碎块）也放一声它的破坏声。
// 响度按 混音.ts 的分档（用户 10-18 定先填初值、听了再改）：招架、尖啸「重」，其余（放箭、拔刀、斩击、落地、感测体、碎裂链的第一声、风场、嗡鸣、箱子关盖）「中」（用户 10-18 合成两档）。
// 碎裂一串越往上越远：从「中」起每块小 `breakChainStepDb`，小过 `breakChainCutoff` 就不放（用户 10-18：「前一段持续衰减 后面的听不到」）。
// 上面照游戏算的音量、距离，现在只对没分档的声音（箱子）还算数。
// 慢放里的声音（时钟最慢 1/500，见 时间线.ts；规则在 src/音效/慢放.ts，各段共用）：
// - 事件落在慢放里的，从那一帧起按画面时间原速放（只是「那一刻响了」的提示）；
// - 时钟回到原速以后按剧情时间对：剧情时间里还没放完、原速那一遍已放完的声音，从剧情时间响到的地方接着放。
// 落点全由 编排.ts 的声音链和 时间线.ts 的时钟推出来，这里不写帧号；核对：node 工具/一镜到底/跑.mjs 工具/挡箭/音效落点.ts（参考模型库/ 下）。
// 挥刀（斩击实体生成、振动从这一刻发出）比弹开早 0.0043 剧情秒（见 几何.ts 的 弹开关键帧）。振动要飞 2～7 刻，6-4-3b 在弹开后 0.008 剧情秒就切了，
// 所以咔嗒和尖啸都在 6-4-3c 时钟回到原速前后。6-4-3c 不拍箭（用户 10-10 定），击穿的碎裂都在画外响，慢放里按画面时间一声挨一声排开。
// 远近：听者是镜头机位（src/音效/游戏音效.tsx），照游戏线性衰减：
// - 洞顶离李樱机位 17～23 米，超过方块破坏声的 16 格，照游戏听不见；破坏方块、箭命中算主要动作，吃 混音.ts 的 −12 dB 下限，听得到。
// - 尖啸和头几声咔嗒落在李樱镜头；切到黄叛（几十米外）尖啸只剩主要动作下限，咔嗒听不见，这是游戏规则，不是漏了；切回李樱，尖啸接着响、咔嗒停。
import React from 'react';
import { useVideoConfig } from 'remotion';
import { rng, type V3 } from '../../../../engine/model/parts.tsx';
import { GameSoundTrack, LoopSound, randomPitch } from '../../../../engine/audio/游戏音效.tsx';
import { tierLoudness } from '../../../../engine/audio/混音.ts';
import { scheduleToScreen, type StoryEvent } from '../../../../engine/audio/慢放.ts';
import { LineTrack, lineTable } from '../../../../engine/audio/台词轨.tsx';
import { toScene } from '../../../../world/地点/古城4x/6-4-1/古城戏.ts';
import { archery } from '../../../../world/地点/古城4x/布局.ts';
import { chestSound } from '../../../../world/物品/箱子.tsx';
import * as geom from './几何.ts';
import * as choreo from './编排.ts';
import * as timeline from './时间线.ts';

const tickSec = 1 / 20;

// 方块破坏声：原版各方块的 SoundType 的 break 声（都是 volume 1、pitch 1，所以下面一律 1、0.8）。泥土是 GRAVEL；闪长岩、安山岩、石头、青金石矿是 STONE
const breakSound: Record<geom.洞顶方块, string> = { 幽匿块: 'block.sculk.break', 深板岩: 'block.deepslate.break', 凝灰岩: 'block.tuff.break' };
const breakSoundById: Record<string, string> = {
  sculk: 'block.sculk.break',
  deepslate: 'block.deepslate.break',
  tuff: 'block.tuff.break',
  dirt: 'block.gravel.break',
  gravel: 'block.gravel.break',
  stone: 'block.stone.break',
  diorite: 'block.stone.break',
  andesite: 'block.stone.break',
  lapis_ore: 'block.stone.break',
};
const breakChainStepDb = 1.5;
const breakChainCutoff = -38;
export const storyEvents: StoryEvent[] = (() => {
  const rand = rng(6403);
  const out: StoryEvent[] = [];
  // 感测体：激活时刻从 编排.ts 的 感测体(g) 反推（激活秒 = 剧情时间 − 激活时刻）
  const activateSecs = choreo.sensorStates(0).map((q) => -q.secSinceActive);
  choreo.sensors.forEach(([x, y, z], i) => {
    if (!Number.isFinite(activateSecs[i])) return;
    const sensorPos: V3 = toScene(x + 0.5, y + 0.5, z + 0.5);
    out.push({ 名: `感测体${i}激活`, 事件: 'block.sculk_sensor.clicking', 档: '中', T: activateSecs[i], 位置: sensorPos, 音量: 1, 音高: randomPitch.感测体(rand()), 选: rand() });
    out.push({ 名: `感测体${i}停`, 事件: 'block.sculk_sensor.clicking_stop', 档: '中', T: activateSecs[i] + 40 * tickSec, 位置: sensorPos, 音量: 1, 音高: randomPitch.感测体(rand()), 选: rand() });
  });
  if (choreo.shriek) {
    const shriekerPos = choreo.shriek.p;
    out.push({ 名: '尖啸', 事件: 'block.sculk_shrieker.shriek', 档: '重', T: choreo.shriek.t, 位置: [shriekerPos[0], shriekerPos[1], shriekerPos[2] + 0.5], 音量: 2, 音高: randomPitch.尖啸(rand()), 选: rand() });
  }
  // 随机数另起一串，不动上面感测体、尖啸已定的音高和文件
  const r2 = rng(6413);
  out.push({ 名: '箱子关盖', ...chestSound('关', r2), T: geom.转身起, 位置: geom.方块中心(archery.箱子 as V3) });
  out.push({ 名: '放箭', 事件: 'entity.arrow.shoot', 档: '中', T: geom.放箭, 位置: geom.黄叛眼, 音量: 1, 音高: 1 / (1.2 + r2() * 0.4) + 0.5, 选: r2() });
  out.push({ 名: '拔刀', 事件: 'efn:whoosh_light_1', 档: '中', T: geom.拔刀起, 位置: geom.李樱眼, 音量: 1, 音高: 1, 选: r2() });
  out.push({ 名: '招架', 事件: 'efn:parry', 档: '重', T: geom.弹开, 位置: geom.弹开点, 音量: 0.5, 音高: 1, 选: r2() });
  out.push({ 名: '斩击', 事件: 'item.trident.throw', 档: '中', T: geom.挥刀 + 2 * tickSec, 位置: geom.斩击位置, 音量: 0.8, 音高: 0.625 + r2() * 0.1, 选: r2() });
  geom.一路击穿.forEach(({ 方块, id, 程 }, i) => {
    const loudness = tierLoudness.中 - breakChainStepDb * i;
    if (loudness < breakChainCutoff) return;
    out.push({ 名: `击穿${i}`, 事件: breakSoundById[id], 响度: loudness, T: geom.弹开 + (程 - 0.225) / geom.箭速上限, 位置: geom.方块中心(方块), 音量: 1, 音高: 0.8, 选: r2() });
  });
  // 掉下来那一块：编排.ts 的 碎块 从箭碰到它那一刻起按 16 米/秒² 往下掉，方块中心落到 地面z + 0.5，落地在 K.落石落地
  for (const fallBlock of geom.掉落方块) {
    const fallCenter = geom.方块中心(fallBlock);
    const groundZ = toScene(0, geom.落石地面y, 0)[2];
    const fallName = geom.击穿方块名[geom.击穿方块.findIndex((b) => b.join() === fallBlock.join())];
    out.push({ 名: '落石落地', 事件: breakSound[fallName], 档: '中', T: choreo.rockLandSec, 位置: [fallCenter[0], fallCenter[1], groundZ + 0.5], 音量: 1, 音高: 0.8, 选: r2() });
  }
  return out;
})();

// 排到全局帧上：先按画面时间原速放；落在慢放里的，时钟回到原速那一帧再按剧情时间接上（src/音效/慢放.ts）
export const sounds = scheduleToScreen(storyEvents, timeline);

const listener = (g: number) => choreo.camera(Math.min(Math.max(Math.round(g), 0), timeline.总帧数 - 1)).pos;
// 风扇显出（1.85 起 0.15 秒）、放箭后淡掉，同 编排.ts 的 风扇
const fanVisibility = (g: number) => choreo.fanVisibility(timeline.剧情时间(g));
const windBurstFrame = timeline.帧小数(geom.哄);
// 「哄」落在删掉的等拉弓里（时间线.ts 的 跳过），跳过的剧情时间按原速算进淡入，A3 切进来时风已吹满
const windSkippedFrames = geom.哄 > timeline.切.A2 && geom.哄 < timeline.切.A3 ? (timeline.切.A3 - geom.哄) * timeline.FPS : 0;
// AirCurrentSound 的音量上限：clamp(转速 / 128 × 0.4, 0.01, 0.4)（见文件头）
const windVolumeCap = (g: number) => Math.min(0.4, Math.max(0.01, (choreo.fanRpm(timeline.剧情时间(g)) / 128) * 0.4));
const fanEndFrame = timeline.帧小数(choreo.fanStopSec);
// 开口在放箭前 18 帧（用户 10-12 在剪映里放的位置，「来」正对放箭）；用户 10-18 删了等拉弓以后前半句落在李樱翻箱子的镜头里
export const shoutLeadFrames = 18;
export const shoutLine = { id: '6-4-3a-黄叛-纳命来', 帧: Math.round(timeline.帧小数(geom.放箭)) - shoutLeadFrames };

// 段里第 0 帧 = 全局帧 起帧
export const DeflectSound: React.FC<{ startFrame: number; frameCount: number }> = ({ startFrame: startFrame, frameCount: frameCount }) => {
  const { fps } = useVideoConfig();
  const shoutSegFrame = shoutLine.帧 - startFrame;
  // 上一段开口、这一段还没说完的也放（剩下的那截）
  const hasShout = shoutSegFrame < frameCount && shoutSegFrame + lineTable[shoutLine.id].时长 * fps > 0;
  return (
    <>
      <GameSoundTrack sounds={sounds} listener={listener} startFrame={startFrame} frameCount={frameCount} />
      {hasShout && <LineTrack 句们={[{ id: shoutLine.id, 帧: shoutSegFrame }]} />}
      <LoopSound name="风扇嗡鸣" event="entity.minecart.inside" beginFrame={timeline.帧(1.85)} endFrame={fanEndFrame} startFrame={startFrame} tier="中" envelope={fanVisibility} position={geom.风扇心} listener={listener} />
      {/* 风：从「哄」起每刻（画面时间，慢放里的声音按画面时间放）照游戏淡入，包络 = 游戏音量 / 上限，跟着风扇淡掉 */}
      <LoopSound
        name="风场"
        event="item.elytra.flying"
        beginFrame={windBurstFrame}
        endFrame={fanEndFrame}
        startFrame={startFrame}
        pitch={2}
        tier="中"
        envelope={(g) => (Math.min(windVolumeCap(g), 0.01 + (0.05 * (g - windBurstFrame + windSkippedFrames) * 20) / fps) / 0.4) * fanVisibility(g)}
        position={geom.风扇心}
        listener={listener}
      />
    </>
  );
};
