// 第一人称那一镜怎么清场：从杖尖飞过来的连放小弹打到他就不画（炸在他身上会把镜头糊住）。
// 出手当刻就算打到的（光束、闪电、索命）、没有命中一说的、补演的落点和场地类照原长演：
// 原来一律截到命中，这些在第一人称里就一帧都不剩（用户 11-20「放完了就继续放了，怎么还会在第一人称里面看不到」）。
import type { Launch } from '../../场/1-台地/出手表.ts';
import { escapeGap } from '../../场/1-台地/齐放拍.ts';
import { volleyLayers } from '../../场/1-台地/齐放补演.ts';

const layeredIds = new Set(volleyLayers.map(layer => layer.id));
/** 出手到命中不到这么久的算当刻打到（秒） */
const instantHitSec = 0.1;

export const firstPersonCast = (cast: Launch, hit: number | undefined): Launch => {
  if (cast.id === 'sonic_boom') return { ...cast, options: { ...cast.options, receivingSonic: true } };
  if (cast.target === escapeGap || layeredIds.has(cast.id)) return cast;
  if (hit === undefined || hit - cast.sec < instantHitSec) return cast;
  return { ...cast, end: Math.min(cast.end ?? Infinity, hit) };
};
