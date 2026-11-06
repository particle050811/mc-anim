// 注册的通用部分：按清单循环，每段的尺寸取它的 段.ts，画面取 画面.tsx，外面包一层渲染设置的 context。
// 帧率、帧数按渲染设置的 输出fps，段在输出帧上的窗按全片位置算（出帧.ts）。原生段（段.ts 写 时钟: '秒'）外面包 原生时钟（时间.tsx），
// 没迁的段和输出fps 不同时包兼容层 编排时钟（待删，docs/决策/0015-原生60帧.md）。
// 段就是成片的一截（用户 11-05 定「母版 = 成片切片」）：段.ts 声明的透明叠层、这一段的字幕都画在段里；叠层另登记成 `<段键>-<名>` 只给单看。
// 作品的 注册.tsx 只写 import.meta.webpackContext（webpack 要字面量参数，只能写在作品里）和调用 做注册。报错里的路径相对作品根。
import React from 'react';
import { AbsoluteFill, Composition, Img, useCurrentFrame } from 'remotion';
import '../core/稳定排序.ts';
import type { 段定义 } from './段定义.ts';
import { 设置Provider, use设置, 读设置 } from './设置.ts';
import { 全片起帧表, 段输出窗 } from './出帧.ts';
import { 编排时钟 } from './编排时钟.tsx';
import { 原生时钟 } from './时间.tsx';

/** import.meta.webpackContext 的返回值 */
export type 模块目录 = { keys(): string[]; (key: string): unknown };

export type 注册参数 = {
  清单: readonly { 键: string }[];
  /** 段键 → 段目录（相对作品根，如 段/6-斩娜迦、核对/冒烟） */
  段目录: (键: string) => string;
  /** 段目录的第一层（段、核对）→ 扫这一层的 webpackContext，键形如 ./<段名>/段.ts */
  模块: Readonly<Record<string, 模块目录>>;
};

export const 做注册 = ({ 清单, 段目录, 模块 }: 注册参数): React.FC => {
  const 取 = <T,>(键: string, 文件: string, 导出: string): T => {
    const 目录 = 段目录(键);
    const [层, ...其余] = 目录.split('/');
    const 表 = 模块[层!];
    const key = `./${[...其余, 文件].join('/')}`;
    if (!表 || !表.keys().includes(key)) throw new Error(`清单里的 ${键} 缺 ${目录}/${文件}`);
    const m = 表(key) as Record<string, unknown>;
    if (!(导出 in m)) throw new Error(`${目录}/${文件} 没有导出 ${导出}`);
    return m[导出] as T;
  };

  const 设置 = 读设置();

  /** 这一段的字幕：输出帧，在编排时钟外面 */
  const 字幕层: React.FC = () => {
    const 帧 = useCurrentFrame();
    const 屏 = use设置().字幕.filter((p) => p.起 <= 帧 && 帧 < p.止);
    return (
      <>
        {屏.map((p, i) => (
          <AbsoluteFill key={i}>
            <Img src={p.图} style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }} />
          </AbsoluteFill>
        ))}
      </>
    );
  };

  const 段们 = 清单.map(({ 键 }) => ({ 键, 段: 取<段定义>(键, '段.ts', 'default') }));
  const 起帧 = 全片起帧表(段们.map(({ 键, 段 }) => ({ 键, 帧数: 段.帧数 })));

  const 组合们 = 段们.flatMap(({ 键, 段 }) => {
    const 输出fps = 设置.输出fps ?? 段.fps;
    const 窗 = 段输出窗(起帧.get(键)!, 段.帧数, 段.fps, 输出fps);
    const 画面 = 取<React.FC>(键, '画面.tsx', 'default');
    const 叠层们 = (段.叠层 ?? []).map((l) => ({ 名: l.名, 组件: 取<React.FC>(键, l.入口, 'default') }));
    const 包 = (里: React.ReactNode, 带字幕: boolean): React.FC => {
      const 组件: React.FC = () => (
        <设置Provider 设置={设置}>
          {段.时钟 === '秒' ? (
            <原生时钟 相位秒={窗.相位 / 段.fps}>{里}</原生时钟>
          ) : (
            <编排时钟 编排fps={段.fps} 输出fps={输出fps} 相位={窗.相位}>
              {里}
            </编排时钟>
          )}
          {带字幕 && <字幕层 />}
        </设置Provider>
      );
      return 组件;
    };
    const 主 = (
      <>
        <画面 />
        {叠层们.map(({ 名, 组件: 层 }) => (
          <AbsoluteFill key={名}>
            <层 />
          </AbsoluteFill>
        ))}
      </>
    );
    return [
      { id: 键, 组件: 包(主, true), 段, 输出fps, 帧数: 窗.帧数 },
      ...叠层们.map(({ 名, 组件: 层 }) => ({ id: `${键}-${名}`, 组件: 包(<层 />, false), 段, 输出fps, 帧数: 窗.帧数 })),
    ];
  });

  const 注册: React.FC = () => (
    <>
      {组合们.map(({ id, 段, 组件, 输出fps, 帧数 }) => (
        <Composition key={id} id={id} component={组件} durationInFrames={帧数} fps={输出fps} width={段.宽} height={段.高} />
      ))}
    </>
  );
  return 注册;
};
