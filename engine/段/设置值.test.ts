import { describe, expect, it } from 'vitest';
import { normalizeSettings } from './设置值.ts';

describe('渲染设置', () => {
  it('缺省取默认，拼错的键和不认识的级别都报错', () => {
    expect(normalizeSettings(undefined)).toEqual({ level: '视频', outputFps: null, subtitles: [] });
    expect(normalizeSettings({ level: '预览' })).toEqual({ level: '预览', outputFps: null, subtitles: [] });
    expect(() => normalizeSettings({ 级别s: '预览' })).toThrow(/不认识的键：级别s/);
    expect(() => normalizeSettings({ level: '高清' })).toThrow(/只能是 视频、预览/);
    expect(() => normalizeSettings({ outputFps: 59.94 })).toThrow(/正整数/);
  });
});
