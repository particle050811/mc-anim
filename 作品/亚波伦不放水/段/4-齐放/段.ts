// 第 4 幕 齐放：71 个连结界一次全放，他被钉住挥剑挨打、索命打倒图腾救回，结界收缩焚烧。窗口、声音 cue。纯模块。
// 声音（用户 11-11「为什么没有声音啊？那个法术不是有音效吗」）：时刻都从 场/1-台地/齐放拍.ts 取，不抄数。71 个一齐响就是一团噪，
// 挑有代表性的错开放：她蓄、放各一下，十来个出手声，几下打到他身上的（炸、冰碎、雷），索命、图腾、冰川砸中，他每次挨打、挥剑，结界的火。
// 响度两档（三个 Agent 统一，用户没听过）：主要的峰值 −10 dBFS、次要的 −18 dBFS；结界的火是环境，−28 LUFS，收缩焚烧时推到 −20 LUFS。配乐在场时间线上（−22 LUFS）。
// 挑哪几个、哪个算主要都是 Agent 取的，用户没听过。
import { 窗口段 } from '@engine/段/窗口段.ts';
import { 真下界包 } from '../../地点/真下界位置.ts';
import 线 from '../../场/1-台地/时间线.ts';
import { 停冰砸, 冲们, 图腾秒, 幕起, 幕长, 拍, 挥剑世界们, 挨打世界们, 法术声, 焚伤们 } from '../../场/1-台地/齐放拍.ts';
import 声音表 from './声音表.生成.ts';

const 主 = -10;
const 次 = -18;
/** 这一发里资产 id 以 尾 结尾的那一声：资产 id、几秒（幕内秒 = 段内秒：本段从 开盘完 起，正是本幕开头） */
const 声 = (id: string, 尾: string): { 资产: string; 秒: number } => {
  const x = 法术声(id).find((y) => y.资产.endsWith(`/${尾}`));
  if (!x) throw new Error(`齐放：${id} 没有「${尾}」声`);
  return x;
};
const 声秒 = (id: string, 尾: string) => 声(id, 尾).秒;
/** 一个事件有几个文件的，轮着用 */
const 轮 = (前: string, n: number, i: number) => `${前}.${(i % n) + 1}`;
/** 出手声：错开放的十来个（各自游戏里出手那一刻；71 个在 0.4 秒里依次离手） */
const 出手们: readonly [法术: string, 声: string][] = [
  ['sonic_boom', 'entity.warden.sonic_boom.1'],
  ['whirlwind', 'goety.wind.1'],
  ['fireball', 'entity.blaze.shoot'],
  ['electrocute', 'goety.shock_cast.1'],
  ['wither_skull', 'entity.wither.shoot'],
  ['teeth', 'entity.evoker.cast_spell.1'],
  ['sword', 'entity.drowned.shoot.1'],
  ['wind_blast', 'goety.wind_blast.1'],
  ['ice_spike', 'goety.ice_spike_cast'],
  ['lavaball', 'entity.ghast.shoot'],
];
/** 打到他（或在他身边炸开）的几下：冰刺碎、玄武岩碎、凋灵之首炸（主要）、雷击、熔岩弹炸、电涌的雷 */
const 打到们: readonly [法术: string, 声: string, 峰: number][] = [
  ['ice_spike', 'goety.ice_spike_hit.1', 次],
  ['smack_stone', 'block.basalt.break.1', 次],
  ['wither_skull', 'entity.generic.explode.1', 主],
  ['electrocute', 'goety.thunderbolt.1', 次],
  ['lavaball', 'entity.generic.explode.1', 次],
  ['surging', 'goety.thunderbolt.1', 次],
];

export default 窗口段(线, {
  起: '开盘完',
  止: '齐放完',
  地形: [真下界包],
  声音表,
  声音: ({ 放, 秒 }) => {
    if (Math.abs(秒 - 幕长) > 1 / 60) throw new Error(`齐放段长 ${秒} 秒和 齐放拍.ts 的幕长 ${幕长} 对不上`);
    return [
      // 她：举杖蓄势、一挥 71 个离手；收缩那一挥
      放('音效/诡厄巫法/goety.apostle_prepare_spell.1', 拍.蓄, { 峰值: 次, 名: '蓄势' }),
      放('音效/诡厄巫法/goety.apostle_cast_spell.1', 拍.放, { 峰值: 主, 名: '齐放' }),
      放('音效/诡厄巫法/goety.apostle_cast_spell.2', 拍.收缩, { 峰值: 主, 名: '收缩' }),
      // 她每一下冲：一声破风
      ...冲们.map((c, i) => 放(轮('音效/诡厄巫法/goety.heavy_woosh', 5, i), c.起, { 峰值: 次, 名: `冲${i + 1}` })),
      ...出手们.map(([id, 尾]) => 放(声(id, 尾).资产, 声秒(id, 尾), { 峰值: 次, 名: `出手-${id}` })),
      // 冲击波、炎爆、释放三个大球（切进全景后在她身边炸开）：炎爆的炸主要，另两个次要
      放('音效/诡厄巫法/goety.soul_explode.1', 声秒('shockwave', 'goety.soul_explode.1'), { 峰值: 次, 名: '大球-冲击波' }),
      放('音效/entity.generic.explode.1', 声秒('fire_blast', 'entity.generic.explode.1'), { 峰值: 主, 名: '大球-炎爆' }),
      放('音效/诡厄巫法/goety.redstone_explode.1', 声秒('discharge', 'goety.redstone_explode.1'), { 峰值: 次, 名: '大球-释放' }),
      // 闪电劈到他：雷（主要）
      放('音效/entity.lightning_bolt.thunder.1', 声秒('lightning', 'entity.lightning_bolt.thunder.1'), { 峰值: 主, 名: '闪电-雷' }),
      放('音效/entity.lightning_bolt.impact.1', 声秒('lightning', 'entity.lightning_bolt.impact.1'), { 峰值: 次, 名: '闪电-劈' }),
      ...打到们.map(([id, 尾, 峰]) => 放(声(id, 尾).资产, 声秒(id, 尾), { 峰值: 峰, 名: `打到-${id}` })),
      // 索命劈中（打击停顿 16 帧的开头）：雷霆、闪电劈，游戏里两个一起响
      放('音效/诡厄巫法/goety.thunderbolt.1', 声秒('killing', 'goety.thunderbolt.1'), { 峰值: 主, 名: '索命' }),
      放('音效/entity.lightning_bolt.impact.1', 声秒('killing', 'entity.lightning_bolt.impact.1'), { 峰值: 主, 名: '索命-劈' }),
      放('音效/item.totem.use', 图腾秒 - 幕起, { 峰值: 主, 名: '图腾' }),
      // 冰川：落下前那一声、砸中（打击停顿 10 帧的开头）冰块碎
      放('音效/诡厄巫法/goety.ice_chunk_drop', 声秒('iceology', 'goety.ice_chunk_drop'), { 峰值: 次, 名: '冰川-落' }),
      放('音效/诡厄巫法/goety.ice_chunk_hit', 停冰砸.起, { 峰值: 主, 名: '冰川-砸中' }),
      放('音效/block.glass.break.1', 停冰砸.起, { 峰值: 次, 名: '冰川-碎' }),
      // 他：挨打（同一秒里挨几下只响一下，同变红）、挥剑、在火里挨烧
      ...挨打世界们.map((h, i) => 放(轮('音效/entity.player.hurt', 3, i), h.秒, { 峰值: 主, 名: `挨打${i + 1}` })),
      ...挥剑世界们.map((c, i) => 放(轮('音效/entity.player.attack.sweep', 7, i), c, { 峰值: 次, 名: `挥剑${i + 1}` })),
      ...焚伤们.map((x, i) => 放(轮('音效/entity.player.hurt_on_fire', 3, i), x, { 峰值: 主, 名: `焚伤${i + 1}` })),
      // 结界：罩严后人在火里，原版每刻烧人响 block.fire.ambient；平时垫底，收缩焚烧时推上来
      放('音效/block.fire.ambient', 拍.罩严, { 响度: -28, 循环: true, 长秒: 拍.收缩 - 拍.罩严, 名: '结界火' }),
      放('音效/block.fire.ambient', 拍.收缩, { 响度: -20, 循环: true, 名: '焚烧火' }),
    ];
  },
});
