// 地形覆盖：段的每一帧照正式出片的参数在浏览器里过一遍，体素世界只挑区段、记下来（不取、不建、不画，engine/voxel/世界.tsx 的覆盖分支），
// 得出这段每个地形包用到哪些区段、各区段头一次用到是整段第几帧。挑区段走的就是渲染那份代码（航线定级、投影余量、拼段的截都在页面里照常算），
// 不另写模拟：段改了镜头、新加了段，都照段框架（清单、段.ts 的 terrain）自动算进来。光体这类旁路读者读的区段照常记（engine/voxel/导入地形.ts 的 sectionData、noteSections）。
// 猜的预取不记（覆盖时根本不猜），所以裁过的包没留猜的那一级，页面也不报错（导入地形.ts）。
// 结果按段存 <数据根>/cache/地形覆盖/<作品>/<段键>.json，键是覆盖指纹（段指纹去掉平台，Mac 和 Windows 量的一样能互认）：指纹不变就不重量。docs/世界.md「裁级」。
import crypto from 'node:crypto';
import fs from 'node:fs';
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

/** 一段的覆盖：包 → 完整包版本、区段键 → 头一次用到的帧（段内帧号） */
export type SegCover = { work: string; segment: string; coverKey: string; frameCount: number; pack: Record<string, { version: string; sections: Record<string, number> }>; measuredAt: string };

export const coverFile = (work: string, segKey: string) => dataPath('cache', '地形覆盖', work, `${segKey}.json`);
export const readCover = (work: string, segKey: string): SegCover | null => {
  const f = coverFile(work, segKey);
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as SegCover) : null;
};

/** 覆盖指纹：段画面指纹的各项去掉平台（挑区段不看平台）。地形项是完整包的版本，重裁不让它变 */
export const coverKeys = async (allSegments: readonly SegInfo[], segments: readonly SegInfo[]): Promise<string[]> => {
  const products = await segmentProducts(allSegments, segments, coverLevel);
  return products.map((p) => crypto.createHash('sha256').update(stableJson({ ...p.pictureFingerprint.items, platform: undefined })).digest('hex'));
};

/** 声明了这些包的段（所选作品里，按清单顺序） */
export const segsUsingPacks = (allSegments: readonly SegInfo[], packs: readonly string[]) => allSegments.filter((s) => s.segment.terrain.some((p) => packs.includes(p)));

/** 各段现在的覆盖指纹、存着的覆盖，和存着的是不是旧的（没量过、或量完段又改了） */
export const coverStatus = async (allSegments: readonly SegInfo[], segments: readonly SegInfo[]) => {
  const keys = await coverKeys(allSegments, segments);
  return segments.map((s, i) => {
    const cover = readCover(workName(), s.key);
    return { segment: s, coverKey: keys[i]!, cover, stale: cover?.coverKey !== keys[i] };
  });
};

const collectExpr = `JSON.stringify({ cover: window.process?.env?.[${JSON.stringify(terrainCoverEnv)}] ?? null, first: Object.fromEntries([...(window.terrainCoverFirst ?? new Map())].map(([pack, m]) => [pack, Object.fromEntries(m)])) })`;

/**
 * 量这几段的覆盖：按材质包分组一组一个会话，一页按帧号升序把整段过一遍（imageFormat none：不截图、不编码）。
 * 页面读完整包（本机没有就读裁过的）：覆盖本身不取区段，只要包.json 的粗高度图，两边一样；光体冷缓存时要取区段，读完整包才不被旧留表卡住。
 */
export const measureCovers = async (segments: readonly SegInfo[], runRecord?: RunRecord, log: (s: string) => void = console.log, backend: RenderBackend = realBackend): Promise<SegCover[]> => {
  if (!segments.length) return [];
  const allSegments = await loadAllSegments();
  const keys = new Map((await coverKeys(allSegments, segments)).map((k, i) => [segments[i]!.key, k]));
  const out: SegCover[] = [];
  // 不画（engine/core/覆盖不画.ts），只吃 CPU 和页面内存：过放行闸（等负载、内存），不拿渲染独占锁挡别人的静帧；整批一张票，不一段等一次放行间隔
  await backend.passGate(() => backend.perResourcePackGroup(workRoot(), segments, (s) => s.key, (group) =>
    backend.openSession(
      coverLevel,
      async (h) => {
        // 页面关掉前收走它记的区段（Remotion 出完这段才关页）；同一段几页的按最早的帧并
        const pending = new Map<string, Record<string, Record<string, number>>>();
        const inFlight = new Set<Promise<void>>();
        beforeClose(h.browser, inFlight, async (evaluate) => {
          const r = JSON.parse(await evaluate(collectExpr)) as { cover: string | null; first: Record<string, Record<string, number>> };
          if (!r.cover) return;
          const acc = pending.get(r.cover) ?? {};
          for (const [pack, m] of Object.entries(r.first)) {
            const into = (acc[pack] ??= {});
            for (const [k, f] of Object.entries(m)) if (!(into[k]! <= f)) into[k] = f;
          }
          pending.set(r.cover, acc);
        });
        for (const s of group) {
          verifySegResourcePacks(workRoot(), s.key);
          const params = segPictureParams(allSegments, [s], coverLevel)[0]!;
          const composition = expectedComposition(s, allSegments, params.inputProps);
          const versions = terrainReadVersions(s.key, s.segment.terrain);
          const t0 = Date.now();
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
          await Promise.all(inFlight);
          const first = pending.get(s.key) ?? {};
          const cover: SegCover = {
            work: workName(),
            segment: s.key,
            coverKey: keys.get(s.key)!,
            frameCount: composition.durationInFrames,
            pack: Object.fromEntries(Object.entries(first).map(([pack, m]) => [pack, { version: versions[pack] ?? '', sections: Object.fromEntries(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : 1))) }])),
            measuredAt: new Date().toISOString(),
          };
          atomicWrite(coverFile(cover.work, s.key), `${JSON.stringify(cover)}\n`);
          runRecord?.artifacts.push(coverFile(cover.work, s.key));
          log(`  ${s.key}：${composition.durationInFrames} 帧 ${((Date.now() - t0) / 1000).toFixed(0)} 秒，${Object.entries(cover.pack).map(([p, v]) => `${p} ${Object.keys(v.sections).length} 个区段`).join('、') || '没读区段包'}`);
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
export const packCover = async (pack: string, o: { measure: boolean; runRecord?: RunRecord; log?: (s: string) => void }) => {
  const used = new Map<string, { work: string; segment: string; frame: number }>();
  const stale: string[] = [];
  let segCount = 0;
  for (const work of listWorks().keys()) {
    await inWork(work, async () => {
      const allSegments = await loadAllSegments();
      const segs = segsUsingPacks(allSegments, [pack]);
      if (!segs.length) return;
      segCount += segs.length;
      const status = await coverStatus(allSegments, segs);
      const toMeasure = status.filter((x) => x.stale).map((x) => x.segment);
      if (toMeasure.length && o.measure) {
        o.log?.(`${work}：量 ${toMeasure.length} 段的地形覆盖（${toMeasure.map((s) => s.key).join('、')}）`);
        await measureCovers(toMeasure, o.runRecord, o.log);
      } else stale.push(...toMeasure.map((s) => `${work}/${s.key}`));
      for (const s of segs) {
        const cover = readCover(work, s.key);
        for (const [k, frame] of Object.entries(cover?.pack[pack]?.sections ?? {})) if (!used.has(k)) used.set(k, { work, segment: s.key, frame });
      }
    });
  }
  return { used, stale, segCount };
};
