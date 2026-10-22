// 撞墙声的并声和限幅（压到不爆音），以及它和 OnerSound 共用的听者（镜头机位）、鼓风机虚影的起止和音量。
import { type V3 } from '@engine/model/parts.tsx';
import { cueGain, isTiered, playStartFrame, pickFile, resolveSound, type SoundCue } from '@engine/audio/游戏音效.tsx';
import { musicVolume, sfxVolume } from '@engine/audio/混音.ts';
import { filePeak } from '@engine/audio/峰值.ts';
import * as lichChoreo from '../../6-1-5/编排.ts';
import { cameraAt } from '../镜头.ts';
import * as route from '../路线.ts';

// 同一帧起音、挑到同一个文件、同一音高的几声并成一声放（游戏音效.tsx 的 `叠加`）：游戏里方块按刻（50 毫秒）碎，同一刻碎的几格同时起音、波形一样，直接相加；这里按画面帧（42 毫秒）对齐，算同时。
// 并成一声的几声要同一帧起音、同一文件、同音量音高、从文件同一处放起；叠加 = 几声，位置取它们的中心（几格挨在一起，离镜头远近差不了多少）。
// 分了档的（混音.ts）一组只按一声的档位响度放（叠加 1）：档定的是这一下撞墙多响，不随格数涨
export const mergeSounds = (sounds: SoundCue[]): SoundCue[] => {
  const groups = new Map<string, SoundCue[]>();
  for (const sound of sounds) {
    const frame = Math.round(sound.帧);
    const startOffset = Math.round((sound.起点 ?? 0) * route.FPS) / route.FPS;
    const k = [sound.事件, pickFile(sound.事件, sound.选).文件, sound.音量, sound.音高.toFixed(4), String(sound.major), frame, startOffset].join('|');
    groups.set(k, [...(groups.get(k) ?? []), { ...sound, 帧: frame, 起点: startOffset || undefined }]);
  }
  return [...groups.values()].map((group) => {
    const center = [0, 1, 2].map((j) => group.reduce((t, s) => t + s.位置[j], 0) / group.length) as V3;
    return group.length === 1 ? group[0] : { ...group[0], 名: `${group[0].名} 等 ${group.length} 声`, 位置: center, stackCount: isTiered(group[0]) ? 1 : group.length };
  });
};

// 听者：镜头机位（逐帧算一次存起来，每个声音每帧都要问）
const listenerCache = new Map<number, V3>();
export const listener = (frame: number): V3 => {
  const k = Math.min(Math.max(Math.round(frame), 0), route.总帧数 - 1);
  let pos = listenerCache.get(k);
  if (!pos) {
    pos = cameraAt(k).pos as V3;
    listenerCache.set(k, pos);
  }
  return pos;
};

const lichT = route.贯穿时刻.巫妖;
export const fanStart = route.帧(lichT + lichChoreo.T_THROW - 0.004);
export const fanEnd = route.帧(lichT + lichChoreo.T_SHIELDS[5] + 0.006);
export const fanEvent = 'entity.minecart.inside';
export const fanVolume = (g: number) => (0.25 * lichChoreo.fan(route.物理时间(g) - lichT).opacity) / 0.55;

// 撞墙声的限幅：一堆方块同一刻碎、离镜头又近，并声叠起来会爆音（巫妖副楼出口三十来格同一帧碎在镜头两三米外，比一格贴着耳朵碎还响 20 多 dB）。
// 游戏里 OpenAL Soft 的输出限幅器压着不让它破；这里照这个意思压一道，依据是整条混音会冲到多高：
// - 每一声在每一格（一帧分 4 格，约 10 毫秒）最多冲到多高 = 那一帧的增益（游戏音效.tsx 的 `cueGain`，含 `叠加`）× 文件在那一格里的采样峰值（src/音效/峰值.ts，按音高换算放到文件的哪一段）。
// - 几声叠起来多高：直接相加是最坏情况（波峰全撞在一起），只会估高；不相干的声音按能量相加（平方和开方），实测实际峰值最多比平方和开方高 7 dB，
//   所以取「直接相加」和「平方和开方 × 叠峰系数（+7 dB）」里小的那个。配乐按它最响的时候算（文件峰值 0 dBFS，配乐总线 −12 dB），直接加在上面。
// - 别的音效（穿刺、boss 死亡、护盾、宝箱……）、鼓风机虚影的嗡鸣都不动，先算进去；撞墙声按起音的先后一帧一帧排进去：
//   这一帧起音的几声按同一个比例压（乘在 `叠加` 上），压到每一格的估计峰值都不超过 `天花板`（−1 dBFS），压到 0 的不放。撞墙声只在起音那一刻定音量，响着的时候不再变。整片合成再统一拉响度、过限幅器（工具/合成第六章.py）。
// - 不按增益压：雪、树叶的破坏声文件本身就比石头小 6～10 dB，一视同仁会让雪地吃亏；现在每处都放到不爆音的最大，主要动作该有多响是 混音.ts 的事，这里不另设上限。
// - 一声的余音小于它自己最响那一格的 1/10（−20 dB）以后不参与定比例：余音电平改变不了会不会爆音，但正好叠在别的声音已顶满的地方会把整声压没。
const cellsPerFrame = 4;
const ceiling = 10 ** (-1 / 20);
const stackPeakFactor = 10 ** (7 / 20);
type PeakTrace = { g0: number; peaks: Float64Array }; // 从全局帧 g0 起，每帧 格数 格，每格最多冲到多高（线性振幅）
const frameGain = (s: SoundCue, r: ReturnType<typeof resolveSound>, g: number) => cueGain(s, r, listener(g));
const peakTraceOf = (sound: SoundCue): PeakTrace => {
  const parsed = resolveSound(sound);
  // 同 游戏声音轨：起点 = 起播帧（从文件开头放的落在最近的整帧上、不跳文件头；接着放的余音往后取整帧、跳过晚的那一点）
  const playFrame = playStartFrame(sound, route.FPS);
  const g0 = Math.max(0, Math.ceil(playFrame - 1e-6));
  const startSec = (sound.起点 ?? 0) + ((g0 - playFrame) / route.FPS) * parsed.pitch;
  const frameCount = Math.max(0, Math.min(route.总帧数 - g0, Math.ceil(playFrame + parsed.durationSec * route.FPS - g0)));
  const peaks = new Float64Array(frameCount * cellsPerFrame);
  const secPerCell = parsed.pitch / route.FPS / cellsPerFrame; // 一格画面时间放掉多少秒文件
  for (let k = 0; k < frameCount; k++) {
    const gain = frameGain(sound, parsed, g0 + k);
    if (gain > 0) for (let j = 0; j < cellsPerFrame; j++) {
      const fileSec = startSec + (k * cellsPerFrame + j) * secPerCell;
      peaks[k * cellsPerFrame + j] = gain * filePeak(parsed.file.文件, fileSec, fileSec + secPerCell);
    }
  }
  return { g0, peaks: peaks };
};
// 每一格记两样：峰值直接相加（和）、峰值平方相加（方）
type Ledger = { sum: Float64Array; squares: Float64Array };
const addToLedger = (ledger: Ledger, i: number, peak: number) => {
  ledger.sum[i] += peak;
  ledger.squares[i] += peak * peak;
};
export const limitWallSounds = (others: SoundCue[], wallHits: SoundCue[]): SoundCue[] => {
  const headroom = ceiling - musicVolume;
  const ledger: Ledger = { sum: new Float64Array(route.总帧数 * cellsPerFrame), squares: new Float64Array(route.总帧数 * cellsPerFrame) };
  for (const sound of others) {
    const t = peakTraceOf(sound);
    t.peaks.forEach((p, i) => addToLedger(ledger, t.g0 * cellsPerFrame + i, p));
  }
  const fan = pickFile(fanEvent, 0);
  const fanPeak = filePeak(fan.文件, 0, fan.时长); // 循环着放，按整个文件最响的地方算；距离衰减按不衰减算
  for (let frame = Math.max(0, Math.floor(fanStart)); frame <= Math.min(route.总帧数 - 1, Math.ceil(fanEnd)); frame++)
    for (let j = 0; j < cellsPerFrame; j++) addToLedger(ledger, frame * cellsPerFrame + j, sfxVolume * Math.min(1, fanVolume(frame) * fan.volume) * fanPeak);
  const byFrame = new Map<number, SoundCue[]>();
  for (const sound of wallHits) byFrame.set(sound.帧, [...(byFrame.get(sound.帧) ?? []), sound]);
  const out: SoundCue[] = [];
  for (const frame of [...byFrame.keys()].sort((x, y) => x - y)) {
    const thisFrame = byFrame.get(frame)!;
    const traces = thisFrame.map(peakTraceOf);
    const g0 = traces[0].g0; // 并声以后起音都在整帧上，同一帧起音的几声 g0 一样
    const cellCount = Math.max(...traces.map((t) => t.peaks.length));
    const added: Ledger = { sum: new Float64Array(cellCount), squares: new Float64Array(cellCount) };
    for (const t of traces) t.peaks.forEach((p, i) => addToLedger(added, i, p));
    const maxSum = Math.max(...added.sum);
    // 每一格：压到比例 k 以后，直接相加（和 + k·新和）或者 叠峰系数 × √(方 + k²·新方) 有一个不超过余量就行，取两个解里大的
    let k = 1;
    for (let i = 0; i < cellCount; i++) {
      if (added.sum[i] < maxSum / 10) continue;
      const prevSum = ledger.sum[g0 * cellsPerFrame + i], prevSq = ledger.squares[g0 * cellsPerFrame + i];
      const scaleBySum = (headroom - prevSum) / added.sum[i];
      const sqRoom = (headroom / stackPeakFactor) ** 2 - prevSq;
      const scaleBySq = sqRoom > 0 ? Math.sqrt(sqRoom / added.squares[i]) : -1;
      k = Math.min(k, Math.max(0, scaleBySum, scaleBySq));
    }
    if (k <= 0) continue;
    for (const t of traces) t.peaks.forEach((p, i) => addToLedger(ledger, g0 * cellsPerFrame + i, k * p));
    for (const sound of thisFrame) out.push(k < 1 ? { ...sound, stackCount: (sound.stackCount ?? 1) * k } : sound);
  }
  return out;
};
