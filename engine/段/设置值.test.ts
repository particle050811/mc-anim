import { describe, expect, it } from 'vitest';
import { 规范化设置 } from './设置值.ts';

describe('渲染设置', () => {
  it('缺省取默认，拼错的键和不认识的级别都报错', () => {
    expect(规范化设置(undefined)).toEqual({ 级别: '视频' });
    expect(规范化设置({ 级别: '预览' })).toEqual({ 级别: '预览' });
    expect(() => 规范化设置({ 级别s: '预览' })).toThrow(/不认识的键：级别s/);
    expect(() => 规范化设置({ 级别: '高清' })).toThrow(/只能是 视频、预览/);
  });
});
