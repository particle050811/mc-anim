// 6-4-4 两次了：插进来的特写回放。6-4-3c 切黄叛愣住以后硬切到这一镜：回到挑箭之后一瞬，镜头贴在兵营西北角的感测体和尖啸体后面，
// 挥刀的振动朝镜头飞进前景的感测体，感测体触须一抖，振动接着飞进旁边一格的尖啸体，尖啸体喷出声波环。他说：「烦死了！」
// 用户 10-18 定：删掉第二次弹反——回放里拔刀挑箭那一截不演，从振动快到感测体起。
// 台词只留「烦死了！」（用户 10-10 嫌数次数多余，原「两次了。」删了）；段目录、Composition 仍叫「两次了」，改名牵动引用太多没改
//
// 画面就是 6-4-3 那条剧情时间线（6-4-3/画面.tsx 的 `DeflectView`：同一个李樱、刀和夜幕刀光、振动、感测体、尖啸），只换机位和时钟，所以和 6-4-3b/6-4-3c 里同一刻的东西一模一样。
// 时钟：原速（用户 10-19 定：回放不慢放）。古城4x 里挥刀点到感测体 6.2 米（飞 6 刻 = 0.3 秒），感测体到尖啸体 1 刻；
//   段首在感测体激活前 `leadSec`，看得见振动飞进感测体；尖啸后 `lineDelaySec` 开口，说完留 `tailSec` 看声波环往上飘就切。
// 机位：城西头兵营里、#210 箱子西北 7 米那个感测体和尖啸体（射箭.感测体、射箭.尖啸体，两格挨着）的西北边、离地 1.4 米，往东南看（22 → 24mm，焦距慢慢推一点）：
//   前景是感测体的青色触须和尖啸体的骨白牙口（声波环从这里往上飘），往里 5 米是李樱站在羊毛 C 上、正脸半侧，脚边是 #210 战利品箱。刀光、招架的闪光在他身前，振动的粒子从他身前朝镜头飞进前景的感测体，再一格飞进尖啸体。
//   对着新世界的方块核过（工具/G4临时/找机位644.py）：机位周围 0.3 格是空气，到他胸口、头顶、感测体、尖啸体顶面的视线不挡（到箱子正面中间隔着一根白蜡烛）。
import { sample, type Key } from '@engine/anim/anim.ts';
import type { V3 } from '@engine/model/parts.tsx';
import type { Cam } from '../../../地点/古城4x/6-4-1/古城画面.tsx';
import { G4 } from '../../../地点/古城4x.tsx';
import * as choreo643 from '../6-4-3/编排.ts';
import { 帧小数 } from '../6-4-3/时间线.ts';

export const FPS = 24;
// 李樱旁边那个感测体（6-4-3/编排.ts 的 感测体们[0]）激活、尖啸体喷声波的剧情时刻
const sensor0StoryT = -choreo643.sensorStates(0)[0].secSinceActive;
const shriekStoryT = choreo643.shriek!.t;
const leadSec = 0.25;
const lineDelaySec = 0.45;
const lineSec = 1.06; // src/配音/6-4-4-李樱-烦死了.wav 的长度
const tailSec = 0.6;
const startStoryT = sensor0StoryT - leadSec;
// 段内秒（声音落点用）：感测体咔嗒、尖啸（尖啸要放 10 秒多，6-4-5 开头从响到的地方接着放）
export const clickSec = leadSec;
export const shriekSec = clickSec + (shriekStoryT - sensor0StoryT);
// 台词落点（段内帧，A8 字幕读这里）：李樱「烦死了！」（src/配音/6-4-4-李樱-烦死了.wav，从原来「两次了。烦死了！」的配音里切出来的后半句）
export const lines = { 烦死了: { id: '6-4-4-李樱-烦死了', 帧: Math.round((shriekSec + lineDelaySec) * FPS) } } as const;
export const frameCount = Math.round((shriekSec + lineDelaySec + lineSec + tailSec) * FPS);

// ---------- 时钟 ----------
export const storySecAt = (f: number) => startStoryT + f / FPS;
// 6-4-3 主时间线上带小数的全局帧（挡箭画面 按它画）
export const deflectFrameAt = (f: number) => 帧小数(storySecAt(f));

// ---------- 机位 ----------
const camPose: Cam = { pos: G4(-1092.3, -45.3, 189.7), tgt: G4(-1087.2, -45.0, 194.2), lens: 22 };
const LENS: Key[] = [[0, 22], [frameCount, 24]];
export const camera = (f: number): Cam => ({ ...camPose, lens: sample(LENS, f) });

// 声源位置（场景坐标）：咔嗒在感测体方块中心，尖啸在尖啸体顶面中心
const blockCenter = ([x, y, z]: V3): V3 => G4(x + 0.5, y + 0.5, z + 0.5);
export const soundSources = {
  sculkSensor: blockCenter(choreo643.sensors[0]),
  shriek: [choreo643.shriek!.p[0], choreo643.shriek!.p[1], choreo643.shriek!.p[2] + 0.5] as V3,
};
