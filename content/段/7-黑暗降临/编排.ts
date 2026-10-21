// 7-1-1 黑暗：本段机位。动作全在 ../7-1/戏.ts（整场一条时间轴，见 ../7-1/时间线.ts），场帧 0 是 6-4-9 末帧，本段第 0 帧是它的下一帧（段界不共用帧，同 7-3）。
// 戏：监守者接着 6-4-9 吼完（二人顶着吼声压低、吼完起来），0.5 秒后放第一次黑暗，雾压到十几格，二人一缩、左右张望，刘心忠「这是怎么回事？」，监守者扭头、起扑。
// 机位：章首硬切（用户 10-19 定：不接 6-4-9 的全景接着推，一个镜头不拆进两个文件）。监守者背后、比它肩高一点越肩看二人：
//   前景左边是它的肩和头，二人正脸在右半边，起扑也在画里；下一段 7-1-2 开场是北墙大全景，景别拉开。
import type { V3 } from '../../../engine/model/parts.tsx';
import * as timeline from '../../../world/地点/古城4x/7-1/时间线.ts';
import * as play from '../../../world/地点/古城4x/7-1/戏.ts';
import { camPoses, type ShotCam } from '../../../world/地点/古城4x/7-1/机位.ts';
export const 号 = '7-1-1' as const;
export const FPS = timeline.FPS;
export const END = timeline.frameCountOf(号);
export const t于 = (f: number) => timeline.tAt(号, f);
const t0 = timeline.segmentStartT(号);
const warden = play.wardenChest(t0);
const liu = play.liuXinzhongPos(t0);
const huang = play.huangPanPos(t0);
const mid: V3 = [(liu[0] + huang[0]) / 2, (liu[1] + huang[1]) / 2, (liu[2] + huang[2]) / 2 + 1.4];
const dx = mid[0] - warden[0], dy = mid[1] - warden[1];
const n = Math.hypot(dx, dy);
const [ux, uy] = [dx / n, dy / n];
// 它身后 4 米、往旁边让开 2.4 米，比胸口高 1.2 米，35mm 把二人拉近；全段慢慢往前推 0.4 米
const camAt = (back: number): V3 => [warden[0] - ux * back + uy * 2.4, warden[1] - uy * back - ux * 2.4, warden[2] + 1.2];
const shots: ShotCam[] = [
  { start: 0, pos: [[0, camAt(4.0)], [END - 1, camAt(3.6)]], tgt: [[0, mid], [END - 1, mid]], lens: [[0, 35], [END - 1, 35]] },
];
export const { 镜号, camera } = camPoses(shots);
