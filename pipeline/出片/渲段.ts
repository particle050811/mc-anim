// 渲段：唯一的出片路（用户 11-06「要改 改成直接出带字幕的成片」「那个 render 不用了 可以直接删了吧」，决策/0014）。
// 每段渲出来就是成片的一截（段产物.ts）：画面按成片参数直接压成 <指纹>.mp4；声音 <指纹>.wav 和画面同一遍出（separateAudioTo，决策/0015）；成片只接不重压（拼成片.ts）。
// 指纹对得上就不渲（✓ 已是最新）。要渲的每段排队过一次渲染闸（任务种 render，耗时表标签 render:<作品>/<段>:<级别>），闸里依次：
//   画面、声音同一遍出（Remotion 直出，核帧数 = 输出窗帧数）→ 从这两份派生段签（验收/段签.ts，verify 的签名、首尾小图、声音.flac）→ 删同段同级别的旧产物（缓存/钉.ts）。
// 删旧只在主检出做（worktree 渲的是没合并的改动，「旧」很可能还是 main 的当前指纹）；命中「已是最新」的也清一遍（worktree 里渲的合进来后第一次出片走这里）。
// 段目录下 本机地形.txt 写的区段包本机没有就跳过这段（用户 10-31 定，不让一条批量渲染死在核对段上）。
import fs from 'node:fs';
import path from 'node:path';
import type { RenderLevel } from '../../engine/段/设置值.ts';
import { masterDir } from '../环境/作品数据.ts';
import { dataRoot } from '../环境/配置.ts';
import { workName, workRoot } from '../环境/作品.ts';
import type { SegInfo } from '../清单/清单.ts';
import { fillBytesAndReport } from '../分发/随仓库.ts';
import { perGroupWithResourcePacks } from '../资产/资产锁.ts';
import { passRenderGate, registerTempFile } from '../闸/闸.ts';
import { recordTiming, estimateTiming, type RunRecord } from '../运行记录/记录.ts';
import { recordPhase, measureStage } from '../运行记录/阶段.ts';
import type { DetailCollector } from '../运行记录/渲染明细.ts';
import { deleteOld, hasOldToDelete } from '../缓存/钉.ts';
import { deriveSegStamp } from '../验收/段签.ts';
import { driftHint } from '../验收/取段签.ts';
import { segRenderEnv } from '../渲/地形注入.ts';
import { startWholeMeasure, recordMeasuredFrames } from '../渲/地形用量.ts';
import { waitSolveCacheWrites } from '../渲/求解缓存收集.ts';
import { writeFingerprint, markUsed } from '../渲/母版.ts';
import { renderMedia } from '../渲/渲染器.ts';
import { openSession, findComposition, renderLabel, missingLocalTerrain, measureRender } from '../渲/渲.ts';
import { segmentProducts, type SegArtifact } from '../渲/段产物.ts';
import { frameTimeoutMs } from '../渲/设置.ts';
import { videoInfo } from '../渲/探测.ts';

export { segmentProducts, type SegArtifact } from '../渲/段产物.ts';

/** 这段的当前画面、声音指纹（删旧时都不算旧） */
const currentFingerprints = (r: SegArtifact) => [r.画面指纹.指纹, r.声音指纹.指纹];

/** 先写临时名、成了再改名；先记「刚用过」再改名：别的进程的删旧在闸外，只靠它挡着 */
const writeTo = async (file: string, segKey: string, fingerprint: string, renderFn: (tmp: string) => Promise<unknown>) => {
  const tmp = file.replace(/(\.\w+)$/, `.渲染中-${process.pid}$1`);
  const undo = registerTempFile(tmp);
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  try {
    await renderFn(tmp);
    markUsed(masterDir(segKey), fingerprint);
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
    undo();
  }
};

/**
 * 缺的（或 重渲）就渲；返回各段产物（本机没有区段包、跳过的段不在里面）。全部 = 整部作品的段（排字幕、算全片位置）
 */
export const renderSegments = async (allSegments: readonly SegInfo[], selected: readonly SegInfo[], level: RenderLevel, opts: { rerender?: boolean; runRecord: RunRecord }): Promise<SegArtifact[]> => {
  const segments = selected.filter((s) => {
    const pack = missingLocalTerrain(s);
    if (pack) console.log(`跳过 ${s.键}：本机没有区段包 ${pack}（anim world bake 烘出来才能渲）`);
    return !pack;
  });
  const totalLabel = `批:${workName()}:${level}`;
  // 先补字节再算指纹：空数据根时指纹的「缺字节」项要按补完的算，不然产物落在错的指纹下、下次认不出
  await measureStage(opts.runRecord.阶段, totalLabel, '准备', async () => fillBytesAndReport(workRoot(), dataRoot()));
  const outputs = await measureStage(opts.runRecord.阶段, totalLabel, '算指纹', () => segmentProducts(allSegments, segments, level));
  const toRender = outputs.filter((r) => opts.rerender || !fs.existsSync(r.画面) || !fs.existsSync(r.声音));
  const cachedOutputs = outputs.filter((r) => !toRender.includes(r));
  for (const r of cachedOutputs) {
    console.log(`✓ ${r.段.键}：已是最新（画面 ${r.画面指纹.指纹.slice(0, 16)}、声音 ${r.声音指纹.指纹.slice(0, 16)}）`);
    for (const fp of currentFingerprints(r)) markUsed(masterDir(r.段.键), fp);
  }
  // 命中的也清旧；有要删的才过闸
  const toClean = cachedOutputs.filter((r) => hasOldToDelete('母版', r.段.键, level, currentFingerprints(r)));
  if (toClean.length) await measureStage(opts.runRecord.阶段, totalLabel, '清旧', () => passRenderGate(async () => {
    for (const r of toClean) deleteOld('母版', r.段.键, level, currentFingerprints(r), { runRecord: opts.runRecord });
  }, undefined, {}, { 种: '清命中的旧', 不开渲染: true }));
  if (!toRender.length) return outputs;

  const estimates = toRender.map((r) => estimateTiming(renderLabel(r.段.键, level)));
  const knownEstimates = estimates.filter((x): x is number => x !== null);
  console.log(
    `== 要渲 ${toRender.length} 段：${toRender.map((r) => r.段.键).join('、')}` +
      (knownEstimates.length ? `；按耗时表预计约 ${Math.round(knownEstimates.reduce((a, b) => a + b, 0))} 秒${knownEstimates.length < toRender.length ? `（另 ${toRender.length - knownEstimates.length} 段没有记录）` : ''}` : '；耗时表里还没有这些段的记录'),
  );
  // 材质包按段选的一组一个打包（资产锁.ts）；不按段选的只有一组
  await perGroupWithResourcePacks(workRoot(), toRender, (r) => r.段.键, (group) => openSession(level, async (h) => {
    for (const r of group) {
      const segKey = r.段.键;
      const composition = findComposition(h, r.段, allSegments);
      const label = renderLabel(segKey, level);
      await measureStage(opts.runRecord.阶段, label, '等求解缓存', waitSolveCacheWrites);
      const env = segRenderEnv(segKey, r.画面指纹.项.地形);
      const queueStartMs = Date.now();
      const detail = await passRenderGate(async () => {
        const t0 = Date.now();
        recordPhase(opts.runRecord.阶段, label, '等闸', queueStartMs, (t0 - queueStartMs) / 1000);
        let code = 1;
        const holder: { 明细?: DetailCollector } = {};
        try {
          // 声音和画面同一遍出：缺哪样都整遍重渲，wav 先写临时名，画面成了再改名
          if (opts.rerender || !fs.existsSync(r.画面) || !fs.existsSync(r.声音)) {
            console.log(`== 渲 ${segKey} 画面、声音`);
            const p = r.参数;
            startWholeMeasure(segKey, r.画面指纹.指纹);
            const soundTempFile = r.声音.replace(/(\.\w+)$/, `.渲染中-${process.pid}$1`);
            const cleanupSound = registerTempFile(soundTempFile);
            try {
              await writeTo(r.画面, segKey, r.画面指纹.指纹, async (tmp) => {
                holder.明细 = await measureRender(label, opts.runRecord.阶段, t0, (hooks) => renderMedia({
                  separateAudioTo: soundTempFile,
                  audioCodec: p.audioCodec,
                  serveUrl: h.serveUrl,
                  composition,
                  outputLocation: tmp,
                  inputProps: p.inputProps,
                  envVariables: env,
                  puppeteerInstance: h.browser,
                  chromiumOptions: { gl: p.gl },
                  codec: p.codec,
                  crf: p.crf,
                  x264Preset: p.x264Preset,
                  encodingMaxRate: p.encodingMaxRate,
                  encodingBufferSize: p.encodingBufferSize,
                  colorSpace: p.colorSpace,
                  pixelFormat: p.pixelFormat,
                  muted: p.muted,
                  imageFormat: p.imageFormat,
                  jpegQuality: p.jpegQuality,
                  scale: p.scale,
                  concurrency: p.concurrency,
                  timeoutInMilliseconds: frameTimeoutMs,
                  overwrite: true,
                  ...hooks,
                }));
                const frameCountStartMs = Date.now();
                const frameCount = videoInfo(tmp).帧数;
                recordPhase(opts.runRecord.阶段, label, '查帧数', frameCountStartMs, (Date.now() - frameCountStartMs) / 1000);
                if (frameCount !== r.outputFrames) throw new Error(`${segKey} 渲出来 ${frameCount} 帧，按全片位置应该是 ${r.outputFrames} 帧`);
                fs.renameSync(soundTempFile, r.声音);
              });
            } finally {
              fs.rmSync(soundTempFile, { force: true });
              cleanupSound();
            }
            writeFingerprint(r.画面指纹);
            await recordMeasuredFrames(segKey, Array.from({ length: r.outputFrames }, (_, i) => i));
          }
          code = 0;
          holder.明细?.stopTimer();
        } finally {
          const elapsedSec = (Date.now() - t0) / 1000;
          recordTiming(label, t0, elapsedSec, code, `anim film ${segKey}`);
          if (code === 0) console.log(`   ${segKey}：${elapsedSec.toFixed(0)} 秒 → ${r.画面}、${path.basename(r.声音)}`);
        }
        // 段签在闸里当场派生（要解一遍切片；不计进耗时表）：之后 verify、认指纹 不用再解
        const segStampStartMs = Date.now();
        const segStamp = await deriveSegStamp(r, { 派生: '渲染', 计时: { 收: opts.runRecord.阶段, 标签: label } });
        if (segStamp.自查?.结论 === '漂移') opts.runRecord.log('警告', driftHint(segKey, segStamp.自查));
        recordPhase(opts.runRecord.阶段, label, '段签', segStampStartMs, (Date.now() - segStampStartMs) / 1000);
        deleteOld('母版', segKey, level, currentFingerprints(r), { runRecord: opts.runRecord });
        return holder.明细;
      }, undefined, {}, { 种: 'render', 作品: workName(), 段: segKey, 级别: level, 帧数: r.outputFrames, 项数: toRender.length, 可让路: toRender.length > 1, 用途: process.env.ANIM_PURPOSE ?? '产出' });
      await detail?.writeOut(opts.runRecord.阶段, { 指纹: r.画面指纹.指纹.slice(0, 16) });
      opts.runRecord.产物.push(r.画面, r.声音);
    }
  }, opts.runRecord));
  return outputs;
};
