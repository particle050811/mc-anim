// anim voice 的核心：一句台词从 台词.toml 的一行，经 配音成品（资产锁）、测量、字的起止、嘴，到句模块。命令行在 命令.ts，这里的函数不碰命令行参数。
import fs from 'node:fs';
import path from 'node:path';
import type { LineSentence } from '../../engine/audio/台词句.ts';
import { bytesPath, type AssetLock } from '../资产/资产锁.ts';
import { spokenTextOf, voiceTextHash, type WorkLines, type VoiceLineRow } from './台词表.ts';

export type Measure = { mouthOpen: number; 有声长: number; duration: number };
export type CharTimings = [string, number, number][];

/** wav 头里的秒数（帧数 ÷ 采样率，3 位），同 Python wave 的 getnframes() / getframerate() */
export const wavSeconds = (buf: Buffer): number => {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('不是 wav');
  let sampleRate = 0;
  let blockAlign = 0;
  for (let p = 12; p + 8 <= buf.length; ) {
    const chunkId = buf.toString('ascii', p, p + 4);
    const chunkByteLength = buf.readUInt32LE(p + 4);
    if (chunkId === 'fmt ') {
      sampleRate = buf.readUInt32LE(p + 12);
      blockAlign = buf.readUInt16LE(p + 20);
    } else if (chunkId === 'data') {
      if (!sampleRate) throw new Error('wav 的 data 在 fmt 前面');
      const dataLength = Math.min(chunkByteLength, buf.length - p - 8);
      return Math.round((Math.floor(dataLength / blockAlign) / sampleRate) * 1000) / 1000;
    }
    p += 8 + chunkByteLength + (chunkByteLength % 2);
  }
  throw new Error('wav 里没有 data 块');
};

/** 成品sha：资产锁里 配音 那一项的 sha 前 12 位 */
export const finishedSha = (line: VoiceLineRow, assetLock: AssetLock) => (line.voice ? assetLock[line.voice]?.sha256.slice(0, 12) : undefined);

/** 手修能不能用：写了 字、绑的成品就是现在这版 */
export const manualFixUsable = (line: VoiceLineRow, existingFinished: string | undefined) => {
  const h = line.lipManual;
  if (!h?.char?.length) return false;
  return Boolean(existingFinished && h.finishedSha && existingFinished.startsWith(h.finishedSha.slice(0, 12)));
};

/** 一句的问题（空 = 配音、句模块都跟得上 台词.toml 和资产锁）；只看数据，不跑 Python。anim voice list 用；anim check 的台词规则自己查表的那几项，只借 句模块问题 */
export const sentenceIssues = (line: VoiceLineRow, assetLock: AssetLock, sentence: LineSentence | null): string[] => {
  if (!line.voice) return sentence ? ['没写 配音，却有句模块（删掉 台词/<id>.ts，或先 anim voice use）'] : [];
  const sha = finishedSha(line, assetLock);
  if (!sha) return [`配音「${line.voice}」不在资产锁里`];
  const issues: string[] = [];
  if (line.textHash !== voiceTextHash(line)) issues.push('念的字改过、配音没重出（anim voice gen 再 use；只改字幕不改念法的，写 念 = 原来的字）');
  if (!line.finishedSha || !sha.startsWith(line.finishedSha)) issues.push(`台词.toml 的 成品sha ${line.finishedSha ?? '（没写）'} 和资产锁 ${sha} 对不上`);
  if (line.lipManual?.char && !manualFixUsable(line, sha)) issues.push(`口型手修 是对着成品 ${line.lipManual.finishedSha ?? '（没写）'} 标的，现在是 ${sha}：重标或删掉`);
  return [...issues, ...sentenceModuleIssues(line, sha, sentence)];
};

/** 句模块跟不跟得上 台词.toml 这一句和现在的成品（sha = 资产锁里成品的 sha 前 12 位） */
export const sentenceModuleIssues = (line: VoiceLineRow, sha: string, sentence: LineSentence | null): string[] => {
  if (!sentence) return ['没有句模块（anim voice lip）'];
  const issues: string[] = [];
  if (sentence.id !== line.id) issues.push(`句模块里的 id 是 ${sentence.id}`);
  if (sentence.finishedSha !== sha) issues.push(`句模块是对着成品 ${sentence.finishedSha} 做的，现在是 ${sha}（anim voice lip）`);
  if (sentence.voice !== line.voice) issues.push(`句模块的 配音 ${sentence.voice} 和 台词.toml 的 ${line.voice} 不同`);
  if (sentence.character !== line.character) issues.push(`句模块的 角色 ${sentence.character} 和 台词.toml 的 ${line.character} 不同`);
  if (sentence.spoken !== spokenTextOf(line)) issues.push('念的字改了，句模块没跟上（anim voice lip）');
  if (sentence.mouthOpen !== line.mouthOpen) issues.push(`句模块的 开口 ${sentence.mouthOpen} 和 台词.toml 的 ${line.mouthOpen} 不同`);
  if (Boolean(sentence.手修) !== manualFixUsable(line, sha)) issues.push(sentence.手修 ? '句模块用的手修已经不能用了（anim voice lip）' : '有可用的 口型手修，句模块没用它（anim voice lip）');
  const lipSha = line.lip?.finishedSha;
  if (!lipSha || !sha.startsWith(lipSha)) issues.push(`台词.toml 的 口型 成品sha ${lipSha ?? '（没写）'} 不是 ${sha}（anim voice lip 会写）`);
  return issues;
};

export const assembleSentence = (line: VoiceLineRow, o: { finishedSha: string; measure: Measure; fileDurationSec: number; char: CharTimings; manualFix: boolean; mouthKeys: [number, string][] }): LineSentence => ({
  id: line.id,
  character: line.character,
  spoken: spokenTextOf(line),
  voice: line.voice!,
  finishedSha: o.finishedSha,
  mouthOpen: o.measure.mouthOpen,
  有声长: o.measure.有声长,
  duration: o.measure.duration,
  文件秒数: o.fileDurationSec,
  ...(o.manualFix ? { 手修: true as const } : {}),
  char: o.char,
  嘴: o.mouthKeys,
});

/** 候选和中间稿：<数据根>/run/草稿/配音/<作品>/<台词 id>/（Agent、人试听用，不进 Git、不进预览/） */
export const candidateDir = (dataRoot: string, work: string, id: string) => path.join(dataRoot, 'run', '草稿', '配音', work, id);

/** 候选旁边的说明（gen 写、use 读）：后端、种子、参考，用来写资产表的 来源 */
export type CandidateNote = { backend: string; seed: number; reference: string; params: Record<string, unknown>; spoken: string; time: string };
export const readCandidateNote = (wav: string): CandidateNote | null => {
  const f = wav.replace(/\.wav$/i, '.json');
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as CandidateNote) : null;
};

/** 一句的克隆参考：这句的 合成.参考/逐字稿 > [音色.<角色>] */
export const timbreRef = (workLineTable: WorkLines, line: VoiceLineRow, assetLock: AssetLock, dataRoot: string) => {
  const timbre = workLineTable.timbre[line.character];
  const id = line.synth?.reference ?? timbre?.reference;
  const refTranscript = line.synth?.transcript ?? timbre?.transcript;
  if (!id || !refTranscript) throw new Error(`${line.id}：没有 ${line.character} 的音色参考（台词.toml 写 [音色."${line.character}"] 参考 = "<资产 id>"、逐字稿 = "…"，或这句的 合成.参考、合成.逐字稿）`);
  if (!assetLock[id]) throw new Error(`${line.id}：音色参考「${id}」不在资产锁里`);
  return { id, file: bytesPath(assetLock[id]!, dataRoot), transcript: refTranscript };
};

/** 命令行给的、盖过 台词.toml 的合成设置（语气参考 是 wav 的绝对路径） */
export type SynthOverride = { backend?: string; seed?: number[]; toneRef?: string; intensity?: number };
export type SynthBatch = { requests: Record<string, unknown>[]; notes: Map<string, Omit<CandidateNote, 'params'>> };

/** gen 的请求按后端分批（一批只起一次模型）：后端取 命令行 > 这句的 合成.后端 > [配音]；交给 TTS 的字取 合成.念 > 念 > 文本。请求的形状同 py/anim_py/配音/后端 的 合成请求 */
export const buildSynthBatches = (workLineTable: WorkLines, lines: readonly VoiceLineRow[], overrides: SynthOverride, assetLock: AssetLock, env: { dataRoot: string; work: string }): Map<string, SynthBatch> => {
  const batches = new Map<string, SynthBatch>();
  for (const line of lines) {
    const backendName = overrides.backend ?? line.synth?.backend ?? workLineTable.voice.backend;
    const batch: SynthBatch = batches.get(backendName) ?? { requests: [], notes: new Map() };
    batches.set(backendName, batch);
    const r = timbreRef(workLineTable, line, assetLock, env.dataRoot);
    const toneRefId = line.synth?.toneRef;
    if (!overrides.toneRef && toneRefId && !assetLock[toneRefId]) throw new Error(`${line.id}：语气参考「${toneRefId}」不在资产锁里`);
    const spokenText = line.synth?.spoken ?? spokenTextOf(line);
    for (const seed of overrides.seed ?? line.synth?.seed ?? workLineTable.voice.seed) {
      const outPath = path.join(candidateDir(env.dataRoot, env.work, line.id), `${backendName}-种子${seed}.wav`);
      batch.requests.push({
        id: line.id, character: line.character, spoken: spokenText, language: line.language ?? '中文', 参考音频: r.file, 参考逐字稿: r.transcript, seed: seed, output: outPath,
        tone: line.tone ?? '', toneRef: overrides.toneRef ?? (toneRefId ? bytesPath(assetLock[toneRefId]!, env.dataRoot) : ''),
        语气强度: overrides.intensity ?? line.synth?.intensity ?? null, params: line.synth?.params ?? {},
      });
      batch.notes.set(outPath, { backend: backendName, seed: seed, reference: r.id, spoken: spokenText, time: new Date().toISOString() });
    }
  }
  return batches;
};
