// 第 7 句末（2-拨开阴霾 的末帧）下一场（场/2-门口 第 8 句）要接的天：光影开 Photon 云时那层雨云的海平面、各层高度、洞比、软边。
// 雨停了，洞接着开大（2-门口/第8句云.ts 的 第8句光影场）。纯数据。
import { rainCloud } from './参数.ts';

export const endRainCloud = { seaLevel: rainCloud.seaLevel, layers: rainCloud.layers, holeRatio: rainCloud.holeRatio, softEdge: rainCloud.softEdge } as const;
