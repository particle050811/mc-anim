// 第 4 幕 71 个出手的声音（纯模块，段/4-齐放/段.ts 拿去 放()）。用户 11-11「然后还有那个音乐和放法术的音效你都得加上啊」：71 个都配上游戏里的施放声。
// 71 个一起响要听成一阵压过来的齐射、不糊成一团，做法是 Agent 定的，用户没听过：
// 1. 跟着画面按学派一波波来（齐放拍.ts 的 波序、波距：11 波 0.55 秒）：每个法术的施放声（法术/施放声.ts）和法术元里它出手当刻的声音，落在它离手那一帧；
// 2. 一波里同时响 n 个，每个的峰值 = 波峰 − 10·lg n（n 个不相干的声音叠起来约响 10·lg n 分贝），每波都差不多响；每波第一个施放声领头，高 领头加 分贝；
// 3. 同一个文件好几个法术同时用（prepare_spell 有 16 个），轮着用变体、速率错开 ±6%（变调），叠成一片不发相；
// 4. 后面的（飞行、命中、落地、持续的）只用法术元里写的：每个法术最多 后续上限 个、同一个声音隔 0.2 秒以上；被清场收掉以后的、结界收缩以后的不要；
//    峰值按前后 0.15 秒里一共几个往下压，同 2，爆炸、雷这几种重的不低于次档。
// 索命、冰川落下和砸中在 段.ts 单独排（打击停顿那几下），这里不重复。结界（炼狱）的施放声就是张盘那一声，也在 段.ts。
import { 施放声 } from '../../法术/施放声.ts';
import { 出手表, 幕起, 幕长, 拍, 法术声, 波号, 离手 } from './齐放拍.ts';

export type 齐放一声 = { 资产: string; 秒: number; 峰值: number; 名: string; 速率?: number };

/** 一整波叠起来大约的峰值（dBFS）、领头的高几分贝 */
const 波峰 = -13;
const 领头加 = 4;
/** 后面的：只有一个时的峰值、每个法术最多几个、最低压到多少 */
const 后峰 = -16;
const 后续上限 = 3;
const 最低 = -32;
/** 三个 Agent 统一的次档（段.ts 的 次） */
const 次档 = -18;
/** 出手后多少秒内算「出手当刻」，跟施放声一起按波算 */
const 当刻秒 = 0.1;
/** 重的（爆炸、雷、音爆）：后面的里不低于次档 */
const 重的 = ['entity.generic.explode', 'entity.lightning_bolt.thunder', 'entity.lightning_bolt.impact', 'goety.thunderbolt', 'entity.warden.sonic_boom', 'goety.soul_explode', 'goety.redstone_explode'];
/** 段.ts 单独排的：这些不在这里出；启示录的音效是私有的，公开构建打不进包（凋灵寂灭的光束声，施放声里已换成凋灵射击） */
const 单独排 = (id: string, 资产: string) => id === 'killing' || (id === 'iceology' && /ice_chunk_(drop|hit)$/.test(资产)) || 资产.startsWith('音效/启示录/');

/** 资产 id 去掉目录和变体号：同一个声音事件 */
const 事件名 = (资产: string) => 资产.slice(资产.lastIndexOf('/') + 1).replace(/\.\d+$/, '');
const 分贝 = (音量: number) => 20 * Math.log10(Math.min(1, 音量));
const 速率们 = [1, 0.94, 1.06, 0.97, 1.03];

type 草 = { 资产: string; 秒: number; 名: string; 音量: number; 速率: number; 波?: number; 领头?: boolean };

export const 齐放声们 = (): 齐放一声[] => {
  const 当刻: 草[] = [];
  const 后面: 草[] = [];
  const 用过 = new Map<string, number>();
  const 轮 = (列: readonly string[]) => {
    const 键 = 列[0]!;
    const k = 用过.get(键) ?? 0;
    用过.set(键, k + 1);
    return { 资产: 列[k % 列.length]!, 速率: 速率们[k % 速率们.length]! };
  };
  const 已领 = new Set<number>();
  for (const 发 of 出手表) {
    const 列 = 施放声[发.id];
    if (!列) throw new Error(`齐放：${发.id} 没有施放声（法术/施放声.ts）`);
    const 波 = 波号(发.id);
    const 离 = 离手(发.id) - 幕起;
    const 施 = 轮(列);
    当刻.push({ ...施, 秒: 离, 名: `施放-${发.id}`, 音量: 1, 波, 领头: !已领.has(波) });
    已领.add(波);
    const 止 = 发.止 === undefined ? Infinity : 发.止 - 幕起;
    const 出 = 发.秒 - 幕起;
    let 留 = 0;
    const 上次 = new Map<string, number>();
    法术声(发.id).forEach((x, k) => {
      if (单独排(发.id, x.资产) || x.秒 >= 止 || x.秒 >= 拍.收缩 || x.秒 >= 幕长) return;
      const 草: 草 = { 资产: x.资产, 秒: x.秒, 名: `${发.id}-${k + 1}`, 音量: x.音量, 速率: x.音高 };
      // 出手当刻的（大球推迟到全景里才放，它们的不算当刻、算后面的）跟施放声一起按波算
      if (出 === 离 && x.秒 - 出 <= 当刻秒) return void 当刻.push({ ...草, 波 });
      const 前 = 上次.get(事件名(x.资产));
      if (留 >= 后续上限 || (前 !== undefined && x.秒 - 前 < 0.2)) return;
      上次.set(事件名(x.资产), x.秒);
      留++;
      后面.push(草);
    });
  }
  const 每波几个 = new Map<number, number>();
  for (const x of 当刻) 每波几个.set(x.波!, (每波几个.get(x.波!) ?? 0) + 1);
  const 成 = (x: 草, 峰值: number): 齐放一声 => ({ 资产: x.资产, 秒: x.秒, 峰值: Math.round(峰值 * 10) / 10, 名: x.名, ...(x.速率 !== 1 ? { 速率: x.速率 } : {}) });
  return [
    ...当刻.map((x) => 成(x, 波峰 - 10 * Math.log10(每波几个.get(x.波!)!) + (x.领头 ? 领头加 : 0) + 分贝(x.音量))),
    ...后面.map((x) => {
      const n = 后面.filter((y) => Math.abs(y.秒 - x.秒) <= 0.15).length;
      const 压 = Math.max(最低, 后峰 - 10 * Math.log10(n) + 分贝(x.音量));
      return 成(x, 重的.includes(事件名(x.资产)) ? Math.max(压, 次档) : 压);
    }),
  ].sort((a, b) => a.秒 - b.秒);
};
