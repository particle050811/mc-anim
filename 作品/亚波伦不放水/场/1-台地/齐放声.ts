// 第 4 幕连放的声音（纯模块，段/4-齐放/段.ts 拿去 放()）。用户 11-11「放法术的音效你都得加上啊」：每一发都有起手声（法术/施放声.ts），
// 法术元里写的出手、飞行、命中的声音也跟上。一秒二三十发一起响要听成一阵阵压过来的轰炸、不糊成一团，做法同七版齐放（Agent 定的，用户没听过）：
// 1. 每一声落在它那一刻（起手声在离手那一帧，其余照法术元算，撕裂钟快的照比例提前）；画面切掉（齐放拍.ts 的 止）以后的、他死以后的不要；
// 2. 前后 并秒 秒里一共响 n 声，每声峰值 = 档峰 − 10·lg n（n 个不相干的声音叠起来约响 10·lg n 分贝），连成一片时总响度不往上堆；最低压到 最低；
// 3. 同一个文件好几发轮着用变体、速率错开 ±6%（变调），叠成一片不发相；同一个声音事件 同声隔 秒里只留一个（凋灵之首、魔力束这种 0.4 秒一发的连射，不然几声挤在一起相位抵消、发闷）；
// 4. 每一发后面的（飞行、命中、落地、持续的）最多 后续上限 个；爆炸、雷这几种重的不低于次档；11 个大招的起手声高 大招加 分贝，听得出大的来了。
// 索命劈下、结界在 段.ts 单独排，这里不重复。
import { castSounds } from '../../法术/施放声.ts';
import { castTable, bigCastIds, actStart, deathTime, spellSounds } from './齐放拍.ts';

export type MassCastSound = { 资产: string; 秒: number; 峰值: number; 名: string; 速率?: number };

/** 起手声、后面的：只有一声时的峰值（dBFS） */
const startPeakDb = -14;
const afterPeakDb = -16;
const bigCastLift = 4;
const followCap = 2;
const floorDb = -32;
const simulWindowSec = 0.12;
const sameSoundGap = 0.1;
/** 三个 Agent 统一的次档（段.ts 的 次） */
const secondTierDb = -18;
const heavySounds = ['entity.generic.explode', 'entity.lightning_bolt.thunder', 'entity.lightning_bolt.impact', 'goety.thunderbolt', 'entity.warden.sonic_boom', 'goety.soul_explode', 'goety.redstone_explode'];
/** 段.ts 单独排的；启示录的音效是私有的，公开构建打不进包 */
const isSolo = (id: string, asset: string) => id === 'killing' || asset.startsWith('音效/启示录/');

/** 资产 id 去掉目录和变体号：同一个声音事件 */
const eventName = (asset: string) => asset.slice(asset.lastIndexOf('/') + 1).replace(/\.\d+$/, '');
const toDecibel = (volume: number) => 20 * Math.log10(Math.min(1, volume));
const rates = [1, 0.94, 1.06, 0.97, 1.03];

type GrassSprite = { 资产: string; 秒: number; 名: string; bottom: number; 速率: number; 重: boolean };

export const massCastSounds = (): MassCastSound[] => {
  const grassFx: GrassSprite[] = [];
  const usedCount = new Map<string, number>();
  const roundRobin = (colList: readonly string[]) => {
    const focusKey = colList[0]!;
    const k = usedCount.get(focusKey) ?? 0;
    usedCount.set(focusKey, k + 1);
    return { 资产: colList[k % colList.length]!, 速率: rates[k % rates.length]! };
  };
  const countById = new Map<string, number>();
  for (const cast of castTable) {
    const offset = cast.秒 - actStart;
    if (offset >= deathTime) continue;
    const n = (countById.get(cast.id) ?? 0) + 1;
    countById.set(cast.id, n);
    if (cast.id !== 'killing') {
      const colList = castSounds[cast.id];
      if (!colList) throw new Error(`齐放：${cast.id} 没有施放声（法术/施放声.ts）`);
      grassFx.push({ ...roundRobin(colList), 秒: offset, 名: `施放-${cast.id}-${n}`, bottom: startPeakDb + (bigCastIds.includes(cast.id) ? bigCastLift : 0), 重: false });
    }
    let kept = 0;
    spellSounds(cast).forEach((x, k) => {
      if (isSolo(cast.id, x.资产) || kept >= followCap) return;
      kept++;
      grassFx.push({ 资产: x.资产, 秒: x.秒, 名: `${cast.id}-${n}-${k + 1}`, bottom: afterPeakDb + toDecibel(x.音量), 速率: x.音高, 重: heavySounds.includes(eventName(x.资产)) });
    });
  }
  grassFx.sort((a, b) => a.秒 - b.秒);
  // 同一个声音事件挨得太近的只留先到的
  const lastSeen = new Map<string, number>();
  const remainingGrass = grassFx.filter((x) => {
    const prevSec = lastSeen.get(eventName(x.资产));
    if (prevSec !== undefined && x.秒 - prevSec < sameSoundGap) return false;
    lastSeen.set(eventName(x.资产), x.秒);
    return true;
  });
  return remainingGrass.map((x) => {
    const n = remainingGrass.filter((y) => Math.abs(y.秒 - x.秒) <= simulWindowSec).length;
    const levelDb = Math.max(floorDb, x.bottom - 10 * Math.log10(n));
    const peakDb = Math.round((x.重 ? Math.max(levelDb, secondTierDb) : levelDb) * 10) / 10;
    return { 资产: x.资产, 秒: x.秒, 峰值: peakDb, 名: x.名, ...(x.速率 !== 1 ? { 速率: x.速率 } : {}) };
  });
};
