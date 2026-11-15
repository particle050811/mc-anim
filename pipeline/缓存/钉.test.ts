// 渲段渲完自动删旧切片的每条跳过规则，和 gc 同步的规则（用户 10-30 定：旧的过期的删，当前不删，没有预算）。数据根是临时目录，作品是现造的。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-钉测试-'));
process.env.ANIM_DATA = dataRoot;
const workRoot = path.join(dataRoot, '假作品');
vi.mock('../环境/作品.ts', async (actual) => ({ ...(await actual<typeof import('../环境/作品.ts')>()), listWorks: () => new Map([['假', workRoot]]), workName: () => '假' }));

const { deleteOld, hasOldToDelete } = await import('./钉.ts');
const { checkoutMarkFile } = await import('../渲/母版.ts');
const { currentCheckout } = await import('../环境/路径.ts');
const { planMedia, scanMedia, KeepSet: keepSet, addDelivery, addApprovals } = await import('./回收.ts');
const { approvRefFile, masterDir } = await import('../环境/配置.ts');
const { sampleKey, writeApproval, approvalFile } = await import('../验收/认可.ts');

const newSha = 'a'.repeat(64);
const newAudio = 'd'.repeat(64);
const oldSha = 'b'.repeat(64);
const oldShortFp = oldSha.slice(0, 16);
const segKey = '甲';
// 取真实时间：列文件判「正在写」用的是 Date.now()，写死的时间过一天就对不上
const now = Date.now();
const hourMs = 3600e3;
const fakeMasterDir = () => masterDir(segKey, '假');

const writeFingerprint = (dir: string, fingerprint: string, level: string | null) => {
  fs.mkdirSync(dir, { recursive: true });
  const fingerprintItems = level ? { 渲染设置: { inputProps: { 级别: level } } } : {};
  fs.writeFileSync(path.join(dir, `${fingerprint.slice(0, 16)}.指纹.json`), JSON.stringify({ 段: segKey, 指纹: fingerprint, 项: fingerprintItems }));
};
/** 造一份旧的切片（.mp4） */
const oldMaster = (o: { 级别?: string | null } = {}) => {
  writeFingerprint(fakeMasterDir(), oldSha, o.级别 === undefined ? '视频' : o.级别);
  fs.writeFileSync(path.join(fakeMasterDir(), `${oldShortFp}.mp4`), Buffer.alloc(40));
};
const exists = (suffix: string) => fs.existsSync(path.join(fakeMasterDir(), `${oldShortFp}${suffix}`));
const pruneOld = () => deleteOld('母版', segKey, '视频', [newSha, newAudio], { 作品: '假', now, mainCheckout: true });

/** 交付 manifest（版本 3，段记 画面指纹） */
const makeDelivery = (deliveryName: string, o: { selfContained?: boolean } = {}) => {
  const dir = path.join(dataRoot, '交付', '假', deliveryName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ 版本: 3, 作品: '假', 段: [{ 键: segKey, 画面指纹: oldSha }] }));
  if (o.selfContained) fs.writeFileSync(path.join(dir, '全片-未拉响度.flac'), '');
};
const approvalRecord = {
  段: segKey, 指纹: oldSha, 平台: 'darwin-arm64', 渲染级别: '视频', 认可于: '2026-10-22T00:00:00Z', 提交: 'abc', 理由: '测试', 上一版指纹: null,
  宽: 4, 高: 4, 帧数: 1, 间隔: 24, 帧: [{ 帧: 0, 哈希: 'c'.repeat(64), 块均值: ['00'] }], 音频sha: null, 响度: null, 起音: null,
};
const writeApprovalRecord = () => writeApproval(approvalFile(segKey, 'darwin-arm64', workRoot), approvalRecord);

beforeEach(() => {
  for (const d of ['cache', '交付', '段签', '认可参考']) fs.rmSync(path.join(dataRoot, d), { recursive: true, force: true });
  fs.rmSync(workRoot, { recursive: true, force: true });
  fs.mkdirSync(workRoot, { recursive: true });
});

describe('渲段渲完删旧', () => {
  it('同段同级别别的指纹：切片、旧 wav 都删，.指纹.json 留着，当前画面、声音不动；CRF1 时代的 .mkv 不认，不动', () => {
    oldMaster();
    fs.writeFileSync(path.join(fakeMasterDir(), `${oldShortFp}.mkv`), Buffer.alloc(100));
    writeFingerprint(fakeMasterDir(), newSha, '视频');
    writeFingerprint(fakeMasterDir(), newAudio, '视频');
    const newFile = path.join(fakeMasterDir(), `${newSha.slice(0, 16)}.mp4`);
    const newSoundFile = path.join(fakeMasterDir(), `${newAudio.slice(0, 16)}.wav`);
    fs.writeFileSync(newFile, Buffer.alloc(40));
    fs.writeFileSync(newSoundFile, Buffer.alloc(8));
    const oldSoundFp = 'e'.repeat(64);
    writeFingerprint(fakeMasterDir(), oldSoundFp, '视频');
    fs.writeFileSync(path.join(fakeMasterDir(), `${oldSoundFp.slice(0, 16)}.wav`), Buffer.alloc(8));
    const r = pruneOld();
    expect(r.deletedSize).toBe(40 + 8);
    expect(exists('.mp4')).toBe(false);
    expect(exists('.mkv')).toBe(true);
    expect(fs.existsSync(path.join(fakeMasterDir(), `${oldSoundFp.slice(0, 16)}.wav`))).toBe(false);
    expect(exists('.指纹.json')).toBe(true);
    expect(fs.existsSync(newFile) && fs.existsSync(newSoundFile)).toBe(true);
  });

  it('别的级别的、级别读不出的不动', () => {
    oldMaster({ 级别: '预览' });
    expect(pruneOld().removed).toEqual([]);
    expect(exists('.mp4')).toBe(true);
    oldMaster({ 级别: null });
    expect(pruneOld().removed).toEqual([]);
    expect(exists('.mp4')).toBe(true);
  });

  it('还没自足的交付引用的旧切片钉着；自足了就不钉', () => {
    oldMaster();
    makeDelivery('没自足');
    const r = pruneOld();
    expect(exists('.mp4')).toBe(true);
    expect(r.留[0]!.理由).toContain('交付');
    fs.rmSync(path.join(dataRoot, '交付'), { recursive: true });
    makeDelivery('自足', { selfContained: true });
    pruneOld();
    expect(exists('.mp4')).toBe(false);
  });

  it('认可没有参考：认可那版的切片留（verify 比它的像素、补参考 从它抽，用户 11-02 定）；有参考了就不钉', () => {
    oldMaster();
    writeApprovalRecord();
    pruneOld();
    expect(exists('.mp4')).toBe(true);
    const refPath = approvRefFile(segKey, oldSha, sampleKey(approvalRecord), 'darwin-arm64', '假');
    fs.mkdirSync(path.dirname(refPath), { recursive: true });
    fs.writeFileSync(refPath, '');
    pruneOld();
    expect(exists('.mp4')).toBe(false);
  });

  it('这个指纹正在写（.渲染中、.写入中）不删；过了一天的残留不算', () => {
    oldMaster();
    const tmp = path.join(fakeMasterDir(), `${oldShortFp}.渲染中-123.mp4`);
    fs.writeFileSync(tmp, '');
    fs.utimesSync(tmp, new Date(now - hourMs), new Date(now - hourMs));
    expect(pruneOld().留[0]!.理由).toContain('正在写');
    expect(exists('.mp4')).toBe(true);
    fs.rmSync(tmp);
    const tmp2 = path.join(fakeMasterDir(), `${oldShortFp}.写入中-123.mp4`);
    fs.writeFileSync(tmp2, '');
    fs.utimesSync(tmp2, new Date(now - hourMs), new Date(now - hourMs));
    expect(pruneOld().留[0]!.理由).toContain('正在写');
    fs.utimesSync(tmp2, new Date(now - 30 * hourMs), new Date(now - 30 * hourMs));
    pruneOld();
    expect(exists('.mp4')).toBe(false);
  });

  it('近 2 小时用过的不删，过了 2 小时删', () => {
    oldMaster();
    const usedMark = path.join(fakeMasterDir(), `${oldShortFp}.用过`);
    fs.writeFileSync(usedMark, '');
    fs.utimesSync(usedMark, new Date(now - hourMs), new Date(now - hourMs));
    expect(pruneOld().留[0]!.理由).toContain('2 小时内用过');
    expect(exists('.mp4')).toBe(true);
    fs.utimesSync(usedMark, new Date(now - 3 * hourMs), new Date(now - 3 * hourMs));
    pruneOld();
    expect(exists('.mp4')).toBe(false);
    expect(fs.existsSync(usedMark)).toBe(true);
  });

  it('worktree 里不自动删旧（可能是主检出的当前指纹）：都在，报留着', () => {
    oldMaster();
    const r = deleteOld('母版', segKey, '视频', [newSha, newAudio], { 作品: '假', now, mainCheckout: false });
    expect(r.removed).toEqual([]);
    expect(r.留.map((x) => x.理由)).toEqual(['worktree 不自动删']);
    expect(exists('.mp4')).toBe(true);
    expect(hasOldToDelete('母版', segKey, '视频', [newSha, newAudio], { 作品: '假', now, mainCheckout: false })).toBe(false);
  });

  it('命中时先问有没有要删的：没旧的、旧的都钉着都是 false，不用等闸', () => {
    const check = () => hasOldToDelete('母版', segKey, '视频', [newSha, newAudio], { 作品: '假', now, mainCheckout: true });
    expect(check()).toBe(false);
    oldMaster();
    expect(check()).toBe(true);
    writeApprovalRecord();
    expect(check()).toBe(false);
  });

  it('别的检出用过的不删（它的当前指纹这边算不出）；那个检出删了就不算；自己的记号不算', () => {
    oldMaster();
    const otherCheckout = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-别的检出-'));
    fs.writeFileSync(checkoutMarkFile(fakeMasterDir(), oldSha, otherCheckout), `${otherCheckout}\n`);
    expect(pruneOld().留[0]!.理由).toContain(`别的检出用过：${otherCheckout}`);
    expect(exists('.mp4')).toBe(true);
    fs.rmSync(otherCheckout, { recursive: true });
    fs.writeFileSync(checkoutMarkFile(fakeMasterDir(), oldSha), `${currentCheckout()}\n`);
    pruneOld();
    expect(exists('.mp4')).toBe(false);
  });

  it('交付 manifest 读不出：不知道引用了谁，整部作品的母版留着；已自足的不钉', () => {
    oldMaster();
    makeDelivery('坏了');
    const m = path.join(dataRoot, '交付', '假', '坏了', 'manifest.json');
    fs.writeFileSync(m, '{"段": [');
    const r = pruneOld();
    expect(r.removed).toEqual([]);
    expect(r.留[0]!.理由).toContain('交付 manifest 读不出：假/坏了');
    expect(exists('.mp4')).toBe(true);
    fs.writeFileSync(path.join(path.dirname(m), '全片-未拉响度.flac'), '');
    pruneOld();
    expect(exists('.mp4')).toBe(false);
  });

});

describe('gc 同步', () => {
  const planWith = (configure: (keep: InstanceType<typeof keepSet>) => void) => {
    const keep = new keepSet();
    configure(keep);
    const mediaScan = scanMedia(path.join(dataRoot, 'cache', '母版', '假'), '母版', '假', { now });
    return planMedia(mediaScan.media, keep, { now, recentDays: 2 });
  };
  const oldFile = (suffix: string) => {
    const f = path.join(fakeMasterDir(), `${oldShortFp}${suffix}`);
    fs.utimesSync(f, new Date(now - 30 * 24 * hourMs), new Date(now - 30 * 24 * hourMs));
  };
  const deletedBasenames = (r: ReturnType<typeof planWith>) => r.filter((f) => !f.理由.length).map((f) => path.basename(f.路径)).sort();

  it('当前的切片和 wav 不删；旧切片有更新的了，过了近期就删', () => {
    oldMaster();
    oldFile('.mp4');
    fs.utimesSync(path.join(fakeMasterDir(), `${oldShortFp}.指纹.json`), new Date(now - 30 * 24 * hourMs), new Date(now - 30 * 24 * hourMs));
    writeFingerprint(fakeMasterDir(), newSha, '视频');
    writeFingerprint(fakeMasterDir(), newAudio, '视频');
    const videoPath = path.join(fakeMasterDir(), `${newSha.slice(0, 16)}.mp4`);
    const soundPath = path.join(fakeMasterDir(), `${newAudio.slice(0, 16)}.wav`);
    fs.writeFileSync(videoPath, Buffer.alloc(40));
    fs.writeFileSync(soundPath, Buffer.alloc(8));
    const r = planWith((keep) => {
      keep.加(videoPath, { 类: '当前', 说明: '视频' });
      keep.加(soundPath, { 类: '当前', 说明: '视频' });
    });
    expect(deletedBasenames(r)).toEqual([`${oldShortFp}.mp4`]);
    expect(r.find((f) => f.存法 === '切片')!.理由.some((x) => x.类 === '当前')).toBe(true);
    expect(r.find((f) => f.存法 === '声音')!.理由.some((x) => x.类 === '当前')).toBe(true);
  });

  it('过期的（被更新的指纹取代）删；交付自足后不再引用的也删；未自足的留', () => {
    oldMaster();
    oldFile('.mp4');
    writeFingerprint(fakeMasterDir(), newSha, '视频');
    fs.writeFileSync(path.join(fakeMasterDir(), `${newSha.slice(0, 16)}.mp4`), Buffer.alloc(40));
    // 新指纹的 json 写得晚才算最近一份
    fs.utimesSync(path.join(fakeMasterDir(), `${oldShortFp}.指纹.json`), new Date(now - 30 * 24 * hourMs), new Date(now - 30 * 24 * hourMs));
    const configure = (keep: InstanceType<typeof keepSet>) => {
      addDelivery(keep, path.join(dataRoot, '交付'), dataRoot, () => {}, { unpin: true });
      addApprovals(keep, workRoot, (k) => masterDir(k, '假'), () => {}, { unpin: true });
    };
    expect(deletedBasenames(planWith(configure))).toEqual([`${oldShortFp}.mp4`]);
    makeDelivery('未自足');
    expect(deletedBasenames(planWith(configure))).toEqual([]);
    fs.rmSync(path.join(dataRoot, '交付'), { recursive: true });
    makeDelivery('自足', { selfContained: true });
    expect(deletedBasenames(planWith(configure))).toEqual([`${oldShortFp}.mp4`]);
  });
});
