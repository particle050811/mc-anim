// 1-台地 的场时间线：本场的事件（秒，或接在别的事件后面），本场各段按 [起事件, 止事件) 取窗口（engine/段/窗口段.ts）。纯模块。
// 时刻都是 Agent 取的（第 1、2 幕 11-10 按用户「人物就像暂停了」重排过，11-11 按「动作怎么这么慢」提速重排，11-11 再按「画面未必要按时间推进」重剪），没渲过整段，用户没看过。
import { defineSceneTimeline } from '@engine/段/窗口段.ts';
import { slowClipMarks, beats as openingBeat, toClipSec as openToClipSec, actDur as act2Dur } from './开盘拍.ts';

/** 她现身后几秒甩杖（起、止）。放这里不放 开盘时刻.ts 的 act1：甩杖那阵风写在下面的场声音里，开盘时刻.ts 引着本文件 */
export const staffFlick = [1.38, 1.55] as const;
/** 第 1 幕现身到召唤完（秒）。原来 2.8：她甩完杖还站 1.25 秒，他早到了起点干等（用户 11-19「提前到了预定位置 那是不是应该提前进攻呢？……好像在罚站」），甩完杖就起飞 */
const appearToSummonSec = 1.95;
/** 第 4 幕开头到第一发出手几秒：盘已张开、杖已指向他，留 5 帧离手。 */
const act4CastSec = 5 / 60;
/** 第 4 幕多长：到他死。打死他的是卫射第五发（开幕起蓄、戴晋升之环 25 刻一发、蓄 20 刻结算，11 个大招都打到他以后头一发）；
 *  第 5 幕多长（侧拍倒下、死亡界面、贴身落地）。齐放拍.ts、击败拍.ts 载入时核对 */
const act4Dur = act4CastSec + (4 * 25 + 20) / 20;
export const act5Dur = 7.6;

const timelineDef = {
  scene: '1-台地',
  events: {
    开始: { 在: { sec: 0 }, basis: '第 1 幕开头：结构、祭品摆好，史蒂夫站在祭坛南边' },
    placeRing: { 在: { sec: 0.4 }, basis: '开头他已经站在基座外，0.4 秒右键把破碎之环放上祭坛（安息仪式时序.ts 的短方案从这里起算）；他走过来那一镜用户 11-11 说多余（「1-2s 走过去的镜头是多余的」），删了' },
    yaBoLunAppears: { 在: { after: 'placeRing', addSec: 6 }, basis: '短方案的现身时刻' },
    summonDone: { 在: { after: 'yaBoLunAppears', addSec: appearToSummonSec }, basis: '她睁眼、抬头、转向他、杖一甩，就接第 2 幕（用户 11-10 嫌前面环绕空镜多、人像暂停了）' },
    // 第 2 幕（用户 11-11 重剪）：七刀不要了，他拿断曜流光潜行挥剑冲两次（游戏里的冲刺技能），第一次她瞬移走、第二次她往上一拉他够不着；
    // 她拉升时伸杖、张盘，慢放、镜头绕着她转。拍子（世界秒）和慢放在 场/1-台地/开盘拍.ts，这里是换成片秒的时刻
    firstDash: { 在: { after: 'summonDone', addSec: openToClipSec(openingBeat.dashFirstSec) }, basis: '她飞出来悬在他东北边，他潜行着挥剑冲过去（断曜流光冲刺）' },
    teleport: { 在: { after: 'summonDone', addSec: openToClipSec(openingBeat.移) }, basis: '他冲到前 0.03 秒她瞬移走，挪到他冲过去那条线东边' },
    secondDash: { 在: { after: 'summonDone', addSec: openToClipSec(openingBeat.dashSecondSec) }, basis: '冲完 15 刻冷却一过，他回头又潜行着挥剑冲她；她同一刻往上一拉' },
    slowMoStart: { 在: { after: 'summonDone', addSec: slowClipMarks.start }, basis: '他从她脚底下冲过去那一下开始慢放（0.15 秒减到四分之一速）' },
    wheelOpens: { 在: { after: 'summonDone', addSec: openToClipSec(openingBeat.openWheelSec) }, basis: '拉升里伸杖、杖尖张盘（原版快慢 0.375 秒，慢放里约 1.5 秒）' },
    slowMoEnd: { 在: { after: 'summonDone', addSec: slowClipMarks.returnEndSec }, basis: '她刹在祭坛上空、盘张完，回到原速' },
    wheelOpenDone: { 在: { after: 'summonDone', addSec: act2Dur }, basis: '她停在祭坛上空 12 格、盘张着、杖指着他，他冲完站起来抬头看她，就接第 4 幕（第 4、5 幕按现身后的秒取浮动、头发，幕长变了这些跟着微变）' },
    // 第 3 幕取消（用户 11-10 定结界和第一波一起出手，见 需求.md）：第 2 幕直接接第 4 幕
    // 第 4 幕（分镜第 7 节）：她不停手地连放，侧面看她放、他第一人称看法术砸过来、晋升之环像不死图腾一样炸开，几秒后被炸死（用户 11-11，见 需求.md）。幕里的时刻在 场/1-台地/齐放拍.ts
    volleyCast: { 在: { after: 'wheelOpenDone', addSec: act4CastSec }, basis: '第 2 幕末盘已张开、杖指着他，右手不再前送，第一轮法术与结界一起离手；战斗曲 27.0 秒那一下砸在这里' },
    volleyDone: { 在: { after: 'wheelOpenDone', addSec: act4Dur }, basis: '他被狂轰滥炸，晋升之环挡下一次（索命劈中），之后几秒被炸死在这一刻（用户 11-11「在短短几秒内就死去 而不是法术烧完后死掉」）' },
    defeatDone: { 在: { after: 'volleyDone', addSec: act5Dur }, basis: '第六版三镜：侧拍倒下 1.8 秒、死亡界面横漂 3.5 秒、贴身落地 2.3 秒；死后不显示聚晶' },
  },
} as const;
/** 现身到第 4 幕出手几秒：先把事件解一遍再取，第 2 幕怎么改长短、改接法，战斗曲的入点都跟着走 */
const appearToCastSec = ((events) => events.volleyCast.sec - events.yaBoLunAppears.sec)(defineSceneTimeline(timelineDef).events);
/** 战斗曲比现身早几秒进（这 1.5 秒等功率淡入，现身时满）。下面的配乐、音效音量走势都是用户 11-19 听了几版试听后选的 F：
 *  两家 Gemini 盲听加实测，原来音乐比音效低 10～13 dB（「8～9 秒我都听不出来」），12.38 秒段缝上张盘被截、到出手音效之间有 85 毫秒空洞 */
const musicLeadSec = 1.5;

export default defineSceneTimeline({
  ...timelineDef,
  // 跨第 1～5 幕的配乐、环境（用户 11-11「音乐也配上」）。各幕自己的音效写在各段的 段.ts 里，不在这里。
  // 起止、入点、响度原是 Agent 取的；战斗曲的进出和响度、张盘、下面的音量走势是用户 11-19 听试听选的 F。起止一律按事件，幕长变了跟着走。
  sound: [
    // 战斗曲：游戏里这一战放的就是它（启示录下界亚波伦默认曲）。她现身前 1.5 秒淡入、现身时满，安息仪式那段只有环境声。
    // 曲子 22.2 秒起收小、24.7 秒起往上推、27.0 秒重新砸进来：砸进来那一下落在 齐放出手（第一轮法术离手、开始狂轰滥炸那一刻；用户 11-11 要卡在出手上）。
    // 拆两条：前一条放到 齐放出手 截掉，后一条从 齐放出手 起从 27.0 秒放；前一条的入点 = 27.0 − 前一条起到齐放出手的秒数，两条首尾接上、听不出缝，
    // 第 2 幕怎么改长短，砸的那一下都还在出手那一刻（现身后几秒现算，不抄数）
    // 响度 −19（用户 11-19 选 F：比原来的 −22 整体抬 3 dB）；淡入、出手前再抬、收尾的淡出在下面的 gainAutomation
    { asset: '配乐/亚波伦/決戦の刻', name: '战斗曲', 在: { after: 'yaBoLunAppears', addSec: -musicLeadSec }, end: 'volleyCast', 入点秒: 27 - appearToCastSec - musicLeadSec, loudness: -19 },
    // 他死在第 4 幕最后一刻：死前 0.122 秒起等功率淡出，死后 1.028 秒淡完就停
    { asset: '配乐/亚波伦/決戦の刻', name: '战斗曲-齐放', 在: 'volleyCast', end: { after: 'volleyDone', addSec: 1.028 }, 入点秒: 27, loudness: -19 },
    // 现身的雷声（7 秒）和她甩杖那阵风都响过 召唤完，原来写在 1-召唤 的 段.ts 里，被段尾一刀截掉（用户 11-19 听出 8～9 秒不连续）；挪到这里跨进第 2 幕放完
    { asset: '音效/entity.lightning_bolt.thunder.1', name: '现身雷声', 在: 'yaBoLunAppears', peakDb: -10 },
    { asset: '音效/诡厄巫法/goety.wind.1', name: '甩杖', 在: { after: 'yaBoLunAppears', addSec: staffFlick[0] }, peakDb: -18 },
    // 张盘响过第 2 幕段尾（文件还剩 1.65 秒），原来写在 2-开盘 的 段.ts 里被截在段缝上、到出手音效之间空了 85 毫秒（用户 11-19 选 F 时挪上来）
    { asset: '音效/诡厄巫法/goety.apostle_prepare_spell.1', name: '张盘', 在: 'wheelOpens', peakDb: -10 },
    // 下界荒地氛围垫底：mood.2 是 18 秒的长低鸣，从开头垫到现身以后、渐弱在曲子底下，文件自己放完（尾巴已经很轻，不截）；他死后曲子淡掉，再接一条 mood.1（8.8 秒）垫到第 5 幕完
    { asset: '音效/ambient.nether_wastes.mood.2', name: '下界氛围-开场', 在: '开始', loudness: -28 },
    { asset: '音效/ambient.nether_wastes.mood.1', name: '下界氛围-击败', 在: { after: 'volleyDone', addSec: 1 }, loudness: -28 },
  ],
  // 音量走势（用户 11-19 选 F，依据见 musicLeadSec）：增益按倍数在两点之间插，cosine 是半余弦缓动
  gainAutomation: [
    // 战斗曲：早进 1.5 秒等功率淡入；出手前 1.272 → 0.772 秒再抬 3 dB 保持到收尾；死前 0.122 秒起等功率淡出，死后 1.028 秒归零
    {
      target: { names: ['战斗曲', '战斗曲-齐放'] },
      points: [
        { 在: { after: 'yaBoLunAppears', addSec: -musicLeadSec }, db: -Infinity },
        { 在: 'yaBoLunAppears', db: 0, curve: 'equalPowerIn' },
        { 在: { after: 'volleyCast', addSec: -1.272 }, db: 0 },
        { 在: { after: 'volleyCast', addSec: -0.772 }, db: 3, curve: 'cosine' },
        { 在: { after: 'volleyDone', addSec: -0.122 }, db: 3 },
        { 在: { after: 'volleyDone', addSec: 1.028 }, db: -Infinity, curve: 'equalPowerOut' },
      ],
    },
    // 非配乐（音效、环境、雷声、张盘）出手前收一下：−7 dB 再回来，回满在出手前 5 毫秒，让出手那一声冒出来（跨 12.38 秒的段缝）
    {
      target: { kind: '非配乐' },
      points: [
        { 在: { after: 'volleyCast', addSec: -0.172 }, db: 0 },
        { 在: { after: 'volleyCast', addSec: -0.042 }, db: -7, curve: 'cosine' },
        { 在: { after: 'volleyCast', addSec: -0.005 }, db: 0, curve: 'cosine' },
      ],
    },
    // 非配乐在轰炸里整体压 3 dB，给音乐让出来；他死前回到原样
    {
      target: { kind: '非配乐' },
      points: [
        { 在: { after: 'volleyCast', addSec: 0.128 }, db: 0 },
        { 在: { after: 'volleyCast', addSec: 0.428 }, db: -3, curve: 'cosine' },
        { 在: { after: 'volleyDone', addSec: -0.222 }, db: -3 },
        { 在: { after: 'volleyDone', addSec: -0.072 }, db: 0, curve: 'cosine' },
      ],
    },
  ],
});
