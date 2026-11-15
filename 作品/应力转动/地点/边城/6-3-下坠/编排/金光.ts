// 李樱身上、锤头上的金光，和光尾沿路取点用的髋位置。
import type { V3 } from '@engine/model/parts.tsx';
import { tick, impactTime, liYingFall } from '../时间线.ts';
import { liYingShaft, digHipZ, LY_LEAP_HIP } from './李樱.ts';
import { smoothstep01, lerp } from '@engine/core/数学.ts';

// ---------- 金光 ----------
// 下落锤击时李樱身上、锤头上发出炽热的金光（用户 10-02）：跃出时亮起（0.45），拖着光尾；开抡以后 1 秒里升到 1（用户 10-19：开抡就亮起来），一直亮到砸地；
// 砸地那下炸开（锤击金光.tsx 的 `GoldGlowBurst`），钻地时照亮井壁，打穿洞顶后渐暗，落地后熄掉（落地那下另炸一次小一号的，画面.tsx）
export const goldGlow = (physSec: number) => {
  const imp = impactTime();
  if (physSec < tick.leap) return 0;
  if (physSec <= imp) return lerp(0.45 * smoothstep01((physSec - tick.leap) / 0.6), 1, smoothstep01((physSec - tick.swingBackStart) / 1.0));
  const shaft = liYingShaft();
  if (physSec <= imp + shaft.breachDelay) return lerp(1, 0.7, (physSec - imp) / shaft.breachDelay);
  return 0.7 * (1 - smoothstep01((physSec - (imp + shaft.breachDelay)) / (shaft.landSec - imp - shaft.breachDelay + 0.5)));
};
// 李樱的髋在 w 时刻的位置（光尾用：沿着走过的路取点）
export const liYingHip = (physSec: number): V3 => {
  const imp = impactTime();
  if (physSec < tick.leap) return LY_LEAP_HIP;
  if (!(physSec > imp)) return liYingFall(physSec).p;
  const shaft = liYingShaft();
  return [shaft.hipXY[0], shaft.hipXY[1], digHipZ(physSec)];
};
