// 7-3-2 上塔：本段机位。戏全在 ../7-3/戏.ts（见 ../7-3/时间线.ts），从 7-3-1 第二炮出手切过来。
//   镜 1 墙外（北边）高处往南看：第二炮炸在刚冒上墙头、站定蓄音爆的它身上，马再一跃上塔，它站着跟着马转。
//   镜 2 它身后（西边）高处往东看：马落上塔顶，刘心忠回身甩第三炮，它边蓄边沿墙头冲向塔脚，切（7-3-3 从塔顶那头接着看它冲过来）。
import * as timeline from '../../../地点/古城4x/7-3/时间线.ts';
import { camPoses, addOffset, type ShotCam } from '../../../地点/古城4x/7-1/机位.ts';
import * as play from '../../../地点/古城4x/7-3/戏.ts';
import { G4 } from '../../../地点/古城4x.tsx';
import { lerpV } from '../../../地点/古城4x/7-1/戏/公用.ts';
export const 号 = '7-3-2' as const;
export const FPS = timeline.FPS;
export const END = timeline.frameCountOf(号);
export const T于 = (f: number) => timeline.tAt(号, f);
const frameAt = (T: number) => Math.round((T - timeline.segmentStartT(号)) * FPS);
export const 镜2起 = frameAt(timeline.leap2LandT - 0.3);
const horseChest = (f: number) => addOffset(play.horseState(T于(f)).p, [0, 0, 2.2]);
const shots: ShotCam[] = [
  {
    start: 0,
    pos: [[0, G4(-853.0, -38.5, 196.0)], [镜2起 - 1, G4(-850.0, -38.5, 196.0)]],
    tgt: (f) => lerpV(horseChest(f), play.wardenChest(T于(f)), 0.45),
    lens: [[0, 15]],
  },
  {
    start: 镜2起,
    pos: [[镜2起, G4(-873.0, -40.0, 207.5)]],
    tgt: (f) => lerpV(horseChest(f), play.wardenChest(T于(f)), 0.6),
    lens: [[镜2起, 22]],
  },
];
export const { 镜号, camera } = camPoses(shots);
