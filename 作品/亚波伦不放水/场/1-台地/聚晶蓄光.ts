import { smoothstep01 } from '@engine/core/数学.ts';
import { fireKey } from './出手表.ts';
import { castStart, castTable } from './齐放拍.ts';

const focusKeys = [...new Set([fireKey('revelation'), ...castTable.map(({ id }) => fireKey(id))])];

export const castCharge = (volleySec: number) => {
  const remaining = castStart - volleySec;
  if (remaining <= 0 || remaining >= 0.42) return {};
  const rise = smoothstep01((0.42 - remaining) / 0.34);
  const intensity = rise * (0.83 + 0.17 * smoothstep01(remaining / 0.08));
  return { flash: Object.fromEntries(focusKeys.map(key => [key, intensity])) };
};
