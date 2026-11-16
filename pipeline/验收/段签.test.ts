// 段签：从 ffmpeg 现造的小切片（有损 x264 mp4，和真切片一样有编码噪声）和 wav 派生，查签名和 verify 逐位相同、FLAC 无损、版本 3 记两份样子、
// 首尾小图和 灰度帧 一样、版本 1、2 不认、重渲自查（旧的一套挪进 历史/）、取段签 缺了才派生；
// 扫段签 和 扫母版 结论一样；认可参考（accept 时从认可那版的切片抽、旁记核 yuv；没有旁记的老参考不用）。数据根是临时目录，不碰真数据。
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-段签测试-'));
process.env.ANIM_DATA = dataRoot;

const { config } = await import('../环境/配置.ts');
const { masterDir } = await import('../环境/作品数据.ts');
const { runCapture } = await import('../环境/子进程.ts');
const { grayFrame } = await import('../合成/接缝.ts');
const { makeSegStamp, readSegStamp, readSegStampHistory, segStampComplete, matchesSlice, soundPath, thumb, segStampFile, historyFileName, fileSha } = await import('./段签.ts');
const { fetchSegStamp, sameFingerprintRerender } = await import('./取段签.ts');
const { scanMaster, scanSegStamp, masterPixels, NoSignatureError: noSignatureError, MissingMasterError: missingMasterError, RefMismatchError: refMismatchError } = await import('./验收.ts');
const { sampledStream, audioStream, sha } = await import('./帧流.ts');
const { prepareRef, findApprovedMaster, referenceFile } = await import('./参考.ts');
const { refPixels, sideNoteFile, readSidecar } = await import('./参考像素.ts');
const { segPicturePath, segSoundPath } = await import('../渲/段产物.ts');
const { sameVersion } = await import('./认可.ts');
type ApprovalRecord = import('./认可.ts').ApprovalRecord;

const threshold = { 块8门槛: 24, 块16门槛: 10, 块64门槛: 4, 看一眼门槛: 6, 块均值容差: 1, 响度容差LU: 0.5, 起音容差帧: 1 };
const sampleDir = path.join(dataRoot, '样例');

/** 2 秒 48 帧、64×36 的切片（不带声音，和真切片一样），视频滤镜改画面 */
const makeVideo = (fileName: string, videoFilter = 'null') => {
  const f = path.join(sampleDir, fileName);
  runCapture([
    config('ffmpeg'), '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=64x36:rate=24:duration=2',
    '-vf', videoFilter, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-an', f,
  ]);
  return f;
};
/** 声音比画面长一截且样本数不是整帧（FLAC 要原样保住） */
const makeTone = (fileName: string, frequency = 440) => {
  const f = path.join(sampleDir, fileName);
  runCapture([config('ffmpeg'), '-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=${frequency}:duration=2.1234:sample_rate=48000`, '-c:a', 'pcm_s16le', '-ac', '2', f]);
  return f;
};
const pcm = async (f: string) => {
  const h = crypto.createHash('sha256');
  for await (const c of audioStream(f)) h.update(c);
  return h.digest('hex');
};
const fingerprintOf = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const segStampPath = (segStamp: { 作品: string; 段: string; 指纹: string }) => segStampFile(segStamp, '签.json');
const collectChunks = async (g: AsyncGenerator<Buffer>) => {
  const chunks: Buffer[] = [];
  for await (const b of g) chunks.push(Buffer.from(b));
  return chunks;
};

let originalVideo = '';
let secondHalfChanged = '';
let soundFile = '';
beforeAll(() => {
  fs.mkdirSync(sampleDir, { recursive: true });
  originalVideo = makeVideo('原.mp4');
  secondHalfChanged = makeVideo('后半变.mp4', "drawbox=x=0:y=0:w=32:h=18:color=red:t=fill:enable='gte(n,30)'");
  soundFile = makeTone('声.wav');
});
afterAll(() => fs.rmSync(dataRoot, { recursive: true, force: true }));

const makeApproval = async (pictureMp4: string, seed: string, segKey = '核对-段签'): Promise<ApprovalRecord> => ({
  段: segKey, 指纹: seed, 平台: 'test', 渲染级别: '视频', 认可于: '2026-10-30T00:00:00Z', 提交: 'abc', 理由: '测试', 上一版指纹: null,
  ...(await scanMaster(pictureMp4, { 声音: soundFile })).签名,
});

/** 取段签 要的那一段：切片、wav 放在数据根这个段、这个指纹的位置 */
const makeSeg = (segKey: string, seed: string) => {
  const soundSeed = fingerprintOf(`${seed}-声`);
  return { 段: { 键: segKey }, 画面: segPicturePath(segKey, seed), 声音: segSoundPath(segKey, soundSeed), 画面指纹: { 指纹: seed }, 声音指纹: { 指纹: soundSeed }, 参数: { inputProps: { 级别: '视频' } } };
};

/** 在数据根放一份这个段、这个指纹的切片和 wav，派生段签 */
const placeSlice = async (segKey: string, seed: string, sourcePath: string) => {
  const r = makeSeg(segKey, seed);
  fs.mkdirSync(path.dirname(r.画面), { recursive: true });
  fs.copyFileSync(sourcePath, r.画面);
  fs.copyFileSync(soundFile, r.声音);
  const segStamp = (await makeSegStamp(r.画面, r.声音, { segKey: segKey, 指纹: seed, 声音指纹: r.声音指纹.指纹, 级别: '视频', 派生: '渲染' })).segStamp;
  return { ...r, segStamp };
};

describe('段签', () => {
  it('签名和 verify（扫母版）算的逐位相同；声音从 wav 算、FLAC 解回来 PCM 一样；版本 3 记切片和 wav 的样子；首尾小图和切片的一样', async () => {
    const fp = fingerprintOf('原');
    const { segStamp, 自查: selfCheck } = await makeSegStamp(originalVideo, soundFile, { segKey: '核对-段签', 指纹: fp, 声音指纹: fingerprintOf('原声'), 级别: '视频', 派生: '渲染' });
    expect(selfCheck).toBeNull();
    expect(segStamp.版本).toBe(3);
    expect(segStamp.声音指纹).toBe(fingerprintOf('原声'));
    expect(segStamp.声音源!.字节sha).toBe(await fileSha(soundFile));
    expect(segStamp.签名).toEqual((await scanMaster(originalVideo, { 声音: soundFile })).签名);
    expect(readSegStamp('核对-段签', fp)).toEqual(segStamp);
    expect(segStampComplete(segStamp)).toBe(true);
    expect(await matchesSlice(segStamp, originalVideo, soundFile)).toBe(true);
    expect(await matchesSlice(segStamp, originalVideo, makeTone('别的声.wav', 880))).toBe(false);
    expect(await pcm(soundPath(segStamp)!)).toBe(await pcm(soundFile));
    expect(await pcm(soundPath(segStamp)!)).toBe(segStamp.签名.音频sha);
    expect(segStamp.签名.帧.map((f) => f.帧)).toEqual([0, 24, 47]);
    expect(thumb(segStamp, '首帧').equals(grayFrame(originalVideo, 0))).toBe(true);
    expect(thumb(segStamp, '末帧').equals(grayFrame(originalVideo, 47))).toBe(true);
    expect(fs.readdirSync(path.dirname(segStampPath(segStamp))).sort()).toEqual(['声音.flac', '签.json']);
  });

  it('一帧、没声音的切片：首尾小图是同一帧，声音 null', async () => {
    const singleFramePath = path.join(sampleDir, '一帧.mp4');
    runCapture([config('ffmpeg'), '-v', 'error', '-y', '-i', originalVideo, '-frames:v', '1', '-an', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', singleFramePath]);
    const { segStamp } = await makeSegStamp(singleFramePath, null, { segKey: '核对-一帧', 指纹: fingerprintOf('一帧'), 级别: '静帧', 派生: '回填' });
    expect(thumb(segStamp, '首帧').equals(grayFrame(singleFramePath, 0))).toBe(true);
    expect(thumb(segStamp, '末帧').equals(thumb(segStamp, '首帧'))).toBe(true);
    expect(segStamp.声音).toBeNull();
  });

  it('版本 1、2（CRF1 时代）的段签不认：当没有', async () => {
    const fp = fingerprintOf('版本一');
    const copyPath = path.join(sampleDir, '版本一.mp4');
    fs.copyFileSync(originalVideo, copyPath);
    const segStamp = (await makeSegStamp(copyPath, soundFile, { segKey: '核对-版本一', 指纹: fp, 级别: '视频', 派生: '渲染' })).segStamp;
    for (const formatVersion of [1, 2]) {
      fs.writeFileSync(segStampPath(segStamp), JSON.stringify({ ...segStamp, 版本: formatVersion }));
      expect(readSegStamp('核对-版本一', fp)).toBeNull();
    }
  });

  it('同一指纹重渲：画面一样字节不一样是同画面，画面变了是漂移；都记进 历史.jsonl', async () => {
    const fp = fingerprintOf('重渲');
    const copyPath = path.join(sampleDir, '重渲.mp4');
    fs.copyFileSync(originalVideo, copyPath);
    await makeSegStamp(copyPath, soundFile, { segKey: '核对-重渲', 指纹: fp, 级别: '视频', 派生: '渲染' });
    // 只改容器元数据：字节变了、画面逐位一样
    runCapture([config('ffmpeg'), '-v', 'error', '-y', '-i', originalVideo, '-c', 'copy', '-metadata', 'comment=重渲', copyPath]);
    const a = await makeSegStamp(copyPath, soundFile, { segKey: '核对-重渲', 指纹: fp, 级别: '视频', 派生: '渲染' });
    expect(a.自查!.结论).toBe('同画面');
    fs.copyFileSync(secondHalfChanged, copyPath);
    const b = await makeSegStamp(copyPath, soundFile, { segKey: '核对-重渲', 指纹: fp, 级别: '视频', 派生: '渲染' });
    expect(b.自查!.结论).toBe('漂移');
    const historyLines = fs.readFileSync(segStampFile(b.segStamp, historyFileName), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(historyLines.map((x) => x.结论)).toEqual([a.自查!.结论, '漂移']);
    // 重渲前的两套原样挪进 历史/，现在的是后半变那份
    const history = readSegStampHistory('核对-重渲', fp);
    expect(history.map((h) => h.segStamp.母版.字节sha).sort()).toEqual([historyLines[0].上次字节sha, historyLines[1].上次字节sha].sort());
    for (const h of history) expect(fs.readdirSync(h.目录).sort()).toEqual(['声音.flac', '签.json']);
    expect(historyLines.map((x) => x.存于)).toEqual(historyLines.map((x) => `历史/${x.上次字节sha.slice(0, 16)}`));
    expect(readSegStamp('核对-重渲', fp)!.母版.字节sha).toBe(await fileSha(copyPath));
  });

  it('取段签：缺了从切片和 wav 派生（过一次放行）、对得上就直接用；切片没了用齐全的段签；都没有 null', async () => {
    const fp = fingerprintOf('取');
    const r = makeSeg('核对-取', fp);
    fs.mkdirSync(path.dirname(r.画面), { recursive: true });
    fs.copyFileSync(originalVideo, r.画面);
    fs.copyFileSync(soundFile, r.声音);
    let letThroughCount = 0;
    const waitGate = async () => void letThroughCount++;
    const segStamp = (await fetchSegStamp(r, { waitGate }))!;
    expect(letThroughCount).toBe(1);
    expect(segStamp).toMatchObject({ 版本: 3, 派生: '补', 声音指纹: r.声音指纹.指纹 });
    expect(await fetchSegStamp(r, { waitGate })).toEqual(segStamp);
    expect(letThroughCount).toBe(1);
    fs.rmSync(r.画面);
    expect(await fetchSegStamp(r, { waitGate })).toEqual(segStamp);
    fs.rmSync(segStampPath(segStamp));
    expect(await fetchSegStamp(r, { waitGate })).toBeNull();
    expect(letThroughCount).toBe(1);
  });
});

describe('扫段签：和 扫母版 结论一样', () => {
  const verdictOf = (r: Awaited<ReturnType<typeof scanMaster>>) => ({ 帧: r.frameVerdicts, 音频: [r.audioVerdict, r.audioNote], 尺寸: r.sizeChanged, 比法: r.比法 });

  it('认可那版切片在（块差）、不在（块均值）都和 扫母版 一样；要看像素、段签记的切片不在抛 缺母版', async () => {
    const approval = await makeApproval(originalVideo, fingerprintOf('认可原'));
    const segStamp = (await makeSegStamp(secondHalfChanged, soundFile, { segKey: '核对-后半变', 指纹: fingerprintOf('后半变'), 级别: '视频', 派生: '回填' })).segStamp;
    const scanSource = { 签名: segStamp.签名, 母版: secondHalfChanged };
    const masterDiffScan = await scanMaster(secondHalfChanged, { approval: approval, oldMaster: originalVideo, 阈值: threshold, 声音: soundFile });
    expect(masterDiffScan.比法).toBe('块差');
    expect(masterDiffScan.frameVerdicts.map((f) => f.结论)).toEqual(['一样', '容差内', '变了']); // 第 24 帧没改，有损编码的噪声在容差内
    expect(verdictOf(await scanSegStamp(scanSource, { approval: approval, oldMaster: originalVideo, 阈值: threshold }))).toEqual(verdictOf(masterDiffScan));
    const masterMeanScan = await scanMaster(secondHalfChanged, { approval: approval, oldMaster: null, 阈值: threshold, 声音: soundFile });
    expect(masterMeanScan.比法).toBe('块均值');
    // 只比块均值、不出预览：不用解切片
    expect(verdictOf(await scanSegStamp({ ...scanSource, 母版: null }, { approval: approval, oldMaster: null, 阈值: threshold }))).toEqual(verdictOf(masterMeanScan));
    await expect(scanSegStamp({ ...scanSource, 母版: null }, { approval: approval, oldMaster: originalVideo, 阈值: threshold })).rejects.toBeInstanceOf(missingMasterError);
    // 哈希都一样就不要像素，切片不在也行
    expect((await scanSegStamp({ 签名: approval, 母版: null }, { approval: approval, oldMaster: originalVideo, 阈值: threshold })).frameVerdicts.every((f) => f.结论 === '一样')).toBe(true);
  });

  it('认可记录的抽样间隔不一样：段签的签名里没有要的帧，抛 签名里没有（verify 退回解切片）', async () => {
    const approval = { ...(await makeApproval(originalVideo, fingerprintOf('间隔12'))), 间隔: 12 };
    const segStamp = readSegStamp('核对-后半变', fingerprintOf('后半变'))!;
    await expect(scanSegStamp({ 签名: segStamp.签名, 母版: secondHalfChanged }, { approval: approval, 阈值: threshold })).rejects.toBeInstanceOf(noSignatureError);
  });
});

describe('认可参考', () => {
  it('accept 时从认可那版的切片抽：旁记记各帧 yuv sha；像素和切片解出来的一样；verify 用它比、和 扫母版 一样', async () => {
    const fp = fingerprintOf('参考');
    const { 画面: pictureMp4 } = await placeSlice('核对-参考', fp, originalVideo);
    const approval = await makeApproval(originalVideo, fp, '核对-参考');
    expect(await findApprovedMaster(approval)).toEqual({ 文件: pictureMp4, 字节sha: await fileSha(pictureMp4) });
    expect(await prepareRef(approval, 'test')).toBe('从切片');
    expect(await prepareRef(approval, 'test')).toBe('已有');
    const refFile = referenceFile(approval, 'test');
    const sideNote = readSidecar(refFile)!;
    expect(sideNote).toMatchObject({ 帧: [0, 24, 47], 来源: '切片', 母版字节sha: await fileSha(pictureMp4) });
    expect(fs.readdirSync(path.dirname(refFile)).filter((n) => n.includes('写入中'))).toEqual([]);
    const refFrames = await collectChunks(refPixels(refFile, approval, [0, 24, 47]));
    const slicedFrames = await collectChunks(masterPixels(pictureMp4, [0, 24, 47], 64, 36));
    refFrames.forEach((b, i) => expect(b.equals(slicedFrames[i]!)).toBe(true));
    // 抽样流只交要的帧；要没存的帧就报错
    expect((await collectChunks(sampledStream(refFile, sideNote.帧, [24], 64, 36, 'yuv420p'))).map(sha)).toEqual([sideNote.yuv[1]]);
    await expect(collectChunks(sampledStream(refFile, sideNote.帧, [12], 64, 36, 'yuv420p'))).rejects.toThrow(/没有原片第 12 帧/);

    const scanSource = { 签名: (await scanMaster(secondHalfChanged, { 声音: soundFile })).签名, 母版: secondHalfChanged };
    const segRefScan = await scanSegStamp(scanSource, { approval: approval, oldMaster: null, 参考: refFile, 阈值: threshold });
    expect(segRefScan.pixelSource).toBe('认可参考');
    expect(segRefScan.frameVerdicts.map((f) => f.结论)).toEqual(['一样', '容差内', '变了']);
    const masterRefScan = await scanMaster(secondHalfChanged, { approval: approval, oldMaster: null, 参考: refFile, 阈值: threshold, 声音: soundFile });
    expect(segRefScan.frameVerdicts).toEqual(masterRefScan.frameVerdicts);

    // 旁记的 yuv 哈希对不上（参考坏了）：抛 参考对不上
    const fileText = fs.readFileSync(sideNoteFile(refFile), 'utf8');
    fs.writeFileSync(sideNoteFile(refFile), JSON.stringify({ ...sideNote, yuv: sideNote.yuv.map((h, i) => (i === 1 ? '0'.repeat(64) : h)) }));
    await expect(scanSegStamp(scanSource, { approval: approval, 参考: refFile, 阈值: threshold })).rejects.toBeInstanceOf(refMismatchError);
    fs.writeFileSync(sideNoteFile(refFile), fileText);
  });

  it('没有旁记的老参考不用（抛 参考对不上）；记录对不上的不收、不留文件', async () => {
    const fp = fingerprintOf('参考一');
    const { 画面: pictureMp4 } = await placeSlice('核对-参考一', fp, originalVideo);
    const approval = await makeApproval(pictureMp4, fp, '核对-参考一');
    expect((await findApprovedMaster(approval))).toMatchObject({ 文件: pictureMp4 });
    expect(await prepareRef(approval, 'test')).toBe('从切片');
    const refFile = referenceFile(approval, 'test');
    fs.rmSync(sideNoteFile(refFile));
    const scanSource = { 签名: (await scanMaster(secondHalfChanged, { 声音: soundFile })).签名, 母版: secondHalfChanged };
    await expect(scanSegStamp(scanSource, { approval: approval, 参考: refFile, 阈值: threshold })).rejects.toBeInstanceOf(refMismatchError);

    const tampered = { ...approval, 帧: approval.帧.map((f, i) => (i === 1 ? { ...f, 哈希: '0'.repeat(64) } : f)) };
    expect(await prepareRef(tampered, 'test')).toBe('没有来源'); // 段签和它不是同一版
    expect(fs.existsSync(referenceFile(tampered, 'test'))).toBe(false);
    expect(await prepareRef({ ...approval, 指纹: fingerprintOf('都不在') }, 'test')).toBe('没有来源');
    expect(fs.readdirSync(path.dirname(refFile)).filter((n) => n.includes('写入中'))).toEqual([]);
  });

  it('同一指纹重渲后再认可：新记录对应新参考文件（不拿旧参考冒充）；重渲前没备的旧认可备不上了；参考和记录配错抛 参考对不上', async () => {
    const fp = fingerprintOf('再认可');
    const { 画面: pictureMp4, 声音: soundFile } = await placeSlice('核对-再认可', fp, originalVideo);
    const firstApproval = await makeApproval(pictureMp4, fp, '核对-再认可');
    expect(await prepareRef(firstApproval, 'test')).toBe('从切片'); // accept 时就备好
    // 同一指纹重渲成后半变（字节、画面都变），再认可
    fs.copyFileSync(secondHalfChanged, pictureMp4);
    const segStamp = (await makeSegStamp(pictureMp4, soundFile, { segKey: '核对-再认可', 指纹: fp, 级别: '视频', 派生: '渲染' })).segStamp;
    const secondApproval = { ...firstApproval, ...segStamp.签名 };
    expect(sameVersion(segStamp.签名, firstApproval)).toBe(false);
    expect(sameVersion(segStamp.签名, secondApproval)).toBe(true);
    // verify 同一指纹：段签和认可记录不一样要真比（漂移提示让跑 verify，不能直接打 ✓）；一样就不比；切片又换了字节、段签没跟上也要比
    expect(sameFingerprintRerender(segStamp, firstApproval, pictureMp4)).toBe('段签的签名和认可记录不一样');
    expect(sameFingerprintRerender(segStamp, secondApproval, pictureMp4)).toBeNull();
    expect(sameFingerprintRerender(null, firstApproval, pictureMp4)).toBeNull();
    const t = new Date(Date.now() + 5000);
    fs.utimesSync(pictureMp4, t, t);
    expect(sameFingerprintRerender(segStamp, secondApproval, pictureMp4)).toBe('切片和段签记的不是同一份');
    fs.utimesSync(pictureMp4, new Date(segStamp.母版.改于), new Date(segStamp.母版.改于));
    expect(await prepareRef(secondApproval, 'test')).toBe('从切片');
    expect(referenceFile(secondApproval, 'test')).not.toBe(referenceFile(firstApproval, 'test'));
    expect(await prepareRef(firstApproval, 'test')).toBe('已有');
    const scanSource = { 签名: segStamp.签名, 母版: pictureMp4 };
    const comparedToFirst = await scanSegStamp(scanSource, { approval: firstApproval, oldMaster: null, 参考: referenceFile(firstApproval, 'test'), 阈值: threshold });
    expect(comparedToFirst.pixelSource).toBe('认可参考');
    expect(comparedToFirst.frameVerdicts.map((f) => f.结论)).toEqual(['一样', '容差内', '变了']);
    const comparedToSecond = await scanSegStamp(scanSource, { approval: secondApproval, oldMaster: null, 参考: referenceFile(secondApproval, 'test'), 阈值: threshold });
    expect(comparedToSecond.frameVerdicts.every((f) => f.结论 === '一样')).toBe(true);
    // 参考和记录配错（以前同名时就会这样）：旁记记的不是这条记录，抛 参考对不上，verify 只记这一段不过
    await expect(scanSegStamp(scanSource, { approval: firstApproval, oldMaster: null, 参考: referenceFile(secondApproval, 'test'), 阈值: threshold })).rejects.toBeInstanceOf(refMismatchError);
    // 认一那版的段签挪进了 历史/，切片却已是后半变：重渲前没备参考就备不上了（verify 退回块均值）
    fs.rmSync(referenceFile(firstApproval, 'test'));
    expect(await prepareRef(firstApproval, 'test')).toBe('没有来源');
  });
});
