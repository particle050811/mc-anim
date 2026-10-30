// 按句放台词：<台词句轨 句们={[{ 句: 出征暮色, 帧: 24 }]} 声音={{ [出征暮色.id]: 出征暮色声 }} />，句来自作品的 台词/<id>.ts，声音是 import 'asset:<句.配音>' 的地址。
// 放法（开口对帧、开头静音让出来、截到文件完多 1 帧、台词清单日志）原样用 台词轨.tsx 的 做台词轨：同一句新旧两条路放出来的声音一样。
import React, { useMemo } from 'react';
import { 做台词轨 } from './台词轨.tsx';
import type { 台词句cue } from './台词句.ts';

export const 台词句轨: React.FC<{ 句们: readonly 台词句cue[]; 声音: Readonly<Record<string, string>> }> = ({ 句们, 声音 }) => {
  // 句们常是现写的数组字面量：按内容记住，免得每帧换一个组件类型、音频重挂
  const 键 = 句们.map(({ 句 }) => `${句.id}@${句.成品sha}:${声音[句.id] ?? ''}`).join('|');
  const LineTrack = useMemo(() => {
    const 表: Record<string, { 字: string; 角色: string; 段: string; 文件: string; 时长: number; 开口: number; 有声长: number }> = {};
    for (const { 句 } of 句们) {
      if (!声音[句.id]) throw new Error(`台词句轨：没给 ${句.id} 的声音（import 'asset:${句.配音}'）`);
      表[句.id] = { 字: 句.念, 角色: 句.角色, 段: '', 文件: 句.id, 时长: 句.时长, 开口: 句.开口, 有声长: 句.有声长 };
    }
    return 做台词轨(表, 声音).LineTrack;
  }, [键]); // 键 已经概括了 句们、声音
  return <LineTrack 句们={句们.map(({ 句, 帧, 音量 }) => ({ id: 句.id, 帧, ...(音量 === undefined ? {} : { 音量 }) }))} />;
};
