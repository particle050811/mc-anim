// 6-4-9 Warden 的声音表（段内帧，放在 ../6-4-7至9/声音.tsx）：只有原版音效（src/音效/），没有台词、没有配乐。时刻全从 编排.ts 推，和画面上心脏、触角发光、吼的动作同一刻。原速，没有慢放。
// 照 1.20.1（javap 核对，client-1.20.1-srg.jar）：
// - 心跳：Warden.tick 客户端 tickCount % getHeartBeatDelay == 0 那一刻 heartAnimation = 10，同一刻 playLocalSound(entity.warden.heartbeat, volume 5.0, getVoicePitch())。
//   游戏时间接着 6-4-8 走（编排.ts 的 `gameSecAt`，切全景那下往回跳），帧见 `heartbeatFrames`。
// - 触角：Warden$VibrationUser.onReceiveVibration 里 broadcastEntityEvent(61)（触角抖、发亮）同一刻 playSound(entity.warden.tendril_clicks, 5.0, getVoicePitch())，
//   每听到一下振动（编排.ts 的 `tendrilFrames`）一声；画外那下（二人那一镜里）也放，是「它听见了」。开关 `tendrilClickOn`。
//   游戏里振动来自活物时还会 playListeningSound（entity.warden.listening）并让心跳变快；这里同 6-4-8 不放、心跳不变快。
// - 吼：吼叫姿势第 25 刻 playSound(entity.warden.roar, 3.0, getVoicePitch())（同 7-3），正好在切全景那一帧；归「重」（按事件名）。本段末帧还在吼，7-1/声音.tsx 拿 `roarCue` 接着放。
// - 二人横挪的脚步：每一步落地 block.sculk.step（落点全是幽匿块，工具/古城4x布局/方块.py 查过），音量 0.15，归「脚步」档（同 6-4-8）；吼声里压低退的那一步是潜行，不放。
// 远近：听者是镜头机位（src/音效/游戏音效.tsx）。
import { rng } from '../../../../engine/model/parts.tsx';
import { randomPitch, type SoundCue } from '../../../../engine/audio/游戏音效.tsx';
import * as choreo from './编排.ts';

// 触角那一下要不要咔嗒声（默认要，照游戏；关掉就只剩心跳，画面上触角照样抖）
export const tendrilClickOn = true;

// 心跳、触角归「中」：这一段特写里只有它们，画面就是对着心脏和触角拍的
export const sounds: SoundCue[] = (() => {
  const rand = rng(6409);
  const out: SoundCue[] = choreo.heartbeatFrames(choreo.END).map((frame, i) => ({
    名: `心跳${i + 1}`,
    事件: 'entity.warden.heartbeat',
    档: '中',
    帧: frame,
    位置: choreo.WARDEN_AT,
    音量: 5,
    音高: randomPitch.voice(rand(), rand()),
    选: rand(),
  }));
  if (tendrilClickOn)
    choreo.tendrilFrames
      .filter((f) => f >= 0)
      .forEach((f, i) => out.push({ 名: `触角${i + 1}`, 事件: 'entity.warden.tendril_clicks', 档: '中', 帧: f, 位置: choreo.WARDEN_AT, 音量: 5, 音高: randomPitch.voice(rand(), rand()), 选: rand() }));
  out.push({ 名: '吼', 事件: 'entity.warden.roar', 帧: choreo.roarSoundFrame, 位置: [choreo.WARDEN_AT[0], choreo.WARDEN_AT[1], choreo.WARDEN_AT[2] + 2.5], 音量: 3, 音高: randomPitch.voice(rand(), rand()), 选: rand() });
  for (const who of ['刘', '黄'] as const)
    choreo.audibleSteps[who].forEach((s, i) =>
      out.push({ 名: `${who === '刘' ? '刘心忠' : '黄叛'}第${i + 1}步`, 事件: 'block.sculk.step', 帧: s.b, 位置: s.to, 音量: 0.15, 音高: 1, 选: rand() }),
    );
  return out;
})();
// 吼声（7-1/声音.tsx 接着放剩下的，文件、音高同这一声）
export const roarCue = sounds.find((s) => s.名 === '吼')!;
