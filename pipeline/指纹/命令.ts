// anim stale [<选择器…>] [--level …] [--verbose] [--strict]：每段现在的切片分三态：✓ 渲过、切片（mp4 + wav）在；◐ 渲过（有 .指纹.json 或段签）、切片不在，要用时重渲；
// ✗ 过期（这个画面指纹没渲过），和同一档最近一次渲过的指纹比，说明是哪项变了。切片在、段签缺的另标「缺段签」（verify、认指纹 用到时自动补）。
// 指纹和 anim film 同一套算法（渲/段产物.ts：带这段的字幕、按成片输出帧率）；所有段一次建图算。默认退出码总是 0；--strict 时有过期段（✗）退出码 1（给脚本、CI 用），◐ 不算过期。
// ✓ 里 anim reuse 登记的另标「沿用 <旧指纹>」：切片是旧指纹那份的克隆，没真渲过。
// anim reuse <选择器…> --reason … [--sample <n>] [--level …] [--dry-run]：过期的段抽帧和旧切片比，都在压缩噪声内就登记成沿用旧切片（认指纹.ts，决策/0013）。
import fs from 'node:fs';
import type { Command } from '../cli/命令.ts';
import { UsageError, parseArgs } from '../cli/参数.ts';
import { loadAllSegments, selectSegs } from '../清单/清单.ts';
import { fingerprintHistory, fingerprintFile } from '../渲/母版.ts';
import { readSegStamp, segStampComplete } from '../验收/段签.ts';
import { segmentProducts, sameTier, isPictureRecord, type SegArtifact } from '../渲/段产物.ts';
import { renderLabel } from '../渲/渲.ts';
import { estimateTiming } from '../运行记录/记录.ts';
import { renderLevels, type RenderLevel } from '../../engine/段/设置值.ts';
import { fingerprintDiff, stableJson, type SegFingerprint } from './指纹.ts';
import type { SegInfo } from '../清单/清单.ts';
import type { RunRecord } from '../运行记录/记录.ts';
import { workName, workRoot } from '../环境/作品.ts';
import { commitStatus } from '../环境/路径.ts';
import { segStampDir } from '../环境/作品数据.ts';
import { config } from '../环境/配置.ts';
import { newPreviewDir } from '../预览/预览.ts';
import { readBaseline, compareWithBaseline, checkBasis, saveSampleImage, saveSampleTable, type SampleEvidence } from '../验收/基点对照.ts';
import { openSession, findComposition, renderFramesSamePage, missingLocalTerrain } from '../渲/渲.ts';
import { segRenderEnv } from '../渲/地形注入.ts';
import { recordMeasuredFrames } from '../渲/地形用量.ts';
import { waitSolveCacheWrites } from '../渲/求解缓存收集.ts';
import { perGroupWithResourcePacks } from '../资产/资产锁.ts';
import { lazyPassGate, passRenderGate } from '../闸/闸.ts';
import { recordPhase } from '../运行记录/阶段.ts';
import { DetailCollector } from '../运行记录/渲染明细.ts';
import { readThresholds } from '../验收/比较.ts';
import { frameNumText } from '../验收/逐帧校验.ts';
import { checkSelectedSegCues, runCuesBeforeRender } from '../段框架/自动.ts';
import { DEFAULT_SAMPLE_COUNT, pickFrames, findOldVersion, hasNewFingerprint, readOldFrames, compareFrame, registerReuse, stillCannotProve, frameToYuv, type FrameCompare, type OldVersion } from '../验收/认指纹.ts';

const parseLevel = (v: string | undefined): RenderLevel => {
  const level = (v ?? '视频') as RenderLevel;
  if (!renderLevels.includes(level)) throw new UsageError(`--level 只能是 ${renderLevels.join('、')}`);
  return level;
};

// 只渲一截时第一帧的读地形摊不到，单独加上（和 逐帧校验 的估法一样）
const FIRST_FRAME_SEC = 15;
const maxListedDiffFrames = 8;

type SegPlan = { 段: SegInfo; 产物: SegArtifact; 新: SegFingerprint; oldVersion: OldVersion; 帧: number[] };

/** anim reuse：见 认指纹.ts 文件头。返回退出码：选中的过期段有没认下来的（不同、没有旧切片、静帧证明不了）是 1 */
export const runFingerprintAccept = async (segments: readonly SegInfo[], o: { 理由: string; sampleCount: number; 级别: RenderLevel; viewOnly: boolean; runRecord: RunRecord; saveBaseline?: boolean; compareBaseline?: string }): Promise<number> => {
  const { runRecord, 级别: level } = o;
  const diagnose = !!(o.saveBaseline || o.compareBaseline);
  if (diagnose && (segments.length !== 1 || o.viewOnly || (o.saveBaseline && o.compareBaseline))) throw new UsageError('基点诊断一次只选一段；--save-base、--vs-base、--dry-run 不能并用');
  const baseline = o.compareBaseline ? readBaseline(o.compareBaseline) : undefined;
  if (baseline && (baseline.口径.作品 !== workName() || baseline.口径.段 !== segments[0]!.键)) throw new UsageError('基点的作品或段不匹配');
  let notAcceptedCount = 0;
  const reject = (messageText: string) => {
    notAcceptedCount++;
    runRecord.log('错误', messageText);
  };
  const allSegments = await loadAllSegments();
  const outputs = await segmentProducts(allSegments, segments, level);
  const plans: SegPlan[] = [];
  let alreadyFreshCount = 0;
  let acceptedCount = 0;
  // 旧切片缺段签时 找旧版 要当场派生（解码），和后面解旧切片共用一次放行闸
  const waitGate = lazyPassGate();
  for (const [i, s] of segments.entries()) {
    const artifact = outputs[i]!;
    const newFingerprint = artifact.画面指纹;
    const fingerprintExists = hasNewFingerprint(s.键, artifact);
    if (fingerprintExists && !diagnose) {
      alreadyFreshCount++;
      console.log(`· ${s.键}：不过期（${fingerprintExists}），不用认`);
      continue;
    }
    const pack = missingLocalTerrain(s);
    if (pack) {
      reject(`${s.键}：本机没有区段包 ${pack}，出不了静帧（anim world bake 烘出来才能认）`);
      continue;
    }
    const { oldVersion, unused } = await findOldVersion(s.键, newFingerprint, { 帧数: artifact.outputFrames, waitGate, pickFingerprint: baseline?.口径.旧指纹, includeCurrent: diagnose });
    if (!oldVersion) {
      reject(`${s.键}：没有能比的旧切片（同一档渲过、切片和配的 wav 还在的）${unused.length ? `\n    ${unused.slice(0, 5).join('\n    ')}` : ''}`);
      continue;
    }
    const blockers = stillCannotProve(oldVersion.项, newFingerprint.项);
    if (blockers.length) {
      reject(`${s.键}：和 ${oldVersion.指纹.slice(0, 16)} 比，${blockers.join('；')}；要重渲（anim film ${s.键}）`);
      continue;
    }
    const frames = baseline?.口径.帧号 ?? pickFrames(artifact.outputFrames, o.sampleCount);
    console.log(`== ${s.键}：${newFingerprint.指纹.slice(0, 16)} 和 ${oldVersion.指纹.slice(0, 16)}（${oldVersion.母版.split(/[\\/]/).pop()}）比 ${frames.length} 帧：${frameNumText(frames)}`);
    for (const d of fingerprintDiff(oldVersion.segFingerprintRecord, newFingerprint).slice(0, 12)) console.log(`    ${d}`);
    plans.push({ 段: s, 产物: artifact, 新: newFingerprint, oldVersion, 帧: frames });
  }
  if (plans.length && !o.viewOnly) {
    const estimates = plans.map((x) => {
      const wholeSegSec = estimateTiming(renderLabel(x.段.键, level));
      return wholeSegSec === null ? null : (wholeSegSec * x.帧.length) / x.产物.outputFrames + FIRST_FRAME_SEC;
    });
    const knownEstimates = estimates.filter((x): x is number => x !== null);
    console.log(`== 认指纹 ${plans.length} 段、${plans.reduce((a, x) => a + x.帧.length, 0)} 帧${knownEstimates.length ? `；按耗时表预计出帧约 ${Math.round(knownEstimates.reduce((a, b) => a + b, 0))} 秒${knownEstimates.length < plans.length ? `（另 ${plans.length - knownEstimates.length} 段没有记录）` : ''}` : ''}`);
    const threshold = readThresholds();
    const commit = (() => {
      const x = commitStatus();
      return x ? `${x.提交}${x.有改动 ? '+未提交改动' : ''}` : '不在 git 里';
    })();
    await perGroupWithResourcePacks(workRoot(), plans, (x) => x.段.键, (group) =>
      openSession(level, async (h) => {
        for (const x of group) {
          const segKey = x.段.键;
          const composition = findComposition(h, x.段, allSegments);
          const { 宽: width, 高: height } = x.oldVersion.segStamp.签名;
          const basis = { 作品: workName(), 段: segKey, 旧指纹: x.oldVersion.指纹, 旧片sha: x.oldVersion.segStamp.母版.字节sha, 宽: width, 高: height, 总帧数: composition.durationInFrames, 帧号: x.帧, 级别: level, 主机: config('主机'), 平台: `${process.platform}-${process.arch}`, 后端: h.参数.gl, 输出fps: composition.fps, 缩放: h.参数.scale, 阈值: stableJson(threshold) };
          if (baseline) checkBasis(baseline.口径, basis);
          const sampleDir = diagnose ? newPreviewDir(`工作-认指纹-${segKey}`) : null;
          const hashes = new Map<number, string>();
          // 先解旧切片（过放行闸，一条命令只过一次），再拿渲染闸出新帧：解码不占渲染闸
          await waitGate();
          const oldFrames = await readOldFrames(x.oldVersion, x.帧);
          await waitSolveCacheWrites();
          const label = `认指纹:${workName()}/${segKey}:${level}`;
          const queueStartMs = Date.now();
          const frameCompares: FrameCompare[] = [];
          await passRenderGate(
            async () => {
              const t0 = Date.now();
              recordPhase(runRecord.阶段, label, '等闸', queueStartMs, (t0 - queueStartMs) / 1000);
              const detail = new DetailCollector(label);
              // 同页按帧号升序连着出、声音开着，参数和切片那遍一样（带字幕），走法和 renderMedia 出切片一样（逐帧校验 同款）
              const conversions: Promise<void>[] = [];
              await detail.包(async () => {
                await renderFramesSamePage({ ...h, 参数: x.产物.参数 }, composition, x.帧, {
                  withAudio: true,
                  环境: segRenderEnv(segKey, x.新.项.地形),
                  onFrame: (frameBytes, f) => {
                    if (sampleDir) hashes.set(f, saveSampleImage(sampleDir, f, frameBytes));
                    conversions.push(frameToYuv(frameBytes, width, height).then((y) => {
                      frameCompares.push(compareFrame(f, y, oldFrames.get(f)!, width, height, threshold));
                      detail.frameDone(frameCompares.length);
                    }));
                  },
                });
                await Promise.all(conversions);
              });
              await recordMeasuredFrames(segKey, x.帧);
              recordPhase(runRecord.阶段, label, '出帧', t0, (Date.now() - t0) / 1000);
              await detail.writeOut(runRecord.阶段, { 指纹: x.新.指纹.slice(0, 16) });
            },
            undefined,
            {},
            { 种: 'still', 作品: workName(), 段: segKey, 级别: level, 帧数: x.帧.length, 帧: x.帧.join(',').slice(0, 60), 用途: '认指纹' },
          );
          const mismatches = frameCompares.filter((b) => b.结论 === '不同').sort((a, b) => a.帧 - b.帧);
          const sameCount = frameCompares.filter((b) => b.结论 === '一样').length;
          const glanceDiffs = frameCompares.filter((b) => b.看一眼);
          if (frameCompares.length !== x.帧.length) {
            reject(`${segKey}：只出了 ${frameCompares.length}/${x.帧.length} 帧，不认`);
            continue;
          }
          if (sampleDir) {
            const frameSamples = frameCompares.sort((left, second) => left.帧 - second.帧).map(sample => ({ ...sample, sha: hashes.get(sample.帧)! }));
            if (frameSamples.some((sample, index) => !sample.sha || sample.帧 !== x.帧[index])) throw new Error('留样缺帧，不作归因');
            const sampleEvidence: SampleEvidence = { 版本: 1, 口径: basis, 指纹: x.新.指纹, 提交: commit, 理由: o.理由, 帧: frameSamples };
            saveSampleTable(sampleDir, sampleEvidence);
            runRecord.产物.push(sampleDir);
            console.log(`样本在 ${sampleDir}`);
            if (baseline && o.compareBaseline) {
              const report = compareWithBaseline(o.compareBaseline, baseline, sampleDir, sampleEvidence);
              console.log(`${report.verdictText}\n对照在 ${report.目录}`);
              runRecord.产物.push(report.目录);
              if (report.candidateDiffers && !mismatches.length) reject('候选抽样与基点不同；交给用户看，不登记');
            }
            if (mismatches.length) reject(`${segKey}：${mismatches.length}/${frameSamples.length} 帧不认旧片（${frameNumText(mismatches.map(sample => sample.帧))}），不登记`);
            continue;
          }
          if (mismatches.length) {
            reject(
              [`${segKey}：${x.帧.length} 帧里 ${mismatches.length} 帧和 ${x.oldVersion.指纹.slice(0, 16)} 的切片不同（${frameNumText(mismatches.map((b) => b.帧))}），不认，照常过期`, ...mismatches.slice(0, maxListedDiffFrames).map((b) => `第 ${b.帧} 帧：${b.说明}`)].join('\n    '),
            );
            continue;
          }
          const r = registerReuse(segKey, x.oldVersion, x.产物, { 理由: o.理由, 帧: x.帧, 提交: commit, 级别: level });
          acceptedCount++;
          runRecord.产物.push(segStampDir(segKey, x.新.指纹), r.母版, r.声音);
          console.log(`✓ ${segKey}：${x.帧.length} 帧都在压缩噪声内（逐字节一样 ${sameCount} 帧），${x.新.指纹.slice(0, 16)} 沿用 ${x.oldVersion.指纹.slice(0, 16)} 的切片（${r.copyHow}）`);
          for (const b of glanceDiffs) console.log(`    第 ${b.帧} 帧在看一眼档里（不算不同）：${b.说明}`);
        }
      }, runRecord),
    );
  }
  if (o.viewOnly) console.log(`\n--dry-run：${plans.length} 段能比，没出帧、没登记${notAcceptedCount ? `；${notAcceptedCount} 段认不了` : ''}`);
  else if (diagnose) console.log('\n基点诊断没有登记沿用或认可；只比抽样画面，没比整段和声音。');
  else console.log(`\n${segments.length} 段：认了 ${acceptedCount} 段${notAcceptedCount ? `，${notAcceptedCount} 段没认（照常过期，要重渲）` : ''}${alreadyFreshCount ? `，${alreadyFreshCount} 段本来不过期` : ''}`);
  if (!o.viewOnly && acceptedCount) console.log('认了的段没真渲过：没抽到的帧和声音没比。要补整段比对：anim --low-priority film <段> --rerender（同指纹重渲，段签自查会比签名和声音）');
  return notAcceptedCount ? 1 : 0;
};

export const fingerprintCommands: Record<string, Command> = {
  reuse: {
    用法: 'reuse <选择器…> --reason <…> [--sample <n>] [--level 视频|预览] [--dry-run | --save-base | --vs-base <草稿目录>]',
    说明: `过期的段抽 n 帧（默认 ${DEFAULT_SAMPLE_COUNT}，含首尾；按输出帧）静帧和同一档最近一份旧切片比，都在压缩噪声内就把新指纹登记成沿用旧切片、不重渲；有一帧不同就不认、报是哪几帧。--dry-run 只列要比什么`,
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { 值: ['--reason', '--sample', '--level', '--vs-base'], toggles: ['--dry-run', '--save-base'] });
      if (!p.位置.length) throw new UsageError('要给选择器（段键、段名、编号、场键、章）');
      const reason = p.值['--reason']?.trim();
      if (!reason) throw new UsageError('要写 --reason（为什么认为画面没变，比如「three 0.186.1 → 0.186.2」「搬函数」），记进段签');
      const sampleCount = p.值['--sample'] === undefined ? DEFAULT_SAMPLE_COUNT : Number(p.值['--sample']);
      if (!Number.isInteger(sampleCount) || sampleCount < 2) throw new UsageError('--sample 要是不小于 2 的整数（含首、尾帧）');
      if (p.值['--vs-base'] !== undefined && (!p.值['--vs-base'] || p.值['--sample'] !== undefined)) throw new UsageError('--vs-base 需要草稿目录，沿用基点的帧号，不再指定 --sample');
      const level = parseLevel(p.值['--level']);
      const cues = await runCuesBeforeRender();
      const segments = await selectSegs(p.位置);
      checkSelectedSegCues(cues, segments);
      return runFingerprintAccept(segments, { 理由: reason, sampleCount, 级别: level, viewOnly: p.toggles.has('--dry-run'), saveBaseline: p.toggles.has('--save-base'), compareBaseline: p.值['--vs-base'], runRecord });
    },
  },
  stale: {
    用法: 'stale [<选择器…>] [--level 视频|预览] [--verbose] [--strict]',
    说明: '列出各段指纹和切片是否最新（和 anim film 同一套指纹），过期的说明哪项输入变了、预计重渲多久；--strict 有过期段时退出码 1',
    跑: async (args) => {
      const p = parseArgs(args, { 值: ['--level'], toggles: ['--verbose', '--strict'] });
      const level = parseLevel(p.值['--level']);
      const segments = p.位置.length ? await selectSegs(p.位置) : await loadAllSegments();
      let staleCount = 0;
      let masterMissingCount = 0;
      let estimatedSec = 0;
      let noRecordCount = 0;
      const addEstimate = (segKey: string) => {
        const rawEstimate = estimateTiming(renderLabel(segKey, level));
        if (rawEstimate === null) noRecordCount++;
        else estimatedSec += rawEstimate;
        return rawEstimate;
      };
      const outputs = await segmentProducts(await loadAllSegments(), segments, level);
      for (const r of outputs) {
        const s = r.段;
        const fp = r.画面指纹;
        const hasOutput = fs.existsSync(r.画面) && fs.existsSync(r.声音);
        const segStamp = readSegStamp(s.键, fp.指纹);
        const wasRendered = hasOutput || !!segStamp || fs.existsSync(fingerprintFile(s.键, fp.指纹));
        const rowLabel = `${(s.编号 ?? '').padEnd(5)} ${s.键}  ${fp.指纹.slice(0, 16)}`;
        if (hasOutput) console.log(`✓ ${rowLabel}${segStamp?.沿用 ? `  沿用 ${segStamp.沿用.自.slice(0, 16)}（认指纹，没真渲过）` : ''}${segStampComplete(segStamp) ? '' : '  缺段签（verify、认指纹 用到时自动补）'}`);
        else if (wasRendered) {
          masterMissingCount++;
          const estimatedSec = addEstimate(s.键);
          console.log(`◐ ${rowLabel}  渲过，切片不在${estimatedSec === null ? '' : `（要用时重渲约 ${Math.round(estimatedSec)} 秒）`}`);
        } else console.log(`✗ ${rowLabel}  过期`);
        if (p.toggles.has('--verbose')) console.log(JSON.stringify(fp.项, null, 2).replace(/^/gm, '    '));
        if (wasRendered) continue;
        staleCount++;
        addEstimate(s.键);
        // 和同一档最近渲过的那份比；没有同档的（CRF1 时代的、别的输出帧率的）退到同一级别最近的画面记录
        const history = fingerprintHistory(s.键);
        const sameTierEntry = history.find((h) => sameTier(h, fp));
        const prevRecord = sameTierEntry ?? history.find((h) => isPictureRecord(h) && stableJson((h.项?.渲染设置?.inputProps as { 级别?: unknown } | undefined)?.级别) === stableJson(level));
        if (!prevRecord) console.log('    没渲过');
        else {
          if (!sameTierEntry) console.log(`    同一档没渲过，和别的档的 ${prevRecord.指纹.slice(0, 16)} 比`);
          for (const d of fingerprintDiff(prevRecord, fp).slice(0, 20)) console.log(`    ${d}`);
        }
      }
      const toRender = staleCount + masterMissingCount;
      console.log(
        `\n${segments.length} 段，过期 ${staleCount} 段${masterMissingCount ? `，渲过但切片不在 ${masterMissingCount} 段` : ''}` +
          `${toRender > noRecordCount ? `；按耗时表预计重渲约 ${Math.round(estimatedSec)} 秒` : ''}${noRecordCount ? `；${noRecordCount} 段耗时表里没有记录` : ''}`,
      );
      return p.toggles.has('--strict') && staleCount ? 1 : 0;
    },
  },
};
