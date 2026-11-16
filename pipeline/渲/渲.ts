// 渲染会话和静帧：整个工程只打包一次、开一个浏览器（开会话），段（渲段.ts）、静帧、bench、逐帧校验、认指纹都在会话里出帧。
// 分阶段计时和每帧明细见 运行记录/阶段.ts、渲染明细.ts（anim timing 看）。
// 打包前把作品随仓库发的字节补进数据根（分发/随仓库.ts）、备好按 cue 现取的私有配乐（资产/私有配乐.ts，缺了换静音并记进运行记录）；
// 包里别的段 import、数据根又没有的字节（公开仓库）打进占位，渲到才报错（分发/缺字节.ts）；webpack 缓存名不随资产锁变（缓存名.ts）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { bundle } from '@remotion/bundler';
import { expectedVersion, prepareBrowser } from './浏览器.ts';
import { withShaderCache } from './着色器缓存.ts';
import { openBrowserWithWatchdog } from './页面崩溃.ts';
import { getCompositions, openBrowser, renderFrames, renderStill, type HeadlessBrowser } from './渲染器.ts';
import { codeRoot, relativeToCodeRoot } from '../环境/路径.ts';
import { workName, workRoot } from '../环境/作品.ts';
import { webpackOverride } from '../资产/webpack.ts';
import { shadingEnvName, applyShadingTrial, type ShadingConfig } from './光影试看.ts';
import { telescopeEnvName, applyTelescope, type TelescopeConfig } from './望远.ts';
import { stableCacheName } from './缓存名.ts';
import { passRenderGate } from '../闸/闸.ts';
import { dataPath, dataRoot } from '../环境/配置.ts';
import { keepAwake } from '../环境/子进程.ts';
import { loadAllSegments, type SegInfo } from '../清单/清单.ts';
import { verifySegResourcePacks, withSegResourcePack, readWorkAssetLock } from '../资产/资产锁.ts';
import { fillBytesAndReport } from '../分发/随仓库.ts';
import { fillMissingBytePlaceholders } from '../分发/缺字节.ts';
import { preparePrivateMusic, missingMusicHint } from '../资产/私有配乐.ts';
import { missingRegistryDirs, missingDirHint } from '../段框架/注册目录.ts';
import type { RunRecord } from '../运行记录/记录.ts';
import { frameEncodeTiming, recordPhase, measureStage, stageSummary, type StageRecord } from '../运行记录/阶段.ts';
import { DetailCollector } from '../运行记录/渲染明细.ts';
import { ensurePublicDir } from './public目录.ts';
import { removeBundles, registerBundle } from './打包残留.ts';
import { collectSolveCache, waitSolveCacheWrites } from './求解缓存收集.ts';
import { segRenderEnv, segTerrainNow, trialTerrain, trialEnv } from './地形注入.ts';
import { collectTerrainUsage, recordMeasuredFrames, waitTerrainUsageWrites } from './地形用量.ts';
import { segPictureParams, segOutputWindow } from './段产物.ts';
import { filmProfile, renderParams, frameTimeoutMs, type RenderParamsTable } from './设置.ts';
import type { RenderLevel } from '../../engine/段/设置值.ts';

export const renderLabel = (segKey: string, level: RenderLevel) => `render:${workName()}/${segKey}:${level}`;

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

type RenderSession = { serveUrl: string; browser: HeadlessBrowser; params: RenderParamsTable; compositions: Awaited<ReturnType<typeof getCompositions>> };
type Composition = RenderSession['compositions'][number];
/** skipCompositions：不读 Composition 列表（compositions 是空的），调用方自己用 expectedComposition 算 */
type SessionOpts = BundleOpts & { skipCompositions?: boolean };

/** 打包、开浏览器、读 Composition 列表；fn 结束后关浏览器。渲染和编码降低优先级（nice 10），浏览器子进程跟着继承；会话期间不让电脑闲置睡眠 */
export const openSession = async <T>(level: RenderLevel, fn: (h: RenderSession) => Promise<T>, runRecord?: RunRecord, sessionOpts: SessionOpts = {}): Promise<T> => {
  const releaseAntiSleep = keepAwake();
  try {
    return await inSession(level, fn, runRecord, sessionOpts);
  } finally {
    releaseAntiSleep();
  }
};

const inSession = async <T>(level: RenderLevel, fn: (h: RenderSession) => Promise<T>, runRecord?: RunRecord, { skipCompositions, ...bundleOpts }: SessionOpts = {}): Promise<T> => {
  try {
    os.setPriority(10);
  } catch {
    // 没权限改优先级就照常跑
  }
  const params = renderParams(level);
  const label = `会话:${workName()}:${level}`;
  const records = runRecord?.stage;
  const startIndex = records?.length ?? 0;
  const serveUrl = await measureStage(records, label, '打包', () => bundleProject(runRecord, label, bundleOpts));
  let browser: HeadlessBrowser | undefined;
  try {
    const opened = await measureStage(records, label, '开浏览器', async () => {
      const exePath = await prepareBrowser();
      const shaderStore = dataPath('cache', '着色器', `${expectedVersion()}-${params.gl}`);
      const launch = () => openBrowser('chrome', { chromiumOptions: { gl: params.gl }, forceDeviceScaleFactor: params.scale, logLevel: 'error', browserExecutable: exePath });
      return openBrowserWithWatchdog(() => withShaderCache(shaderStore, launch), exePath, (b) => b.close({ silent: true }));
    });
    browser = opened.browser;
    const watchdog = opened.watchdog;
    // 读 Composition 列表的页面先把模块初始化里没命中缓存的求解算一遍，关页面时收走写盘，后面各段的页面直接读；
    // 不读列表时由出帧的页面自己算、关页面时收走
    collectSolveCache(browser);
    collectTerrainUsage(browser);
    const b = browser;
    const compositions = skipCompositions
      ? []
      : await measureStage(records, label, '读组合', () =>
          watchdog.pack(() =>
            getCompositions(serveUrl, {
              inputProps: params.inputProps,
              puppeteerInstance: b,
              chromiumOptions: { gl: params.gl },
              timeoutInMilliseconds: frameTimeoutMs,
              logLevel: 'error',
            }),
          ),
        );
    if (records) console.log(`会话就绪：${stageSummary(records.slice(startIndex))}`);
    return await watchdog.pack(() => fn({ serveUrl, browser: b, params: params, compositions }));
  } finally {
    try {
      await waitTerrainUsageWrites();
      await browser?.close({ silent: true });
    } finally {
      removeBundles(serveUrl);
    }
  }
};

/** 渲一次的共用部分：Remotion 开 verbose（日志级别不进指纹），日志和进度进明细，出帧、编码分开计时 */
export const measureRender = async (label: string, records: StageRecord[], t0: number, fn: (hooks: { logLevel: 'verbose'; onProgress: (p: { renderedFrames: number; renderedDoneIn: number | null }) => void }) => Promise<unknown>) => {
  const timer = frameEncodeTiming();
  const detail = new DetailCollector(label);
  await detail.pack(() =>
    fn({
      logLevel: 'verbose',
      onProgress: (p) => {
        timer.onProgress(p);
        detail.frameDone(p.renderedFrames);
      },
    }),
  );
  recordFrameEncode(records, label, t0, timer);
  return detail;
};

const recordFrameEncode = (records: StageRecord[], label: string, t0: number, timer: ReturnType<typeof frameEncodeTiming>) => {
  const { 出帧秒: frameOutSec, encodeSec } = timer.split(Date.now() - t0);
  recordPhase(records, label, '出帧', t0, frameOutSec);
  recordPhase(records, label, '编码', t0 + frameOutSec * 1000, encodeSec);
};

/**
 * 这段的 Composition 不开页面算出来的样子：注册工厂.tsx 登记时只给 id、帧数、帧率、宽高，Remotion 从页面读回来的另外几项都是空的。
 * 帧数和切片的输出窗同一个算法（段产物.ts 的 segOutputWindow）。props 是读列表时给的 inputProps（段的组件不收 props，画面不看它）。
 * anim still 用它，省掉为读列表另开一页把整个包求值一遍；出片、校验照旧从页面读，findComposition 核对两边一样。
 */
export const expectedComposition = (s: SegInfo, allSegments: readonly SegInfo[], props: Composition['props'], id = s.key): Composition => ({
  id,
  width: s.segment.width,
  height: s.segment.height,
  fps: filmProfile().fps,
  durationInFrames: segOutputWindow(allSegments, s).frameCount,
  props,
  defaultProps: {},
  defaultCodec: null,
  defaultOutName: null,
  defaultVideoImageFormat: null,
  defaultPixelFormat: null,
  defaultProResProfile: null,
  defaultSampleRate: null,
});

/**
 * 打包里这段的 Composition，核对和切片的输出窗一样：打包按成片档的输出帧率注册（engine/段/注册工厂.tsx），帧数 = 段长 × 帧率，
 * 这里用同一个算法算应有的帧数，差一帧也不认。allSegments = 整部作品的段（段要在清单里）。
 * 别的项也要和 expectedComposition 一样：静帧不读列表，注册工厂哪天多登记了东西（defaultProps 之类），这里先报出来
 */
export const findComposition = (h: Pick<RenderSession, 'compositions'>, s: SegInfo, allSegments: readonly SegInfo[], id = s.key) => {
  verifySegResourcePacks(workRoot(), s.key);
  const c = h.compositions.find((x) => x.id === id);
  if (!c) throw new Error(`打包里没有 Composition ${id}（作品的 注册.tsx 按清单和 段.ts 的叠层登记，清单里有它吗？）`);
  const expected = expectedComposition(s, allSegments, c.props, id);
  if (c.fps !== expected.fps || c.durationInFrames !== expected.durationInFrames || c.width !== expected.width || c.height !== expected.height) {
    throw new Error(`${id} 的 Composition（${c.durationInFrames} 帧 ${c.fps}fps ${c.width}×${c.height}）和 段.ts、全片位置对不上（应是 ${expected.durationInFrames} 帧 ${expected.fps}fps ${expected.width}×${expected.height}）`);
  }
  if (!isDeepStrictEqual(c, expected)) throw new Error(`${id} 的 Composition 和 anim still 不开页面算的不一样（渲.ts 的 expectedComposition 要跟上）：页面读到 ${JSON.stringify(c)}，算的 ${JSON.stringify(expected)}`);
  return c;
};

/** 段目录下的 本机地形.txt 写着这段要的、没登记发布的区段包（核对-世界编辑）。换台机器没有这个包就跳过：不让一条批量渲染死在核对段上（用户 10-31 定）。放段外的文件不进指纹 */
export const missingLocalTerrain = (s: Pick<SegInfo, '目录'>, terrainDir = path.join(dataRoot(), 'terrain')): string | null => {
  const f = path.join(s.目录, '本机地形.txt');
  if (!fs.existsSync(f)) return null;
  const pack = fs.readFileSync(f, 'utf8').trim();
  return fs.existsSync(path.join(terrainDir, pack)) ? null : pack;
};

/**
 * 同一页面、并发 1 按帧号升序出 PNG（Remotion 自己排序，帧号不能重复）；不写母版、不编码。
 * 打开声音：renderStill 是关的、renderMedia 是开的。静帧照 renderStill（声音文件也不用下），逐帧校验照 renderMedia
 */
export const renderFramesSamePage = (
  h: Pick<RenderSession, 'serveUrl' | 'browser' | 'params'>,
  composition: RenderSession['compositions'][number],
  frames: readonly number[],
  o: { withAudio: boolean; env: Record<string, string>; onFrame: (png: Buffer, frame: number) => void | Promise<void> },
) =>
  renderFrames({
    serveUrl: h.serveUrl,
    composition,
    outputDir: null,
    frames: [...frames],
    inputProps: h.params.inputProps,
    envVariables: o.env,
    puppeteerInstance: h.browser,
    chromiumOptions: { gl: h.params.gl },
    imageFormat: 'png',
    scale: h.params.scale,
    concurrency: 1,
    muted: !o.withAudio,
    timeoutInMilliseconds: frameTimeoutMs,
    logLevel: 'verbose',
    onStart: () => {},
    onFrameUpdate: () => {},
    onFrameBuffer: o.onFrame,
  });

export const stillFile = (outDir: string, segKey: string, frame: number, suffix = '') => path.join(outDir, `${segKey}-第${String(frame).padStart(4, '0')}帧${suffix}.png`);

/**
 * 多帧默认同页连出（第一帧之后不用从头读地形）；逐帧 = 每帧一个新页面，等于旧做法。两边文件名一样，已有的文件都不覆盖。
 * 用户 10-31 定做连出。同一帧单出和连出已知的例外见 连出提醒（docs/渲染性能.md「同一帧的像素取决于之前渲过哪些帧」）。
 */
export const renderStills = async (h: Pick<RenderSession, 'serveUrl' | 'browser' | 'params'>, composition: RenderSession['compositions'][number], segKey: string, frames: readonly number[], outDir: string, o: { frameByFrame?: boolean; env: Record<string, string>; completed: (emitted: number) => void; suffix?: string }) => {
  if (frames.length > 1 && !o.frameByFrame) {
    let emitted = 0;
    await renderFramesSamePage(h, composition, frames, {
      withAudio: false,
      env: o.env,
      onFrame: (png, f) => {
        fs.writeFileSync(stillFile(outDir, segKey, f, o.suffix), png, { flag: 'wx' });
        o.completed(++emitted);
      },
    });
    return;
  }
  for (const [i, f] of frames.entries()) {
    await renderStill({
      serveUrl: h.serveUrl,
      composition,
      output: stillFile(outDir, segKey, f, o.suffix),
      frame: f,
      inputProps: h.params.inputProps,
      envVariables: o.env,
      puppeteerInstance: h.browser,
      chromiumOptions: { gl: h.params.gl },
      imageFormat: 'png',
      scale: h.params.scale,
      timeoutInMilliseconds: frameTimeoutMs,
      overwrite: false,
      logLevel: 'verbose',
    });
    o.completed(i + 1);
  }
};

/** 连出才有的提醒 */
export const batchHint = (segKey: string, frames: readonly number[], frameByFrame?: boolean) =>
  frames.length > 1 && !frameByFrame
    ? `${segKey} 这 ${frames.length} 帧在同一页面连出，和单帧的差别已修到极少（已知例外：核对-门口哈气，没进成片）。要和单帧或母版逐像素比，加 --per-frame；连出崩页（Page crashed）也改用 --per-frame`
    : null;

/** 静帧（PNG），给预览核对用。帧号重复的只出一次；返回的文件按给的帧号顺序 */
/** 光影：每份配置各出一遍这几帧，文件名带「-光影-<名>」（光影试看.ts）；望远：每块矩形各出一遍，文件名带「-望远-<名>」（望远.ts）。两样不同时给 */
export const renderStillFrames = async (s: SegInfo, frames: number[], level: RenderLevel, outDir: string, runRecord?: RunRecord, o: { frameByFrame?: boolean; shading?: ShadingConfig[]; telescope?: TelescopeConfig[] } = {}) => {
  const toEmit = [...new Set(frames)];
  const hint = batchHint(s.key, toEmit, o.frameByFrame);
  if (hint) runRecord?.log('警告', hint);
  if (o.shading && o.telescope) throw new Error('--shading 和 --tele 不能同时给');
  // 各出一遍的变体：页面环境变量和文件名后缀
  const variants: { env: Record<string, string>; suffix: string }[] | undefined =
    o.shading?.map((c) => ({ env: { [shadingEnvName]: c.value }, suffix: `-光影-${c.name}` })) ?? o.telescope?.map((c) => ({ env: { [telescopeEnvName]: c.value }, suffix: `-望远-${c.name}` }));
  await withSegResourcePack(workRoot(), s.key, () => openSession(level, async (h) => {
    const allSegments = await loadAllSegments();
    verifySegResourcePacks(workRoot(), s.key);
    const composition = expectedComposition(s, allSegments, h.params.inputProps);
    for (const f of toEmit) {
      if (!(f >= 0 && f < composition.durationInFrames)) throw new Error(`${s.key} 只有 ${composition.durationInFrames} 帧，没有第 ${f} 帧`);
    }
    // 段里画的字幕（母版 = 成片切片，用户 11-05 定）静帧也画上，和成片这一帧一样
    const subtitled = { ...h, params: segPictureParams(allSegments, [s], level)[0]! };
    const label = `still:${workName()}/${s.key}:${level}`;
    const queueStartMs = Date.now();
    await passRenderGate(async () => {
      const t0 = Date.now();
      const records = runRecord?.stage;
      const gateWait = recordPhase(records, label, '等闸', queueStartMs, (t0 - queueStartMs) / 1000);
      const detail = new DetailCollector(label);
      const env = { ...segRenderEnv(s.key, segTerrainNow(s, trialTerrain())), ...trialEnv() };
      if (!variants) await detail.pack(() => renderStills(subtitled, composition, s.key, toEmit, outDir, { frameByFrame: o.frameByFrame, env: env, completed: (emitted) => detail.frameDone(emitted) }));
      else {
        await detail.pack(async () => {
          for (const [i, c] of variants.entries())
            await renderStills(subtitled, composition, s.key, toEmit, outDir, { frameByFrame: o.frameByFrame, env: { ...env, ...c.env }, suffix: c.suffix, completed: (emitted) => detail.frameDone(i * toEmit.length + emitted) });
        });
      }
      await recordMeasuredFrames(s.key, toEmit);
      const outputTime = recordPhase(records, label, '出帧', t0, (Date.now() - t0) / 1000);
      await detail.writeOut(records ?? []);
      console.log(`${stageSummary([gateWait, outputTime])}（${toEmit.length} 帧）`);
    }, undefined, {}, {kind:'still',work:workName(),segment:s.key,level: level,frameCount:toEmit.length,frame:toEmit.join(',').slice(0,60),purpose:process.env.ANIM_PURPOSE??'核对'});
    // 没有读列表那一页替它先算，缺的求解是出帧的页面自己算的，关页面时才收走写盘；连出（renderFrames）关页面不等，这里等写完再关浏览器
    await waitSolveCacheWrites();
  }, runRecord, { shading: !!o.shading, telescope: !!o.telescope, skipCompositions: true }));
  return variants ? variants.flatMap((c) => toEmit.map((f) => stillFile(outDir, s.key, f, c.suffix))) : toEmit.map((f) => stillFile(outDir, s.key, f));
};
