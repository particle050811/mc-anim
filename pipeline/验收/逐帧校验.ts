// anim verify frames：每帧 PNG 算 sha 存成一份有名字的记录（run/逐帧校验/<作品>/<名>/<段键>.tsv），之后再渲一次比，列出不同的帧。方便对比最终结果（用户 10-31 定）。
// 和 anim verify 的分工：verify 比认可版的抽样帧、有阈值、可 accept；这里每帧都比、按字节判，不写母版，不碰段签和认可。
// 差多少（用户 11-16 要）：--save 默认把 PNG 留在 tsv 旁边的 <段键>/ 里（--no-images 不留），--compare 对不同的帧报差像素占比、最大差、块平均差（帧差.ts），
//   汇总列最差的几帧；只报数，过不过照旧逐字节，给了 --tolerance <级> 才把最大差不超过它的帧算过。
// 全程只打包一次（开会话，用完删包），每段过一次渲染闸，并发 1；同一页面按帧号升序连着渲、声音开着，参数和切片那遍一样（带字幕、帧号是输出帧），走法和 renderMedia 出切片一样。
// 同一批帧才能比：隔开的帧在同一页面连出，和连续渲或单帧出不保证相同（docs/渲染性能.md「同一帧的像素取决于之前渲过哪些帧」）。所以 --compare 永远照基准存的帧渲，给了 --frames 也只是渲到那里为止，前面的帧不省。
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UsageError } from '../cli/参数.ts';
import { workName, workRoot } from '../环境/作品.ts';
import { commitStatus } from '../环境/路径.ts';
import { frameCheckDir } from '../环境/作品数据.ts';
import { dataRoot } from '../环境/配置.ts';
import type { SegInfo } from '../清单/清单.ts';
import { fillBytesAndReport } from '../分发/随仓库.ts';
import { estimateTiming, type RunRecord } from '../运行记录/记录.ts';
import { recordPhase } from '../运行记录/阶段.ts';
import { DetailCollector } from '../运行记录/渲染明细.ts';
import { waitSolveCacheWrites } from '../渲/求解缓存收集.ts';
import { renderFramesSamePage, findComposition, renderLabel, missingLocalTerrain, stillFile } from '../渲/渲.ts';
import { realBackend, type RenderBackend } from '../渲/后端.ts';
import { segRenderEnv } from '../渲/地形注入.ts';
import { recordMeasuredFrames } from '../渲/地形用量.ts';
import { segmentProducts } from '../渲/段产物.ts';
import type { RenderParamsTable } from '../渲/设置.ts';
import { loadAllSegments } from '../清单/清单.ts';
import { readThresholds } from './比较.ts';
import { frameDiff, frameDiffText, worseFirst, type FrameDiff } from './帧差.ts';

const level = '视频' as const;
// 4K 的真画面 PNG 都上 MB，几十 KB 只能是纯色或接近纯色；只提醒不拦，段里本来可能有黑场
const solidSuspectBytes = 64 * 1024;
const maxListedDiffFrames = 20;
const worstListed = 5;
const FIRST_FRAME_SEC = 15;

export type FrameCheck = { sha: string; bytes: number };
/** imageDir：存基准时留的 PNG 在哪（绝对路径）；没留是 undefined，比的时候只能报哪几帧不同 */
export type CheckRecord = { segment: string; 段帧数: number; fingerprint: string; commit: string; imageDir?: string; frame: Map<number, FrameCheck> };

/** --frames：a-b（含两头）或 帧,帧,帧 */
export const parseFrames = (rangeText: string): number[] => {
  const rangeMatch = /^(\d+)-(\d+)$/.exec(rangeText);
  if (rangeMatch) {
    const [a, b] = [Number(rangeMatch[1]), Number(rangeMatch[2])];
    if (a > b) throw new UsageError(`--frames 起点比终点大：${rangeText}`);
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }
  if (!/^\d+(,\d+)*$/.test(rangeText)) throw new UsageError(`--frames 写成 <起>-<止> 或 <帧>,<帧>：${rangeText}`);
  return [...new Set(rangeText.split(',').map(Number))].sort((x, y) => x - y);
};

/** 升序帧号写成 3、5-9、12 */
export const frameNumText = (frames: readonly number[]) => {
  const ranges: string[] = [];
  for (let i = 0; i < frames.length; ) {
    let j = i;
    while (j + 1 < frames.length && frames[j + 1] === frames[j]! + 1) j++;
    ranges.push(i === j ? String(frames[i]) : `${frames[i]}-${frames[j]}`);
    i = j + 1;
  }
  return ranges.join('、');
};

export const checkFile = (checkName: string, segKey: string, work = workName()) => path.join(frameCheckDir(checkName, work), `${segKey}.tsv`);
/** --save 默认留基准 PNG 的地方：tsv 旁边的 <段键>/ */
export const baselineImageDir = (checkName: string, segKey: string, work = workName()) => path.join(frameCheckDir(checkName, work), segKey);

/** 先写临时名再改名：渲到一半被杀不留半份基准 */
export const writeCheckRecord = (file: string, r: CheckRecord) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const frameLines = [...r.frame].sort((a, b) => a[0] - b[0]).map(([f, x]) => `${f}\t${x.sha}\t${x.bytes}`);
  const tmp = `${file}.写入中-${process.pid}`;
  fs.writeFileSync(tmp, [`# 段\t${r.segment}`, `# 段帧数\t${r.段帧数}`, `# 指纹\t${r.fingerprint}`, `# 提交\t${r.commit}`, ...(r.imageDir ? [`# 图\t${r.imageDir}`] : []), '帧\tsha256\t字节', ...frameLines, ''].join('\n'), 'utf8');
  fs.renameSync(tmp, file);
};

export const readCheckRecord = (file: string): CheckRecord => {
  const r: CheckRecord = { segment: '', 段帧数: 0, fingerprint: '', commit: '', frame: new Map() };
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line || line.startsWith('帧\t')) continue;
    const cols = line.split('\t');
    if (line.startsWith('# ')) {
      const propKey = cols[0]!.slice(2);
      if (propKey === '段') r.segment = cols[1]!;
      else if (propKey === '段帧数') r.段帧数 = Number(cols[1]);
      else if (propKey === '指纹') r.fingerprint = cols[1]!;
      else if (propKey === '提交') r.commit = cols[1]!;
      else if (propKey === '图') r.imageDir = cols[1]!;
      continue;
    }
    const frame = Number(cols[0]);
    if (!Number.isInteger(frame) || !/^[0-9a-f]{64}$/.test(cols[1] ?? '')) throw new Error(`${file} 读不懂这一行：${line}`);
    r.frame.set(frame, { sha: cols[1]!, bytes: Number(cols[2]) });
  }
  return r;
};

/**
 * 这段要渲哪些帧（基准帧要升序）。比的时候只渲基准里有的帧，给了 --frames 就从基准第一帧渲到要的最后一帧：
 * 一帧的结果取决于同页面在它之前渲过什么，和它之后的无关（实测 6-斩娜迦 0-85 和整段的前 86 帧、30,85 和 30,85,140 字节相同）。
 * 超出 是这段没有的帧，基准没有 是给了 --frames、基准没存的帧。
 */
export const pickRenderFrames = (frameCount: number, givenFrames: readonly number[] | null, baselineFrames: readonly number[] | null) => {
  const frames = givenFrames ?? baselineFrames ?? Array.from({ length: frameCount }, (_, i) => i);
  const baseline = baselineFrames ? new Set(baselineFrames) : null;
  const inSegment = frames.filter((f) => f < frameCount);
  const renderable = inSegment.filter((f) => !baseline || baseline.has(f));
  return {
    toRender: baselineFrames && givenFrames && renderable.length ? baselineFrames.filter((f) => f <= Math.max(...renderable)) : renderable,
    outOfRange: frames.filter((f) => f >= frameCount),
    missingInBase: inSegment.filter((f) => baseline && !baseline.has(f)),
  };
};

export const compareChecks = (baseline: ReadonlyMap<number, FrameCheck>, current: ReadonlyMap<number, FrameCheck>) => {
  const mismatches = [...current].filter(([f, x]) => baseline.get(f)?.sha !== x.sha).map(([f, x]) => ({ frame: f, baseline: baseline.get(f)?.sha ?? '', current: x.sha })).sort((a, b) => a.frame - b.frame);
  return { 相同: current.size - mismatches.length, 不同: mismatches };
};

const commitText = () => {
  const x = commitStatus();
  return x ? `${x.commit}${x.dirty ? '+未提交改动' : ''}` : '不在 git 里';
};

/** writeDir：这次写 PNG 的目录（存：基准图，全写；比：--keep-images，只写不同的）；baselineImages：比的时候基准图在哪，没留或不在了是 null */
type SegPlan = { segment: SegInfo; frame: number[]; baseline: CheckRecord | null; baselineImages: string | null; writeDir: string | null; fingerprint: string; terrain: Record<string, string>; frameCount: number; params: RenderParamsTable };

export type PerFrameOptions = { checkMode: '存' | '比'; name: string; frame: readonly number[] | null; keepDir: string | null; noImages?: boolean; tolerance?: number | null; runRecord: RunRecord; backend?: RenderBackend };

export const runPerFrame = async (segments: readonly SegInfo[], o: PerFrameOptions): Promise<number> => {
  const { checkMode, name: checkName, runRecord } = o;
  const backend = o.backend ?? realBackend;
  const tolerance = o.tolerance ?? null;
  let failed = 0;
  let kept = 0;
  let savedImages = 0;
  let savedImageBytes = 0;
  const diffed: { segment: string; frame: number; d: FrameDiff }[] = [];
  // 比的时候没给 --keep-images：不同的帧先放临时目录，出完帧再和基准图比，用完删
  let scratchDir: string | null = null;
  const scratch = () => (scratchDir ??= fs.mkdtempSync(path.join(os.tmpdir(), 'anim-逐帧比图-')));
  const addError = (messageText: string) => {
    failed++;
    runRecord.log('错误', messageText);
  };
  const skipped: string[] = [];
  const wantedSegs = segments.filter((s) => {
    const pack = missingLocalTerrain(s);
    if (!pack) return true;
    skipped.push(s.key);
    // 存过基准的段没渲到就是没比到，不能算过；没存过的段这台机器本来就比不了（章选择器存的时候也跳过了它）
    if (checkMode === '比' && fs.existsSync(checkFile(checkName, s.key))) addError(`${s.key}：「${checkName}」里存过这段，但本机没有区段包 ${pack}，没比到（anim world bake 烘出来才能渲）`);
    else console.log(`跳过 ${s.key}：本机没有区段包 ${pack}（anim world bake 烘出来才能渲）`);
    return false;
  });
  // 不覆盖基准：存错了换个名，比的时候不会悄悄和新存的比
  if (checkMode === '存') {
    const existing = wantedSegs.filter((s) => fs.existsSync(checkFile(checkName, s.key)));
    if (existing.length) throw new UsageError(`「${checkName}」里已经有 ${existing.map((s) => s.key).join('、')}，不覆盖：换个名，或者选别的段`);
  }
  fillBytesAndReport(workRoot(), dataRoot());
  const allSegments = await loadAllSegments();
  const outputs = await segmentProducts(allSegments, wantedSegs, level);
  const plans: SegPlan[] = [];
  for (const [i, s] of wantedSegs.entries()) {
    const file = checkFile(checkName, s.key);
    if (checkMode === '比' && !fs.existsSync(file)) {
      addError(`${s.key}：「${checkName}」里没存过这段（${file}），先 anim verify frames ${s.key} --save ${checkName}`);
      continue;
    }
    const baseline = checkMode === '比' ? readCheckRecord(file) : null;
    const artifact = outputs[i]!;
    const frameCount = artifact.outputFrames;
    const { toRender, outOfRange, missingInBase } = pickRenderFrames(frameCount, o.frame, baseline ? [...baseline.frame.keys()].sort((a, b) => a - b) : null);
    const baselineOutOfRange = outOfRange.filter((f) => baseline?.frame.has(f));
    if (baselineOutOfRange.length) addError(`${s.key}：段现在只有 ${frameCount} 帧，基准存的这些帧没了：${frameNumText(baselineOutOfRange)}`);
    else if (outOfRange.length) console.log(`· ${s.key} 只有 ${frameCount} 帧，不渲 ${frameNumText(outOfRange)}`);
    if (missingInBase.length) console.log(`· ${s.key}：基准没存这些帧，比不了：${frameNumText(missingInBase)}`);
    if (o.frame && baseline && toRender.some((f) => !o.frame!.includes(f))) console.log(`· ${s.key}：基准的帧是连着渲的，隔开渲比不了，这次连前面的帧一起渲、一起比：${frameNumText(toRender)}`);
    if (baseline && !o.frame && baseline.段帧数 !== frameCount) addError(`${s.key}：存基准时段有 ${baseline.段帧数} 帧，现在 ${frameCount} 帧（段长或帧率变过，要重存）`);
    if (!toRender.length) {
      addError(`${s.key}：没有能渲的帧`);
      continue;
    }
    const baselineImages = baseline?.imageDir && fs.existsSync(baseline.imageDir) ? baseline.imageDir : null;
    if (baseline && !baselineImages) console.log(`· ${s.key}：${baseline.imageDir ? `基准图 ${baseline.imageDir} 不在了` : '基准没留图（存于能报差多少以前，或存的时候 --no-images）'}，不同的帧只能报 sha，报不了差多少${tolerance !== null ? '，--tolerance 也用不上' : ''}`);
    const writeDir = checkMode === '存' ? (o.keepDir ?? (o.noImages ? null : baselineImageDir(checkName, s.key))) : o.keepDir;
    plans.push({ segment: s, frame: toRender, baseline: baseline, baselineImages, writeDir, fingerprint: artifact.pictureFingerprint.fingerprint, terrain: artifact.pictureFingerprint.items.terrain, frameCount: frameCount, params: artifact.params });
  }
  // 开跑前查：不覆盖，也不和上次留的混在一起；比的时候哪帧不同渲完才知道，按可能写的算
  const existingFiles = plans.flatMap((x) => (x.writeDir ? x.frame.map((f) => stillFile(x.writeDir!, x.segment.key, f)) : [])).filter((f) => fs.existsSync(f));
  if (existingFiles.length) {
    const where = o.keepDir ? `--keep-images ${o.keepDir}` : path.dirname(existingFiles[0]!);
    throw new UsageError(`${where} 里已经有 ${existingFiles.length} 张这次可能写的 PNG（${path.basename(existingFiles[0]!)} 等），不覆盖：${o.keepDir ? '换个空目录' : '上回存到一半的残留，删掉再存'}`);
  }
  for (const x of plans) if (x.writeDir) fs.mkdirSync(x.writeDir, { recursive: true });
  if (plans.length) {
    const estimates = plans.map((x) => {
      const wholeSegSec = estimateTiming(renderLabel(x.segment.key, level));
      if (wholeSegSec === null) return null;
      // 只渲一截时第一帧的读地形摊不到，单独加上
      return x.frame.length === x.frameCount ? wholeSegSec : (wholeSegSec * x.frame.length) / x.frameCount + FIRST_FRAME_SEC;
    });
    const knownEstimates = estimates.filter((x): x is number => x !== null);
    console.log(`== 逐帧${checkMode} ${plans.length} 段、${plans.reduce((a, x) => a + x.frame.length, 0)} 帧${knownEstimates.length ? `；按耗时表预计约 ${Math.round(knownEstimates.reduce((a, b) => a + b, 0))} 秒${knownEstimates.length < plans.length ? `（另 ${plans.length - knownEstimates.length} 段没有记录）` : ''}` : ''}`);
    await backend.perResourcePackGroup(workRoot(), plans, (x) => x.segment.key, (group) => backend.openSession(level, async (h) => {
      for (const x of group) {
        const segKey = x.segment.key;
        const composition = findComposition(h, x.segment, allSegments);
        const label = `逐帧校验:${workName()}/${segKey}`;
        await waitSolveCacheWrites();
        const queueStartMs = Date.now();
        const current = new Map<number, FrameCheck>();
        await backend.passRenderGate(async () => {
          const t0 = Date.now();
          recordPhase(runRecord.stage, label, '等闸', queueStartMs, (t0 - queueStartMs) / 1000);
          const detail = new DetailCollector(label);
          await detail.pack(() =>
            renderFramesSamePage({ ...h, params: x.params }, composition, x.frame, {
              withAudio: true,
              env: segRenderEnv(segKey, x.terrain),
              onFrame: (png, f) => {
                const sha = crypto.createHash('sha256').update(png).digest('hex');
                current.set(f, { sha, bytes: png.length });
                // 存的时候全留；比的时候只留不同的帧：相同的和基准一样，整段的 PNG 又很占地方
                const differs = !x.baseline || x.baseline.frame.get(f)?.sha !== sha;
                const target = !differs ? null : (x.writeDir ?? (x.baselineImages ? scratch() : null));
                if (target) {
                  fs.writeFileSync(stillFile(target, segKey, f), png, { flag: 'wx' });
                  if (target === x.writeDir) kept++;
                  if (checkMode === '存' && !o.keepDir) [savedImages, savedImageBytes] = [savedImages + 1, savedImageBytes + png.length];
                }
                detail.frameDone(current.size);
                if (current.size % 100 === 0) console.error(`   ${segKey}：${current.size}/${x.frame.length} 帧`);
              },
            }, backend),
          );
          await recordMeasuredFrames(segKey, x.frame);
          recordPhase(runRecord.stage, label, '出帧', t0, (Date.now() - t0) / 1000);
          await detail.writeOut(runRecord.stage, { fingerprint: x.fingerprint.slice(0, 16) });
        },undefined,{}, {kind:'逐帧校验',work:workName(),segment:segKey,frameCount:x.frame.length,frame:x.frame.join(',').slice(0,60),purpose:process.env.ANIM_PURPOSE??'核对'});
        const smallFrames = [...current].filter(([, v]) => v.bytes < solidSuspectBytes).map(([f]) => f).sort((a, b) => a - b);
        if (smallFrames.length) runRecord.log('警告', `${segKey}：这些帧的 PNG 不到 ${solidSuspectBytes / 1024} KB，可能是纯色，看一眼画面：${frameNumText(smallFrames)}`);
        if (checkMode === '存') {
          const file = checkFile(checkName, segKey);
          writeCheckRecord(file, { segment: segKey, 段帧数: x.frameCount, fingerprint: x.fingerprint, commit: commitText(), ...(x.writeDir ? { imageDir: path.resolve(x.writeDir) } : {}), frame: current });
          runRecord.artifacts.push(file);
          console.log(`✓ ${segKey}：${current.size} 帧 → ${file}`);
          continue;
        }
        const { 相同: same, 不同: mismatches } = compareChecks(x.baseline!.frame, current);
        const fingerprintNote = x.baseline!.fingerprint === x.fingerprint ? `段指纹和存基准时一样（${x.fingerprint.slice(0, 16)}）` : `段指纹变了（基准 ${x.baseline!.fingerprint.slice(0, 16)}，现在 ${x.fingerprint.slice(0, 16)}）`;
        if (!mismatches.length) {
          console.log(`✓ ${segKey}：${same} 帧全部相同；${fingerprintNote}`);
          continue;
        }
        // 差多少：两边都是无损 PNG，解码逐像素比；解码是重活，懒过放行闸（只在有不同的帧、基准留了图时）
        const diffs = new Map<number, FrameDiff | string>();
        if (x.baselineImages) {
          const newDir = x.writeDir ?? scratch();
          const threshold = readThresholds();
          await backend.passGate(async () => {
            for (const m of mismatches) {
              try {
                const d = frameDiff(fs.readFileSync(stillFile(newDir, segKey, m.frame)), fs.readFileSync(stillFile(x.baselineImages!, segKey, m.frame)), threshold);
                diffs.set(m.frame, d);
                diffed.push({ segment: segKey, frame: m.frame, d });
              } catch (e) {
                diffs.set(m.frame, `比不了：${(e as Error).message.split('\n')[0]}`);
              }
            }
          }, undefined, {}, { kind: '逐帧比图', work: workName(), segment: segKey, itemCount: mismatches.length, purpose: process.env.ANIM_PURPOSE ?? '核对' });
          if (!o.keepDir) for (const m of mismatches) fs.rmSync(stillFile(newDir, segKey, m.frame), { force: true });
        }
        const withinTolerance = (f: number) => {
          const d = diffs.get(f);
          return tolerance !== null && typeof d === 'object' && d.maxDiff <= tolerance;
        };
        const over = mismatches.filter((m) => !withinTolerance(m.frame));
        const frameLine = (m: (typeof mismatches)[number]) => {
          const d = diffs.get(m.frame);
          return `第 ${m.frame} 帧：${typeof d === 'object' ? frameDiffText(d) : `基准 ${m.baseline.slice(0, 16)}，这次 ${m.current.slice(0, 16)}${d ? `（${d}）` : ''}`}`;
        };
        const listLines = (list: typeof mismatches) => [...list.slice(0, maxListedDiffFrames).map(frameLine), ...(list.length > maxListedDiffFrames ? [`另 ${list.length - maxListedDiffFrames} 帧`] : [])];
        const toleranceNote = tolerance !== null && over.length < mismatches.length ? `；其中 ${mismatches.length - over.length} 帧最大差不超过 ${tolerance} 级，算过` : '';
        if (!over.length) {
          console.log([`✓ ${segKey}：${current.size} 帧里 ${mismatches.length} 帧字节不同，最大差都不超过 ${tolerance} 级（--tolerance），算过；${fingerprintNote}`, ...listLines(mismatches)].join('\n    '));
          continue;
        }
        addError([`${segKey}：${current.size} 帧里 ${mismatches.length} 帧不同（${frameNumText(mismatches.map((d) => d.frame))}）${toleranceNote}；${fingerprintNote}`, ...listLines(tolerance !== null ? over : mismatches)].join('\n    '));
      }
    }, runRecord, { preload: group.map((x) => x.segment.key) })).finally(() => scratchDir && fs.rmSync(scratchDir, { recursive: true, force: true }));
  }
  if (diffed.length) {
    const worst = [...diffed].sort((a, b) => worseFirst(a.d, b.d)).slice(0, worstListed);
    console.log([`\n最差的 ${worst.length} 帧（共比了 ${diffed.length} 帧不同的）：`, ...worst.map((w) => `  ${w.segment} 第 ${w.frame} 帧：${frameDiffText(w.d)}`)].join('\n'));
  }
  if (savedImages) console.log(`基准图 ${savedImages} 张（${savedImageBytes >= 1e9 ? `${(savedImageBytes / 1e9).toFixed(2)} GB` : `${(savedImageBytes / 1e6).toFixed(1)} MB`}）留在 ${frameCheckDir(checkName)}/<段键>/，比的时候报差多少用；cache gc 不删，用完手删（存的时候 --no-images 不留）`);
  if (o.keepDir && kept) console.log(`${checkMode === '比' ? '不同的帧' : 'PNG'}在 ${path.resolve(o.keepDir)}`);
  if (!plans.length && !failed) addError(`一段都没${checkMode}：选中的段本机都没有区段包`);
  const skipText = skipped.length ? `；跳过 ${skipped.join('、')}，没${checkMode}` : '';
  console.log(failed ? `\n${failed} 处没过${skipText}` : checkMode === '比' ? `\n${plans.length} 段都相同${skipText}` : `\n${plans.length} 段存好了，比的时候 --compare ${checkName}${skipText}`);
  return failed ? 1 : 0;
};
