// anim stale [<选择器…>] [--level …] [--verbose] [--strict]：每段现在的切片分三态：✓ 渲过、切片（mp4 + wav）在；◐ 渲过（有 .指纹.json 或段签）、切片不在，要用时重渲；
// ✗ 过期（这个画面指纹没渲过），和同一档最近一次渲过的指纹比，说明是哪项变了。切片在、段签缺的另标「缺段签」（verify、认指纹 用到时自动补）。
// 指纹和 anim film 同一套算法（渲/段产物.ts：带这段的字幕、按成片输出帧率）；所有段一次建图算。默认退出码总是 0；--strict 时有过期段（✗）退出码 1（给脚本、CI 用），◐ 不算过期。
// ✓ 里 anim reuse 登记的另标「沿用 <旧指纹>」：切片是旧指纹那份的克隆，没真渲过。
// anim reuse <选择器…> --reason … [--sample <n>] [--dry-run]：过期的段抽帧，新代码和渲出旧切片的旧代码各出一遍无损 PNG，逐像素一样就登记成沿用旧切片（认指纹.ts、旧代码出帧.ts，决策/0013）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
import { registerCleanup } from '../环境/收尾.ts';
import { openTempCheckout } from '../环境/开worktree.ts';
import { findRenderSource, commitExists, renderOldFrames, type RenderSource } from '../验收/旧代码出帧.ts';
import { findComposition, renderFramesSamePage, missingLocalTerrain } from '../渲/渲.ts';
import { realBackend, type RenderBackend } from '../渲/后端.ts';
import { segRenderEnv } from '../渲/地形注入.ts';
import { recordMeasuredFrames } from '../渲/地形用量.ts';
import { waitSolveCacheWrites } from '../渲/求解缓存收集.ts';
import { lazyPassGate } from '../闸/闸.ts';
import { recordPhase } from '../运行记录/阶段.ts';
import { DetailCollector } from '../运行记录/渲染明细.ts';
import { readThresholds } from '../验收/比较.ts';
import { frameNumText } from '../验收/逐帧校验.ts';
import { checkSelectedSegCues, runCuesBeforeRender } from '../段框架/自动.ts';
import { DEFAULT_SAMPLE_COUNT, pickFrames, findOldVersion, hasNewFingerprint, comparePng, registerReuse, stillCannotProve, type FrameCompare, type OldVersion } from '../验收/认指纹.ts';

const parseLevel = (v: string | undefined): RenderLevel => {
  const level = (v ?? '视频') as RenderLevel;
  if (!renderLevels.includes(level)) throw new UsageError(`--level 只能是 ${renderLevels.join('、')}`);
  return level;
};

// 只渲一截时第一帧的读地形摊不到，单独加上（和 逐帧校验 的估法一样）
const FIRST_FRAME_SEC = 15;
const maxListedDiffFrames = 8;
// 旧代码出帧用的是 verify frames，它只出视频档
const level: RenderLevel = '视频';

type SegPlan = { segment: SegInfo; artifacts: SegArtifact; 新: SegFingerprint; oldVersion: OldVersion; source: RenderSource; frame: number[] };
type OldSide = { png: Map<number, string>; sec: number };

/** anim reuse：见 认指纹.ts 文件头。返回退出码：选中的过期段有没认下来的（不同、没有旧切片、找不到旧提交、旧代码出不了帧、静帧证明不了）是 1 */
export const runFingerprintAccept = async (segments: readonly SegInfo[], o: { reason: string; sampleCount: number; viewOnly: boolean; runRecord: RunRecord; backend?: RenderBackend }): Promise<number> => {
  const backend = o.backend ?? realBackend;
  const { runRecord } = o;
  const work = workName();
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
  // 旧切片缺段签时 找旧版 要当场派生（解码），比图解码也过放行闸，一条命令只过一次
  const waitGate = lazyPassGate(backend.passGate);
  for (const [i, s] of segments.entries()) {
    const artifact = outputs[i]!;
    const newFingerprint = artifact.pictureFingerprint;
    const fingerprintExists = hasNewFingerprint(s.key, artifact);
    if (fingerprintExists) {
      alreadyFreshCount++;
      console.log(`· ${s.key}：不过期（${fingerprintExists}），不用认`);
      continue;
    }
    const pack = missingLocalTerrain(s);
    if (pack) {
      reject(`${s.key}：本机没有区段包 ${pack}，出不了静帧（anim world bake 烘出来才能认）`);
      continue;
    }
    // 最近一份能用的旧切片：静帧证明不了的、查不到是哪个提交渲的，往前找下一份
    const sources = new Map<string, RenderSource>();
    const { oldVersion, unused } = await findOldVersion(s.key, newFingerprint, {
      frameCount: artifact.outputFrames,
      waitGate,
      check: (ov) => {
        const blockers = stillCannotProve(ov.items, newFingerprint.items);
        if (blockers.length) return blockers.join('；');
        const { source, why } = findRenderSource(s.key, ov, work);
        if (!source) return why!;
        if (!commitExists(source.commit)) return `是 ${source.commit.slice(0, 12)} 渲的（${source.via}），这个提交不在仓库里了`;
        sources.set(ov.fingerprint, source);
        return null;
      },
    });
    if (!oldVersion) {
      reject(`${s.key}：没有能比的旧切片（同一档渲过、切片和配的 wav 还在、静帧证明得了、查得到是哪个提交渲的），不认，照常过期${unused.length ? `\n    ${unused.slice(0, 5).join('\n    ')}` : ''}`);
      continue;
    }
    const source = sources.get(oldVersion.fingerprint)!;
    for (const u of unused) console.log(`    跳过更新的旧切片 ${u}`);
    const frames = pickFrames(artifact.outputFrames, o.sampleCount);
    console.log(`== ${s.key}：${newFingerprint.fingerprint.slice(0, 16)} 和 ${oldVersion.fingerprint.slice(0, 16)}（${oldVersion.master.split(/[\\/]/).pop()}）比 ${frames.length} 帧：${frameNumText(frames)}`);
    console.log(`    旧帧用 ${source.commit.slice(0, 12)} 重出（${source.via}${source.fingerprint === oldVersion.fingerprint ? '' : `；切片沿用自 ${source.fingerprint.slice(0, 16)}，旧代码要算出这个指纹`}）`);
    for (const d of fingerprintDiff(oldVersion.segFingerprintRecord, newFingerprint).slice(0, 12)) console.log(`    ${d}`);
    plans.push({ segment: s, artifacts: artifact, 新: newFingerprint, oldVersion, source, frame: frames });
  }
  if (plans.length && !o.viewOnly) {
    const estimates = plans.map((x) => {
      const wholeSegSec = estimateTiming(renderLabel(x.segment.key, level));
      return wholeSegSec === null ? null : (wholeSegSec * x.frame.length) / x.artifacts.outputFrames + FIRST_FRAME_SEC;
    });
    const knownEstimates = estimates.filter((x): x is number => x !== null);
    console.log(`== 认指纹 ${plans.length} 段、${plans.reduce((a, x) => a + x.frame.length, 0)} 帧，新旧代码各出一遍${knownEstimates.length ? `；按耗时表预计出帧约 ${Math.round(2 * knownEstimates.reduce((a, b) => a + b, 0))} 秒，另加开旧检出` : ''}${knownEstimates.length && knownEstimates.length < plans.length ? `（另 ${plans.length - knownEstimates.length} 段没有记录）` : ''}`);
    const threshold = readThresholds();
    const commit = (() => {
      const x = commitStatus();
      return x ? `${x.commit}${x.dirty ? '+未提交改动' : ''}` : '不在 git 里';
    })();
    const imageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'anim-认指纹-旧帧-'));
    const undoImageRoot = registerCleanup(() => fs.rmSync(imageRoot, { recursive: true, force: true }));
    try {
      // 旧那边：同一个提交的段共用一个临时检出；帧号一样的段一次 verify frames（一次打包），帧号不一样的分开跑（verify frames 只收一份帧号）
      const oldSides = new Map<string, OldSide>();
      for (const [sourceCommit, group] of groupBy(plans, (x) => x.source.commit)) {
        const t0 = Date.now();
        let checkout: Awaited<ReturnType<typeof openTempCheckout>>;
        try {
          checkout = await openTempCheckout(sourceCommit);
        } catch (e) {
          for (const x of group) reject(`${x.segment.key}：在 ${sourceCommit.slice(0, 12)} 上开不了临时检出（${(e as Error).message.split('\n')[0]}）；不认，照常过期`);
          continue;
        }
        const checkoutSec = (Date.now() - t0) / 1000;
        console.log(`== 旧检出 ${sourceCommit.slice(0, 12)}：${checkout.dir}（${checkoutSec.toFixed(1)} 秒）`);
        try {
          for (const [, sameFrames] of groupBy(group, (x) => x.frame.join(','))) {
            const t1 = Date.now();
            const imageDir = path.join(imageRoot, String(oldSides.size));
            let result: Awaited<ReturnType<typeof renderOldFrames>>;
            try {
              result = await renderOldFrames(checkout.dir, work, sameFrames.map((x) => x.segment.key), sameFrames[0]!.frame, imageDir);
            } catch (e) {
              for (const x of sameFrames) reject(`${x.segment.key}：旧代码（${sourceCommit.slice(0, 12)}）出帧失败：${(e as Error).message.split('\n')[0]}；不认，照常过期`);
              continue;
            }
            const sec = (Date.now() - t1) / 1000 / sameFrames.length + checkoutSec / group.length;
            for (const x of sameFrames) {
              const r = result.get(x.segment.key)!;
              if (r.fingerprint !== x.source.fingerprint) {
                reject(`${x.segment.key}：${sourceCommit.slice(0, 12)} 今天算出的指纹是 ${r.fingerprint.slice(0, 16)}，不是旧切片那份 ${x.source.fingerprint.slice(0, 16)}（数据、资产或环境变过），旧代码重出的不是切片的画面；不认，照常过期`);
                continue;
              }
              oldSides.set(x.segment.key, { png: r.png, sec });
            }
          }
        } finally {
          checkout.close();
        }
      }
      // 新那边：新代码打一次包，每段过一次渲染闸（静帧档），帧号、走法和旧那边一样（同页按帧号升序连出，切片参数、带字幕、声音开着）
      const ready = plans.filter((x) => oldSides.has(x.segment.key));
      if (ready.length) await backend.perResourcePackGroup(workRoot(), ready, (x) => x.segment.key, (group) =>
        backend.openSession(level, async (h) => {
          for (const x of group) {
            const segKey = x.segment.key;
            const oldSide = oldSides.get(segKey)!;
            const composition = findComposition(h, x.segment, allSegments);
            await waitSolveCacheWrites();
            const label = `认指纹:${work}/${segKey}:${level}`;
            const queueStartMs = Date.now();
            const frameCompares: FrameCompare[] = [];
            // 字节不同的先留着，出完帧过放行闸再解码比（解码是重活，不占渲染闸）
            const toDecode: { frame: number; png: Buffer }[] = [];
            let newSec = 0;
            await backend.passRenderGate(
              async () => {
                const t0 = Date.now();
                recordPhase(runRecord.stage, label, '等闸', queueStartMs, (t0 - queueStartMs) / 1000);
                const detail = new DetailCollector(label);
                await detail.pack(() =>
                  renderFramesSamePage({ ...h, params: x.artifacts.params }, composition, x.frame, {
                    withAudio: true,
                    env: segRenderEnv(segKey, x.新.items.terrain),
                    onFrame: (png, f) => {
                      const oldPng = fs.readFileSync(oldSide.png.get(f)!);
                      if (png.equals(oldPng)) frameCompares.push({ frame: f, verdict: '一样' });
                      else toDecode.push({ frame: f, png: Buffer.from(png) });
                      detail.frameDone(frameCompares.length + toDecode.length);
                    },
                  }, backend),
                );
                await recordMeasuredFrames(segKey, x.frame);
                newSec = (Date.now() - t0) / 1000;
                recordPhase(runRecord.stage, label, '出帧', t0, newSec);
                await detail.writeOut(runRecord.stage, { fingerprint: x.新.fingerprint.slice(0, 16) });
              },
              undefined,
              {},
              { kind: 'still', work, segment: segKey, level, frameCount: x.frame.length, frame: x.frame.join(',').slice(0, 60), purpose: '认指纹' },
            );
            if (toDecode.length) {
              await waitGate();
              for (const d of toDecode) frameCompares.push(comparePng(d.frame, d.png, fs.readFileSync(oldSide.png.get(d.frame)!), threshold));
            }
            const timeNote = `旧代码出帧约 ${oldSide.sec.toFixed(0)} 秒（含开检出摊到这段的），新代码 ${newSec.toFixed(0)} 秒`;
            if (frameCompares.length !== x.frame.length) {
              reject(`${segKey}：只出了 ${frameCompares.length}/${x.frame.length} 帧，不认`);
              continue;
            }
            const mismatches = frameCompares.filter((b) => b.verdict === '不同').sort((a, b) => a.frame - b.frame);
            if (mismatches.length) {
              reject(
                [`${segKey}：${x.frame.length} 帧里 ${mismatches.length} 帧和旧代码（${x.source.commit.slice(0, 12)}）出的不同（${frameNumText(mismatches.map((b) => b.frame))}），不认，照常过期；${timeNote}`, ...mismatches.slice(0, maxListedDiffFrames).map((b) => `第 ${b.frame} 帧：${b.note}`)].join('\n    '),
              );
              continue;
            }
            const r = registerReuse(segKey, x.oldVersion, x.artifacts, { reason: o.reason, frame: x.frame, commit, sourceCommit: x.source.commit, level });
            acceptedCount++;
            runRecord.artifacts.push(segStampDir(segKey, x.新.fingerprint), r.master, r.sound);
            const pixelSame = frameCompares.filter((b) => b.verdict === '像素同').length;
            console.log(`✓ ${segKey}：${x.frame.length} 帧和旧代码出的逐像素一样${pixelSame ? `（${pixelSame} 帧 PNG 字节不同、像素一样）` : '（PNG 逐字节一样）'}，${x.新.fingerprint.slice(0, 16)} 沿用 ${x.oldVersion.fingerprint.slice(0, 16)} 的切片（${r.copyHow}）；${timeNote}`);
          }
        }, runRecord, { preload: group.map((x) => x.segment.key) }),
      );
    } finally {
      fs.rmSync(imageRoot, { recursive: true, force: true });
      undoImageRoot();
    }
  }
  if (o.viewOnly) console.log(`\n--dry-run：${plans.length} 段能比，没出帧、没登记${notAcceptedCount ? `；${notAcceptedCount} 段认不了` : ''}`);
  else console.log(`\n${segments.length} 段：认了 ${acceptedCount} 段${notAcceptedCount ? `，${notAcceptedCount} 段没认（照常过期，要重渲）` : ''}${alreadyFreshCount ? `，${alreadyFreshCount} 段本来不过期` : ''}`);
  if (!o.viewOnly && acceptedCount) console.log('认了的段没真渲过：没抽到的帧和声音没比。要补整段比对：anim --low-priority film <段> --rerender（同指纹重渲，段签自查会比签名和声音）');
  return notAcceptedCount ? 1 : 0;
};

/** 按键分组，组和组内保持原顺序 */
const groupBy = <T>(xs: readonly T[], key: (x: T) => string) => {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
};

export const fingerprintCommands: Record<string, Command> = {
  reuse: {
    usage: 'reuse <选择器…> --reason <…> [--sample <n>] [--dry-run]',
    note: `过期的段抽 n 帧（默认 ${DEFAULT_SAMPLE_COUNT}，含首尾；按输出帧），新代码出一遍、渲出旧切片的那个提交在临时检出里用旧代码出一遍，都是无损 PNG，逐像素一样才把新指纹登记成沿用旧切片、不重渲；有一帧不同就不认、报是哪几帧差多少。找不到旧提交（.指纹.json 没记、运行记录里也没有）、提交不在仓库、旧代码出帧失败或算出的指纹不是旧切片那份，都不认、照常过期。只认视频档。--dry-run 只列要比什么、旧帧用哪个提交出`,
    跑: async (args, runRecord) => {
      const p = parseArgs(args, { value: ['--reason', '--sample'], toggles: ['--dry-run'] });
      if (!p.位置.length) throw new UsageError('要给选择器（段键、段名、编号、场键、章）');
      const reason = p.value['--reason']?.trim();
      if (!reason) throw new UsageError('要写 --reason（为什么认为画面没变，比如「three 0.186.1 → 0.186.2」「搬函数」），记进段签');
      const sampleCount = p.value['--sample'] === undefined ? DEFAULT_SAMPLE_COUNT : Number(p.value['--sample']);
      if (!Number.isInteger(sampleCount) || sampleCount < 2) throw new UsageError('--sample 要是不小于 2 的整数（含首、尾帧）');
      const cues = await runCuesBeforeRender();
      const segments = await selectSegs(p.位置);
      checkSelectedSegCues(cues, segments);
      return runFingerprintAccept(segments, { reason, sampleCount, viewOnly: p.toggles.has('--dry-run'), runRecord });
    },
  },
  stale: {
    usage: 'stale [<选择器…>] [--level 视频|预览] [--verbose] [--strict]',
    note: '列出各段指纹和切片是否最新（和 anim film 同一套指纹），过期的说明哪项输入变了、预计重渲多久；--strict 有过期段时退出码 1',
    跑: async (args) => {
      const p = parseArgs(args, { value: ['--level'], toggles: ['--verbose', '--strict'] });
      const level = parseLevel(p.value['--level']);
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
        const s = r.segment;
        const fp = r.pictureFingerprint;
        const hasOutput = fs.existsSync(r.画面) && fs.existsSync(r.sound);
        const segStamp = readSegStamp(s.key, fp.fingerprint);
        const wasRendered = hasOutput || !!segStamp || fs.existsSync(fingerprintFile(s.key, fp.fingerprint));
        const rowLabel = `${(s.serial ?? '').padEnd(5)} ${s.key}  ${fp.fingerprint.slice(0, 16)}`;
        if (hasOutput) console.log(`✓ ${rowLabel}${segStamp?.reuse ? `  沿用 ${segStamp.reuse.reusedFrom.slice(0, 16)}（认指纹，没真渲过）` : ''}${segStampComplete(segStamp) ? '' : '  缺段签（verify、认指纹 用到时自动补）'}`);
        else if (wasRendered) {
          masterMissingCount++;
          const estimatedSec = addEstimate(s.key);
          console.log(`◐ ${rowLabel}  渲过，切片不在${estimatedSec === null ? '' : `（要用时重渲约 ${Math.round(estimatedSec)} 秒）`}`);
        } else console.log(`✗ ${rowLabel}  过期`);
        if (p.toggles.has('--verbose')) console.log(JSON.stringify(fp.items, null, 2).replace(/^/gm, '    '));
        if (wasRendered) continue;
        staleCount++;
        addEstimate(s.key);
        // 和同一档最近渲过的那份比；没有同档的（CRF1 时代的、别的输出帧率的）退到同一级别最近的画面记录
        const history = fingerprintHistory(s.key);
        const sameTierEntry = history.find((h) => sameTier(h, fp));
        const prevRecord = sameTierEntry ?? history.find((h) => isPictureRecord(h) && stableJson((h.items?.renderSettings?.inputProps as { level?: unknown } | undefined)?.level) === stableJson(level));
        if (!prevRecord) console.log('    没渲过');
        else {
          if (!sameTierEntry) console.log(`    同一档没渲过，和别的档的 ${prevRecord.fingerprint.slice(0, 16)} 比`);
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
