// 渲染会话：整个工程只打包一次、开一个浏览器（开会话），段（渲段.ts）、静帧、bench、逐帧校验、认指纹都在会话里出帧。从 渲.ts 拆出来，好让 后端.ts 引它不成环。
// 打包前把作品随仓库发的字节补进数据根（分发/随仓库.ts）、备好按 cue 现取的私有配乐（资产/私有配乐.ts，缺了换静音并记进运行记录）；
// 包里别的段 import、数据根又没有的字节（公开仓库）打进占位，渲到才报错（分发/缺字节.ts）；webpack 缓存名不随资产锁变（缓存名.ts）。
// 编排代码不直接调这里，经 后端.ts 的 RenderBackend（测试换假的）。
import os from 'node:os';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { expectedVersion, prepareBrowser } from './浏览器.ts';
import { withShaderCache } from './着色器缓存.ts';
import { openBrowserWithWatchdog } from './页面崩溃.ts';
import { getCompositions, openBrowser, type HeadlessBrowser, type LogLevel } from './渲染器.ts';
import { codeRoot, relativeToCodeRoot } from '../环境/路径.ts';
import { workName, workRoot } from '../环境/作品.ts';
import { webpackOverride } from '../资产/webpack.ts';
import { applyShadingTrial } from './光影试看.ts';
import { applyTelescope } from './望远.ts';
import { stableCacheName } from './缓存名.ts';
import { dataPath, dataRoot } from '../环境/配置.ts';
import { keepAwake } from '../环境/子进程.ts';
import { loadAllSegments } from '../清单/清单.ts';
import { readWorkAssetLock } from '../资产/资产锁.ts';
import { fillBytesAndReport } from '../分发/随仓库.ts';
import { fillMissingBytePlaceholders } from '../分发/缺字节.ts';
import { preparePrivateMusic, missingMusicHint } from '../资产/私有配乐.ts';
import { missingRegistryDirs, missingDirHint } from '../段框架/注册目录.ts';
import type { RunRecord } from '../运行记录/记录.ts';
import { recordPhase, measureStage, stageSummary } from '../运行记录/阶段.ts';
import { ensurePublicDir } from './public目录.ts';
import { removeBundles, registerBundle } from './打包残留.ts';
import { collectSolveCache } from './求解缓存收集.ts';
import { collectTerrainUsage, waitTerrainUsageWrites } from './地形用量.ts';
import { renderParams, frameTimeoutMs, type RenderParamsTable } from './设置.ts';
import type { RenderLevel } from '../../engine/段/设置值.ts';
import { preloadEnv } from '../../engine/段/预载.ts';

/** 光影：换上光影试看画布（光影试看.ts，只给 still、bench）；望远：入口加上望远（望远.ts，只给 still） */
export type BundleOpts = { shading?: boolean; telescope?: boolean };
export const bundleProject = async (runRecord?: RunRecord, label = `会话:${workName()}`, o: BundleOpts = {}) => {
  const workDir = workRoot();
  const missingDirs = missingRegistryDirs(workDir);
  if (missingDirs.length) throw new Error(missingDirs.map((d) => missingDirHint(relativeToCodeRoot(workDir), d)).join('\n'));
  const prepStartMs = Date.now();
  fillBytesAndReport(workDir, dataRoot());
  for (const x of preparePrivateMusic(await loadAllSegments(), readWorkAssetLock(workDir), dataRoot())) {
    if (runRecord) runRecord.log('警告', missingMusicHint(x));
    else console.error(`!! ${missingMusicHint(x)}`);
  }
  recordPhase(runRecord?.stage, label, '备素材', prepStartMs, (Date.now() - prepStartMs) / 1000);
  const t0 = Date.now();
  const entryFile = path.join(workRoot(), 'index.ts');
  const rewrittenRoot = o.shading ? applyShadingTrial(webpackOverride(workDir)) : webpackOverride(workDir);
  const bundleFor = stableCacheName(fillMissingBytePlaceholders(o.telescope ? applyTelescope(rewrittenRoot, entryFile) : rewrittenRoot, workDir));
  const serveUrl = await bundle({
    entryPoint: entryFile,
    rootDir: codeRoot(),
    webpackOverride: async (config) => {
      const baseConfig = await bundleFor(config);
      const mediaRule = { test: /[\\/]@remotion[\\/]media[\\/]dist[\\/]esm[\\/]index\.mjs$/, loader: path.join(codeRoot(), 'pipeline', '渲', '音频缓存日志.cjs') };
      return { ...baseConfig, module: { ...baseConfig.module, rules: [...(baseConfig.module?.rules ?? []), mediaRule] } };
    },
    enableCaching: true,
    publicDir: ensurePublicDir(),
    // public 里只有指向数据根的链接，转发进包是预期的
    onSymlinkDetected: () => {},
  });
  registerBundle(serveUrl);
  recordPhase(runRecord?.stage, label, 'webpack', t0, (Date.now() - t0) / 1000);
  console.log(`打包 ${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
  return serveUrl;
};

export type LaunchOpts = { gl?: RenderParamsTable['gl']; scale?: number; logLevel?: LogLevel; executable?: string };
/** 只开 Remotion 的无头浏览器、不打包（批用预先打好的包，接触表截本地 HTML）。executable 不给就用数据根那份（浏览器.ts）；gl、scale 不给就不传 */
export const launchBrowser = async (o: LaunchOpts = {}): Promise<HeadlessBrowser> =>
  openBrowser('chrome', {
    ...(o.gl !== undefined ? { chromiumOptions: { gl: o.gl } } : {}),
    ...(o.scale !== undefined ? { forceDeviceScaleFactor: o.scale } : {}),
    logLevel: o.logLevel ?? 'error',
    browserExecutable: o.executable ?? (await prepareBrowser()),
  });

type Compositions = Awaited<ReturnType<typeof getCompositions>>;
export type RenderSession = {
  serveUrl: string;
  browser: HeadlessBrowser;
  params: RenderParamsTable;
  compositions: Compositions;
  /** 打包、开浏览器、读组合各几秒（bench 报；不读列表时读组合是 0） */
  seconds: { bundle: number; browser: number; compositions: number };
  /** 这个浏览器的页面新写了几份求解缓存（页面关掉后才累加，先等 waitSolveCacheWrites） */
  solveCache: { 新写: number };
  /** 照开会话时的参数再读一遍 Composition 列表（bench 冷缓存时重读计时） */
  readCompositions: () => Promise<Compositions>;
};
export type Composition = Compositions[number];
/**
 * skipCompositions：不读 Composition 列表（compositions 是空的），调用方自己用 expectedComposition 算。
 * preload：读列表那一页顺带求值这几段的画面模块（注册工厂.tsx 按段懒加载，不点名的一段也不求值），缺的求解在闸外算好。
 * logLevel、browserExecutable、shaderCache 只给 bench：开浏览器、读列表的日志级别（默认 error），换浏览器（--browser），不接着色器缓存（bench 一直没接，测出来的数和以前比得上）
 */
export type SessionOpts = BundleOpts & { skipCompositions?: boolean; preload?: readonly string[]; logLevel?: LogLevel; browserExecutable?: string; shaderCache?: boolean };

/** 打包、开浏览器、读 Composition 列表；fn 结束后关浏览器。渲染和编码降低优先级（nice 10），浏览器子进程跟着继承；会话期间不让电脑闲置睡眠 */
export const openSession = async <T>(level: RenderLevel, fn: (h: RenderSession) => Promise<T>, runRecord?: RunRecord, sessionOpts: SessionOpts = {}): Promise<T> => {
  const releaseAntiSleep = keepAwake();
  try {
    return await inSession(level, fn, runRecord, sessionOpts);
  } finally {
    releaseAntiSleep();
  }
};

const inSession = async <T>(level: RenderLevel, fn: (h: RenderSession) => Promise<T>, runRecord?: RunRecord, { skipCompositions, preload, logLevel = 'error', browserExecutable, shaderCache = true, ...bundleOpts }: SessionOpts = {}): Promise<T> => {
  try {
    os.setPriority(10);
  } catch {
    // 没权限改优先级就照常跑
  }
  const params = renderParams(level);
  const label = `会话:${workName()}:${level}`;
  const records = runRecord?.stage;
  const startIndex = records?.length ?? 0;
  const seconds = { bundle: 0, browser: 0, compositions: 0 };
  const timed = async <R>(key: keyof typeof seconds, stage: Parameters<typeof measureStage>[2], f: () => Promise<R>): Promise<R> => {
    const t0 = Date.now();
    try {
      return await measureStage(records, label, stage, f);
    } finally {
      seconds[key] = (Date.now() - t0) / 1000;
    }
  };
  const serveUrl = await timed('bundle', '打包', () => bundleProject(runRecord, label, bundleOpts));
  let browser: HeadlessBrowser | undefined;
  try {
    const opened = await timed('browser', '开浏览器', async () => {
      const exePath = browserExecutable ?? (await prepareBrowser());
      const launch = () => launchBrowser({ gl: params.gl, scale: params.scale, logLevel, executable: exePath });
      const shaderStore = dataPath('cache', '着色器', `${expectedVersion()}-${params.gl}`);
      return openBrowserWithWatchdog(() => (shaderCache ? withShaderCache(shaderStore, launch) : launch()), exePath, (b) => b.close({ silent: true }));
    });
    browser = opened.browser;
    const watchdog = opened.watchdog;
    // 读 Composition 列表的页面先把点名预载的段里、模块初始化时没命中缓存的求解算一遍，关页面时收走写盘，后面各段的页面直接读；
    // 不读列表、没点名的段由出帧的页面自己算、关页面时收走
    const solveCache = collectSolveCache(browser);
    collectTerrainUsage(browser);
    const b = browser;
    const readCompositions = () =>
      watchdog.pack(() =>
        getCompositions(serveUrl, {
          inputProps: params.inputProps,
          envVariables: preloadEnv(preload),
          puppeteerInstance: b,
          chromiumOptions: { gl: params.gl },
          timeoutInMilliseconds: frameTimeoutMs,
          logLevel,
        }),
      );
    const compositions = skipCompositions ? [] : await timed('compositions', '读组合', readCompositions);
    if (records) console.log(`会话就绪：${stageSummary(records.slice(startIndex))}`);
    return await watchdog.pack(() => fn({ serveUrl, browser: b, params, compositions, seconds, solveCache, readCompositions }));
  } finally {
    try {
      await waitTerrainUsageWrites();
      await browser?.close({ silent: true });
    } finally {
      removeBundles(serveUrl);
    }
  }
};
