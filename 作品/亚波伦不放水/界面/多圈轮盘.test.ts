import { expect, it, vi } from 'vitest';
import * as paint from '@库/界面/径向轮盘画.ts';
import { drawMultiRingWheel, type MultiRingParams } from './多圈轮盘.tsx';
import { arrangeWheel } from './轮盘法术.ts';
import { castCharge } from '../场/1-台地/聚晶蓄光.ts';

it('原大起步，同格不重复画；拆开时遮住共用格，弹完、收盘仍用原来的显隐', () => {
  using icons = vi.spyOn(paint, 'drawPixelImage').mockImplementation(() => {});
  using bands = vi.spyOn(paint, 'drawRingBands').mockImplementation(() => {});
  const ctx = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn() };
  const canvas = { ctx: ctx as unknown as CanvasRenderingContext2D, centerX: 1024, centerY: 1024, scale: 8 };
  const draw = (tick: number, extra: Partial<MultiRingParams> = {}) => {
    icons.mockClear();
    ctx.clip.mockClear();
    drawMultiRingWheel(canvas, { 刻: tick, backdropMode: '无', exitIcon: '盘心移出', ...extra });
    expect(ctx.save.mock.calls.length).toBe(ctx.restore.mock.calls.length);
    expect(icons.mock.calls.every(([, , , , width, height]) => width === 16 && height === 16)).toBe(true);
    return [...icons.mock.calls];
  };
  expect(draw(0)).toHaveLength(1);
  expect(draw(4)).toHaveLength(1 + 14 + 24);
  expect(draw(5)).toHaveLength(1 + 14 + 24);
  expect(draw(6.25)).toHaveLength(1 + 71);
  expect(ctx.clip).toHaveBeenCalledWith('evenodd');
  expect(draw(1, { exitIcon: '弹完' })).toHaveLength(0);
  expect(draw(7.5)).toEqual(draw(7.5, { exitIcon: '弹完' }));
  expect(draw(40, { closeTick: 1 })).toEqual(draw(40, { closeTick: 1, exitIcon: '弹完' }));
});

it('蓄光峰值覆盖三圈 71 枚及盘心，只改图标原有的像素，不亮扇格或透明孔', () => {
  using icons = vi.spyOn(paint, 'drawPixelImage').mockImplementation(() => {});
  using bands = vi.spyOn(paint, 'drawRingBands').mockImplementation(() => {});
  const canvas = { ctx: {} as CanvasRenderingContext2D, centerX: 480, centerY: 480, scale: 4 };
  const plain = { 刻: 20, backdropMode: '无' } as const;
  drawMultiRingWheel(canvas, plain);
  const base = icons.mock.calls.map(call => call[1]), baseBands = [...bands.mock.calls];
  icons.mockClear(); bands.mockClear();
  const charge = castCharge(0);
  expect(Object.keys(charge.flash ?? {}).sort()).toEqual(arrangeWheel().items.map(item => item.key).sort());
  drawMultiRingWheel(canvas, { ...plain, ...charge });
  expect(bands.mock.calls).toEqual(baseBands);
  expect(icons.mock.calls).toHaveLength(72);
  icons.mock.calls.forEach(([, icon], index) => {
    const raw = base[index]!;
    let rise = 0, visible = 0;
    for (let offset = 0; offset < raw.px.length; offset += 4) {
      expect(icon.px[offset + 3]).toBe(raw.px[offset + 3]);
      if (raw.px[offset + 3]! > 0) {
        visible++;
        rise += (icon.px[offset]! - raw.px[offset]! + icon.px[offset + 1]! - raw.px[offset + 1]! + icon.px[offset + 2]! - raw.px[offset + 2]!) / 3;
      } else expect(icon.px.subarray(offset, offset + 3)).toEqual(raw.px.subarray(offset, offset + 3));
    }
    expect(rise / visible, `聚晶 ${index} 的可见像素没有明显变亮`).toBeGreaterThan(20);
  });
});
