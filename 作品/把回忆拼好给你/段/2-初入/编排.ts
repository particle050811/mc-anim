// 2-初入 每一帧：选择世界（钻进图标）和新世界（镜头、天、剖面、调子）两场在这一段里怎么接。两场互不引用，接法写在段里：
// 钻入的进度、透掉多少、调子回暖多少照 场/2-选择世界/编排.ts（和 2-选择世界 同一套，接缝那一帧对得上），新世界的镜头、天刻、撤排照 场/2-新世界/编排.ts。
import { lerpTone } from '@engine/三渲二/调子.ts';
import { fps } from '../../分镜/时间.ts';
import { events as mainCutEvents } from '../../分镜/正片开场.ts';
import { skyBrightness } from '../../地点/天体.ts';
import { palette } from '../../色板.ts';
import { drillIn } from '../../场/2-选择世界/参数.ts';
import { drillInWarm, drillInProgress } from '../../场/2-选择世界/编排.ts';
import { skyTickAt, cameraRigAt } from '../../场/2-新世界/编排.ts';

/** 钻完那一刻（歌曲帧，可以带小数）：从这一刻起没有选择世界界面了，整屏是新世界 */
export const drillDone = mainCutEvents.drumBeatClick.frame + drillIn.sec * fps;

/** 新世界的镜头 */
export const shotAt = (songFrame: number) => cameraRigAt(drillInProgress(songFrame).p, songFrame);

/** 新世界本身的调子：按原版天亮程度在夜和夏日白天之间插（第 1 句整句天亮 1，就是夏日白天；2-第一晚 同一个插法，接缝那一帧对得上） */
export const worldGradeAt = (songFrame: number) => lerpTone(palette.夜, palette.夏日白天, skyBrightness(skyTickAt(songFrame)));

/** 调子：选择世界是现实（冷），钻进图标跟着照片透掉的比例回暖到新世界的调子 */
export const gradeAt = (songFrame: number) => lerpTone(palette.现实, worldGradeAt(songFrame), drillInWarm(drillInProgress(songFrame).q));
