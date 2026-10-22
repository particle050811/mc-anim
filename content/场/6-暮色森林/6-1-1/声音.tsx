// 6-1-1 进入森林的声音：李樱一句台词（`lineCues`）和原版音效（src/音效/），音效落点挂在 编排.ts 的 `soundCues` 和各时间常量上。
// 帧号：编排帧 f = Remotion 帧 + 1，这里一律换成 Remotion 帧（段内帧）放。
// 声音来源（1.20.1 和暮色森林 4.3.2508，javap 核对过）：
// - 钻石落水：`Entity.doWaterSplashEffect`：volume = min(1, √(0.2·vx² + vy² + 0.2·vz²) × 0.2)（速度格/刻），< 0.25 放 `getSwimSplashSound`（物品是 entity.generic.splash），
//   pitch 1 + (r1 − r2) × 0.4。丢出去那一下原版没有声音（`Player.drop` 不放声音）。
// - 闪电（暮色传送门成形时 `TFPortalBlock.tryToCreatePortal` 生成，`LightningBolt.tick` 客户端第一刻）：
//   entity.lightning_bolt.thunder volume 10000、pitch 0.8 + r × 0.2（等于不衰减）；entity.lightning_bolt.impact volume 2、pitch 0.5 + r × 0.2。
// - 跳进传送门：暮色传送门方块的流体是水（`TFPortalBlock.getFluidState`），人掉进去就是落水：李樱是玩家 entity.player.splash，volume、pitch 同上（九胡那一声不放，见 `islandSounds`）。
// - 起跳、落地：原版跳跃没有声音，按脚踩地放脚步（`Entity.playStepSound`：volume = soundType.volume × 0.15，草方块 SoundType.GRASS 是 1、1）。
//   照游戏的音量整片里听不见，照游戏放（用户 10-11：脚步由 AI 生成，参考视频不再刻意让它听得见）。
// - 换维度：切到暮色森林那一刻（`choreo.CUT`）放原版 block.portal.travel，不跟位置、不衰减，文件 9.5 秒，一直响进 6-1-2、6-1-3（两段的 声音.tsx 接着放剩下的）。游戏里怎么放（jar 里查实）：
//   · `TFPortalBlock.entityInside` → `Entity.changeDimension`(…, new `TFTeleporter`)；`TFTeleporter` 没覆写 Forge `ITeleporter.playTeleportSound`，默认返回 true，
//     `ServerPlayer.changeDimension` 于是照原版发 levelEvent 1032（在换维度重生包之后，所以在新维度里响）。
//   · 客户端 `LevelRenderer.levelEvent` 的 1032：`SimpleSoundInstance.forLocalAmbience`(SoundEvents.PORTAL_TRAVEL, r × 0.4 + 0.8, 0.25)，参数顺序是（声音, 音高, 音量），
//     类别 AMBIENT、`Attenuation.NONE`、relative：**volume 0.25、pitch 0.8 + r × 0.4、不随距离衰减**。sounds.json 里 block.portal.travel 的 volume、pitch 都是 1（游戏音效.json）。
//   · 暮色自己没有传送的声音：只有 block.twilightforest.portal.whoosh（转到原版 block.portal.ambient 的嗡鸣，`TFPortalBlock.animateTick` 随机放），是站在门边的环境声，不加。
//     进门也没有声音：`entityInside` 不调 `Entity.handleInsidePortal`，不放 block.portal.trigger。
//   · 用户 10-11 定：照游戏放，但声音改小，所以音量在游戏的 0.25 上再乘 `portalSoundGain`（比游戏小，是用户要求的偏离）。
// - 海岛那一半的声音只在海岛那一半响（换维度时客户端换了 level，旧维度的声音都停了）。
// 听者 = 镜头机位（src/音效/游戏音效.tsx）。两半是两套本地坐标（海岛本地、庭院本地），各自一条音轨、只在自己那一半当听者。
import React from 'react';
import { rng, type V3 } from '../../../../engine/model/parts.tsx';
import { GameSoundTrack, type SoundCue } from '../../../../engine/audio/游戏音效.tsx';
import { LineTrack } from '../../../../world/配音/台词轨.tsx';
import { 声音Sequence } from '../../../../engine/audio/声音Sequence.tsx';
import * as choreo from './编排.ts';

const cues = choreo.soundCues;
const farAway: V3 = [1e9, 1e9, 1e9];
const segFrame = (f: number) => f - 1;
export const lastSegFrame = choreo.END - 2;

const perTick = (a: number[], b: number[]) => [0, 1, 2].map((i) => ((b[i] - a[i]) * 24) / 20);
const splashVolume = (v: number[]) => Math.min(1, Math.sqrt(0.2 * v[0] * v[0] + v[2] * v[2] + 0.2 * v[1] * v[1]) * 0.2);

const rand = rng(6111);
const splashPitch = () => 1 + (rand() - rand()) * 0.4;
const grassStep = (f: number, p: number[], name: string): SoundCue => ({ 名: name, 事件: 'block.grass.step', 帧: segFrame(f), 位置: [p[0], p[1], p[2]], 音量: 0.15, 音高: 1, 选: rand() });

// 李樱边引手边说「是时候出征暮色了！」（用户 10-17：进暮色前得说句话；10-20 定的字），雷声（STRIKE）前说完。段内帧
export const lineCues = [{ id: '6-1-1-李樱-出征暮色', 帧: 4 }];

// ---------- 海岛（海岛本地坐标） ----------
const diamondVel = perTick(choreo.diamond(cues.diamondSplash - 1)!.loc, choreo.diamond(cues.diamondSplash)!.loc);
const liyingSplashVel = perTick(choreo.liying(cues.liyingEnterPortal - 1).pose.loc, choreo.liying(cues.liyingEnterPortal).pose.loc);
export const islandSounds: SoundCue[] = [
  { 名: '钻石落水', 事件: 'entity.generic.splash', 帧: segFrame(cues.diamondSplash), 位置: cues.diamondDropPoint, 音量: splashVolume(diamondVel), 音高: splashPitch(), 选: rand() }, // 中档（混音.ts 默认）：照游戏只有 −39 dBFS，用户 10-15 要听得见
  { 名: '闪电雷声', 事件: 'entity.lightning_bolt.thunder', 帧: segFrame(choreo.STRIKE), 位置: choreo.BOLT_AT, 音量: 10000, 音高: 0.8 + rand() * 0.2, 选: rand() },
  { 名: '闪电劈中', 事件: 'entity.lightning_bolt.impact', 帧: segFrame(choreo.STRIKE), 位置: choreo.BOLT_AT, 音量: 2, 音高: 0.5 + rand() * 0.2, 选: rand() },
  grassStep(cues.liYingJump, cues.liyingJumpPoint, '李樱起跳'),
  grassStep(cues.jiuhuJump, cues.jiuhuJumpPoint, '九胡起跳'),
  { 名: '李樱落进传送门', 事件: splashVolume(liyingSplashVel) < 0.25 ? 'entity.player.splash' : 'entity.player.splash.high_speed', 帧: segFrame(cues.liyingEnterPortal), 位置: cues.liyingPortalPoint, 音量: splashVolume(liyingSplashVel), 音高: splashPitch(), 选: rand() },
];
// 九胡落进传送门不放（用户 10-18：只响 2 帧就切到暮色、听不见）。照样空取 3 个随机数（音高 2、选 1），后面换维度的音高不变
rand();
rand();
rand();

// ---------- 换维度（不跟位置，见文件头） ----------
// 用户 10-11：游戏是 volume 0.25（−12 dB，没有距离衰减），在它上面再小 9 dB。
// 依据：原来这一声从 5.5 秒响到 15.0 秒，落地、起跑那几秒别的声音都很轻，整段就是它，而那几秒没有配乐。
// 小 9 dB 后最响 −39 dBFS，比配乐前奏还小 5～6 dB，比台词小 34 dB。
export const portalSoundGain = 10 ** (-9 / 20);
export const portalSounds: SoundCue[] = [
  // 用户 10-18 改成按「中」档放，不再照上面的音量
  { 名: '换维度', 事件: 'block.portal.travel', 帧: segFrame(choreo.CUT), 位置: [0, 0, 0], 音量: 0.25 * portalSoundGain, 音高: 0.8 + rand() * 0.4, 选: rand() },
];

// ---------- 暮色森林（庭院本地坐标，同 6-1-2） ----------
// 弹出来落在门东边的空地上：李樱先落地，九胡落地那一帧就是本段末帧（= 6-1-2 第 0 帧），6-1-2 的 声音.tsx 接着放没放完的
export const twilightSounds: SoundCue[] = [
  grassStep(cues.liYingLanding, choreo.liying(cues.liYingLanding).pose.loc, '李樱落地'),
  grassStep(cues.jiuHuLand, choreo.jiuhu(cues.jiuHuLand).pose.loc, '九胡落地'),
];

const islandListener = (g: number): V3 => (choreo.world(g + 1) === 'island' ? (choreo.camera(g + 1).pos as V3) : farAway);
const twilightListener = (g: number): V3 => (choreo.world(g + 1) === 'tf' ? (choreo.camera(g + 1).pos as V3) : farAway);

// 海岛那一半的声音到切到暮色森林那一帧就断：整条海岛音轨装进只到这一帧的 `Sequence`。
// 光把听者挪到 `farAway` 断不干净：雷声吃 混音.ts 的 −12 dB 下限，听者再远也照响，尾巴会一直响到本段末帧、在 6-1-2 开头一刀切断
export const EnterForestSound: React.FC = () => (
  <>
    <声音Sequence durationInFrames={segFrame(choreo.CUT)} name="海岛（切到暮色森林就断）">
      <GameSoundTrack sounds={islandSounds} listener={islandListener} />
    </声音Sequence>
    <GameSoundTrack sounds={portalSounds} listener={() => [0, 0, 0]} />
    <GameSoundTrack sounds={twilightSounds} listener={twilightListener} />
    <LineTrack 句们={lineCues} />
  </>
);
