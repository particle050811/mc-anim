// 第 15 句隐世之境这一镜的声音：你推开西门（深色橡木门）的开门声。纯数据（段.ts 读）。增益是 Agent 暂定（三稿「克制」）。
// 驯服不另加声音：照 1-一如既往 的取法，驯服那一下只有爱心、蛋糕被吃掉和她的气泡，没有音效。
import { events as mainCutEvents } from '../../分镜/正片第15句.ts';
import type { SongSound } from '../../声音/跨段音效.ts';

/** 原版木门开门声两条里取第一条（0.35 秒，一开门就响，没有空白头）；原版音量 0.9、音高 0.9～1 随机，这里按 1 */
export const doorSoundFile = { 资产: '音效/block.wooden_door.open.1', 时长秒: 0.348 } as const;
export const doorOpenGain = 0.3;

export const doorOpenSound: SongSound = {
  资产: doorSoundFile.资产,
  名: '推门',
  起帧: mainCutEvents.推门.帧,
  时长秒: doorSoundFile.时长秒,
  增益: () => doorOpenGain,
};
