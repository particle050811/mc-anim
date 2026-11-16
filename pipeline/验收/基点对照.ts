import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mainCheckout } from '../环境/路径.ts';
import { utcMonthDayTime } from '../运行记录/记录.ts';
import { stableJson } from '../指纹/指纹.ts';
import type { FrameCompare } from './认指纹.ts';

export type SampleBasis = { work: string; segment: string; oldFingerprint: string; 旧片sha: string; width: number; height: number; totalFrameCount: number; 帧号: number[]; level: string; platform: string; host: string; backend: string; outputFps: number; scale: number; threshold: string };
export type SampleEvidence = { version: 1; 口径: SampleBasis; fingerprint: string; commit: string; reason: string; frame: (FrameCompare & { sha: string })[] };
const digest = (content: Buffer | string) => createHash('sha256').update(content).digest('hex');
const frameName = (frame: number) => `第${String(frame).padStart(4, '0')}帧.png`;
const sampleFileName = '抽样.json';

export const saveSampleImage = (dir: string, frame: number, frameBytes: Buffer) => {
  fs.writeFileSync(path.join(dir, frameName(frame)), frameBytes, { flag: 'wx' });
  return digest(frameBytes);
};
export const saveSampleTable = (dir: string, sampleEvidence: SampleEvidence) => fs.writeFileSync(path.join(dir, sampleFileName), JSON.stringify(sampleEvidence, null, 2), { flag: 'wx' });
export const readBaseline = (dir: string): SampleEvidence => {
  const sampleEvidence = JSON.parse(fs.readFileSync(path.join(dir, sampleFileName), 'utf8')) as SampleEvidence;
  if (sampleEvidence.version !== 1 || !Array.isArray(sampleEvidence.frame) || !sampleEvidence.frame.length || !Array.isArray(sampleEvidence.口径?.帧号) || sampleEvidence.frame.length !== sampleEvidence.口径.帧号.length) throw new Error('基点抽样不完整或版本不符，请重新留基点');
  if (!sampleEvidence.frame.every((sample, index) => Number.isSafeInteger(sample.frame) && sample.frame >= 0 && sample.frame < sampleEvidence.口径.totalFrameCount && sample.frame === sampleEvidence.口径.帧号[index] && (!index || sample.frame > sampleEvidence.frame[index - 1]!.frame) && ['一样', '噪声内', '不同'].includes(sample.verdict))) throw new Error('基点帧号或旧片比较结论不完整');
  for (const sample of sampleEvidence.frame) if (digest(fs.readFileSync(path.join(dir, frameName(sample.frame)))) !== sample.sha) throw new Error(`基点第 ${sample.frame} 帧和存档哈希不符`);
  return sampleEvidence;
};
export const checkBasis = (baseline: SampleBasis, candidate: SampleBasis) => {
  for (const propKey of Object.keys(candidate) as (keyof SampleBasis)[]) {
    if (stableJson(baseline[propKey]) !== stableJson(candidate[propKey])) throw new Error(`基点和候选的「${propKey}」不一致，不作归因`);
  }
};

export const compareWithBaseline = (baseDir: string, baseline: SampleEvidence, currentDir: string, candidate: SampleEvidence, previewRoot = path.join(mainCheckout(), '预览')) => {
  checkBasis(baseline.口径, candidate.口径);
  if (candidate.frame.length !== baseline.frame.length || candidate.frame.some((sample, index) => sample.frame !== baseline.frame[index]!.frame)) throw new Error('基点和候选出帧不齐，不作归因');
  if (candidate.frame.some((sample, index) => sample.sha === baseline.frame[index]!.sha && sample.verdict !== baseline.frame[index]!.verdict)) throw new Error('相同 PNG 对同一旧片的比较结论不一致，不作归因');
  const differing = candidate.frame.filter((sample, index) => sample.sha !== baseline.frame[index]!.sha);
  const baseDiffs = baseline.frame.filter(sample => sample.verdict === '不同');
  const verdict = differing.length ? `候选与基点有 ${differing.length} 张 PNG 不同，不能把差异全归给基点。` : baseDiffs.length ? `基点自身有 ${baseDiffs.length} 帧不认；候选的全部抽样 PNG 与基点完全相同，抽中帧对旧片的差异来自基点。` : '基点、候选的抽样 PNG 完全相同，基点抽样未超旧片门槛。';
  const shortHash = digest(stableJson([baseline, candidate])).slice(0, 20);
  // 同一对证据重复交接只发一份；先在私有草稿内领下第一次交接的 UTC 时刻。
  const receiptDir = path.join(baseDir, `交接-${shortHash}`);
  fs.mkdirSync(receiptDir, { recursive: true });
  const dir = path.join(previewRoot, `${utcMonthDayTime(fs.statSync(receiptDir).birthtimeMs)}-认指纹对照-${candidate.口径.segment}-${shortHash}`);
  fs.mkdirSync(previewRoot, { recursive: true });
  const frame = (differing[0] ?? baseDiffs[0] ?? candidate.frame[0]!).frame;
  const baselineImageName = `01-基点-${frameName(frame)}`, candidateImageName = `02-候选-${frameName(frame)}`;
  const frameTable = candidate.frame.map((sample, index) => `| ${sample.frame} | ${baseline.frame[index]!.verdict} | ${sample.verdict} | ${sample.sha === baseline.frame[index]!.sha ? '相同' : '不同'} |`).join('\n');
  const body = `# ${candidate.口径.segment}：基点／候选对照\n\n${verdict}\n\n旧切片：${candidate.口径.oldFingerprint}。基点 ${baseline.commit}（${baseline.reason}）；候选 ${candidate.commit}（${candidate.reason}）。\n\n只比 ${candidate.frame.length} 个输出帧；不证明整段或声音相同，没有登记沿用或认可。\n\n| 第 ${frame} 帧：基点 | 候选 |\n|---|---|\n| ![基点](${baselineImageName}) | ![候选](${candidateImageName}) |\n\n| 帧 | 基点对旧片 | 候选对旧片 | 基点／候选 PNG |\n|---|---|---|---|\n${frameTable}\n\n完整 SHA 见抽样表。\n\n你的回复：\n`;
  if (!fs.existsSync(path.join(dir, '00-说明.md'))) {
    const stageDir = fs.mkdtempSync(path.join(previewRoot, '.认指纹-'));
    try {
      fs.copyFileSync(path.join(baseDir, frameName(frame)), path.join(stageDir, baselineImageName));
      fs.copyFileSync(path.join(currentDir, frameName(frame)), path.join(stageDir, candidateImageName));
      fs.writeFileSync(path.join(stageDir, '03-抽样.json'), JSON.stringify({ 基点: baseline, 候选: candidate }, null, 2));
      fs.writeFileSync(path.join(stageDir, '00-说明.md'), body);
      try { fs.renameSync(stageDir, dir); } catch (error) { if (!fs.existsSync(path.join(dir, '03-抽样.json'))) throw error; }
    } finally { fs.rmSync(stageDir, { recursive: true, force: true }); }
  }
  return { 目录: dir, verdictText: verdict, candidateDiffers: differing.length > 0 };
};
