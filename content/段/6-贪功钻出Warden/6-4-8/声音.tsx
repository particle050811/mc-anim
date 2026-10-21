// 6-4-8 钻出的声音表（段内帧，放在 ../6-4-7至9/声音.tsx）：只有原版音效（src/音效/），时刻全从 编排.ts 的时间轴推，原速，没有慢放。照 1.20.1：
// - 尖啸（接 6-4-7 的第四次）：本段开头前 1 秒（编排.ts 的 `shriekSec`）响一声 block.sculk_shrieker.shriek（volume 2.0、pitch 0.6 + r × 0.4），
//   本段第 0 帧前 1 秒响起（就是 6-4-7 末尾那一声，合成段里用 6-4-7 那份接着响，这份只留着记音高、文件，也让后面的随机数不变）；6-4-9 起不放（听不见）。
// - 钻出：`Emerging.start` 在 setPose(EMERGING) 同一刻 playSound(entity.warden.emerge, 5.0, 1.0)。emerge.ogg 8.53 秒，比游戏钻出动画（6.7 秒）长。
//   钻出快放到 1.75 秒（编排.ts 文件头，用户 10-12），声音不变速（变调会成尖叫）也不伸缩，而是从原文件剪两截按画面时刻排：
//   emerge.ogg 里是两阵轰响——0.85～2.4 秒（手、头、肩破土）和 3.05～5.1 秒（爬出站起）。第一截放文件 0.82～1.6 秒，
//   起音（0.88 秒）落在手撑出地面那刻（钻出后 0.14 秒）；第二截从文件 3.02 秒放到完，起音（3.08 秒）落在头全出的那刻（钻出后 0.84 秒），
//   尾音接进 6-4-9，在推近手臂那一镜末尾淡完（../6-4-7至9/声音.tsx）。
// - 心跳：`Warden.tick`（客户端）每 `getHeartBeatDelay` 刻（不生气 40 刻 = 2 秒）一次，playLocalSound(entity.warden.heartbeat, 5.0, getVoicePitch())，
//   时刻跟 编排.ts 给 监守者.tsx 的游戏时间 `秒` 走（整 2 秒跳，和心脏发光同一刻），钻出以前不跳。
// - 二人急退落地、刘心忠右脚那一踏：落地方块的 step 声（同 6-4-6 追兵声.ts 的规矩，音量 0.15；刘心忠落在深板岩上，黄叛落在幽匿块上），归「脚步」档。
// - 触角：站直后收到刘心忠那一踏的振动（编排.ts 触角在 钻出用时 + 0.1 秒亮起）：`Warden$VibrationUser.onReceiveVibration` 在 broadcastEntityEvent(61) 同一刻
//   playSound(entity.warden.tendril_clicks, 5.0, getVoicePitch())（和感测体 sculk_clicking1～6 同一批文件，sounds.json 没写 volume，按 1）。
// - 不放：站直后的 ambient（随机、本段只剩 0.75 秒）；钻出时的方块碎屑游戏里没有声音。
// 远近：听者是镜头机位（src/音效/游戏音效.tsx），离钻出点约 11 米、离尖啸体约 15 米：钻出、心跳、触角增益约 0.87；尖啸约 0.45，压在钻出声底下。
// 和游戏不同（编排定的）：游戏里第四次尖啸后 4.5 秒才召唤监守者，这里是 1.5 秒。
import { rng, type V3 } from '../../../../engine/model/parts.tsx';
import { WARDEN } from '../../../../world/生物/监守者.tsx';
import { randomPitch, type SoundCue } from '../../../../engine/audio/游戏音效.tsx';
import * as choreo from '../../../../world/地点/古城4x/6-4-8/编排.ts';

const FPS = choreo.FPS;
const heartbeatIntervalSec = WARDEN.heartbeatTicks.calm / 20;

export const sounds: SoundCue[] = (() => {
  const rand = rng(6408);
  const wardenPos: V3 = choreo.WARDEN_AT;
  const out: SoundCue[] = [];
  // 尖啸：`shriekSec(frame)` = 尖啸以后过了几秒
  out.push({ 名: '第四次尖啸', 事件: 'block.sculk_shrieker.shriek', 帧: -choreo.shriekSec(0) * FPS, 位置: [choreo.SHRIEKER[0], choreo.SHRIEKER[1], choreo.SHRIEKER[2] + 0.5], 音量: 2, 音高: randomPitch.尖啸(rand()), 选: rand() });
  // 钻出：`emergeSec(frame)` = 0 那一帧；两截（见文件头），文件的第 `起点` 秒落在钻出后 `atSec` 那一刻
  const emergeFrame = -choreo.emergeSec(0) * FPS;
  const pick = rand();
  // 监守者登场是这一场的重头，归「重」（按事件名是「中」，会被同时响的第四次尖啸盖住；用户 10-18 分档）
  for (const [label, startSec, atSec, stopSec] of [
    ['钻出（破土）', 0.82, 0.08, 1.6],
    ['钻出（爬出）', 3.02, 0.78, undefined],
  ] as const)
    out.push({ 名: label, 事件: 'entity.warden.emerge', 档: '重', 帧: emergeFrame + atSec * FPS, 位置: wardenPos, 音量: 5, 音高: 1, 选: pick, 起点: startSec, stopSec });
  // 心跳：游戏时间 `秒` = `gameSec0` + `frame` / `FPS`，整 2 秒那一刻跳；钻出以前不跳
  const gameSec0 = choreo.warden(0).秒;
  for (let k = Math.ceil(gameSec0 / heartbeatIntervalSec); (k * heartbeatIntervalSec - gameSec0) * FPS < choreo.END; k++) {
    if ((k * heartbeatIntervalSec - gameSec0) * FPS < emergeFrame) continue;
    out.push({ 名: `心跳${k}`, 事件: 'entity.warden.heartbeat', 帧: (k * heartbeatIntervalSec - gameSec0) * FPS, 位置: wardenPos, 音量: 5, 音高: randomPitch.voice(rand(), rand()), 选: rand() });
  }
  // 急退落地、刘心忠那一踏
  out.push({ 名: '黄叛急退落地', 事件: 'block.sculk.step', 帧: choreo.hops.黄.f1, 位置: choreo.hops.黄.p1, 音量: 0.15, 音高: 1, 选: rand() });
  out.push({ 名: '刘心忠急退落地', 事件: 'block.deepslate.step', 帧: choreo.hops.刘.f1, 位置: choreo.hops.刘.p1, 音量: 0.15, 音高: 1, 选: rand() });
  out.push({ 名: '刘心忠一踏', 事件: 'block.deepslate.step', 帧: choreo.liuPlantSec * FPS, 位置: choreo.hops.刘.p1, 音量: 0.15, 音高: 1, 选: rand() });
  // 触角：编排.ts 里触角从 0 跳到 1 的那一帧
  let frame = 0;
  while (frame < choreo.END && !(choreo.warden(frame).触角 > 0)) frame++;
  if (frame < choreo.END) {
    out.push({ 名: '触角', 事件: 'entity.warden.tendril_clicks', 帧: emergeFrame + (choreo.emergeDurationSec + 0.1) * FPS, 位置: wardenPos, 音量: 5, 音高: randomPitch.voice(rand(), rand()), 选: rand() });
  }
  return out;
})();
