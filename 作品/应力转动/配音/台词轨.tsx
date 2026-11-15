// 本作品的台词轨：台词表和 32 句配音副本（工具/配音/生成台词.py 出的）在这里 import，交给 engine/audio/台词轨.tsx 的 做台词轨 绑好。
// 只要台词表的纯函数文件也可以从这里取 lineTable；只要口型的用 ./口型.ts（不连带这些 wav）。
import lineTableJson from 'asset:数据/配音/台词表';
import { makeLineTrack } from '@engine/audio/台词轨.tsx';
import { assetDir } from '@engine/core/资产目录.ts';
// 待迁移（私有资产）：九胡的配音私有，M5 台词改走段.ts 的声音 cue 后不再打进包
import liYingMarchToTwilightWav from 'asset:配音/6-李樱-出征暮色';
import liYingNotWorthMentioningWav from 'asset:配音/6-李樱-不值一提';
import jiuHuWaitForMeWav from 'asset:配音/6-九胡-等等我';
import liYingWatchMeSpeedrunWav from 'asset:配音/6-李樱-看我速通暮色';
import jiuHuNothingVoices from 'asset:配音/6-九胡-什么也没有';
import liYingNoFinalBossVoices from 'asset:配音/6-李樱-没有最终boss';
import liYingNotWastedVoices from 'asset:配音/6-李樱-不算白跑';
import liYingSmeltTempVoices from 'asset:配音/6-李樱-熔炼温度';
import liYingChainBaseVoices from 'asset:配音/6-李樱-锁链基底';
import liYingQuarkScrollVoices from 'asset:配音/6-李樱-夸克古卷';
import liYingSettleVoices from 'asset:配音/6-李樱-沉淀';
import liYingAncientCityLootVoice from 'asset:配音/6-李樱-古城寻宝';
import jiuHuNavigationVoice from 'asset:配音/6-九胡-导航';
import jiuHuHowDownVoices from 'asset:配音/6-九胡-怎么下去';
import jiuHuBorderCityFootVoices from 'asset:配音/6-九胡-边城脚下';
import liYingBackHereVoices from 'asset:配音/6-李樱-又回到这里';
import liYingRoadRollerVoice from 'asset:配音/6-李樱-RoadRoller';
import huangPanReappearVoice from 'asset:配音/6-黄叛-又出现了';
import huangPanComeAtMeVoice from 'asset:配音/6-黄叛-纳命来';
import liYingTwiceVoice from 'asset:配音/6-李樱-两次了';
import liYingAnnoyedVoice from 'asset:配音/6-李樱-烦死了';
import liYingMeetYouVoice from 'asset:配音/6-李樱-会会你们';
import liuXinZhongFearUsVoice from 'asset:配音/6-刘心忠-怕了我们';
import huangPanStructureStrangeVoice from 'asset:配音/6-黄叛-结构奇怪';
import liuXinZhongNobleLifeVoice from 'asset:配音/6-刘心忠-贵族生活';
import liuXinZhongWhatHappenedVoice from 'asset:配音/7-刘心忠-怎么回事';
import liuXinZhongImpossibleVoices from 'asset:配音/7-刘心忠-不可能';
import huangPanDeathVoices from 'asset:配音/7-黄叛-受死';
import liYingFiftyKHpVoices from 'asset:配音/7-李樱-五万血';
import liYingSlippedVoices from 'asset:配音/7-李樱-溜了';
import liYingOpenedVoices from 'asset:配音/7-李樱-开到了';
import liuXinZhongKiteVoices from 'asset:配音/7-刘心忠-风筝';

const ctx = assetDir({ './6-1-1-李樱-出征暮色.wav': liYingMarchToTwilightWav, './6-1-2-李樱-不值一提.wav': liYingNotWorthMentioningWav, './6-1-3-九胡-等等我.wav': jiuHuWaitForMeWav, './6-1-3-李樱-看我速通暮色.wav': liYingWatchMeSpeedrunWav, './6-1-9-九胡-什么也没有.wav': jiuHuNothingVoices, './6-1-9-李樱-没有最终boss.wav': liYingNoFinalBossVoices, './6-2-1-李樱-不算白跑.wav': liYingNotWastedVoices, './6-2-1-李樱-熔炼温度.wav': liYingSmeltTempVoices, './6-2-1-李樱-锁链基底.wav': liYingChainBaseVoices, './6-2-2-李樱-夸克古卷.wav': liYingQuarkScrollVoices, './6-2-2-李樱-沉淀.wav': liYingSettleVoices, './6-2-3-李樱-古城寻宝.wav': liYingAncientCityLootVoice, './6-2-4-九胡-导航.wav': jiuHuNavigationVoice, './6-3-1-九胡-怎么下去.wav': jiuHuHowDownVoices, './6-3-1-九胡-边城脚下.wav': jiuHuBorderCityFootVoices, './6-3-1-李樱-又回到这里.wav': liYingBackHereVoices, './6-3-5-李樱-RoadRoller.wav': liYingRoadRollerVoice, './6-3-8-黄叛-又出现了.wav': huangPanReappearVoice, './6-4-3a-黄叛-纳命来.wav': huangPanComeAtMeVoice, './6-4-4-李樱-两次了.wav': liYingTwiceVoice, './6-4-4-李樱-烦死了.wav': liYingAnnoyedVoice, './6-4-5-李樱-会会你们.wav': liYingMeetYouVoice, './6-4-6-刘心忠-怕了我们.wav': liuXinZhongFearUsVoice, './6-4-6-黄叛-结构奇怪.wav': huangPanStructureStrangeVoice, './6-4-7-刘心忠-贵族生活.wav': liuXinZhongNobleLifeVoice, './7-1-1-刘心忠-怎么回事.wav': liuXinZhongWhatHappenedVoice, './7-1-3-刘心忠-不可能.wav': liuXinZhongImpossibleVoices, './7-1-5-黄叛-受死.wav': huangPanDeathVoices, './7-2-1-李樱-五万血.wav': liYingFiftyKHpVoices, './7-2-1-李樱-溜了.wav': liYingSlippedVoices, './7-2-2-李樱-开到了.wav': liYingOpenedVoices, './7-4-1-刘心忠-风筝.wav': liuXinZhongKiteVoices }) as unknown as { keys(): string[]; (k: string): string | { default: string } };
const wavUrls: Record<string, string> = {};
for (const k of ctx.keys()) {
  const wavModule = ctx(k);
  wavUrls[k.replace(/^\.\//, '')] = typeof wavModule === 'string' ? wavModule : wavModule.default;
}

export const { lineFrameCount, lineTable } = makeLineTrack(lineTableJson, wavUrls);
