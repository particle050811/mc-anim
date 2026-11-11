// 第 4 幕（轰炸）的纯计算部分：幕内时刻、她怎么飞、连放的出手表和几时打到他、他几时挨打挥剑、几时死。段.ts 排声音也引，所以不引模型、贴图、React；
// 要杖尖的（她的姿势、盘、结界从哪扔出去）在 编排-齐放.ts。
// 用户 11-11 看了七版：「这个画面未必要按时间推进」「侧视角看着亚伯伦放一堆法术 并且每个法术是一直放 不是只放一次」「在以史蒂夫第一人称视角看到一堆法术，
// 并且晋升之环像不死图腾一样炸开」「史蒂夫应该是在被狂轰滥炸 然后在短短几秒内就死去 而不是法术烧完后死掉」「大招要落到他身上」。
// 所以本幕不再是张盘、一齐出手、等着一个个打到、结界收缩焚烧：第 2 幕末盘已张开，开幕她就按住不放地连放，两镜（侧面看她放、他第一人称挨砸到死；
// 用户 11-11 看八版「第一人称镜头直到死亡，一镜到底不就好了，加个侧写镜头干嘛？」，八版第一人称后面那一镜「挨炸」删了），
// 他被晋升之环救一次以后几秒就死，死在幕末。用户 11-11 看八版又说「法术的速度以及事发频率是不是有点慢」「聚晶是默认满附魔聚晶 高速附魔 增加法术飞行，
// 并且晋升之环有 4 倍施法速度」：连放的间隔、弹速照游戏里戴晋升之环、拿满附魔聚晶的玩家按住右键连放算（见下面 连放表）。
// 连放挑哪些、两镜多长、她怎么飞是 Agent 取的，用户没看过。
import { clamp01, smoothstep01 as 平滑 } from '@engine/core/数学.ts';
import type { V3 } from '@engine/model/parts.tsx';
import { 现身位置 } from '../../特效/安息仪式时序.ts';
import { 法术声音时刻, 法术时长, type 法术选项 } from '../../法术/演出/接口.ts';
import { 取法术元 } from '../../法术/演出/元表.ts';
import { 发目标, 发起点, type 一发, type 场况 } from './出手表.ts';
import { 史蒂夫受困位, 祭坛 } from './布局.ts';
import { 慢放多出, 第二幕末盘刻 as 开盘末盘刻 } from './开盘拍.ts';
import 线 from './时间线.ts';

const 事 = 线.事件;
/** 编排的钟是「现身后几秒」的世界秒（编排-开盘.ts 的 现身后；那个模块引了模型，这里不能引）：第 2 幕慢放过，从第 2 幕末起比片上慢 慢放多出 秒 */
const 现身后 = (场秒: number) => 场秒 - 事.现身.秒 - 慢放多出;
/** 本幕开头（编排的钟）= 第 2 幕末（编排-开盘.ts 的 幕末，编排-齐放.ts 载入时核对） */
export const 幕起 = 现身后(事.开盘完.秒);
export const 幕长 = 事.齐放完.秒 - 事.开盘完.秒;
export const 秒在 = (s: number) => 幕起 + s;
const 加 = (a: readonly number[], b: readonly number[], k = 1): V3 => [a[0]! + b[0]! * k, a[1]! + b[1]! * k, a[2]! + b[2]! * k];

// ── 第 2 幕末的样子（本幕的初始状态）：位置、高度、盘转到第几刻都取第 2 幕的末态（开盘拍.ts、编排-开盘.ts 的 第二幕末），编排-齐放.ts 载入时核对 ──
/** 第 2 幕末她悬停的高度（脚底离祭坛那层地面）= 编排-开盘.ts 的 悬停高；编排-齐放.ts 载入时核对两边一样 */
const 第二幕末高 = 12;
/** 第 2 幕末盘已经张满、杖尖的盘转了几刻（多圈轮盘参数 的 刻；三圈弹完是 7.5 刻） */
export const 第二幕末盘刻 = 开盘末盘刻;
/** 原版玩家眼高 1.62（库/角色/史蒂夫.tsx 的 steveSize 在原版缩放下就是它）；编排-齐放.ts 载入时核对 */
export const 眼高 = 1.62;
/** 史蒂夫被钉住的地方（脚底）：第 2 幕退到的受困位 */
export const 史蒂夫脚: V3 = 史蒂夫受困位;
export const 史蒂夫眼: V3 = 加(史蒂夫脚, [0, 0, 眼高]);
/** 结界中心：史蒂夫半身高（原版结界中心也在半身高） */
export const 结界心: V3 = 加(史蒂夫脚, [0, 0, 0.9]);
/** 她第 2 幕末悬停的地方（祭坛上空 12 格），转过身来杖指着他 */
export const 起位: V3 = [祭坛[0] + 现身位置[0], 祭坛[1] + 现身位置[1], 祭坛[2] + 第二幕末高];

/** 开幕杖往前一顶 5 帧（线性），顶到头那一帧第一轮离手；战斗曲 27.0 秒砸在这一刻（时间线.ts 的 齐放出手） */
export const 出手起 = 5 / 60;
/** 他死（幕内秒）：幕末那一刻，接第 5 幕的死亡界面。致命的是卫射第五发结算（11 个大招都打到他以后头一发；下面核对） */
export const 死 = 幕长;
/** 两镜的切点（幕内秒）：侧面看她放、他第一人称一直到死。第一人称切进来 0.4 秒索命劈中、晋升之环炸开（图腾的屏幕动画 2 秒，全在这一镜里）。Agent 取的 */
export const 镜起 = { 侧: 0, 第一人称: 1.8 } as const;
if (Math.abs(事.齐放出手.秒 - 事.开盘完.秒 - 出手起) > 1e-6) throw new Error(`场/1-台地/时间线.ts 的 齐放出手 要在 开盘完 后 出手起 = ${出手起} 秒`);

/** 一下冲走过的比例（0～1）：速度是梯形，前 起比 加到全速、后 刹比 刹到 0，中间全速。峰值速度 = 平均速度 ÷ (1 − 起比/2 − 刹比/2)。第 5 幕也用 */
export const 冲进度 = (u: number, 起比: number, 刹比: number): number => {
  const x = clamp01(u);
  const 面 = 1 - 起比 / 2 - 刹比 / 2;
  if (x < 起比) return (x * x) / (2 * 起比) / 面;
  if (x < 1 - 刹比) return (起比 / 2 + (x - 起比)) / 面;
  const 余 = 1 - x;
  return (起比 / 2 + (1 - 刹比 - 起比) + (刹比 / 2 - (余 * 余) / (2 * 刹比))) / 面;
};

// ── 连放：每个法术像玩家按住右键不放那样一发接一发，隔多久照游戏里戴晋升之环、拿满附魔聚晶的玩家在单人存档里连放（Goety 2.5.60.6 SpellConfig 的默认施法刻、
//    冷却刻，RevelationFix 4.9 的晋升之环，反编译读的）：
//    - 晋升之环施法刻 ÷ 4 取整（EventUtil.castDuration，配置 haloSpellCastingSpeed = 4；雷暴、星辉自己重写了 castDuration，不吃）；
//      冷却单人存档里约 ÷ 4（FocusCooldownMixin 每刻多减 1，再加客户端 EventUtil.spellCooldown 减半）；
//    - 按住右键 4 刻试一次（Minecraft.startUseItem 的 rightClickDelay），瞬发的间隔 = 冷却对齐到 4 刻，最短 4 刻；蓄力的 = 施法刻 + 冷却（对齐误差 0～3 刻没算）；
//    - 聚晶的附魔不改施法和冷却（只有雷暴的持久附魔把施法从 60 拉到 240 刻），高速（Velocity，满级 5）只加弹速，见 满附魔。
//    游戏里亚波伦本人不用魔杖聚晶（Apostle 拿弓、用自己的 Goal 放），晋升之环也只认玩家（ATAHelper.hasHalo）：片里是「她像玩家一样放」，用户 11-11 定的说法。
//    挑的是 11 个大招（用户点名的）、索命（救他那一次的致命一击，七版用户看过）、结界，加 15 个打到他身上的弹和击：每个学派都有，
//    以她为心的环和球（冲击波、炎爆、释放这些，七版贴着她炸开整屏白）、地上的阵、召唤、光束吐息大多没挑。结界只扔一次（用户 11-10 定和第一轮一起扔）。
//    挑哪些是 Agent 取的，用户没看过 ──
/** 满附魔聚晶：高速 5 级（聚晶不接高速的法术不读它）。用户 11-11「亚伯伦的聚晶是默认满附魔聚晶 高速附魔 增加法术飞行」 */
const 满附魔: 法术选项 = { 高速: 5 };
/** 法术、两发隔几刻（单人存档戴晋升之环）、是不是大招、这一发的演出选项（施法刻：演出里画了蓄力的，照晋升之环缩过的） */
export const 连放表: readonly { id: string; 周期刻: number; 大招?: true; 选项?: 法术选项 }[] = [
  // 卫射排第一个（开幕那一刻起蓄）：蓄 80 ÷ 4 = 20 刻、冷却 20 ÷ 4 = 5 刻；第五发照满结算的那一下打死他（幕末），见下面 死
  { id: 'prisma_beam', 周期刻: 25, 大招: true, 选项: { 施法刻: 20 } },
  // 星辉不吃晋升之环（VoidShockSpell 重写了 castDuration）：蓄 35、冷却 100 ÷ 4
  { id: 'stellar', 周期刻: 60, 大招: true },
  // 撕裂：蓄 120 ÷ 4 = 30 刻（蓄到 25 刻撕开），冷却 6000 ÷ 4，一幕只放一发
  { id: 'rupture', 周期刻: 1530, 大招: true, 选项: { 施法刻: 30 } },
  { id: 'blossoming', 周期刻: 60, 大招: true },
  { id: 'eruption', 周期刻: 40, 大招: true },
  { id: 'void_flash', 周期刻: 71, 大招: true },
  // 雷暴不吃晋升之环，持久 III 引导 240 刻、冷却 300 ÷ 4；一幕只放一发。地上的预警圈不画（用户 11-11「雷暴预警圈全部删掉」）
  { id: 'thunderstorm', 周期刻: 315, 大招: true, 选项: { 无预警圈: true } },
  // 凋灵之首瞬发、冷却 0：卡在按住右键的 4 刻一发
  { id: 'wither_skull', 周期刻: 4, 大招: true },
  { id: 'teeth', 周期刻: 20, 大招: true },
  { id: 'ice_storm', 周期刻: 35, 大招: true },
  { id: 'cyclone', 周期刻: 76, 大招: true },
  // 索命蓄 15、冷却 50：游戏里 65 刻后还能再劈一下，片里只劈这一下（晋升之环救他那一次；再劈就是它打死他了）
  { id: 'killing', 周期刻: 65 },
  { id: 'fireball', 周期刻: 4 },
  { id: 'lavaball', 周期刻: 10 },
  { id: 'ice_spike', 周期刻: 8 },
  { id: 'hail', 周期刻: 35 },
  { id: 'soul_bolt', 周期刻: 8 },
  { id: 'magic_bolt', 周期刻: 8 },
  { id: 'sonic_boom', 周期刻: 25 },
  { id: 'sword', 周期刻: 8 },
  { id: 'razor_wind', 周期刻: 16 },
  { id: 'poison_dart', 周期刻: 8 },
  { id: 'electrocute', 周期刻: 12 },
  { id: 'lightning', 周期刻: 28 },
  { id: 'smack_stone', 周期刻: 12 },
  { id: 'earth_punch', 周期刻: 16 },
  { id: 'tidal', 周期刻: 20 },
];
export const 大招们 = 连放表.filter((x) => x.大招).map((x) => x.id);
/** 两发之间隔几秒 */
export const 隔 = (id: string): number => {
  const 项 = 连放表.find((x) => x.id === id);
  if (!项) throw new Error(`齐放：${id} 不在连放表里`);
  return 项.周期刻 / 20;
};
/** 第一发：开幕那一轮在 出手起 起 8 帧里按表的先后错开 0～8 帧（同一帧挂上几十个法术，第一帧编译材质的时间会叠在一帧里）。
 *  蓄力的法术当它们第 2 幕张盘时就蓄上了，开幕这一顶离手（卫射、撕裂的演出带着蓄力，从这一刻起蓄） */
const 首发 = (i: number) => 出手起 + ((i % 5) * 2) / 60;
/** 索命劈中（幕内秒）：第一人称切进来 0.4 秒。Agent 取的 */
export const 索命秒 = 镜起.第一人称 + 0.4;
/** 他身上还没打到的、打到以后的余波演多久（秒）：连放的小法术打到以后 余秒 硬切掉，一发发不堆满结界（大招不切） */
const 余秒 = 0.8;
/** 结界从杖尖飞到他身上罩严几秒（七版的快慢）；罩严（幕内秒）起钉住他、每刻烧他 */
export const 结界飞出秒 = 0.75;
export const 罩严秒 = 出手起 + 结界飞出秒;

// ── 她怎么飞：开幕悬在起位，连放不停手地一下下冲（快的那几下 20～30 格/秒，2～3 帧到全速、到位前急刹），两下之间慢慢漂，
//    最后一下从他头顶斜着冲到他跟前上方，刹住、慢慢漂到七版 5-03 开头她在的地方（第 5 幕一开始就是那一镜）。
//    角度、离他多远、多高（他脚底起）都绕着他量；冲法、时刻都是 Agent 取的 ──
type 一关 = { 秒: number; 角: number; 径: number; 高: number; 到法: '漂' | '冲' | '直冲' };
/** 七版 5-03 开头她的脚底（七版 击败拍.ts 的 亚波伦位 在第 5 幕 5.3 秒），第 5 幕照七版原样，所以本幕末停在这里。击败拍.ts 载入时核对 */
export const 第五幕起位: V3 = [907.1770742442654, 288.66251327801626, 54.51164537941398];
const 极 = (p: readonly number[]) => ({
  角: (Math.atan2(p[1]! - 史蒂夫脚[1], p[0]! - 史蒂夫脚[0]) * 180) / Math.PI,
  径: Math.hypot(p[0]! - 史蒂夫脚[0], p[1]! - 史蒂夫脚[1]),
  高: p[2]! - 史蒂夫脚[2],
});
const 起极 = 极(起位);
const 末极 = 极(第五幕起位);
/** 关键位置：从起位起，角度一路往大走（从上往下看逆时针）绕到他另一侧。
 *  第一下（侧面那一镜里）往后下方拉开：在侧面画面里是斜着往下走；第二下（第一人称里，晋升之环翻完之前）绕着他横着冲 55 度，他眼里她从画面一侧冲到另一侧；
 *  第三下（八版在「挨炸」那一镜，现在还在第一人称里）直着冲到他跟前上方。三下的时刻同八版 */
export const 她关们: readonly 一关[] = [
  { 秒: 0, ...起极, 到法: '漂' },
  { 秒: 1.25, 角: 起极.角 + 1.5, 径: 起极.径 + 0.3, 高: 12.3, 到法: '漂' },
  { 秒: 1.55, 角: 起极.角 + 6, 径: 13, 高: 7.5, 到法: '冲' },
  { 秒: 3.4, 角: 起极.角 + 10, 径: 13.3, 高: 8, 到法: '漂' },
  { 秒: 3.95, 角: 起极.角 + 64, 径: 10, 高: 8.6, 到法: '冲' },
  { 秒: 4.95, 角: 起极.角 + 70, 径: 9.4, 高: 8.2, 到法: '漂' },
  { 秒: 5.4, 角: 末极.角 + 4, 径: 末极.径 + 0.25, 高: 末极.高 + 0.15, 到法: '直冲' },
  { 秒: 幕长, ...末极, 到法: '漂' },
];
if (Math.abs(她关们[她关们.length - 1]!.秒 - 幕长) > 1e-9) throw new Error('齐放：她关们 最后一关要在幕末');
const 关点 = (k: { 角: number; 径: number; 高: number }): V3 => {
  const a = (k.角 * Math.PI) / 180;
  return [史蒂夫脚[0] + k.径 * Math.cos(a), 史蒂夫脚[1] + k.径 * Math.sin(a), 史蒂夫脚[2] + k.高];
};
/** 冲：头 0.04 秒加到全速、后 30% 急刹 */
const 冲起秒 = 0.04;
const 冲刹比 = 0.3;

// ── 打击停顿（照 Linker 打戏知识库 animation.md 第 7 节：局部时间，攻防两方定在接触那一刻，别的照走）：只停索命劈中那一下（重，16 帧；七版用户看过）。
//    她、他、索命的电弧定住；镜头、结界、别的法术、盘、图腾的屏幕动画照走 ──
export type 一停 = { 起: number; 秒: number };
export const 停索命: 一停 = { 起: 索命秒, 秒: 16 / 60 };
/** 世界钟（幕内秒）→ 这些停顿下的局部钟：停着的那几帧不走 */
export const 局部钟 = (停们: readonly 一停[]) => (s: number) => 停们.reduce((x, p) => x - Math.min(Math.max(s - p.起, 0), p.秒), s);
/** 局部钟 → 世界钟（落在停顿那一刻的给停顿开头） */
export const 回世界 = (停们: readonly 一停[]) => {
  const 排 = [...停们].sort((a, b) => a.起 - b.起);
  return (x: number) => 排.reduce((s, p) => (s > p.起 + 1e-9 ? s + p.秒 : s), x);
};
export const 她钟 = 局部钟([停索命]);
export const 他钟 = 局部钟([停索命]);
export const 他回世界 = 回世界([停索命]);
const 本关们 = 她关们.map((k) => ({ ...k, 秒: 她钟(k.秒) }));

/** 她在局部钟 τ（幕内秒）的脚底 */
export const 亚波伦本位 = (τ: number): V3 => {
  const s = Math.min(Math.max(τ, 0), 本关们[本关们.length - 1]!.秒);
  let i = 1;
  while (i < 本关们.length - 1 && s > 本关们[i]!.秒) i++;
  const [a, b] = [本关们[i - 1]!, 本关们[i]!];
  const u = (s - a.秒) / (b.秒 - a.秒);
  if (b.到法 === '直冲') {
    const [p, q] = [关点(a), 关点(b)];
    return 加(p, [q[0] - p[0], q[1] - p[1], q[2] - p[2]], 冲进度(u, 冲起秒 / (b.秒 - a.秒), 冲刹比));
  }
  const k = b.到法 === '冲' ? 冲进度(u, 冲起秒 / (b.秒 - a.秒), 冲刹比) : 平滑(u);
  return 关点({ 角: a.角 + (b.角 - a.角) * k, 径: a.径 + (b.径 - a.径) * k, 高: a.高 + (b.高 - a.高) * k });
};
export const 亚波伦位 = (t: number): V3 => 亚波伦本位(她钟(t - 幕起));
/** 她的每一下冲（幕内秒，世界钟）：起、止。测试量峰值、声音挂破风 */
export const 冲们: readonly { 起: number; 止: number }[] = 她关们.flatMap((k, i) => (k.到法 === '漂' ? [] : [{ 起: 她关们[i - 1]!.秒, 止: k.秒 }]));
if (Math.hypot(...亚波伦位(秒在(幕长)).map((x, i) => x - 第五幕起位[i]!)) > 1e-6) throw new Error('齐放：她幕末没停在 第五幕起位');

/** 从 p 到史蒂夫的水平单位向量 */
export const 朝史蒂夫 = (p: readonly number[]): V3 => {
  const 长 = Math.hypot(史蒂夫脚[0] - p[0]!, 史蒂夫脚[1] - p[1]!) || 1;
  return [(史蒂夫脚[0] - p[0]!) / 长, (史蒂夫脚[1] - p[1]!) / 长, 0];
};
/** 杖尖的近似（这里没有模型）：右肩高 1.4 格、往他眼睛那边伸 1.6 格。只给 命中、挨打、挥剑、声音算时刻用；画面里法术从真杖尖出（编排-齐放.ts 的 况） */
export const 近似杖尖 = (t: number): V3 => {
  const 肩 = 加(亚波伦位(t), [0, 0, 1.4]);
  const d = [史蒂夫眼[0] - 肩[0], 史蒂夫眼[1] - 肩[1], 史蒂夫眼[2] - 肩[2]];
  const 长 = Math.hypot(d[0]!, d[1]!, d[2]!) || 1;
  return 加(肩, d, 1.6 / 长);
};
export const 近似况: 场况 = { 杖尖: 近似杖尖, 史蒂夫脚: () => 史蒂夫脚 };

// ── 出手表 ──
/** 一发连同它几时打到他（编排的钟；没有命中一说的 undefined） */
type 排一发 = 一发 & { 命?: number };
const 命中在 = (发: 一发): number | undefined => {
  const 命 = 法术时长(取法术元(发.id), 发起点(发, 近似况), 发目标(发, 近似况), 发.选项).命中秒;
  return 命 === undefined ? undefined : 发.秒 + 命;
};
const 排好: readonly 排一发[] = 连放表.flatMap((项, i) => {
  const 首 = 项.id === 'killing' ? 索命秒 : 首发(i);
  const n = 项.id === 'killing' ? 1 : Math.ceil((死 - 首) / 隔(项.id) - 1e-9);
  const 选项 = { ...满附魔, ...项.选项 };
  return Array.from({ length: n }, (_, k): 排一发 => {
    const 底: 一发 = { id: 项.id, 秒: 秒在(首 + k * 隔(项.id)), 种子: 101 + i * 37 + k * 7, 选项 };
    const 命 = 命中在(底);
    // 连放的小法术打到以后只留一小段余波；没有命中一说的（闪电、音爆这种当刻就到的）按出手算
    const 止 = 项.大招 || 项.id === 'killing' ? {} : { 止: Math.max(底.秒, 命 ?? 底.秒) + 余秒 };
    return { ...底, ...止, ...(命 !== undefined ? { 命 } : {}) };
  });
});
// 索命自己跟她一起停 16 帧（劈下来的电弧定住）
const 发钟 = (停: 一停) => (t: number) => 秒在(局部钟([停])(t - 幕起));
/** 画的全部（编排-齐放.ts 给跟杖的接上真杖尖） */
export const 出手表: readonly 一发[] = 排好.map(({ 命: _命, ...发 }) => (发.id === 'killing' ? { ...发, 钟: 发钟(停索命) } : 发));
/** 出手表 每一发几时打到他（编排的钟，和 出手表 一一对应；没有命中一说的 undefined）：画面按镜头清场用 */
export const 出手命中: readonly (number | undefined)[] = 排好.map((x) => x.命);
/** 持续施法的光束：起点每帧跟着杖尖（她在飞） */
export const 跟杖的 = ['prisma_beam'];
/** 打得重的：大招里除了凋灵之首（它冷却 0、一直在连射，算轻的），加索命 */
const 重的 = [...大招们.filter((id) => id !== 'wither_skull'), 'killing'];
/** 打到他的每一发（幕内秒，世界钟），他死之前的 */
export const 命中们: readonly { 秒: number; id: string; 重: boolean }[] = 排好
  .filter((发) => 发.命 !== undefined && 发.命 - 幕起 < 死 - 1e-6)
  .map((发) => ({ 秒: 发.命! - 幕起, id: 发.id, 重: 重的.includes(发.id) }))
  .sort((a, b) => a.秒 - b.秒);
/** 11 个大招各自第一下打到他的时刻（幕内秒）：都要在他死之前（用户 11-11「大招要落到他身上」） */
export const 大招落 = Object.fromEntries(大招们.map((id) => [id, 命中们.find((h) => h.id === id)?.秒])) as Record<string, number | undefined>;
for (const [id, 秒] of Object.entries(大招落)) if (秒 === undefined) throw new Error(`齐放：大招 ${id} 在他死之前没打到他（齐放拍.ts 的 连放表）`);
/** 致命那一下：11 个大招都打到他以后，卫射头一发照满结算。卫射照游戏是间接魔法伤害（PrismaBeamSpell 用 DamageSources.indirectMagic），死亡消息照它（编排-击败.ts） */
const 齐了 = Math.max(...Object.values(大招落).map((x) => x!));
const 致命 = 排好.find((发) => 发.id === 'prisma_beam' && 发.命 !== undefined && 发.命 - 幕起 >= 齐了 - 1e-9);
if (!致命?.命 || Math.abs(致命.命 - 秒在(死)) > 1e-6)
  throw new Error(`齐放：大招 ${齐了.toFixed(3)} 秒都打到了，之后头一发卫射 ${致命?.命 === undefined ? '没有' : (致命.命 - 幕起).toFixed(3)} 秒结算，他死在 ${死} 秒（时间线.ts 的 第四幕长）`);
/** 晋升之环炸开（编排的钟，世界钟）：索命劈中那一刻（原版 checkTotemDeathProtection 和致命那一下同一刻） */
export const 图腾秒 = 秒在(索命秒);
if (索命秒 < 镜起.第一人称 + 0.2 || 索命秒 > 镜起.第一人称 + 0.8) throw new Error(`齐放：索命 ${索命秒} 秒劈中，要在第一人称那一镜（${镜起.第一人称} 秒切进来）开头 0.2～0.8 秒里`);
/** 这一发游戏里在几时响什么（幕内秒，世界钟）：齐放声.ts 排声音用。法术元的 声音 照出手、命中算；画面切掉（止）以后、他死以后的不要 */
export const 法术声 = (发: 一发): { 资产: string; 秒: number; 音量: number; 音高: number }[] => {
  const 止 = Math.min(发.止 ?? Infinity, 秒在(死));
  return 法术声音时刻(取法术元(发.id), 发起点(发, 近似况), 发目标(发, 近似况), 发.选项)
    .map((x) => ({ ...x, 秒: 发.秒 + x.秒 }))
    .filter((x) => x.秒 < 止)
    .map((x) => ({ ...x, 秒: x.秒 - 幕起 }));
};

// ── 史蒂夫几时挨打、挥剑（时刻按 近似杖尖 算；他怎么动在 编排-齐放.ts 的 史蒂夫状态在） ──
/** 挨打（他的局部钟）：第三人称里他身子的反应和受伤声，最多 0.5 秒一下（原版 LivingEntity.hurt 无敌帧前 10 刻里再挨只补更大的那部分血、不重放受伤动画）；
 *  大招打到的算重的（后仰大、腿软）。结界每刻烧他不算在这里（八版就是这样，声音没改）；第一人称的视角晃动照原版另算，见 受伤们 */
export const 挨打们: readonly { 秒: number; 重: boolean }[] = 命中们.reduce<{ 秒: number; 重: boolean }[]>((出, h) => {
  const s = 他钟(h.秒);
  const 前 = 出[出.length - 1];
  if (前 && s - 前.秒 < 0.5) {
    if (h.重) 前.重 = true;
    return 出;
  }
  return [...出, { 秒: s, 重: h.重 }];
}, []);
/** 挥剑（他的局部钟）：赶在弹到之前 0.1 秒劈，两下至少隔 0.45 秒（断曜流光照剑的攻速 1.6，12.5 刻一满）；死前 0.15 秒起不挥 */
export const 挥剑们: readonly number[] = 命中们.reduce<number[]>((出, h) => {
  const c = Math.round((他钟(h.秒) - 0.1) * 20) / 20;
  return c >= 0.3 && c < 他钟(死) - 0.15 && (!出.length || c - 出[出.length - 1]! >= 0.45) ? [...出, c] : 出;
}, []);
/** 声音用的世界钟（幕内秒）：挨打、挥剑 */
export const 挨打世界们 = 挨打们.map((h) => ({ ...h, 秒: 他回世界(h.秒) }));
export const 挥剑世界们 = 挥剑们.map(他回世界);

// ── 受伤视角晃动：只在第一人称那一镜（玩家的相机），照原版 1.20.1 GameRenderer.bobHurt。用户 11-11 看八版第一人称：
//    「画面没有受击感 我记得原版受伤是屏幕是会抖的 并且那个末日终结的焚烧也会抖来着」（「末日终结」是她的称号 title.goety.13，焚烧是炼狱结界）。
//    bobHurt：f = (hurtTime − partialTick) ÷ hurtDuration（10），视角绕「打来的方向」转 14·sin(f⁴·π)·damageTiltStrength（默认 1）度：
//    poseStack 依次 YP(−hurtDir)、ZP(−角)、YP(hurtDir)，等于在视图空间绕 (sin hurtDir, 0, −cos hurtDir) 转 角；hurtDir = 90 是打在正前方，往下点头，偏到侧面就成了歪头。
//    几时 hurtTime 重置成 10（客户端）：
//    - 完整受伤（LivingEntity.hurt 过了无敌帧：离上一次完整受伤 10 刻以上）→ 服务端 broadcastDamageEvent，客户端 handleDamageEvent 置 10；
//      同时 ServerPlayer.indicateDamage 把 hurtDir 设成 atan2(dz, dx) − yRot（有攻击者、不是爆炸的才设，这里打他的都记在她名下）；
//    - 无敌帧里挨了更大的一下：不放受伤动画，可血掉了，LocalPlayer.hurtTo 照样置 10。伤害数没建模，按「轻的之后来了重的」算；
//    - 结界罩严以后：RevelationCageEntity.damageNearbyEntities 每刻对 8.5 格内的人打一轮（34 种伤害源，一半走 hurt），打完 onDamageApplied 把 invulnerableTime 清 0，
//      所以每刻都是完整受伤、hurtTime 每刻回到 10：视角一直歪着 10～14 度、20 Hz 地颤，这就是「焚烧也会抖」。罩严之前的按上面两条。
//    服务端那一刻的包客户端半刻后才处理（到包刻，Agent 取的）。死的那一刻切第 5 幕死亡界面，原版死后那点歪头（deathTime，20 刻才 3.6 度）落在第 5 幕，这里不画 ──
/** LivingEntity.hurtDuration */
export const 受伤长刻 = 10;
/** 服务端打中那一刻到客户端处理包、把 hurtTime 置 10 隔几刻。Agent 取的 */
const 到包刻 = 0.5;
/** 他看的方向比她慢 0.1 秒（第一人称视线追着她，段/4-齐放/画面.tsx 同一个数） */
export const 视线慢秒 = 0.1;
/** 平面方位角（度，x 轴起逆时针）从 a 看 b */
const 方位 = (a: readonly number[], b: readonly number[]) => (Math.atan2(b[1]! - a[1]!, b[0]! - a[0]!) * 180) / Math.PI;
/** hurtDir（度）：她在他朝向的哪边。场景 x 东 y 北，换成游戏的 atan2(dz, dx) − yRot 就是 90 − (她的方位 − 他朝的方位) */
const 打来向 = (他局部秒: number) => {
  const w = 他回世界(他局部秒);
  const 差 = 方位(史蒂夫眼, 亚波伦位(秒在(w))) - 方位(史蒂夫眼, 亚波伦位(秒在(w - 视线慢秒)));
  return 90 - ((((差 % 360) + 540) % 360) - 180);
};
/** 客户端 hurtTime 置 10 的每一刻（他的局部钟，刻；索命的打击停顿里不走）和那时的 hurtDir */
export const 受伤们: readonly { 刻: number; 向: number }[] = (() => {
  const 罩 = Math.ceil(他钟(罩严秒) * 20);
  const 出: { 刻: number; 向: number }[] = [];
  let 上次整 = -Infinity;
  let 上次重 = false;
  for (const h of 命中们) {
    const 刻 = Math.floor(他钟(h.秒) * 20);
    if (刻 >= 罩) break;
    if (刻 - 上次整 >= 受伤长刻) [上次整, 上次重] = [刻, h.重];
    else if (h.重 && !上次重) 上次重 = true;
    else continue;
    if (出[出.length - 1]?.刻 !== 刻) 出.push({ 刻, 向: 打来向(刻 / 20) });
  }
  for (let 刻 = 罩; 刻 < 他钟(死) * 20; 刻++) 出.push({ 刻, 向: 打来向(刻 / 20) });
  return 出;
})();
/** 幕内第 s 秒（世界钟）bobHurt 转多少度、绕哪个 hurtDir */
export const 受伤倾 = (s: number): { 度: number; 向: number } => {
  const t = 他钟(s) * 20;
  let 近: (typeof 受伤们)[number] | undefined;
  for (const e of 受伤们) {
    if (e.刻 + 到包刻 > t) break;
    近 = e;
  }
  if (!近) return { 度: 0, 向: 90 };
  // 客户端每整刻 hurtTime 减 1；render 时 f = hurtTime − partialTick
  const 剩 = Math.max(0, 受伤长刻 - (Math.floor(t) - Math.floor(近.刻 + 到包刻))) - (t - Math.floor(t));
  if (剩 <= 0) return { 度: 0, 向: 近.向 };
  return { 度: 14 * Math.sin((剩 / 受伤长刻) ** 4 * Math.PI), 向: 近.向 };
};
