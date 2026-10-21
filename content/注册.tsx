// 所有 Composition 的登记：按 清单.ts 循环，每段的尺寸、帧数取它的 段.ts，画面取 画面.tsx，外面包一层渲染设置的 context。加段不用改这里。
import React from 'react';
import { Composition } from 'remotion';
import type { 段定义 } from './段定义.ts';
import { 清单, 段目录 } from './清单.ts';
import { 设置Provider, 读设置 } from './设置.ts';

const 模块 = import.meta.webpackContext('./', { recursive: true, regExp: /^\.\/(段|核对)\/[^/]+\/(段\.ts|画面\.tsx)$/ });

const 取 = <T,>(键: string, 文件: string, 导出: string): T => {
  const key = `./${段目录(键)}/${文件}`;
  if (!模块.keys().includes(key)) throw new Error(`清单里的 ${键} 缺 content/${段目录(键)}/${文件}`);
  const m = 模块(key) as Record<string, unknown>;
  if (!(导出 in m)) throw new Error(`content/${段目录(键)}/${文件} 没有导出 ${导出}`);
  return m[导出] as T;
};

const 设置 = 读设置();

const 段们 = 清单.map(({ 键 }) => {
  const 段 = 取<段定义>(键, '段.ts', 'default');
  const 画面 = 取<React.FC>(键, '画面.tsx', 'default');
  const 组件: React.FC = () => (
    <设置Provider 设置={设置}>
      <画面 />
    </设置Provider>
  );
  return { 键, 段, 组件 };
});

export const 注册: React.FC = () => (
  <>
    {段们.map(({ 键, 段, 组件 }) => (
      <Composition key={键} id={键} component={组件} durationInFrames={段.帧数} fps={段.fps} width={段.宽} height={段.高} />
    ))}
  </>
);
