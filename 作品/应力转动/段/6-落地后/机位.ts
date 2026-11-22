// 6-落地后 的机位和航线：落地后.tsx 的画面和加载计划（地形视图.ts）读同一份。纯模块，不碰 React。
// 一镜到底画面按 G0 + t 秒往下画，机位换成 6-1-9b 编排的；给了机位（核对用的静帧）就不往后看
import type { Cam } from '../../场/6-暮色森林/一镜到底/镜头.ts';
import * as choreo from '../../场/6-暮色森林/6-1-9b/编排.ts';

export const afterLandingShot = (t: number, camOverride?: Cam) => ({
  g: choreo.toOnerSec(t),
  cam: camOverride ?? choreo.camPose(t),
  ahead: camOverride ? undefined : { sec: t, at: choreo.camPose },
});
