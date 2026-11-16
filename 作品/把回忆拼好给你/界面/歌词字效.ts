// 五个关键词跟画面一起动（三稿「字」一栏，用户 10-24 定）：光明一亮、烟花炸开、刹那冻住然后裂开、时差带一道慢半拍的残影、放下跟着纸花落下。纯模块。
// 都按点算（点 = 一个字形像素，见 符文排版.ts），时刻从这个词拼齐那一帧（齐 = 词里最后一个字的最后一块落定）往后数；画法在 符文歌词.tsx。
// 这里的数都是 Agent 定的（手机 390 宽上看得出、不吵），整合时可以对着成片再调。
// 时长写秒；飞散的速度、加速度按 1/24 秒（24 fps 的一帧）一步算，60 fps 照同一条曲线取样。
import { fireworkDyeColors } from '@库/特效/烟花.ts';
import { fps, legacyFrameSec } from '../分镜/时间.ts';
import { scatter, type WordEffect } from './符文排版.ts';

export type Vec2 = readonly [number, number];

/**
 * 光明：拼齐那一下字变成暖白，外面亮起像素的光（用户 10-24：不要平滑光晕，要像素的光、亮度分档）。
 * 光按到字的曼哈顿距离分档（菱形的角，像素画里的光）：每档 档宽 点、不透明的硬边色阶，里一档亮黄、外一档暖橙（美术定稿：最多一两圈硬边色阶）；
 * 拼齐头 闪秒（24 fps 时 4 帧）两档都亮，之后留里面一档到退场。描边在的话光从描边外面起。
 * 核查 10-24：原来 4 档每档 1 点、透明度往外递减，手机 390 宽上一档一像素，糊成一圈软光；现在一档约 2 像素，台阶还在（Agent 定）
 */
export const brightEffect = { textColor: '#fff4c6', tierColors: ['#ffd23f', '#f59a23'], bandWidth: 2, flashSec: legacyFrameSec(4) } as const;
/** 这一帧亮几档 */
export const brightTier = (f: number, allDoneFrame: number) => (f < allDoneFrame ? 0 : (f - allDoneFrame) / fps < brightEffect.flashSec ? 2 : 1);

/**
 * 烟花：拼齐那一下从词的外沿炸出一圈原版烟花火花（贴图 spark_7 → spark_0，按年龄换，后半寿命淡掉，过 1/3 寿命以后一闪一闪：
 * 同 库/特效/烟花.ts 的 SparkParticle），颜色照第 10 句第三发（黄、橙，场/2-门口/门口之夜参数.ts），字自己先染上金色再回白。
 * 火花从词外框外面一圈（起圈）出发：从词中心出发的话头几帧全压在字上看不见。
 * 原版火花寿命 2.4～3 秒，这里压到 0.6～0.8 秒（下一句 0.5 秒后就进场）；摩擦照原版每刻 ×0.91 换成每 1/24 秒一步
 */
export const firework = {
  particleCount: 24,
  initSpeeds: [1.6, 2.6],
  /** 每步（1/24 秒）速度乘几（原版每刻 0.91，一步 = 20/24 刻） */
  摩擦: 0.91 ** (20 / 24),
  /** 往下的加速度（点/步²）；初速 是点/步 */
  重力: 0.05,
  /** 24 fps 时 14～20 帧 */
  lifetimeSec: [legacyFrameSec(14), legacyFrameSec(20)],
  fireworkColors: [fireworkDyeColors.黄, fireworkDyeColors.橙],
  textColor: '#ffe9a0',
  /** 字染金色几秒（24 fps 时 6 帧） */
  tintSec: legacyFrameSec(6),
} as const;

/** 一颗火花这一帧：x、y = 离词中心几点（贴图中心），档 = spark_几（7 最大），透 = 显现度（0～1，抖动着画） */
export type FireworkSpark = { x: number; y: number; 档: number; 色: number; alpha: number };

/** 起圈 = 火花出发的椭圆半径（点）：词外框的半宽、半高再往外 1 点 */
export const fireworkSparks = (f: number, allDoneFrame: number, seed: number, startRing: Vec2 = [0, 0]): FireworkSpark[] => {
  const sec = (f - allDoneFrame) / fps;
  if (sec < 0) return [];
  const frameCount = sec / legacyFrameSec(1);
  const out: FireworkSpark[] = [];
  for (let i = 0; i < firework.particleCount; i++) {
    const lifeSec = firework.lifetimeSec[0] + (firework.lifetimeSec[1] - firework.lifetimeSec[0]) * scatter(seed, i, 21);
    if (sec >= lifeSec) continue;
    const angle = ((i + scatter(seed, i, 22) * 0.6) / firework.particleCount) * Math.PI * 2;
    const v = firework.initSpeeds[0] + (firework.initSpeeds[1] - firework.initSpeeds[0]) * scatter(seed, i, 23);
    const m = firework.摩擦;
    // 速度每步乘 m：走过的路 = v·(1 − m^t)/(1 − m)；重力叠在竖直上
    const travelled = (v * (1 - m ** frameCount)) / (1 - m);
    const ageFrac = sec / lifeSec;
    // 原版闪烁：过 1/3 寿命后，(年龄 + 寿命)/3 为奇数的刻不画（按刻算）
    const tick = Math.floor(sec * 20);
    const lifeTicks = Math.floor(lifeSec * 20);
    if (ageFrac > 1 / 3 && Math.floor((tick + lifeTicks) / 3) % 2 === 1) continue;
    out.push({
      x: Math.cos(angle) * (startRing[0] + travelled * 1.3),
      y: Math.sin(angle) * (startRing[1] + travelled) + 0.5 * firework.重力 * frameCount * frameCount,
      档: Math.max(0, 7 - Math.floor(ageFrac * 8)),
      色: firework.fireworkColors[i % firework.fireworkColors.length]!,
      alpha: ageFrac < 0.5 ? 1 : 1 - (ageFrac - 0.5) / 0.5,
    });
  }
  return out;
};

/**
 * 刹那：每个字拼齐那一下冻住：整个字闪 冻闪秒（24 fps 时 2 帧）冰亮色（外面一圈冰色），之后停在冰色（笔画朝上的点亮一档，像原版冰块的高光）。
 * 到 裂（第 11 句世界碎掉那一拍，分镜 第11句碎裂）顺着拼字时的块缝裂开：各块往外让 裂开 点、亮 1/24 秒，停 停秒，
 * 再一块一块往下掉（各块晚 0～迟秒；外飘 点/步、重力 点/步²），掉出字行（和照片后面碎成像素往下掉的世界一起）；掉着的时候整句照常抖着退场，下一句进场前没了。
 * 核查 10-24：原来冻住只有 2 帧、裂开只让 1 点、停 3 帧才掉，句子先退了，成片里只看得出多了一像素缝；冰色原来太淡，夜里和白字分不开。Agent 定
 */
export const instantEffect = { iceColor: '#78c0f0', iceLightColor: '#dff4ff', freezeFlashSec: legacyFrameSec(2), crackOpen: 2, pauseSec: legacyFrameSec(1), delaySec: legacyFrameSec(1), 重力: 1.6, outDrift: 0.4 } as const;

/** 刹那一块这一帧离原位几点；冰 = 还没冻（0）、闪（1：冻住那一下、裂开那 1/24 秒）、冰（2）。字齐 = 这个字拼齐那一帧 */
export const instantBlock = (f: number, alignFrame: number, shatterFrame: number, center: Vec2, seed: number): { dx: number; dy: number; ice: 0 | 1 | 2 } => {
  if (f < alignFrame) return { dx: 0, dy: 0, ice: 0 };
  const crackFrame = Math.max(shatterFrame, alignFrame + instantEffect.freezeFlashSec * fps);
  if (f < crackFrame) return { dx: 0, dy: 0, ice: (f - alignFrame) / fps < instantEffect.freezeFlashSec ? 1 : 2 };
  const dir: Vec2 = [Math.sign(Math.round(center[0])), Math.sign(Math.round(center[1]))];
  const sec = (f - crackFrame) / fps - (instantEffect.pauseSec + instantEffect.delaySec * scatter(seed, 31));
  const elapsed = Math.max(0, sec) / legacyFrameSec(1);
  return { dx: dir[0] * (instantEffect.crackOpen + instantEffect.outDrift * elapsed), dy: dir[1] * instantEffect.crackOpen + 0.5 * instantEffect.重力 * elapsed * elapsed, ice: (f - crackFrame) / fps < legacyFrameSec(1) ? 1 : 2 };
};

/**
 * 放下：拼齐后各块像纸片一样一块一块飘下去，边飘边从白转成樱花粉（纸变花，同 2-归隐 那一镜的纸雨化樱花瓣）。
 * 「下」唱到时（分镜 归隐起风）樱花风从右往左吹起来，到 归隐合屏 只有 0.4 秒、这句就退场了：所以拼齐只停 1/24 秒就动，落得快、被风往左带。
 * 各块再晚 0～迟秒；初速、风 点/步，重力 点/步²；摆周期 0.5 秒，换色 24 fps 时第 2、5 帧
 */
export const putDown = {
  pauseSec: legacyFrameSec(1),
  delaySec: legacyFrameSec(3),
  initSpeed: 0.8,
  重力: 0.22,
  wind: 0.6,
  swingRange: [1, 2],
  swayPeriodSec: legacyFrameSec(12),
  releaseColors: ['#ffe6ef', '#f6b8d0'],
  recolorSec: [legacyFrameSec(2), legacyFrameSec(5)],
} as const;

/** 放下一块这一帧离原位几点；色 = 0 字色、1 淡粉、2 樱花粉 */
export const putDownBlock = (f: number, allDoneFrame: number, seed: number): { dx: number; dy: number; 色: number } => {
  const sec = (f - allDoneFrame) / fps - (putDown.pauseSec + putDown.delaySec * scatter(seed, 41));
  if (sec <= 0) return { dx: 0, dy: 0, 色: 0 };
  const t = sec / legacyFrameSec(1);
  const swing = putDown.swingRange[0] + (putDown.swingRange[1] - putDown.swingRange[0]) * scatter(seed, 42);
  const phase = scatter(seed, 43) * Math.PI * 2;
  return {
    dx: -putDown.wind * t + swing * (Math.sin((sec / putDown.swayPeriodSec) * Math.PI * 2 + phase) - Math.sin(phase)),
    dy: putDown.initSpeed * t + 0.5 * putDown.重力 * t * t,
    色: sec < putDown.recolorSec[0] ? 0 : sec < putDown.recolorSec[1] ? 1 : 2,
  };
};

/**
 * 时差：这个词的拼字（符文飞来、落定、闪）晚半拍再来一遍，画成一档实色冷蓝的残影（不描边、不透明），往右上错开，垫在本体底下；
 * 退场也晚半拍：本体先退，影子半拍后才退，慢半拍的影子。错开 5、4 点：再小就贴着字像一层投影。
 * 核查 10-24：原来残影带深色描边、七成透明，在右屏灰底上像字被印花了，拼齐后只停 5 帧就跟着整句退了（Agent 定）
 */
export const timeLag = { 色: '#4f9be6', shadowOffset: [5, -4] as Vec2 } as const;

/** 这个字在不在关键词里 */
export const inWord = (wordEffect: WordEffect | undefined, j: number) => !!wordEffect && j >= wordEffect.从 && j <= wordEffect.dest;
