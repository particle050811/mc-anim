// 时差分屏核对的视图表（纯数据，段.ts 也读）：一帧一个视图。帧 = 歌曲帧（分镜 的 正片事件），画的就是片子里那一帧。
// 定稿是第 13 句 生长三（43.57）：风正吹着日历、身后坡上冒出几棵樱花树、她蹲在树苗旁；描边开、关和后期关各一张，和定稿只差这一个变量。
// 对照帧用 她 盖掉她这一页的几个字段，也只差写出来的那几个。
import { fps, legacyFrameSec } from '../../分镜/时间.ts';
import { events as mainCutEvents } from '../../分镜/正片第13至14句.ts';
import type { HerPage } from '../../场/2-门口/时差分屏.tsx';

export type View = {
  name: string;
  frame: number;
  outline?: boolean;
  withPost?: boolean;
  /** 盖在她这一页的样子上（对照帧） */
  liYing?: Partial<HerPage>;
};

const stillFrame = mainCutEvents.growthStep3.frame;
/** 事件那一帧往后 n 个 24 fps 的帧（按秒取到最近的一帧） */
const frameAfter = (frame: number, n: number) => frame + Math.round(legacyFrameSec(n) * fps);

export const views: readonly View[] = [
  { name: '定稿', frame: stillFrame },
  { name: '描边开', frame: stillFrame, outline: true },
  { name: '描边关', frame: stillFrame, outline: false },
  { name: '后期关', frame: stillFrame, withPost: false },
  // 自检：起风前（分屏停稳、日历还没动）、头一页刚飞起来（头一棵樱花树一起冒）、远景冒满中景冒头一棵、门口树苗长成前一帧、停在 1 以后
  { name: '自检-起风前', frame: frameAfter(mainCutEvents.timetableLit2.frame, 1) },
  { name: '自检-头一页飞', frame: frameAfter(mainCutEvents.windBlowsCalendar.frame, 3) },
  { name: '自检-中景头一棵', frame: frameAfter(mainCutEvents.growthStep4.frame, 1) },
  { name: '自检-树苗长成前', frame: mainCutEvents.calendarAtOne.frame - 1 },
  { name: '自检-停在1', frame: frameAfter(mainCutEvents.calendarAtOne.frame, 6) },
  // 对照：蹲着她身子往镜头斜转 30°（yaw −120）、头转 20°，胳膊和花同定稿，只差朝向（定稿是正侧面 yaw −90、头转 40°）
  { name: '对照-蹲身子斜转30', frame: stillFrame, liYing: { yaw: -120, 看: [5, -20] } },
];
