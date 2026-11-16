// 扫一遍母版（切片）：抽样帧算签名，声音算 sha、响度、起音；给了参照（认可记录）就逐帧下结论（一样 / 容差内 / 变了）。
// verify 平时用 扫段签：签名、声音读段签（段签.ts，渲完从切片和 wav 派生），哈希和参照不一样的帧才解切片取像素（要是段签记的那份）。
// 参照有像素（认可参考、认可那版的切片）就比块平均差（比较.ts，用户 11-02 定），只有签名就比块均值；
// 变了的帧、要看一眼的帧（16×16 在 看一眼门槛 和 块16门槛 之间）写 旧|新|差 的并排图进预览给人看。
// 两边像素同一种换法：认可参考、切片都是 yuv420p 按固定公式换（比较.ts 的 转rgb）。
// 和旧项目基线比（verify --对基线）随 CRF1 母版一起删了（决策/0014）：基线是 1440p 24 帧的，和 4K60 切片的帧对不上。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { encode } from 'fast-png';
import { videoInfo, hasAudioTrack } from '../渲/探测.ts';
import { frameStream, audioStream, sampleFrames, blockMeans, sha, defaultFrameStep } from './帧流.ts';
import { Envelope, findOnsets, measureLoudness, computeBlockDiff, judgeBlockDiff, blockDiffNote, blocksToView, sideBySide, compareBlockMeans, compareOnsets, yuvToRgb, type Threshold } from './比较.ts';
import { refPixels } from './参考像素.ts';
import { grayFilter } from '../合成/接缝.ts';
import type { ApprovalRecord, AudioSig, Signature, FrameSig } from './认可.ts';

export { RefMismatchError } from './参考像素.ts';

export type FrameVerdict = { frame: number; verdict: '一样' | '容差内' | '变了'; 看一眼?: true; note?: string };
export type ScanResult = {
  signature: Signature;
  frameVerdicts: FrameVerdict[];
  audioVerdict: '一样' | '容差内' | '变了' | '没有音轨';
  audioNote?: string;
  sizeChanged?: string;
  compareMethod: '块差' | '块均值';
  /** 参照的像素取自哪（认可参考 / 认可那版的母版），只给人看 */
  pixelSource?: string;
};

/** 拿来比的那一版 */
export type RefData = {
  name: string; // 并排图文件名里用
  width: number;
  height: number;
  frameCount: number;
  frames: number[]; // 比哪几帧
  signature: Map<number, FrameSig>; // 有就先比哈希
  rgbPixelFrames: ((frames: number[]) => AsyncGenerator<Buffer>) | null; // 按帧号升序交出 rgb24（yuv420p 按 转rgb 换）
  pixelSource?: string;
  sound: AudioSig | null; // null = 那一版没有音轨
};

const writePng = (file: string, rgb: Buffer, width: number, height: number) => fs.writeFileSync(file, encode({ width: width, height: height, data: new Uint8Array(rgb.buffer, rgb.byteOffset, rgb.length), channels: 3, depth: 8 }));

/** 母版的声音签名：PCM 的 sha、积分响度、起音 */
export const scanAudio = async (file: string): Promise<AudioSig> => {
  const h = crypto.createHash('sha256');
  const envelope = new Envelope();
  for await (const c of audioStream(file)) {
    h.update(c);
    envelope.加(c);
  }
  return { audioSha: h.digest('hex'), loudness: measureLoudness(file), onsets: findOnsets(envelope.finish()) };
};

/** 母版解成 yuv420p、按固定公式交出这几帧的 rgb24（升序） */
export async function* masterPixels(file: string, frames: readonly number[], width: number, height: number): AsyncGenerator<Buffer> {
  for await (const yuv of frameStream(file, frames, width, height, { 格式: 'yuv420p' })) yield yuvToRgb(yuv, width, height);
}

/**
 * 认可记录作参照。像素按这个顺序取：认可参考（认可那版的抽样帧；边解边核对，见 参考像素.ts）、认可那版的母版（调用方确认过是认可那版，尺寸帧数一样才用）、都没有就只比块均值。
 */
export const approvedRefData = async (approval: ApprovalRecord, oldMaster?: string | null, refFile?: string | null): Promise<RefData> => {
  let existingOldMaster = oldMaster && fs.existsSync(oldMaster) ? oldMaster : null;
  if (existingOldMaster) {
    const v = videoInfo(existingOldMaster);
    if (v.width !== approval.width || v.height !== approval.height || v.frameCount !== approval.frameCount) existingOldMaster = null;
  }
  const soundSignature: AudioSig | null = approval.audioSha ? { audioSha: approval.audioSha, loudness: approval.loudness, onsets: approval.onsets } : null;
  const frames = sampleFrames(approval.frameCount, approval.interval);
  const frameSignatures = new Map(approval.frame.map((f) => [f.frame, f]));
  const refPath = refFile && fs.existsSync(refFile) ? refFile : null;
  const rgbPixelFrames = refPath ? (wantedFrames: number[]) => refPixels(refPath, approval, wantedFrames) : existingOldMaster ? (wantedFrames: number[]) => masterPixels(existingOldMaster, wantedFrames, approval.width, approval.height) : null;
  return { name: '认可', width: approval.width, height: approval.height, frameCount: approval.frameCount, frames, signature: frameSignatures, rgbPixelFrames, pixelSource: refPath ? '认可参考' : existingOldMaster ? '认可那版的母版' : undefined, sound: soundSignature };
};

type PreviewOpts = { 目录: () => string; filePrefix: string };

/**
 * 一帧的结论（扫母版、扫段签共用）：哈希一样就是一样；两边都有像素比块平均差；只有签名比块均值。
 * 变了、要看一眼的写并排图（文件名带「变了」「看一眼」）
 */
const judgeFrame = (frame: number, s: FrameSig, newRgb: Buffer | null, oldRgb: Buffer | null, referenceParams: RefData, threshold: Threshold, width: number, height: number, previewOpts?: PreviewOpts): FrameVerdict => {
  const approvedSig = referenceParams.signature.get(frame);
  const previewFile = (suffix: string) => path.join(previewOpts!.目录(), `${previewOpts!.filePrefix}-第${String(frame).padStart(4, '0')}帧-${suffix}.png`);
  if (approvedSig && approvedSig.hash === s.hash) return { frame: frame, verdict: '一样' };
  if (newRgb && oldRgb) {
    if (newRgb.equals(oldRgb)) return { frame: frame, verdict: '一样' };
    const d = computeBlockDiff(newRgb, oldRgb, width, height);
    const verdict = judgeBlockDiff(d, threshold);
    const result: FrameVerdict = { frame: frame, verdict: verdict === '变了' ? '变了' : '容差内', ...(verdict === '看一眼' ? { 看一眼: true as const } : {}), note: blockDiffNote(d, threshold) };
    if (verdict !== '容差内' && previewOpts) {
      const w = blocksToView(d, threshold);
      writePng(previewFile(`${verdict}-${referenceParams.name}-现在-差`), sideBySide(newRgb, oldRgb, width, height, { x: d[w].x, y: d[w].y, side: w }), width * 3, height * 2);
    }
    return result;
  }
  if (approvedSig) {
    const d = compareBlockMeans(s.blockMeans, approvedSig.blockMeans);
    const result: FrameVerdict = { frame: frame, verdict: d <= threshold.blockMeanTol ? '容差内' : '变了', note: `没有${referenceParams.name}那版的像素，只比了块均值：最大差 ${d}` };
    if (result.verdict === '变了' && previewOpts && newRgb) writePng(previewFile('变了-现在'), newRgb, width, height);
    return result;
  }
  return { frame: frame, verdict: '变了', note: `${referenceParams.name}里没有这一帧` };
};

/** 声音的结论：sha 一样就是没变；不一样比响度和起音 */
const judgeAudio = (newAudio: AudioSig | null, referenceParams: RefData, threshold: Threshold | undefined): Pick<ScanResult, 'audioVerdict' | 'audioNote'> => {
  const oldSound = referenceParams.sound;
  if (!newAudio) return oldSound ? { audioVerdict: '变了', audioNote: `${referenceParams.name}那版有音轨，现在没有` } : { audioVerdict: '没有音轨' };
  if (!oldSound) return { audioVerdict: '变了', audioNote: `${referenceParams.name}那版没有音轨` };
  if (oldSound.audioSha === newAudio.audioSha) return { audioVerdict: '一样' };
  if (oldSound.loudness === null || !oldSound.onsets) return { audioVerdict: '变了', audioNote: `sha 不一样，${referenceParams.name}那版没记响度和起音、母版也不在，比不了` };
  const loudnessDiff = newAudio.loudness! - oldSound.loudness;
  // 阈值.toml 的起音容差帧是第 6、7 章编排时 24 帧一秒的帧
  const toleranceSec = threshold!.onsetTolFrames / 24;
  const o = compareOnsets(newAudio.onsets!, oldSound.onsets, toleranceSec);
  const problems = [
    Math.abs(loudnessDiff) > threshold!.loudnessTolLu ? `响度差 ${loudnessDiff.toFixed(2)} LU（容差 ±${threshold!.loudnessTolLu}）` : null,
    o.oldOnly.length ? `${referenceParams.name}那版在 ${o.oldOnly.slice(0, 6).join('、')} 秒起的声音，现在前后 ${threshold!.onsetTolFrames} 帧内没有` : null,
    o.newOnly.length ? `现在在 ${o.newOnly.slice(0, 6).join('、')} 秒起的声音，${referenceParams.name}那版前后 ${threshold!.onsetTolFrames} 帧内没有` : null,
  ].filter(Boolean);
  return problems.length ? { audioVerdict: '变了', audioNote: problems.join('；') } : { audioVerdict: '容差内', audioNote: `响度差 ${loudnessDiff.toFixed(2)} LU，起音都对得上` };
};

type CompareOpts = { approval?: ApprovalRecord | null; oldMaster?: string | null; reference?: string | null; refData?: RefData | null; threshold?: Threshold; 预览?: PreviewOpts };

/** 要比的帧逐帧下结论：哈希和参照一样的不取像素，别的两边各取一次像素（升序） */
const compareFrameSet = async (compareFrames: readonly number[], frameSignatures: Map<number, FrameSig>, newPixels: ((frames: number[]) => AsyncGenerator<Buffer>) | null, referenceParams: RefData, threshold: Threshold, width: number, height: number, previewOpts?: PreviewOpts) => {
  const pixelFrames = compareFrames.filter((f) => referenceParams.signature.get(f)?.hash !== frameSignatures.get(f)!.hash);
  const newStream = newPixels && pixelFrames.length ? newPixels(pixelFrames) : null;
  const oldStream = referenceParams.rgbPixelFrames && newStream ? referenceParams.rgbPixelFrames(pixelFrames) : null;
  const frameVerdicts: FrameVerdict[] = [];
  try {
    for (const frame of compareFrames) {
      const s = frameSignatures.get(frame)!;
      if (!pixelFrames.includes(frame) || !newStream) {
        frameVerdicts.push(judgeFrame(frame, s, null, null, referenceParams, threshold, width, height, previewOpts));
        continue;
      }
      const a = await newStream.next();
      if (a.done) throw new Error(`新这一版抽不出第 ${frame} 帧`);
      const b = oldStream ? await oldStream.next() : null;
      frameVerdicts.push(judgeFrame(frame, s, a.value, b && !b.done ? b.value : null, referenceParams, threshold, width, height, previewOpts));
    }
  } finally {
    await newStream?.return(undefined);
    await oldStream?.return(undefined);
  }
  return frameVerdicts;
};

const sizeNote = (referenceParams: RefData | null, width: number, height: number, frameCount: number) =>
  referenceParams && (referenceParams.width !== width || referenceParams.height !== height || referenceParams.frameCount !== frameCount) ? `${referenceParams.name}的是 ${referenceParams.width}×${referenceParams.height} ${referenceParams.frameCount} 帧，现在是 ${width}×${height} ${frameCount} 帧` : undefined;

/**
 * 解一遍母版（切片）算签名（ffmpeg rgb24：sha、16×9 块均值；声音），给了参照就再比（像素另解一次要的帧，yuv420p 按固定公式换）。
 * 首尾小图：给了文件名，就在算签名的那次解码里顺带把首帧、末帧缩成 160×90 灰度写进去（出段签 用，和 接缝.ts 的 灰度帧 逐位一样）
 */
export const scanMaster = async (newMaster: string, opts: CompareOpts & { headTailThumb?: string; sound?: string | null } = {}): Promise<ScanResult> => {
  const { frameCount: frameCount, width: width, height: height } = videoInfo(newMaster);
  const referenceParams = opts.refData ?? (opts.approval ? await approvedRefData(opts.approval, opts.oldMaster, opts.reference) : null);
  const threshold = opts.threshold;
  if (referenceParams && !threshold) throw new Error('和参照比要给阈值');
  const sizeChanged = sizeNote(referenceParams, width, height, frameCount);
  const sigFrames = sampleFrames(frameCount, defaultFrameStep);
  const compareFrames = referenceParams && !sizeChanged ? referenceParams.frames : [];
  const frames = [...new Set([...sigFrames, ...compareFrames])].sort((a, b) => a - b);
  const extraOutputs = opts.headTailThumb ? ['-map', '0:v:0', '-vf', `select='eq(n,0)+eq(n,${frameCount - 1})',${grayFilter}`, '-fps_mode', 'passthrough', '-frames:v', String(frameCount > 1 ? 2 : 1), '-f', 'rawvideo', opts.headTailThumb] : undefined;

  const frameSignatures = new Map<number, FrameSig>();
  for await (const rgb of frameStream(newMaster, frames, width, height, { extraOutputs })) {
    const frame = frames[frameSignatures.size]!;
    frameSignatures.set(frame, { frame: frame, hash: sha(rgb), blockMeans: blockMeans(rgb, width, height) });
  }
  if (frameSignatures.size !== frames.length) throw new Error(`${newMaster} 只抽出 ${frameSignatures.size}/${frames.length} 帧`);
  const frameVerdicts = referenceParams ? await compareFrameSet(compareFrames, frameSignatures, (wantedFrames) => masterPixels(newMaster, wantedFrames, width, height), referenceParams, threshold!, width, height, opts.预览) : [];

  // 切片不带声音，声音在旁边的 wav（段产物.ts）：给了 声音 就从它算
  const audioSource = opts.sound ?? (hasAudioTrack(newMaster) ? newMaster : null);
  const newAudio = audioSource && hasAudioTrack(audioSource) ? await scanAudio(audioSource) : null;
  const soundVerdict = referenceParams && !sizeChanged ? judgeAudio(newAudio, referenceParams, threshold) : { audioVerdict: '没有音轨' as const };
  return {
    signature: { width: width, height: height, frameCount: frameCount, interval: defaultFrameStep, frame: sigFrames.map((f) => frameSignatures.get(f)!), audioSha: newAudio?.audioSha ?? null, loudness: newAudio?.loudness ?? null, onsets: newAudio?.onsets ?? null },
    frameVerdicts,
    ...soundVerdict,
    sizeChanged,
    compareMethod: referenceParams?.rgbPixelFrames ? '块差' : '块均值',
    pixelSource: referenceParams?.pixelSource,
  };
};

/** 参照要比的帧段签的签名里没有（间隔不一样），调用方退回 扫母版 */
export class NoSignatureError extends Error {}
/** 有帧哈希和参照不一样、要看像素，可新这一版的母版不在（或不是段签记的那份） */
export class MissingMasterError extends Error {}

/** 段签里存的新这一版：签名（扫母版 算的那份），和段签记的那份切片（不在是 null） */
export type SegStampSource = { signature: Signature; master: string | null };

/**
 * 和 扫母版 同样下结论，但签名、声音读段签，哈希和参照不一样的帧才解母版取像素。
 * 参照要比的帧不全在签名里（参照的间隔不一样）抛 签名里没有，调用方退回 扫母版；要像素却没有母版抛 缺母版
 */
export const scanSegStamp = async (newSource: SegStampSource, opts: CompareOpts = {}): Promise<ScanResult> => {
  const { width: width, height: height, frameCount: frameCount } = newSource.signature;
  const referenceParams = opts.refData ?? (opts.approval ? await approvedRefData(opts.approval, opts.oldMaster, opts.reference) : null);
  const threshold = opts.threshold;
  if (referenceParams && !threshold) throw new Error('和参照比要给阈值');
  const sizeChanged = sizeNote(referenceParams, width, height, frameCount);
  const frameSignatures = new Map(newSource.signature.frame.map((f) => [f.frame, f]));
  const compareFrames = referenceParams && !sizeChanged ? referenceParams.frames : [];
  const missing = compareFrames.filter((f) => !frameSignatures.has(f));
  if (missing.length) throw new NoSignatureError(`段签的签名里没有第 ${missing.slice(0, 5).join('、')} 帧（参照的抽样间隔不一样），要解母版比`);
  // 旧那版没像素、也不出预览：块均值只看签名，不用解母版
  const needNewPixels = !!referenceParams && (!!referenceParams.rgbPixelFrames || !!opts.预览) && compareFrames.some((f) => referenceParams.signature.get(f)?.hash !== frameSignatures.get(f)!.hash);
  if (needNewPixels && !newSource.master) throw new MissingMasterError('有抽样帧和认可版的哈希不一样，要看像素，可现在这个指纹的母版不在（或不是段签记的那份）');
  const frameVerdicts = referenceParams ? await compareFrameSet(compareFrames, frameSignatures, needNewPixels ? (wantedFrames) => masterPixels(newSource.master!, wantedFrames, width, height) : null, referenceParams, threshold!, width, height, opts.预览) : [];
  const newAudio: AudioSig | null = newSource.signature.audioSha ? { audioSha: newSource.signature.audioSha, loudness: newSource.signature.loudness, onsets: newSource.signature.onsets } : null;
  const soundVerdict = referenceParams && !sizeChanged ? judgeAudio(newAudio, referenceParams, threshold) : { audioVerdict: '没有音轨' as const };
  return { signature: newSource.signature, frameVerdicts, ...soundVerdict, sizeChanged, compareMethod: referenceParams?.rgbPixelFrames ? '块差' : '块均值', pixelSource: referenceParams?.pixelSource };
};

/** 整段结论：有一项变了就要 accept */
export const isChanged = (r: ScanResult) => !!r.sizeChanged || r.frameVerdicts.some((f) => f.verdict === '变了') || r.audioVerdict === '变了';
