// 渲染的共用件：标签、出片计时、找 Composition、静帧（PNG）。会话（打包、开浏览器、读组合）在 会话.ts，碰 Remotion 和闸都经 后端.ts 的 RenderBackend。
// 分阶段计时和每帧明细见 运行记录/阶段.ts、渲染明细.ts（anim timing 看）。
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { workName, workRoot } from '../环境/作品.ts';
import { shadingEnvName, type ShadingConfig } from './光影试看.ts';
import { telescopeEnvName, type TelescopeConfig } from './望远.ts';
import { dataRoot } from '../环境/配置.ts';
import { loadAllSegments, type SegInfo } from '../清单/清单.ts';
import { verifySegResourcePacks } from '../资产/资产锁.ts';
import type { RunRecord } from '../运行记录/记录.ts';
import { frameEncodeTiming, recordPhase, stageSummary, type StageRecord } from '../运行记录/阶段.ts';
import { DetailCollector } from '../运行记录/渲染明细.ts';
import { waitSolveCacheWrites } from './求解缓存收集.ts';
import { segRenderEnv, segTerrainNow, trialTerrain, trialEnv, trialReadsFullTerrain, shellTrialTable } from './地形注入.ts';
import { trialSuffix, type TrialGroup } from './试看组.ts';
import { recordMeasuredFrames } from './地形用量.ts';
import { segPictureParams, segOutputWindow } from './段产物.ts';
import { filmProfile, frameTimeoutMs } from './设置.ts';
import type { RenderLevel } from '../../engine/段/设置值.ts';
import type { Composition, RenderSession } from './会话.ts';
import { realBackend, type RenderBackend } from './后端.ts';

export const renderLabel = (segKey: string, level: RenderLevel) => `render:${workName()}/${segKey}:${level}`;

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
  composition: Composition,
  frames: readonly number[],
  o: { withAudio: boolean; env: Record<string, string>; onFrame: (png: Buffer, frame: number) => void | Promise<void> },
  backend: RenderBackend = realBackend,
) =>
  backend.renderFrames({
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
export const renderStills = async (h: Pick<RenderSession, 'serveUrl' | 'browser' | 'params'>, composition: Composition, segKey: string, frames: readonly number[], outDir: string, o: { frameByFrame?: boolean; env: Record<string, string>; completed: (emitted: number) => void; suffix?: string }, backend: RenderBackend = realBackend) => {
  if (frames.length > 1 && !o.frameByFrame) {
    let emitted = 0;
    await renderFramesSamePage(h, composition, frames, {
      withAudio: false,
      env: o.env,
      onFrame: (png, f) => {
        fs.writeFileSync(stillFile(outDir, segKey, f, o.suffix), png, { flag: 'wx' });
        o.completed(++emitted);
      },
    }, backend);
    return;
  }
  for (const [i, f] of frames.entries()) {
    await backend.renderStill({
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

/** 一组变体出完：后缀、这组的试看参数（--trial）、这几帧的文件、用了几秒（开页到出完） */
export type StillVariantDone = { suffix: string; trial?: TrialGroup; channelSuffix: string; files: string[]; seconds: number };

/** 静帧（PNG），给预览核对用。帧号重复的只出一次；返回的文件按给的帧号顺序 */
/** 光影：每份配置各出一遍这几帧，文件名带「-光影-<名>」（光影试看.ts）；望远：每块矩形各出一遍，文件名带「-望远-<名>」（望远.ts）。两样不同时给 */
/** 试看：每组各出一遍（试看组.ts），文件名带「-试看<序号>-<短名>」，和光影、望远叉乘；同一会话，一组一页 */
export const renderStillFrames = async (s: SegInfo, frames: number[], level: RenderLevel, outDir: string, runRecord?: RunRecord, o: { frameByFrame?: boolean; shading?: ShadingConfig[]; telescope?: TelescopeConfig[]; trial?: TrialGroup[]; onVariantDone?: (v: StillVariantDone) => void; backend?: RenderBackend } = {}) => {
  const backend = o.backend ?? realBackend;
  const toEmit = [...new Set(frames)];
  const hint = batchHint(s.key, toEmit, o.frameByFrame);
  if (hint) runRecord?.log('警告', hint);
  if (o.shading && o.telescope) throw new Error('--shading 和 --tele 不能同时给');
  // 各出一遍的变体：页面环境变量和文件名后缀
  // 望远的细一级、真值会挑到正式画面不用的级：那一份读完整地形包（地形注入.ts）
  const channelVariants: { env: Record<string, string>; suffix: string; fullTerrain?: boolean }[] | undefined =
    o.shading?.map((c) => ({ env: { [shadingEnvName]: c.value }, suffix: `-光影-${c.name}` })) ?? o.telescope?.map((c) => ({ env: { [telescopeEnvName]: c.value }, suffix: `-望远-${c.name}`, fullTerrain: c.fineLevel || c.真值 }));
  const trialGroups: (TrialGroup | undefined)[] = o.trial ?? [undefined];
  const variants = trialGroups.flatMap((g) =>
    (channelVariants ?? [{ env: {}, suffix: '' }]).map((c) => ({ trial: g, channelEnv: c.env, channelSuffix: c.suffix, suffix: (g ? trialSuffix(g) : '') + c.suffix, fullTerrain: 'fullTerrain' in c && !!c.fullTerrain })),
  );
  await backend.withSegResourcePack(workRoot(), s.key, () => backend.openSession(level, async (h) => {
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
    await backend.passRenderGate(async () => {
      const t0 = Date.now();
      const records = runRecord?.stage;
      const gateWait = recordPhase(records, label, '等闸', queueStartMs, (t0 - queueStartMs) / 1000);
      const detail = new DetailCollector(label);
      // 没给 --trial 时照 shell 里的试看参数；给了每组自己带整张表（已并上 shell 那份）和要多读的包
      // 读哪一版地形包：试看里会挑到别的区段的项、望远的细一级和真值读完整包，别的照正式出片读裁过的（地形注入.ts）
      const envOf = (g: TrialGroup | undefined, fullTerrain: boolean) => {
        const mode = fullTerrain || trialReadsFullTerrain(g ? g.table : shellTrialTable()) ? '完整' : '正式';
        return { ...segRenderEnv(s.key, segTerrainNow(s, g ? g.terrain : trialTerrain()), mode), ...(g ? g.env : trialEnv()) };
      };
      await detail.pack(async () => {
        for (const [i, v] of variants.entries()) {
          // 上一组的页面新算的光体缓存先写完，这一组开页时列得到（地形注入.ts 的 segRenderEnv）
          if (i) await waitSolveCacheWrites();
          const variantStartMs = Date.now();
          await renderStills(subtitled, composition, s.key, toEmit, outDir, { frameByFrame: o.frameByFrame, env: { ...envOf(v.trial, v.fullTerrain), ...v.channelEnv }, suffix: v.suffix, completed: (emitted) => detail.frameDone(i * toEmit.length + emitted) }, backend);
          o.onVariantDone?.({ suffix: v.suffix, trial: v.trial, channelSuffix: v.channelSuffix, files: toEmit.map((f) => stillFile(outDir, s.key, f, v.suffix)), seconds: (Date.now() - variantStartMs) / 1000 });
        }
      });
      await recordMeasuredFrames(s.key, toEmit);
      const outputTime = recordPhase(records, label, '出帧', t0, (Date.now() - t0) / 1000);
      await detail.writeOut(records ?? []);
      console.log(`${stageSummary([gateWait, outputTime])}（${toEmit.length} 帧${variants.length > 1 ? ` × ${variants.length} 组` : ''}）`);
    }, undefined, {}, {kind:'still',work:workName(),segment:s.key,level: level,frameCount:toEmit.length * variants.length,frame:toEmit.join(',').slice(0,60),purpose:process.env.ANIM_PURPOSE??'核对'});
    // 没有读列表那一页替它先算，缺的求解是出帧的页面自己算的，关页面时才收走写盘；连出（renderFrames）关页面不等，这里等写完再关浏览器
    await waitSolveCacheWrites();
  }, runRecord, { shading: !!o.shading, telescope: !!o.telescope, skipCompositions: true }));
  return variants.flatMap((v) => toEmit.map((f) => stillFile(outDir, s.key, f, v.suffix)));
};
