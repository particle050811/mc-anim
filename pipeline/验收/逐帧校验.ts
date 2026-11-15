// anim verify frames：每帧 PNG 算 sha 存成一份有名字的记录（run/逐帧校验/<作品>/<名>/<段键>.tsv），之后再渲一次比，列出不同的帧。方便对比最终结果（用户 10-31 定）。
// 和 anim verify 的分工：verify 比认可版的抽样帧、有阈值、可 accept；这里每帧都比、按字节、没有阈值，不写母版，不碰段签和认可。
// 全程只打包一次（开会话，用完删包），每段过一次渲染闸，并发 1；同一页面按帧号升序连着渲、声音开着，参数和切片那遍一样（带字幕、帧号是输出帧），走法和 renderMedia 出切片一样。
// 同一批帧才能比：隔开的帧在同一页面连出，和连续渲或单帧出不保证相同（docs/渲染性能.md「同一帧的像素取决于之前渲过哪些帧」）。所以 --compare 永远照基准存的帧渲，给了 --frames 也只是渲到那里为止，前面的帧不省。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { UsageError } from '../cli/参数.ts';
import { workName, workRoot } from '../环境/作品.ts';
import { commitStatus } from '../环境/路径.ts';
import { frameCheckDir } from '../环境/作品数据.ts';
import { dataRoot } from '../环境/配置.ts';
import type { SegInfo } from '../清单/清单.ts';
import { passRenderGate } from '../闸/闸.ts';
import { fillBytesAndReport } from '../资产/随仓库.ts';
import { perGroupWithResourcePacks } from '../资产/资产锁.ts';
import { estimateTiming, type RunRecord } from '../运行记录/记录.ts';
import { recordPhase } from '../运行记录/阶段.ts';
import { DetailCollector } from '../运行记录/渲染明细.ts';
import { waitSolveCacheWrites } from '../渲/求解缓存收集.ts';
import { renderFramesSamePage, openSession, findComposition, renderLabel, missingLocalTerrain, stillFile } from '../渲/渲.ts';
import { segRenderEnv } from '../渲/地形注入.ts';
import { recordMeasuredFrames } from '../渲/地形用量.ts';
import { segmentProducts } from '../渲/段产物.ts';
import type { RenderParamsTable } from '../渲/设置.ts';
import { loadAllSegments } from '../清单/清单.ts';

const level = '视频' as const;
// 4K 的真画面 PNG 都上 MB，几十 KB 只能是纯色或接近纯色；只提醒不拦，段里本来可能有黑场
const solidSuspectBytes = 64 * 1024;
const maxListedDiffFrames = 20;
const FIRST_FRAME_SEC = 15;

export type FrameCheck = { sha: string; 字节: number };
export type CheckRecord = { 段: string; 段帧数: number; 指纹: string; 提交: string; 帧: Map<number, FrameCheck> };

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

/** 先写临时名再改名：渲到一半被杀不留半份基准 */
export const writeCheckRecord = (file: string, r: CheckRecord) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const frameLines = [...r.帧].sort((a, b) => a[0] - b[0]).map(([f, x]) => `${f}\t${x.sha}\t${x.字节}`);
  const tmp = `${file}.写入中-${process.pid}`;
  fs.writeFileSync(tmp, [`# 段\t${r.段}`, `# 段帧数\t${r.段帧数}`, `# 指纹\t${r.指纹}`, `# 提交\t${r.提交}`, '帧\tsha256\t字节', ...frameLines, ''].join('\n'), 'utf8');
  fs.renameSync(tmp, file);
};

export const readCheckRecord = (file: string): CheckRecord => {
  const r: CheckRecord = { 段: '', 段帧数: 0, 指纹: '', 提交: '', 帧: new Map() };
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line || line.startsWith('帧\t')) continue;
    const cols = line.split('\t');
    if (line.startsWith('# ')) {
      const propKey = cols[0]!.slice(2);
      if (propKey === '段') r.段 = cols[1]!;
      else if (propKey === '段帧数') r.段帧数 = Number(cols[1]);
      else if (propKey === '指纹') r.指纹 = cols[1]!;
      else if (propKey === '提交') r.提交 = cols[1]!;
      continue;
    }
    const frame = Number(cols[0]);
    if (!Number.isInteger(frame) || !/^[0-9a-f]{64}$/.test(cols[1] ?? '')) throw new Error(`${file} 读不懂这一行：${line}`);
    r.帧.set(frame, { sha: cols[1]!, 字节: Number(cols[2]) });
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
  const mismatches = [...current].filter(([f, x]) => baseline.get(f)?.sha !== x.sha).map(([f, x]) => ({ 帧: f, 基准: baseline.get(f)?.sha ?? '', current: x.sha })).sort((a, b) => a.帧 - b.帧);
  return { 相同: current.size - mismatches.length, 不同: mismatches };
};

const commitText = () => {
  const x = commitStatus();
  return x ? `${x.提交}${x.有改动 ? '+未提交改动' : ''}` : '不在 git 里';
};

type SegPlan = { 段: SegInfo; 帧: number[]; 基准: CheckRecord | null; 指纹: string; 地形: Record<string, string>; 帧数: number; 参数: RenderParamsTable };

export const runPerFrame = async (segments: readonly SegInfo[], o: { checkMode: '存' | '比'; 名: string; 帧: readonly number[] | null; keepDir: string | null; runRecord: RunRecord }): Promise<number> => {
  const { checkMode, 名: checkName, runRecord } = o;
  let failed = 0;
  let kept = 0;
  const addError = (messageText: string) => {
    failed++;
    runRecord.log('错误', messageText);
  };
  const skipped: string[] = [];
  const wantedSegs = segments.filter((s) => {
    const pack = missingLocalTerrain(s);
    if (!pack) return true;
    skipped.push(s.键);
    // 存过基准的段没渲到就是没比到，不能算过；没存过的段这台机器本来就比不了（章选择器存的时候也跳过了它）
    if (checkMode === '比' && fs.existsSync(checkFile(checkName, s.键))) addError(`${s.键}：「${checkName}」里存过这段，但本机没有区段包 ${pack}，没比到（anim world bake 烘出来才能渲）`);
    else console.log(`跳过 ${s.键}：本机没有区段包 ${pack}（anim world bake 烘出来才能渲）`);
    return false;
  });
  // 不覆盖基准：存错了换个名，比的时候不会悄悄和新存的比
  if (checkMode === '存') {
    const existing = wantedSegs.filter((s) => fs.existsSync(checkFile(checkName, s.键)));
    if (existing.length) throw new UsageError(`「${checkName}」里已经有 ${existing.map((s) => s.键).join('、')}，不覆盖：换个名，或者选别的段`);
  }
  fillBytesAndReport(workRoot(), dataRoot());
  const allSegments = await loadAllSegments();
  const outputs = await segmentProducts(allSegments, wantedSegs, level);
  const plans: SegPlan[] = [];
  for (const [i, s] of wantedSegs.entries()) {
    const file = checkFile(checkName, s.键);
    if (checkMode === '比' && !fs.existsSync(file)) {
      addError(`${s.键}：「${checkName}」里没存过这段（${file}），先 anim verify frames ${s.键} --save ${checkName}`);
      continue;
    }
    const baseline = checkMode === '比' ? readCheckRecord(file) : null;
    const artifact = outputs[i]!;
    const frameCount = artifact.outputFrames;
    const { toRender, outOfRange, missingInBase } = pickRenderFrames(frameCount, o.帧, baseline ? [...baseline.帧.keys()].sort((a, b) => a - b) : null);
    const baselineOutOfRange = outOfRange.filter((f) => baseline?.帧.has(f));
    if (baselineOutOfRange.length) addError(`${s.键}：段现在只有 ${frameCount} 帧，基准存的这些帧没了：${frameNumText(baselineOutOfRange)}`);
    else if (outOfRange.length) console.log(`· ${s.键} 只有 ${frameCount} 帧，不渲 ${frameNumText(outOfRange)}`);
    if (missingInBase.length) console.log(`· ${s.键}：基准没存这些帧，比不了：${frameNumText(missingInBase)}`);
    if (o.帧 && baseline && toRender.some((f) => !o.帧!.includes(f))) console.log(`· ${s.键}：基准的帧是连着渲的，隔开渲比不了，这次连前面的帧一起渲、一起比：${frameNumText(toRender)}`);
    if (baseline && !o.帧 && baseline.段帧数 !== frameCount) addError(`${s.键}：存基准时段有 ${baseline.段帧数} 帧，现在 ${frameCount} 帧（段长或帧率变过，要重存）`);
    if (!toRender.length) {
      addError(`${s.键}：没有能渲的帧`);
      continue;
    }
    plans.push({ 段: s, 帧: toRender, 基准: baseline, 指纹: artifact.画面指纹.指纹, 地形: artifact.画面指纹.项.地形, 帧数: frameCount, 参数: artifact.参数 });
  }
  // 开跑前查：不覆盖，也不和上次留的混在一起；比的时候哪帧不同渲完才知道，按可能写的算
  if (o.keepDir) {
    const existingFiles = plans.flatMap((x) => x.帧.map((f) => stillFile(o.keepDir!, x.段.键, f))).filter((f) => fs.existsSync(f));
    if (existingFiles.length) throw new UsageError(`--keep-images ${o.keepDir} 里已经有 ${existingFiles.length} 张这次可能写的 PNG（${path.basename(existingFiles[0]!)} 等），不覆盖：换个空目录`);
    fs.mkdirSync(o.keepDir, { recursive: true });
  }
  if (plans.length) {
    const estimates = plans.map((x) => {
      const wholeSegSec = estimateTiming(renderLabel(x.段.键, level));
      if (wholeSegSec === null) return null;
      // 只渲一截时第一帧的读地形摊不到，单独加上
      return x.帧.length === x.帧数 ? wholeSegSec : (wholeSegSec * x.帧.length) / x.帧数 + FIRST_FRAME_SEC;
    });
    const knownEstimates = estimates.filter((x): x is number => x !== null);
    console.log(`== 逐帧${checkMode} ${plans.length} 段、${plans.reduce((a, x) => a + x.帧.length, 0)} 帧${knownEstimates.length ? `；按耗时表预计约 ${Math.round(knownEstimates.reduce((a, b) => a + b, 0))} 秒${knownEstimates.length < plans.length ? `（另 ${plans.length - knownEstimates.length} 段没有记录）` : ''}` : ''}`);
    await perGroupWithResourcePacks(workRoot(), plans, (x) => x.段.键, (group) => openSession(level, async (h) => {
      for (const x of group) {
        const segKey = x.段.键;
        const composition = findComposition(h, x.段, allSegments);
        const label = `逐帧校验:${workName()}/${segKey}`;
        await waitSolveCacheWrites();
        const queueStartMs = Date.now();
        const current = new Map<number, FrameCheck>();
        await passRenderGate(async () => {
          const t0 = Date.now();
          recordPhase(runRecord.阶段, label, '等闸', queueStartMs, (t0 - queueStartMs) / 1000);
          const detail = new DetailCollector(label);
          await detail.包(() =>
            renderFramesSamePage({ ...h, 参数: x.参数 }, composition, x.帧, {
              withAudio: true,
              环境: segRenderEnv(segKey, x.地形),
              onFrame: (png, f) => {
                const sha = crypto.createHash('sha256').update(png).digest('hex');
                current.set(f, { sha, 字节: png.length });
                // 比的时候只留不同的帧：相同的和基准一样，整段的 PNG 又很占地方
                if (o.keepDir && (!x.基准 || x.基准.帧.get(f)?.sha !== sha)) {
                  fs.writeFileSync(stillFile(o.keepDir, segKey, f), png, { flag: 'wx' });
                  kept++;
                }
                detail.frameDone(current.size);
                if (current.size % 100 === 0) console.error(`   ${segKey}：${current.size}/${x.帧.length} 帧`);
              },
            }),
          );
          await recordMeasuredFrames(segKey, x.帧);
          recordPhase(runRecord.阶段, label, '出帧', t0, (Date.now() - t0) / 1000);
          await detail.writeOut(runRecord.阶段, { 指纹: x.指纹.slice(0, 16) });
        },undefined,{}, {种:'逐帧校验',作品:workName(),段:segKey,帧数:x.帧.length,帧:x.帧.join(',').slice(0,60),用途:process.env.ANIM_PURPOSE??'核对'});
        const smallFrames = [...current].filter(([, v]) => v.字节 < solidSuspectBytes).map(([f]) => f).sort((a, b) => a - b);
        if (smallFrames.length) runRecord.log('警告', `${segKey}：这些帧的 PNG 不到 ${solidSuspectBytes / 1024} KB，可能是纯色，看一眼画面：${frameNumText(smallFrames)}`);
        if (checkMode === '存') {
          const file = checkFile(checkName, segKey);
          writeCheckRecord(file, { 段: segKey, 段帧数: x.帧数, 指纹: x.指纹, 提交: commitText(), 帧: current });
          runRecord.产物.push(file);
          console.log(`✓ ${segKey}：${current.size} 帧 → ${file}`);
          continue;
        }
        const { 相同: same, 不同: mismatches } = compareChecks(x.基准!.帧, current);
        const fingerprintNote = x.基准!.指纹 === x.指纹 ? `段指纹和存基准时一样（${x.指纹.slice(0, 16)}）` : `段指纹变了（基准 ${x.基准!.指纹.slice(0, 16)}，现在 ${x.指纹.slice(0, 16)}）`;
        if (!mismatches.length) {
          console.log(`✓ ${segKey}：${same} 帧全部相同；${fingerprintNote}`);
          continue;
        }
        const detailLines = mismatches.slice(0, maxListedDiffFrames).map((d) => `第 ${d.帧} 帧：基准 ${d.基准.slice(0, 16)}，这次 ${d.current.slice(0, 16)}`);
        addError([`${segKey}：${current.size} 帧里 ${mismatches.length} 帧不同（${frameNumText(mismatches.map((d) => d.帧))}）；${fingerprintNote}`, ...detailLines, ...(mismatches.length > maxListedDiffFrames ? [`另 ${mismatches.length - maxListedDiffFrames} 帧`] : [])].join('\n    '));
      }
    }, runRecord));
  }
  if (o.keepDir && kept) console.log(`${checkMode === '比' ? '不同的帧' : 'PNG'}在 ${path.resolve(o.keepDir)}`);
  if (!plans.length && !failed) addError(`一段都没${checkMode}：选中的段本机都没有区段包`);
  const skipText = skipped.length ? `；跳过 ${skipped.join('、')}，没${checkMode}` : '';
  console.log(failed ? `\n${failed} 处没过${skipText}` : checkMode === '比' ? `\n${plans.length} 段都相同${skipText}` : `\n${plans.length} 段存好了，比的时候 --compare ${checkName}${skipText}`);
  return failed ? 1 : 0;
};
