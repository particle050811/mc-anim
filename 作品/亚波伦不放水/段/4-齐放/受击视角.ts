// 第一人称那一镜怎么清场：大招打到他以后只留 0.4 秒（星辉、虚烁、绽放炸在他身上盖住大半屏，11-20 逐个放开量的），
// 别的照原长演：连放小弹打到以后的余波同侧镜（齐放拍.ts 的 余秒），出手当刻就算打到的（光束、闪电、索命）、没有命中一说的、补演的落点和场地类也照原长：
// 原来一律截到命中，这些在第一人称里就一帧都不剩（用户 11-20「放完了就继续放了，怎么还会在第一人称里面看不到」）。
// 贴着他眼睛的爆炸、闪电靠段开的近镜淡（画面.tsx 的 nearFadeContext）淡掉，不再整屏糊住（用户 11-20「不要挡住太多的画面」）。
import type { Launch } from '../../场/1-台地/出手表.ts';
import { bigCastIds, escapeGap } from '../../场/1-台地/齐放拍.ts';

/** 出手到命中不到这么久的算当刻打到（秒） */
const instantHitSec = 0.1;

/** 凋灵之首算大招，可它冷却 0、一直连射，打在他身上就是一颗小炸弹，同连放小弹 */
const cutBigIds = new Set(bigCastIds.filter((id) => id !== 'wither_skull'));
/** 大招打到他以后再留几秒（用户 11-21 看 0、0.4 秒、全 三档视频后定 0.4 秒；全演完会整屏染紫） */
const bigTailSec = 0.4;

export const firstPersonCast = (cast: Launch, hit: number | undefined): Launch => {
  if (cast.id === 'sonic_boom') return { ...cast, options: { ...cast.options, receivingSonic: true } };
  if (cast.target === escapeGap) return cast;
  if (!cutBigIds.has(cast.id) || hit === undefined || hit - cast.sec < instantHitSec) return cast;
  return { ...cast, end: Math.min(cast.end ?? Infinity, hit + bigTailSec) };
};
