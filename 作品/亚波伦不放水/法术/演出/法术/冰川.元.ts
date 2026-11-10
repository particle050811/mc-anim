// 冰川（goety:iceology_focus → IceChunkSpell）的元数据和时序。出处见 冰川.tsx。
import { 定义法术元 } from '../接口.ts';

/** 头 20 刻从小长到满（isStarting）；悬停到第 100 刻（hoverTime 5 秒），之后每刻速度再加 0.25 格/刻 */
export const 冰块长成刻 = 20;
export const 冰块悬停刻 = 100;
/** 实体脚底在目标脚底往上 4 格 */
export const 冰块出生高 = 4;
export const 冰块高 = (刻: number) => {
  const k = Math.max(0, Math.floor(刻) - 冰块悬停刻);
  return 冰块出生高 - 0.125 * k * (k + 1);
};
/** 落到史蒂夫头顶（1.8 格）以下的第一刻 */
export const 冰块命中刻 = (() => {
  let n = 冰块悬停刻;
  while (冰块高(n) > 1.8) n++;
  return n;
})();

export default 定义法术元({
  id: 'iceology',
  长秒: (冰块命中刻 + 40) / 20,
  命中秒: 冰块命中刻 / 20,
  // IceChunkSpell：ICE_CHUNK_SUMMON；IceChunk.tick：第 1 刻 IDLE、第 85 刻 DROP；onHit：HIT（音量 2）
  声音: [
    { 资产: '音效/诡厄巫法/goety.ice_chunk_summon', 秒: 0 },
    { 资产: '音效/诡厄巫法/goety.ice_chunk_idle', 秒: 1 / 20 },
    { 资产: '音效/诡厄巫法/goety.ice_chunk_drop', 秒: (冰块悬停刻 - 15) / 20 },
    { 资产: '音效/诡厄巫法/goety.ice_chunk_hit', 秒: 冰块命中刻 / 20, 音量: 2 },
  ],
});
