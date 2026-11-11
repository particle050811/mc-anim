// 法术演出的接口（纯模块，段.ts 也能引）：每个法术一份元数据（<名>.元.ts）加一个组件（<名>.tsx），怎么加见 说明.md。
// 坐标一律是场景坐标（Z 朝上：x 东、y 北、z 上，单位格）；时间是出手后的秒，游戏里的刻 = 秒 × 20。

export type 点 = readonly [number, number, number];

export interface 法术演出属性 {
  /** 出手后的秒数（带小数）。宿主只在 [0, 元.长秒) 里画 */
  readonly 秒: number;
  /** 法术从哪出来：轮盘上那一格或杖尖 */
  readonly 起点: 点;
  /** 打谁：史蒂夫脚底中心 */
  readonly 目标: 点;
  /** 这一发自己的随机数种子；同一个种子每帧算出来一样 */
  readonly 种子: number;
  /** 聚晶附魔、施法条件；不给 = 不附魔、原版快慢 */
  readonly 选项?: 法术选项;
}

/** 一发法术的附魔和施法条件（游戏里由聚晶附魔、饰品决定，各法术只认自己用得上的那几项） */
export interface 法术选项 {
  /** 高速附魔（Velocity，聚晶满级 5）的级数：弹速照各法术 SpellResult 里的公式加 */
  readonly 高速?: number;
  /** 施法（蓄力）刻数：演出里含蓄力那一段的法术（卫射、撕裂）照它演；晋升之环 4 倍施法速度这种在宿主里先算好 */
  readonly 施法刻?: number;
  /** 不画落雷预警圈（雷暴） */
  readonly 无预警圈?: boolean;
}

export interface 法术声 {
  /** 资产 id，如 音效/诡厄巫法/goety.soul_bolt_cast */
  readonly 资产: string;
  /** 第几秒响：默认从出手算；写了 从命中 就从命中那一刻算（飞行时间随距离变的弹道类用） */
  readonly 秒: number;
  readonly 从命中?: boolean;
  /** 游戏里 playSound 的音量、音高（都默认 1）；段里怎么换成增益由段定 */
  readonly 音量?: number;
  readonly 音高?: number;
}

export interface 法术元 {
  /** 法术表.ts 的 注册名（聚晶 id 去掉命名空间和 _focus），如 soul_bolt */
  readonly id: string;
  /** 从出手到画面上什么都不剩，演多少秒。时长随距离变的，这里写参考距离（约 12 格，核对段的摆法）下的数，另给 时长 */
  readonly 长秒: number;
  /** 打到目标的时刻（史蒂夫受击、震屏用）；没有命中一说的不写 */
  readonly 命中秒?: number;
  /** 长秒、命中秒随起点和目标变的（弹道类：飞多久看多远）给这个函数；要是纯函数 */
  readonly 时长?: (起点: 点, 目标: 点, 选项?: 法术选项) => { readonly 长秒: number; readonly 命中秒?: number };
  /** 声音，没有就给空数组 */
  readonly 声音: readonly 法术声[];
  /** 声音的时刻随 选项 变的（撕裂的预热跟着施法刻）给这个，给了就不用 声音 */
  readonly 声音随?: (选项?: 法术选项) => readonly 法术声[];
}

export const 定义法术元 = (元: 法术元): 法术元 => 元;

/** 这一发实际演多久、几时命中 */
export const 法术时长 = (元: 法术元, 起点: 点, 目标: 点, 选项?: 法术选项): { 长秒: number; 命中秒?: number } => 元.时长?.(起点, 目标, 选项) ?? { 长秒: 元.长秒, 命中秒: 元.命中秒 };

/** 这一发各声音落在出手后第几秒（从命中 的已经换算好）；段.ts 里拿去 放() */
export const 法术声音时刻 = (元: 法术元, 起点: 点, 目标: 点, 选项?: 法术选项): { 资产: string; 秒: number; 音量: number; 音高: number }[] => {
  const 命中 = 法术时长(元, 起点, 目标, 选项).命中秒;
  return (元.声音随?.(选项) ?? 元.声音).map((声) => {
    if (声.从命中 && 命中 === undefined) throw new Error(`法术 ${元.id} 的声音 ${声.资产} 写了 从命中，元数据里却没有命中秒`);
    return { 资产: 声.资产, 秒: (声.从命中 ? 命中! : 0) + 声.秒, 音量: 声.音量 ?? 1, 音高: 声.音高 ?? 1 };
  });
};

/** 游戏刻：秒 × 20 */
export const 每秒刻 = 20;
export const 到刻 = (秒: number) => 秒 * 每秒刻;
