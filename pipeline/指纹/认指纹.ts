// 认指纹（用户 11-06 定，决策/0013）：指纹变了、画面其实没变（依赖升小版本、重构、和画面无关的打包规则）的段，抽几帧静帧和旧切片比，
// 都在压缩噪声以内就把新指纹登记成沿用旧切片，不重渲。这里是不碰渲染的部分：抽哪几帧、找哪份旧切片、哪些差异静帧证明不了、怎么比一帧、怎么登记。
// 比法：旧切片是 x264 CRF18 压过的，新出的帧和它逐像素不可能一样。新帧先照切片编码时一样转成 yuv420p（Remotion 自带的 ffmpeg、同一个 bt709 滤镜），
//   两边都按 比较.ts 的固定公式换 RGB，再用 verify 的块平均差和 verify/阈值.toml 的「变了」三条门槛判（看一眼档算噪声内，只列出来）。帧号是输出帧（切片的帧）。
// 只比切片（决策/0014）。旧切片要连着配的那份 wav 都在（声音不比，原样沿用）。
// 登记：在新指纹名下克隆（Mac 上 APFS clonefile，不占空间；别处退回硬链接、再不行整份复制）旧切片和 wav，段签照抄并记下 沿用；
//   之后 stale、film、verify、cache gc 都把它当这个指纹渲出来的切片，不用改它们。
import fs from 'node:fs';
import path from 'node:path';
import { masterDir, segStampDir } from '../环境/配置.ts';
import { workName } from '../环境/作品.ts';
import { runCapture } from '../环境/子进程.ts';
import { canClone } from '../缓存/去重.ts';
import { atomicWrite, fingerprintHistory, writeFingerprint, fingerprintFile, markUsed } from '../渲/母版.ts';
import { segPicturePath, segSoundPath, sameTier, pairedSoundFingerprint } from '../渲/段产物.ts';
import { videoInfo } from '../渲/探测.ts';
import { runBundledFfmpeg } from '../渲/自带ffmpeg.ts';
import { makeSegStamp, matchesSlice, readSegStamp, segStampComplete, segStampFile, soundFileName, stampFileName, historyFileName, type SegStamp, type ReuseRecord } from '../段签/段签.ts';
import { frameStream } from '../验收/帧流.ts';
import { judgeBlockDiff, blockDiffNote, computeBlockDiff, conversion, yuvToRgb, type Threshold } from '../验收/比较.ts';
import { stableJson, type SegFingerprint, type FingerprintItem } from './指纹.ts';

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
  if (stableJson(oldItem.渲染设置) !== stableJson(newItem.渲染设置)) {
    const keys = [...new Set([...Object.keys(oldItem.渲染设置 ?? {}), ...Object.keys(newItem.渲染设置)])].filter((k) => stableJson(oldItem.渲染设置?.[k]) !== stableJson(newItem.渲染设置[k]));
    blockers.push(`渲染设置变了（${keys.join('、')}）：编码参数、尺寸、帧数这些静帧看不出`);
  }
  if (stableJson(oldItem.私有配乐 ?? {}) !== stableJson(newItem.私有配乐 ?? {})) blockers.push('私有配乐变了：只影响声音，静帧证明不了');
  const ogg = 'pipeline/资产/ogg解码.cjs';
  if (oldItem.打包规则?.[ogg] !== newItem.打包规则?.[ogg]) blockers.push(`打包规则 ${ogg} 变了：只影响声音，静帧证明不了`);
  if (newItem.missingBytes?.length) blockers.push(`新指纹里记了缺字节 ${newItem.missingBytes.length} 件（打进的是占位，先 anim assets seed / pull）`);
  return blockers;
};

/** 记录：这个指纹的 .指纹.json（stale 比差异用的那份，含算法、明细）；母版、声音：旧切片和配的 wav */
export type OldVersion = { 指纹: string; 项: FingerprintItem; segFingerprintRecord: SegFingerprint; segStamp: SegStamp; 母版: string; 声音: string; 声音指纹: string };

/** 新指纹这边已经有东西了（渲过、认过）：不是过期的段，不用认。认到一半断掉的（段签有 沿用、切片还没改名过来）不算，可以重认 */
export const hasNewFingerprint = (segKey: string, newSeg: { 画面: string; 声音: string; 画面指纹: { 指纹: string } }, work = workName()): string | null => {
  if (fs.existsSync(newSeg.画面) && fs.existsSync(newSeg.声音)) return '切片在';
  const segStamp = readSegStamp(segKey, newSeg.画面指纹.指纹, work);
  if (segStamp && !segStamp.沿用) return '渲过（有段签），切片不在：要用时重渲';
  if (!segStamp && fs.existsSync(fingerprintFile(segKey, newSeg.画面指纹.指纹, masterDir(segKey, work)))) return '渲过（有 .指纹.json），切片不在：要用时重渲';
  return null;
};

/**
 * 拿来比的旧版：同一档（渲染级别、输出帧率一样）渲过的画面指纹里最近一份（和 anim stale 比差异的是同一串，新的在前），
 * 切片和配的 wav 都在、切片帧数和这段现在的输出帧数一样。段签缺了、不是这一对派生的，过放行闸当场补。
 * 都不行返回 null 和每份为什么不行（最多几条）
 */
export const findOldVersion = async (segKey: string, newFingerprint: SegFingerprint, o: { 帧数: number; waitGate: () => Promise<void>; 作品?: string; pickFingerprint?: string; includeCurrent?: boolean }): Promise<{ oldVersion: OldVersion | null; unused: string[] }> => {
  const work = o.作品 ?? workName();
  const unused: string[] = [];
  for (const h of fingerprintHistory(segKey, masterDir(segKey, work)).filter((h) => (o.pickFingerprint ? h.指纹 === o.pickFingerprint : o.includeCurrent || h.指纹 !== newFingerprint.指纹) && sameTier(h, newFingerprint))) {
    const shortFpName = h.指纹.slice(0, 16);
    const master = segPicturePath(segKey, h.指纹, work);
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
    const frameCount = videoInfo(master).帧数;
    if (frameCount !== o.帧数) {
      unused.push(`${shortFpName}：切片 ${frameCount} 帧，段现在 ${o.帧数} 帧`);
      continue;
    }
    let segStamp = readSegStamp(segKey, h.指纹, work);
    if (!segStampComplete(segStamp) || !(await matchesSlice(segStamp, master, soundFile))) {
      await o.waitGate();
      console.log(`== 补段签 ${segKey}（${shortFpName}）`);
      segStamp = (await makeSegStamp(master, soundFile, { segKey: segKey, 指纹: h.指纹, 声音指纹: soundFingerprint, 级别: (h.项.渲染设置.inputProps as { 级别?: string } | undefined)?.级别 ?? null, 派生: '补', 作品: work })).segStamp;
    }
    return { oldVersion: { 指纹: h.指纹, 项: h.项, segFingerprintRecord: h, segStamp, 母版: master, 声音: soundFile, 声音指纹: soundFingerprint }, unused };
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

export type FrameCompare = { 帧: number; 结论: '一样' | '噪声内' | '不同'; 看一眼?: true; 说明?: string };

/** 一帧：yuv 逐字节一样是一样；不然两边换 RGB 比块平均差，verify 的变了门槛（16×16、64×64、8×8 任一条）超了是不同，看一眼档也算噪声内 */
export const compareFrame = (frame: number, newYuv: Buffer, oldYuv: Buffer, width: number, height: number, threshold: Pick<Threshold, '块8门槛' | '块16门槛' | '块64门槛' | '看一眼门槛'>): FrameCompare => {
  if (newYuv.equals(oldYuv)) return { 帧: frame, 结论: '一样' };
  const d = computeBlockDiff(yuvToRgb(newYuv, width, height), yuvToRgb(oldYuv, width, height), width, height);
  const verdict = judgeBlockDiff(d, threshold);
  return { 帧: frame, 结论: verdict === '变了' ? '不同' : '噪声内', ...(verdict === '看一眼' ? { 看一眼: true as const } : {}), 说明: blockDiffNote(d, threshold) };
};

/** 旧切片的这几帧（升序），yuv420p 原样 */
export const readOldFrames = async (oldVersion: OldVersion, frames: readonly number[]): Promise<Map<number, Buffer>> => {
  const frameBuffers = new Map<number, Buffer>();
  const { 宽: width, 高: height } = oldVersion.segStamp.签名;
  for await (const y of frameStream(oldVersion.母版, frames, width, height, { 格式: 'yuv420p' })) frameBuffers.set(frames[frameBuffers.size]!, Buffer.from(y));
  if (frameBuffers.size !== frames.length) throw new Error(`${oldVersion.母版} 只解出 ${frameBuffers.size}/${frames.length} 帧`);
  return frameBuffers;
};

/** 大文件复制：Mac 上 cp -c（APFS clonefile，不占空间；和 缓存/去重.ts 同一种克隆），不行退回硬链接，再不行整份复制。到 已经在就抛 */
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

export type RegisterInfo = { 理由: string; 帧: number[]; 提交: string; 级别: string | null; now?: Date };

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
export const registerReuse = (segKey: string, oldVersion: OldVersion, newFingerprints: { 画面指纹: SegFingerprint; 声音指纹: SegFingerprint }, info: RegisterInfo, work = workName()): { segStamp: SegStamp; 母版: string; 声音: string; copyHow: string } => {
  const atIso = (info.now ?? new Date()).toISOString();
  const fingerprint = newFingerprints.画面指纹.指纹;
  const stampDir = segStampDir(segKey, fingerprint, work);
  fs.mkdirSync(stampDir, { recursive: true });
  const picturePath = segPicturePath(segKey, fingerprint, work);
  const soundPath = segSoundPath(segKey, newFingerprints.声音指纹.指纹, work);
  const masterClone = cloneToTemp(oldVersion.母版, picturePath);
  // 声音指纹没变（只改了画面代码）时 wav 本来就在，不用克隆
  const soundClone = fs.existsSync(soundPath) ? null : cloneToTemp(oldVersion.声音, soundPath);
  try {
    let soundRecord: SegStamp['声音'] = null;
    if (oldVersion.segStamp.声音) {
      const destPath = path.join(stampDir, soundFileName);
      fs.rmSync(destPath, { force: true });
      cloneFile(segStampFile(oldVersion.segStamp, oldVersion.segStamp.声音.文件), destPath);
      soundRecord = { ...oldVersion.segStamp.声音, 文件: soundFileName };
    }
    const reuse: ReuseRecord = { 自: oldVersion.指纹, 原渲: oldVersion.segStamp.沿用?.原渲 ?? oldVersion.指纹, 理由: info.理由, 帧: [...info.帧], 比法: compareMethod, 于: atIso, 提交: info.提交 };
    const soundSource = soundClone ? { ...oldVersion.segStamp.声音源!, 改于: fs.statSync(soundClone.tempPath).mtimeMs } : { ...oldVersion.segStamp.声音源!, 改于: fs.statSync(soundPath).mtimeMs };
    const segStamp: SegStamp = { ...oldVersion.segStamp, 版本: 3, 作品: work, 段: segKey, 指纹: fingerprint, 声音指纹: newFingerprints.声音指纹.指纹, 级别: info.级别, 母版: { ...oldVersion.segStamp.母版, 改于: fs.statSync(masterClone.tempPath).mtimeMs }, 声音源: soundSource, 声音: soundRecord, 沿用: reuse };
    fs.appendFileSync(path.join(stampDir, historyFileName), JSON.stringify({ recordedAt: atIso, 沿用: true, 自: oldVersion.指纹, 原渲: reuse.原渲, 字节sha: segStamp.母版.字节sha, 帧: reuse.帧, 理由: info.理由, copyHow: masterClone.copyHow }) + '\n', 'utf8');
    atomicWrite(path.join(stampDir, stampFileName), JSON.stringify(segStamp, null, 1) + '\n');
    writeFingerprint(newFingerprints.画面指纹, masterDir(segKey, work));
    writeFingerprint(newFingerprints.声音指纹, masterDir(segKey, work));
    if (soundClone) fs.renameSync(soundClone.tempPath, soundPath);
    fs.renameSync(masterClone.tempPath, picturePath);
    markUsed(masterDir(segKey, work), fingerprint);
    markUsed(masterDir(segKey, work), newFingerprints.声音指纹.指纹);
    return { segStamp, 母版: picturePath, 声音: soundPath, copyHow: masterClone.copyHow };
  } finally {
    fs.rmSync(masterClone.tempPath, { force: true });
    if (soundClone) fs.rmSync(soundClone.tempPath, { force: true });
  }
};
