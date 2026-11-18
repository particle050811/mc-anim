// 认指纹：抽哪几帧、哪些差异静帧证明不了、一帧怎么比（新旧 PNG：字节一样、字节不同像素一样、改了一块判不同）、
// 找旧版、登记沿用（克隆切片和 wav、照抄段签记 沿用、.指纹.json 记像素源头的提交；旧指纹的东西删了新指纹照用；cache gc 扫到的是这个指纹自己的切片）。
// 切片用 Remotion 自带的 ffmpeg 压，放在临时数据根里，不碰真数据，不开浏览器。
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-认指纹测试-'));
process.env.ANIM_DATA = dataRoot;

const { config } = await import('../环境/配置.ts');
const { runCapture, runCaptureBytes } = await import('../环境/子进程.ts');
const { readSegStamp, segStampComplete, matchesMaster, matchesSlice } = await import('./段签.ts');
const { writeFingerprint, fingerprintHistory } = await import('../渲/母版.ts');
const { segPicturePath, segSoundPath, pairedSoundFingerprint } = await import('../渲/段产物.ts');
const { runBundledFfmpeg } = await import('../渲/自带ffmpeg.ts');
const { scanKey } = await import('../缓存/钉.ts');
const { pickFrames, stillCannotProve, comparePng, findOldVersion, registerReuse, hasNewFingerprint, cloneFile } = await import('./认指纹.ts');
type SegFingerprint = import('../指纹/指纹.ts').SegFingerprint;
type FingerprintItem = import('../指纹/指纹.ts').FingerprintItem;

const work = '测试作品';
const segKey = '核对-认指纹';
const threshold = { block8Threshold: 24, block16Threshold: 10, block64Threshold: 4, glanceThreshold: 6 };
const widthPx = 128;
const height = 72;
const sampleDir = path.join(dataRoot, '样例');
const fingerprintOf = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const letThrough = async () => {};

const makeFingerprintItems = (o: Partial<FingerprintItem> = {}): FingerprintItem => ({
  code: { pictureRoot: 'a', segmentRoot: 'b', settingsRoot: 'c', shellRoot: 'd' },
  terrain: {},
  renderSettings: { inputProps: { level: '视频', outputFps: 60 }, codec: 'h264', crf: 18, scale: 3, gl: 'angle', muted: false, audioCodec: 'pcm-16', sec: 0.8, width: 64, height: 36 },
  dependencyVersions: { three: '0.186.1' },
  bundleRules: { tsconfig: 't', 'pipeline/资产/webpack.ts': 'w', 'pipeline/资产/ogg解码.cjs': 'o' },
  platform: 'darwin-arm64',
  ...o,
});
const segmentFingerprint = (artifactName: string, code = artifactName): SegFingerprint => ({ segment: segKey, fingerprint: fingerprintOf(artifactName), algorithm: 'merkle-v1', items: makeFingerprintItems({ code: { pictureRoot: code, segmentRoot: 'b', settingsRoot: 'c', shellRoot: 'd' } }), detail: { modules: {}, asset: {} } });
/** 和 段产物 一样：声音和画面同一遍出，声音指纹就是画面指纹 */
const makeArtifact = (artifactName: string) => {
  const pictureFingerprint = segmentFingerprint(artifactName);
  const soundFingerprint = pairedSoundFingerprint(pictureFingerprint)!;
  return { pictureFingerprint: pictureFingerprint, soundFingerprint: pictureFingerprint, 画面: segPicturePath(segKey, pictureFingerprint.fingerprint, work), sound: segSoundPath(segKey, soundFingerprint, work) };
};

/** 源画面（无损 PNG 流）；单帧取第 n 帧，改 就在左上画一块红 */
const sourcePng = (n: number | null, drawBox = false) =>
  runCaptureBytes([
    config('ffmpeg'), '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${widthPx}x${height}:rate=24:duration=2`,
    ...(n === null ? [] : ['-vf', `select=eq(n\\,${n})${drawBox ? ',drawbox=x=0:y=0:w=24:h=24:color=red:t=fill' : ''}`, '-frames:v', '1']), '-f', 'image2pipe', '-c:v', 'png', '-',
  ]);

/** PNG 帧经 Remotion 的 ffmpeg、x264 CRF18 压成 mp4；配一份 wav；写 .指纹.json（不派生段签，找旧版 会补） */
const placeOldVersion = async (artifactName: string) => {
  const r = makeArtifact(artifactName);
  fs.mkdirSync(path.dirname(r.画面), { recursive: true });
  await runBundledFfmpeg(['-v', 'error', '-y', '-r', '24', '-f', 'image2pipe', '-vcodec', 'png', '-i', '-', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', r.画面], sourcePng(null));
  runCapture([config('ffmpeg'), '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2:sample_rate=48000', '-c:a', 'pcm_s16le', '-ac', '2', r.sound]);
  writeFingerprint(r.pictureFingerprint, path.dirname(r.画面));
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
    expect(stillCannotProve(makeFingerprintItems(), makeFingerprintItems({ code: { pictureRoot: 'x', segmentRoot: 'b', settingsRoot: 'c', shellRoot: 'd' }, dependencyVersions: { three: '0.186.2' }, bundleRules: { ...makeFingerprintItems().bundleRules, 'pipeline/资产/webpack.ts': 'w2' } }))).toEqual([]);
    expect(stillCannotProve(makeFingerprintItems(), makeFingerprintItems({ renderSettings: { ...makeFingerprintItems().renderSettings, crf: 2 } }))[0]).toContain('crf');
    expect(stillCannotProve(makeFingerprintItems(), makeFingerprintItems({ privateMusic: { musicA: 'sha' } }))[0]).toContain('私有配乐');
    expect(stillCannotProve(makeFingerprintItems(), makeFingerprintItems({ bundleRules: { ...makeFingerprintItems().bundleRules, 'pipeline/资产/ogg解码.cjs': 'o2' } }))[0]).toContain('ogg解码');
    expect(stillCannotProve(makeFingerprintItems(), makeFingerprintItems({ 缺字节: ['甲'] }))[0]).toContain('缺字节');
  });
});

describe('比一帧', () => {
  it('新旧 PNG：字节一样是一样；换了压缩级别字节不同、像素一样是像素同；改了一块是不同、报差多少', () => {
    const png = sourcePng(30);
    expect(comparePng(30, png, Buffer.from(png), threshold).verdict).toBe('一样');
    const recompressed = runCaptureBytes([config('ffmpeg'), '-v', 'error', '-f', 'image2pipe', '-c:v', 'png', '-i', '-', '-compression_level', '0', '-f', 'image2pipe', '-c:v', 'png', '-'], { input: png });
    expect(recompressed.equals(png)).toBe(false);
    expect(comparePng(30, recompressed, png, threshold).verdict).toBe('像素同');
    const changed = comparePng(30, sourcePng(30, true), png, threshold);
    expect(changed.verdict).toBe('不同');
    expect(changed.note).toContain('16×16');
    expect(comparePng(30, Buffer.from('不是 PNG'), png, threshold)).toMatchObject({ verdict: '不同', note: expect.stringContaining('比不了') });
  });
});

describe('找旧版、登记沿用', () => {
  it('找最近一份切片和 wav 都在的（段签缺了当场补）；登记后新指纹有切片和 wav（克隆）、段签记 沿用；旧的删了新的照用；gc 扫到的是新指纹自己的切片', async () => {
    const fixture = await placeOldVersion('甲');
    const second = makeArtifact('乙');
    expect(hasNewFingerprint(segKey, second, work)).toBeNull();
    let passCount = 0;
    const { oldVersion } = await findOldVersion(segKey, second.pictureFingerprint, { frameCount: 48, waitGate: async () => void passCount++, work: work });
    expect(oldVersion!.fingerprint).toBe(fixture.pictureFingerprint.fingerprint);
    expect(oldVersion!.master).toBe(fixture.画面);
    expect(oldVersion!.sound).toBe(fixture.sound);
    expect(passCount).toBe(1);
    expect(await matchesSlice(oldVersion!.segStamp, fixture.画面, fixture.sound)).toBe(true);
    expect((await findOldVersion(segKey, second.pictureFingerprint, { frameCount: 47, waitGate: letThrough, work: work })).unused.join()).toContain('48 帧');

    const r = registerReuse(segKey, oldVersion!, second, { reason: '搬函数', frame: [0, 47], commit: 'abc', sourceCommit: '源头提交', level: '视频' }, work);
    expect(r.master).toBe(second.画面);
    expect(r.sound).toBe(second.sound);
    expect(hasNewFingerprint(segKey, second, work)).toBe('切片在');
    const segStamp = readSegStamp(segKey, second.pictureFingerprint.fingerprint, work)!;
    expect(segStampComplete(segStamp)).toBe(true);
    expect(segStamp).toMatchObject({ version: 3, soundFingerprint: second.soundFingerprint.fingerprint });
    expect(segStamp.reuse).toMatchObject({ reusedFrom: fixture.pictureFingerprint.fingerprint, origRender: fixture.pictureFingerprint.fingerprint, reason: '搬函数', frame: [0, 47], commit: 'abc' });
    expect(segStamp.signature).toEqual(oldVersion!.segStamp.signature);
    expect(await matchesSlice(segStamp, r.master, r.sound)).toBe(true);
    expect(fingerprintHistory(segKey, path.dirname(r.master)).map((h) => h.fingerprint)).toEqual(expect.arrayContaining([second.pictureFingerprint.fingerprint, second.soundFingerprint.fingerprint]));
    // .指纹.json 记的是像素源头的提交，不是认下时的提交：下次认指纹在它上面重出旧帧
    expect(fingerprintHistory(segKey, path.dirname(r.master)).find((h) => h.fingerprint === second.pictureFingerprint.fingerprint)!.renderCommit).toEqual({ commit: '源头提交', dirty: false });
    // 没有临时文件留下
    expect(fs.readdirSync(path.dirname(r.master)).filter((n) => n.includes('写入中'))).toEqual([]);

    // cache gc 的扫描：新指纹的切片是它自己的一份
    const foundMedia = scanKey('母版', segKey, work).media.find((m) => m.fingerprint === second.pictureFingerprint.fingerprint.slice(0, 16));
    expect(foundMedia).toMatchObject({ storeKind: '切片' });

    // 连着认：原渲 指到真渲的那份
    const artifactC = makeArtifact('丙');
    const { oldVersion: oldVersionForThird } = await findOldVersion(segKey, artifactC.pictureFingerprint, { frameCount: 48, waitGate: letThrough, work: work });
    expect(oldVersionForThird!.fingerprint).toBe(second.pictureFingerprint.fingerprint);
    const r2 = registerReuse(segKey, oldVersionForThird!, artifactC, { reason: '再搬', frame: [0], commit: 'def', sourceCommit: '源头提交', level: '视频' }, work);
    expect(readSegStamp(segKey, artifactC.pictureFingerprint.fingerprint, work)!.reuse).toMatchObject({ reusedFrom: second.pictureFingerprint.fingerprint, origRender: fixture.pictureFingerprint.fingerprint });

    // 旧指纹的切片、wav、段签删掉（gc 回收旧指纹）：沿用的照样对得上
    fs.rmSync(fixture.画面);
    fs.rmSync(fixture.sound);
    fs.rmSync(path.join(dataRoot, '段签', work, segKey, fixture.pictureFingerprint.fingerprint.slice(0, 16)), { recursive: true });
    expect(await matchesSlice(readSegStamp(segKey, artifactC.pictureFingerprint.fingerprint, work)!, r2.master, r2.sound)).toBe(true);
    expect(fs.statSync(r2.master).size).toBe(segStamp.master.size);
  });

  it('新指纹渲过（有段签、没 沿用）不算过期；认到一半（段签有 沿用、切片没改名过来）可以重认；切片不在的旧版跳过', async () => {
    const groupD = await placeOldVersion('丁');
    await findOldVersion(segKey, segmentFingerprint('丁之后'), { frameCount: 48, waitGate: letThrough, work: work });
    const segStamp = readSegStamp(segKey, groupD.pictureFingerprint.fingerprint, work)!;
    fs.rmSync(groupD.画面);
    expect(hasNewFingerprint(segKey, groupD, work)).toContain('渲过');
    const productE = makeArtifact('戊');
    const segStampDir = path.join(dataRoot, '段签', work, segKey, productE.pictureFingerprint.fingerprint.slice(0, 16));
    fs.mkdirSync(segStampDir, { recursive: true });
    fs.writeFileSync(path.join(segStampDir, '签.json'), JSON.stringify({ ...segStamp, fingerprint: productE.pictureFingerprint.fingerprint, reuse: { reusedFrom: groupD.pictureFingerprint.fingerprint } }));
    expect(hasNewFingerprint(segKey, productE, work)).toBeNull();
    // 切片删了的旧版跳过
    const found = await findOldVersion(segKey, segmentFingerprint('己'), { frameCount: 48, waitGate: letThrough, work: work });
    expect(found.oldVersion?.fingerprint).not.toBe(groupD.pictureFingerprint.fingerprint);
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
