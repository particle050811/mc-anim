// 7-3-1 墙头：本段机位。戏全在 ../7-3/戏.ts（整场一条时间轴，见 ../7-3/时间线.ts），本段第 0 帧 = 7-1-7 末帧的下一帧（契约 古城4x布局.ts 的 衔接.七三首）。
//   镜 1 场子里、中央台和北墙之间往西看：墙头的马拨头朝东一跃，墙脚下的它跟着冲；刘心忠在半空回身甩第一炮，炸在它身上。
//   镜 2 墙外（北边）高处跟着马往东：马落在墙头东段，身后它顺台阶冒上墙头，刘心忠回身甩第二炮，切。
import * as timeline from '../../../地点/古城4x/7-3/时间线.ts';
import { camPoses, addOffset, type ShotCam } from '../../../地点/古城4x/7-1/机位.ts';
import * as play from '../../../地点/古城4x/7-3/戏.ts';
import { G4 } from '../../../地点/古城4x.tsx';
import { lerpV } from '../../../地点/古城4x/7-1/戏/公用.ts';
export const 号 = '7-3-1' as const;
export const FPS = timeline.FPS;
export const END = timeline.frameCountOf(号);
export const T于 = (f: number) => timeline.tAt(号, f);
const frameAt = (T: number) => Math.round((T - timeline.segmentStartT(号)) * FPS);
export const 镜2起 = frameAt(play.mortars[0].中T + 0.12); // 炸开看清了再切
const horseChest = (f: number) => addOffset(play.horseState(T于(f)).p, [0, 0, 2.2]);
const landX = G4(-853.5, -45, 212)[0];
const shots: ShotCam[] = [
  {
    start: 0,
    pos: [[0, G4(-868.0, -46.5, 220.5)]],
    tgt: (f) => lerpV(horseChest(f), play.wardenChest(T于(f)), 0.45),
    lens: [[0, 15]],
  },
  {
    // 跟到马落地那一点就停住，让它从镜头左边追上来
    start: 镜2起,
    pos: (f) => {
      const p = G4(-853.5, -40.5, 203.5);
      return [Math.min(play.horseState(T于(f)).p[0], landX) - 6.0, p[1], p[2]];
    },
    tgt: (f) => lerpV(horseChest(f), play.wardenChest(T于(f)), 0.3),
    lens: [[镜2起, 15]],
  },
];
export const { 镜号, camera } = camPoses(shots);
