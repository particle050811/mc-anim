// 6-3-8 二人登场、6-3-10 追进竖井：第 3 场边城的最后两段，同一条时间线上的两个窗口，中间硬切到坑口（用户 10-12 剪映第二轮：简化剧情直接追，其他人也跟上，只有两人下去；6-3-9 整段删）。
// 纯函数：输入编排秒 t（0 = 6-3-8 首帧，原速；成片帧换 t 见 编排/时间线.ts 的 `frameToSec`）。
//
// 地点：北城墙东段，东门楼（x 12～20）东边、卫兵那一排（x 24～56，见 6-3-下坠/编排/卫兵.ts 的 `guardPositions`）西头的走道。
// 两人站在走道靠城里的一侧，面朝竖井（城门大街和 y 97～103 横街的路口，北墙往南约 100 米，井心 = 6-3-下坠/编排/坑口.ts 的 `shaftCellCenter`）。场景、坑、竖井、碎块、卫兵和 6-3-4～6-3-6 同一套。
//
// 戏：
// - 6-3-8：镜头在卫兵身后、城垛上方，越过肩看路口的坑，卫兵各自放下望远镜、低头看坑（见 `guardPoseAt`）。镜头绕到两人正面：黄叛说
//   「上次抢劫我们城市的家伙又来了，我们快追！」，说到「快追」转身朝卫兵一挥手。说完一齐出发：刘心忠、黄叛先跳，卫兵一个个跑到内沿跟着跳，
//   都落进墙脚的落水池（28 米落水不掉血，用户 10-19 定：不走楼梯），蹚到池沿爬上岸往西跑（见 编排/落水.ts）。
//   跳下、落水两镜硬切（用户 10-19）：跳下镜镜头往后退一点、看两人从内沿跳出去，卫兵跑向内沿；落水镜在池子西头路上低处顺着池子往东看，
//   两人先后砸进水里，卫兵一个接一个从墙头掉下来落水，两人蹚上岸往镜头这边跑。中间掉 28 米那一截跳过不演。
// - 6-3-10：硬切到路口的坑：两人从城门大街冲过来，卫兵被甩在后面，两人先后跳进竖井，卫兵随后跑到、在坑口散开围住往下看。
//   跑速精英 30、卫兵 20 米/秒（用户 10-20，`chaseSpeed`）；城墙到坑一百米，跑过去的那几秒跳过不演（见 `skipSec`）。
//
// 声音：只有黄叛一句台词（台词轨）；没有配乐。音效只加画面里有、游戏里真会响的：脚步、落水（见 声音.tsx）。
// 代码分在 编排/ 下：时间线（台词、时刻、段表）、站位、二人、卫兵、机位、工具。
export { FPS, lineIds, huangLineSec, chaseCueOffset, cues, skipSec, storySec, afterImpact, fallTime, type SegmentName, jumpCutFrame, fallSkipFrames, frameToSec, cutFrameOf, cutToPitFrame, segmentTable, segmentFrames, lastFrame, lastSec, lineStartFrame, lineCuesBySegment, toSec } from './编排/时间线.ts';
export { faceShaft } from './编排/站位.ts';
export { leaderPoolJump, type Person, huangPanState, liuXinzhongState } from './编排/二人.ts';
export { type GuardPose, guardPoseAt, guardLowerSec, guardPoolJump, 卫兵位置 } from './编排/卫兵.ts';
export { type Cam, camPose } from './编排/机位.ts';
export { groundZ as 地面z } from '../6-3-下坠/编排.ts';
