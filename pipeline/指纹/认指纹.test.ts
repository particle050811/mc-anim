// 认指纹：抽哪几帧、哪些差异静帧证明不了、一帧怎么比（新 PNG 和有损压缩的切片：画面一样在噪声内，改了一块判不同）、
// 找旧版、登记沿用（克隆切片和 wav、照抄段签记 沿用；旧指纹的东西删了新指纹照用；cache gc 扫到的是这个指纹自己的切片）。
// 切片用 Remotion 自带的 ffmpeg 照真切片一样压（PNG 帧 → bt709 zscale → x264），放在临时数据根里，不碰真数据，不开浏览器。
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-认指纹测试-'));
process.env.ANIM_DATA = dataRoot;

const { config } = await import('../环境/配置.ts');
const { runCapture, runCaptureBytes } = await import('../环境/子进程.ts');
const { readSegStamp, segStampComplete, matchesMaster, matchesSlice } = await import('../段签/段签.ts');
const { writeFingerprint, fingerprintHistory } = await import('../渲/母版.ts');
const { segPicturePath, segSoundPath, pairedSoundFingerprint } = await import('../渲/段产物.ts');
const { runBundledFfmpeg } = await import('../渲/自带ffmpeg.ts');
const { scanKey } = await import('../缓存/钉.ts');
const { pickFrames, stillCannotProve, compareFrame, frameToYuv, sliceToYuvFilter, findOldVersion, registerReuse, hasNewFingerprint, readOldFrames, cloneFile } = await import('./认指纹.ts');
type SegFingerprint = import('./指纹.ts').SegFingerprint;
type FingerprintItem = import('./指纹.ts').FingerprintItem;

const work = '测试作品';
const segKey = '核对-认指纹';
const threshold = { 块8门槛: 24, 块16门槛: 10, 块64门槛: 4, 看一眼门槛: 6 };
const widthPx = 128;
const height = 72;
const sampleDir = path.join(dataRoot, '样例');
const fingerprintOf = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const letThrough = async () => {};

const makeFingerprintItems = (o: Partial<FingerprintItem> = {}): FingerprintItem => ({
  代码: { 画面根: 'a', 段根: 'b', 设置根: 'c', 外壳根: 'd' },
  地形: {},
  渲染设置: { inputProps: { 级别: '视频', 输出fps: 60 }, codec: 'h264', crf: 18, scale: 3, gl: 'angle', muted: false, audioCodec: 'pcm-16', 秒: 0.8, 宽: 64, 高: 36 },
  依赖版本: { three: '0.186.1' },
  打包规则: { tsconfig: 't', 'pipeline/资产/webpack.ts': 'w', 'pipeline/资产/ogg解码.cjs': 'o' },
  平台: 'darwin-arm64',
  ...o,
});
const segmentFingerprint = (artifactName: string, code = artifactName): SegFingerprint => ({ 段: segKey, 指纹: fingerprintOf(artifactName), 算法: 'merkle-v1', 项: makeFingerprintItems({ 代码: { 画面根: code, 段根: 'b', 设置根: 'c', 外壳根: 'd' } }), 明细: { 模块: {}, 资产: {} } });
/** 和 段产物 一样：声音和画面同一遍出，声音指纹就是画面指纹 */
const makeArtifact = (artifactName: string) => {
  const pictureFingerprint = segmentFingerprint(artifactName);
  const soundFingerprint = pairedSoundFingerprint(pictureFingerprint)!;
  return { 画面指纹: pictureFingerprint, 声音指纹: pictureFingerprint, 画面: segPicturePath(segKey, pictureFingerprint.指纹, work), 声音: segSoundPath(segKey, soundFingerprint, work) };
};

/** 源画面（无损 PNG 流）；单帧取第 n 帧，改 就在左上画一块红 */
const sourcePng = (n: number | null, drawBox = false) =>
  runCaptureBytes([
    config('ffmpeg'), '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${widthPx}x${height}:rate=24:duration=2`,
    ...(n === null ? [] : ['-vf', `select=eq(n\\,${n})${drawBox ? ',drawbox=x=0:y=0:w=24:h=24:color=red:t=fill' : ''}`, '-frames:v', '1']), '-f', 'image2pipe', '-c:v', 'png', '-',
  ]);

/** 和真切片一样：PNG 帧经 Remotion 的 ffmpeg、bt709 zscale、x264 CRF18 压成 mp4；配一份 wav；写 .指纹.json（不派生段签，找旧版 会补） */
const placeOldVersion = async (artifactName: string) => {
  const r = makeArtifact(artifactName);
  fs.mkdirSync(path.dirname(r.画面), { recursive: true });
  await runBundledFfmpeg(['-v', 'error', '-y', '-r', '24', '-f', 'image2pipe', '-vcodec', 'png', '-i', '-', '-vf', sliceToYuvFilter, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', r.画面], sourcePng(null));
  runCapture([config('ffmpeg'), '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2:sample_rate=48000', '-c:a', 'pcm_s16le', '-ac', '2', r.声音]);
  writeFingerprint(r.画面指纹, path.dirname(r.画面));
  return r;
};

beforeAll(() => fs.mkdirSync(sampleDir, { recursive: true }));
afterAll(() => fs.rmSync(dataRoot, { recursive: true, force: true }));

describe('抽帧', () => {
  it('首、尾加中间均匀，共 n 帧；段比 n 短全取；少于 2 帧拒', () => {
    const f = pickFrames(188);
    expect(f).toHaveLength(12);
    expect(f[0]).toBe(0);
    expect(f.at(-1)).toBe(187);
    expect([...f].sort((a, b) => a - b)).toEqual(f);
    expect(pickFrames(5)).toEqual([0, 1, 2, 3, 4]);
    expect(pickFrames(47, 3)).toEqual([0, 23, 46]);
    expect(pickFrames(1, 2)).toEqual([0]);
    expect(() => pickFrames(10, 1)).toThrow();
  });
});

describe('静帧证明不了', () => {
  it('只改代码不拦；渲染设置、私有配乐、ogg 解码、缺字节拦', () => {
    expect(stillCannotProve(makeFingerprintItems(), makeFingerprintItems({ 代码: { 画面根: 'x', 段根: 'b', 设置根: 'c', 外壳根: 'd' }, 依赖版本: { three: '0.186.2' }, 打包规则: { ...makeFingerprintItems().打包规则, 'pipeline/资产/webpack.ts': 'w2' } }))).toEqual([]);
    expect(stillCannotProve(makeFingerprintItems(), makeFingerprintItems({ 渲染设置: { ...makeFingerprintItems().渲染设置, crf: 2 } }))[0]).toContain('crf');
    expect(stillCannotProve(makeFingerprintItems(), makeFingerprintItems({ 私有配乐: { musicA: 'sha' } }))[0]).toContain('私有配乐');
    expect(stillCannotProve(makeFingerprintItems(), makeFingerprintItems({ 打包规则: { ...makeFingerprintItems().打包规则, 'pipeline/资产/ogg解码.cjs': 'o2' } }))[0]).toContain('ogg解码');
    expect(stillCannotProve(makeFingerprintItems(), makeFingerprintItems({ 缺字节: ['甲'] }))[0]).toContain('缺字节');
  });
});

describe('比一帧', () => {
  it('同一画面的 PNG 和有损压缩的切片：逐字节不一样，在噪声内；改了一块判不同；逐字节一样就是一样', async () => {
    const r = await placeOldVersion('比一帧');
    const { oldVersion } = await findOldVersion(segKey, segmentFingerprint('比一帧之后'), { 帧数: 48, waitGate: letThrough, 作品: work });
    expect(oldVersion!.母版).toBe(r.画面);
    const oldFrames = await readOldFrames(oldVersion!, [0, 30, 47]);
    for (const n of [0, 30, 47]) {
      const newFrame = await frameToYuv(sourcePng(n), widthPx, height);
      expect(newFrame.equals(oldFrames.get(n)!)).toBe(false);
      expect(compareFrame(n, newFrame, oldFrames.get(n)!, widthPx, height, threshold).结论).toBe('噪声内');
      const verdict = compareFrame(n, await frameToYuv(sourcePng(n, true), widthPx, height), oldFrames.get(n)!, widthPx, height, threshold);
      expect(verdict.结论).toBe('不同');
      expect(verdict.说明).toContain('16×16');
      expect(compareFrame(n, oldFrames.get(n)!, oldFrames.get(n)!, widthPx, height, threshold).结论).toBe('一样');
    }
    await expect(frameToYuv(sourcePng(0), widthPx * 2, height)).rejects.toThrow('尺寸对不上');
  });
});

describe('找旧版、登记沿用', () => {
  it('找最近一份切片和 wav 都在的（段签缺了当场补）；登记后新指纹有切片和 wav（克隆）、段签记 沿用；旧的删了新的照用；gc 扫到的是新指纹自己的切片', async () => {
    const fixture = await placeOldVersion('甲');
    const second = makeArtifact('乙');
    expect(hasNewFingerprint(segKey, second, work)).toBeNull();
    let passCount = 0;
    const { oldVersion } = await findOldVersion(segKey, second.画面指纹, { 帧数: 48, waitGate: async () => void passCount++, 作品: work });
    expect(oldVersion!.指纹).toBe(fixture.画面指纹.指纹);
    expect(oldVersion!.母版).toBe(fixture.画面);
    expect(oldVersion!.声音).toBe(fixture.声音);
    expect(passCount).toBe(1);
    expect(await matchesSlice(oldVersion!.segStamp, fixture.画面, fixture.声音)).toBe(true);
    expect((await findOldVersion(segKey, second.画面指纹, { 帧数: 47, waitGate: letThrough, 作品: work })).unused.join()).toContain('48 帧');

    const r = registerReuse(segKey, oldVersion!, second, { 理由: '搬函数', 帧: [0, 47], 提交: 'abc', 级别: '视频' }, work);
    expect(r.母版).toBe(second.画面);
    expect(r.声音).toBe(second.声音);
    expect(hasNewFingerprint(segKey, second, work)).toBe('切片在');
    expect((await findOldVersion(segKey, second.画面指纹, { 帧数: 48, waitGate: letThrough, 作品: work, pickFingerprint: second.画面指纹.指纹 })).oldVersion?.指纹).toBe(second.画面指纹.指纹);
    expect((await findOldVersion(segKey, second.画面指纹, { 帧数: 48, waitGate: letThrough, 作品: work, pickFingerprint: '已删的旧片' })).oldVersion).toBeNull();
    const segStamp = readSegStamp(segKey, second.画面指纹.指纹, work)!;
    expect(segStampComplete(segStamp)).toBe(true);
    expect(segStamp).toMatchObject({ 版本: 3, 声音指纹: second.声音指纹.指纹 });
    expect(segStamp.沿用).toMatchObject({ 自: fixture.画面指纹.指纹, 原渲: fixture.画面指纹.指纹, 理由: '搬函数', 帧: [0, 47], 提交: 'abc' });
    expect(segStamp.签名).toEqual(oldVersion!.segStamp.签名);
    expect(await matchesSlice(segStamp, r.母版, r.声音)).toBe(true);
    expect(fingerprintHistory(segKey, path.dirname(r.母版)).map((h) => h.指纹)).toEqual(expect.arrayContaining([second.画面指纹.指纹, second.声音指纹.指纹]));
    // 没有临时文件留下
    expect(fs.readdirSync(path.dirname(r.母版)).filter((n) => n.includes('写入中'))).toEqual([]);

    // cache gc 的扫描：新指纹的切片是它自己的一份
    const foundMedia = scanKey('母版', segKey, work).media.find((m) => m.指纹 === second.画面指纹.指纹.slice(0, 16));
    expect(foundMedia).toMatchObject({ 存法: '切片' });

    // 连着认：原渲 指到真渲的那份
    const artifactC = makeArtifact('丙');
    const { oldVersion: oldVersionForThird } = await findOldVersion(segKey, artifactC.画面指纹, { 帧数: 48, waitGate: letThrough, 作品: work });
    expect(oldVersionForThird!.指纹).toBe(second.画面指纹.指纹);
    const r2 = registerReuse(segKey, oldVersionForThird!, artifactC, { 理由: '再搬', 帧: [0], 提交: 'def', 级别: '视频' }, work);
    expect(readSegStamp(segKey, artifactC.画面指纹.指纹, work)!.沿用).toMatchObject({ 自: second.画面指纹.指纹, 原渲: fixture.画面指纹.指纹 });

    // 旧指纹的切片、wav、段签删掉（gc 回收旧指纹）：沿用的照样对得上
    fs.rmSync(fixture.画面);
    fs.rmSync(fixture.声音);
    fs.rmSync(path.join(dataRoot, '段签', work, segKey, fixture.画面指纹.指纹.slice(0, 16)), { recursive: true });
    expect(await matchesSlice(readSegStamp(segKey, artifactC.画面指纹.指纹, work)!, r2.母版, r2.声音)).toBe(true);
    expect(fs.statSync(r2.母版).size).toBe(segStamp.母版.大小);
  });

  it('新指纹渲过（有段签、没 沿用）不算过期；认到一半（段签有 沿用、切片没改名过来）可以重认；切片不在的旧版跳过', async () => {
    const groupD = await placeOldVersion('丁');
    await findOldVersion(segKey, segmentFingerprint('丁之后'), { 帧数: 48, waitGate: letThrough, 作品: work });
    const segStamp = readSegStamp(segKey, groupD.画面指纹.指纹, work)!;
    fs.rmSync(groupD.画面);
    expect(hasNewFingerprint(segKey, groupD, work)).toContain('渲过');
    const productE = makeArtifact('戊');
    const segStampDir = path.join(dataRoot, '段签', work, segKey, productE.画面指纹.指纹.slice(0, 16));
    fs.mkdirSync(segStampDir, { recursive: true });
    fs.writeFileSync(path.join(segStampDir, '签.json'), JSON.stringify({ ...segStamp, 指纹: productE.画面指纹.指纹, 沿用: { 自: groupD.画面指纹.指纹 } }));
    expect(hasNewFingerprint(segKey, productE, work)).toBeNull();
    // 切片删了的旧版跳过
    const found = await findOldVersion(segKey, segmentFingerprint('己'), { 帧数: 48, waitGate: letThrough, 作品: work });
    expect(found.oldVersion?.指纹).not.toBe(groupD.画面指纹.指纹);
    expect(await matchesMaster(segStamp, groupD.画面).catch(() => false)).toBe(false);
  });

  it('克隆：目标在就拒，不覆盖', () => {
    const a = path.join(sampleDir, '克隆甲');
    const b = path.join(sampleDir, '克隆乙');
    fs.writeFileSync(a, 'x');
    expect(['克隆', '硬链接', '复制']).toContain(cloneFile(a, b));
    expect(fs.readFileSync(b, 'utf8')).toBe('x');
    expect(() => cloneFile(a, b)).toThrow('不覆盖');
  });
});
