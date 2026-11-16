// 段签：每段渲完从切片派生一份小件（设计见 预览/1030-1755-母版管线重设计/01-推荐方案.md 第四节 A）：verify 的签名、首尾帧小图、无损声音。
//   段签/<作品>/<段键>/<画面指纹前 16 位>/
//     签.json    切片（mp4）和声音（wav）的字节 sha、大小、改于；verify 的签名（扫母版 算的那份：抽样帧 sha、16×9 块均值；声音 sha/响度/起音取自 wav）；首尾帧 160×90 灰度（接缝用）
//     声音.flac  wav 的 PCM 无损（解回来的 PCM sha 要等于签名里的 音频sha 才收）
//     历史.jsonl 同一指纹重渲：上一份的字节 sha 和自查结论
//     历史/<上一份切片字节 sha 前 16 位>/  重渲前那一套（签.json、声音.flac）原样挪进来
// 版本 3（11-06 起，决策/0014）：母版 = 切片 mp4，签名直接从它算（切片就是渲染出来的原样，没有转码这一步了）、声音从 wav 算。
// 只认版本 3：CRF1 时代的版本 1、2 不读（用户 11-06「旧的不用兼容」），当没有段签，取段签 会从切片重派生。
// 同一指纹重渲可能变（换机器、驱动都会；同机的随机来源 10-31 修掉一个，见 docs/渲染性能.md）：自查比抽样帧 sha，不一样再比块均值（阈值.toml 的 块均值容差），超了算「重渲漂移」，要对这段跑 verify。
// 签.json 最后原子写，有它就是一整套；旧的一套只挪不删，不删切片。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { segStampDir } from '../环境/作品数据.ts';
import { config } from '../环境/配置.ts';
import { workName } from '../环境/作品.ts';
import { lowPriority, runCmd } from '../环境/子进程.ts';
import { registerTempFile } from '../环境/收尾.ts';
import { atomicWrite } from '../渲/母版.ts';
import { audioStream } from './帧流.ts';
import { compareBlockMeans, readThresholds } from './比较.ts';
import { scanMaster } from './验收.ts';
import type { Signature } from './认可.ts';
import { stageTiming, type StageRecord } from '../运行记录/阶段.ts';

export const segStampVersion = 3;
export const stampFileName = '签.json';
export const soundFileName = '声音.flac';
export const historyFileName = '历史.jsonl';
export const historyDirName = '历史';
export const thumbWidth = 160;
export const thumbHeight = 90;

export type SegStamp = {
  version: 3;
  work: string;
  segment: string;
  /** 画面指纹 */
  fingerprint: string;
  /** 配的声音指纹（wav 那份）；没有声音的不写 */
  soundFingerprint?: string;
  level: string | null;
  /** 切片的样子：大小、改于对得上就当字节没变，不重算 sha */
  master: MasterSnapshot;
  /** 声音那份 wav 的样子 */
  soundSource?: MasterSnapshot;
  signature: Signature;
  /** 没有声音是 null */
  sound: { file: string; sha: string; size: number } | null;
  /** 首尾帧 160×90 灰度（base64），接缝.ts 判首帧重复用 */
  headTail: { width: number; height: number; firstFrame: string; lastFrame: string };
  derivedAt: string;
  derive: '渲染' | '回填' | '补';
  /** anim reuse 登记的：这个指纹没渲过，母版和这份段签沿用 自 那个指纹的（决策/0013）；同一指纹真渲一次就照「重渲」换掉，这套挪进 历史/ */
  reuse?: ReuseRecord;
};

/** 自：直接沿用的那个指纹；原渲：真渲出这份母版的指纹（连着认过几次也指到头）；帧：比过的帧；比法：哪种比法、哪套门槛 */
export type ReuseRecord = { reusedFrom: string; origRender: string; reason: string; frame: number[]; compareMethod: string; at: string; commit: string };

export type MasterSnapshot = { byteSha: string; size: number; modifiedAt: number };

export type SelfCheck = { verdict: '同画面' | '容差内' | '漂移'; note: string };

export const segStampPath = (segKey: string, fingerprint: string, work = workName()) => path.join(segStampDir(segKey, fingerprint, work), stampFileName);

/** 读段签；没有、版本不认识、指纹对不上都是 null */
export const readSegStamp = (segKey: string, fingerprint: string, work = workName()): SegStamp | null => {
  const f = segStampPath(segKey, fingerprint, work);
  if (!fs.existsSync(f)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8')) as SegStamp;
    return j.version === segStampVersion && j.fingerprint === fingerprint ? j : null;
  } catch {
    return null;
  }
};

export const segStampFile = (segStamp: Pick<SegStamp, 'work' | 'segment' | 'fingerprint'>, fileName: string) => path.join(segStampDir(segStamp.segment, segStamp.fingerprint, segStamp.work), fileName);
export const soundPath = (segStamp: SegStamp) => (segStamp.sound ? segStampFile(segStamp, segStamp.sound.file) : null);

export const fileSha = async (file: string) => {
  const h = crypto.createHash('sha256');
  for await (const c of fs.createReadStream(file)) h.update(c as Buffer);
  return h.digest('hex');
};

const matchesSnapshot = async (master: MasterSnapshot, file: string) => {
  if (!fs.existsSync(file)) return false;
  const st = fs.statSync(file);
  if (st.size !== master.size) return false;
  if (st.mtimeMs === master.modifiedAt) return true;
  return (await fileSha(file)) === master.byteSha;
};

/** 段签记的切片是不是这个文件：大小、改于一样就是；不一样再算字节 sha */
export const matchesMaster = (segStamp: SegStamp, master: string) => matchesSnapshot(segStamp.master, master);
/** 段签记的声音是不是这份 wav */
export const matchesSoundSource = (segStamp: SegStamp, wav: string) => (segStamp.soundSource ? matchesSnapshot(segStamp.soundSource, wav) : Promise.resolve(false));
/** 段签是这一对切片、wav 派生的（两样都对得上） */
export const matchesSlice = async (segStamp: SegStamp, pictureMp4: string, soundFile: string) => (await matchesMaster(segStamp, pictureMp4)) && (await matchesSoundSource(segStamp, soundFile));

/** 段签齐不齐：签.json 里登记的声音在 */
export const segStampComplete = (segStamp: SegStamp | null): segStamp is SegStamp => !!segStamp && (!segStamp.sound || fs.existsSync(soundPath(segStamp)!));

/** 同一指纹两份签名比：抽样帧 sha 全一样是同画面；不一样比块均值，超容差算漂移 */
export const compareSignatures = (oldSig: Signature, newSig: Signature, blockMeanTol = readThresholds().blockMeanTol): SelfCheck => {
  if (oldSig.width !== newSig.width || oldSig.height !== newSig.height || oldSig.frameCount !== newSig.frameCount) return { verdict: '漂移', note: `上次 ${oldSig.width}×${oldSig.height} ${oldSig.frameCount} 帧，这次 ${newSig.width}×${newSig.height} ${newSig.frameCount} 帧` };
  const oldByFrame = new Map(oldSig.frame.map((f) => [f.frame, f]));
  let mismatch = 0;
  let maxDiff = 0;
  for (const f of newSig.frame) {
    const o = oldByFrame.get(f.frame);
    if (o && o.hash === f.hash) continue;
    mismatch++;
    maxDiff = Math.max(maxDiff, o ? compareBlockMeans(f.blockMeans, o.blockMeans) : Infinity);
  }
  const soundNote = oldSig.audioSha === newSig.audioSha ? '声音一样' : '声音 sha 不一样';
  if (!mismatch) return { verdict: '同画面', note: `抽样帧 sha 全一样，${soundNote}` };
  return maxDiff <= blockMeanTol
    ? { verdict: '容差内', note: `${mismatch} 个抽样帧 sha 不一样，块均值最多差 ${maxDiff}（容差 ${blockMeanTol}），${soundNote}` }
    : { verdict: '漂移', note: `${mismatch} 个抽样帧 sha 不一样，块均值最多差 ${maxDiff}（容差 ${blockMeanTol}），${soundNote}` };
};

/** 重渲前的那一套挪进 历史/<字节 sha 前 16 位>/：先挪声音，签.json 最后（中途断了，留下的签.json 指的文件不齐，下次照样重派生、接着挪） */
const archiveOld = (prevStamp: SegStamp, dir: string) => {
  const historyDir = path.join(dir, historyDirName, prevStamp.master.byteSha.slice(0, 16));
  fs.mkdirSync(historyDir, { recursive: true });
  for (const fileName of [...(prevStamp.sound ? [prevStamp.sound.file] : []), stampFileName]) {
    const fromPath = path.join(dir, fileName);
    // 同一份字节的已经挪过一次（内容相同），留着那份
    if (fs.existsSync(fromPath) && !fs.existsSync(path.join(historyDir, fileName))) fs.renameSync(fromPath, path.join(historyDir, fileName));
  }
  return path.relative(dir, historyDir).split(path.sep).join('/');
};

/** 历史/ 里挪过去的各套段签和它们所在的目录（备参考找认可那一版） */
export const readSegStampHistory = (segKey: string, fingerprint: string, work = workName()): { segStamp: SegStamp; 目录: string }[] => {
  const historyDir = path.join(segStampDir(segKey, fingerprint, work), historyDirName);
  if (!fs.existsSync(historyDir)) return [];
  return fs.readdirSync(historyDir).sort().flatMap((dirName) => {
    try {
      const segStamp = JSON.parse(fs.readFileSync(path.join(historyDir, dirName, stampFileName), 'utf8')) as SegStamp;
      return segStamp.version === segStampVersion && segStamp.fingerprint === fingerprint ? [{ segStamp, 目录: path.join(historyDir, dirName) }] : [];
    } catch {
      return [];
    }
  });
};

const tempName = (dir: string, fileName: string) => {
  const ext = path.extname(fileName);
  return path.join(dir, `${path.basename(fileName, ext)}.写入中-${process.pid}${ext}`);
};

/**
 * 从切片和 wav 派生段签（只读这两样、只写段签目录）。签名用 扫母版（和 verify、accept 同一份代码），首尾帧小图在同一次解码里出；声音存 FLAC，解回来核对过才收。
 * 同一指纹已有段签、切片字节 sha 变了（重渲）：旧的记进 历史.jsonl 并自查。不过闸，调用方过
 */
export const makeSegStamp = async (pictureMp4: string, soundSource: string | null, o: { segKey: string; fingerprint: string; soundFingerprint?: string; level: string | null; derive: SegStamp['derive']; work?: string; 计时?: { 收: StageRecord[]; label: string } }): Promise<{ segStamp: SegStamp; 自查: SelfCheck | null }> => {
  const work = o.work ?? workName();
  const dir = segStampDir(o.segKey, o.fingerprint, work);
  fs.mkdirSync(dir, { recursive: true });
  const fileSnapshot = async (f: string): Promise<MasterSnapshot> => {
    const st = fs.statSync(f);
    return { byteSha: await fileSha(f), size: st.size, modifiedAt: st.mtimeMs };
  };
  const timer = o.计时 ? stageTiming(o.计时.收, o.计时.label) : () => {};
  const master = await fileSnapshot(pictureMp4);
  const soundSnapshot = soundSource ? await fileSnapshot(soundSource) : undefined;
  timer('段签：算字节');
  const ffmpeg = config('ffmpeg');
  const tempFiles: string[] = [];
  const cleanups: (() => void)[] = [];
  const trackTemp = (f: string) => {
    tempFiles.push(f);
    cleanups.push(registerTempFile(f));
  };
  try {
    const thumbFile = tempName(dir, '首尾.gray');
    trackTemp(thumbFile);
    const { signature: signature } = await scanMaster(pictureMp4, { headTailThumb: thumbFile, sound: soundSource });
    const thumbBuf = fs.readFileSync(thumbFile);
    const thumbArea = thumbWidth * thumbHeight;
    if (thumbBuf.length !== (signature.frameCount > 1 ? 2 : 1) * thumbArea) throw new Error(`${pictureMp4} 的首尾帧小图只出了 ${thumbBuf.length} 字节`);
    const headTail = { width: thumbWidth, height: thumbHeight, firstFrame: thumbBuf.subarray(0, thumbArea).toString('base64'), lastFrame: thumbBuf.subarray(thumbBuf.length - thumbArea).toString('base64') };
    timer('段签：扫切片');
    let soundRecord: SegStamp['sound'] = null;
    let soundTempFile: string | null = null;
    const audioSource = soundSource;
    if (audioSource && signature.audioSha) {
      const tmp = (soundTempFile = tempName(dir, soundFileName));
      trackTemp(tmp);
      await runCmd(lowPriority([ffmpeg, '-v', 'error', '-nostdin', '-y', '-i', audioSource, '-map', '0:a:0', '-c:a', 'flac', tmp]), { quiet: true });
      const h = crypto.createHash('sha256');
      for await (const c of audioStream(tmp)) h.update(c);
      const pcm = h.digest('hex');
      if (pcm !== signature.audioSha) throw new Error(`${audioSource} 的声音存成 FLAC 再解回来对不上（PCM sha ${pcm.slice(0, 12)}，原来 ${signature.audioSha.slice(0, 12)}）`);
      soundRecord = { file: soundFileName, sha: await fileSha(tmp), size: fs.statSync(tmp).size };
    }
    timer('段签：存声音');

    const segStamp: SegStamp = {
      version: segStampVersion, work: work, segment: o.segKey, fingerprint: o.fingerprint, ...(o.soundFingerprint ? { soundFingerprint: o.soundFingerprint } : {}), level: o.level,
      master: master, ...(soundSnapshot ? { soundSource: soundSnapshot } : {}),
      signature: signature, sound: soundRecord,
      headTail: headTail, derivedAt: new Date().toISOString(), derive: o.derive,
    };
    const prevStamp = readSegStamp(o.segKey, o.fingerprint, work);
    let check: SelfCheck | null = null;
    if (prevStamp && prevStamp.master.byteSha !== master.byteSha) {
      check = compareSignatures(prevStamp.signature, signature);
      const storedAt = archiveOld(prevStamp, dir);
      fs.appendFileSync(path.join(dir, historyFileName), JSON.stringify({ recordedAt: segStamp.derivedAt, prevByteSha: prevStamp.master.byteSha, prevDerivedAt: prevStamp.derivedAt, newByteSha: master.byteSha, ...check, storedAt: storedAt }) + '\n', 'utf8');
    }
    if (soundRecord) fs.renameSync(soundTempFile!, path.join(dir, soundFileName));
    else fs.rmSync(path.join(dir, soundFileName), { force: true });
    atomicWrite(path.join(dir, stampFileName), JSON.stringify(segStamp, null, 1) + '\n');
    timer('段签：写入');
    return { segStamp, 自查: check };
  } finally {
    for (const f of tempFiles) fs.rmSync(f, { force: true });
    for (const undo of cleanups) undo();
  }
};

/** 一段切片的段签（渲段.ts 渲完、取段签 补的时候调） */
export const deriveSegStamp = (r: { segment: { key: string }; 画面: string; sound: string; pictureFingerprint: { fingerprint: string }; soundFingerprint: { fingerprint: string }; params: { inputProps: { level: string } } }, o: { derive: SegStamp['derive']; 计时?: { 收: StageRecord[]; label: string } }) =>
  makeSegStamp(r.画面, r.sound, { segKey: r.segment.key, fingerprint: r.pictureFingerprint.fingerprint, soundFingerprint: r.soundFingerprint.fingerprint, level: r.params.inputProps.level, derive: o.derive, 计时: o.计时 });

/** 接缝一头取自段签：首尾帧小图、声音.flac 里那一帧 */
export const thumb = (segStamp: SegStamp, whichEnd: 'firstFrame' | 'lastFrame') => Buffer.from(segStamp.headTail[whichEnd], 'base64');
