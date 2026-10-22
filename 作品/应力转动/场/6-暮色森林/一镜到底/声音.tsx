// 一镜到底（6-1-4至9）的原版音效：没有台词，配乐在 画面.tsx 的 `OnerSegment` 里。
// 全部排在全局时间轴上（路线.ts：全局帧 `F`、物理时间 `T`），`OnerSound` 放 [起帧, 起帧 + 帧数) 那一截，开头在起帧之前的从起帧接着放。
// 时刻都从各处 编排.ts 的物理时刻（贯穿 = 0）+ 路线.ts 的 `pierceTimes` 推出来，这里不写帧号。
// 慢放（巫妖、冰雪女王、巨人三处子弹时间）：照 src/音效/慢放.ts——落在慢放里的声音从那一帧起按画面时间原速放，时钟回到原速后按物理时间接着放没放完的。远景三处（九头蛇、暮初恶魂、雪怪首领）原速。
// 听者 = 镜头机位（镜头.ts 的 `cameraAt`）。响度按 混音.ts 分档，距离只留一点远近感；照游戏远处听不见的（远景里的钻土丘、钻出雪地，慢放后接着放的余音）不放，镜头飞出可听范围的截断（`cutWhenOutOfRange`）；九头蛇死亡声截断后只剩开头，从吼声起放、另给响度（用户 10-20，见 事件表.ts）。
// 扫帚飞行在车万女仆里没有声音，巡航、加速都不加风声。
//
// 有哪些声音（照 1.20.1 和暮色森林 4.3.2508，javap 核对过；volume、pitch 是传给 playSound 的值，r 是固定种子的随机数）：
// - 每次穿刺：1.20.1 没有长矛，按玩家近战攻击放（`Player.attack`：骑扫帚不算疾跑暴击，满蓄力 entity.player.attack.strong，1、1，在李樱处），矛尖碰到 boss 身子那一刻。
//   boss 一下就死：`LivingEntity.hurt` 致死那一下只放 `getDeathSound`，volume = `getSoundVolume`、pitch = `getVoicePitch`：
//   · 巫妖 lich.death（1、(r1 − r2) × 0.2 + 1）；九头蛇 hydra.death（2、默认嗓音）；
//   · 暮初恶魂 ur_ghast.death（16、(r1 − r2) × 0.2 + 0.5）；雪怪首领 alpha_yeti.death（4、0.5 + r × 0.5）；
//   · 冰雪女王 snow_queen.death（1、默认嗓音）；巨人矿工、武装巨人 entity.hostile.death（1、默认嗓音）。
// - 九头蛇三个头抬起来（6-1-6 编排.ts 的 `hydraHeads`：`T_DIVE` 前 0.25 秒起）：hydra.growl（2、默认嗓音），远景听不见，不放。
// - 巫妖破盾：六瓶喷溅型治疗药水一起脱手（`SplashPotionItem.use`：entity.splash_potion.throw，0.5、0.4 / (0.8 + r × 0.4)，在李樱处；同一刻同一文件，只放一声），每瓶砸中时药水碎（levelEvent 2002：entity.splash_potion.break，1、0.9 + r × 0.1）、
//   护盾碎一层（`Lich.hurt`：shield.break，1、getVoicePitch × 2，夹到 2）。手前端的鼓风机虚影按机械动力运动方块的声景嗡鸣（KINETIC = entity.minecart.inside，音量 0.25 × 虚影显隐，同 6-4-3 的风扇虚影），跟着李樱的手走。
// - 冰雪女王的七块冰盾被撞散：`SnowQueenIceShield.hurt` 放 snow_queen.break（1、(r1 − r2) × 0.7 + 1），在每块冰盾处，贯穿那一刻。
// - 撞穿墙、钻穿土丘和雪地：照机械动力 6.0.8 钻头破坏方块的规则，每一格方块各放各的（用户 10-10：钻头破坏方块也有声音；见 声音/方块声.ts）。
// - 战利品箱（一镜到底/战利品.tsx 的 `lootChests`）：冒出来 boss_chest.appear（`IBossLootBuffer`：128、(r1 − r2) × 0.175 + 0.5，在箱子处），被钻碎按方块破坏 block.wood.break（1、0.8）；
//   物品被吸走时放拾取声（`ClientPacketListener.handleTakeItemEntity`：entity.item.pickup，0.2、(r1 − r2) × 1.4 + 2，物品开始被吸的那一刻）。巨人没有箱子，掉的镐、剑同样有拾取声。
// - 6-1-9 降落：收扫帚 = 打掉扫帚实体（`AbstractEntityFromItem.hurt`：block.wool.break，1、1），掉出来的扫帚物品同一刻被吸走（拾取声）；
//   两人落到屋顶上按脚步放（城堡砖默认 STONE：block.stone.step，0.15、1），各一声。落差 3.5 格按原版会摔掉 1 点血，画面上是站稳，没加。
// 实现拆在 声音/ 下：方块声（撞墙、钻隧道）、事件表（全部 StoryEvent）、限幅（并声、限幅、听者、鼓风机虚影）。
import React from 'react';
import { type V3 } from '@engine/model/parts.tsx';
import { LoopSound, GameSoundTrack, resolveSound, type SoundCue } from '@engine/audio/游戏音效.tsx';
import { scheduleToScreen, type StoryEvent, type 时间线 } from '@engine/audio/慢放.ts';
import * as route from './路线.ts';
import { wallSounds } from './声音/方块声.ts';
import { storyEvents } from './声音/事件表.ts';
import { mergeSounds, listener, fanStart, fanEnd, fanEvent, fanVolume, limitWallSounds } from './声音/限幅.ts';

// 物理时间 ↔ 全局帧（慢放.ts 的时间线）
const timeline: 时间线 = { FPS: route.FPS, 总帧数: route.总帧数, 帧小数: route.帧, 剧情时间: route.物理时间, 时钟: (T) => route.时钟(route.帧(T)) };
// 慢放结束后「接着放」的余音不放：三处慢放回到原速时镜头都已飞出百来格，照游戏听不见，分档后却会照档位响（用户 10-18：远处听不见就删）
const toScreen = (events: StoryEvent[]) => scheduleToScreen(events, timeline).filter((s) => !s.名?.endsWith('（接着放）'));
// 镜头飞出一声在游戏里的可听范围（16 × 音量 格；开头就在范围外的，如镜头一直在 24 格外跟拍的巨人，以开头距离的两倍算）就截断（止帧，5 帧淡出）：分档后不随距离变小，
// 远景三处 boss 的死亡声长 3～8 秒，镜头每帧飞出几十格，不截就一路吼进下一段（用户 10-18：「飞远了 听不到了 应该直接截断了」）
const cutWhenOutOfRange = (sound: SoundCue): SoundCue => {
  const resolved = resolveSound(sound);
  const dist = (f: number) => {
    const p = listener(f);
    return Math.hypot(p[0] - sound.位置[0], p[1] - sound.位置[1], p[2] - sound.位置[2]);
  };
  const limit = Math.max(resolved.range, 2 * dist(sound.帧));
  const end = Math.min(sound.帧 + resolved.durationSec * route.FPS, route.总帧数);
  for (let f = Math.ceil(sound.帧); f < end; f++) if (dist(f) > limit) return { ...sound, 止帧: Math.min(f, sound.止帧 ?? Infinity) };
  return sound;
};
const otherSounds = toScreen(storyEvents.filter((e) => !wallSounds.has(e))).map(cutWhenOutOfRange);
const limitedWallSounds = limitWallSounds(otherSounds, mergeSounds(toScreen(storyEvents.filter((e) => wallSounds.has(e)))));
export const onerSounds = [...otherSounds, ...limitedWallSounds];
export const onerEvents = storyEvents;

// 鼓风机虚影跟着李樱的手走：声源放在原点，听者给「镜头相对扫帚」的位置
const listenerRelBroom = (frame: number): V3 => {
  const camPos = listener(frame);
  const broomPos = route.扫帚(Math.round(frame)).位置;
  return [camPos[0] - broomPos[0], camPos[1] - broomPos[1], camPos[2] - broomPos[2]];
};

// 段里第 0 帧 = 全局帧 起帧
export const OnerSound: React.FC<{ startFrame: number; frameCount: number }> = ({ startFrame: startFrame, frameCount: frameCount }) => (
  <>
    <GameSoundTrack sounds={onerSounds} listener={listener} startFrame={startFrame} frameCount={frameCount} />
    <LoopSound
      name="鼓风机虚影"
      event={fanEvent}
      beginFrame={fanStart}
      endFrame={fanEnd}
      startFrame={startFrame}
      volume={fanVolume}
      position={[0, 0, 0]}
      listener={listenerRelBroom}
    />
  </>
);
