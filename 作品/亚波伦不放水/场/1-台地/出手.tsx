// 出手：正片里「第几秒放哪个法术」的表怎么画。每一发从杖尖出发打向史蒂夫（起点、目标也可以逐发另给）；
// 用户 11-10 定：法术都从法杖尖放，不从盘上那一格放（「不然看着很诡异」），盘上那格只管亮。
// 连带算出史蒂夫几时挨打。用户 11-10 定画面上不出法术名签和计数「n / 71」。时钟由段定（本目录各幕的 编排-<幕>.ts，几幕共用一个钟所以放在场里 用「现身后几秒」）。
import React from 'react';
import { SpellPerformance } from '../../法术/演出/注册表.tsx';
import { launchFrom, launchTarget, type Launch, type SceneCtx } from './出手表.ts';

export * from './出手表.ts';

/** 画这一刻还在演的每一发；放在场景坐标的 group 里 */
export const CastLaunches: React.FC<{ 表: readonly Launch[]; sec: number; sceneCtx: SceneCtx }> = ({ 表: shotTable, sec: sec, sceneCtx }) => (
  <>
    {shotTable.map((cast, i) =>
      sec < cast.sec || (cast.end !== undefined && sec >= cast.end) ? null : <SpellPerformance key={`${cast.id}-${i}`} id={cast.id} sec={(cast.clock?.(sec) ?? sec) - cast.sec} from={cast.follow?.(sec) ?? launchFrom(cast, sceneCtx)} target={launchTarget(cast, sceneCtx)} seed={cast.seed ?? 101 + i * 7} options={cast.options} />,
    )}
  </>
);
