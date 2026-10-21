// 6-4-3 挡箭三段（6-4-3a 蓄力射箭、6-4-3b 极速飞行加拔刀挡开、6-4-3c 挑飞的箭击穿洞顶）共用的时间线：一条全局帧 G（24 帧/秒，0 起），各段是其中一个窗口（同 6-3-下坠/时间线.ts），段间硬切，不拼首尾帧。
// 两层时间：剧情时间 T（秒，人、箭、风、碎块按它走，见 几何.ts）和全局帧。慢放只缩时钟、不改速度（项目规则）：时钟 = 画面 1 秒对应多少剧情秒，关键点之间按剧情时间 smoothstep 过渡；
// 标「对数」的段按时钟的对数过渡（时钟差几十倍时线性过渡会前一大半还快、最后几帧一下刹住）。风和箭用同一时钟，风比箭快（风道里 7700 → 1100 米/秒）要在画面上看得出来。
//   0～1.6 秒原速：李樱低头翻箱子（箭射出后才发现，用户 10-12 定）；硬切到黄叛放箭前一瞬（1/120）：箭穿过风扇、在 6 米风道里被推到 1000 米/秒。
//   用户 10-18 定：删掉中间黄叛拉弓、风扇转满等声音那一截（剧情 1.6 秒到 `切.A3` 直接跳过，见 `跳过`；「哄」在跳过的那截里，切进 A3 时风早已吹满）；
//   6-4-3b 跟拍：箭出画面切跟拍，时钟几帧里快到 `跟拍时钟`（主方案 1/12），镜头离箭 5 米（18mm），离弹开点 7 米起按对数慢下来，1.5 米前慢到 1/500，镜头刹住；李樱听到「哄」直起身拔刀，刀刃扫过飞到身前 1.5 米的箭把它挑飞，镜头不跟，箭往上飞出画面，之后慢放逐步放开（时钟表见 建时间线）；
//   6-4-3c 镜头留在李樱这边（用户 10-10：箭被弹飞不给特写）：箭在画外击穿洞顶，八声碎裂挨一声（慢放里的声音按画面时间原速放，见 音效/慢放.ts），钉住后几帧回到原速：李樱抬头、尖啸体尖啸；切黄叛愣住；再切回李樱戒备，石块砸到他身边。
// `跟拍时钟` 是演法参数：主方案 1/12，另有备选（段.tsx），换的只是时钟，各段剧情起止不变。
import { HIT_STOP_FRAMES } from '../../../../world/默认.ts';
import * as geom from './几何.ts';

export const FPS = 24;
const ss = geom.ss;
const arrivalSec = (s: number) => geom.放箭 + geom.来箭到(s); // 箭（实体位置）走到离搭箭点 s 米的剧情时刻

// 镜头切换的剧情时刻（也是段的分界）
// 放箭以后的切点都跟着弹开走；黄叛离得越远放箭越晚
export const 切 = {
  A2: 1.6, // 李樱翻箱子到这里；A2 黄叛蓄力那一镜删了（用户 10-18），帧号和 A3 相同
  A3: geom.放箭 - 0.002, // → 黄叛左边，1/120 下 6 帧后松手（喊声在放箭前开口，见 声音.tsx 的 `shoutLine`）
  B1: arrivalSec(geom.风道末程 + 1.5), // 6-4-3a | 6-4-3b：箭出风道 1.5 米、飞出侧面机位的画面，切到跟拍
  C1: geom.弹开 + 8 / geom.箭速上限, // 6-4-3b | 6-4-3c：挑飞 8 米（箭已飞出 6-4-3b 的画面），切到李樱北边看他的右侧身（编排.ts 的 C1a）
  C2: geom.弹开 + 0.424, // 李樱抬头看洞顶（编排.ts 的 抬头）→ 黄叛（愣住：看见招架的闪光，头 0.3 秒转过去，切过去时正转到一半）
  C3: geom.弹开 + 1.174, // → 李樱身后（东边，越过他右肩往西看；洞顶掉下来的石块从画面左上方砸下来，落到他左前方那道墙后面，见编排.ts 的 C3a、落石落地）
  END: geom.弹开 + 2.924,
};
// 剧情时间在这两刻之间的不演（用户 10-18 定：删掉等拉弓），A1 最后一帧之后直接是 A3
const 跳过 = [切.A2, 切.A3] as const;
// 跟拍里时钟的几个点（箭的程，米）：快起来、开始慢、慢到 1/500
export const 跟拍程 = { 快: geom.风道末程 + 5.5, 慢起: geom.弹开程 - 7, 慢止: geom.弹开程 - 1.5 };

export type 时间线 = ReturnType<typeof 建时间线>;
// [剧情秒, 时钟, 这一段按对数过渡?]
export type 时钟点 = [number, number, boolean?];
// 换演法（打斗编排.ts）：`跟拍后` 换掉跟拍快起来以后的时钟点；`停顿` 在这一剧情秒把整个世界定住（打击停顿，帧数用 lib/anim.ts 的默认 `HIT_STOP_FRAMES`）
export type 演法 = { 跟拍后: 时钟点[]; 停顿?: { 剧情秒: number } };
export const 建时间线 = (followClock: number, variant?: 演法) => {
  const CLOCK: 时钟点[] = [
    [0, 1],
    // A2～A3 跳过（`跳过`），这一截的时钟用不到；放箭前后的 1/120 不动（风道推箭是看点）
    [切.A2, 1],
    [切.A3, 1 / 120],
    [切.B1, 1 / 120],
    [arrivalSec(跟拍程.快), followClock, true],
    ...(variant ? variant.跟拍后 : ([
      [arrivalSec(跟拍程.慢起), followClock],
      [arrivalSec(跟拍程.慢止), 1 / 500, true],
      // 弹开以后 1/120 → 1/80（再慢画面上几乎不动），招架闪光照样看得清
      [geom.弹开 + 0.0015, 1 / 500],
      [geom.弹开 + 0.004, 1 / 120],
      [切.C1, 1 / 80],
      // 6-4-3c：画外击穿洞顶的碎裂声在慢放里拉开一点（八声一声挨一声），洞顶击穿完几帧后回到原速（箭接着往上打穿岩层，碎裂声越来越远）；
      // 不拍箭，刀光、招架闪光在 6-4-3b 末尾已经慢放了两秒多，这里只留一秒多就回到原速
      [geom.弹开 + geom.击穿时刻[0], 1 / 30, true],
      [geom.洞顶击穿完 + 0.002, 1 / 25, true],
      [geom.洞顶击穿完 + 0.02, 1 / 5, true],
      [geom.洞顶击穿完 + 0.05, 1],
    ] as 时钟点[])),
    [99, 1],
  ];
  const clock = (storySec: number) => {
    for (let i = 1; i < CLOCK.length; i++) {
      const [t0, c0] = CLOCK[i - 1];
      const [t1, c1, logBlend] = CLOCK[i];
      if (storySec <= t1) {
        const k = ss((storySec - t0) / (t1 - t0));
        return logBlend ? c0 * Math.pow(c1 / c0, k) : c0 + (c1 - c0) * k;
      }
    }
    return 1;
  };
  // 全局帧 → 剧情时间：按画面时间积分 dT = 时钟(T) dt，每帧细分 64 步（慢放最狠时一帧只有 0.08 毫秒剧情时间）
  const SUB = 64;
  const STORY: number[] = (() => {
    const out = [0];
    let storySec = 0;
    const stop = variant?.停顿;
    while (storySec < 切.END) {
      for (let k = 0; k < SUB; k++) {
        const subStep = 1 / FPS / SUB;
        const k1 = clock(storySec);
        const k2 = clock(storySec + (k1 * subStep) / 2);
        const next = storySec + k2 * subStep;
        // 跳过：跨过 A2 这一帧直接落在 A3
        if (storySec < 跳过[0] && next >= 跳过[0]) {
          storySec = 跳过[1];
          break;
        }
        // 跨过停顿那一刻：这一帧落在那一刻上，再重复几帧
        if (stop && storySec < stop.剧情秒 && next >= stop.剧情秒) {
          storySec = stop.剧情秒;
          for (let n = 0; n < HIT_STOP_FRAMES; n++) out.push(storySec);
          break;
        }
        storySec = next;
      }
      out.push(storySec);
    }
    return out;
  })();
  const totalFrames = STORY.length;
  const storyTime = (globalFrame: number) => {
    const i = Math.min(Math.max(Math.floor(globalFrame), 0), STORY.length - 2);
    return STORY[i] + (STORY[i + 1] - STORY[i]) * (globalFrame - i);
  };
  // 第一个剧情时间 ≥ T 的帧
  const frameAt = (storySec: number) => {
    const i = STORY.findIndex((t) => t >= storySec);
    return i < 0 ? STORY.length - 1 : i;
  };
  // 剧情时间 → 带小数的帧（剧情时间 的反函数，帧之间线性）
  const frameFractional = (storySec: number) => {
    const i = frameAt(storySec);
    if (i <= 0) return 0;
    if (storySec >= 跳过[0] && storySec <= 跳过[1]) return i; // 跳过的那截都算在 A3 切进来那一帧
    const t0 = STORY[i - 1];
    const t1 = STORY[i];
    return i - 1 + (t1 > t0 ? Math.min(1, Math.max(0, (storySec - t0) / (t1 - t0))) : 1);
  };
  // 段表（全局帧，[起, 止)）
  const segmentTable: Record<段名, { 起: number; 止: number; 名: string }> = {
    '6-4-3a': { 起: 0, 止: frameAt(切.B1), 名: '风矢' },
    '6-4-3b': { 起: frameAt(切.B1), 止: frameAt(切.C1), 名: '挡箭' },
    '6-4-3c': { 起: frameAt(切.C1), 止: totalFrames, 名: '挑飞' },
  };
  return { FPS, 跟拍时钟: followClock, 时钟: clock, 总帧数: totalFrames, 剧情时间: storyTime, 帧: frameAt, 帧小数: frameFractional, 段表: segmentTable, 段帧数: (segment: 段名) => segmentTable[segment].止 - segmentTable[segment].起 };
};
export type 段名 = '6-4-3a' | '6-4-3b' | '6-4-3c';

// ---------- 主方案 ----------
// 跟拍 1/12：箭一帧走 3.5 米（83 米/秒），洞里的岩壁离镜头两三米，一帧掠过一两个身位，看得出快；
// 再快（1/8）两边的房子跳得认不出是什么；再慢（1/40）就像一支普通的箭在飞（用户 10-12 嫌 1/16 慢）。备选见 段.tsx
export const 主跟拍时钟 = 1 / 12;
const mainTimeline = 建时间线(主跟拍时钟);
export const 时钟 = mainTimeline.时钟;
export const 总帧数 = mainTimeline.总帧数;
export const 剧情时间 = mainTimeline.剧情时间;
export const 帧 = mainTimeline.帧;
export const 帧小数 = mainTimeline.帧小数;
export const 段表 = mainTimeline.段表;
export const 段帧数 = mainTimeline.段帧数;
// 机位切换的全局帧
export const 切帧 = {
  A2: 帧(切.A2),
  A3: 帧(切.A3),
  B1: 段表['6-4-3b'].起,
  弹开: 帧(geom.弹开),
  C1: 段表['6-4-3c'].起,
  C2: 帧(切.C2),
  C3: 帧(切.C3),
};
// 给 6-4-3b 刀光那一路对时间用（主方案的全局帧；段内帧 = 全局帧 − `段表['6-4-3b'].起`）：
// `挥刀开始帧` = 刀开始动（6-1-2 帧 98、拔刀起）；`斩击生成帧` = 刀挥到正前方（6-1-2 帧 104，斩击实体生成），两者之间剧情上 0.045 秒；
// `弹开帧` = 刀刃扫过箭路、箭被挑开的那一帧（6-1-2 帧 104.576，见 几何.ts 的 弹开关键帧）。
export const 挥刀开始帧 = 帧(geom.拔刀起);
export const 弹开帧 = 帧(geom.弹开);
export const 斩击生成帧 = 帧(geom.挥刀);
