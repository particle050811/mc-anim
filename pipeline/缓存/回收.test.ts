// anim cache gc 的保留集和各类规划：在临时目录里现造母版、认可记录、交付 manifest，不碰数据根。
// 最要紧的一条：认可那版的母版不能删（删了 verify 只能退回去比块均值）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fingerprintHistory } from '../渲/母版.ts';
import { sampleKey, approvalText, readApproval, type ApprovalRecord } from '../验收/认可.ts';
import { addCurrentFingerprints } from './当前指纹.ts';
import { runReclaim, cacheKnownNames, runKnownNames, reportOnlyDirs, type ReclaimPlan } from './计划.ts';
import {
  KeepSet, addDelivery, addApprovals, deliveryRefs, scanMedia, scanWebpack, listDir, isTempName, planMedia, planTemp, planDrafts, planWebpack, readApprovedFingerprint, Subtotal, mainReason, unrecognizedEntries, scanStaging, planStaging,
} from './回收.ts';

const dayMs = 24 * 3600 * 1000;
const now = Date.parse('2026-10-30T00:00:00Z');
let root = '';

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'anim-回收样例-')));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const writeFile = (rel: string, content: string | Buffer, modifiedAt?: number) => {
  const f = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
  // 目录的修改时间跟着拨（真目录里是最后一次往里加文件的时间）
  if (modifiedAt !== undefined) for (const x of [f, path.dirname(f)]) fs.utimesSync(x, new Date(modifiedAt), new Date(modifiedAt));
  return f;
};

/** 造一份母版和它的 .指纹.json：指纹 16 位、级别、几天前渲的 */
const makeMaster = (segKey: string, fingerprint: string, level: string, daysAgo: number, byteSize = 100) => {
  const t = now - daysAgo * dayMs;
  writeFile(`cache/母版/作品甲/${segKey}/${fingerprint}.指纹.json`, JSON.stringify({ segment: segKey, fingerprint: fingerprint.padEnd(64, '0'), items: { renderSettings: { inputProps: { level: level } } } }), t);
  return writeFile(`cache/母版/作品甲/${segKey}/${fingerprint}.mp4`, Buffer.alloc(byteSize, fingerprint.charCodeAt(0)), t);
};
const masterDir = (segKey: string) => path.join(root, 'cache', '母版', '作品甲', segKey);
const planKeep = (keep: KeepSet, recentDays = 2) => planMedia(scanMedia(path.join(root, 'cache', '母版', '作品甲'), '母版', '作品甲').media, keep, { now, recentDays });
const deletedFingerprints = (r: ReturnType<typeof planKeep>) => r.filter((f) => !f.reason.length).map((f) => f.fingerprint).sort();

const ApprovalRecord = (segKey: string, fingerprint: string): ApprovalRecord => ({
  segment: segKey, fingerprint: fingerprint, platform: 'darwin-arm64', renderLevel: '视频', approvedAt: '2026-10-22T00:00:00Z', commit: 'abc', reason: '测试', prevFingerprint: 'b'.repeat(64),
  width: 4, height: 4, frameCount: 1, interval: 24, frame: [{ frame: 0, hash: 'c'.repeat(64), blockMeans: ['00'] }], audioSha: null, loudness: null, onsets: null,
});

describe('扫键目录：列完目录文件才没', () => {
  const throwCode = (errCode: string) => { throw Object.assign(new Error(errCode), { code: errCode }); };
  const scan = () => scanMedia(path.join(root, 'cache', '母版', '作品甲'), '母版', '作品甲');
  afterEach(() => vi.restoreAllMocks());

  it('占用标记、临时文件刚被放掉（ENOENT）：算没看见，别的照扫', () => {
    const mediaPath = makeMaster('6-甲', 'aaaaaaaaaaaaaaaa', '视频', 1);
    const occupiedPath = writeFile('cache/母版/作品甲/6-甲/aaaaaaaaaaaaaaaa.占用', '1\n');
    const realStat = fs.statSync, realLstat = fs.lstatSync;
    vi.spyOn(fs, 'statSync').mockImplementation(((f: string, ...statArgs: []) => (f === occupiedPath ? throwCode('ENOENT') : realStat(f, ...statArgs))) as never);
    vi.spyOn(fs, 'lstatSync').mockImplementation(((f: string, ...statArgs: []) => (f === occupiedPath ? throwCode('ENOENT') : realLstat(f, ...statArgs))) as never);
    const r = scan();
    expect(r.media.map((f) => f.path)).toEqual([mediaPath]);
    expect(r.media[0]!.beingWritten).toBe(false);
    expect(r.tempFiles).toEqual([]);
  });

  it('mp4、wav 是母版；CRF1 时代的 .mkv、.x264.mkv 不认，归不认识', () => {
    const masterPath = makeMaster('6-甲', 'aaaaaaaaaaaaaaaa', '视频', 1);
    const soundPath = writeFile('cache/母版/作品甲/6-甲/bbbbbbbbbbbbbbbb.wav', 'x');
    writeFile('cache/母版/作品甲/6-甲/cccccccccccccccc.mkv', 'x');
    writeFile('cache/母版/作品甲/6-甲/dddddddddddddddd.x264.mkv', 'x');
    const r = scan();
    expect(r.media.map((f) => [f.path, f.storeKind])).toEqual([[masterPath, '切片'], [soundPath, '声音']]);
    expect(r.unknownFiles.map((f) => path.basename(f.path)).sort()).toEqual(['cccccccccccccccc.mkv', 'dddddddddddddddd.x264.mkv']);
  });

  it('别的错照抛：权限问题不能当成文件不在', () => {
    const mediaPath = makeMaster('6-甲', 'aaaaaaaaaaaaaaaa', '视频', 1);
    const realLstat = fs.lstatSync;
    vi.spyOn(fs, 'lstatSync').mockImplementation(((f: string, ...statArgs: []) => (f === mediaPath ? throwCode('EACCES') : realLstat(f, ...statArgs))) as never);
    expect(scan).toThrow('EACCES');
  });
});

describe('保留集：母版', () => {
  it('认可那版不删，哪怕它既不是当前、也不是最近一份、也不在近期里', () => {
    makeMaster('6-甲', 'aaaaaaaaaaaaaaaa', '视频', 9); // 认可那版
    makeMaster('6-甲', 'bbbbbbbbbbbbbbbb', '视频', 8); // 旧的，删
    makeMaster('6-甲', 'cccccccccccccccc', '视频', 7); // 当前
    writeFile('作品/作品甲/认可/darwin-arm64/6-甲.toml', approvalText(ApprovalRecord('6-甲', 'a'.repeat(16) + 'f'.repeat(48))));
    const keep = new KeepSet();
    addApprovals(keep, path.join(root, '作品', '作品甲'), masterDir);
    keep.加(path.join(masterDir('6-甲'), 'cccccccccccccccc.mp4'), { type: '当前', note: '视频' });
    const r = planKeep(keep);
    expect(deletedFingerprints(r)).toEqual(['bbbbbbbbbbbbbbbb']);
    expect(mainReason(r.find((f) => f.fingerprint === 'aaaaaaaaaaaaaaaa')!.reason)).toBe('认可');
  });

  it('没有认可记录时同一份就会被删（对照：上一条留下靠的是认可）', () => {
    makeMaster('6-甲', 'aaaaaaaaaaaaaaaa', '视频', 9);
    makeMaster('6-甲', 'cccccccccccccccc', '视频', 7);
    const keep = new KeepSet();
    addApprovals(keep, path.join(root, '作品', '作品甲'), masterDir);
    keep.加(path.join(masterDir('6-甲'), 'cccccccccccccccc.mp4'), { type: '当前', note: '视频' });
    expect(deletedFingerprints(planKeep(keep))).toEqual(['aaaaaaaaaaaaaaaa']);
  });

  it('认可记录读的是 anim verify accept 写的格式；读不出的整段留着', () => {
    const f = writeFile('认可/x.toml', approvalText(ApprovalRecord('核对-冒烟', 'd'.repeat(64))));
    expect(readApprovedFingerprint(f)).toEqual({ segment: '核对-冒烟', fingerprint: 'd'.repeat(64) });
    makeMaster('6-乙', 'aaaaaaaaaaaaaaaa', '视频', 9);
    makeMaster('6-乙', 'bbbbbbbbbbbbbbbb', '视频', 8);
    writeFile('作品/作品甲/认可/darwin-arm64/6-乙.toml', '坏了');
    const warnings: string[] = [];
    const keep = new KeepSet();
    addApprovals(keep, path.join(root, '作品', '作品甲'), masterDir, (s) => warnings.push(s));
    expect(deletedFingerprints(planKeep(keep))).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it('交付 manifest（版本 3）引用的切片留着：按作品、段键、画面指纹、声音指纹算；v1、v2 的不认；解钉默认关，自足的只在说明里标出', () => {
    makeMaster('6-甲', 'aaaaaaaaaaaaaaaa', '视频', 9);
    makeMaster('6-甲', 'bbbbbbbbbbbbbbbb', '视频', 8);
    makeMaster('6-甲', 'cccccccccccccccc', '视频', 1);
    const segments = [{ key: '6-甲', pictureFingerprint: 'a'.repeat(16) + 'f'.repeat(48), soundFingerprint: 'e'.repeat(64) }];
    writeFile('交付/作品甲/1030-0000-新/manifest.json', JSON.stringify({ version: 3, work: '作品甲', segment: segments }));
    writeFile('交付/作品甲/1030-0000-新/全片-未拉响度.flac', '');
    writeFile('交付/作品甲/1021-1755-旧/manifest.json', JSON.stringify({ segment: [{ key: '6-甲', master: 'cache/母版/作品甲/6-甲/bbbbbbbbbbbbbbbb.mkv', fingerprint: 'b'.repeat(64) }] }));
    const keep = new KeepSet();
    addDelivery(keep, path.join(root, '交付'), root);
    expect(deletedFingerprints(planKeep(keep))).toEqual(['bbbbbbbbbbbbbbbb']);
    expect(keep.reasonsFor(path.join(masterDir('6-甲'), 'aaaaaaaaaaaaaaaa.mp4')).map((x) => x.note)).toEqual(['作品甲/1030-0000-新（已自足）']);
    expect(keep.reasonsFor(path.join(masterDir('6-甲'), 'eeeeeeeeeeeeeeee.wav')).map((x) => x.note)).toEqual(['作品甲/1030-0000-新（已自足）']);
    expect(deliveryRefs({ segment: [{ key: '6-甲', master: 'x' }, { key: '6-甲', fingerprint: 'a'.repeat(64) }] }, '作品甲')).toEqual([]);
    expect(deliveryRefs(null)).toEqual([]);
  });

  it('解钉打开：有 FLAC 就不再钉母版（剪辑包用户 11-06 定不要了）；没 FLAC 的照钉', () => {
    makeMaster('6-甲', 'aaaaaaaaaaaaaaaa', '视频', 9);
    makeMaster('6-甲', 'bbbbbbbbbbbbbbbb', '视频', 8);
    makeMaster('6-甲', 'cccccccccccccccc', '视频', 1);
    writeFile('交付/作品甲/1030-0000-新/manifest.json', JSON.stringify({ version: 3, work: '作品甲', segment: [{ key: '6-甲', pictureFingerprint: 'a'.repeat(64) }] }));
    const unpack = () => {
      const keep = new KeepSet();
      addDelivery(keep, path.join(root, '交付'), root, () => {}, { unpin: true });
      return deletedFingerprints(planKeep(keep));
    };
    expect(unpack()).toEqual(['bbbbbbbbbbbbbbbb']);
    writeFile('交付/作品甲/1030-0000-新/全片-未拉响度.flac', '');
    expect(unpack()).toEqual(['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb']);
  });

  it('认可：有这条认可记录的认可参考才可解钉（参考按记录的抽样哈希起名，同一指纹旧记录的参考不算）；解钉默认关，照钉、说明里标出', () => {
    makeMaster('6-甲', 'aaaaaaaaaaaaaaaa', '视频', 9);
    makeMaster('6-甲', 'cccccccccccccccc', '视频', 1);
    const approval = ApprovalRecord('6-甲', 'a'.repeat(16) + 'f'.repeat(48));
    writeFile('作品/作品甲/认可/darwin-arm64/6-甲.toml', approvalText(approval));
    const referenceFile = (file: string, hostPlatform: string) => {
      const r = readApproval(file);
      return r && path.join(root, '认可参考', '作品甲', hostPlatform, r.segment, `${r.fingerprint.slice(0, 16)}-${sampleKey(r)}.mkv`);
    };
    const runGc = (unpin: boolean) => {
      const keep = new KeepSet();
      addApprovals(keep, path.join(root, '作品', '作品甲'), masterDir, () => {}, { unpin, referenceFile });
      return { removed: deletedFingerprints(planKeep(keep)), note: keep.reasonsFor(path.join(masterDir('6-甲'), 'aaaaaaaaaaaaaaaa.mp4')).map((x) => x.note) };
    };
    expect(runGc(true)).toEqual({ removed: [], note: ['darwin-arm64'] }); // 没参考：解钉也照钉
    // 同一指纹上一次认可的参考（哈希不一样）不算这条记录的
    writeFile(`认可参考/作品甲/darwin-arm64/6-甲/aaaaaaaaaaaaaaaa-${sampleKey({ ...approval, frame: approval.frame.map((f) => ({ ...f, hash: '9'.repeat(64) })) })}.mkv`, '');
    expect(runGc(true)).toEqual({ removed: [], note: ['darwin-arm64'] });
    writeFile(`认可参考/作品甲/darwin-arm64/6-甲/aaaaaaaaaaaaaaaa-${sampleKey(approval)}.mkv`, '');
    expect(runGc(false)).toEqual({ removed: [], note: ['darwin-arm64（有认可参考）'] });
    expect(runGc(true)).toEqual({ removed: ['aaaaaaaaaaaaaaaa'], note: [] });
  });

  it('每个级别留最近一份，近期天数里渲的都留', () => {
    makeMaster('6-甲', 'aaaaaaaaaaaaaaaa', '视频', 9);
    makeMaster('6-甲', 'bbbbbbbbbbbbbbbb', '视频', 8); // 视频最近一份
    makeMaster('6-甲', 'cccccccccccccccc', '预览', 9);
    makeMaster('6-甲', 'dddddddddddddddd', '预览', 5); // 预览最近一份
    const r = planKeep(new KeepSet());
    expect(deletedFingerprints(r)).toEqual(['aaaaaaaaaaaaaaaa', 'cccccccccccccccc']);
    expect(deletedFingerprints(planKeep(new KeepSet(), 10))).toEqual([]);
  });

  it('最近一份按 .指纹.json 的时间排：删完以后 film --允许过期（历史指纹）取的还是原来那份', () => {
    // 迁移时把 aaaa 的母版硬链接到新指纹 bbbb 名下：bbbb.mp4 是旧时间，bbbb.指纹.json 是新的
    const a = makeMaster('6-甲', 'aaaaaaaaaaaaaaaa', '视频', 9, 100);
    makeMaster('6-甲', 'cccccccccccccccc', '视频', 8, 200);
    const b = path.join(masterDir('6-甲'), 'bbbbbbbbbbbbbbbb.mp4');
    fs.linkSync(a, b);
    writeFile('cache/母版/作品甲/6-甲/bbbbbbbbbbbbbbbb.指纹.json', JSON.stringify({ segment: '6-甲', fingerprint: 'b'.repeat(64), items: { renderSettings: { inputProps: { level: '视频' } } } }), now - 3 * dayMs);
    const latestFingerprint = () => fingerprintHistory('6-甲', masterDir('6-甲')).find((h) => fs.existsSync(path.join(masterDir('6-甲'), `${h.fingerprint.slice(0, 16)}.mp4`)))?.fingerprint.slice(0, 16);
    expect(latestFingerprint()).toBe('bbbbbbbbbbbbbbbb');
    const r = planKeep(new KeepSet());
    expect(deletedFingerprints(r)).toEqual(['aaaaaaaaaaaaaaaa', 'cccccccccccccccc']);
    for (const f of r) if (!f.reason.length) fs.rmSync(f.path);
    expect(latestFingerprint()).toBe('bbbbbbbbbbbbbbbb');
  });

  it('当前指纹算不出的段整个目录留着', () => {
    makeMaster('6-甲', 'aaaaaaaaaaaaaaaa', '视频', 9);
    makeMaster('6-甲', 'bbbbbbbbbbbbbbbb', '视频', 8);
    const keep = new KeepSet();
    keep.addDir(masterDir('6-甲'), { type: '算不出', note: '当前指纹算不出' });
    expect(deletedFingerprints(planKeep(keep))).toEqual([]);
    // 目录名是前缀的别的段不受影响
    makeMaster('6-甲乙', 'aaaaaaaaaaaaaaaa', '视频', 9);
    makeMaster('6-甲乙', 'bbbbbbbbbbbbbbbb', '视频', 8);
    expect(planKeep(keep).filter((f) => !f.reason.length).map((f) => f.key)).toEqual(['6-甲乙']);
  });

  it('作品读不出时（不在代码里）母版目录整个留着', async () => {
    const keep = new KeepSet();
    const warnings: string[] = [];
    await addCurrentFingerprints(keep, '没有这部作品', (s) => warnings.push(s));
    expect([...keep.目录.keys()].map((k) => path.basename(path.dirname(k)) + '/' + path.basename(k))).toEqual(['母版/没有这部作品']);
    expect(warnings[0]).toMatch(/清单读不出/);
  });

  it('只删媒体文件，.指纹.json 留着；执行前文件又被改过就跳过', async () => {
    const oldMaster = makeMaster('6-甲', 'aaaaaaaaaaaaaaaa', '视频', 9);
    const justModified = makeMaster('6-甲', 'bbbbbbbbbbbbbbbb', '视频', 8);
    makeMaster('6-甲', 'cccccccccccccccc', '视频', 7);
    const plan: ReclaimPlan = { media: planKeep(new KeepSet()), tempFiles: [], staging: [], 打包: [], drafts: [], columnSegs: [], webpack: [], reportOnly: [], unknownGroups: [], dedupePlan: null, warnings: [] };
    expect(deletedFingerprints(plan.media)).toEqual(['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb']);
    fs.utimesSync(justModified, new Date(), new Date());
    const r = await runReclaim(plan, { recentDays: 2, draftDays: 14, webpackDays: 3, columnSegDays: 90 });
    expect(r).toMatchObject({ deletedCount: 1, deletedSize: 100, failed: [] });
    expect(r.skipped).toHaveLength(1);
    expect(fs.existsSync(oldMaster)).toBe(false);
    expect(fs.existsSync(oldMaster.replace(/\.mp4$/, '.指纹.json'))).toBe(true);
    expect(fs.existsSync(justModified)).toBe(true);
  });

  it('硬链接：名字全删了才算腾出空间，留下的同一 inode 只算一次', () => {
    const a = makeMaster('6-甲', 'aaaaaaaaaaaaaaaa', '视频', 9);
    fs.linkSync(a, path.join(masterDir('6-甲'), 'bbbbbbbbbbbbbbbb.mp4'));
    const bjson = path.join(masterDir('6-甲'), 'bbbbbbbbbbbbbbbb.指纹.json');
    fs.copyFileSync(a.replace(/\.mp4$/, '.指纹.json'), bjson);
    fs.utimesSync(bjson, new Date(now - 9 * dayMs), new Date(now - 9 * dayMs));
    makeMaster('6-甲', 'cccccccccccccccc', '视频', 7);
    const deleteAll = Subtotal(planKeep(new KeepSet()).filter((f) => f.fingerprint !== 'cccccccccccccccc'));
    expect(deleteAll).toMatchObject({ deletedCount: 2, deletedSize: 100, hardlinkUnfreed: 0 });
    const keep = new KeepSet();
    keep.加(a, { type: '交付', note: 'x' });
    const keepOne = Subtotal(planKeep(keep).filter((f) => f.fingerprint !== 'cccccccccccccccc'));
    expect(keepOne).toMatchObject({ deletedCount: 1, deletedSize: 0, keptCount: 1, keptSize: 100 });
    // 另一个名字不在这次计划里（比如在别处）：删了也不腾
    expect(Subtotal(planKeep(new KeepSet()).filter((f) => f.fingerprint === 'aaaaaaaaaaaaaaaa'))).toMatchObject({ deletedSize: 0, hardlinkUnfreed: 100 });
  });
});

describe('残留、草稿、webpack', () => {
  it('崩掉留下的临时文件超过 1 天才删', () => {
    expect(isTempName('aaaaaaaaaaaaaaaa.渲染中-123.mkv')).toBe(true);
    expect(isTempName('x.指纹.json.写入中-9')).toBe(true);
    expect(isTempName('aaaaaaaaaaaaaaaa.mkv')).toBe(false);
    const r = planTemp([{ path: 'a', size: 1, modifiedAt: now - 2 * dayMs }, { path: 'b', size: 1, modifiedAt: now - 3600_000 }], now);
    expect(r.map((x) => x.reason.length)).toEqual([0, 1]);
  });

  it('草稿按目录里最近改动的时间算，超过天数的删', () => {
    writeFile('run/草稿/1001-0000-工作-旧/01.png', 'x', now - 20 * dayMs);
    writeFile('run/草稿/1028-0000-工作-新/01.png', 'x', now - 2 * dayMs);
    writeFile('run/草稿/1001-0000-工作-旧但刚加/01.png', 'x', now - 20 * dayMs);
    writeFile('run/草稿/1001-0000-工作-旧但刚加/02.png', 'x', now - 1 * dayMs);
    // 目录自己的修改时间是刚建的，拨回去，只看里面的文件
    for (const e of listDir(path.join(root, 'run', '草稿'))) fs.utimesSync(e.path, new Date(now - 30 * dayMs), new Date(now - 30 * dayMs));
    const r = planDrafts(listDir(path.join(root, 'run', '草稿')), { now, days: 14 });
    expect(r.filter((x) => !x.reason.length).map((x) => x.name)).toEqual(['1001-0000-工作-旧']);
  });

  it('不认识的条目只列出来（带大小），认识的不列', () => {
    writeFile('run/草稿/a/01.png', 'xx');
    writeFile('run/会话交接-1024/b.bin', 'xxxx');
    writeFile('run/零散.txt', 'x');
    expect(unrecognizedEntries(path.join(root, 'run'), ['草稿']).map((e) => [e.name, e.size]).sort()).toEqual([['会话交接-1024', 4], ['零散.txt', 1]]);
    expect(unrecognizedEntries(path.join(root, '没有'), [])).toEqual([]);
  });

  it('webpack：旧 Remotion 版本整个删；同版本每个环境留最近 N 份，其余超过天数的删；认不得的只报告', () => {
    const wp = path.join(root, 'webpack');
    writeFile('webpack/remotion-production-4.0.530/h1/0.pack', 'x', now - 9 * dayMs);
    writeFile('webpack/remotion-production-4.0.537/h2/0.pack', 'x', now - 9 * dayMs);
    writeFile('webpack/remotion-production-4.0.537/h3/0.pack', 'x', now - 6 * dayMs);
    writeFile('webpack/remotion-production-4.0.537/h4/0.pack', 'x', now - 5 * dayMs);
    writeFile('webpack/remotion-production-4.0.537/h5/0.pack', 'x', now - 1 * dayMs);
    writeFile('webpack/remotion-development-4.0.537/h6/0.pack', 'x', now - 30 * dayMs);
    writeFile('webpack/别的东西/x', 'x');
    const scanResult = scanWebpack(wp, '4.0.537');
    expect(scanResult.unknownEntries.map((e) => e.name)).toEqual(['别的东西']);
    const planRemove = (n: number) => planWebpack(scanResult.entryList, { currentVersion: '4.0.537', now, days: 3, keepPerEnv: n }).filter((e) => !e.reason.length).map((e) => e.name).sort();
    expect(planRemove(1)).toEqual(['remotion-production-4.0.530', 'remotion-production-4.0.537/h2', 'remotion-production-4.0.537/h3', 'remotion-production-4.0.537/h4']);
    expect(planRemove(2)).toEqual(['remotion-production-4.0.530', 'remotion-production-4.0.537/h2', 'remotion-production-4.0.537/h3']);
    // 不知道装的版本：不按版本删，各版本各留最近的
    const undecided = planWebpack(scanWebpack(wp, null).entryList, { currentVersion: null, now, days: 3 });
    expect(undecided.filter((e) => !e.reason.length).map((e) => e.name).sort()).toEqual(['remotion-production-4.0.537/h2', 'remotion-production-4.0.537/h3', 'remotion-production-4.0.537/h4']);
  });
});

describe('地形暂存', () => {
  it('锁有活着的持有者的留；1 天内动过的留；别的（烘焙中断留下的）删；.lock 文件不算目录', () => {
    writeFile('run/暂存/terrain/甲/a.bin', 'x', now - 3 * dayMs);
    writeFile('run/暂存/terrain/乙/a.bin', 'x', now - 3 * dayMs);
    writeFile('run/暂存/terrain/乙.写入.lock', `${process.pid}\n`);
    writeFile('run/暂存/terrain/丙/a.bin', 'x', now - 3600 * 1000);
    writeFile('run/暂存/terrain/丁/a.bin', 'x', now - 3 * dayMs);
    writeFile('run/暂存/terrain/丁.写入.lock', '999999999\n');
    const r = planStaging(scanStaging(path.join(root, 'run', '暂存', 'terrain'), '本机'), now);
    const reasonsByName = Object.fromEntries(r.map((e) => [e.name, e.reason.map((x) => x.type).join(',')]));
    expect(reasonsByName).toEqual({ 甲: '', 乙: '在用', 丙: '近期', 丁: '' });
  });
});

describe('列段', () => {
  it('超过天数没读过的才删，新近用过的留着（文件在 <sha 前 2>/ 下一层）', async () => {
    writeFile('cache/列段/ab/ab旧.列段', 'xx', now - 100 * dayMs);
    writeFile('cache/列段/ab/ab新.列段', 'x', now - 10 * dayMs);
    const plan = { media: [], tempFiles: [], staging: [], 打包: [], drafts: [], columnSegs: planDrafts(listDir(path.join(root, 'cache', '列段')).flatMap((d) => listDir(d.path)), { now, days: 90 }), webpack: [], reportOnly: [], unknownGroups: [], dedupePlan: null, warnings: [] } as ReclaimPlan;
    expect(plan.columnSegs.filter((f) => !f.reason.length).map((f) => f.name)).toEqual(['ab旧.列段']);
    const r = await runReclaim(plan, { recentDays: 2, draftDays: 14, webpackDays: 3, columnSegDays: 90 }, now);
    expect(r.deletedCount).toBe(1);
    expect(fs.existsSync(path.join(root, 'cache/列段/ab/ab旧.列段'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'cache/列段/ab/ab新.列段'))).toBe(true);
  });
});

describe('认得的目录', () => {
  it('列段、核对、音频数、映射、temperature、sha缓存.json、run/暂存 不再报不认识；只报目录都在 cache 认得的里', () => {
    for (const cacheDir of ['列段', '核对', '音频数', '映射', 'temperature', 'sha缓存.json', '会话交接']) writeFile(`cache/${cacheDir}/x`, 'x');
    writeFile('run/暂存/terrain/x', 'x');
    writeFile('run/会话交接-1024/x', 'x');
    expect(unrecognizedEntries(path.join(root, 'cache'), cacheKnownNames).map((e) => e.name)).toEqual(['会话交接']);
    expect(unrecognizedEntries(path.join(root, 'run'), runKnownNames).map((e) => e.name)).toEqual(['会话交接-1024']);
    for (const k of Object.keys(reportOnlyDirs)) expect(cacheKnownNames).toContain(k.replace(/^cache\//, ''));
  });
});
