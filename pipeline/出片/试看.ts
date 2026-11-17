// 试看出片：设了 REMOTION_ANIM_TRIAL 的 anim film（用户 11-17 定：试看对比视频走正规的边渲边编，不再 still 落几千张 PNG 再另编一遍）。
// 和切片同一套参数（段产物.ts 的 segPictureParams：4K60、同样的压法、带字幕，声音同一遍出），出来的能直接和成片对比；
// 但正式产物一样不碰：不算指纹、不写切片缓存、不派生段签、不删旧切片、不碰认可，也不记这段的地形用量（试看可能多读包），片子由 拼成片.ts 写到 run/草稿/。
// 地形照 still：当场读登记表，并上试看参数「地形」列的包（地形注入.ts）。打包、浏览器、Remotion、闸经 opts.backend（渲/后端.ts）。
import fs from 'node:fs';
import path from 'node:path';
import type { RenderLevel } from '../../engine/段/设置值.ts';
import { workName, workRoot } from '../环境/作品.ts';
import type { SegInfo } from '../清单/清单.ts';
import { recordTiming, type RunRecord } from '../运行记录/记录.ts';
import { recordPhase, measureStage } from '../运行记录/阶段.ts';
import type { DetailCollector } from '../运行记录/渲染明细.ts';
import { segTerrainNow, trialEnv, trialTerrain, terrainOnlyEnv, shellTrialMode } from '../渲/地形注入.ts';
import { waitSolveCacheWrites } from '../渲/求解缓存收集.ts';
import { realBackend, type RenderBackend } from '../渲/后端.ts';
import { findComposition, missingLocalTerrain, measureRender } from '../渲/渲.ts';
import { segOutputWindow, segPictureParams, type FilmPiece } from '../渲/段产物.ts';
import { filmProfile, frameTimeoutMs } from '../渲/设置.ts';
import { videoInfo } from '../渲/探测.ts';

/** 试看片的耗时另记一个标签，不混进切片的预计耗时（render:…） */
export const trialLabel = (segKey: string, level: RenderLevel) => `试看:${workName()}/${segKey}:${level}`;

/**
 * 各段出到 工作目录/<段键>.mp4、.wav，返回接成片要的样子（没有指纹）。frames：段内输出帧号的闭区间，只给一段时用。
 * 页面只拿 地形版本表 和试看参数：不给地形用量的段名，页面就不记用量
 */
export const renderTrialSegments = async (allSegments: readonly SegInfo[], selected: readonly SegInfo[], level: RenderLevel, opts: { frames?: [number, number]; workDir: string; runRecord: RunRecord; backend?: RenderBackend }): Promise<FilmPiece[]> => {
  const backend = opts.backend ?? realBackend;
  if (opts.frames && selected.length !== 1) throw new Error('试看的 --frames 只能配一段');
  for (const s of selected) {
    const pack = missingLocalTerrain(s);
    if (pack) throw new Error(`${s.key} 要的区段包 ${pack} 本机没有（anim world bake 烘出来才能渲）`);
  }
  const fps = filmProfile().fps;
  const params = segPictureParams(allSegments, selected, level);
  const pieces = selected.map((s, i) => {
    const window = segOutputWindow(allSegments, s);
    const [a, b] = opts.frames ?? [0, window.frameCount - 1];
    if (!(Number.isInteger(a) && Number.isInteger(b) && 0 <= a && a <= b && b < window.frameCount)) throw new Error(`${s.key} 只有 ${window.frameCount} 帧（0-${window.frameCount - 1}），--frames ${a}-${b} 不在里面`);
    const start = window.start + a;
    const frameCount = b - a + 1;
    const piece: FilmPiece = { segment: s, 画面: path.join(opts.workDir, `${s.key}.mp4`), sound: path.join(opts.workDir, `${s.key}.wav`), outputFrames: frameCount, outputStartFrame: start, soundStartSec: start / fps, soundEndSec: (start + frameCount) / fps };
    return { piece, params: params[i]!, frameRange: [a, b] as [number, number], whole: !opts.frames };
  });
  fs.mkdirSync(opts.workDir, { recursive: true });
  await backend.perResourcePackGroup(workRoot(), pieces, (x) => x.piece.segment.key, (group) => backend.openSession(level, async (h) => {
    for (const { piece, params: p, frameRange, whole } of group) {
      const s = piece.segment;
      const composition = findComposition(h, s, allSegments);
      const label = trialLabel(s.key, level);
      await measureStage(opts.runRecord.stage, label, '等求解缓存', waitSolveCacheWrites);
      const env = { ...terrainOnlyEnv(segTerrainNow(s, trialTerrain()), shellTrialMode()), ...trialEnv() };
      const queueStartMs = Date.now();
      const detail = await backend.passRenderGate(async () => {
        const t0 = Date.now();
        recordPhase(opts.runRecord.stage, label, '等闸', queueStartMs, (t0 - queueStartMs) / 1000);
        let code = 1;
        const holder: { detail?: DetailCollector } = {};
        try {
          console.log(`== 试看 ${s.key} 第 ${frameRange[0]}-${frameRange[1]} 帧（${piece.outputFrames} 帧）画面、声音`);
          holder.detail = await measureRender(label, opts.runRecord.stage, t0, (hooks) => backend.renderMedia({
            separateAudioTo: piece.sound,
            audioCodec: p.audioCodec,
            serveUrl: h.serveUrl,
            composition,
            frameRange: whole ? null : frameRange,
            outputLocation: piece.画面,
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
          const frameCount = videoInfo(piece.画面).frameCount;
          if (frameCount !== piece.outputFrames) throw new Error(`${s.key} 试看渲出来 ${frameCount} 帧，应该是 ${piece.outputFrames} 帧`);
          code = 0;
          holder.detail?.stopTimer();
        } finally {
          const elapsedSec = (Date.now() - t0) / 1000;
          recordTiming(label, t0, elapsedSec, code, `anim film ${s.key}（试看 ${frameRange[0]}-${frameRange[1]}）`);
          if (code === 0) console.log(`   ${s.key}：${elapsedSec.toFixed(0)} 秒（${(elapsedSec / piece.outputFrames).toFixed(2)} 秒/帧）`);
        }
        return holder.detail;
      }, undefined, {}, { kind: 'render', work: workName(), segment: s.key, level, frameCount: piece.outputFrames, frame: `${frameRange[0]}-${frameRange[1]}`, itemCount: pieces.length, canYield: pieces.length > 1, purpose: process.env.ANIM_PURPOSE ?? '试看' });
      await detail?.writeOut(opts.runRecord.stage, trialEnv());
    }
  }, opts.runRecord, { preload: group.map((x) => x.piece.segment.key) }));
  return pieces.map((x) => x.piece);
};
