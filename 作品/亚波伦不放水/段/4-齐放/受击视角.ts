import type { Launch } from '../../场/1-台地/出手表.ts';
import { escapeGap, steveFoot, yaBoLunPos } from '../../场/1-台地/齐放拍.ts';
import { volleyLayers } from '../../场/1-台地/齐放补演.ts';

const distantBursts = new Set(volleyLayers.filter(layer => layer.fromCaster && !layer.follow).map(layer => layer.id));
const peripheralFields = new Set(['trident_storm', 'scatter', 'biomine', 'flame_strike']);

export const firstPersonCast = (cast: Launch, hit: number | undefined): Launch => {
  if (cast.id === 'sonic_boom') return { ...cast, options: { ...cast.options, receivingSonic: true } };
  if (cast.target === escapeGap || peripheralFields.has(cast.id)) return cast;
  if (distantBursts.has(cast.id)) {
    const origin = yaBoLunPos(cast.sec);
    if (Math.hypot(origin[0] - steveFoot[0], origin[1] - steveFoot[1]) > 15) return cast;
  }
  return { ...cast, end: Math.min(cast.end ?? Infinity, hit ?? cast.sec + 0.2) };
};
