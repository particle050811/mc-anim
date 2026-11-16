// 认指纹（用户 11-06 定，决策/0013）：指纹变了、画面其实没变（依赖升小版本、重构、和画面无关的打包规则）的段，抽几帧静帧和旧切片比，
// 都在压缩噪声以内就把新指纹登记成沿用旧切片，不重渲。这里是不碰渲染的部分：抽哪几帧、找哪份旧切片、哪些差异静帧证明不了、怎么比一帧、怎么登记。
// 比法：旧切片是 x264 CRF18 压过的，新出的帧和它逐像素不可能一样。新帧先照切片编码时一样转成 yuv420p（Remotion 自带的 ffmpeg、同一个 bt709 滤镜），
//   两边都按 比较.ts 的固定公式换 RGB，再用 verify 的块平均差和 verify/阈值.toml 的「变了」三条门槛判（看一眼档算噪声内，只列出来）。帧号是输出帧（切片的帧）。
// 只比切片（决策/0014）。旧切片要连着配的那份 wav 都在（声音不比，原样沿用）。
// 登记：在新指纹名下克隆（Mac 上 APFS clonefile，不占空间；别处退回硬链接、再不行整份复制）旧切片和 wav，段签照抄并记下 沿用；
//   之后 stale、film、verify、cache gc 都把它当这个指纹渲出来的切片，不用改它们。
import fs from 'node:fs';
import path from 'node:path';
import { masterDir, segStampDir } from '../环境/作品数据.ts';
import { workName } from '../环境/作品.ts';
import { runCapture } from '../环境/子进程.ts';
import { canClone } from '../环境/去重.ts';
import { atomicWrite, fingerprintHistory, writeFingerprint, fingerprintFile, markUsed } from '../渲/母版.ts';
import { segPicturePath, segSoundPath, sameTier, pairedSoundFingerprint } from '../渲/段产物.ts';
import { videoInfo } from '../渲/探测.ts';
import { runBundledFfmpeg } from '../渲/自带ffmpeg.ts';
import { makeSegStamp, matchesSlice, readSegStamp, segStampComplete, segStampFile, soundFileName, stampFileName, historyFileName, type SegStamp, type ReuseRecord } from './段签.ts';
import { frameStream } from './帧流.ts';
import { judgeBlockDiff, blockDiffNote, computeBlockDiff, conversion, yuvToRgb, type Threshold } from './比较.ts';
import { stableJson, type SegFingerprint, type FingerprintItem } from '../指纹/指纹.ts';

/** 默认抽几帧（含首、尾）：首尾加中间均匀 10 帧。12 帧在两部作品上出帧约 10～30 秒，比整段重渲省得多；用户点名的「首、尾 + 均匀抽十来帧」 */
export const DEFAULT_SAMPLE_COUNT = 12;
export const compareMethod = `新帧经 Remotion 的 ffmpeg（bt709 zscale）转 yuv420p，两边按「${conversion}」换 RGB，块平均差过 verify/阈值.toml 的变了门槛算不同`;

/** 首帧、末帧，中间均匀取，共 n 帧（段比 n 短就全取）；升序去重 */
export const pickFrames = (frameCount: number, n = DEFAULT_SAMPLE_COUNT): number[] => {
  if (!Number.isInteger(frameCount) || frameCount <= 0) throw new Error(`帧数要是正整数：${frameCount}`);
  if (!Number.isInteger(n) || n < 2) throw new Error(`至少抽 2 帧（首、尾）：${n}`);
  if (n >= frameCount) return Array.from({ length: frameCount }, (_, i) => i);
  return [...new Set(Array.from({ length: n }, (_, i) => Math.round((i * (frameCount - 1)) / (n - 1))))];
};

/**
 * 静帧证明不了的差异：只影响编码或声音的输入变了，抽帧比得再像也不能沿用。
 * 渲染设置（编码参数、尺寸、帧数、inputProps 都在里面）、私有配乐（只是声音）、ogg 解码规则（只是声音），和新指纹记了缺字节（打进的是占位，指纹不可信）
 */
export const stillCannotProve = (oldItem: FingerprintItem, newItem: FingerprintItem): string[] => {
  const blockers: string[] = [];
  if (stableJson(oldItem.renderSettings) !== stableJson(newItem.renderSettings)) {
    const keys = [...new Set([...Object.keys(oldItem.renderSettings ?? {}), ...Object.keys(newItem.renderSettings)])].filter((k) => stableJson(oldItem.renderSettings?.[k]) !== stableJson(newItem.renderSettings[k]));
    blockers.push(`渲染设置变了（${keys.join('、')}）：编码参数、尺寸、帧数这些静帧看不出`);
  }
  if (stableJson(oldItem.privateMusic ?? {}) !== stableJson(newItem.privateMusic ?? {})) blockers.push('私有配乐变了：只影响声音，静帧证明不了');
  const ogg = 'pipeline/资产/ogg解码.cjs';
  if (oldItem.bundleRules?.[ogg] !== newItem.bundleRules?.[ogg]) blockers.push(`打包规则 ${ogg} 变了：只影响声音，静帧证明不了`);
  if (newItem.缺字节?.length) blockers.push(`新指纹里记了缺字节 ${newItem.缺字节.length} 件（打进的是占位，先 anim assets seed / pull）`);
  return blockers;
};

/** 记录：这个指纹的 .指纹.json（stale 比差异用的那份，含算法、明细）；母版、声音：旧切片和配的 wav */
export type OldVersion = { fingerprint: string; items: FingerprintItem; segFingerprintRecord: SegFingerprint; segStamp: SegStamp; master: string; sound: string; soundFingerprint: string };

/** 新指纹这边已经有东西了（渲过、认过）：不是过期的段，不用认。认到一半断掉的（段签有 沿用、切片还没改名过来）不算，可以重认 */
export const hasNewFingerprint = (segKey: string, newSeg: { 画面: string; sound: string; pictureFingerprint: { fingerprint: string } }, work = workName()): string | null => {
  if (fs.existsSync(newSeg.画面) && fs.existsSync(newSeg.sound)) return '切片在';
  const segStamp = readSegStamp(segKey, newSeg.pictureFingerprint.fingerprint, work);
  if (segStamp && !segStamp.reuse) return '渲过（有段签），切片不在：要用时重渲';
  if (!segStamp && fs.existsSync(fingerprintFile(segKey, newSeg.pictureFingerprint.fingerprint, masterDir(segKey, work)))) return '渲过（有 .指纹.json），切片不在：要用时重渲';
  return null;
};

/**
 * 拿来比的旧版：同一档（渲染级别、输出帧率一样）渲过的画面指纹里最近一份（和 anim stale 比差异的是同一串，新的在前），
 * 切片和配的 wav 都在、切片帧数和这段现在的输出帧数一样。段签缺了、不是这一对派生的，过放行闸当场补。
 * 都不行返回 null 和每份为什么不行（最多几条）
 */
export const findOldVersion = async (segKey: string, newFingerprint: SegFingerprint, o: { frameCount: number; waitGate: () => Promise<void>; work?: string; pickFingerprint?: string; includeCurrent?: boolean }): Promise<{ oldVersion: OldVersion | null; unused: string[] }> => {
  const work = o.work ?? workName();
  const unused: string[] = [];
  for (const h of fingerprintHistory(segKey, masterDir(segKey, work)).filter((h) => (o.pickFingerprint ? h.fingerprint === o.pickFingerprint : o.includeCurrent || h.fingerprint !== newFingerprint.fingerprint) && sameTier(h, newFingerprint))) {
    const shortFpName = h.fingerprint.slice(0, 16);
    const master = segPicturePath(segKey, h.fingerprint, work);
    if (!fs.existsSync(master)) continue;
    const soundFingerprint = pairedSoundFingerprint(h);
    if (!soundFingerprint) {
      unused.push(`${shortFpName}：11-06 以前另出声音的旧切片，不沿用`);
      continue;
    }
    const soundFile = segSoundPath(segKey, soundFingerprint, work);
    if (!fs.existsSync(soundFile)) {
      unused.push(`${shortFpName}：切片在，配的声音 ${soundFingerprint.slice(0, 16)}.wav 不在`);
      continue;
    }
    const frameCount = videoInfo(master).frameCount;
    if (frameCount !== o.frameCount) {
      unused.push(`${shortFpName}：切片 ${frameCount} 帧，段现在 ${o.frameCount} 帧`);
      continue;
    }
    let segStamp = readSegStamp(segKey, h.fingerprint, work);
    if (!segStampComplete(segStamp) || !(await matchesSlice(segStamp, master, soundFile))) {
      await o.waitGate();
      console.log(`== 补段签 ${segKey}（${shortFpName}）`);
      segStamp = (await makeSegStamp(master, soundFile, { segKey: segKey, fingerprint: h.fingerprint, soundFingerprint: soundFingerprint, level: (h.items.renderSettings.inputProps as { level?: string } | undefined)?.level ?? null, derive: '补', work: work })).segStamp;
    }
    return { oldVersion: { fingerprint: h.fingerprint, items: h.items, segFingerprintRecord: h, segStamp, master: master, sound: soundFile, soundFingerprint: soundFingerprint }, unused };
  }
  return { oldVersion: null, unused };
};

/**
 * Remotion 压切片时 PNG 转 yuv420p 用的滤镜（colorSpace bt709，见 node_modules/@remotion/renderer/dist/ffmpeg-args.js）。
 * 不加它 ffmpeg 默认按 bt601 转，和切片差一截色；brew 的 ffmpeg 没编 zscale，所以用 Remotion 自带的那个
 */
export const sliceToYuvFilter = 'zscale=matrix=709:range=limited:primariesin=709:primaries=709:transferin=709:transfer=709';

/** 新这一帧（PNG，预览级是 JPEG）照切片编码时一样转成 yuv420p */
export const frameToYuv = async (frameBytes: Buffer, width: number, height: number): Promise<Buffer> => {
  // 和 Remotion 喂帧时一样点明解码器（prespawn-ffmpeg.js）
  const codec = frameBytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ? 'png' : 'mjpeg';
  const y = await runBundledFfmpeg(['-v', 'error', '-nostdin', '-f', 'image2pipe', '-vcodec', codec, '-i', '-', '-vf', sliceToYuvFilter, '-pix_fmt', 'yuv420p', '-f', 'image2pipe', '-c:v', 'rawvideo', '-'], frameBytes);
  if (y.length !== (width * height * 3) / 2) throw new Error(`新出的帧转 yuv420p 是 ${y.length} 字节，切片的一帧是 ${width}×${height}（${(width * height * 3) / 2} 字节）：尺寸对不上`);
  return y;
};

export type FrameCompare = { frame: number; verdict: '一样' | '噪声内' | '不同'; 看一眼?: true; note?: string };

/** 一帧：yuv 逐字节一样是一样；不然两边换 RGB 比块平均差，verify 的变了门槛（16×16、64×64、8×8 任一条）超了是不同，看一眼档也算噪声内 */
export const compareFrame = (frame: number, newYuv: Buffer, oldYuv: Buffer, width: number, height: number, threshold: Pick<Threshold, 'block8Threshold' | 'block16Threshold' | 'block64Threshold' | 'glanceThreshold'>): FrameCompare => {
  if (newYuv.equals(oldYuv)) return { frame: frame, verdict: '一样' };
  const d = computeBlockDiff(yuvToRgb(newYuv, width, height), yuvToRgb(oldYuv, width, height), width, height);
  const verdict = judgeBlockDiff(d, threshold);
  return { frame: frame, verdict: verdict === '变了' ? '不同' : '噪声内', ...(verdict === '看一眼' ? { 看一眼: true as const } : {}), note: blockDiffNote(d, threshold) };
};

/** 旧切片的这几帧（升序），yuv420p 原样 */
export const readOldFrames = async (oldVersion: OldVersion, frames: readonly number[]): Promise<Map<number, Buffer>> => {
  const frameBuffers = new Map<number, Buffer>();
  const { width: width, height: height } = oldVersion.segStamp.signature;
  for await (const y of frameStream(oldVersion.master, frames, width, height, { 格式: 'yuv420p' })) frameBuffers.set(frames[frameBuffers.size]!, Buffer.from(y));
  if (frameBuffers.size !== frames.length) throw new Error(`${oldVersion.master} 只解出 ${frameBuffers.size}/${frames.length} 帧`);
  return frameBuffers;
};

/** 大文件复制：Mac 上 cp -c（APFS clonefile，不占空间；和 环境/去重.ts 同一种克隆），不行退回硬链接，再不行整份复制。到 已经在就抛 */
export const cloneFile = (fromPath: string, destPath: string): '克隆' | '硬链接' | '复制' => {
  if (fs.existsSync(destPath)) throw new Error(`${destPath} 已经在了，不覆盖`);
  if (canClone()) {
    try {
      runCapture(['cp', '-c', fromPath, destPath]);
      return '克隆';
    } catch {
      fs.rmSync(destPath, { force: true });
    }
  }
  try {
    fs.linkSync(fromPath, destPath);
    return '硬链接';
  } catch {
    fs.copyFileSync(fromPath, destPath, fs.constants.COPYFILE_EXCL);
    return '复制';
  }
};

export type RegisterInfo = { reason: string; frame: number[]; commit: string; level: string | null; now?: Date };

/** 克隆到临时名，返回临时名和怎么复制的；目标已经在就抛 */
const cloneToTemp = (fromPath: string, destPath: string) => {
  if (fs.existsSync(destPath)) throw new Error(`${destPath} 已经在了，不覆盖`);
  const tempPath = destPath.replace(/(\.\w+)$/, `.写入中-${process.pid}$1`);
  fs.rmSync(tempPath, { force: true });
  return { tempPath, copyHow: cloneFile(fromPath, tempPath) };
};

/**
 * 把新指纹登记成沿用旧版：段签（声音.flac 克隆过来、签.json 照抄并记 沿用）、两份 .指纹.json 先写，切片和 wav 克隆到临时名、最后改名成新指纹的名字。
 * 中途断了：切片没改名过来，stale 看到的是「渲过、切片不在」，重跑 认指纹 会接着认。
 * 不删旧指纹的任何东西（主检出的 anim film、cache gc 照常按钉清；克隆的块不跟着删）
 */
export const registerReuse = (segKey: string, oldVersion: OldVersion, newFingerprints: { pictureFingerprint: SegFingerprint; soundFingerprint: SegFingerprint }, info: RegisterInfo, work = workName()): { segStamp: SegStamp; master: string; sound: string; copyHow: string } => {
  const atIso = (info.now ?? new Date()).toISOString();
  const fingerprint = newFingerprints.pictureFingerprint.fingerprint;
  const stampDir = segStampDir(segKey, fingerprint, work);
  fs.mkdirSync(stampDir, { recursive: true });
  const picturePath = segPicturePath(segKey, fingerprint, work);
  const soundPath = segSoundPath(segKey, newFingerprints.soundFingerprint.fingerprint, work);
  const masterClone = cloneToTemp(oldVersion.master, picturePath);
  // 声音指纹没变（只改了画面代码）时 wav 本来就在，不用克隆
  const soundClone = fs.existsSync(soundPath) ? null : cloneToTemp(oldVersion.sound, soundPath);
  try {
    let soundRecord: SegStamp['sound'] = null;
    if (oldVersion.segStamp.sound) {
      const destPath = path.join(stampDir, soundFileName);
      fs.rmSync(destPath, { force: true });
      cloneFile(segStampFile(oldVersion.segStamp, oldVersion.segStamp.sound.file), destPath);
      soundRecord = { ...oldVersion.segStamp.sound, file: soundFileName };
    }
    const reuse: ReuseRecord = { reusedFrom: oldVersion.fingerprint, origRender: oldVersion.segStamp.reuse?.origRender ?? oldVersion.fingerprint, reason: info.reason, frame: [...info.frame], compareMethod: compareMethod, at: atIso, commit: info.commit };
    const soundSource = soundClone ? { ...oldVersion.segStamp.soundSource!, modifiedAt: fs.statSync(soundClone.tempPath).mtimeMs } : { ...oldVersion.segStamp.soundSource!, modifiedAt: fs.statSync(soundPath).mtimeMs };
    const segStamp: SegStamp = { ...oldVersion.segStamp, version: 3, work: work, segment: segKey, fingerprint: fingerprint, soundFingerprint: newFingerprints.soundFingerprint.fingerprint, level: info.level, master: { ...oldVersion.segStamp.master, modifiedAt: fs.statSync(masterClone.tempPath).mtimeMs }, soundSource: soundSource, sound: soundRecord, reuse: reuse };
    fs.appendFileSync(path.join(stampDir, historyFileName), JSON.stringify({ recordedAt: atIso, reuse: true, reusedFrom: oldVersion.fingerprint, origRender: reuse.origRender, byteSha: segStamp.master.byteSha, frame: reuse.frame, reason: info.reason, copyMethod: masterClone.copyHow }) + '\n', 'utf8');
    atomicWrite(path.join(stampDir, stampFileName), JSON.stringify(segStamp, null, 1) + '\n');
    writeFingerprint(newFingerprints.pictureFingerprint, masterDir(segKey, work));
    writeFingerprint(newFingerprints.soundFingerprint, masterDir(segKey, work));
    if (soundClone) fs.renameSync(soundClone.tempPath, soundPath);
    fs.renameSync(masterClone.tempPath, picturePath);
    markUsed(masterDir(segKey, work), fingerprint);
    markUsed(masterDir(segKey, work), newFingerprints.soundFingerprint.fingerprint);
    return { segStamp, master: picturePath, sound: soundPath, copyHow: masterClone.copyHow };
  } finally {
    fs.rmSync(masterClone.tempPath, { force: true });
    if (soundClone) fs.rmSync(soundClone.tempPath, { force: true });
  }
};
