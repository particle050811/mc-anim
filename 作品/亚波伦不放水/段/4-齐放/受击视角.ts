// 第一人称那一镜怎么清场：从杖尖飞过来的连放小弹打到他就不画（炸在他身上会把镜头糊住）。
// 出手当刻就算打到的（光束、索命）、没有命中一说的、补演的落点和场地类照原长演：
// 原来一律截到命中，这些在第一人称里就一帧都不剩（用户 11-20「放完了就继续放了，怎么还会在第一人称里面看不到」）。
import type { Launch } from '../../场/1-台地/出手表.ts';
import { escapeGap } from '../../场/1-台地/齐放拍.ts';
import { volleyLayers } from '../../场/1-台地/齐放补演.ts';

const layeredIds = new Set(volleyLayers.map(layer => layer.id));
/** 罩在他身上、照原长演会糊屏的，仍截到命中（没有命中一说的留 0.2 秒）：11-20 逐个放开出静帧量的，
 *  流星雨头顶的雾云抬头时盖住半屏，障碍的墙围着他盖住两三成，闪电劈在他身上那一道白了四成；别的放开都不糊屏 */
const coversCamera = new Set(['meteor_shower', 'barricade', 'lightning']);
/** 出手到命中不到这么久的算当刻打到（秒） */
const instantHitSec = 0.1;

const cutAtHit = (cast: Launch, hit: number | undefined): Launch => ({ ...cast, end: Math.min(cast.end ?? Infinity, hit ?? cast.sec + 0.2) });

export const firstPersonCast = (cast: Launch, hit: number | undefined): Launch => {
  if (cast.id === 'sonic_boom') return { ...cast, options: { ...cast.options, receivingSonic: true } };
  if (cast.target === escapeGap) return cast;
  if (coversCamera.has(cast.id)) return cutAtHit(cast, hit);
  if (layeredIds.has(cast.id) || hit === undefined || hit - cast.sec < instantHitSec) return cast;
  return cutAtHit(cast, hit);
};
