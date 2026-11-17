import {recordPhase} from '../运行记录/阶段.ts';
// 测速：同一段取一段帧，照切片的渲染参数（带这段的字幕、按输出帧）渲一遍，按阶段计时（打包 / 开浏览器 / 读 Composition / 首帧 / 出帧 / 编码收尾），不写切片缓存、不按段记耗时（不影响 anim film 报的预计耗时）。
// 用途：比 Remotion 版本、比引擎改动前后（docs/渲染性能.md）。走渲染闸；输出 mp4 放临时目录，跑完删掉。帧号是输出帧。
// 命令行是 anim bench（渲/命令.ts）。详细：Remotion 开 verbose，日志写到 `日志`，看它自己报的各步耗时。
// --no-shm、--browser：拆 Remotion 版本差异用（共享内存截图 4.0.534 起有；换自带 Chromium 的版本），出片不用。
// 每轮都写渲染明细（运行记录/渲染明细.ts）；--no-logs 退回 logLevel error（量 verbose 的开销）；--keep-out <目录> 留下 mp4（比两版浏览器的像素）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { prepareBrowser } from './浏览器.ts';
import { getCompositions, openBrowser, renderMedia, type LogLevel } from './渲染器.ts';
import { workName, workRoot } from '../环境/作品.ts';
import { codeRoot } from '../环境/路径.ts';
import { loadAllSegments, selectSegs } from '../清单/清单.ts';
import { passRenderGate } from '../闸/闸.ts';
import { coreCount, load1Min } from '../环境/资源.ts';
import { withSegResourcePack } from '../资产/资产锁.ts';
import { DetailCollector } from '../运行记录/渲染明细.ts';
import { removeBundles } from './打包残留.ts';
import { bundleProject, findComposition } from './渲.ts';
import { preloadEnv } from '../../engine/段/预载.ts';
import { segPictureParams, segOutputWindow } from './段产物.ts';
import { shadingEnvName, type ShadingConfig } from './光影试看.ts';
import { frameTimeoutMs } from './设置.ts';
import { segRenderEnv, segTerrainNow, trialEnv, trialTerrain, shellTrialMode } from './地形注入.ts';
import { collectTerrainUsage, recordMeasuredFrames, waitTerrainUsageWrites } from './地形用量.ts';
import { collectSolveCache, waitSolveCacheWrites } from './求解缓存收集.ts';
import type { RenderLevel } from '../../engine/段/设置值.ts';

// 测速只在机器空的时候跑、排在所有票后面、默认只测一遍（--runs 1）：用户 11-17 定。测两遍和机器忙时测都白费——
// 同一组合在别的 Agent 并行时能差一倍，ABBA 两遍又让票堆起来。门槛 核数×0.6 是 Agent 选的（空机器带 VS Code 和几个会话约 5～6/10）。
// 放行时负载已过门槛（只有主 Agent 给了放行才会）就标 incomparable；跑完的负载含自己的渲染，只记不判。
const benchLoadLimit = 0.6;

export type BenchResult = {
  remotion: string;
  browser: string;
  sharedMemory: boolean;
  logLevel: LogLevel;
  segment: string;
  frame: [number, number];
  打包秒: number;
  开浏览器秒: number;
  读组合秒: number;
  求解缓存准备: { 新写: number; sec: number };
  轮: { sharedMemory: boolean; totalSec: number; 首帧秒: number; 出帧秒: number; 收尾秒: number; 每帧中位毫秒: number; 每帧P90毫秒: number; 每帧P99毫秒: number; slowestFrames: { frame: number; ms: number }[]; 最多的等待: { label: string; totalMs: number; count: number }[]; detail: string | null; output: string | null; load: { start: number | null; end: number | null; incomparable: boolean } }[];
};

const browserVersionOf = (exePath: string | undefined) => {
  if (!exePath) return '自带';
  try {
    return execFileSync(exePath, ['--version'], { encoding: 'utf8', timeout: 10_000 }).trim();
  } catch {
    return exePath;
  }
};

export const bench = async (opts: { segment: string; frame?: [number, number]; level?: RenderLevel; count?: number; verbose?: boolean; logPath?: string; disableSharedMemory?: boolean; browser?: string; noLogCollect?: boolean; keepOutput?: string; shading?: ShadingConfig }): Promise<BenchResult> => {
  const level = opts.level ?? '视频';
  const [s] = await selectSegs([opts.segment]);
  if (!s) throw new Error(`没有段 ${opts.segment}`);
  const allSegments = await loadAllSegments();
  const frameRange: [number, number] = opts.frame ?? [0, Math.min(99, segOutputWindow(allSegments, s).frameCount - 1)];
  const params = segPictureParams(allSegments, [s], level)[0]!;
  // 打包、开浏览器这几步只有 --verbose 才开 verbose；renderMedia 默认 verbose，日志进明细
  const earlyLogLevel: LogLevel = opts.verbose ? 'verbose' : 'error';
  const renderLogLevel: LogLevel = opts.noLogCollect ? 'error' : 'verbose';
  const logStream = opts.verbose && opts.logPath ? fs.createWriteStream(opts.logPath) : null;
  const origLog = console.log;
  if (logStream) console.log = (...a: unknown[]) => void logStream.write(a.map(String).join(' ') + '\n');
  const remotion = (createRequire(path.join(codeRoot(), 'package.json'))('remotion/package.json') as { version: string }).version;
  try {
    let t = Date.now();
    const serveUrl = await withSegResourcePack(workRoot(), s.key, () => bundleProject(undefined, undefined, { shading: !!opts.shading }));
    const bundleSec = (Date.now() - t) / 1000;
    t = Date.now();
    const browser = await openBrowser('chrome', { chromiumOptions: { gl: params.gl }, forceDeviceScaleFactor: params.scale, logLevel: earlyLogLevel, browserExecutable: opts.browser ?? (await prepareBrowser()) });
    const openBrowserSec = (Date.now() - t) / 1000;
    collectTerrainUsage(browser);
    const solveCache = collectSolveCache(browser);
    try {
      const readCompositions = () => getCompositions(serveUrl, { inputProps: params.inputProps, envVariables: preloadEnv([s.key]), puppeteerInstance: browser, chromiumOptions: { gl: params.gl }, timeoutInMilliseconds: frameTimeoutMs, logLevel: earlyLogLevel });
      t = Date.now();
      let compositions = await readCompositions();
      let readCompositionsSec = (Date.now() - t) / 1000;
      await waitSolveCacheWrites();
      await waitTerrainUsageWrites();
      // 读组合那一页预载这段的画面模块（注册工厂.tsx 按段懒加载），模块初始化里的求解在这里算。缓存键由页面里的求解决定，先读一次才能知道是否缺失；只有补写时才把这次冷启动归入准备、重新计时，热缓存不多开页面。
      const solveCachePrep = { 新写: solveCache.新写, sec: solveCache.新写 ? (Date.now() - t) / 1000 : 0 };
      if (solveCachePrep.新写) {
        console.error(`求解缓存准备：新写 ${solveCachePrep.新写} 份，${solveCachePrep.sec.toFixed(3)} 秒，不计入测速阶段`);
        t = Date.now();
        compositions = await readCompositions();
        readCompositionsSec = (Date.now() - t) / 1000;
        await waitSolveCacheWrites();
        await waitTerrainUsageWrites();
      }
      const composition = findComposition({ compositions }, s, allSegments);
      const rounds: BenchResult['轮'] = [];
      for (let i = 0; i < (opts.count ?? 1); i++) {
        if (opts.keepOutput) fs.mkdirSync(opts.keepOutput, { recursive: true });
        const out = path.join(opts.keepOutput ?? os.tmpdir(), `mc-anim-测速-${process.pid}-${i}.mp4`);
        const label = `bench:${workName()}/${s.key}:${level}${opts.shading ? `:光影-${opts.shading.name}` : ''}`;
        const queueStartMs=Date.now();
        await passRenderGate(async () => {
          const t0 = Date.now();
          const loadAtStart = load1Min();
          const gateWait=recordPhase(undefined,label,'等闸',queueStartMs,(t0-queueStartMs)/1000);
          let firstFrameMs = 0, lastFrameAt = 0, lastFrameCount = 0;
          let sharedMemory = false;
          const detail = new DetailCollector(label, frameRange[0]);
          const run = () => renderMedia({
              serveUrl, composition, outputLocation: out, inputProps: params.inputProps, envVariables: { ...segRenderEnv(s.key, segTerrainNow(s, trialTerrain()), shellTrialMode()), ...trialEnv(), ...(opts.shading ? { [shadingEnvName]: opts.shading.value } : {}) }, puppeteerInstance: browser, chromiumOptions: { gl: params.gl },
              codec: params.codec, muted: params.muted, crf: params.crf, x264Preset: params.x264Preset,
              encodingMaxRate: params.encodingMaxRate, encodingBufferSize: params.encodingBufferSize, colorSpace: params.colorSpace, pixelFormat: params.pixelFormat,
              imageFormat: params.imageFormat, jpegQuality: params.jpegQuality, scale: params.scale, concurrency: params.concurrency,
              timeoutInMilliseconds: frameTimeoutMs, overwrite: true, logLevel: renderLogLevel, frameRange: frameRange,
              ...(opts.disableSharedMemory ? { disableSharedMemoryCapture: true } : {}),
              // Remotion 在 FFmpeg 探测和浏览器回退之后才确定输入格式；原样返回参数，只记录实际出帧路径，不靠平台或日志级别猜。
              ffmpegOverride: ({ type, args }) => {
                if (type === 'pre-stitcher') sharedMemory = args.some((arg, k) => arg === '-f' && args[k + 1] === 'remotionshm');
                return args;
              },
              onProgress: (p) => {
                if (p.renderedFrames === lastFrameCount) return;
                const now = Date.now();
                if (!firstFrameMs) firstFrameMs = now;
                lastFrameCount = p.renderedFrames;
                detail.frameDone(p.renderedFrames, now);
                if (p.renderedFrames === frameRange[1] - frameRange[0] + 1) lastFrameAt = now;
              },
            });
          try {
            if (opts.noLogCollect) await run();
            else await detail.pack(run, logStream ? (logText) => void logStream.write(logText + '\n') : undefined);
          } finally {
            if (!opts.keepOutput) fs.rmSync(out, { force: true });
          }
          await recordMeasuredFrames(s.key, Array.from({ length: frameRange[1] - frameRange[0] + 1 }, (_, k) => frameRange[0] + k));
          const end = Date.now();
          const loadEnd = load1Min();
          const { file: file, detail: d } = await detail.writeOut([gateWait], { remotion, browser: browserVersionOf(opts.browser), logLevel: renderLogLevel, sharedMemory: String(sharedMemory), roundNo: String(i + 1) });
          rounds.push({
            sharedMemory: sharedMemory,
            totalSec: (end - t0) / 1000,
            首帧秒: (firstFrameMs - t0) / 1000,
            出帧秒: (lastFrameAt - firstFrameMs) / 1000,
            收尾秒: (end - lastFrameAt) / 1000,
            每帧中位毫秒: d.summary.medianMs,
            每帧P90毫秒: d.summary.p90Ms,
            每帧P99毫秒: d.summary.p99Ms,
            slowestFrames: d.summary.slowestFrames,
            最多的等待: d.waiting.slice(0, 6).map((w) => ({ label: w.label, totalMs: w.totalMs, count: w.count })),
            detail: file,
            output: opts.keepOutput ? out : null,
            load: { start: loadAtStart, end: loadEnd, incomparable: loadAtStart !== null && loadAtStart >= coreCount() * benchLoadLimit },
          });
        }, (m) => console.error(`== 资源闸：${m}`),{}, {kind:'bench',lowPriority:true,needsLoad:true,loadLimit:benchLoadLimit,work:workName(),segment:s.key,frameCount:frameRange[1]-frameRange[0]+1,frame:`${frameRange[0]}-${frameRange[1]}`,level: level,purpose:process.env.ANIM_PURPOSE??'实验'});
      }
      return { remotion, browser: browserVersionOf(opts.browser), sharedMemory: rounds.every((r) => r.sharedMemory), logLevel: renderLogLevel, segment: `${workName()}/${s.key}`, frame: frameRange, 打包秒: bundleSec, 开浏览器秒: openBrowserSec, 读组合秒: readCompositionsSec, 求解缓存准备: solveCachePrep, 轮: rounds };
    } finally {
      await waitSolveCacheWrites();
      await waitTerrainUsageWrites();
      await browser.close({ silent: true });
      removeBundles(serveUrl);
    }
  } finally {
    console.log = origLog;
    logStream?.end();
  }
};
