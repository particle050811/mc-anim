// 第 2 场基地谋划 6-2-1～6-2-3 的声音：李樱的台词 + 原版脚步声，不挂配乐（三段的场景描述都写了不要配乐）。
// 三段是 编排.ts 那条全局时间线上的三个窗口，声音也排在全局帧上，每段放自己那一截（同 6-4-3/声音.tsx）。
// 台词开口见 编排.ts 的 `lineStarts` / `ancientCityLineStart`（全局帧，照用户在剪映里放字幕的位置）。
//   夸克古卷跨段：6-2-3 从它说到一半的地方接着放（帧是负的，`LineTrack` 自己跳过前面那截），同 6-1-2 → 6-1-3。
// 音效规则照 1.20.1（javap 核对，见 src/音效/游戏音效.tsx）：
// - 脚步：`Entity.move` 每走 1 / 0.6 格放一步，volume = soundType.volume × 0.15、pitch = soundType.pitch；地板是云杉木板（模型/场景/基地工坊.tsx），
//   WOOD → block.wood.step。三段路：6-2-1 李樱进门；6-2-3 九胡小跑到屋子中间、李樱绕过桌子走出去。九胡是 YSM 模型的玩家，脚步同李樱。
//   步点 = 路上每 1 / 0.6 格，时刻按 编排.ts 的 `trip` 反解。照游戏放（用户 10-11 定：成片脚步由 AI 生成，参考视频不刻意让脚步听得见）。
// - 6-2-3 结构罗盘界面：点输入框、点列表条目不出声；点「搜索」按钮响两下 ui.button.click（`AbstractWidget.mouseClicked` 的 playDownSound 一次，
//   `ExplorersCompassScreen.searchForStructure` 里又放一次，同一刻同一文件，叠加 2）。界面声音 relative、不随距离衰减，位置放在镜头上。打开界面没有声音。
// - 游戏里没有声音所以不加：拿起、放下战利品；JEI 界面弹出、按 Ctrl；手指敲桌面、拍手；拿起结构指南针、指针转动；九胡回头、转身。
// - 传动杆和齿轮在转，但它们是 SimpleKineticBlockEntity，`isNoisy()` = false，不放 KINETIC 嗡鸣；齿轮的 create:cogs 声音没导出，
//   按 `SoundScape.getVolume` 算镜头离齿轮 6～8 格时约 −32 dB，先没加。北山墙外风车轴承离镜头 9～13 格，约 −58 dB，不加。
import React from 'react';
import { rng, type V3 } from '../../../../engine/model/parts.tsx';
import { GameSoundTrack, type SoundCue } from '../../../../engine/audio/游戏音效.tsx';
import { lineFrameCount, LineTrack } from '../../../../world/配音/台词轨.tsx';
import { compassClickFrames } from '../../../../world/界面/结构罗盘.tsx';
import type { WalkPath } from './动作.ts';
import * as choreo from './编排.ts';

const stepLen = 1 / 0.6;

// 一条路上每一步的时刻（全局秒）和位置（房间本地）：`trip` 的 s(t) 单调不减，二分反解 s = n × 步长
const footfalls = (path: WalkPath, [t0, t1, ta, start0]: readonly [number, number, number, boolean]) => {
  const out: { t: number; p: number[] }[] = [];
  for (let stepIndex = 1; stepIndex * stepLen < path.length; stepIndex++) {
    const dist = stepIndex * stepLen;
    let lo = t0;
    let hi = t1;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (choreo.trip(mid, t0, t1, path.length, ta, start0).s < dist) lo = mid;
      else hi = mid;
    }
    out.push({ t: hi, p: path.at(dist) });
  }
  return out;
};

export const sounds: SoundCue[] = (() => {
  const rand = rng(6201);
  const out: SoundCue[] = [];
  const walks: [string, WalkPath, readonly [number, number, number, boolean]][] = [
    ['李樱进门', choreo.enter, choreo.walkPlans.enter],
    ['九胡小跑', choreo.jiuhuPath, choreo.walkPlans.jiuhu],
    ['李樱走到屋子中间', choreo.exitPath, choreo.walkPlans.exit],
  ];
  for (const [label, path, plan] of walks) {
    footfalls(path, plan).forEach(({ t, p: pos }, i) => {
      out.push({ 名: `${label}脚步${i + 1}`, 事件: 'block.wood.step', 帧: t * choreo.FPS, 位置: choreo.toWorld(pos) as V3, 音量: 0.15, 音高: 1, 选: rand() });
    });
  }
  const searchFrame = choreo.compassUiOpenFrame + compassClickFrames.搜索;
  out.push({ 名: '点搜索', 事件: 'ui.button.click', 帧: searchFrame, 位置: choreo.camera(searchFrame).pos as V3, 音量: 0.25, 音高: 1, 选: 0, stackCount: 2 });
  return out;
})();

// 开口（全局帧）
export const lineCues: { id: string; frame: number }[] = [
  { id: '6-2-1-李樱-不算白跑', frame: choreo.lineStarts.notWasted },
  { id: '6-2-1-李樱-锁链基底', frame: choreo.lineStarts.chainBase },
  { id: '6-2-1-李樱-熔炼温度', frame: choreo.lineStarts.smeltTemp },
  { id: '6-2-2-李樱-沉淀', frame: choreo.lineStarts.sediment },
  { id: '6-2-2-李樱-夸克古卷', frame: choreo.lineStarts.quarkTome },
  { id: '6-2-3-李樱-古城寻宝', frame: choreo.ancientCityLineStart },
];

const listener = (G: number) => choreo.camera(Math.min(Math.max(Math.round(G), 0), choreo.lastFrame)).pos as V3;

// 段里第 0 帧 = 全局帧 段表[段].起；每段放开口落在自己里面的台词，再加上一段开口、说进这一段的（夸克古卷，帧是负的）
export const BasePlanSound: React.FC<{ segment: choreo.SegmentName }> = ({ segment: segment }) => {
  const { 起: start, 止: end } = choreo.segmentTable[segment];
  const lines = lineCues.filter((x) => x.frame < end && x.frame + lineFrameCount(x.id) > start).map((x) => ({ id: x.id, 帧: x.frame - start }));
  return (
    <>
      <GameSoundTrack sounds={sounds} listener={listener} startFrame={start} frameCount={choreo.segmentFrames(segment)} />
      <LineTrack 句们={lines} />
    </>
  );
};
