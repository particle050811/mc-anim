import { describe, expect, it } from 'vitest';
import { 全部段, 选中, 选段 } from './清单.ts';
import { 清单, 编号 } from '../../作品/应力转动/清单.ts';
import type { 段信息 } from './清单.ts';

const 假段 = (键: string, 章: number, 序: string, 场: string): 段信息 =>
  ({ 键, 章, 编号: `${章}-${序}`, 段名: 键.slice(String(章).length + 1), 目录: '', 画面: '', 段文件: '', 段: { 场, 帧数: 1, fps: 24, 宽: 1, 高: 1, 地形: [] } }) as 段信息;

describe('选择器', () => {
  it('段键、段名、编号、场键、章、章范围全字匹配', () => {
    const s = 假段('7-五万血', 7, '08', '7-黑暗监守');
    const 中 = (x: string) => 选中([s], x).length === 1;
    for (const x of ['7-五万血', '五万血', '7-08', '7-黑暗监守', '7', '6-7', '7-9', '7-8']) expect(中(x)).toBe(true);
    for (const x of ['五万', '6', '8-9', '7-黑暗']) expect(中(x)).toBe(false);
  });

  it('编号先全字匹配，对不上任何段才当章范围', () => {
    const 全 = [假段('6-进入森林', 6, '01', '6-森林'), 假段('6-走', 6, '02', '6-森林'), 假段('7-五万血', 7, '08', '7-黑暗监守'), 假段('8-开门', 8, '01', '8-门')];
    const 键 = (x: string) => 选中(全, x).map((s) => s.键);
    expect(键('6-01')).toEqual(['6-进入森林']);
    expect(键('7-08')).toEqual(['7-五万血']);
    expect(键('6-7')).toEqual(['6-进入森林', '6-走', '7-五万血']);
    expect(键('7-8')).toEqual(['7-五万血', '8-开门']);
    expect(键('6-02')).toEqual(['6-走']);
    expect(键('6-03')).toEqual([]);
  });

  it('真清单：6-01、7-08 各只选中一段，6-7 仍是章范围', async () => {
    const 全 = await 全部段();
    expect((await 选段(['6-01'])).map((s) => s.键)).toEqual(['6-进入森林']);
    expect(await 选段(['7-08'])).toHaveLength(1);
    expect((await 选段(['6-7'])).map((s) => s.键)).toEqual(全.filter((s) => s.章 === 6 || s.章 === 7).map((s) => s.键));
    expect((await 选段(['7-08', '7-五万血'])).map((s) => s.键)).toEqual(['7-五万血']);
  });

  it('清单里的段都能读到段.ts，核对段在前、没有编号；对不上的选择器报错', async () => {
    const 全 = await 全部段();
    expect(全.map((s) => s.键)).toEqual(清单.map((x) => x.键));
    expect(全.slice(0, 2).map((s) => s.键)).toEqual(['核对-冒烟', '核对-角色包']);
    expect(全[0]!.段).toMatchObject({ 帧数: 48, fps: 24, 宽: 1280, 高: 720 });
    expect(编号('核对-冒烟')).toBeNull();
    expect((await 选段(['核对'])).map((s) => s.键)).toEqual(['核对-冒烟', '核对-角色包', '核对-环境', '核对-台词句轨']);
    await expect(选段(['没有这段'])).rejects.toThrow(/没对上任何段：没有这段/);
  });
});
