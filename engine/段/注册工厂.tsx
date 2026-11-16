// 注册的通用部分：按清单循环，每段的尺寸取它的 段.ts，画面取 画面.tsx，外面包一层渲染设置的 context。
// 帧率是渲染设置的 输出fps（成片档，没给就是 段格），帧数 = 段长 × 帧率（出帧.ts）；第 0 帧就是段起点，画面按秒取时间（时间.tsx，决策 0015）。
// 段就是成片的一截（用户 11-05 定「母版 = 成片切片」）：段.ts 声明的透明叠层、这一段的字幕都画在段里；叠层另登记成 `<段键>-<名>` 只给单看。
// 作品的 注册.tsx 只写 import.meta.webpackContext（webpack 要字面量参数，只能写在作品里）和调用 做注册。报错里的路径相对作品根。
import React from 'react';
import { AbsoluteFill, Composition, Img } from 'remotion';
import '../core/稳定排序.ts';
import { segFrameCount, segFps, type SegmentDef } from './段定义.ts';
import { SettingsProvider, useSettings, readSettings } from './设置.ts';
import { useOutputFrame } from './时间.tsx';

/** import.meta.webpackContext 的返回值 */
export type ModuleDir = { keys(): string[]; (key: string): unknown };

export type RegisterParams = {
  manifest: readonly { key: string }[];
  /** 段键 → 段目录（相对作品根，如 段/6-斩娜迦、核对/冒烟） */
  segDir: (segKey: string) => string;
  /** 段目录的第一层（段、核对）→ 扫这一层的 webpackContext，键形如 ./<段名>/段.ts。键是目录名，跟 segDir 返回的第一层对上，不是属性名 */
  modules: Readonly<Record<string, ModuleDir>>;
};

export const makeRegistry = ({ manifest, segDir, modules: modules }: RegisterParams): React.FC => {
  const loadExport = <T,>(segKey: string, file: string, exportName: string): T => {
    const dir = segDir(segKey);
    const [topLayer, ...restSegments] = dir.split('/');
    const moduleMap = modules[topLayer!];
    const key = `./${[...restSegments, file].join('/')}`;
    if (!moduleMap || !moduleMap.keys().includes(key)) throw new Error(`清单里的 ${segKey} 缺 ${dir}/${file}`);
    const m = moduleMap(key) as Record<string, unknown>;
    if (!(exportName in m)) throw new Error(`${dir}/${file} 没有导出 ${exportName}`);
    return m[exportName] as T;
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

  const segments = manifest.map(({ key: segKey }) => ({ key: segKey, segment: loadExport<SegmentDef>(segKey, '段.ts', 'default') }));
  const outputFps = settings.outputFps ?? segFps;

  const compositions = segments.flatMap(({ key: segKey, segment: seg }) => {
    const frameCount = segFrameCount(seg, outputFps);
    const Picture = loadExport<React.FC>(segKey, '画面.tsx', 'default');
    const overlays = (seg.overlay ?? []).map((l) => ({ name: l.name, component: loadExport<React.FC>(segKey, l.entry, 'default') }));
    const wrap = (children: React.ReactNode, withSubtitles: boolean): React.FC => {
      const component: React.FC = () => (
        <SettingsProvider settings={settings}>
          {children}
          {withSubtitles && <SubtitleLayer />}
        </SettingsProvider>
      );
      return component;
    };
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
    return [
      { id: segKey, component: wrap(mainComp, true), segment: seg, frameCount: frameCount },
      ...overlays.map(({ name: overlayName, component: OverlayLayer }) => ({ id: `${segKey}-${overlayName}`, component: wrap(<OverlayLayer />, false), segment: seg, frameCount: frameCount })),
    ];
  });

  const registration: React.FC = () => (
    <>
      {compositions.map(({ id, segment: seg, component, frameCount: frameCount }) => (
        <Composition key={id} id={id} component={component} durationInFrames={frameCount} fps={outputFps} width={seg.width} height={seg.height} />
      ))}
    </>
  );
  return registration;
};
