// 唯一读 getInputProps 的地方：读成 渲染设置，经 React context 交给各段（取值和校验在 设置值.ts）。
import { createContext, createElement, useContext, type ReactNode } from 'react';
import { getInputProps } from 'remotion';
import { 设渲染设置 } from '../engine/core/渲染设置.ts';
import { 默认设置, 规范化设置, type 渲染设置 } from './设置值.ts';

export const 读设置 = (): 渲染设置 => 规范化设置(getInputProps());

// engine 里模块顶层要读的（渲染级别）经 渲染设置.ts 取，在任何段模块求值之前设好
设渲染设置(读设置());

const 设置Context = createContext<渲染设置>(默认设置);

export const 设置Provider = ({ 设置, children }: { 设置: 渲染设置; children: ReactNode }) => createElement(设置Context.Provider, { value: 设置 }, children);

export const use设置 = () => useContext(设置Context);
