// 6-1-2 半空拔刀斩击杀娜迦：全部时间轴与姿态，纯函数，输入剧情帧号 f（从 1 起；视频帧换剧情帧用 `story`(Remotion 帧 + 1)）。注释里的帧号都是剧情帧。
// 场景坐标 Z 朝上，1 = 1 米；场景是娜迦庭院（模型/场景/娜迦庭院.tsx），中心在原点。24 帧/秒，参考视频和成片一帧对一帧。
// 速度（用户 09-30 定，显出李樱的强）：九胡跑 10 米/秒，李樱 40，拔刀迅冲斩 120（每帧 0.42 / 1.67 / 5 格）。
// 跑位（用户 10-01 定）：
// - 二人从 6-1-1 的返回传送门跃出，落在门东约 4 格，落地起跑；人不能站在传送门方块上（会被传回）。传送门在 模型/场景/娜迦庭院.tsx 里整块往东搬了 33 格（用户 10-08 嫌跑太长）。
// - 助跑道：庭院正西沿东西中轴的直道，笔直冲中心，只砍了挡路的树；选西边因为另三面有湖或树冠不合适。起跳点在水沟前 5 格。
// - 起跳蹿到树梢上方 36 格滞空（树冠顶 32～33 格；低了深色衣服叠深色树叶，审片找不到人）。
// - 迅冲斩：从滞空点贴树冠顶（3 格以上）往东飞，过西墙斜着俯冲，越过树篱和水池，横向约 86 格（用户要够长），18 帧，横穿娜迦脖子，滑停在中心空地东边。路径不穿方块。
// - 九胡（用户 10-01 定、10-02 改）：被甩开；S3 她被瞬移进庭院（车万女仆跟随传送），站在迷宫里水池南边东西向通道西头，愣一下顺通道往东直奔李樱；6-1-3 接着跑完同一路线（`JH_MAZE_PTS`）。
// - 娜迦在中心（刷怪点在原点）像贪吃蛇爬：从南边树篱豁口进来，往北爬过冲刺线，被横斩脖子。
// 入口：实现拆在 编排/ 下（时间轴、折线、李樱、九胡、娜迦、镜头），这里只转出。
export { FPS, S2, S2C, S2B, S3, END, warp, story, FRAMES, segFrame, GO } from './编排/时间轴.ts';
export {
  sheathFrames, lineStoryFrame, lineStartFrame, DASH_Y, TAKEOFF, DASH1, CUT_X, lyPhase, heading, liyingLoc, liyingKeys, liying,
  bladeTrailFrames, ghosts, dust,
} from './编排/李樱.ts';
export type { LiyingChannel, LiyingTweak } from './编排/李樱.ts';
export { JH_GO, jhDist, JH_STRIDE, jiuhu, JH_MAZE_PTS, MAZE_T612, MAZE_ARRIVE, MAZE_SHOUT, mazeDist, mazeAt, jiuhuMaze } from './编排/九胡.ts';
export { CUT_FRAME, DIS, nagaHurt, naga, neckSlash, chestAppearFrame, chest } from './编排/娜迦.ts';
export { mazeCam, camera } from './编排/镜头.ts';
