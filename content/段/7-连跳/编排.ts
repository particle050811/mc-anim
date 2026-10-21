// 7-1-6 连跳：本段机位。动作全在 ../7-1/戏.ts（见 ../7-1/时间线.ts）。用户 10-19 删了「羊毛……？！」和照羊毛那一镜，本段只留刘心忠落到 C2（7-1-5 末帧之后跳过一截，硬切）。
// 戏：刘心忠从 C1 一跳落到北墙根 C2（北墙根插着黄叛的火把箭）；监守者追到 C1 时他已经在半空。
// 一个机位：C2 东边贴地，刘心忠从镜头边上飞过、落到 C2。
import { G4 } from '../../../world/地点/古城4x.tsx';
import * as timeline from '../../../world/地点/古城4x/7-1/时间线.ts';
import { camPoses, type ShotCam } from '../../../world/地点/古城4x/7-1/机位.ts';
export const 号 = '7-1-6' as const;
export const FPS = timeline.FPS;
export const END = timeline.frameCountOf(号);
export const t于 = (f: number) => timeline.tAt(号, f);
const shots: ShotCam[] = [
  {
    start: 0,
    // 离地 1.7 格：再低，C2 跟前那个感测体 (−875, −51, 219) 挡住刘心忠的脚（工具/机位核对 --试）
    pos: [[0, G4(-870.6, -49.3, 217.6)], [END - 1, G4(-871.0, -49.3, 217.7)]],
    // 慢慢往左（南）带，刘心忠落 C2 时不贴画面左边
    tgt: [[0, G4(-877.0, -50.4, 217.0)], [END - 1, G4(-877.0, -50.2, 218.6)]],
    lens: [[0, 18], [END - 1, 19]],
  },
];
export const { 镜号, camera } = camPoses(shots);
