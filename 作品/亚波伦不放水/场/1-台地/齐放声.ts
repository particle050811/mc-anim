// 第 4 幕连放的声音（纯模块，段/4-齐放/段.ts 拿去 放()）。用户 11-11「放法术的音效你都得加上啊」：每一发都有起手声（法术/施放声.ts），
// 法术元里写的出手、飞行、命中的声音也跟上。一秒二三十发一起响要听成一阵阵压过来的轰炸、不糊成一团，做法同七版齐放（Agent 定的，用户没听过）：
// 1. 每一声落在它那一刻（起手声在离手那一帧，其余照法术元算，撕裂钟快的照比例提前）；画面切掉（齐放拍.ts 的 止）以后的、他死以后的不要；
// 2. 前后 并秒 秒里一共响 n 声，每声峰值 = 档峰 − 10·lg n（n 个不相干的声音叠起来约响 10·lg n 分贝），连成一片时总响度不往上堆；最低压到 最低；
// 3. 同一个文件好几发轮着用变体、速率错开 ±6%（变调），叠成一片不发相；同一个声音事件 同声隔 秒里只留一个（凋灵之首、魔力束这种 0.4 秒一发的连射，不然几声挤在一起相位抵消、发闷）；
// 4. 每一发后面的（飞行、命中、落地、持续的）最多 后续上限 个；爆炸、雷这几种重的不低于次档；11 个大招的起手声高 大招加 分贝，听得出大的来了。
// 索命劈下、结界在 段.ts 单独排，这里不重复。
import { 施放声 } from '../../法术/施放声.ts';
import { 出手表, 大招们, 幕起, 死, 法术声 } from './齐放拍.ts';

export type 齐放一声 = { 资产: string; 秒: number; 峰值: number; 名: string; 速率?: number };

/** 起手声、后面的：只有一声时的峰值（dBFS） */
const 起峰 = -14;
const 后峰 = -16;
const 大招加 = 4;
const 后续上限 = 2;
const 最低 = -32;
const 并秒 = 0.12;
const 同声隔 = 0.1;
/** 三个 Agent 统一的次档（段.ts 的 次） */
const 次档 = -18;
const 重的 = ['entity.generic.explode', 'entity.lightning_bolt.thunder', 'entity.lightning_bolt.impact', 'goety.thunderbolt', 'entity.warden.sonic_boom', 'goety.soul_explode', 'goety.redstone_explode'];
/** 段.ts 单独排的；启示录的音效是私有的，公开构建打不进包 */
const 单独排 = (id: string, 资产: string) => id === 'killing' || 资产.startsWith('音效/启示录/');

/** 资产 id 去掉目录和变体号：同一个声音事件 */
const 事件名 = (资产: string) => 资产.slice(资产.lastIndexOf('/') + 1).replace(/\.\d+$/, '');
const 分贝 = (音量: number) => 20 * Math.log10(Math.min(1, 音量));
const 速率们 = [1, 0.94, 1.06, 0.97, 1.03];

type 草 = { 资产: string; 秒: number; 名: string; 底: number; 速率: number; 重: boolean };

export const 齐放声们 = (): 齐放一声[] => {
  const 草们: 草[] = [];
  const 用过 = new Map<string, number>();
  const 轮 = (列: readonly string[]) => {
    const 键 = 列[0]!;
    const k = 用过.get(键) ?? 0;
    用过.set(键, k + 1);
    return { 资产: 列[k % 列.length]!, 速率: 速率们[k % 速率们.length]! };
  };
  const 第几 = new Map<string, number>();
  for (const 发 of 出手表) {
    const 离 = 发.秒 - 幕起;
    if (离 >= 死) continue;
    const n = (第几.get(发.id) ?? 0) + 1;
    第几.set(发.id, n);
    if (发.id !== 'killing') {
      const 列 = 施放声[发.id];
      if (!列) throw new Error(`齐放：${发.id} 没有施放声（法术/施放声.ts）`);
      草们.push({ ...轮(列), 秒: 离, 名: `施放-${发.id}-${n}`, 底: 起峰 + (大招们.includes(发.id) ? 大招加 : 0), 重: false });
    }
    let 留 = 0;
    法术声(发).forEach((x, k) => {
      if (单独排(发.id, x.资产) || 留 >= 后续上限) return;
      留++;
      草们.push({ 资产: x.资产, 秒: x.秒, 名: `${发.id}-${n}-${k + 1}`, 底: 后峰 + 分贝(x.音量), 速率: x.音高, 重: 重的.includes(事件名(x.资产)) });
    });
  }
  草们.sort((a, b) => a.秒 - b.秒);
  // 同一个声音事件挨得太近的只留先到的
  const 上次 = new Map<string, number>();
  const 留下 = 草们.filter((x) => {
    const 前 = 上次.get(事件名(x.资产));
    if (前 !== undefined && x.秒 - 前 < 同声隔) return false;
    上次.set(事件名(x.资产), x.秒);
    return true;
  });
  return 留下.map((x) => {
    const n = 留下.filter((y) => Math.abs(y.秒 - x.秒) <= 并秒).length;
    const 压 = Math.max(最低, x.底 - 10 * Math.log10(n));
    const 峰值 = Math.round((x.重 ? Math.max(压, 次档) : 压) * 10) / 10;
    return { 资产: x.资产, 秒: x.秒, 峰值, 名: x.名, ...(x.速率 !== 1 ? { 速率: x.速率 } : {}) };
  });
};
