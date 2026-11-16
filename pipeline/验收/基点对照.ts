import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mainCheckout } from '../环境/路径.ts';
import { utcMonthDayTime } from '../运行记录/记录.ts';
import { stableJson } from '../指纹/指纹.ts';
import type { FrameCompare } from './认指纹.ts';

export type SampleBasis = { 作品: string; 段: string; 旧指纹: string; 旧片sha: string; 宽: number; 高: number; 总帧数: number; 帧号: number[]; 级别: string; 平台: string; 主机: string; 后端: string; 输出fps: number; 缩放: number; 阈值: string };
export type SampleEvidence = { 版本: 1; 口径: SampleBasis; 指纹: string; 提交: string; 理由: string; 帧: (FrameCompare & { sha: string })[] };
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
  if (sampleEvidence.版本 !== 1 || !Array.isArray(sampleEvidence.帧) || !sampleEvidence.帧.length || !Array.isArray(sampleEvidence.口径?.帧号) || sampleEvidence.帧.length !== sampleEvidence.口径.帧号.length) throw new Error('基点抽样不完整或版本不符，请重新留基点');
  if (!sampleEvidence.帧.every((sample, index) => Number.isSafeInteger(sample.帧) && sample.帧 >= 0 && sample.帧 < sampleEvidence.口径.总帧数 && sample.帧 === sampleEvidence.口径.帧号[index] && (!index || sample.帧 > sampleEvidence.帧[index - 1]!.帧) && ['一样', '噪声内', '不同'].includes(sample.结论))) throw new Error('基点帧号或旧片比较结论不完整');
  for (const sample of sampleEvidence.帧) if (digest(fs.readFileSync(path.join(dir, frameName(sample.帧)))) !== sample.sha) throw new Error(`基点第 ${sample.帧} 帧和存档哈希不符`);
  return sampleEvidence;
};
export const checkBasis = (baseline: SampleBasis, candidate: SampleBasis) => {
  for (const propKey of Object.keys(candidate) as (keyof SampleBasis)[]) {
    if (stableJson(baseline[propKey]) !== stableJson(candidate[propKey])) throw new Error(`基点和候选的「${propKey}」不一致，不作归因`);
  }
};

export const compareWithBaseline = (baseDir: string, baseline: SampleEvidence, currentDir: string, candidate: SampleEvidence, previewRoot = path.join(mainCheckout(), '预览')) => {
  checkBasis(baseline.口径, candidate.口径);
  if (candidate.帧.length !== baseline.帧.length || candidate.帧.some((sample, index) => sample.帧 !== baseline.帧[index]!.帧)) throw new Error('基点和候选出帧不齐，不作归因');
  if (candidate.帧.some((sample, index) => sample.sha === baseline.帧[index]!.sha && sample.结论 !== baseline.帧[index]!.结论)) throw new Error('相同 PNG 对同一旧片的比较结论不一致，不作归因');
  const differing = candidate.帧.filter((sample, index) => sample.sha !== baseline.帧[index]!.sha);
  const baseDiffs = baseline.帧.filter(sample => sample.结论 === '不同');
  const verdict = differing.length ? `候选与基点有 ${differing.length} 张 PNG 不同，不能把差异全归给基点。` : baseDiffs.length ? `基点自身有 ${baseDiffs.length} 帧不认；候选的全部抽样 PNG 与基点完全相同，抽中帧对旧片的差异来自基点。` : '基点、候选的抽样 PNG 完全相同，基点抽样未超旧片门槛。';
  const shortHash = digest(stableJson([baseline, candidate])).slice(0, 20);
  // 同一对证据重复交接只发一份；先在私有草稿内领下第一次交接的 UTC 时刻。
  const receiptDir = path.join(baseDir, `交接-${shortHash}`);
  fs.mkdirSync(receiptDir, { recursive: true });
  const dir = path.join(previewRoot, `${utcMonthDayTime(fs.statSync(receiptDir).birthtimeMs)}-认指纹对照-${candidate.口径.段}-${shortHash}`);
  fs.mkdirSync(previewRoot, { recursive: true });
  const frame = (differing[0] ?? baseDiffs[0] ?? candidate.帧[0]!).帧;
  const baselineImageName = `01-基点-${frameName(frame)}`, candidateImageName = `02-候选-${frameName(frame)}`;
  const frameTable = candidate.帧.map((sample, index) => `| ${sample.帧} | ${baseline.帧[index]!.结论} | ${sample.结论} | ${sample.sha === baseline.帧[index]!.sha ? '相同' : '不同'} |`).join('\n');
  const body = `# ${candidate.口径.段}：基点／候选对照\n\n${verdict}\n\n旧切片：${candidate.口径.旧指纹}。基点 ${baseline.提交}（${baseline.理由}）；候选 ${candidate.提交}（${candidate.理由}）。\n\n只比 ${candidate.帧.length} 个输出帧；不证明整段或声音相同，没有登记沿用或认可。\n\n| 第 ${frame} 帧：基点 | 候选 |\n|---|---|\n| ![基点](${baselineImageName}) | ![候选](${candidateImageName}) |\n\n| 帧 | 基点对旧片 | 候选对旧片 | 基点／候选 PNG |\n|---|---|---|---|\n${frameTable}\n\n完整 SHA 见抽样表。\n\n你的回复：\n`;
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
