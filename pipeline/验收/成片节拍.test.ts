import { expect, it } from 'vitest';
import { auditCadence } from './成片节拍.ts';

const hashes = (ticks: number[], colors: number[]) => '#tb 0: 1/60000\n' + ticks.map((tick, frame) => `0,${tick},${tick},1000,14400,${String(colors[frame]).padStart(32, '0')}`).join('\n');
it('标称相同帧数下，单次卡拍不能由下个短帧抵掉；不把静帧误报成时钟故障', () => {
  expect(auditCadence(hashes([0, 1000, 2000, 3000], [1, 2, 2, 3]), 60, 4)).toMatchObject({ pass: true, repeated: [2] });
  expect(auditCadence(hashes([0, 1000, 2700, 3000], [1, 2, 3, 4]), 60, 4)).toMatchObject({ pass: false, badTiming: [2, 3], repeated: [] });
  expect(auditCadence(hashes([0, 1000, 2000], [1, 2, 3]), 60, 4).pass).toBe(false);
});
