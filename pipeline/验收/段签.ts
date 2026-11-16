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
  版本: 3;
  作品: string;
  段: string;
  /** 画面指纹 */
  指纹: string;
  /** 配的声音指纹（wav 那份）；没有声音的不写 */
  声音指纹?: string;
  级别: string | null;
  /** 切片的样子：大小、改于对得上就当字节没变，不重算 sha */
  母版: MasterSnapshot;
  /** 声音那份 wav 的样子 */
  声音源?: MasterSnapshot;
  签名: Signature;
  /** 没有声音是 null */
  声音: { 文件: string; sha: string; 大小: number } | null;
  /** 首尾帧 160×90 灰度（base64），接缝.ts 判首帧重复用 */
  首尾: { 宽: number; 高: number; 首帧: string; 末帧: string };
  派生于: string;
  派生: '渲染' | '回填' | '补';
  /** anim reuse 登记的：这个指纹没渲过，母版和这份段签沿用 自 那个指纹的（决策/0013）；同一指纹真渲一次就照「重渲」换掉，这套挪进 历史/ */
  沿用?: ReuseRecord;
};

/** 自：直接沿用的那个指纹；原渲：真渲出这份母版的指纹（连着认过几次也指到头）；帧：比过的帧；比法：哪种比法、哪套门槛 */
export type ReuseRecord = { 自: string; 原渲: string; 理由: string; 帧: number[]; 比法: string; 于: string; 提交: string };

export type MasterSnapshot = { 字节sha: string; 大小: number; 改于: number };

export type SelfCheck = { 结论: '同画面' | '容差内' | '漂移'; 说明: string };

export const segStampPath = (segKey: string, fingerprint: string, work = workName()) => path.join(segStampDir(segKey, fingerprint, work), stampFileName);

/** 读段签；没有、版本不认识、指纹对不上都是 null */
export const readSegStamp = (segKey: string, fingerprint: string, work = workName()): SegStamp | null => {
  const f = segStampPath(segKey, fingerprint, work);
  if (!fs.existsSync(f)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8')) as SegStamp;
    return j.版本 === segStampVersion && j.指纹 === fingerprint ? j : null;
  } catch {
    return null;
  }
};

export const segStampFile = (segStamp: Pick<SegStamp, '作品' | '段' | '指纹'>, fileName: string) => path.join(segStampDir(segStamp.段, segStamp.指纹, segStamp.作品), fileName);
export const soundPath = (segStamp: SegStamp) => (segStamp.声音 ? segStampFile(segStamp, segStamp.声音.文件) : null);

export const fileSha = async (file: string) => {
  const h = crypto.createHash('sha256');
  for await (const c of fs.createReadStream(file)) h.update(c as Buffer);
  return h.digest('hex');
};

const matchesSnapshot = async (master: MasterSnapshot, file: string) => {
  if (!fs.existsSync(file)) return false;
  const st = fs.statSync(file);
  if (st.size !== master.大小) return false;
  if (st.mtimeMs === master.改于) return true;
  return (await fileSha(file)) === master.字节sha;
};

/** 段签记的切片是不是这个文件：大小、改于一样就是；不一样再算字节 sha */
export const matchesMaster = (segStamp: SegStamp, master: string) => matchesSnapshot(segStamp.母版, master);
/** 段签记的声音是不是这份 wav */
export const matchesSoundSource = (segStamp: SegStamp, wav: string) => (segStamp.声音源 ? matchesSnapshot(segStamp.声音源, wav) : Promise.resolve(false));
/** 段签是这一对切片、wav 派生的（两样都对得上） */
export const matchesSlice = async (segStamp: SegStamp, pictureMp4: string, soundFile: string) => (await matchesMaster(segStamp, pictureMp4)) && (await matchesSoundSource(segStamp, soundFile));

/** 段签齐不齐：签.json 里登记的声音在 */
export const segStampComplete = (segStamp: SegStamp | null): segStamp is SegStamp => !!segStamp && (!segStamp.声音 || fs.existsSync(soundPath(segStamp)!));

/** 同一指纹两份签名比：抽样帧 sha 全一样是同画面；不一样比块均值，超容差算漂移 */
export const compareSignatures = (oldSig: Signature, newSig: Signature, blockMeanTol = readThresholds().块均值容差): SelfCheck => {
  if (oldSig.宽 !== newSig.宽 || oldSig.高 !== newSig.高 || oldSig.帧数 !== newSig.帧数) return { 结论: '漂移', 说明: `上次 ${oldSig.宽}×${oldSig.高} ${oldSig.帧数} 帧，这次 ${newSig.宽}×${newSig.高} ${newSig.帧数} 帧` };
  const oldByFrame = new Map(oldSig.帧.map((f) => [f.帧, f]));
  let mismatch = 0;
  let maxDiff = 0;
  for (const f of newSig.帧) {
    const o = oldByFrame.get(f.帧);
    if (o && o.哈希 === f.哈希) continue;
    mismatch++;
    maxDiff = Math.max(maxDiff, o ? compareBlockMeans(f.块均值, o.块均值) : Infinity);
  }
  const soundNote = oldSig.音频sha === newSig.音频sha ? '声音一样' : '声音 sha 不一样';
  if (!mismatch) return { 结论: '同画面', 说明: `抽样帧 sha 全一样，${soundNote}` };
  return maxDiff <= blockMeanTol
    ? { 结论: '容差内', 说明: `${mismatch} 个抽样帧 sha 不一样，块均值最多差 ${maxDiff}（容差 ${blockMeanTol}），${soundNote}` }
    : { 结论: '漂移', 说明: `${mismatch} 个抽样帧 sha 不一样，块均值最多差 ${maxDiff}（容差 ${blockMeanTol}），${soundNote}` };
};

/** 重渲前的那一套挪进 历史/<字节 sha 前 16 位>/：先挪声音，签.json 最后（中途断了，留下的签.json 指的文件不齐，下次照样重派生、接着挪） */
const archiveOld = (prevStamp: SegStamp, dir: string) => {
  const historyDir = path.join(dir, historyDirName, prevStamp.母版.字节sha.slice(0, 16));
  fs.mkdirSync(historyDir, { recursive: true });
  for (const fileName of [...(prevStamp.声音 ? [prevStamp.声音.文件] : []), stampFileName]) {
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
      return segStamp.版本 === segStampVersion && segStamp.指纹 === fingerprint ? [{ segStamp, 目录: path.join(historyDir, dirName) }] : [];
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
export const makeSegStamp = async (pictureMp4: string, soundSource: string | null, o: { segKey: string; 指纹: string; 声音指纹?: string; 级别: string | null; 派生: SegStamp['派生']; 作品?: string; 计时?: { 收: StageRecord[]; 标签: string } }): Promise<{ segStamp: SegStamp; 自查: SelfCheck | null }> => {
  const work = o.作品 ?? workName();
  const dir = segStampDir(o.segKey, o.指纹, work);
  fs.mkdirSync(dir, { recursive: true });
  const fileSnapshot = async (f: string): Promise<MasterSnapshot> => {
    const st = fs.statSync(f);
    return { 字节sha: await fileSha(f), 大小: st.size, 改于: st.mtimeMs };
  };
  const timer = o.计时 ? stageTiming(o.计时.收, o.计时.标签) : () => {};
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
    const { 签名: signature } = await scanMaster(pictureMp4, { headTailThumb: thumbFile, 声音: soundSource });
    const thumbBuf = fs.readFileSync(thumbFile);
    const thumbArea = thumbWidth * thumbHeight;
    if (thumbBuf.length !== (signature.帧数 > 1 ? 2 : 1) * thumbArea) throw new Error(`${pictureMp4} 的首尾帧小图只出了 ${thumbBuf.length} 字节`);
    const headTail = { 宽: thumbWidth, 高: thumbHeight, 首帧: thumbBuf.subarray(0, thumbArea).toString('base64'), 末帧: thumbBuf.subarray(thumbBuf.length - thumbArea).toString('base64') };
    timer('段签：扫切片');
    let soundRecord: SegStamp['声音'] = null;
    let soundTempFile: string | null = null;
    const audioSource = soundSource;
    if (audioSource && signature.音频sha) {
      const tmp = (soundTempFile = tempName(dir, soundFileName));
      trackTemp(tmp);
      await runCmd(lowPriority([ffmpeg, '-v', 'error', '-nostdin', '-y', '-i', audioSource, '-map', '0:a:0', '-c:a', 'flac', tmp]), { quiet: true });
      const h = crypto.createHash('sha256');
      for await (const c of audioStream(tmp)) h.update(c);
      const pcm = h.digest('hex');
      if (pcm !== signature.音频sha) throw new Error(`${audioSource} 的声音存成 FLAC 再解回来对不上（PCM sha ${pcm.slice(0, 12)}，原来 ${signature.音频sha.slice(0, 12)}）`);
      soundRecord = { 文件: soundFileName, sha: await fileSha(tmp), 大小: fs.statSync(tmp).size };
    }
    timer('段签：存声音');

    const segStamp: SegStamp = {
      版本: segStampVersion, 作品: work, 段: o.segKey, 指纹: o.指纹, ...(o.声音指纹 ? { 声音指纹: o.声音指纹 } : {}), 级别: o.级别,
      母版: master, ...(soundSnapshot ? { 声音源: soundSnapshot } : {}),
      签名: signature, 声音: soundRecord,
      首尾: headTail, 派生于: new Date().toISOString(), 派生: o.派生,
    };
    const prevStamp = readSegStamp(o.segKey, o.指纹, work);
    let check: SelfCheck | null = null;
    if (prevStamp && prevStamp.母版.字节sha !== master.字节sha) {
      check = compareSignatures(prevStamp.签名, signature);
      const storedAt = archiveOld(prevStamp, dir);
      fs.appendFileSync(path.join(dir, historyFileName), JSON.stringify({ 记于: segStamp.派生于, 上次字节sha: prevStamp.母版.字节sha, 上次派生于: prevStamp.派生于, 这次字节sha: master.字节sha, ...check, 存于: storedAt }) + '\n', 'utf8');
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
export const deriveSegStamp = (r: { 段: { 键: string }; 画面: string; 声音: string; 画面指纹: { 指纹: string }; 声音指纹: { 指纹: string }; 参数: { inputProps: { 级别: string } } }, o: { 派生: SegStamp['派生']; 计时?: { 收: StageRecord[]; 标签: string } }) =>
  makeSegStamp(r.画面, r.声音, { segKey: r.段.键, 指纹: r.画面指纹.指纹, 声音指纹: r.声音指纹.指纹, 级别: r.参数.inputProps.级别, 派生: o.派生, 计时: o.计时 });

/** 接缝一头取自段签：首尾帧小图、声音.flac 里那一帧 */
export const thumb = (segStamp: SegStamp, whichEnd: '首帧' | '末帧') => Buffer.from(segStamp.首尾[whichEnd], 'base64');
