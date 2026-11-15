// 第 8 句门口头顶那层云（地点/原版云.ts 的 小木屋上空云，屋后远景.tsx 画）每一帧的样子：往西飘、云洞已经开到头（第8句参数.ts 的 云洞半径）、每格散了多少。
// 按歌曲帧算（和第 7 句同一套飘法，接得上）；段 2-收集快乐 和 核对-门口哈气 都用。纯模块（测试直接引）。
import { clamp01 } from '@engine/anim/anim.ts';
import type { ShadingSceneParams } from '@engine/三渲二/光影/预设.ts';
import { fps, oneFrameSec } from '../../分镜/时间.ts';
import { segmentWindow } from '../../分镜/正片第8句.ts';
import { cabinSkyCloud, scatterRadius, type CloudCell } from '../../地点/原版云.ts';
import type { DistantCloud } from '../../地点/屋后远景.tsx';
import { endRainCloud } from '../2-雷雨/末态.ts';
import { cloudHoleRadius, cloudColor } from './第8句参数.ts';

/** 段首前一帧（第 7 句最后一帧）：那一刻洞里的云算已经散完 */
const joinFrame = segmentWindow('2-收集快乐').起帧 - 1;

/** 云往东挪了多少（格）：原版每刻往西 0.03 格，按歌上的刻算 */
export const cloudDrift = (frame: number) => -(frame / fps) * 20 * cabinSkyCloud.driftPerTick;

/** 这一格云还剩多少（0～1）：段首前一帧已经在洞里的（那一刻散起半径不到 云洞半径）没了；之后飘进洞的，头一回够到的那一刻起 散秒 里淡掉（起那一刻已经淡了一帧）。
 *  云一直在飘，散起半径每刻都变：按头一回够到的那一刻算，散了的不会因为飘远了又回来。
 *  那一刻从 接帧 起一帧一帧往后找（原来按 1/24 秒一步，用户 11-03「统统改成 60 帧」），淡掉的进度按秒连续走 */
export const cloudRemain = (c: CloudCell, frame: number) => {
  const holeCenter = cabinSkyCloud.holeCenter;
  if (scatterRadius(c, holeCenter, cloudDrift(joinFrame)) <= cloudHoleRadius) return 0;
  for (let cursorFrame = joinFrame + 1; cursorFrame <= frame; cursorFrame++) {
    if (scatterRadius(c, holeCenter, cloudDrift(cursorFrame)) <= cloudHoleRadius) return 1 - clamp01(((frame - cursorFrame) / fps + oneFrameSec) / cabinSkyCloud.scatterSec);
  }
  return 1;
};

/** 给 门口画布 的 远景.云 */
export const line8Cloud = (frame: number): DistantCloud => ({ drift: cloudDrift(frame), remain: (c) => cloudRemain(c, frame), 色: cloudColor });

/** 光影开 Photon 云时的光影场（门口画布 的 光影场）：接第 7 句的 Photon 雨云（场/2-雷雨/末态.ts：海平面、各层高度、洞比、软边），
 *  洞是开到头的 云洞半径；雨停了，曝光倍 1、云底不再被光柱照亮 */
export const line8ShadingScene: ShadingSceneParams = {
  海平面: endRainCloud.海平面,
  cloudLayers: endRainCloud.层,
  cloud: { hole: [cabinSkyCloud.holeCenter[0], cabinSkyCloud.holeCenter[1], cloudHoleRadius * endRainCloud.holeRatio, endRainCloud.softEdge] },
};
