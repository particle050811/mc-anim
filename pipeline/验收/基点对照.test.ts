import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { compareWithBaseline, saveSampleTable, saveSampleImage, checkBasis, readBaseline, type SampleEvidence } from './基点对照.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
const setupFixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '基点对照-'));
  roots.push(root);
  const writeFixture = (dirName: string, content: string) => {
    const dir = path.join(root, dirName);
    fs.mkdirSync(dir);
    const evidence: SampleEvidence = { version: 1, commit: dirName, reason: '核对', fingerprint: dirName, 口径: { work: '甲', segment: '乙', oldFingerprint: '旧', 旧片sha: '片', width: 32, height: 32, totalFrameCount: 1, 帧号: [0], level: '视频', platform: '测试', host: '甲', backend: 'gl', outputFps: 60, scale: 3, threshold: '同一套' }, frame: [{ frame: 0, verdict: '不同', sha: saveSampleImage(dir, 0, Buffer.from(content)) }] };
    saveSampleTable(dir, evidence);
    return { 目录: dir, evidence: readBaseline(dir) };
  };
  return { root: root, 留: writeFixture };
};
it('基点自己不认旧片，候选抽样相同；同对证据重复交接只生成一个平铺报告', () => {
  const { root: root, 留: writeFixture } = setupFixture(), baseline = writeFixture('基点', '旧差'), candidate = writeFixture('候选', '旧差'), previewDir = path.join(root, '预览');
  const compareBaseline = () => compareWithBaseline(baseline.目录, baseline.evidence, candidate.目录, candidate.evidence, previewDir);
  const report = compareBaseline();
  expect(report.verdictText).toContain('来自基点');
  expect(compareBaseline().目录).toBe(report.目录);
  expect(fs.readdirSync(previewDir)).toHaveLength(1);
  expect(fs.readdirSync(report.目录)).toHaveLength(4);
});
it('候选也不认同一帧但 PNG 不同，不把差异归给基点', () => {
  const { root: root, 留: writeFixture } = setupFixture(), baseline = writeFixture('基点', '甲'), candidate = writeFixture('候选', '乙');
  expect(compareWithBaseline(baseline.目录, baseline.evidence, candidate.目录, candidate.evidence, path.join(root, '预览')).candidateDiffers).toBe(true);
});
it('旧片被替换、抽样缺失、旧片判定矛盾或 PNG 损坏时不出归因报告', () => {
  const { root: root, 留: writeFixture } = setupFixture(), baseline = writeFixture('基点', '甲'), candidate = writeFixture('候选', '甲');
  expect(() => checkBasis(baseline.evidence.口径, { ...baseline.evidence.口径, 旧片sha: '换' })).toThrow('旧片sha');
  expect(() => compareWithBaseline(baseline.目录, baseline.evidence, candidate.目录, { ...candidate.evidence, frame: [] }, root)).toThrow('不齐');
  candidate.evidence.frame[0]!.verdict = '一样';
  expect(() => compareWithBaseline(baseline.目录, baseline.evidence, candidate.目录, candidate.evidence, root)).toThrow('结论不一致');
  fs.writeFileSync(path.join(baseline.目录, '第0000帧.png'), '被改了');
  expect(() => readBaseline(baseline.目录)).toThrow('哈希不符');
});
