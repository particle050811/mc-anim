// 冰川（goety:iceology_focus → IceChunkSpell）的元数据和时序。出处见 冰川.tsx。
import { defineSpellMeta } from '../接口.ts';

/** 头 20 刻从小长到满（isStarting）；悬停到第 100 刻（hoverTime 5 秒），之后每刻速度再加 0.25 格/刻 */
export const iceBlockGrowTicks = 20;
export const iceBlockHoverTick = 100;
/** 实体脚底在目标脚底往上 4 格 */
export const iceBlockSpawnHeight = 4;
export const iceBlockHeight = (tick: number) => {
  const k = Math.max(0, Math.floor(tick) - iceBlockHoverTick);
  return iceBlockSpawnHeight - 0.125 * k * (k + 1);
};
/** 落到史蒂夫头顶（1.8 格）以下的第一刻 */
export const iceBlockHitTick = (() => {
  let n = iceBlockHoverTick;
  while (iceBlockHeight(n) > 1.8) n++;
  return n;
})();

export default defineSpellMeta({
  id: 'iceology',
  长秒: (iceBlockHitTick + 40) / 20,
  hitSec: iceBlockHitTick / 20,
  // IceChunkSpell：ICE_CHUNK_SUMMON；IceChunk.tick：第 1 刻 IDLE、第 85 刻 DROP；onHit：HIT（音量 2）
  sound: [
    { asset: '音效/诡厄巫法/goety.ice_chunk_summon', sec: 0 },
    { asset: '音效/诡厄巫法/goety.ice_chunk_idle', sec: 1 / 20 },
    { asset: '音效/诡厄巫法/goety.ice_chunk_drop', sec: (iceBlockHoverTick - 15) / 20 },
    { asset: '音效/诡厄巫法/goety.ice_chunk_hit', sec: iceBlockHitTick / 20, 音量: 2 },
  ],
});
