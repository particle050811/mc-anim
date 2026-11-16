// 核对-亚波伦表演 的视图表（纯数据，段.ts 也读）：一秒一个视图，第 i 个在第 60i 帧。每个视图取示范演出（下面的 示范轴）的某一秒。
// 坐标照场景约定（Z 朝上：x 东、y 北、z 上，单位格）。她在原点上空，目标（史蒂夫的位置，画成一根红柱）在东边地上。
import { clamp01, smoothstep01 } from '@engine/core/数学.ts';
import type { V3 } from '@engine/model/parts.tsx';
import type { PerformanceBar } from '../../角色/动作/亚波伦演出.ts';

export const aspect = { width: 1280, height: 720 } as const;
export const guiScale = 3;

export const target: V3 = [8, 0, 0.9];
const hoverHeight = 4;
/** 示范演出：站 → 起飞 → 悬停 → 指向 → 开盘 → 出手三次 → 收盘 → 悬停 → 落地 → 站 */
export const demoTimeline: readonly PerformanceBar[] = [
  { start: 0, pose: '站立' },
  { start: 1.0, dest: 1.4, pose: '起飞' },
  { start: 1.4, dest: 2.2, pose: '悬停' },
  { start: 3.0, dest: 3.6, pose: '指向' },
  { start: 4.5, dest: 4.65, pose: '开盘' },
  { start: 4.8, dest: 5.3, pose: '指向' },
  { start: 7.0, dest: 7.6, pose: '收盘' },
  { start: 8.2, dest: 8.8, pose: '悬停' },
  { start: 9.7, dest: 10.0, pose: '落地' },
  { start: 10.2, dest: 10.7, pose: '站立' },
];
export const demoCast = [6.0, 6.4, 6.8] as const;
export const openingSec = 4.5;
export const closingSec = 7.0;
/** 脚底高度：1.2～2.4 秒升到悬高，9.0～10.0 秒落回地面 */
export const demoPos = (sec: number): V3 => [0, 0, hoverHeight * (smoothstep01(clamp01((sec - 1.2) / 1.2)) - smoothstep01(clamp01((sec - 9.0) / 1.0)))];

export type View = {
  name: string;
  note?: string;
  /** 示范演出的第几秒 */
  performSec: number;
  cameraRig: '侧' | '侧近' | '正' | '手';
  /** 画轮盘（张开到这一刻该有的样子） */
  wheel?: true;
  /** 画一条从杖尖顺着杖身伸出去的细线：看它过不过目标 */
  aimLine?: true;
  hudMode?: '全开' | '简版血条' | '半血';
};

export const views: readonly View[] = [
  { name: '姿势-站立', performSec: 0.5, cameraRig: '侧近', note: '现身站立：idle，杖斜举' },
  { name: '姿势-起飞', performSec: 1.4, cameraRig: '侧近', note: '起飞的中间一拍：两膝屈着，fly 混进 35%' },
  { name: '姿势-悬停', performSec: 2.8, cameraRig: '侧近', note: '悬停持杖：fly，杖斜举' },
  { name: '姿势-指向-侧', performSec: 4.0, cameraRig: '侧', aimLine: true, note: '举杖指向目标（红柱）：细线是杖身的延长线' },
  { name: '姿势-指向-近', performSec: 4.0, cameraRig: '侧近', note: '同一刻近看' },
  { name: '姿势-指向-从目标看', performSec: 4.0, cameraRig: '正', note: '从目标那头看她：杖尖朝着镜头' },
  { name: '姿势-开盘', performSec: 4.65, cameraRig: '侧近', note: '张开轮盘的一下：杖往前送、左臂甩开' },
  { name: '姿势-开盘-带轮盘', performSec: 5.6, cameraRig: '侧', wheel: true, aimLine: true, note: '开盘后 1.1 秒，回到指向，轮盘在杖尖、垂直杖身' },
  { name: '姿势-抖杖-前', performSec: 5.98, cameraRig: '手', note: '出手前一刻（对照）' },
  { name: '姿势-抖杖-顶点', performSec: 6.06, cameraRig: '手', note: '出手后 0.06 秒：手腕带杖头挑到最大（约 4 度）' },
  { name: '姿势-收盘', performSec: 7.9, cameraRig: '侧近', note: '收盘：杖收回来竖在身前' },
  { name: '姿势-落地', performSec: 10.0, cameraRig: '侧近', note: '落地的一拍：idle，两膝屈着' },
  { name: '过渡-站到悬停-1', performSec: 1.2, cameraRig: '侧近' },
  { name: '过渡-站到悬停-2', performSec: 1.6, cameraRig: '侧近' },
  { name: '过渡-站到悬停-3', performSec: 2.0, cameraRig: '侧近' },
  { name: '过渡-悬停到指向-1', performSec: 3.15, cameraRig: '侧近' },
  { name: '过渡-悬停到指向-2', performSec: 3.3, cameraRig: '侧近' },
  { name: '过渡-悬停到指向-3', performSec: 3.45, cameraRig: '侧近' },
  { name: '界面-全开', performSec: 6.1, cameraRig: '侧', wheel: true, hudMode: '全开', note: '血条和名字、三个名签、计数、聊天栏死亡消息一起开' },
  { name: '界面-半血', performSec: 6.1, cameraRig: '侧', hudMode: '半血', note: '血量 50%：血按比例从右边截掉' },
  { name: '界面-简版血条', performSec: 6.1, cameraRig: '侧', hudMode: '简版血条', note: '对照：配置 useSimpleApollyonBossbar 开着时的窄条（boss_bar_simple.png）' },
  { name: '过渡-指向到收盘-中', performSec: 7.3, cameraRig: '侧近', wheel: true, note: '收盘中：轮盘从外往里收（刻倒着走）' },
];
