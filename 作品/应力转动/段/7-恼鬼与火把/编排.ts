// 7-1-2 恼鬼与火把：本段机位。动作全在 ../7-1/戏.ts（见 ../7-1/时间线.ts），本段第 0 帧接 7-1-1 末帧的下一帧。
// 戏：监守者扑向刘心忠，二人蹬地分开：刘心忠半空里举杖召出恼鬼、落上东南土丘顶，恼鬼马上冲向监守者；黄叛半空里射第一支火把箭、落上黄台再射。
// 镜 1 北墙内侧高处大全景（二人分开、监守者扑空）；镜 2 黄叛南边跟他半空放箭，后面是监守者和冲过来的恼鬼；镜 3 黄叛身后越肩，落台再射、恼鬼扑到监守者跟前。
import type { V3 } from '@engine/model/parts.tsx';
import { G4 } from '../../地点/古城4x.tsx';
import * as play from '../../地点/古城4x/7-1/戏.ts';
import * as timeline from '../../地点/古城4x/7-1/时间线.ts';
import { camPoses, frameAt, type ShotCam } from '../../地点/古城4x/7-1/机位.ts';
import { lerpV } from '@engine/core/数学.ts';

export const segmentId = '7-1-2' as const;
export const FPS = timeline.FPS;
export const END = timeline.frameCountOf(segmentId);
export const timeAt = (f: number) => timeline.tAt(segmentId, f);
export const shot1EndFrame = frameAt(segmentId, 3.6);
export const shot2EndFrame = frameAt(segmentId, 4.5);
const huangAndWarden = (k: number) => (frame: number): V3 => {
  const t = timeAt(frame);
  const huang = play.huangPanPos(t);
  return lerpV([huang[0], huang[1], huang[2] + 1.3], play.wardenChest(t), k);
};
const shots: ShotCam[] = [
  {
    start: 0,
    pos: [[0, G4(-851.5, -41.5, 215.2)], [shot1EndFrame, G4(-851.8, -41.7, 215.3)]],
    tgt: [[0, G4(-864.5, -48.0, 226.5)], [shot1EndFrame, G4(-864.0, -47.5, 227.6)]],
    lens: [[0, 18], [shot1EndFrame, 18]],
  },
  { start: shot1EndFrame, pos: [[shot1EndFrame, [-147.0, 9.2, 7.0]], [shot2EndFrame, [-147.6, 9.6, 7.2]]], tgt: huangAndWarden(0.35), lens: [[shot1EndFrame, 18], [shot2EndFrame, 18]] },
  {
    start: shot2EndFrame,
    pos: [[shot2EndFrame, G4(-865.6, -39.6, 228.4)], [END - 1, G4(-865.9, -39.7, 228.2)]],
    tgt: [[shot2EndFrame, G4(-871.8, -46.0, 220.2)], [END - 1, G4(-871.8, -46.2, 220.2)]],
    lens: [[shot2EndFrame, 18], [END - 1, 18]],
  },
];
export const { shotIndex, camera } = camPoses(shots);
