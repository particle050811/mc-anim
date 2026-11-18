// 地形覆盖：段的每一帧照正式出片的参数在浏览器里过一遍，体素世界只挑区段、记下来（不取、不建、不画，engine/voxel/世界.tsx 的覆盖分支），
// 得出这段每个地形包用到哪些区段、各区段头一次用到是整段第几帧。挑区段走的就是渲染那份代码（航线定级、投影余量、拼段的截都在页面里照常算），
// 不另写模拟：段改了镜头、新加了段，都照段框架（清单、段.ts 的 terrain）自动算进来。光体这类旁路读者读的区段照常记（engine/voxel/导入地形.ts 的 sectionData、noteSections）。
// 猜的预取不记（覆盖时根本不猜），所以裁过的包没留猜的那一级，页面也不报错（导入地形.ts）。
// 结果按段存 <数据根>/cache/地形覆盖/<作品>/<段键>.json，键是覆盖指纹（段指纹去掉平台，Mac 和 Windows 量的一样能互认）：指纹不变就不重量。docs/世界.md「裁级」。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { terrainCoverEnv } from '../../engine/段/地形环境.ts';
import type { RenderLevel } from '../../engine/段/设置值.ts';
import { dataPath } from '../环境/配置.ts';
import { workName, workRoot, listWorks, getSpecifiedWork, setSpecifiedWork } from '../环境/作品.ts';
import { loadAllSegments, type SegInfo } from '../清单/清单.ts';
import { stableJson } from '../指纹/指纹.ts';
import { segmentProducts, segPictureParams } from './段产物.ts';
import { expectedComposition } from './渲.ts';
import { realBackend, type RenderBackend } from './后端.ts';
import { segRenderEnv, terrainReadVersions } from './地形注入.ts';
import { frameTimeoutMs } from './设置.ts';
import { beforeClose } from './求解缓存收集.ts';
import { atomicWrite } from './母版.ts';
import { verifySegResourcePacks } from '../资产/资产锁.ts';
import type { RunRecord } from '../运行记录/记录.ts';

/** 正式出片的级别：覆盖要和切片挑的一样 */
const coverLevel: RenderLevel = '视频';

/** 覆盖文件的格式：2 起带 worldPacks、量完核过。旧格式一律当旧了重量（11-17 之前的页面记录全丢了，存的都是空的） */
export const coverFormat = 2;

/** 一段的覆盖：包 → 完整包版本、区段键 → 头一次用到的帧（段内帧号）；worldPacks：画面里有体素世界从它挑区段的包 */
export type SegCover = { format: number; work: string; segment: string; coverKey: string; frameCount: number; pack: Record<string, { version: string; sections: Record<string, number> }>; worldPacks: string[]; measuredAt: string };

/** 一页交回的记录（collectExpr） */
export type CoverPageRecord = { cover: string | null; first: Record<string, Record<string, number>>; worlds: string[] };

/**
 * 量出来的覆盖能不能拿去裁：段声明了这个包、画面里又有体素世界从它挑（页面报的 worldPacks），却一个区段都没记下，就是量错了（11-17 夜：页面记录全没收到，
 * 13 段都是 0 个区段，裁出只剩 L3 以上的包）。只声明不挑的不算：7-起疑声明了 主世界-116 但画面里没有体素世界（书房室内），覆盖就该是空的；
 * 远景包（如 主世界-116-远景）只经远景网格读、不挑区段，也不进 worldPacks。返回违规说明，空 = 能用
 */
export const coverProblems = (cover: Pick<SegCover, 'segment' | 'pack' | 'worldPacks'>, declared: readonly string[]): string[] =>
  cover.worldPacks
    .filter((pack) => declared.includes(pack) && !Object.keys(cover.pack[pack]?.sections ?? {}).length)
    .map((pack) => `${cover.segment}：画面里有体素世界从 ${pack} 挑区段，覆盖却记下 0 个区段，量错了`);

export const coverFile = (work: string, segKey: string) => dataPath('cache', '地形覆盖', work, `${segKey}.json`);
export const readCover = (work: string, segKey: string, directory?: string): SegCover | null => {
  const f = directory ? path.join(directory, `${segKey}.json`) : coverFile(work, segKey);
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as SegCover) : null;
};

/** 覆盖指纹：含选级粗图所在包版本，不含平台。 */
export const coverKeys = async (allSegments: readonly SegInfo[], segments: readonly SegInfo[]) => {
  const products = await segmentProducts(allSegments, segments, coverLevel);
  return products.map((p) => crypto.createHash('sha256').update(stableJson({ ...p.pictureFingerprint.items, platform: undefined })).digest('hex'));
};

/** 声明了这些包的段（所选作品里，按清单顺序） */
export const segsUsingPacks = (allSegments: readonly SegInfo[], packs: readonly string[]) => allSegments.filter((s) => s.segment.terrain.some((p) => packs.includes(p)));

/** 各段现在的覆盖指纹、存着的覆盖，和存着的是不是旧的（没量过、或量完段又改了） */
export const coverStatus = async (allSegments: readonly SegInfo[], segments: readonly SegInfo[], directory?: string) => {
  const covers = segments.map(s => readCover(workName(), s.key, directory));
  const keys = await coverKeys(allSegments, segments);
  return segments.map((s, i) => {
    const cover = covers[i]!;
    return { segment: s, coverKey: keys[i]!, cover, stale: cover?.coverKey !== keys[i] || cover.format !== coverFormat };
  });
};

const collectExpr = `JSON.stringify({ cover: window.process?.env?.[${JSON.stringify(terrainCoverEnv)}] ?? null, first: Object.fromEntries([...(window.terrainCoverFirst ?? new Map())].map(([pack, m]) => [pack, Object.fromEntries(m)])), worlds: [...(window.terrainCoverWorlds ?? [])] })`;

/** Remotion 出完一段在 finally 里关页，通常紧接着就关；等这么久还没收完就当页面没交回记录 */
const pageCollectTimeoutMs = 60_000;

const levelOf = (k: string) => Number(k.slice(0, k.indexOf('|')));
/** 各包用到几个区段、按级分；画面里没有体素世界的说一声（覆盖本来就该空） */
export const describeCover = (cover: Pick<SegCover, 'pack' | 'worldPacks'>) => {
  const parts = Object.entries(cover.pack).map(([p, v]) => {
    const perLevel = new Map<number, number>();
    for (const k of Object.keys(v.sections)) perLevel.set(levelOf(k), (perLevel.get(levelOf(k)) ?? 0) + 1);
    const levels = [...perLevel].sort((a, b) => a[0] - b[0]).map(([l, n]) => `L${l} ${n}`).join(' ');
    return `${p} ${Object.keys(v.sections).length} 个区段${levels ? `（${levels}）` : ''}`;
  });
  return parts.join('、') || (cover.worldPacks.length ? '没记下区段' : '画面里没有体素世界挑区段');
};

/**
 * 量这几段的覆盖：按材质包分组一组一个会话，一页按帧号升序把整段过一遍（imageFormat none：不截图、不编码）。
 * 页面读完整包（本机没有就读裁过的）：覆盖本身不取区段，只要包.json 的粗高度图，两边一样；光体冷缓存时要取区段，读完整包才不被旧留表卡住。
 */
export const measureCovers = async (segments: readonly SegInfo[], runRecord?: RunRecord, log: (s: string) => void = console.log, backend: RenderBackend = realBackend, outputDir?: string): Promise<SegCover[]> => {
  if (!segments.length) return [];
  const allSegments = await loadAllSegments();
  const keys = new Map((await coverKeys(allSegments, segments)).map((k, i) => [segments[i]!.key, k]));
  const out: SegCover[] = [];
  // 不画（engine/voxel/覆盖不画.ts），只吃 CPU 和页面内存：过放行闸（等负载、内存），不拿渲染独占锁挡别人的静帧；整批一张票，不一段等一次放行间隔
  await backend.passGate(() => backend.perResourcePackGroup(workRoot(), segments, (s) => s.key, (group) =>
    backend.openSession(
      coverLevel,
      async (h) => {
        // 页面关掉前收走它记的区段。renderFrames 返回时 Remotion 还没关页（finally 里关、不等），所以按页等收完（beforeClose 的 onOpen），
        // 不能只等 在收：那样整段的记录在写完覆盖文件之后才到，存下的全是空的（11-17 夜的事故）。
        // 收不到（页面崩了、求值出错）就报错，不拿缺页的记录当覆盖；同一段几页的按最早的帧并
        let records: CoverPageRecord[] = [];
        let failures: string[] = [];
        let pagesOfSeg: Promise<void>[] = [];
        const inFlight = new Set<Promise<void>>();
        beforeClose(
          h.browser,
          inFlight,
          async (evaluate) => {
            try {
              records.push(JSON.parse(await evaluate(collectExpr)) as CoverPageRecord);
            } catch (err) {
              failures.push(err instanceof Error ? err.message : String(err));
            }
          },
          (collected) => pagesOfSeg.push(collected),
        );
        for (const s of group) {
          verifySegResourcePacks(workRoot(), s.key);
          const params = segPictureParams(allSegments, [s], coverLevel)[0]!;
          const composition = expectedComposition(s, allSegments, params.inputProps);
          const versions = terrainReadVersions(s.key, s.segment.terrain);
          const t0 = Date.now();
          [records, failures, pagesOfSeg] = [[], [], []];
          await backend.renderFrames({
                serveUrl: h.serveUrl,
                composition,
                outputDir: null,
                frameRange: null,
                inputProps: params.inputProps,
                envVariables: { ...segRenderEnv(s.key, versions, '完整优先'), [terrainCoverEnv]: s.key },
                puppeteerInstance: h.browser,
                chromiumOptions: { gl: h.params.gl },
                imageFormat: 'none',
                scale: h.params.scale,
                concurrency: 1,
                muted: true,
                timeoutInMilliseconds: frameTimeoutMs,
                logLevel: 'error',
                onStart: () => {},
                onFrameUpdate: () => {},
              });
          let timer: NodeJS.Timeout | undefined;
          const allCollected = Promise.all(pagesOfSeg).then(() => true);
          const inTime = await Promise.race([allCollected, new Promise<false>((resolve) => (timer = setTimeout(() => resolve(false), pageCollectTimeoutMs)))]);
          clearTimeout(timer);
          if (!pagesOfSeg.length || !inTime) throw new Error(`地形覆盖 ${s.key}：${pagesOfSeg.length ? `出完 ${pageCollectTimeoutMs / 1000} 秒页面还没关` : '没开页面'}，收不到记录，不存覆盖`);
          if (failures.length) throw new Error(`地形覆盖 ${s.key}：${failures.length} 个页面没交回记录（${failures[0]}），不存覆盖`);
          const mine = records.filter((r) => r.cover === s.key);
          if (mine.length !== records.length || !mine.length) throw new Error(`地形覆盖 ${s.key}：收到的页面记录是别的段的（${records.map((r) => r.cover).join('、') || '一个也没有'}），不存覆盖`);
          const first: Record<string, Record<string, number>> = {};
          for (const r of mine)
            for (const [pack, m] of Object.entries(r.first)) {
              const into = (first[pack] ??= {});
              for (const [k, f] of Object.entries(m)) if (!(into[k]! <= f)) into[k] = f;
            }
          const cover: SegCover = {
            format: coverFormat,
            work: workName(),
            segment: s.key,
            coverKey: keys.get(s.key)!,
            frameCount: composition.durationInFrames,
            pack: Object.fromEntries(Object.entries(first).map(([pack, m]) => [pack, { version: versions[pack] ?? '', sections: Object.fromEntries(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : 1))) }])),
            worldPacks: [...new Set(mine.flatMap((r) => r.worlds))].sort(),
            measuredAt: new Date().toISOString(),
          };
          const problems = coverProblems(cover, s.segment.terrain);
          if (problems.length) throw new Error(`地形覆盖：${problems.join('；')}，不存覆盖、不能拿去裁`);
          const file = outputDir ? path.join(outputDir, `${s.key}.json`) : coverFile(cover.work, s.key);
          atomicWrite(file, `${JSON.stringify(cover)}\n`);
          runRecord?.artifacts.push(file);
          log(`  ${s.key}：${composition.durationInFrames} 帧 ${((Date.now() - t0) / 1000).toFixed(0)} 秒，${describeCover(cover)}`);
          out.push(cover);
        }
      },
      runRecord,
      { skipCompositions: true },
    ),
  ), undefined, {}, { kind: '地形覆盖', work: workName(), segment: segments.map((s) => s.key).join(' '), level: coverLevel, purpose: '地形覆盖', itemCount: segments.length });
  return out;
};

/** 临时切到这部作品跑（anim cache gc 同样的做法），跑完切回去 */
export const inWork = async <T>(work: string, fn: () => Promise<T>): Promise<T> => {
  const prev = getSpecifiedWork();
  setSpecifiedWork(work);
  try {
    return await fn();
  } finally {
    setSpecifiedWork(prev);
  }
};

/** 各作品里声明了这个包的段的覆盖并起来：区段键 → 头一次用到它的（作品/段，帧）。stale 列出没量或旧了的段；measure 给了就当场量那些 */
export const packCover = async (pack: string, o: { measure: boolean; override?: { work: string; directory: string }; runRecord?: RunRecord; log?: (s: string) => void }) => {
  const used = new Map<string, { work: string; segment: string; frame: number }>();
  const stale: string[] = [];
  let segCount = 0;
  for (const work of listWorks().keys()) {
    await inWork(work, async () => {
      const allSegments = await loadAllSegments();
      const segs = segsUsingPacks(allSegments, [pack]);
      if (!segs.length) return;
      segCount += segs.length;
      // 独立的规划目录只替换指定作品；仍须遍历其他共用同一底包的作品。
      const directory = o.override?.work === work ? o.override.directory : undefined;
      const status = await coverStatus(allSegments, segs, directory);
      const toMeasure = status.filter((x) => x.stale).map((x) => x.segment);
      if (toMeasure.length && o.measure) {
        o.log?.(`${work}：量 ${toMeasure.length} 段的地形覆盖（${toMeasure.map((s) => s.key).join('、')}）`);
        await measureCovers(toMeasure, o.runRecord, o.log, realBackend, directory);
      } else stale.push(...toMeasure.map((s) => `${work}/${s.key}`));
      for (const s of segs) {
        const cover = readCover(work, s.key, directory);
        if (cover && (cover.work !== work || cover.segment !== s.key)) throw Error(`规划文件不是 ${work}/${s.key} 的覆盖`);
        // 存着的也再核一遍：量的时候已经核过，这里挡手改、拷来的文件
        const problems = cover ? coverProblems(cover, s.segment.terrain) : [];
        if (problems.length) throw new Error(`地形覆盖：${problems.join('；')}：anim world cover ${s.key} 重量`);
        for (const [k, frame] of Object.entries(cover?.pack[pack]?.sections ?? {})) if (!used.has(k)) used.set(k, { work, segment: s.key, frame });
      }
    });
  }
  return { used, stale, segCount };
};
