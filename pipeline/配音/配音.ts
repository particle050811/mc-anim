// anim voice 的核心：一句台词从 台词.toml 的一行，经 配音成品（资产锁）、测量、字的起止、嘴，到句模块。命令行在 命令.ts，这里的函数不碰命令行参数。
import fs from 'node:fs';
import path from 'node:path';
import type { LineSentence } from '../../engine/audio/台词句.ts';
import { bytesPath, type AssetLock } from '../资产/资产锁.ts';
import { spokenTextOf, voiceTextHash, type WorkLines, type VoiceLineRow } from './台词表.ts';

export type Measure = { 开口: number; 有声长: number; 时长: number };
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
export const finishedSha = (line: VoiceLineRow, assetLock: AssetLock) => (line.配音 ? assetLock[line.配音]?.sha256.slice(0, 12) : undefined);

/** 手修能不能用：写了 字、绑的成品就是现在这版 */
export const manualFixUsable = (line: VoiceLineRow, existingFinished: string | undefined) => {
  const h = line.口型手修;
  if (!h?.字?.length) return false;
  return Boolean(existingFinished && h.成品sha && existingFinished.startsWith(h.成品sha.slice(0, 12)));
};

/** 一句的问题（空 = 配音、句模块都跟得上 台词.toml 和资产锁）；只看数据，不跑 Python。anim voice list 用；anim check 的台词规则自己查表的那几项，只借 句模块问题 */
export const sentenceIssues = (line: VoiceLineRow, assetLock: AssetLock, sentence: LineSentence | null): string[] => {
  if (!line.配音) return sentence ? ['没写 配音，却有句模块（删掉 台词/<id>.ts，或先 anim voice use）'] : [];
  const sha = finishedSha(line, assetLock);
  if (!sha) return [`配音「${line.配音}」不在资产锁里`];
  const issues: string[] = [];
  if (line.文本哈希 !== voiceTextHash(line)) issues.push('念的字改过、配音没重出（anim voice gen 再 use；只改字幕不改念法的，写 念 = 原来的字）');
  if (!line.成品sha || !sha.startsWith(line.成品sha)) issues.push(`台词.toml 的 成品sha ${line.成品sha ?? '（没写）'} 和资产锁 ${sha} 对不上`);
  if (line.口型手修?.字 && !manualFixUsable(line, sha)) issues.push(`口型手修 是对着成品 ${line.口型手修.成品sha ?? '（没写）'} 标的，现在是 ${sha}：重标或删掉`);
  return [...issues, ...sentenceModuleIssues(line, sha, sentence)];
};

/** 句模块跟不跟得上 台词.toml 这一句和现在的成品（sha = 资产锁里成品的 sha 前 12 位） */
export const sentenceModuleIssues = (line: VoiceLineRow, sha: string, sentence: LineSentence | null): string[] => {
  if (!sentence) return ['没有句模块（anim voice lip）'];
  const issues: string[] = [];
  if (sentence.id !== line.id) issues.push(`句模块里的 id 是 ${sentence.id}`);
  if (sentence.成品sha !== sha) issues.push(`句模块是对着成品 ${sentence.成品sha} 做的，现在是 ${sha}（anim voice lip）`);
  if (sentence.配音 !== line.配音) issues.push(`句模块的 配音 ${sentence.配音} 和 台词.toml 的 ${line.配音} 不同`);
  if (sentence.角色 !== line.角色) issues.push(`句模块的 角色 ${sentence.角色} 和 台词.toml 的 ${line.角色} 不同`);
  if (sentence.念 !== spokenTextOf(line)) issues.push('念的字改了，句模块没跟上（anim voice lip）');
  if (sentence.开口 !== line.开口) issues.push(`句模块的 开口 ${sentence.开口} 和 台词.toml 的 ${line.开口} 不同`);
  if (Boolean(sentence.手修) !== manualFixUsable(line, sha)) issues.push(sentence.手修 ? '句模块用的手修已经不能用了（anim voice lip）' : '有可用的 口型手修，句模块没用它（anim voice lip）');
  const lipSha = line.口型?.成品sha;
  if (!lipSha || !sha.startsWith(lipSha)) issues.push(`台词.toml 的 口型 成品sha ${lipSha ?? '（没写）'} 不是 ${sha}（anim voice lip 会写）`);
  return issues;
};

export const assembleSentence = (line: VoiceLineRow, o: { 成品sha: string; measure: Measure; fileDurationSec: number; 字: CharTimings; manualFix: boolean; mouthKeys: [number, string][] }): LineSentence => ({
  id: line.id,
  角色: line.角色,
  念: spokenTextOf(line),
  配音: line.配音!,
  成品sha: o.成品sha,
  开口: o.measure.开口,
  有声长: o.measure.有声长,
  时长: o.measure.时长,
  文件秒数: o.fileDurationSec,
  ...(o.manualFix ? { 手修: true as const } : {}),
  字: o.字,
  嘴: o.mouthKeys,
});

/** 候选和中间稿：<数据根>/run/草稿/配音/<作品>/<台词 id>/（Agent、人试听用，不进 Git、不进预览/） */
export const candidateDir = (dataRoot: string, work: string, id: string) => path.join(dataRoot, 'run', '草稿', '配音', work, id);

/** 候选旁边的说明（gen 写、use 读）：后端、种子、参考，用来写资产表的 来源 */
export type CandidateNote = { 后端: string; 种子: number; 参考: string; 参数: Record<string, unknown>; 念: string; 时间: string };
export const readCandidateNote = (wav: string): CandidateNote | null => {
  const f = wav.replace(/\.wav$/i, '.json');
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as CandidateNote) : null;
};

/** 一句的克隆参考：这句的 合成.参考/逐字稿 > [音色.<角色>] */
export const timbreRef = (workLineTable: WorkLines, line: VoiceLineRow, assetLock: AssetLock, dataRoot: string) => {
  const timbre = workLineTable.音色[line.角色];
  const id = line.合成?.参考 ?? timbre?.参考;
  const refTranscript = line.合成?.逐字稿 ?? timbre?.逐字稿;
  if (!id || !refTranscript) throw new Error(`${line.id}：没有 ${line.角色} 的音色参考（台词.toml 写 [音色."${line.角色}"] 参考 = "<资产 id>"、逐字稿 = "…"，或这句的 合成.参考、合成.逐字稿）`);
  if (!assetLock[id]) throw new Error(`${line.id}：音色参考「${id}」不在资产锁里`);
  return { id, 文件: bytesPath(assetLock[id]!, dataRoot), 逐字稿: refTranscript };
};

/** 命令行给的、盖过 台词.toml 的合成设置（语气参考 是 wav 的绝对路径） */
export type SynthOverride = { 后端?: string; 种子?: number[]; 语气参考?: string; 强度?: number };
export type SynthBatch = { requests: Record<string, unknown>[]; notes: Map<string, Omit<CandidateNote, '参数'>> };

/** gen 的请求按后端分批（一批只起一次模型）：后端取 命令行 > 这句的 合成.后端 > [配音]；交给 TTS 的字取 合成.念 > 念 > 文本。请求的形状同 py/anim_py/配音/后端 的 合成请求 */
export const buildSynthBatches = (workLineTable: WorkLines, lines: readonly VoiceLineRow[], overrides: SynthOverride, assetLock: AssetLock, env: { dataRoot: string; 作品: string }): Map<string, SynthBatch> => {
  const batches = new Map<string, SynthBatch>();
  for (const line of lines) {
    const backendName = overrides.后端 ?? line.合成?.后端 ?? workLineTable.配音.后端;
    const batch: SynthBatch = batches.get(backendName) ?? { requests: [], notes: new Map() };
    batches.set(backendName, batch);
    const r = timbreRef(workLineTable, line, assetLock, env.dataRoot);
    const toneRefId = line.合成?.语气参考;
    if (!overrides.语气参考 && toneRefId && !assetLock[toneRefId]) throw new Error(`${line.id}：语气参考「${toneRefId}」不在资产锁里`);
    const spokenText = line.合成?.念 ?? spokenTextOf(line);
    for (const seed of overrides.种子 ?? line.合成?.种子 ?? workLineTable.配音.种子) {
      const outPath = path.join(candidateDir(env.dataRoot, env.作品, line.id), `${backendName}-种子${seed}.wav`);
      batch.requests.push({
        id: line.id, 角色: line.角色, 念: spokenText, 语言: line.语言 ?? '中文', 参考音频: r.文件, 参考逐字稿: r.逐字稿, 种子: seed, 输出: outPath,
        语气: line.语气 ?? '', 语气参考: overrides.语气参考 ?? (toneRefId ? bytesPath(assetLock[toneRefId]!, env.dataRoot) : ''),
        语气强度: overrides.强度 ?? line.合成?.强度 ?? null, 参数: line.合成?.参数 ?? {},
      });
      batch.notes.set(outPath, { 后端: backendName, 种子: seed, 参考: r.id, 念: spokenText, 时间: new Date().toISOString() });
    }
  }
  return batches;
};
