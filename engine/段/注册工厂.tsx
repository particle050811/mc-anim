// 注册的通用部分：按清单循环，每段的尺寸取它的 段.ts，画面取 画面.tsx，外面包一层渲染设置的 context。
// 帧率是渲染设置的 输出fps（成片档，没给就是 段格），帧数 = 段长 × 帧率（出帧.ts）；第 0 帧就是段起点，画面按秒取时间（时间.tsx，决策 0015）。
// 段就是成片的一截（用户 11-05 定「母版 = 成片切片」）：段.ts 声明的透明叠层、这一段的字幕都画在段里；叠层另登记成 `<段键>-<名>` 只给单看。
// 作品的 注册.tsx 只写 import.meta.webpackContext（webpack 要字面量参数，只能写在作品里）和调用 做注册。报错里的路径相对作品根。
// 画面、叠层按段懒加载（用户 11-17 定做）：段.ts 开页就求值（登记要尺寸、帧数），画面模块走 lazyComponent，页面渲哪段才求值哪段，
// 读组合的页面一段也不求值；要它顺带算好求解缓存的（出片、校验、认指纹、bench），用 预载.ts 的环境变量点名几段。
import React from 'react';
import { AbsoluteFill, Composition, Img, cancelRender, continueRender, delayRender } from 'remotion';
import '../core/稳定排序.ts';
import '../core/覆盖不画.ts';
import { segFrameCount, segFps, type SegmentDef } from './段定义.ts';
import { SettingsProvider, useSettings, readSettings } from './设置.ts';
import { useOutputFrame } from './时间.tsx';
import { preloadSegsEnv } from './预载.ts';

/** import.meta.webpackContext 的返回值 */
export type ModuleDir = { keys(): string[]; (key: string): unknown };
/** mode: 'lazy' 的 import.meta.webpackContext：每个模块单独一块，取的时候才下载、求值 */
export type LazyModuleDir = { keys(): string[]; (key: string): Promise<unknown> };

export type RegisterParams = {
  manifest: readonly { key: string }[];
  /** 段目录的相对作品根，如 段/6-斩娜迦、核对/冒烟 */
  segDir: (segKey: string) => string;
  /**
   * 段目录的第一层（段、核对）→ 扫这一层的两个 webpackContext，键形如 ./<段名>/段.ts。键是目录名，跟 segDir 返回的第一层对上，不是属性名。
   * segDefs 收 段.ts（同步）；pictures 收 画面.tsx、叠层*.tsx（mode: 'lazy'）
   */
  modules: Readonly<Record<string, { segDefs: ModuleDir; pictures: LazyModuleDir }>>;
};

// webpack 里没有 process 这个变量时也不能炸（同 engine/core/试看.ts）
const readProcessEnv = () => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

type LoadedSeg = { Picture: React.FC; overlays: { name: string; component: React.FC }[] };

export const makeRegistry = ({ manifest, segDir, modules: modules }: RegisterParams): React.FC => {
  /** 段目录下这个文件在哪个 webpackContext、键是什么；清单里有、目录里没有的开页就报（不等渲到这段） */
  const locate = <K extends 'segDefs' | 'pictures'>(segKey: string, file: string, kind: K) => {
    const dir = segDir(segKey);
    const [topLayer, ...restSegments] = dir.split('/');
    const moduleMap = modules[topLayer!]?.[kind];
    const key = `./${[...restSegments, file].join('/')}`;
    if (!moduleMap || !moduleMap.keys().includes(key)) throw new Error(`清单里的 ${segKey} 缺 ${dir}/${file}`);
    return { dir, moduleMap: moduleMap as RegisterParams['modules'][string][K], key };
  };
  const pickExport = <T,>(m: unknown, dir: string, file: string, exportName: string): T => {
    const exports = m as Record<string, unknown>;
    if (!(exportName in exports)) throw new Error(`${dir}/${file} 没有导出 ${exportName}`);
    return exports[exportName] as T;
  };
  const loadDef = (segKey: string): SegmentDef => {
    const { dir, moduleMap, key } = locate(segKey, '段.ts', 'segDefs');
    return pickExport<SegmentDef>(moduleMap(key), dir, '段.ts', 'default');
  };
  const loadPicture = async (segKey: string, file: string): Promise<React.FC> => {
    const { dir, moduleMap, key } = locate(segKey, file, 'pictures');
    return pickExport<React.FC>(await moduleMap(key), dir, file, 'default');
  };

  const settings = readSettings();

  /** 这一段的字幕：输出帧 */
  const SubtitleLayer: React.FC = () => {
    const frame = useOutputFrame();
    const activeSubtitles = useSettings().subtitles.filter((p) => p.start <= frame && frame < p.end);
    return (
      <>
        {activeSubtitles.map((p, i) => (
          <AbsoluteFill key={i}>
            <Img src={p.image} style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }} />
          </AbsoluteFill>
        ))}
      </>
    );
  };

  const segments = manifest.map(({ key: segKey }) => ({ key: segKey, segment: loadDef(segKey) }));
  const segByKey = new Map(segments.map((x) => [x.key, x.segment]));
  const outputFps = settings.outputFps ?? segFps;

  // 一段的画面、叠层：一页只求值一次；一个等完再取下一个，求值顺序固定（画面在前，叠层照 段.ts 的顺序），和以前整表求值时这段内部的顺序一样
  const loading = new Map<string, Promise<LoadedSeg>>();
  const loadSeg = (segKey: string): Promise<LoadedSeg> => {
    let p = loading.get(segKey);
    if (!p) {
      const seg = segByKey.get(segKey);
      if (!seg) throw new Error(`清单里没有段 ${segKey}`);
      p = (async () => {
        const Picture = await loadPicture(segKey, '画面.tsx');
        const overlays: LoadedSeg['overlays'] = [];
        for (const l of seg.overlay ?? []) overlays.push({ name: l.name, component: await loadPicture(segKey, l.entry) });
        return { Picture, overlays };
      })();
      loading.set(segKey, p);
    }
    return p;
  };

  const wrap = (children: React.ReactNode, withSubtitles: boolean): React.FC => {
    const component: React.FC = () => (
      <SettingsProvider settings={settings}>
        {children}
        {withSubtitles && <SubtitleLayer />}
      </SettingsProvider>
    );
    return component;
  };

  const compositions = segments.flatMap(({ key: segKey, segment: seg }) => {
    const frameCount = segFrameCount(seg, outputFps);
    // 文件在不在开页就查，缺了照旧在读组合时报
    locate(segKey, '画面.tsx', 'pictures');
    for (const l of seg.overlay ?? []) locate(segKey, l.entry, 'pictures');
    const main = async () => {
      const { Picture, overlays } = await loadSeg(segKey);
      const mainComp = (
        <>
          <Picture />
          {overlays.map(({ name: overlayName, component: OverlayLayer }) => (
            <AbsoluteFill key={overlayName}>
              <OverlayLayer />
            </AbsoluteFill>
          ))}
        </>
      );
      return { default: wrap(mainComp, true) };
    };
    const overlayOnly = (overlayName: string) => async () => {
      const { overlays } = await loadSeg(segKey);
      const OverlayLayer = overlays.find((o) => o.name === overlayName)!.component;
      return { default: wrap(<OverlayLayer />, false) };
    };
    return [
      { id: segKey, lazyComponent: main, segment: seg, frameCount: frameCount },
      ...(seg.overlay ?? []).map((l) => ({ id: `${segKey}-${l.name}`, lazyComponent: overlayOnly(l.name), segment: seg, frameCount: frameCount })),
    ];
  });

  // 点名预载的段（读组合的页面用）：等它们的画面模块都求值完才算就绪，模块初始化里缺的求解就在这一页算好，关页面时收走写盘
  const preload = readProcessEnv()?.[preloadSegsEnv];
  if (preload) {
    const handle = delayRender(`预载段 ${preload}`);
    (async () => {
      for (const segKey of JSON.parse(preload) as string[]) await loadSeg(segKey);
    })().then(() => continueRender(handle), (e: unknown) => cancelRender(e));
  }

  const registration: React.FC = () => (
    <>
      {compositions.map(({ id, segment: seg, lazyComponent, frameCount: frameCount }) => (
        <Composition key={id} id={id} lazyComponent={lazyComponent} durationInFrames={frameCount} fps={outputFps} width={seg.width} height={seg.height} />
      ))}
    </>
  );
  return registration;
};
