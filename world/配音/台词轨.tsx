// 本作品的台词轨：台词表和 32 句配音副本（工具/配音/生成台词.py 出的）在这里 import，交给 engine/audio/台词轨.tsx 的 做台词轨 绑好。
// 只要台词表的纯函数文件也可以从这里取 lineTable；只要口型的用 ./口型.ts（不连带这些 wav）。
import lineTableJson from 'asset:数据/配音/台词表';
import { 做台词轨 } from '../../engine/audio/台词轨.tsx';
import { 资产目录 } from '../../engine/core/资产目录.ts';
// 待迁移（私有资产）：九胡的配音私有，M5 台词改走段.ts 的声音 cue 后不再打进包
import 资_0 from 'asset:配音/6-李樱-出征暮色';
import 资_1 from 'asset:配音/6-李樱-不值一提';
import 资_2 from 'asset:配音/6-九胡-等等我';
import 资_3 from 'asset:配音/6-李樱-看我速通暮色';
import 资_4 from 'asset:配音/6-九胡-什么也没有';
import 资_5 from 'asset:配音/6-李樱-没有最终boss';
import 资_6 from 'asset:配音/6-李樱-不算白跑';
import 资_7 from 'asset:配音/6-李樱-熔炼温度';
import 资_8 from 'asset:配音/6-李樱-锁链基底';
import 资_9 from 'asset:配音/6-李樱-夸克古卷';
import 资_10 from 'asset:配音/6-李樱-沉淀';
import 资_11 from 'asset:配音/6-李樱-古城寻宝';
import 资_12 from 'asset:配音/6-九胡-导航';
import 资_13 from 'asset:配音/6-九胡-怎么下去';
import 资_14 from 'asset:配音/6-九胡-边城脚下';
import 资_15 from 'asset:配音/6-李樱-又回到这里';
import 资_16 from 'asset:配音/6-李樱-RoadRoller';
import 资_17 from 'asset:配音/6-黄叛-又出现了';
import 资_18 from 'asset:配音/6-黄叛-纳命来';
import 资_19 from 'asset:配音/6-李樱-两次了';
import 资_20 from 'asset:配音/6-李樱-烦死了';
import 资_21 from 'asset:配音/6-李樱-会会你们';
import 资_22 from 'asset:配音/6-刘心忠-怕了我们';
import 资_23 from 'asset:配音/6-黄叛-结构奇怪';
import 资_24 from 'asset:配音/6-刘心忠-贵族生活';
import 资_25 from 'asset:配音/7-刘心忠-怎么回事';
import 资_26 from 'asset:配音/7-刘心忠-不可能';
import 资_27 from 'asset:配音/7-黄叛-受死';
import 资_28 from 'asset:配音/7-李樱-五万血';
import 资_29 from 'asset:配音/7-李樱-溜了';
import 资_30 from 'asset:配音/7-李樱-开到了';
import 资_31 from 'asset:配音/7-刘心忠-风筝';

const ctx = 资产目录({ './6-1-1-李樱-出征暮色.wav': 资_0, './6-1-2-李樱-不值一提.wav': 资_1, './6-1-3-九胡-等等我.wav': 资_2, './6-1-3-李樱-看我速通暮色.wav': 资_3, './6-1-9-九胡-什么也没有.wav': 资_4, './6-1-9-李樱-没有最终boss.wav': 资_5, './6-2-1-李樱-不算白跑.wav': 资_6, './6-2-1-李樱-熔炼温度.wav': 资_7, './6-2-1-李樱-锁链基底.wav': 资_8, './6-2-2-李樱-夸克古卷.wav': 资_9, './6-2-2-李樱-沉淀.wav': 资_10, './6-2-3-李樱-古城寻宝.wav': 资_11, './6-2-4-九胡-导航.wav': 资_12, './6-3-1-九胡-怎么下去.wav': 资_13, './6-3-1-九胡-边城脚下.wav': 资_14, './6-3-1-李樱-又回到这里.wav': 资_15, './6-3-5-李樱-RoadRoller.wav': 资_16, './6-3-8-黄叛-又出现了.wav': 资_17, './6-4-3a-黄叛-纳命来.wav': 资_18, './6-4-4-李樱-两次了.wav': 资_19, './6-4-4-李樱-烦死了.wav': 资_20, './6-4-5-李樱-会会你们.wav': 资_21, './6-4-6-刘心忠-怕了我们.wav': 资_22, './6-4-6-黄叛-结构奇怪.wav': 资_23, './6-4-7-刘心忠-贵族生活.wav': 资_24, './7-1-1-刘心忠-怎么回事.wav': 资_25, './7-1-3-刘心忠-不可能.wav': 资_26, './7-1-5-黄叛-受死.wav': 资_27, './7-2-1-李樱-五万血.wav': 资_28, './7-2-1-李樱-溜了.wav': 资_29, './7-2-2-李樱-开到了.wav': 资_30, './7-4-1-刘心忠-风筝.wav': 资_31 }) as unknown as { keys(): string[]; (k: string): string | { default: string } };
const wavUrls: Record<string, string> = {};
for (const k of ctx.keys()) {
  const wavModule = ctx(k);
  wavUrls[k.replace(/^\.\//, '')] = typeof wavModule === 'string' ? wavModule : wavModule.default;
}

export const { LineTrack, lineFrameCount, lineTable } = 做台词轨(lineTableJson, wavUrls);
export type { LineCue, LineEntry } from '../../engine/audio/台词轨.tsx';
