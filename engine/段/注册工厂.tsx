// 注册的通用部分：按清单循环，每段的尺寸、帧数取它的 段.ts，画面取 画面.tsx，外面包一层渲染设置的 context；
// 段.ts 声明的透明叠层另登记成 `<段键>-<名>`（帧数、尺寸同本段），anim film 叠到成片上。
// 作品的 注册.tsx 只写 import.meta.webpackContext（webpack 要字面量参数，只能写在作品里）和调用 做注册。报错里的路径相对作品根。
import React from 'react';
import { Composition } from 'remotion';
import type { 段定义 } from './段定义.ts';
import { 设置Provider, 读设置 } from './设置.ts';

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

  const 包设置 = (画面: React.FC): React.FC => {
    const 组件: React.FC = () => (
      <设置Provider 设置={设置}>
        <画面 />
      </设置Provider>
    );
    return 组件;
  };

  const 段们 = 清单.flatMap(({ 键 }) => {
    const 段 = 取<段定义>(键, '段.ts', 'default');
    return [
      { id: 键, 段, 组件: 包设置(取<React.FC>(键, '画面.tsx', 'default')) },
      ...(段.叠层 ?? []).map((l) => ({ id: `${键}-${l.名}`, 段, 组件: 包设置(取<React.FC>(键, l.入口, 'default')) })),
    ];
  });

  const 注册: React.FC = () => (
    <>
      {段们.map(({ id, 段, 组件 }) => (
        <Composition key={id} id={id} component={组件} durationInFrames={段.帧数} fps={段.fps} width={段.宽} height={段.高} />
      ))}
    </>
  );
  return 注册;
};
