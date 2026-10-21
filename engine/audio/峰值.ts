// 音效文件的峰值包络（工具/游戏取材/音效峰值.py 从 ogg 量出来的：每 10 毫秒一格的采样峰值，按 dB 往上取整到 0.5 dB，所以只会估高）。
// 给要预估「最坏情况下混音会冲到多高」的地方用：一镜到底/声音.tsx 的撞墙限幅按它把整条混音（配乐 + 全部音效）的峰值压在 −1 dBFS 以下。
import peakJson from 'asset:数据/音效/音效峰值';

const peakTable = peakJson as { 格秒: number; dB每级: number; dB起: number; 峰: Record<string, string> };
const envelopeCache = new Map<string, Uint8Array>();
const envelopeOf = (file: string) => {
  let envelope = envelopeCache.get(file);
  if (!envelope) {
    const b64 = peakTable.峰[file];
    if (!b64) throw new Error(`音效峰值.json 里没有 ${file}：导出音效以后在 参考模型库/ 下重跑 工具/游戏取材/音效峰值.py`);
    const bin = atob(b64);
    envelope = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) envelope[i] = bin.charCodeAt(i);
    envelopeCache.set(file, envelope);
  }
  return envelope;
};

// 文件里第 a～b 秒（文件自己的时间）的采样峰值上限（线性振幅，1 = 0 dBFS）；文件外面是 0
export const filePeak = (file: string, fromSec: number, toSec: number): number => {
  const envelope = envelopeOf(file);
  const i0 = Math.max(0, Math.floor(fromSec / peakTable.格秒));
  const i1 = Math.min(envelope.length - 1, Math.floor(toSec / peakTable.格秒));
  let maxStep = 0;
  for (let i = i0; i <= i1; i++) maxStep = Math.max(maxStep, envelope[i]);
  return maxStep === 0 ? 0 : 10 ** ((peakTable.dB起 + maxStep * peakTable.dB每级) / 20);
};
