// 唯一读 getInputProps 的地方：读成 渲染设置，经 React context 交给各段（取值和校验在 设置值.ts）。
import { createContext, createElement, useContext, type ReactNode } from 'react';
import { getInputProps } from 'remotion';
import { setRenderSettings } from '../core/渲染设置.ts';
import { defaultSettings, normalizeSettings, type RenderSettings } from './设置值.ts';

export const readSettings = (): RenderSettings => normalizeSettings(getInputProps());

// engine 里模块顶层要读的（渲染级别）经 渲染设置.ts 取，在任何段模块求值之前设好
setRenderSettings(readSettings());

const settingsContext = createContext<RenderSettings>(defaultSettings);

export const SettingsProvider = ({ settings, children }: { settings: RenderSettings; children: ReactNode }) => createElement(settingsContext.Provider, { value: settings }, children);

export const useSettings = () => useContext(settingsContext);
