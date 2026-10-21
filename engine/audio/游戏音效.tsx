// 原版音效：文件是 工具/游戏取材/导出音效.py 从游戏资源原样拷出来的 ogg（来源、hash 和 sounds.json 的参数在 游戏音效.json），
// 镜头只给「哪一刻、在哪儿、调 playSound 时传的 volume / pitch」，播放时的音量、音高、距离衰减照 1.20.1 客户端算：
// - 音高 = 代码传的 pitch × sounds.json 的 pitch，夹在 0.5～2（`SoundEngine.calculatePitch`）。OpenAL 的 AL_PITCH 是变速变调，
//   这里用 @remotion/media 的 `playbackRate`（预览和渲染都是变速变调）；不能用 remotion 自带的 <Audio>：渲染时 playbackRate 走 ffmpeg atempo，只变速不变调。
// - 音量 = 代码传的 volume × sounds.json 的 volume，实际增益夹在 0～1（`SoundEngine.calculateVolume`，各类别音量按默认 100%）。volume 大于 1 不会更响，只是听得更远。
// - 距离衰减（`SoundEngine.play` → `Channel.linearAttenuation`）：线性距离模型，增益 × max(0, 1 − 距离 / R)，R = max(音量, 1) × attenuation_distance（sounds.json 没写就是 16 格），到 R 就听不见。
//   例：尖啸 2.0 × 0.85 → R = 27.2 格；监守者钻出、心跳、触角都是 5.0 → R = 80 格。
// - 听者 = 镜头机位（项目定的：声音跟着画面的远近走）。没做左右声像，两个声道一样。
// - 每次放哪个文件：sounds.json 里按 weight 随机挑一个（`WeighedSoundEvents.getSound`）；这里用镜头给的随机数挑，固定下来，每次渲染一样。
// - 也收模组的声音（工具/游戏取材/导出音效.py --jar）：夜幕（efn:）、史诗战斗（epicfight:）、暮色森林（twilightforest:）从各自的 jar 取，参数照搬，播放规则同上；拔刀剑没有自己的声音（用原版的三叉戟投掷、锁链等）。
// - 整条音效总线再乘 混音.ts 的 `sfxVolume`。
// 分档（混音.ts）：没给 `档` 的按事件名归一个档，除了「细节」档都不走上面的音量和距离衰减，按档定响度（见那里）。
// 文件开头有一截静音的（音效起音.json），起点往前挪这么多，听见的那一下落在给的那一帧上。
// 用法：<游戏声音轨 声们={…} 听者={(帧) => 机位} />，帧 是这条音轨自己的帧号（镜头的全局帧，配 `起帧` 用：Composition 第 0 帧 = 全局 起帧）。
import { Audio } from '@remotion/media';
import React from 'react';
import { Sequence, useVideoConfig } from 'remotion';
import type { V3 } from '../model/parts.tsx';
import sfxTableJson from 'asset:数据/音效/游戏音效';
import { defaultTier, distanceFeel, majorActionFloor, majorActionFloorOn, sfxVolume, tierLoudness, type 音效档 } from './混音.ts';
import fileLoudnessJson from 'asset:数据/音效/音效响度';
import fileOnsetJson from 'asset:数据/音效/音效起音';
import { tagSrc } from './同源区分.ts';
import { useFirstVisibleFrame, useSfxLog } from './音效清单.ts';

type SoundFile = {
  文件: string;
  索引路径: string;
  hash: string;
  时长: number;
  volume: number;
  pitch: number;
  weight: number;
  attenuation_distance: number;
};
const sfxTable = sfxTableJson as unknown as Record<string, { subtitle: string | null; 声音: SoundFile[] }>;
// 事件名：原版不带命名空间（block.sculk_shrieker.shriek），模组带（efn:parry、twilightforest:entity.twilightforest.naga.hurt），见 游戏音效.json
export type SoundEventName = string;

const ctx = import.meta.webpackContext('./', { regExp: /\.ogg$/ }) as unknown as { keys(): string[]; (k: string): string | { default: string } };
const oggUrls: Record<string, string> = {};
for (const k of ctx.keys()) {
  const oggModule = ctx(k);
  oggUrls[k.replace(/^\.\//, '')] = typeof oggModule === 'string' ? oggModule : oggModule.default;
}

// 代码里各处 playSound 传的随机音高（r、r1、r2 是 0～1 的随机数）
export const randomPitch = {
  // LevelRenderer.levelEvent 3007（尖啸）：0.6 + r × 0.4
  尖啸: (r: number) => 0.6 + r * 0.4,
  // SculkSensorBlock 激活（clicking）、冷却完（clicking_stop）：0.8 + r × 0.2
  感测体: (r: number) => 0.8 + r * 0.2,
  // LivingEntity.getVoicePitch（成年）：(r1 − r2) × 0.2 + 1，0.8～1.2、越靠 1 越多（监守者心跳、触角）
  voice: (r1: number, r2: number) => (r1 - r2) * 0.2 + 1,
};

export type SoundCue = {
  事件: SoundEventName;
  帧: number; // 在音轨的第几帧开始响（可以带小数；可以是负的 = 开头之前就响了，只放剩下的）
  位置: V3; // 发声的位置（场景坐标，1 单位 = 1 格）
  音量: number; // 代码里传给 playSound 的 volume
  音高: number; // 代码里传给 playSound 的 pitch（随机已经算好）
  选: number; // 0～1：按 weight 挑哪个文件
  起点?: number; // 从文件的第几秒放起（默认 0；剧情时间里已经响了一阵的，从响到的地方接着放）
  // 放到文件的第几秒为止（默认放完）：最后 `止点淡出` 秒线性淡出，不硬切出咔声。只给剪过的镜头用（如 6-4-8 监守者钻出提速，emerge.ogg 只取前后两阵轰响各一截），游戏里没有这回事
  stopSec?: number;
  名?: string; // 注释用
  major?: boolean; // 是不是剧情主要动作（距离衰减有下限，见 混音.ts）；不给就按事件名判断（主要动作）
  // 同一刻、同一个文件、同一音高的几声并成一声放（如一镜到底撞墙：洞里每一格方块各放一声破坏声，游戏里是同时起音、波形一样的几声，OpenAL 直接相加 = 振幅 × 份数）：几份。
  // 位置给这几声的中心，增益按一份算好（含 混音.ts 的下限）再乘份数；镜头那边限幅压过的是小数
  stackCount?: number;
  gainBoost?: number; // 游戏规则算完以后再乘的增益：照游戏放听不见、用户要求放大的个别声音（游戏里没有这回事）
  档?: 音效档; // 按档定响度（混音.ts），不走游戏的音量和距离衰减；不给按事件名归档（混音.ts 的 `defaultTier`）
  响度?: number; // 直接给目标响度（LUFS），比 档 优先
  // 到音轨的这一帧放完：前 `切点淡出帧` 帧线性淡出。给切到不相干镜头的余音用（用户 10-18：余音拖进别的镜头时淡掉）
  止帧?: number;
};

// 剧情主要动作的声音（距离衰减有下限，见 混音.ts 的 `主要动作下限`）：攻击、挥刀、命中、受伤、死亡、方块破坏、尖啸、钻出、雷击、
// 放箭和箭命中、药水碎、护盾碎、boss 宝箱冒出、落地重击。脚步、拾取、环境声、开关箱、放置、门户、循环声不算。个别声音可以用 `一声.主要` 单独指定
const majorEventRe = /attack|hurt|death|\.break$|\.shriek$|warden\.emerge|warden\.roar|trident\.throw|whoosh|parry|hit\.blade|big_fall|lightning_bolt|arrow\.(shoot|hit)|wither\.hurt|boss_chest|splash_potion|growl|\.fall$/;
export const isMajorAction = (s: SoundCue) => s.major ?? majorEventRe.test(s.事件);

export const pickFile = (event: SoundEventName, pickRand: number): SoundFile => {
  const files = sfxTable[event].声音;
  const totalWeight = files.reduce((s, x) => s + x.weight, 0);
  let k = pickRand * totalWeight;
  for (const x of files) {
    if (k < x.weight) return x;
    k -= x.weight;
  }
  return files[files.length - 1];
};

export const resolveSound = (sound: SoundCue) => {
  const file = pickFile(sound.事件, sound.选);
  const volume = sound.音量 * file.volume;
  const pitch = Math.min(2, Math.max(0.5, sound.音高 * file.pitch));
  return {
    file: file,
    pitch: pitch,
    gain: Math.min(1, Math.max(0, volume)),
    range: Math.max(volume, 1) * file.attenuation_distance,
    // 放完要多少秒（画面时间）
    durationSec: (Math.min(file.时长, sound.stopSec ?? Infinity) - (sound.起点 ?? 0)) / pitch,
  };
};

export const distanceGain = (listener: V3, source: V3, range: number) =>
  Math.max(0, 1 - Math.hypot(listener[0] - source[0], listener[1] - source[1], listener[2] - source[2]) / range);

// 一声在某一帧最后乘到文件上的音量：游戏的增益 × 距离衰减，主要动作按 混音.ts 的下限兜底，乘份数和音效总线。
// 脚步没有下限，照游戏衰减（成片的脚步交给 AI 生成，用户 10-11）。
// 距离 = `距离增益`(听者, 声源, 范围)。`游戏声音轨` 和 一镜到底/声音.tsx 的限幅预测都用它，两边算的一样
export const soundGain = (sound: SoundCue, resolved: ReturnType<typeof resolveSound>, distGain: number) => {
  const gain = resolved.gain * distGain;
  const floored = majorActionFloorOn && isMajorAction(sound) ? Math.max(gain, Math.min(resolved.gain, majorActionFloor)) : gain;
  return sfxVolume * (sound.stackCount ?? 1) * (sound.gainBoost ?? 1) * floored;
};

const fileLoudness = fileLoudnessJson as Record<string, number>;
const fileOnset = fileOnsetJson as Record<string, number>;
const dist3 = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// 分档的增益：目标响度 − 文件的有声平均响度，乘远近感和份数。「细节」档返回 undefined（照游戏规则）
const tierGain = (target: number | undefined, file: string, dist: number, stack = 1) =>
  target === undefined ? undefined : 10 ** ((target - fileLoudness[file]) / 20) * distanceFeel(dist) * stack;
const cueTarget = (s: { 档?: 音效档; 响度?: number }) => s.响度 ?? (s.档 && s.档 !== '细节' ? tierLoudness[s.档] : undefined);
// 一声归哪档：镜头给的，没给按事件名
export const cueTier = (s: SoundCue): { 档?: 音效档; 响度?: number } => ({ 档: s.档 ?? defaultTier(s.事件), 响度: s.响度 });
export const isTiered = (s: SoundCue) => cueTarget(cueTier(s)) !== undefined;
// 一声在某一帧最后乘到文件上的音量：分档的按档，「细节」档照游戏规则（`soundGain`）。`游戏声音轨` 和 一镜到底/声音/限幅.ts 的峰值预测都用它
// 脚步档另乘游戏的线性距离衰减（16 格外听不见）：画外、远处的人的脚步不放（用户 10-18 问「为什么在空中和落地后还有走路的声音」，那是画外九胡的脚步）
export const cueGain = (sound: SoundCue, resolved: ReturnType<typeof resolveSound>, listenerPos: V3) => {
  const tier = cueTier(sound);
  const gain = tierGain(cueTarget(tier), resolved.file.文件, dist3(listenerPos, sound.位置), sound.stackCount);
  if (gain === undefined) return soundGain(sound, resolved, distanceGain(listenerPos, sound.位置, resolved.range));
  return tier.档 === '脚步' && tier.响度 === undefined ? gain * distanceGain(listenerPos, sound.位置, resolved.range) : gain;
};
// 剪映片段名前的档（音效清单 的 档）：「重 -10」、直接给响度的「-21.5」、「细节」；没分档的不标
const tierLabel = (s: { 档?: 音效档; 响度?: number }) =>
  s.响度 !== undefined ? `${+s.响度.toFixed(1)}` : s.档 === '细节' ? '细节' : s.档 ? `${s.档} ${tierLoudness[s.档]}` : undefined;

// 一声实际从音轨的第几帧起放：从文件开头放的（起点 0）一律落在最近的整帧上、从文件开头完整地放，早晚不超过半帧（21 毫秒）。
// 不往后取整帧、把晚开始的那一点从文件头跳过去：刀砍、箭命中、脚步这类脆声最响的一下就在文件头 5 毫秒里，跳掉起音就没了，峰值小 10～15 dB、发闷（用户 10-11 问为什么要切掉一节）。
// 帧号是负的（上一段就开始响、这一段接着放）照同一个规则取整再只放剩下的：Math.round(帧 − 整数) = Math.round(帧) − 整数，前后两段算出来的起点相同，接得上。
// 本来就该从文件中间接着放的（起点 > 0：慢放回到原速以后按剧情时间接着放的余音）不取整，往后取整帧、把晚的那一点跳过去，落点准。
// 一镜到底/声音.tsx 撞墙限幅的峰值预测也用它，两边算的起点一样
// 文件开头的静音（音效起音.json）先从 帧 里减掉：起播早这么多，听见的那一下还在 帧 上
export const playStartFrame = (s: SoundCue, fps = 24) => {
  if ((s.起点 ?? 0) > 0) return s.帧;
  const r = resolveSound(s);
  return Math.round(s.帧 - ((fileOnset[r.file.文件] ?? 0) / r.pitch) * fps);
};

// 给了 止点 的，文件放到 止点 前这么多秒开始线性淡出
export const stopFadeSec = 0.08;
// 给了 止帧 的、`段尾淡出` 的段尾：淡出这么多帧（用户 10-18 批的 4～6 帧）
export const cutFadeFrames = 5;

// `起帧`：Composition 第 0 帧对应音轨的第几帧（一条时间线切成几段时用，同 6-4-3/时间线.ts 的全局帧）；`帧数`：这段多长，超出的不放。
// `段尾淡出`：下一段是硬切到别处、不接着放的，响过段尾的声音在最后 `切点淡出帧` 帧淡掉，不硬切
export const GameSoundTrack: React.FC<{ sounds: SoundCue[]; listener: (frame: number) => V3; startFrame?: number; frameCount?: number; tailFade?: boolean }> = ({
  sounds,
  listener,
  startFrame: baseFrame = 0,
  frameCount: frameCount,
  tailFade = false,
}) => {
  const { fps, durationInFrames } = useVideoConfig();
  const segFrames = frameCount ?? durationInFrames;
  const logSfx = useSfxLog();
  const firstVisible = useFirstVisibleFrame();
  // 同一个文件、同一帧起的几声（一次捡起几样东西、几个卫兵同一刻落水），第二声起给 src 加标记，不然母版里只剩一声，见 同源区分.ts。
  // 不比长短：Sequence 的长度会被段尾截齐（remotion Sequence.js 的 actualDurationInFrames），本来不一样长的到段尾也一样长
  const sameSrcCount = new Map<string, number>();
  return (
    <>
      {sounds.map((sound, i) => {
        const resolved = resolveSound(sound);
        const localStart = playStartFrame(sound, fps) - baseFrame; // 段内帧，带小数
        const cutAt = Math.min(sound.止帧 === undefined ? Infinity : sound.止帧 - baseFrame, tailFade ? segFrames : Infinity); // 段内帧：到这儿淡完
        const localEnd = Math.min(localStart + resolved.durationSec * fps, cutAt);
        if (localEnd <= 0 || localStart >= segFrames) return null;
        // Sequence 只能从整数帧开始：`起播帧` 已经是整帧的这里不跳；接着放的余音（起点 > 0）带小数，往后取整、晚开始的那一点从文件里跳过去；开头在露出来的第一帧之前的，从那一帧起放、前面那截跳过去
        const from = Math.max(firstVisible, Math.ceil(localStart - 1e-6));
        const skipSec = ((from - localStart) / fps) * resolved.pitch;
        const remainingFrames = Math.ceil(localEnd - from);
        if (remainingFrames <= 0) return null;
        const volumeAt = (f: number) =>
          cueGain(sound, resolved, listener(baseFrame + from + f)) *
          Math.min(1, Math.max(0, (cutAt - from - f) / cutFadeFrames)) *
          (sound.stopSec === undefined ? 1 : Math.min(1, Math.max(0, (sound.stopSec - ((sound.起点 ?? 0) + skipSec + (f / fps) * resolved.pitch)) / stopFadeSec)));
        logSfx({ 名: sound.名 ?? sound.事件, 档: tierLabel(cueTier(sound)), 文件: `音效/${resolved.file.文件}`, from, 帧数: remainingFrames, 入点秒: (sound.起点 ?? 0) + skipSec, 速率: resolved.pitch, 循环: false, gainAt: volumeAt });
        const url = oggUrls[resolved.file.文件];
        const sameKey = `${url}|${from}`;
        const nth = sameSrcCount.get(sameKey) ?? 0;
        sameSrcCount.set(sameKey, nth + 1);
        return (
          <Sequence key={i} from={from} durationInFrames={remainingFrames} layout="none" name={sound.名 ?? sound.事件}>
            <Audio src={nth === 0 ? url : tagSrc(url, nth)} playbackRate={resolved.pitch} trimBefore={((sound.起点 ?? 0) + skipSec) * fps} volume={volumeAt} />
          </Sequence>
        );
      })}
    </>
  );
};

// 循环的声音（游戏里是 `TickableSoundInstance`，一直放到停）：机械动力的鼓风机嗡鸣（运动方块的 KINETIC 声景 = 原版 entity.minecart.inside，实例音量 0.25，
// 音高 = clamp(转速 / 256 + 0.45, 0.85, 1)，`KineticBlockEntity.tickAudio`；声景音量再乘 2(1 − 距离/16) 和 clamp(同组方块数/150, 0.025, 0.1)，一台风扇近处约 0.0125，镜头里给 `音量` 时自己乘上）、
// 被鼓风机的风推着飞（`AirCurrent.tickClientPlayerSounds` = 原版 item.elytra.flying，音高 = clamp(速度 × 0.5, 0.5, 2)，音量每刻淡入 0.05）。
// 起、止、音量(帧)、听者(帧) 的帧都是音轨的帧（同 `游戏声音轨`）。音高按 Remotion 的规矩一个 Sequence 里只能是常数。
// 给了 `位置` 就按游戏的线性衰减跟着镜头（听者）走（范围 = max(音量, 1) × attenuation_distance）；不给就是跟着玩家走的声音，不衰减。
// 给了 `档` / `响度` 就按 混音.ts 分档：不用 音量，`包络`(帧)（0～1）管淡入淡出，远近只按 distanceFeel
export const LoopSound: React.FC<{
  event: SoundEventName;
  beginFrame: number;
  endFrame: number;
  volume?: (frame: number) => number;
  tier?: 音效档;
  loudness?: number;
  envelope?: (frame: number) => number;
  pitch?: number;
  pick?: number;
  name?: string;
  startFrame?: number;
  position?: V3;
  listener?: (frame: number) => V3;
}> = ({ event: event, beginFrame: beginFrame, endFrame: endFrame, volume: volumeAt = () => 1, tier, loudness, envelope = () => 1, pitch: pitch = 1, pick: pickRand = 0, name: label, startFrame: baseFrame = 0, position: position, listener }) => {
  const { durationInFrames, fps } = useVideoConfig();
  const logSfx = useSfxLog();
  const firstVisible = useFirstVisibleFrame();
  const file = pickFile(event, pickRand);
  const pitchRate = Math.min(2, Math.max(0.5, pitch * file.pitch));
  const from = Math.max(firstVisible, Math.round(beginFrame - baseFrame));
  const to = Math.min(durationInFrames, Math.round(endFrame - baseFrame));
  if (to - from <= 0) return null;
  const target = cueTarget({ 档: tier, 响度: loudness });
  const gainAt = (trackFrame: number) => {
    if (target !== undefined) return envelope(trackFrame) * tierGain(target, file.文件, position && listener ? dist3(listener(trackFrame), position) : 0)!;
    const volume = volumeAt(trackFrame) * file.volume;
    const distGain = position && listener ? distanceGain(listener(trackFrame), position, Math.max(volume, 1) * file.attenuation_distance) : 1;
    return sfxVolume * Math.min(1, Math.max(0, volume)) * distGain;
  };
  // 循环的相位按音轨的帧算：上一段就开始响的（起 < 起帧），这一段第 0 帧从文件里响到的地方接着放，几段硬切接起来是同一条循环，接缝处相位不跳（会有咔声）。先放完这一圈剩下的，再从文件开头循环
  const loopFrames = (file.时长 / pitchRate) * fps; // 画面帧
  const phaseFrames = ((baseFrame + from - beginFrame) % loopFrames + loopFrames) % loopFrames;
  const restFrames = Math.min(to - from, Math.ceil(loopFrames - phaseFrames));
  const loopFrom = from + (phaseFrames > 0.5 ? restFrames : 0);
  const name = label ?? event;
  const tierName = tierLabel({ 档: tier, 响度: loudness });
  if (phaseFrames > 0.5) logSfx({ 名: `${name}（接着放）`, 档: tierName, 文件: `音效/${file.文件}`, from, 帧数: restFrames, 入点秒: (phaseFrames * pitchRate) / fps, 速率: pitchRate, 循环: false, gainAt: (x) => gainAt(baseFrame + from + x) });
  if (to - loopFrom > 0) logSfx({ 名: name, 档: tierName, 文件: `音效/${file.文件}`, from: loopFrom, 帧数: to - loopFrom, 入点秒: 0, 速率: pitchRate, 循环: true, gainAt: (x) => gainAt(baseFrame + loopFrom + x) });
  return (
    <>
      {phaseFrames > 0.5 && (
        <Sequence from={from} durationInFrames={restFrames} layout="none" name={`${label ?? event}（接着放）`}>
          <Audio src={oggUrls[file.文件]} playbackRate={pitchRate} trimBefore={phaseFrames * pitchRate} volume={(x) => gainAt(baseFrame + from + x)} />
        </Sequence>
      )}
      {to - from - (phaseFrames > 0.5 ? restFrames : 0) > 0 && (
        <Sequence from={from + (phaseFrames > 0.5 ? restFrames : 0)} durationInFrames={to - from - (phaseFrames > 0.5 ? restFrames : 0)} layout="none" name={label ?? event}>
          <Audio
            src={oggUrls[file.文件]}
            loop
            loopVolumeCurveBehavior="extend"
            playbackRate={pitchRate}
            volume={(x) => gainAt(baseFrame + from + (phaseFrames > 0.5 ? restFrames : 0) + x)}
          />
        </Sequence>
      )}
    </>
  );
};
