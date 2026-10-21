import { describe, expect, it } from 'vitest';
import { 全部段, 匹配, 选段 } from './清单.ts';
import { 编号 } from '../../content/清单.ts';
import type { 段信息 } from './清单.ts';

const 假段 = (键: string, 章: number, 序: string, 场: string): 段信息 =>
  ({ 键, 章, 编号: `${章}-${序}`, 段名: 键.slice(String(章).length + 1), 目录: '', 画面: '', 段文件: '', 段: { 场, 帧数: 1, fps: 24, 宽: 1, 高: 1, 地形: [] } }) as 段信息;

describe('选择器', () => {
  it('段键、段名、编号、场键、章、章范围全字匹配', () => {
    const s = 假段('7-五万血', 7, '08', '7-黑暗监守');
    for (const x of ['7-五万血', '五万血', '7-08', '7-黑暗监守', '7', '6-7', '7-9', '7-8']) expect(匹配(s, x)).toBe(true);
    for (const x of ['五万', '6', '8-9', '7-黑暗']) expect(匹配(s, x)).toBe(false);
  });

  it('清单里的冒烟段能读到段.ts，没有编号；对不上的选择器报错', async () => {
    const 全 = await 全部段();
    expect(全.map((s) => s.键)).toEqual(['核对-冒烟']);
    expect(全[0]!.段).toMatchObject({ 帧数: 48, fps: 24, 宽: 1280, 高: 720 });
    expect(编号('核对-冒烟')).toBeNull();
    expect((await 选段(['核对'])).map((s) => s.键)).toEqual(['核对-冒烟']);
    await expect(选段(['没有这段'])).rejects.toThrow(/没对上任何段：没有这段/);
  });
});
