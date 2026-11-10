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
}

export interface 法术声 {
  /** 资产 id，如 音效/诡厄巫法/goety.soul_bolt_cast */
  readonly 资产: string;
  /** 出手后第几秒响 */
  readonly 秒: number;
  /** 游戏里 playSound 的音量、音高（都默认 1）；段里怎么换成增益由段定 */
  readonly 音量?: number;
  readonly 音高?: number;
}

export interface 法术元 {
  /** 法术表.ts 的 注册名（聚晶 id 去掉命名空间和 _focus），如 soul_bolt */
  readonly id: string;
  /** 从出手到画面上什么都不剩，演多少秒 */
  readonly 长秒: number;
  /** 打到目标的时刻（史蒂夫受击、震屏用）；没有命中一说的不写 */
  readonly 命中秒?: number;
  /** 声音，没有就给空数组 */
  readonly 声音: readonly 法术声[];
}

export const 定义法术元 = (元: 法术元): 法术元 => 元;

/** 游戏刻：秒 × 20 */
export const 每秒刻 = 20;
export const 到刻 = (秒: number) => 秒 * 每秒刻;
